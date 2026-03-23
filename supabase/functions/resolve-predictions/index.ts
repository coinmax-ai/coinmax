import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Resolve AI Predictions — Cron Edge Function
 *
 * Runs periodically (e.g. every 5 minutes) to:
 * 1. Find expired pending predictions
 * 2. Fetch actual price for each asset
 * 3. Calculate accuracy (direction correct, price error %)
 * 4. Update prediction records
 * 5. Refresh model accuracy aggregates
 *
 * Schedule: pg_cron or external cron hitting this endpoint
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CG_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  DOGE: "dogecoin", XRP: "ripple", ADA: "cardano", AVAX: "avalanche-2",
  LINK: "chainlink", DOT: "polkadot",
};

async function fetchCurrentPrice(asset: string): Promise<number> {
  const pair = `${asset}USDT`;
  // Try Binance endpoints
  for (const base of ["https://api.binance.com", "https://api1.binance.com", "https://api2.binance.com"]) {
    try {
      const r = await fetch(`${base}/api/v3/ticker/price?symbol=${pair}`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) { const d = await r.json(); const p = parseFloat(d.price); if (p > 0) return p; }
    } catch {}
  }
  // Try Bybit
  try {
    const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${pair}`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) { const d = await r.json(); const p = parseFloat(d.result?.list?.[0]?.lastPrice); if (p > 0) return p; }
  } catch {}
  // Fallback: CoinGecko
  try {
    const cgId = CG_IDS[asset];
    if (cgId) {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json(); if (d[cgId]?.usd > 0) return d[cgId].usd; }
    }
  } catch {}
  return 0;
}

// Batch fetch prices for all assets at once (more efficient)
async function fetchAllPrices(assets: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  // Try Binance batch
  try {
    const symbols = assets.map(a => `"${a}USDT"`).join(",");
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbols}]`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      for (const d of data) { const a = d.symbol.replace("USDT", ""); const p = parseFloat(d.price); if (p > 0) prices[a] = p; }
      if (Object.keys(prices).length >= assets.length * 0.5) return prices;
    }
  } catch {}
  // Fallback: CoinGecko batch
  try {
    const ids = assets.map(a => CG_IDS[a]).filter(Boolean).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      for (const a of assets) { const cg = CG_IDS[a]; if (cg && data[cg]?.usd > 0) prices[a] = data[cg].usd; }
    }
  } catch {}
  return prices;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Find expired pending predictions
  const { data: pending, error: fetchErr } = await supabase
    .from("ai_prediction_records")
    .select("id, asset, timeframe, model, prediction, target_price, current_price")
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString())
    .limit(100);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ resolved: 0, message: "No expired predictions" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Fetch current prices for unique assets (batch)
  const uniqueAssets = [...new Set(pending.map((p) => p.asset))];
  const priceMap = await fetchAllPrices(uniqueAssets);
  // Fill missing with individual fetches
  for (const asset of uniqueAssets) {
    if (!priceMap[asset] || priceMap[asset] <= 0) {
      priceMap[asset] = await fetchCurrentPrice(asset);
    }
  }

  // 3. Resolve each prediction
  let resolvedCount = 0;
  const modelsToRefresh = new Set<string>();

  for (const pred of pending) {
    const actualPrice = priceMap[pred.asset];
    if (actualPrice <= 0) continue; // Skip if price fetch failed

    const changePct = ((actualPrice - pred.current_price) / pred.current_price) * 100;
    const actualDirection = changePct >= 0 ? "BULLISH" : "BEARISH";
    const directionCorrect =
      pred.prediction === "NEUTRAL"
        ? Math.abs(changePct) < 0.5 // NEUTRAL is correct if change < 0.5%
        : pred.prediction === actualDirection;
    const priceErrorPct = pred.target_price > 0
      ? ((Math.abs(actualPrice - pred.target_price) / pred.target_price) * 100)
      : null;

    const { error: updateErr } = await supabase
      .from("ai_prediction_records")
      .update({
        actual_price: actualPrice,
        actual_direction: actualDirection,
        actual_change_pct: parseFloat(changePct.toFixed(4)),
        direction_correct: directionCorrect,
        price_error_pct: priceErrorPct !== null ? parseFloat(priceErrorPct.toFixed(4)) : null,
        resolved_at: new Date().toISOString(),
        status: "resolved",
      })
      .eq("id", pred.id);

    if (!updateErr) {
      resolvedCount++;
      modelsToRefresh.add(`${pred.model}|${pred.asset}|${pred.timeframe}`);
    }
  }

  // 4. Refresh accuracy aggregates for affected models
  for (const key of modelsToRefresh) {
    const [model, asset, timeframe] = key.split("|");
    await supabase.rpc("refresh_model_accuracy", {
      p_model: model,
      p_asset: asset,
      p_timeframe: timeframe,
    });
  }

  return new Response(
    JSON.stringify({
      resolved: resolvedCount,
      total_pending: pending.length,
      assets_checked: uniqueAssets,
      models_refreshed: modelsToRefresh.size,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
