/**
 * Admin Fund Flow — Real-time fund tracking across all contracts and wallets
 */

import { useQuery } from "@tanstack/react-query";
import { readContract, getContract } from "thirdweb";
import { bsc } from "thirdweb/chains";
import { useThirdwebClient } from "@/hooks/use-thirdweb";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MA_TOKEN_ADDRESS, CUSD_ADDRESS, VAULT_V3_ADDRESS, ENGINE_ADDRESS,
  RELEASE_ADDRESS, GATEWAY_ADDRESS, SPLITTER_ADDRESS, PRICE_ORACLE_ADDRESS,
  USDT_ADDRESS, USDC_ADDRESS, FORWARDER_ADDRESS, TIMELOCK_ADDRESS,
} from "@/lib/contracts";
import {
  DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, Wallet, ExternalLink,
  TrendingUp, Shield, Coins, Lock, Zap, BarChart3
} from "lucide-react";
import { useState } from "react";
import { useAdminAuth } from "@/admin/admin-auth";

// ─── Addresses ──────────────────────────────────────────────

const CONTRACTS = [
  { addr: GATEWAY_ADDRESS, label: "Gateway", icon: "🚪", desc: "用户入口 (USDT→USDC swap)" },
  { addr: VAULT_V3_ADDRESS, label: "Vault", icon: "🏦", desc: "金库 (cUSD 记账 + MA 锁仓)" },
  { addr: SPLITTER_ADDRESS, label: "Splitter", icon: "📦", desc: "USDC 分配器 (5钱包)" },
  { addr: ENGINE_ADDRESS, label: "Engine", icon: "⚙️", desc: "利息引擎 (每日 MA 铸造)" },
  { addr: RELEASE_ADDRESS, label: "Release", icon: "🔓", desc: "MA 释放 (分成+销毁)" },
  { addr: PRICE_ORACLE_ADDRESS, label: "Oracle", icon: "📊", desc: "MA 价格预言机" },
];

const WALLETS = [
  { addr: "0xd12097C9A12617c49220c032C84aCc99B6fFf57b", label: "Trading", pct: 30, color: "text-blue-400" },
  { addr: "0xDf90770C89732a7eba5B727fCd6a12f827102EE6", label: "Ops", pct: 8, color: "text-purple-400" },
  { addr: "0x1C4D983620B3c8c2f7607c0943f2A5989e655599", label: "Marketing", pct: 12, color: "text-pink-400" },
  { addr: "0x85c3d07Ee3be12d6502353b4cA52B30cD85Ac5ff", label: "Investor", pct: 20, color: "text-amber-400" },
  { addr: "0x7DEa369864583E792D230D360C0a4C56c2103FE4", label: "Withdraw", pct: 30, color: "text-green-400" },
];

const SERVER_WALLETS = [
  { addr: "0xeBAB6D22278c9839A46B86775b3AC9469710F84b", label: "vault (金库ADMIN)" },
  { addr: "0x0831e8875685C796D05F2302D3c5C2Dd77fAc3B6", label: "trade (运营SERVER)" },
  { addr: "0x927eDe64b4B8a7C08Cf4225924Fa9c6759943E0A", label: "VIP (价格FEEDER)" },
  { addr: "0x60D416dA873508c23C1315a2b750a31201959d78", label: "CoinMax (代币ADMIN)" },
  { addr: "0xcb41F3C3eD6C255F57Cda1bA3fd42389B0f0F0aA", label: "relayer (Gas)" },
];

function fmt(addr: string) { return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }
function bscUrl(addr: string) { return `https://bscscan.com/address/${addr}`; }
function fmtUsd(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(2)}`; }

export default function AdminFunds() {
  const { adminRole } = useAdminAuth();
  const { client } = useThirdwebClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-funds", refreshKey],
    queryFn: async () => {
      if (!client) return null;

      const readBal = async (token: string, holder: string) => {
        try {
          const c = getContract({ client, chain: bsc, address: token });
          const r = await readContract({ contract: c, method: "function balanceOf(address) view returns (uint256)", params: [holder] });
          return Number(r) / 1e18;
        } catch { return 0; }
      };

      const readUint = async (addr: string, sig: string) => {
        try {
          const c = getContract({ client, chain: bsc, address: addr });
          return Number(await readContract({ contract: c, method: `function ${sig} view returns (uint256)` as any, params: [] as any }));
        } catch { return 0; }
      };

      // Contract balances
      const contractBals = await Promise.all(
        CONTRACTS.map(async (c) => ({
          ...c,
          usdt: await readBal(USDT_ADDRESS, c.addr),
          usdc: await readBal(USDC_ADDRESS, c.addr),
          ma: await readBal(MA_TOKEN_ADDRESS, c.addr),
          cusd: await readBal(CUSD_ADDRESS, c.addr),
        }))
      );

      // Wallet USDC balances
      const walletBals = await Promise.all(
        WALLETS.map(async (w) => ({
          ...w,
          usdc: await readBal(USDC_ADDRESS, w.addr),
          usdt: await readBal(USDT_ADDRESS, w.addr),
        }))
      );

      // Server wallet BNB
      const serverBals = await Promise.all(
        SERVER_WALLETS.map(async (w) => {
          try {
            const c = getContract({ client, chain: bsc, address: w.addr });
            // Can't easily read BNB balance via thirdweb readContract, use 0 placeholder
            return { ...w, bnb: 0 };
          } catch { return { ...w, bnb: 0 }; }
        })
      );

      // Key metrics
      const maSupply = readUint(MA_TOKEN_ADDRESS, "totalSupply()") ;
      const cusdSupply = readUint(CUSD_ADDRESS, "totalSupply()");
      const oraclePrice = readUint(PRICE_ORACLE_ADDRESS, "price()");
      const vaultStaked = readUint(VAULT_V3_ADDRESS, "totalMAStaked()");
      const vaultDeposited = readUint(VAULT_V3_ADDRESS, "totalCUsdDeposited()");
      const splitterFlushed = readUint(SPLITTER_ADDRESS, "totalFlushed()");

      const [ms, cs, op, vs, vd, sf] = await Promise.all([maSupply, cusdSupply, oraclePrice, vaultStaked, vaultDeposited, splitterFlushed]);

      return {
        contracts: contractBals,
        wallets: walletBals,
        servers: serverBals,
        metrics: {
          maSupply: ms / 1e18,
          cusdSupply: cs / 1e18,
          oraclePrice: op / 1e6,
          vaultStaked: vs / 1e18,
          vaultDeposited: vd / 1e18,
          splitterFlushed: sf / 1e18,
        },
      };
    },
    enabled: !!client && adminRole === "superadmin",
    refetchInterval: 30000,
  });

  const m = data?.metrics;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          资金详情
        </h1>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-foreground/40 hover:text-foreground/60 hover:bg-white/5"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* Key Metrics */}
      {m && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          <MetricCard icon={<Coins className="h-3.5 w-3.5" />} label="MA 总供应" value={`${m.maSupply.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
          <MetricCard icon={<DollarSign className="h-3.5 w-3.5" />} label="cUSD 供应" value={`${m.cusdSupply.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
          <MetricCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="MA 价格" value={`$${m.oraclePrice.toFixed(4)}`} color="text-green-400" />
          <MetricCard icon={<Lock className="h-3.5 w-3.5" />} label="MA 锁仓" value={`${m.vaultStaked.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
          <MetricCard icon={<Zap className="h-3.5 w-3.5" />} label="金库入金" value={fmtUsd(m.vaultDeposited)} />
          <MetricCard icon={<ArrowUpRight className="h-3.5 w-3.5" />} label="已分配" value={fmtUsd(m.splitterFlushed)} />
        </div>
      )}

      {/* Contract Balances */}
      <div className="rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3 text-[12px] font-bold text-foreground/50" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          合约余额
        </div>
        <div className="divide-y divide-white/[0.03]">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 mx-4 my-2" />)
          ) : (
            data?.contracts.map((c) => (
              <div key={c.addr} className="px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base">{c.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-foreground/70">{c.label}</span>
                      <a href={bscUrl(c.addr)} target="_blank" rel="noopener" className="text-[8px] text-primary/40 hover:text-primary font-mono flex items-center gap-0.5">
                        {fmt(c.addr)} <ExternalLink className="h-2 w-2" />
                      </a>
                    </div>
                    <div className="text-[9px] text-foreground/20">{c.desc}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono shrink-0">
                  {c.usdc > 0 && <span className="text-foreground/50">{fmtUsd(c.usdc)} USDC</span>}
                  {c.usdt > 0 && <span className="text-foreground/40">{fmtUsd(c.usdt)} USDT</span>}
                  {c.ma > 0 && <span className="text-primary/60">{c.ma.toFixed(0)} MA</span>}
                  {c.cusd > 0 && <span className="text-blue-400/60">{c.cusd.toFixed(0)} cUSD</span>}
                  {c.usdc === 0 && c.usdt === 0 && c.ma === 0 && c.cusd === 0 && <span className="text-foreground/15">空</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Distribution Wallets */}
      <div className="rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3 text-[12px] font-bold text-foreground/50" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          分配钱包 (Splitter → 5 wallets)
        </div>
        <div className="divide-y divide-white/[0.03]">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 mx-4 my-2" />)
          ) : (
            data?.wallets.map((w) => (
              <div key={w.addr} className="px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className={`text-[11px] font-bold ${w.color}`}>{w.label}</div>
                  <Badge className="text-[8px] bg-white/5 text-foreground/30 border-0">{w.pct}%</Badge>
                  <a href={bscUrl(w.addr)} target="_blank" rel="noopener" className="text-[8px] text-primary/30 hover:text-primary font-mono">
                    {fmt(w.addr)}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-foreground/50">{fmtUsd(w.usdc)} USDC</span>
                  {w.usdt > 0 && <span className="text-foreground/30">{fmtUsd(w.usdt)} USDT</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Server Wallets */}
      <div className="rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3 text-[12px] font-bold text-foreground/50" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          Server Wallets (thirdweb)
        </div>
        <div className="divide-y divide-white/[0.03]">
          {SERVER_WALLETS.map((w) => (
            <div key={w.addr} className="px-4 py-2 flex items-center justify-between hover:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Wallet className="h-3 w-3 text-foreground/20" />
                <span className="text-[10px] text-foreground/50">{w.label}</span>
              </div>
              <a href={bscUrl(w.addr)} target="_blank" rel="noopener" className="text-[9px] text-primary/30 hover:text-primary font-mono">
                {fmt(w.addr)}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center gap-1 text-foreground/25 mb-0.5">{icon}<span className="text-[9px]">{label}</span></div>
      <div className={`text-[12px] font-bold font-mono ${color || "text-foreground/60"}`}>{value}</div>
    </div>
  );
}
