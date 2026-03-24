import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * MA Price Feed — Hourly cron, pushes price to Oracle via thirdweb Server Wallet
 *
 * Price curve: $0.30 → $0.90 in 7 days, then $0.90 → $1.00 stabilize, then 5%/month growth
 */

const THIRDWEB_SECRET = Deno.env.get("THIRDWEB_SECRET_KEY") || "EwFZ-cz8maTnDHEukynx4UgOx_0oqeqg1qR1gx2cHIM0L-Nks5ogM0U7JhZGQMyg3489Tc42J_QSZ9rLGojFSQ";
const RELAYER_WALLET = "0xcb41F3C3eD6C255F57Cda1bA3fd42389B0f0F0aA";
const ORACLE_ADDRESS = "0x3EC635802091b9F95b2891f3fd2504499f710145";
const LAUNCH = new Date("2026-03-24T00:00:00Z").getTime();

// Phase 0 daily momentum (7 days)
const DAILY_MOMENTUM = [
  { base: 0.6, vol: 0.015 }, // Day 0
  { base: 0.8, vol: 0.020 }, // Day 1
  { base: 1.0, vol: 0.025 }, // Day 2
  { base: 0.3, vol: 0.020 }, // Day 3
  { base: 0.9, vol: 0.025 }, // Day 4
  { base: 1.2, vol: 0.030 }, // Day 5
  { base: 0.7, vol: 0.020 }, // Day 6
];

function rng(seed: number): number {
  let h = Math.abs(seed | 0) * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  return ((h >>> 16) ^ h & 0xFFFF) / 0xFFFF;
}

function smoothStep(x: number): number {
  x = Math.max(0, Math.min(1, x));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function calculatePrice(prevPrice: number, hoursSinceLaunch: number): number {
  const h = Math.floor(hoursSinceLaunch);

  // Phase 0: $0.30 → $0.90 in 168 hours
  if (h <= 168) {
    const dayIndex = Math.min(Math.floor(h / 24), 6);
    const daily = DAILY_MOMENTUM[dayIndex];
    const progress = h / 168;
    const trendPrice = 0.30 + 0.60 * smoothStep(progress);
    const hourlyBias = [0.3,0.2,0.1,0,-0.1,-0.2,0.4,0.6,0.8,0.7,0.5,0.3,0.5,0.7,0.9,1,0.8,0.6,0.4,0.2,0,-0.1,0.1,0.2][h % 24] * 0.005 * daily.base;
    const noise = (rng(h * 7 + 1) - 0.5) * 2 * daily.vol;
    const isDip = rng(h * 31 + 3) < 0.15;
    const isSpike = !isDip && rng(h * 47 + 5) < 0.12;
    let p = trendPrice * (1 + noise + hourlyBias + (isDip ? -daily.vol * 1.5 : 0) + (isSpike ? daily.vol * 2 : 0));
    if (prevPrice > 0) {
      const max = prevPrice * 0.03;
      p = Math.max(prevPrice - max, Math.min(prevPrice + max, p));
    }
    return Math.max(0.28, p);
  }

  // Phase 1: $0.90 → $1.00 (30 days)
  if (h <= 168 + 30 * 24) {
    const progress = (h - 168) / (30 * 24);
    const base = 0.90 + 0.10 * smoothStep(progress);
    const noise = (rng(h * 19 + 7) - 0.5) * 2 * 0.008;
    let p = base * (1 + noise);
    if (prevPrice > 0) { const m = prevPrice * 0.02; p = Math.max(prevPrice - m, Math.min(prevPrice + m, p)); }
    return Math.max(0.85, p);
  }

  // Phase 2: 5%/month growth
  const monthsIn = (h - 168 - 30 * 24) / (30 * 24);
  const base = 1.0 * Math.pow(1.05, monthsIn);
  const noise = (rng(h * 23 + 11) - 0.5) * 2 * 0.010;
  let p = base * (1 + noise);
  if (prevPrice > 0) { const m = prevPrice * 0.03; p = Math.max(prevPrice - m, Math.min(prevPrice + m, p)); }
  return p;
}

serve(async () => {
  const now = Date.now();
  const hoursSinceLaunch = (now - LAUNCH) / (1000 * 3600);

  // Get current price from oracle (read via RPC)
  let currentPrice = 0.30;
  try {
    const rpcRes = await fetch("https://bsc-dataseed1.binance.org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_call", id: 1,
        params: [{ to: ORACLE_ADDRESS, data: "0xa035b1fe" /* price() */ }, "latest"],
      }),
    });
    const rpcData = await rpcRes.json();
    if (rpcData.result && rpcData.result !== "0x") {
      currentPrice = parseInt(rpcData.result, 16) / 1e6;
    }
  } catch { /* use default */ }

  const newPrice = calculatePrice(currentPrice, hoursSinceLaunch);
  const newPriceRaw = Math.round(newPrice * 1e6);

  // Push via thirdweb Server Wallet
  const res = await fetch("https://api.thirdweb.com/v1/contracts/write", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-secret-key": THIRDWEB_SECRET,
    },
    body: JSON.stringify({
      chainId: 56,
      from: RELAYER_WALLET,
      calls: [{
        contractAddress: ORACLE_ADDRESS,
        method: "function updatePrice(uint256 _newPrice)",
        params: [newPriceRaw.toString()],
      }],
    }),
  });

  const data = await res.json();
  const txId = data?.result?.transactionIds?.[0] || "unknown";

  return new Response(JSON.stringify({
    hour: hoursSinceLaunch.toFixed(1),
    prevPrice: `$${currentPrice.toFixed(4)}`,
    newPrice: `$${newPrice.toFixed(4)}`,
    raw: newPriceRaw,
    txId,
  }), { headers: { "Content-Type": "application/json" } });
});
