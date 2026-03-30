import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Batch Bridge — BSC USDT → ARB via thirdweb Bridge
 *
 * Cron: every 4 hours
 * Flow:
 *   1. Check BatchBridgeV2 USDT balance on BSC
 *   2. If >= $50, get thirdweb Bridge quote
 *   3. Execute bridge: BSC USDT → ARB (thirdweb handles routing)
 *   4. Record in bridge_cycles table
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THIRDWEB_SECRET = Deno.env.get("THIRDWEB_SECRET_KEY") || "";
const THIRDWEB_CLIENT_ID = Deno.env.get("THIRDWEB_CLIENT_ID") || "a0612a159cd5aeecde69cda291faff38";

const BATCH_BRIDGE = "0x360fff6d0AF9860706A56595FACe18a6c5e34965";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const ARB_FUND_ROUTER = "0x71237E535d5E00CDf18A609eA003525baEae3489";
const MIN_BRIDGE_AMOUNT = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Check BatchBridge USDT balance
    const balRes = await fetch("https://bsc-dataseed1.binance.org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_call", id: 1,
        params: [{
          to: BSC_USDT,
          data: "0x70a08231000000000000000000000000" + BATCH_BRIDGE.slice(2).toLowerCase(),
        }, "latest"],
      }),
    });
    const balData = await balRes.json();
    const balance = parseInt(balData.result || "0x0", 16) / 1e18;

    if (balance < MIN_BRIDGE_AMOUNT) {
      return json({
        status: "skipped",
        reason: `$${balance.toFixed(2)} < minimum $${MIN_BRIDGE_AMOUNT}`,
        balance,
      });
    }

    // 2. Get thirdweb Bridge quote
    const amountWei = BigInt(Math.floor(balance * 1e18)).toString();
    const quoteUrl = `https://bridge.thirdweb.com/v1/quote?` +
      `fromChainId=56` +
      `&fromTokenAddress=${BSC_USDT}` +
      `&toChainId=42161` +
      `&toTokenAddress=0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` + // ARB USDT
      `&fromAmount=${amountWei}` +
      `&fromAddress=${BATCH_BRIDGE}` +
      `&toAddress=${ARB_FUND_ROUTER}`;

    const quoteRes = await fetch(quoteUrl, {
      headers: {
        "x-client-id": THIRDWEB_CLIENT_ID,
        ...(THIRDWEB_SECRET ? { "x-secret-key": THIRDWEB_SECRET } : {}),
      },
    });
    const quote = await quoteRes.json();

    // 3. Record in DB
    await supabase.from("bridge_cycles").insert({
      cycle_type: "BATCH_BRIDGE_V2",
      status: "QUOTED",
      amount_usd: balance,
      initiated_by: "cron",
      details: {
        bridgeContract: BATCH_BRIDGE,
        fromChain: "BSC",
        toChain: "ARB",
        fromToken: "USDT",
        toAddress: ARB_FUND_ROUTER,
        quote: quote,
        quoteUrl,
      },
    });

    return json({
      status: "quoted",
      balance,
      quote: {
        estimatedOutput: quote?.intent?.buyAmount || quote?.estimate?.toAmount,
        route: quote?.intent?.bridge || "thirdweb",
        steps: quote?.steps?.length || 0,
      },
      note: "thirdweb Bridge quote ready. Execute from admin panel with wallet signature.",
    });

  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
