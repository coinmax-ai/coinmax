import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Vault Bridge + Flush — Complete automated fund flow
 *
 * Vault deposit → USDT lands in Server Wallet (0x85e4)
 *   → thirdweb Bridge: BSC USDT → ARB USDT
 *   → Server Wallet calls flushAll() on ARB FundRouter
 *   → 5 wallets receive USDC (30/8/12/20/30)
 *
 * Triggered: after each vault deposit (frontend fire-and-forget)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVER_WALLET    = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";
const BSC_USDT         = "0x55d398326f99059fF775485246999027B3197955";
const ARB_USDT         = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const ARB_USDC         = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const ARB_FUND_ROUTER  = "0x71237E535d5E00CDf18A609eA003525baEae3489";
const MIN_BRIDGE       = 50; // $50 minimum

const THIRDWEB_SECRET  = Deno.env.get("THIRDWEB_SECRET_KEY") || "";
const VAULT_TOKEN      = Deno.env.get("THIRDWEB_VAULT_ACCESS_TOKEN") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── 1. Check Server Wallet USDT balance on BSC ──
    const balance = await erc20Balance("https://bsc-dataseed1.binance.org", BSC_USDT, SERVER_WALLET, 18);

    if (balance < MIN_BRIDGE) {
      return json({ status: "skipped", balance, reason: `$${balance.toFixed(2)} < min $${MIN_BRIDGE}` });
    }

    // ── 2. Get thirdweb Bridge quote: BSC USDT → ARB USDT ──
    const amountWei = BigInt(Math.floor(balance * 1e18)).toString();
    const quoteRes = await fetch(
      `https://api.thirdweb.com/v1/bridge/quote?` +
      `originChainId=56&originTokenAddress=${BSC_USDT}` +
      `&destinationChainId=42161&destinationTokenAddress=${ARB_USDT}` +
      `&amount=${amountWei}&sender=${SERVER_WALLET}&receiver=${ARB_FUND_ROUTER}`,
      { headers: { "x-secret-key": THIRDWEB_SECRET } },
    );

    if (!quoteRes.ok) {
      const err = await quoteRes.text();
      await logCycle(supabase, "QUOTE_FAILED", balance, null, null, { error: err });
      return json({ status: "QUOTE_FAILED", balance, error: err }, 500);
    }

    const quote = await quoteRes.json();
    const bridgeFee = Number(quote?.estimate?.feeCosts?.[0]?.amount || 0) / 1e18;

    // ── 3. Execute bridge steps (approve + send) via Server Wallet ──
    let bridgeTxId: string | null = null;

    if (quote?.steps) {
      for (const step of quote.steps) {
        for (const tx of (step.transactions || [])) {
          if (tx.to && tx.data) {
            const execRes = await fetch("https://api.thirdweb.com/v1/contracts/write", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-secret-key": THIRDWEB_SECRET,
                "x-vault-access-token": VAULT_TOKEN,
              },
              body: JSON.stringify({
                chainId: tx.chainId || 56,
                from: SERVER_WALLET,
                calls: [{
                  contractAddress: tx.to,
                  method: "",
                  params: [],
                  rawCalldata: tx.data,
                  value: tx.value || "0",
                }],
              }),
            });
            const execData = await execRes.json();
            bridgeTxId = execData?.result?.transactionIds?.[0] || bridgeTxId;
          }
        }
      }
    }

    if (!bridgeTxId) {
      await logCycle(supabase, "BRIDGE_FAILED", balance, null, null, { quote });
      return json({ status: "BRIDGE_FAILED", balance }, 500);
    }

    // ── 4. Wait for bridge to arrive on ARB (~60-90s) ──
    await sleep(90_000);

    // ── 5. Check ARB FundRouter balance + flushAll ──
    const arbBal = await erc20Balance("https://arb1.arbitrum.io/rpc", ARB_USDC, ARB_FUND_ROUTER, 6);
    let flushTxId: string | null = null;
    let status = "BRIDGED";

    if (arbBal > 1) {
      // flushAll via Server Wallet (needs OPERATOR_ROLE)
      const flushRes = await fetch("https://api.thirdweb.com/v1/contracts/write", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-secret-key": THIRDWEB_SECRET,
          "x-vault-access-token": VAULT_TOKEN,
        },
        body: JSON.stringify({
          chainId: 42161,
          from: SERVER_WALLET,
          calls: [{
            contractAddress: ARB_FUND_ROUTER,
            method: "function flushAll()",
            params: [],
          }],
        }),
      });
      const flushData = await flushRes.json();
      flushTxId = flushData?.result?.transactionIds?.[0] || null;
      status = flushTxId ? "FLUSHED" : "FLUSH_FAILED";
    } else {
      // Also check ARB USDT (bridge might deliver USDT not USDC)
      const arbUsdtBal = await erc20Balance("https://arb1.arbitrum.io/rpc", ARB_USDT, ARB_FUND_ROUTER, 6);
      status = (arbUsdtBal > 1 || arbBal > 1) ? "ARRIVED_NO_FLUSH" : "BRIDGE_PENDING";
    }

    await logCycle(supabase, status, balance, bridgeTxId, flushTxId, {
      bridgeFee,
      arbBalance: arbBal,
    });

    return json({ status, balance, bridgeFee, bridgeTxId, flushTxId, arbBalance: arbBal });

  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

// ── Helpers ──

async function erc20Balance(rpc: string, token: string, holder: string, decimals: number): Promise<number> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "eth_call", id: 1,
      params: [{ to: token, data: "0x70a08231000000000000000000000000" + holder.slice(2).toLowerCase() }, "latest"],
    }),
  });
  const data = await res.json();
  return parseInt(data.result || "0x0", 16) / (10 ** decimals);
}

async function logCycle(
  supabase: any, status: string, amount: number,
  bscTx: string | null, arbTx: string | null, meta: Record<string, unknown>,
) {
  await supabase.from("bridge_cycles").insert({
    cycle_type: "AUTO_BRIDGE_FLUSH",
    status,
    amount_usd: amount,
    initiated_by: "auto",
    bsc_tx: bscTx,
    arb_tx: arbTx,
    metadata: { serverWallet: "0x85e4", ...meta },
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
