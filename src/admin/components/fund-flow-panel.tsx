/**
 * Fund Flow Panel — Shows all fund routing, balances, and cross-chain status
 */

import { useQuery } from "@tanstack/react-query";
import { readContract, getContract } from "thirdweb";
import { bsc } from "thirdweb/chains";
import { useThirdwebClient } from "@/hooks/use-thirdweb";
import {
  MA_TOKEN_ADDRESS, CUSD_ADDRESS, VAULT_V3_ADDRESS, ENGINE_ADDRESS,
  RELEASE_ADDRESS, GATEWAY_ADDRESS, SPLITTER_ADDRESS, PRICE_ORACLE_ADDRESS,
  USDT_ADDRESS, USDC_ADDRESS,
} from "@/lib/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ArrowDown, ArrowRight, ExternalLink } from "lucide-react";
import { useState } from "react";

const WALLETS = {
  trading:   { addr: "0xd12097C9A12617c49220c032C84aCc99B6fFf57b", label: "Trading", pct: "30%" },
  ops:       { addr: "0xDf90770C89732a7eba5B727fCd6a12f827102EE6", label: "Ops", pct: "8%" },
  marketing: { addr: "0x1C4D983620B3c8c2f7607c0943f2A5989e655599", label: "Marketing", pct: "12%" },
  investor:  { addr: "0x85c3d07Ee3be12d6502353b4cA52B30cD85Ac5ff", label: "Investor", pct: "20%" },
  withdraw:  { addr: "0x7DEa369864583E792D230D360C0a4C56c2103FE4", label: "Withdraw", pct: "30%" },
};

function bscScan(addr: string) {
  return `https://bscscan.com/address/${addr}`;
}

function fmt(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function FundFlowPanel() {
  const { client } = useThirdwebClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["fund-flow", refreshKey],
    queryFn: async () => {
      if (!client) return null;

      const readBal = async (token: string, holder: string) => {
        try {
          const c = getContract({ client, chain: bsc, address: token });
          const bal = await readContract({ contract: c, method: "function balanceOf(address) view returns (uint256)", params: [holder] });
          return Number(bal) / 1e18;
        } catch { return 0; }
      };

      const readVal = async (addr: string, method: string) => {
        try {
          const c = getContract({ client, chain: bsc, address: addr });
          return await readContract({ contract: c, method: `function ${method} view returns (uint256)`, params: [] });
        } catch { return BigInt(0); }
      };

      // Balances
      const [
        splitterUSDC, vaultCUSD, maSupply, cusdSupply, oraclePrice,
        vaultStaked, splitterFlushed,
        tradingBal, opsBal, marketingBal, investorBal, withdrawBal,
      ] = await Promise.all([
        readBal(USDC_ADDRESS, SPLITTER_ADDRESS),
        readBal(CUSD_ADDRESS, VAULT_V3_ADDRESS),
        readVal(MA_TOKEN_ADDRESS, "totalSupply()"),
        readVal(CUSD_ADDRESS, "totalSupply()"),
        readVal(PRICE_ORACLE_ADDRESS, "price()"),
        readVal(VAULT_V3_ADDRESS, "totalMAStaked()"),
        readVal(SPLITTER_ADDRESS, "totalFlushed()"),
        readBal(USDC_ADDRESS, WALLETS.trading.addr),
        readBal(USDC_ADDRESS, WALLETS.ops.addr),
        readBal(USDC_ADDRESS, WALLETS.marketing.addr),
        readBal(USDC_ADDRESS, WALLETS.investor.addr),
        readBal(USDC_ADDRESS, WALLETS.withdraw.addr),
      ]);

      return {
        splitterUSDC,
        vaultCUSD: Number(vaultCUSD) / 1e18,
        maSupply: Number(maSupply) / 1e18,
        cusdSupply: Number(cusdSupply) / 1e18,
        oraclePrice: Number(oraclePrice) / 1e6,
        vaultStaked: Number(vaultStaked) / 1e18,
        splitterFlushed: Number(splitterFlushed) / 1e18,
        wallets: {
          trading: tradingBal,
          ops: opsBal,
          marketing: marketingBal,
          investor: investorBal,
          withdraw: withdrawBal,
        },
      };
    },
    enabled: !!client,
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-foreground/50 uppercase tracking-wider">资金走向</h2>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="h-6 w-6 rounded flex items-center justify-center text-foreground/30 hover:text-foreground/60 hover:bg-white/5"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Flow Diagram */}
      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-[10px] text-foreground/30 mb-3 font-mono">BSC 资金链路</div>

        {isLoading || !data ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : (
          <div className="space-y-2 text-[11px]">
            {/* User → Gateway */}
            <FlowRow icon="👤" label="用户 USDT" value="" />
            <FlowArrow />
            <FlowRow icon="🚪" label="Gateway (swap)" value="" addr={GATEWAY_ADDRESS} />
            <FlowArrow />
            <FlowRow icon="📦" label="Splitter (USDC)" value={`$${data.splitterUSDC.toFixed(2)} 待分配`} addr={SPLITTER_ADDRESS} />
            <FlowArrow label={`已分配: $${data.splitterFlushed.toFixed(0)}`} />

            {/* 5 Wallets */}
            <div className="grid grid-cols-5 gap-1 pl-4">
              {Object.entries(WALLETS).map(([key, w]) => (
                <div key={key} className="rounded-lg bg-white/[0.03] p-1.5 text-center" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="text-[8px] text-foreground/25">{w.label} {w.pct}</div>
                  <div className="text-[10px] font-mono text-foreground/50">
                    ${data.wallets[key as keyof typeof data.wallets]?.toFixed(0) || "0"}
                  </div>
                  <a href={bscScan(w.addr)} target="_blank" rel="noopener" className="text-[7px] text-primary/40 hover:text-primary">
                    {fmt(w.addr)}
                  </a>
                </div>
              ))}
            </div>

            {/* Vault Side */}
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] text-foreground/30 mb-2 font-mono">金库系统</div>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="MA 供应" value={`${data.maSupply.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <StatBox label="cUSD 供应" value={`${data.cusdSupply.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <StatBox label="MA 价格" value={`$${data.oraclePrice.toFixed(4)}`} color="green" />
                <StatBox label="MA 锁仓" value={`${data.vaultStaked.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Future: ARB Cross-chain */}
      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.06)" }}>
        <div className="text-[10px] text-foreground/20 mb-1 font-mono">ARB 跨链链路 (计划中)</div>
        <div className="text-[9px] text-foreground/15">
          BSC Vault → BatchBridge (每4h) → Stargate → ARB FundRouter → 5钱包
          <br />Trading 30% → HyperLiquid Vault → 交易 → 提出
        </div>
      </div>
    </div>
  );
}

function FlowRow({ icon, label, value, addr }: { icon: string; label: string; value: string; addr?: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-foreground/50 font-medium">{label}</span>
        {addr && (
          <a href={bscScan(addr)} target="_blank" rel="noopener" className="text-[9px] text-primary/40 hover:text-primary font-mono flex items-center gap-0.5">
            {fmt(addr)} <ExternalLink className="h-2 w-2" />
          </a>
        )}
      </div>
      {value && <span className="text-foreground/40 font-mono text-[10px]">{value}</span>}
    </div>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 pl-4 text-foreground/15">
      <ArrowDown className="h-3 w-3" />
      {label && <span className="text-[9px] font-mono">{label}</span>}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] p-2 text-center" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="text-[8px] text-foreground/25">{label}</div>
      <div className={`text-[11px] font-bold font-mono ${color === "green" ? "text-green-400" : "text-foreground/60"}`}>{value}</div>
    </div>
  );
}
