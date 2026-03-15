import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Simulate Trading — Cron Edge Function
 *
 * Runs every 5 minutes to:
 * 1. Fetch real-time prices from Binance
 * 2. Generate simulated AI trade signals with realistic parameters
 * 3. Create paper trades from strong signals
 * 4. Check existing paper trades for SL/TP hits and close them
 * 5. Broadcast signals via Supabase Realtime
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSETS = ["BTC", "ETH", "SOL", "BNB"];
const MODELS = ["gpt-4o", "deepseek-v3", "llama-3.3-70b", "qwen-72b", "gemma-7b"];
const STRATEGY_TYPES = ["directional", "grid", "dca"] as const;

// ── Price fetching ──────────────────────────────────────────

async function fetchPrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  await Promise.all(
    ASSETS.map(async (asset) => {
      const pair = `${asset}USDT`;
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
        if (res.ok) {
          const d = await res.json();
          const p = parseFloat(d.price);
          if (p > 0) prices[asset] = p;
        }
      } catch { /* skip */ }
    })
  );

  return prices;
}

// ── Fetch recent candle data for basic analysis ─────────────

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchCandles(asset: string, limit = 20): Promise<Candle[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${asset}USDT&interval=5m&limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((k: any[]) => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch {
    return [];
  }
}

// ── Simple technical analysis ───────────────────────────────

function calcRSI(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMomentum(candles: Candle[]): number {
  if (candles.length < 5) return 0;
  const recent = candles.slice(-5);
  const changePct = ((recent[4].close - recent[0].close) / recent[0].close) * 100;
  return changePct;
}

function calcVolatility(candles: Candle[]): number {
  if (candles.length < 10) return 1;
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push(Math.abs((candles[i].close - candles[i - 1].close) / candles[i - 1].close));
  }
  return returns.reduce((s, v) => s + v, 0) / returns.length * 100;
}

// ── Signal generation ───────────────────────────────────────

interface GeneratedSignal {
  asset: string;
  action: "OPEN_LONG" | "OPEN_SHORT" | "CLOSE" | "HOLD";
  confidence: number;
  strength: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
  probabilities: [number, number, number];
  leverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  positionSizePct: number;
  strategyType: string;
  sourceModels: string[];
  ragContext: string;
}

function generateSignal(
  asset: string,
  candles: Candle[],
  price: number,
): GeneratedSignal {
  const rsi = calcRSI(candles);
  const momentum = calcMomentum(candles);
  const volatility = calcVolatility(candles);

  // Determine direction based on indicators
  let longScore = 0;
  let shortScore = 0;

  // RSI signals
  if (rsi < 30) longScore += 35;
  else if (rsi < 40) longScore += 20;
  else if (rsi > 70) shortScore += 35;
  else if (rsi > 60) shortScore += 20;

  // Momentum signals
  if (momentum > 0.5) longScore += 25;
  else if (momentum > 0.2) longScore += 15;
  else if (momentum < -0.5) shortScore += 25;
  else if (momentum < -0.2) shortScore += 15;

  // Add some randomness to simulate multi-model disagreement
  const noise = (Math.random() - 0.5) * 20;
  longScore += noise;
  shortScore -= noise;

  // Normalize to probabilities
  const total = Math.max(longScore + shortScore + 30, 1); // 30 = neutral base
  const pLong = Math.max(0, Math.min(1, longScore / total));
  const pShort = Math.max(0, Math.min(1, shortScore / total));
  const pNeutral = Math.max(0, 1 - pLong - pShort);

  // Determine action and confidence
  let action: GeneratedSignal["action"];
  let confidence: number;

  if (pLong > pShort && pLong > 0.4) {
    action = "OPEN_LONG";
    confidence = Math.round(50 + pLong * 40 + Math.random() * 10);
  } else if (pShort > pLong && pShort > 0.4) {
    action = "OPEN_SHORT";
    confidence = Math.round(50 + pShort * 40 + Math.random() * 10);
  } else {
    action = "HOLD";
    confidence = Math.round(30 + pNeutral * 30);
  }

  confidence = Math.min(95, Math.max(40, confidence));

  // Determine strength
  let strength: GeneratedSignal["strength"];
  if (confidence >= 80) strength = "STRONG";
  else if (confidence >= 65) strength = "MEDIUM";
  else if (confidence >= 50) strength = "WEAK";
  else strength = "NONE";

  // Calculate risk params based on volatility
  const baseSlPct = Math.max(0.01, Math.min(0.05, volatility * 0.02));
  const baseTpPct = baseSlPct * (1.5 + Math.random());

  // Select random subset of models as "contributors"
  const numModels = 2 + Math.floor(Math.random() * 3);
  const shuffled = [...MODELS].sort(() => Math.random() - 0.5);
  const selectedModels = shuffled.slice(0, numModels);

  // Strategy type based on market regime
  let strategyType: string;
  if (volatility > 1.5) strategyType = "directional";
  else if (volatility < 0.5) strategyType = "grid";
  else strategyType = STRATEGY_TYPES[Math.floor(Math.random() * 3)];

  const leverage = Math.min(5, Math.max(1, Math.round(confidence / 25)));

  return {
    asset,
    action,
    confidence,
    strength,
    probabilities: [
      parseFloat(pShort.toFixed(3)),
      parseFloat(pNeutral.toFixed(3)),
      parseFloat(pLong.toFixed(3)),
    ],
    leverage,
    stopLossPct: parseFloat(baseSlPct.toFixed(4)),
    takeProfitPct: parseFloat(baseTpPct.toFixed(4)),
    positionSizePct: parseFloat((0.2 + Math.random() * 0.3).toFixed(2)),
    strategyType,
    sourceModels: selectedModels,
    ragContext: `RSI=${rsi.toFixed(1)}, Momentum=${momentum.toFixed(2)}%, Vol=${volatility.toFixed(2)}%`,
  };
}

// ── Main handler ────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = {
    signals_generated: 0,
    paper_trades_opened: 0,
    paper_trades_closed: 0,
    prices: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    // ── Step 1: Fetch prices ──────────────────────────────
    const prices = await fetchPrices();
    results.prices = prices;

    if (Object.keys(prices).length === 0) {
      return new Response(JSON.stringify({ error: "Failed to fetch any prices" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Check open paper trades for SL/TP ─────────
    const { data: openTrades } = await supabase
      .from("paper_trades")
      .select("*")
      .eq("status", "OPEN");

    if (openTrades && openTrades.length > 0) {
      for (const trade of openTrades) {
        const assetBase = trade.asset.split("-")[0];
        const currentPrice = prices[assetBase];
        if (!currentPrice) continue;

        let closeReason: string | null = null;

        if (trade.side === "LONG") {
          if (currentPrice <= trade.stop_loss) closeReason = "STOP_LOSS";
          else if (currentPrice >= trade.take_profit) closeReason = "TAKE_PROFIT";
        } else {
          if (currentPrice >= trade.stop_loss) closeReason = "STOP_LOSS";
          else if (currentPrice <= trade.take_profit) closeReason = "TAKE_PROFIT";
        }

        // Time limit: close after 24h
        const openedMs = new Date(trade.opened_at).getTime();
        if (Date.now() - openedMs > 24 * 60 * 60 * 1000) {
          closeReason = "TIME_LIMIT";
        }

        if (closeReason) {
          const pnlMultiplier = trade.side === "LONG" ? 1 : -1;
          const pnl = trade.size * (currentPrice - trade.entry_price) * pnlMultiplier * trade.leverage;
          const pnlPct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100 * pnlMultiplier;

          await supabase.from("paper_trades").update({
            status: "CLOSED",
            exit_price: currentPrice,
            pnl: parseFloat(pnl.toFixed(4)),
            pnl_pct: parseFloat(pnlPct.toFixed(4)),
            close_reason: closeReason,
            closed_at: new Date().toISOString(),
          }).eq("id", trade.id);

          // Update the corresponding signal
          if (trade.signal_id) {
            await supabase.from("trade_signals").update({
              status: "executed",
              result_pnl: parseFloat(pnl.toFixed(4)),
              close_reason: closeReason,
              resolved_at: new Date().toISOString(),
            }).eq("id", trade.signal_id);
          }

          results.paper_trades_closed++;
        }
      }
    }

    // ── Step 3: Generate signals ──────────────────────────
    // Pick 1-2 random assets to analyze this round
    const assetsToAnalyze = [...ASSETS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 1 + Math.floor(Math.random() * 2));

    // Check how many open positions we have
    const openCount = openTrades?.filter(t => t.status === "OPEN").length ?? 0;
    const maxConcurrent = 3;

    for (const asset of assetsToAnalyze) {
      if (!prices[asset]) continue;

      const candles = await fetchCandles(asset);
      if (candles.length < 10) continue;

      const signal = generateSignal(asset, candles, prices[asset]);

      // Build signal record
      const signalId = crypto.randomUUID();
      const direction =
        signal.action === "OPEN_LONG" ? "LONG" :
        signal.action === "OPEN_SHORT" ? "SHORT" : "NEUTRAL";

      // Insert signal into database
      const { error: sigErr } = await supabase.from("trade_signals").insert({
        id: signalId,
        asset: signal.asset,
        action: signal.action,
        direction,
        probabilities: signal.probabilities,
        confidence: signal.confidence,
        stop_loss_pct: signal.stopLossPct,
        take_profit_pct: signal.takeProfitPct,
        leverage: signal.leverage,
        position_size_pct: signal.positionSizePct,
        strategy_type: signal.strategyType,
        strength: signal.strength,
        source_models: signal.sourceModels,
        rag_context: signal.ragContext,
        status: "active",
        created_at: new Date().toISOString(),
      });

      if (sigErr) {
        results.errors.push(`Signal insert error for ${asset}: ${sigErr.message}`);
        continue;
      }

      results.signals_generated++;

      // Broadcast to realtime
      await supabase.channel("trade-signals").send({
        type: "broadcast",
        event: "new_signal",
        payload: {
          id: signalId,
          asset: signal.asset,
          action: signal.action,
          confidence: signal.confidence,
          strength: signal.strength,
          strategy_type: signal.strategyType,
          leverage: signal.leverage,
          stop_loss_pct: signal.stopLossPct,
          take_profit_pct: signal.takeProfitPct,
          position_size_pct: signal.positionSizePct,
          source_models: signal.sourceModels,
          status: "active",
          created_at: new Date().toISOString(),
        },
      }).catch(() => {});

      // ── Step 4: Create paper trade for STRONG/MEDIUM signals ──
      if (
        (signal.strength === "STRONG" || signal.strength === "MEDIUM") &&
        signal.action !== "HOLD" &&
        signal.action !== "CLOSE" &&
        openCount + results.paper_trades_opened < maxConcurrent
      ) {
        const currentPrice = prices[asset];
        const positionSizeUsd = 1000 * signal.positionSizePct;
        const size = positionSizeUsd / currentPrice;

        const stopLoss = signal.action === "OPEN_LONG"
          ? currentPrice * (1 - signal.stopLossPct)
          : currentPrice * (1 + signal.stopLossPct);
        const takeProfit = signal.action === "OPEN_LONG"
          ? currentPrice * (1 + signal.takeProfitPct)
          : currentPrice * (1 - signal.takeProfitPct);

        const { error: tradeErr } = await supabase.from("paper_trades").insert({
          signal_id: signalId,
          asset: signal.asset,
          side: signal.action === "OPEN_LONG" ? "LONG" : "SHORT",
          entry_price: currentPrice,
          size: parseFloat(size.toFixed(8)),
          leverage: signal.leverage,
          stop_loss: parseFloat(stopLoss.toFixed(2)),
          take_profit: parseFloat(takeProfit.toFixed(2)),
          status: "OPEN",
          opened_at: new Date().toISOString(),
        });

        if (tradeErr) {
          results.errors.push(`Paper trade error for ${asset}: ${tradeErr.message}`);
        } else {
          results.paper_trades_opened++;

          // Update signal status to executed
          await supabase.from("trade_signals").update({
            status: "executed",
          }).eq("id", signalId);
        }
      }
    }
  } catch (err) {
    results.errors.push(`Unexpected: ${err.message}`);
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
