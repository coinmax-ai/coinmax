import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, ArrowDownUp, Info, Wallet, Loader2, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { readContract, waitForReceipt } from "thirdweb";
import { transfer, approve } from "thirdweb/extensions/erc20";
import { useQuery } from "@tanstack/react-query";
import { useThirdwebClient } from "@/hooks/use-thirdweb";
import { getMATokenContract, getPriceOracleContract, MA_TOKEN_ADDRESS, MA_DECIMALS, BSC_CHAIN, getUsdtContract } from "@/lib/contracts";
import { createChart, ColorType, LineStyle } from "lightweight-charts";
import { ProfileNav } from "@/components/profile-nav";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";

// ─── MA Price Chart (lightweight-charts) ────────────────────

function MAPriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [timeframe, setTimeframe] = useState<"1H" | "4H" | "1D" | "1W">("1D");

  const generateKlineData = useCallback(() => {
    // Generate simulated K-line data for MA price
    // In production: fetch from oracle price history or backend API
    const now = Math.floor(Date.now() / 1000);
    const data: { time: number; open: number; high: number; low: number; close: number }[] = [];

    const intervals: Record<string, { seconds: number; count: number }> = {
      "1H": { seconds: 3600, count: 168 },     // 7 days of hourly
      "4H": { seconds: 14400, count: 84 },     // 14 days of 4h
      "1D": { seconds: 86400, count: 30 },     // 30 days daily
      "1W": { seconds: 604800, count: 12 },    // 12 weeks
    };

    const { seconds, count } = intervals[timeframe];
    let price = 0.30;

    for (let i = count; i >= 0; i--) {
      const time = now - i * seconds;

      // S-curve growth from $0.30 to $0.90 over first 7 days
      const daysSinceStart = (count - i) * seconds / 86400;
      const progress = Math.min(daysSinceStart / 7, 1);
      const sCurve = progress * progress * (3 - 2 * progress);
      const targetPrice = 0.30 + 0.60 * sCurve;

      // Add volatility
      const rng = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const noise = (rng - Math.floor(rng) - 0.5) * 0.04;
      price = targetPrice * (1 + noise);

      const vol = price * 0.02;
      const open = price + (Math.random() - 0.5) * vol;
      const close = price + (Math.random() - 0.5) * vol;
      const high = Math.max(open, close) + Math.random() * vol;
      const low = Math.min(open, close) - Math.random() * vol;

      data.push({
        time: time as any,
        open: +open.toFixed(4),
        high: +high.toFixed(4),
        low: +low.toFixed(4),
        close: +close.toFixed(4),
      });
    }
    return data;
  }, [timeframe]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.5)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 280,
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: timeframe === "1H" || timeframe === "4H",
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
      },
      crosshair: {
        horzLine: { color: "rgba(0,188,165,0.3)", style: LineStyle.Dashed },
        vertLine: { color: "rgba(0,188,165,0.3)", style: LineStyle.Dashed },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    candleSeries.setData(generateKlineData());
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [timeframe, generateKlineData]);

  const tfs = ["1H", "4H", "1D", "1W"] as const;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3 px-1">
        {tfs.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
              timeframe === tf
                ? "bg-primary/20 text-primary"
                : "text-white/30 hover:text-white/50 hover:bg-white/5"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div ref={chartContainerRef} className="rounded-xl overflow-hidden" />
    </div>
  );
}

// ─── MA Swap Component ──────────────────────────────────────

function MASwap() {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const { client } = useThirdwebClient();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const [maAmount, setMaAmount] = useState("");
  const [outputToken, setOutputToken] = useState<"USDT" | "USDC">("USDT");
  const [isSwapped, setIsSwapped] = useState(false); // false = MA→USD, true = USD→MA
  const [swapStatus, setSwapStatus] = useState<"idle" | "approving" | "transferring" | "recording" | "success" | "error">("idle");
  const [swapError, setSwapError] = useState("");

  // Read MA balance
  const { data: maBalanceRaw } = useQuery({
    queryKey: ["ma-balance", account?.address],
    queryFn: async () => {
      if (!account?.address || !client) return 0n;
      const contract = getMATokenContract(client);
      return await readContract({
        contract,
        method: "function balanceOf(address) view returns (uint256)",
        params: [account.address],
      });
    },
    enabled: !!account?.address && !!client,
    refetchInterval: 15000,
  });

  // Read MA price from oracle
  const { data: maPriceRaw } = useQuery({
    queryKey: ["ma-oracle-price"],
    queryFn: async () => {
      if (!client) return 300000n;
      const contract = getPriceOracleContract(client);
      try {
        return await readContract({
          contract,
          method: "function getPriceUnsafe() view returns (uint256)",
          params: [],
        });
      } catch {
        return 300000n; // fallback $0.30
      }
    },
    enabled: !!client,
    refetchInterval: 60000,
  });

  const maBalance = Number(maBalanceRaw || 0n) / 1e18;
  const maPrice = Number(maPriceRaw || 300000n) / 1e6;

  // Swap quota: can only swap 50% of holdings
  const swapQuota = maBalance / 2;
  const inputAmount = parseFloat(maAmount) || 0;
  const outputAmount = isSwapped ? inputAmount / maPrice : inputAmount * maPrice;
  const exceedsQuota = !isSwapped && inputAmount > swapQuota;

  const maValueUsd = maBalance * maPrice;
  const fee = inputAmount * maPrice * 0.003;
  const isBusy = swapStatus !== "idle" && swapStatus !== "success" && swapStatus !== "error";

  // Swap history
  const { data: swapHistory } = useQuery({
    queryKey: ["ma-swap-history", account?.address],
    queryFn: async () => {
      if (!account?.address) return [];
      const { data } = await supabase
        .from("ma_swap_records")
        .select("*")
        .eq("wallet_address", account.address)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!account?.address,
  });

  // Execute swap
  const handleSwap = async () => {
    if (!account || !client || inputAmount <= 0 || exceedsQuota) return;

    setSwapError("");
    const receiverAddress = import.meta.env.VITE_VIP_RECEIVER_ADDRESS || "0x93F655C3C6B595600fc735118dcEE10cd63d4C8f";
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      if (!isSwapped) {
        // MA → USDT/USDC: transfer MA to platform wallet
        setSwapStatus("approving");
        const maContract = getMATokenContract(client);

        // Transfer MA
        setSwapStatus("transferring");
        const tx = transfer({
          contract: maContract,
          to: receiverAddress,
          amount: inputAmount,
        });
        const result = await sendTransaction(tx);
        const receipt = await waitForReceipt({
          client,
          chain: BSC_CHAIN,
          transactionHash: result.transactionHash,
        });

        if (receipt.status === "reverted") throw new Error("Transaction reverted");

        // Record via edge function
        setSwapStatus("recording");
        const resp = await fetch(`${supabaseUrl}/functions/v1/ma-swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: account.address,
            txHash: receipt.transactionHash,
            direction: "sell",
            maAmount: inputAmount,
            outputToken,
            maPrice,
            maBalance,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Swap failed");

      } else {
        // USDT → MA: transfer USDT to platform wallet
        setSwapStatus("approving");
        const usdtContract = getUsdtContract(client);

        setSwapStatus("transferring");
        const tx = transfer({
          contract: usdtContract,
          to: receiverAddress,
          amount: inputAmount,
        });
        const result = await sendTransaction(tx);
        const receipt = await waitForReceipt({
          client,
          chain: BSC_CHAIN,
          transactionHash: result.transactionHash,
        });

        if (receipt.status === "reverted") throw new Error("Transaction reverted");

        setSwapStatus("recording");
        const resp = await fetch(`${supabaseUrl}/functions/v1/ma-swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: account.address,
            txHash: receipt.transactionHash,
            direction: "buy",
            maAmount: inputAmount,
            outputToken,
            maPrice,
            maBalance,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Swap failed");
      }

      setSwapStatus("success");
      setMaAmount("");
      queryClient.invalidateQueries({ queryKey: ["ma-balance"] });
      queryClient.invalidateQueries({ queryKey: ["ma-swap-history"] });
      setTimeout(() => setSwapStatus("idle"), 3000);
    } catch (err: any) {
      setSwapError(err.message || "Swap failed");
      setSwapStatus("error");
      setTimeout(() => setSwapStatus("idle"), 5000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Balance + Quota Card */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "linear-gradient(135deg, rgba(0,188,165,0.08) 0%, rgba(0,100,80,0.08) 100%)", border: "1px solid rgba(0,188,165,0.15)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-[13px] text-white/60">MA {t("profile.balance") || "余额"}</span>
          </div>
          <span className="text-[13px] text-white/40">
            ≈ ${maValueUsd.toFixed(2)}
          </span>
        </div>
        <div className="text-[28px] font-bold font-mono tracking-tight text-white">
          {maBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} <span className="text-[16px] text-primary">MA</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 bg-white/5 rounded-lg px-3 py-2">
            <div className="text-[11px] text-white/40 mb-0.5">{t("profile.swapQuota") || "闪兑额度"}</div>
            <div className="text-[15px] font-semibold font-mono text-primary">
              {swapQuota.toLocaleString("en-US", { maximumFractionDigits: 2 })} MA
            </div>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg px-3 py-2">
            <div className="text-[11px] text-white/40 mb-0.5">MA {t("profile.price") || "价格"}</div>
            <div className="text-[15px] font-semibold font-mono text-green-400">
              ${maPrice.toFixed(4)}
            </div>
          </div>
        </div>
      </div>

      {/* Swap UI */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Input */}
        <div className="mb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-white/40">{isSwapped ? t("profile.youPay") || "支付" : t("profile.youSell") || "卖出"}</span>
            {!isSwapped && (
              <button
                onClick={() => setMaAmount(swapQuota.toFixed(2))}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors"
              >
                MAX {swapQuota.toFixed(0)}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
            <input
              type="number"
              value={maAmount}
              onChange={(e) => setMaAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-[20px] font-mono font-semibold text-white outline-none placeholder:text-white/15"
            />
            <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isSwapped ? "bg-yellow-500/20 text-yellow-400" : "bg-primary/20 text-primary"}`}>
                {isSwapped ? "$" : "M"}
              </div>
              <span className="text-[13px] font-medium">{isSwapped ? outputToken : "MA"}</span>
            </div>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={() => {
              setIsSwapped(!isSwapped);
              setMaAmount("");
            }}
            className="w-9 h-9 rounded-full bg-card border border-white/10 flex items-center justify-center hover:border-primary/40 hover:bg-primary/5 transition-all"
          >
            <ArrowDownUp className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Output */}
        <div className="mt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-white/40">{isSwapped ? t("profile.youGet") || "获得" : t("profile.youGet") || "获得"}</span>
          </div>
          <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
            <div className="flex-1 text-[20px] font-mono font-semibold text-white/80">
              {inputAmount > 0 ? outputAmount.toFixed(isSwapped ? 2 : 4) : "0.00"}
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isSwapped ? "bg-primary/20 text-primary" : "bg-yellow-500/20 text-yellow-400"}`}>
                {isSwapped ? "M" : "$"}
              </div>
              {!isSwapped ? (
                <select
                  value={outputToken}
                  onChange={(e) => setOutputToken(e.target.value as "USDT" | "USDC")}
                  className="text-[13px] font-medium bg-transparent outline-none cursor-pointer"
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
              ) : (
                <span className="text-[13px] font-medium">MA</span>
              )}
            </div>
          </div>
        </div>

        {/* Price Info */}
        <div className="mt-3 px-1 space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-white/30">{t("profile.rate") || "汇率"}</span>
            <span className="text-white/50 font-mono">1 MA = ${maPrice.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-white/30">{t("profile.fee") || "手续费"}</span>
            <span className="text-white/50 font-mono">0.3%</span>
          </div>
        </div>

        {/* Quota Warning */}
        {exceedsQuota && (
          <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <Info className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <span className="text-[12px] text-red-300">
              {t("profile.exceedsQuota") || `超出闪兑额度。您需保留至少 ${swapQuota.toFixed(0)} MA（总持仓的50%）`}
            </span>
          </div>
        )}

        {/* Fee Info */}
        {inputAmount > 0 && !exceedsQuota && (
          <div className="flex justify-between text-[11px] mt-2 px-1">
            <span className="text-white/30">手续费 (0.3%)</span>
            <span className="text-white/50 font-mono">${fee.toFixed(4)}</span>
          </div>
        )}

        {/* Status Message */}
        {swapStatus === "success" && (
          <div className="flex items-center gap-2 mt-3 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-[12px] text-green-400">闪兑成功</span>
          </div>
        )}
        {swapStatus === "error" && swapError && (
          <div className="flex items-start gap-2 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <Info className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <span className="text-[12px] text-red-300">{swapError}</span>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!account || inputAmount <= 0 || exceedsQuota || isBusy}
          className={`w-full mt-4 py-3.5 rounded-xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 ${
            !account || isBusy
              ? "bg-white/5 text-white/20 cursor-not-allowed"
              : exceedsQuota || inputAmount <= 0
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : "bg-primary text-black hover:bg-primary/90 active:scale-[0.98]"
          }`}
        >
          {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
          {!account
            ? t("profile.connectWallet") || "连接钱包"
            : swapStatus === "approving"
            ? "授权中..."
            : swapStatus === "transferring"
            ? "转账中..."
            : swapStatus === "recording"
            ? "记录中..."
            : exceedsQuota
            ? t("profile.exceedsQuotaShort") || "超出额度"
            : inputAmount <= 0
            ? t("profile.enterAmount") || "输入数量"
            : isSwapped
            ? `${t("profile.buy") || "买入"} MA`
            : `${t("profile.flashSwap") || "闪兑"} ${outputToken}`}
        </button>
      </div>

      {/* Swap History */}
      {swapHistory && swapHistory.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <h3 className="text-[13px] font-bold text-white/50 mb-3">闪兑记录</h3>
          <div className="space-y-2">
            {swapHistory.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    s.direction === "sell" ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
                  }`}>
                    {s.direction === "sell" ? "卖出" : "买入"}
                  </span>
                  <span className="text-[12px] text-white/60 font-mono">{Number(s.ma_amount).toFixed(2)} MA</span>
                </div>
                <div className="text-right">
                  <span className="text-[12px] text-white/50 font-mono">${Number(s.usd_amount).toFixed(2)}</span>
                  <p className="text-[9px] text-white/20">{new Date(s.created_at).toLocaleDateString("zh-CN")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function ProfileMAPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen pb-24 lg:pb-8 lg:pt-4" style={{ background: "#0a0a0a" }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-center relative mb-4 lg:justify-start">
          <button
            onClick={() => navigate("/profile")}
            className="absolute left-0 w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors lg:hidden"
          >
            <ArrowLeft className="h-5 w-5 text-white/80" />
          </button>
          <h1 className="text-[17px] font-bold tracking-wide">MA Token</h1>
        </div>
      </div>

      <div className="flex lg:gap-4">
        {/* Desktop Nav */}
        <ProfileNav />

        {/* Main Content */}
        <div className="flex-1 min-w-0 px-4 lg:px-0 lg:pr-4 space-y-4">
          {/* Price Header */}
          <MAPriceHeader />

          {/* K-Line Chart */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <MAPriceChart />
          </div>

          {/* Swap Section */}
          <MASwap />
        </div>
      </div>
    </div>
  );
}

// ─── Price Header ───────────────────────────────────────────

function MAPriceHeader() {
  const client = useThirdwebClient();

  const { data: priceRaw } = useQuery({
    queryKey: ["ma-oracle-price-header"],
    queryFn: async () => {
      if (!client) return 300000n;
      try {
        const contract = getPriceOracleContract(client);
        return await readContract({
          contract,
          method: "function getPriceUnsafe() view returns (uint256)",
          params: [],
        });
      } catch {
        return 300000n;
      }
    },
    enabled: !!client,
    refetchInterval: 30000,
  });

  const price = Number(priceRaw || 300000n) / 1e6;
  const change24h = 5.2; // TODO: calculate from price history

  return (
    <div className="flex items-end gap-3 px-1">
      <div>
        <div className="text-[12px] text-white/40 mb-0.5">MA / USD</div>
        <div className="text-[32px] font-bold font-mono tracking-tight leading-none text-white">
          ${price.toFixed(4)}
        </div>
      </div>
      <div className={`text-[14px] font-semibold font-mono mb-1 ${change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
        {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
      </div>
    </div>
  );
}
