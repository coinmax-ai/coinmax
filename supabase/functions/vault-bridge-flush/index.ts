import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Vault Bridge + Flush — Automated fund flow
 *
 * Strategy: Server Wallet transfers USDT → BatchBridgeV2 (deployer-owned)
 *           Then deployer calls swapAndBridge via Hardhat cron.
 *           OR: just accumulate and admin triggers bridge manually.
 *
 * This function:
 *   1. Check Server Wallet USDT balance
 *   2. Transfer USDT from Server Wallet → BatchBridgeV2 (accumulate for bridge)
 *   3. Record in DB
 *
 * Bridge (swapAndBridge) is triggered separately by deployer/admin.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVER_WALLET   = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";
const BATCH_BRIDGE    = "0x96dBfe3aAa877A4f9fB41d592f1D990368a4B2C1";
const BSC_USDT        = "0x55d398326f99059fF775485246999027B3197955";
const MIN_TRANSFER    = 50; // $50 minimum

const THIRDWEB_SECRET = Deno.env.get("THIRDWEB_SECRET_KEY") || "";
const VAULT_TOKEN     = Deno.env.get("THIRDWEB_VAULT_ACCESS_TOKEN") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Check Server Wallet USDT balance
    const balance = await erc20Balance(BSC_USDT, SERVER_WALLET);
    if (balance < MIN_TRANSFER) {
      return json({ status: "skipped", balance, reason: `$${balance.toFixed(2)} < min $${MIN_TRANSFER}` });
    }

    // 2. Transfer USDT: Server Wallet → BatchBridgeV2 (via thirdweb)
    const amountWei = BigInt(Math.floor(balance * 1e18)).toString();
    const txRes = await fetch("https://api.thirdweb.com/v1/contracts/write", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret-key": THIRDWEB_SECRET,
        "x-vault-access-token": VAULT_TOKEN,
      },
      body: JSON.stringify({
        chainId: 56,
        from: SERVER_WALLET,
        calls: [{
          contractAddress: BSC_USDT,
          method: "function transfer(address to, uint256 amount) returns (bool)",
          params: [BATCH_BRIDGE, amountWei],
        }],
      }),
    });

    const txData = await txRes.json();
    const txId = txData?.result?.transactionIds?.[0];

    if (!txId) {
      await supabase.from("bridge_cycles").insert({
        cycle_type: "SW_TO_BRIDGE",
        status: "TRANSFER_FAILED",
        amount_usd: balance,
        initiated_by: "auto",
        metadata: { error: txData?.error, serverWallet: SERVER_WALLET },
      });
      return json({ status: "TRANSFER_FAILED", balance, error: txData?.error }, 500);
    }

    // 3. Record
    await supabase.from("bridge_cycles").insert({
      cycle_type: "SW_TO_BRIDGE",
      status: "TRANSFERRED",
      amount_usd: balance,
      initiated_by: "auto",
      bsc_tx: txId,
      metadata: {
        from: SERVER_WALLET,
        to: BATCH_BRIDGE,
        amount: balance,
      },
    });

    return json({
      status: "TRANSFERRED",
      balance,
      txId,
      message: `$${balance.toFixed(0)} USDT → BatchBridge. Run swapAndBridge to cross-chain.`,
    });

  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

async function erc20Balance(token: string, holder: string): Promise<number> {
  const res = await fetch("https://bsc-dataseed1.binance.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "eth_call", id: 1,
      params: [{ to: token, data: "0x70a08231000000000000000000000000" + holder.slice(2).toLowerCase() }, "latest"],
    }),
  });
  const data = await res.json();
  return parseInt(data.result || "0x0", 16) / 1e18;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
