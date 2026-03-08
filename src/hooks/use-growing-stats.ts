import { useState, useEffect, useRef } from "react";

// Base date: 2026-03-08, base TVL: $2,963,000 (296.3万)
// Grows ~$800-1500/day, holders +0~1/day, positions +0~1/day
const BASE_DATE = new Date("2026-03-08T00:00:00Z").getTime();
const BASE_TVL = 2_963_000;
const BASE_HOLDERS = 100;
const BASE_POSITIONS = 130;

function getDaysSinceBase() {
  return Math.max(0, (Date.now() - BASE_DATE) / (1000 * 60 * 60 * 24));
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function calcStats() {
  const days = getDaysSinceBase();
  const fullDays = Math.floor(days);

  // TVL grows $800-1500 per day deterministically
  let tvl = BASE_TVL;
  for (let i = 0; i < fullDays; i++) {
    tvl += 800 + seededRandom(i + 1) * 700;
  }
  // Partial day growth
  const partialDay = days - fullDays;
  const todayGrowth = 800 + seededRandom(fullDays + 1) * 700;
  tvl += todayGrowth * partialDay;

  // Holders: +0 or +1 per day (60% chance of +1)
  let holders = BASE_HOLDERS;
  for (let i = 0; i < fullDays; i++) {
    holders += seededRandom(i + 1000) > 0.4 ? 1 : 0;
  }

  // Positions: +0 or +1 per day (55% chance of +1)
  let positions = BASE_POSITIONS;
  for (let i = 0; i < fullDays; i++) {
    positions += seededRandom(i + 2000) > 0.45 ? 1 : 0;
  }

  return { tvl, holders, positions };
}

function formatTvl(tvl: number) {
  if (tvl >= 1_000_000) {
    return `$${(tvl / 1_000_000).toFixed(2)}M`;
  }
  if (tvl >= 1_000) {
    return `$${(tvl / 1_000).toFixed(1)}K`;
  }
  return `$${tvl.toFixed(2)}`;
}

export function useGrowingStats() {
  const [stats, setStats] = useState(calcStats);
  const ref = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Recalculate every 30 seconds for smooth daily growth
    const tick = () => {
      setStats(calcStats());
      ref.current = setTimeout(tick, 30_000);
    };
    ref.current = setTimeout(tick, 30_000);
    return () => clearTimeout(ref.current);
  }, []);

  return {
    tvl: stats.tvl,
    tvlFormatted: formatTvl(stats.tvl),
    holders: stats.holders,
    positions: stats.positions,
  };
}
