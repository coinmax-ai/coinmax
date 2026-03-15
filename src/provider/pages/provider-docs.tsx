import { FileText, Copy, Check, Radio, Zap, Shield, BarChart3, TrendingUp, Brain, Layers, ArrowRight } from "lucide-react";
import { useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jqgimdgtpwnunrlwexib.supabase.co";

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-xl overflow-hidden mb-3" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
        <span className="text-[10px] text-foreground/25 font-mono">{lang || ""}</span>
        <button onClick={handleCopy} className="text-[10px] text-foreground/30 hover:text-foreground/60 flex items-center gap-1">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono text-foreground/60 overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function InfoCard({ icon: Icon, title, children, accent }: { icon: any; title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${accent || "text-primary/70"}`} />
        <h2 className="text-sm font-bold text-foreground/70">{title}</h2>
      </div>
      {children}
    </div>
  );
}

const TABS = [
  { id: "overview", label: "平台概览" },
  { id: "strategy", label: "策略体系" },
  { id: "integration", label: "接入方式" },
  { id: "api", label: "API 文档" },
  { id: "examples", label: "代码示例" },
  { id: "faq", label: "常见问题" },
];

export default function ProviderDocs() {
  const endpoint = `${SUPABASE_URL}/functions/v1/signal-webhook`;
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2.5">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">CoinMax 策略对接文档</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/[0.06] p-1.5 bg-white/[0.01]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === tab.id
                ? "bg-primary/15 text-primary"
                : "text-foreground/35 hover:text-foreground/60 hover:bg-white/[0.03]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: 平台概览 */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <InfoCard icon={Radio} title="什么是 CoinMax">
            <p className="text-xs text-foreground/45 leading-relaxed mb-4">
              CoinMax 是一个 <span className="text-primary font-semibold">AI 驱动的加密货币跟单交易平台</span>。
              我们通过多模型 AI 共识系统生成高质量交易信号，用户可以一键订阅策略并自动执行交易。
            </p>
            <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(10,186,181,0.04)", border: "1px solid rgba(10,186,181,0.1)" }}>
              <p className="text-xs font-bold text-primary/80 mb-2">核心数据管线</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {["市场数据", "技术分析", "AI 多模型预测", "加权共识", "信号过滤", "策略选择", "执行"].map((step, i) => (
                  <span key={step} className="flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary font-semibold">{step}</span>
                    {i < 6 && <ArrowRight className="h-3 w-3 text-foreground/15" />}
                  </span>
                ))}
              </div>
            </div>
          </InfoCard>

          <InfoCard icon={Brain} title="AI 多模型共识系统">
            <p className="text-xs text-foreground/40 mb-3">
              CoinMax 同时运行多个 AI 模型进行独立预测，通过加权投票产生最终信号。
              您的策略可以作为<span className="text-primary font-semibold">额外的预测源</span>加入共识，
              或作为<span className="text-primary font-semibold">独立策略</span>直接发布信号。
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { name: "GPT-4o", desc: "OpenAI 主模型" },
                { name: "DeepSeek", desc: "推理增强" },
                { name: "Llama 3.1 70B", desc: "开源大模型" },
                { name: "Gemini", desc: "Google AI" },
                { name: "Grok", desc: "xAI 实时模型" },
                { name: "您的策略", desc: "接入即可", highlight: true },
              ].map((m) => (
                <div
                  key={m.name}
                  className={`rounded-lg px-3 py-2 ${m.highlight ? "border-primary/30 bg-primary/8" : "bg-white/[0.02]"}`}
                  style={{ border: `1px solid ${m.highlight ? "rgba(10,186,181,0.3)" : "rgba(255,255,255,0.04)"}` }}
                >
                  <p className={`text-xs font-bold ${m.highlight ? "text-primary" : "text-foreground/60"}`}>{m.name}</p>
                  <p className="text-[10px] text-foreground/25">{m.desc}</p>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={Shield} title="风控体系">
            <div className="space-y-2 text-xs text-foreground/40">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                <p><span className="text-foreground/60 font-semibold">信号级:</span> 信心 {'<'} 50% 或 {'<'} 3 个模型一致 → 不交易</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                <p><span className="text-foreground/60 font-semibold">执行级:</span> 最大仓位限制 / 日亏损上限 / 同资产冷却期 60s</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                <p><span className="text-foreground/60 font-semibold">全局级:</span> 最大回撤 10% → Kill Switch 关闭所有仓位</p>
              </div>
            </div>
          </InfoCard>

          <InfoCard icon={Layers} title="支持的交易所">
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { name: "Binance", type: "CEX" },
                { name: "Bybit", type: "CEX" },
                { name: "OKX", type: "CEX" },
                { name: "Bitget", type: "CEX" },
                { name: "HyperLiquid", type: "DEX" },
                { name: "dYdX", type: "DEX" },
              ].map((ex) => (
                <div key={ex.name} className="rounded-lg px-3 py-2 text-center bg-white/[0.02]" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  <p className="text-xs font-bold text-foreground/60">{ex.name}</p>
                  <p className="text-[9px] text-foreground/20">{ex.type}</p>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={BarChart3} title="支持的资产">
            <div className="flex flex-wrap gap-2">
              {["BTC", "ETH", "SOL", "BNB", "DOGE", "XRP"].map((asset) => (
                <span key={asset} className="px-3 py-1.5 rounded-lg bg-primary/8 text-primary text-xs font-bold border border-primary/15">
                  {asset}
                </span>
              ))}
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.03] text-foreground/25 text-xs font-semibold border border-white/[0.06]">
                更多资产可按需开放
              </span>
            </div>
          </InfoCard>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: 策略体系 */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "strategy" && (
        <div className="space-y-4">
          <InfoCard icon={TrendingUp} title="四种交易策略">
            <p className="text-xs text-foreground/35 mb-4">
              CoinMax 根据实时市场状态自动选择最优策略类型。您的信号可以指定策略类型，也可以让系统自动匹配。
            </p>

            {/* Directional */}
            <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-green-400">1. Directional（趋势跟踪）</h3>
                <span className="text-[10px] text-green-400/60 font-semibold px-2 py-0.5 rounded bg-green-500/8">推荐</span>
              </div>
              <p className="text-xs text-foreground/35 mb-2">适用: 强趋势 + 中高波动</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><p className="text-[10px] text-foreground/25">STRONG</p><p className="text-xs font-bold text-foreground/60">100% 仓位</p></div>
                <div><p className="text-[10px] text-foreground/25">MEDIUM</p><p className="text-xs font-bold text-foreground/60">50% 仓位</p></div>
                <div><p className="text-[10px] text-foreground/25">WEAK</p><p className="text-xs font-bold text-foreground/60">25% 仓位</p></div>
                <div><p className="text-[10px] text-foreground/25">杠杆</p><p className="text-xs font-bold text-foreground/60">2-5x</p></div>
              </div>
            </div>

            {/* Grid */}
            <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.12)" }}>
              <h3 className="text-sm font-bold text-blue-400 mb-2">2. Grid（网格交易）</h3>
              <p className="text-xs text-foreground/35 mb-2">适用: 低波动 + 横盘震荡 (ADX {'<'} 20, BB width {'<'} 3%)</p>
              <p className="text-xs text-foreground/30">在支撑位买入、阻力位卖出，3-5 层网格，间距 = BB width / 4</p>
            </div>

            {/* DCA */}
            <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(234,179,8,0.04)", border: "1px solid rgba(234,179,8,0.12)" }}>
              <h3 className="text-sm font-bold text-yellow-400 mb-2">3. DCA（分批建仓）</h3>
              <p className="text-xs text-foreground/35 mb-2">适用: 下跌趋势 + 超卖 (RSI {'<'} 30, Stochastic K {'<'} 20)</p>
              <p className="text-xs text-foreground/30">4 层分批买入，每层间距 1.5%，止损 4%（给 DCA 空间）</p>
            </div>

            {/* Arbitrage */}
            <div className="rounded-xl p-4" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.12)" }}>
              <h3 className="text-sm font-bold text-purple-400 mb-2">4. Arbitrage（套利）</h3>
              <p className="text-xs text-foreground/35">规划中 — 跨交易所价差套利</p>
            </div>
          </InfoCard>

          <InfoCard icon={Zap} title="信号强度分级">
            <div className="space-y-2">
              {[
                { level: "STRONG", rule: "信心 >= 75% + 4/5 模型一致", size: "100%", lev: "5x", sl: "2.0%", tp: "4.5%", color: "text-green-400", bg: "bg-green-500/8" },
                { level: "MEDIUM", rule: "信心 >= 60% + 3/5 模型一致", size: "50%", lev: "3x", sl: "1.5%", tp: "3.0%", color: "text-yellow-400", bg: "bg-yellow-500/8" },
                { level: "WEAK", rule: "信心 >= 50% + 3/5 模型一致", size: "25%", lev: "2x", sl: "1.0%", tp: "2.25%", color: "text-orange-400", bg: "bg-orange-500/8" },
                { level: "NONE", rule: "信心 < 50% 或 < 3 模型一致", size: "不交易", lev: "—", sl: "—", tp: "—", color: "text-foreground/30", bg: "bg-white/[0.02]" },
              ].map((s) => (
                <div key={s.level} className={`rounded-xl px-4 py-3 ${s.bg}`} style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-bold ${s.color}`}>{s.level}</span>
                    <span className="text-[10px] text-foreground/25">{s.rule}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px] text-foreground/35">
                    <div>仓位 <span className="font-bold text-foreground/50">{s.size}</span></div>
                    <div>杠杆 <span className="font-bold text-foreground/50">{s.lev}</span></div>
                    <div>止损 <span className="font-bold text-foreground/50">{s.sl}</span></div>
                    <div>止盈 <span className="font-bold text-foreground/50">{s.tp}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={BarChart3} title="市场状态自动检测">
            <p className="text-xs text-foreground/35 mb-3">系统从 15+ 技术指标中实时检测市场状态，自动选择最优策略：</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-foreground/25 border-b border-white/[0.04]">
                    <th className="text-left py-2 pr-3 font-medium">波动率</th>
                    <th className="text-left py-2 pr-3 font-medium">趋势</th>
                    <th className="text-left py-2 pr-3 font-medium">动量</th>
                    <th className="text-left py-2 pr-3 font-medium">→ 策略</th>
                  </tr>
                </thead>
                <tbody className="text-foreground/40">
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5 font-semibold text-red-400/70">HIGH</td><td>强趋势</td><td>任意</td><td className="text-green-400 font-semibold">Directional</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5 font-semibold text-blue-400/70">LOW</td><td>中性</td><td>任意</td><td className="text-blue-400 font-semibold">Grid</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5">任意</td><td>下跌</td><td className="text-yellow-400/70">超卖</td><td className="text-yellow-400 font-semibold">DCA</td></tr>
                  <tr><td className="py-1.5 font-semibold text-yellow-400/70">MEDIUM</td><td>上涨/下跌</td><td>任意</td><td className="text-green-400/70 font-semibold">Directional (保守)</td></tr>
                </tbody>
              </table>
            </div>
          </InfoCard>

          <InfoCard icon={Brain} title="技术指标清单">
            <p className="text-xs text-foreground/35 mb-3">系统计算以下指标并注入 AI Prompt，您的策略也可以参考：</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-foreground/25 font-bold mb-1.5 uppercase tracking-wider">趋势</p>
                <div className="space-y-1 text-xs text-foreground/40">
                  <p>SMA (20, 50, 200)</p>
                  <p>EMA (9, 21)</p>
                  <p>MACD (12/26/9)</p>
                  <p>Supertrend (10, 3)</p>
                  <p>ADX (14)</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-foreground/25 font-bold mb-1.5 uppercase tracking-wider">动量</p>
                <div className="space-y-1 text-xs text-foreground/40">
                  <p>RSI (14)</p>
                  <p>Stochastic (K=14, D=3)</p>
                  <p>CCI (20)</p>
                  <p>Williams %R (14)</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-foreground/25 font-bold mb-1.5 uppercase tracking-wider">波动率</p>
                <div className="space-y-1 text-xs text-foreground/40">
                  <p>Bollinger Bands (20, 2σ)</p>
                  <p>ATR (14)</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-foreground/25 font-bold mb-1.5 uppercase tracking-wider">成交量</p>
                <div className="space-y-1 text-xs text-foreground/40">
                  <p>OBV</p>
                  <p>VWAP</p>
                  <p>CMF (Chaikin Money Flow)</p>
                </div>
              </div>
            </div>
          </InfoCard>

          <InfoCard icon={Layers} title="K线形态识别">
            <div className="grid grid-cols-3 gap-2">
              {[
                { name: "十字星 Doji", type: "中性", stars: 1 },
                { name: "锤子 Hammer", type: "看涨", stars: 2 },
                { name: "流星 Shooting Star", type: "看跌", stars: 2 },
                { name: "看涨吞没", type: "看涨", stars: 2 },
                { name: "看跌吞没", type: "看跌", stars: 2 },
                { name: "晨星 Morning Star", type: "看涨", stars: 3 },
                { name: "暮星 Evening Star", type: "看跌", stars: 3 },
                { name: "三白兵", type: "看涨", stars: 3 },
                { name: "三黑鸦", type: "看跌", stars: 3 },
              ].map((p) => (
                <div key={p.name} className="rounded-lg px-3 py-2 bg-white/[0.02]" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  <p className="text-[11px] font-semibold text-foreground/50">{p.name}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className={`text-[9px] ${p.type === "看涨" ? "text-green-400/60" : p.type === "看跌" ? "text-red-400/60" : "text-foreground/25"}`}>{p.type}</span>
                    <span className="text-[9px] text-yellow-400/50">{"★".repeat(p.stars)}</span>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={BarChart3} title="链上数据源">
            <p className="text-xs text-foreground/35 mb-3">系统从 Binance Futures API 获取实时链上数据：</p>
            <div className="space-y-2">
              {[
                { name: "资金费率", desc: "正=多头拥挤 → 空头机会，负=空头付费 → 多头机会" },
                { name: "多空比", desc: "> 1.2 多头偏重，< 0.8 空头偏重" },
                { name: "持仓量变化", desc: "上升=新资金进入，下降=平仓离场" },
                { name: "大户多空比", desc: "聪明钱方向参考" },
                { name: "主动买卖量", desc: "Taker 主动买卖力量对比" },
              ].map((d) => (
                <div key={d.name} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                  <span className="text-xs font-bold text-primary/70 shrink-0 w-20">{d.name}</span>
                  <span className="text-[11px] text-foreground/30">{d.desc}</span>
                </div>
              ))}
            </div>
          </InfoCard>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: 接入方式 */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "integration" && (
        <div className="space-y-4">
          <InfoCard icon={Radio} title="四种接入方式">
            <div className="space-y-3">
              {[
                { name: "A. Webhook API", desc: "最简单 — 发送 HTTP POST 即可。支持 TradingView、Python、任何系统", difficulty: "简单", delay: "< 1s", recommended: true },
                { name: "B. AI 模型接入", desc: "将你的 AI/ML 模型作为额外预测源加入多模型共识系统", difficulty: "中等", delay: "< 3s" },
                { name: "C. Supabase SDK", desc: "TypeScript/JavaScript 系统直接写入信号表", difficulty: "中等", delay: "< 1s" },
                { name: "D. Hummingbot", desc: "已有 Hummingbot V2 策略可直接接入执行框架", difficulty: "较复杂", delay: "实时" },
              ].map((m) => (
                <div
                  key={m.name}
                  className="rounded-xl p-4"
                  style={{
                    background: m.recommended ? "rgba(10,186,181,0.04)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${m.recommended ? "rgba(10,186,181,0.15)" : "rgba(255,255,255,0.04)"}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className={`text-sm font-bold ${m.recommended ? "text-primary" : "text-foreground/60"}`}>{m.name}</h3>
                    {m.recommended && <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">推荐</span>}
                  </div>
                  <p className="text-xs text-foreground/35 mb-2">{m.desc}</p>
                  <div className="flex gap-4 text-[10px] text-foreground/25">
                    <span>难度: {m.difficulty}</span>
                    <span>延迟: {m.delay}</span>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={Brain} title="方式 B: AI 模型接入详解">
            <p className="text-xs text-foreground/35 mb-3">
              部署你的模型为 HTTP API，CoinMax 会发送市场数据，你返回预测结果。
            </p>
            <p className="text-[10px] text-foreground/25 mb-2">CoinMax → 你的 API (请求):</p>
            <CodeBlock lang="JSON" code={`{
  "messages": [
    {
      "role": "system",
      "content": "You are a crypto analyst. Return JSON: {prediction, confidence, targetPrice, reasoning}"
    },
    {
      "role": "user",
      "content": "Analyze BTC/USDT at $67,230.\\n  RSI(14)=55.3, MACD=BULLISH_CROSS, BB=52%\\n  Funding=0.01%, L/S_ratio=1.15\\n  Predict the 1-hour movement."
    }
  ]
}`} />
            <p className="text-[10px] text-foreground/25 mb-2">你的 API → CoinMax (响应):</p>
            <CodeBlock lang="JSON" code={`{
  "prediction": "BULLISH",
  "confidence": 78,
  "targetPrice": 67850,
  "reasoning": "EMA crossover with volume confirmation"
}`} />
            <div className="rounded-lg p-3 mt-2" style={{ background: "rgba(10,186,181,0.04)", border: "1px solid rgba(10,186,181,0.1)" }}>
              <p className="text-[11px] text-primary/60 font-semibold mb-1">接入后自动获得:</p>
              <div className="text-[10px] text-foreground/30 space-y-0.5">
                <p>• 准确率自动追踪 (7天/30天/全部)</p>
                <p>• 动态权重调整 (越准权重越高)</p>
                <p>• RAG 记忆增强 (从相似历史行情学习)</p>
                <p>• Admin Dashboard 准确率展示</p>
              </div>
            </div>
          </InfoCard>

          <InfoCard icon={Zap} title="执行模式">
            <div className="space-y-2">
              {[
                { mode: "PAPER", desc: "模拟交易 — 测试验证阶段", icon: "📝" },
                { mode: "SIGNAL", desc: "只发信号 — 用户手动执行", icon: "📡" },
                { mode: "SEMI_AUTO", desc: "信号 + 用户确认后自动执行", icon: "🔔" },
                { mode: "FULL_AUTO", desc: "完全自动执行 — 需审核通过", icon: "🤖" },
              ].map((e) => (
                <div key={e.mode} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02]" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="text-base">{e.icon}</span>
                  <div>
                    <p className="text-xs font-bold text-foreground/60">{e.mode}</p>
                    <p className="text-[10px] text-foreground/25">{e.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={Shield} title="接入流程">
            <div className="space-y-2">
              {[
                { step: 1, text: "注册账号 → 获取 API Key", status: "自助" },
                { step: 2, text: "选择接入方式 (A/B/C/D)", status: "自助" },
                { step: 3, text: "开发对接 + 发送测试信号", status: "自助" },
                { step: 4, text: "Paper Trading 测试期 (至少 7 天)", status: "自动" },
                { step: 5, text: "绩效审核: 胜率 > 55%, 盈亏比 > 1.2", status: "审核" },
                { step: 6, text: "上线 SIGNAL 模式 → 用户可订阅", status: "审核" },
                { step: 7, text: "表现优秀 → 开放 SEMI_AUTO / FULL_AUTO", status: "审核" },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-3 px-3 py-2 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{s.step}</span>
                  <span className="text-xs text-foreground/50 flex-1">{s.text}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                    s.status === "自助" ? "bg-green-500/8 text-green-400/60" :
                    s.status === "自动" ? "bg-blue-500/8 text-blue-400/60" :
                    "bg-yellow-500/8 text-yellow-400/60"
                  }`}>{s.status}</span>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={TrendingUp} title="收益分成模型">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(10,186,181,0.04)", border: "1px solid rgba(10,186,181,0.1)" }}>
                <div>
                  <p className="text-sm font-semibold text-foreground/70">策略盈利分成</p>
                  <p className="text-[10px] text-foreground/25">基于跟单用户实际盈利</p>
                </div>
                <span className="text-xl font-bold text-primary">20%</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02]" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                <div>
                  <p className="text-sm font-semibold text-foreground/70">用户订阅费分成</p>
                  <p className="text-[10px] text-foreground/25">VIP 用户月订阅费</p>
                </div>
                <span className="text-xl font-bold text-foreground/60">50%</span>
              </div>
            </div>
          </InfoCard>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: API 文档 */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "api" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">Webhook 端点</h2>
            <CodeBlock code={`POST ${endpoint}`} lang="HTTP" />
            <p className="text-xs text-foreground/40 mb-2">认证方式 (二选一):</p>
            <CodeBlock code={`Authorization: Bearer YOUR_API_KEY\n\n# 或 (TradingView 兼容)\nx-webhook-secret: YOUR_API_KEY`} lang="Headers" />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-1">格式一: 标准格式（完整）</h2>
            <p className="text-xs text-foreground/35 mb-3">包含所有参数的完整信号</p>
            <CodeBlock lang="JSON" code={`{
  "asset": "BTC",
  "action": "OPEN_LONG",
  "confidence": 78,
  "strength": "MEDIUM",
  "strategy_type": "directional",
  "leverage": 3,
  "stop_loss_pct": 0.02,
  "take_profit_pct": 0.03,
  "position_size_pct": 0.5,
  "source_models": ["MyStrategy v2"],
  "rag_context": "EMA crossover + volume spike"
}`} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-foreground/25 border-b border-white/[0.04]">
                    <th className="text-left py-1.5 pr-3 font-medium">字段</th>
                    <th className="text-left py-1.5 pr-3 font-medium">类型</th>
                    <th className="text-left py-1.5 pr-3 font-medium">必填</th>
                    <th className="text-left py-1.5 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="text-foreground/40">
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">asset</td><td>string</td><td>是</td><td>BTC, ETH, SOL 等</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">action</td><td>string</td><td>是</td><td>OPEN_LONG / OPEN_SHORT / CLOSE / HOLD</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">confidence</td><td>number</td><td>是</td><td>0-100 信心度</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">strength</td><td>string</td><td>否</td><td>STRONG / MEDIUM / WEAK, 不填自动算</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">strategy_type</td><td>string</td><td>否</td><td>directional / grid / dca</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">leverage</td><td>number</td><td>否</td><td>杠杆倍数, 默认 2x</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">stop_loss_pct</td><td>number</td><td>否</td><td>止损%, 0.02 = 2%, 默认 2%</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">take_profit_pct</td><td>number</td><td>否</td><td>止盈%, 0.03 = 3%, 默认 3%</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">position_size_pct</td><td>number</td><td>否</td><td>仓位比例 0-1, 默认 0.5</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1 text-primary/60 font-mono">source_models</td><td>string[]</td><td>否</td><td>策略来源标识</td></tr>
                  <tr><td className="py-1 text-primary/60 font-mono">rag_context</td><td>string</td><td>否</td><td>决策理由 (供回溯分析)</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-1">格式二: TradingView 格式</h2>
            <p className="text-xs text-foreground/35 mb-3">TradingView Alert 兼容, 自动识别</p>
            <CodeBlock lang="JSON" code={`{
  "ticker": "BTCUSDT",
  "action": "buy",
  "price": 67230,
  "confidence": 75,
  "comment": "RSI oversold bounce"
}`} />
            <p className="text-xs text-foreground/35">action 映射: buy/long → OPEN_LONG, sell/short → OPEN_SHORT, close/exit/flat → CLOSE</p>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-1">格式三: 极简格式</h2>
            <p className="text-xs text-foreground/35 mb-3">最少 2 个字段即可</p>
            <CodeBlock lang="JSON" code={`{
  "direction": "long",
  "asset": "BTC"
}`} />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">响应格式</h2>
            <p className="text-xs text-foreground/35 mb-2">成功 (200):</p>
            <CodeBlock lang="JSON" code={`{
  "status": "ok",
  "signal_id": "550e8400-e29b-41d4-...",
  "provider": "your_name",
  "action": "OPEN_LONG",
  "asset": "BTC",
  "confidence": 78,
  "strength": "MEDIUM"
}`} />
            <p className="text-xs text-foreground/35 mb-2">HOLD 信号 (200):</p>
            <CodeBlock lang="JSON" code={`{ "status": "skipped", "reason": "HOLD signal, no action taken" }`} />
            <p className="text-xs text-foreground/35 mb-2">错误:</p>
            <CodeBlock lang="JSON" code={`// 401 - 认证失败
{ "error": "Unauthorized. Provide Bearer token or x-webhook-secret header." }

// 400 - 资产不允许
{ "error": "Asset AVAX not allowed for provider your_name" }

// 405 - 方法不允许
{ "error": "Method not allowed" }

// 500 - 数据库错误
{ "error": "DB error: ..." }`} />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">信号验证规则</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-foreground/25 border-b border-white/[0.04]">
                    <th className="text-left py-1.5 pr-3 font-medium">检查项</th>
                    <th className="text-left py-1.5 pr-3 font-medium">规则</th>
                    <th className="text-left py-1.5 font-medium">未通过</th>
                  </tr>
                </thead>
                <tbody className="text-foreground/40">
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5">资产白名单</td><td>必须在 allowedAssets 中</td><td className="text-red-400/60">400 错误</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5">HOLD 信号</td><td>action=HOLD 不执行</td><td className="text-yellow-400/60">200 skipped</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5">信心度范围</td><td>自动 clamp 到 0-100</td><td className="text-foreground/30">修正后继续</td></tr>
                  <tr className="border-b border-white/[0.02]"><td className="py-1.5">杠杆上限</td><td>不超过 maxLeverage</td><td className="text-foreground/30">修正为最大值</td></tr>
                  <tr><td className="py-1.5">仓位比例</td><td>自动 clamp 到 0-1</td><td className="text-foreground/30">修正后继续</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: 代码示例 */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "examples" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">cURL</h2>
            <CodeBlock lang="bash" code={`curl -X POST \\
  ${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "asset": "BTC",
    "action": "OPEN_LONG",
    "confidence": 80,
    "leverage": 3,
    "stop_loss_pct": 0.02,
    "take_profit_pct": 0.04
  }'`} />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">Python</h2>
            <CodeBlock lang="python" code={`import requests
import time

API_KEY = "sp_your_api_key_here"
URL = "${endpoint}"

def send_signal(asset, action, confidence, **kwargs):
    """发送交易信号到 CoinMax"""
    resp = requests.post(URL, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }, json={
        "asset": asset,
        "action": action,
        "confidence": confidence,
        **kwargs,
    })
    return resp.json()

# 开多 BTC, 信心度 80%, 3倍杠杆
result = send_signal("BTC", "OPEN_LONG", 80,
    leverage=3,
    stop_loss_pct=0.02,
    take_profit_pct=0.04,
    source_models=["my_rsi_strategy"],
    rag_context="RSI oversold + MACD bullish cross"
)
print(f"Signal ID: {result.get('signal_id')}")

# 平仓 ETH
result = send_signal("ETH", "CLOSE", 90)

# 开空 SOL, 高信心
result = send_signal("SOL", "OPEN_SHORT", 85,
    leverage=5,
    stop_loss_pct=0.015,
    take_profit_pct=0.05,
    strength="STRONG"
)`} />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">JavaScript / Node.js</h2>
            <CodeBlock lang="javascript" code={`const API_KEY = "sp_your_api_key_here";
const URL = "${endpoint}";

async function sendSignal(signal) {
  const resp = await fetch(URL, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(signal),
  });
  return resp.json();
}

// 使用示例
const result = await sendSignal({
  asset: "BTC",
  action: "OPEN_LONG",
  confidence: 82,
  leverage: 3,
  stop_loss_pct: 0.02,
  take_profit_pct: 0.04,
  source_models: ["my_strategy_v2"],
});

console.log("Signal published:", result.signal_id);`} />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">TradingView Alert 配置</h2>
            <div className="text-xs text-foreground/40 space-y-3">
              <div>
                <p className="font-semibold text-foreground/50 mb-1">Step 1: Webhook URL</p>
                <CodeBlock code={endpoint} lang="URL" />
              </div>
              <div>
                <p className="font-semibold text-foreground/50 mb-1">Step 2: 添加 Header</p>
                <CodeBlock code="x-webhook-secret: YOUR_API_KEY" lang="Header" />
              </div>
              <div>
                <p className="font-semibold text-foreground/50 mb-1">Step 3: Alert Message</p>
                <CodeBlock lang="JSON" code={`{
  "ticker": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "confidence": 75,
  "comment": "{{strategy.order.comment}}"
}`} />
              </div>
              <div>
                <p className="font-semibold text-foreground/50 mb-1">Step 4: Pine Script 示例</p>
                <CodeBlock lang="pine" code={`//@version=5
strategy("My CoinMax Strategy", overlay=true)

// 你的策略逻辑
longCondition = ta.crossover(ta.sma(close, 9), ta.sma(close, 21))
shortCondition = ta.crossunder(ta.sma(close, 9), ta.sma(close, 21))

if longCondition
    strategy.entry("Long", strategy.long)
if shortCondition
    strategy.entry("Short", strategy.short)`} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold text-foreground/70 mb-3">3Commas DCA Bot 配置</h2>
            <CodeBlock lang="JSON" code={`{
  "asset": "BTC",
  "action": "OPEN_LONG",
  "confidence": 70,
  "strategy_type": "dca",
  "leverage": 2,
  "stop_loss_pct": 0.04,
  "take_profit_pct": 0.03,
  "position_size_pct": 0.25,
  "source_models": ["3Commas:DCA:BTC_Grid"],
  "rag_context": "DCA bot triggered at support level"
}`} />
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: 常见问题 */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "faq" && (
        <div className="space-y-3">
          {[
            { q: "信号发送频率有限制吗？", a: "同一资产建议间隔至少 60 秒。系统有冷却期控制，过于频繁的信号会被忽略。" },
            { q: "可以同时发送多个资产的信号吗？", a: "可以，每个资产独立处理。例如同时开多 BTC 和开空 ETH。" },
            { q: "信号的有效期是多久？", a: "默认 1 小时未执行则自动过期 (status → expired)。可通过配置调整。" },
            { q: "如何测试而不影响真实用户？", a: "注册后默认为 PAPER 模式，信号不会触发真实交易。通过审核后才会升级到 SIGNAL 模式。" },
            { q: "支持哪些交易所执行？", a: "Binance, Bybit, OKX, Bitget (CEX) + HyperLiquid, dYdX (DEX)。用户选择使用的交易所。" },
            { q: "API Key 丢失了怎么办？", a: "在策略中心 → API Key 页面可以轮换新 Key。旧 Key 立即失效。" },
            { q: "信号被拒绝/不执行的常见原因？", a: "1) 信心度太低 (< 50%)  2) 资产不在允许列表  3) 达到日亏损上限  4) 最大持仓数已满  5) 冷却期内" },
            { q: "如何提高策略的权重/排名？", a: "保持高胜率 (> 55%)、良好的盈亏比 (> 1.2)、稳定的信号频率。系统根据 7天×40% + 30天×30% + RAG×30% 动态调整权重。" },
            { q: "收益多久结算一次？", a: "每月 1 日结算上月收益。最低提现 $50，支持 USDT (BEP-20) 打款，3 个工作日内到账。" },
            { q: "可以同时使用多种接入方式吗？", a: "可以。例如 Webhook 发布信号 + AI 模型参与共识，两者互不冲突。" },
            { q: "审核需要多久？", a: "1-3 个工作日。Paper Trading 测试期至少 7 天，系统自动评估绩效。" },
            { q: "什么情况下会被暂停？", a: "连续 3 天胜率低于 40%、或触发大额亏损警告、或违反使用条款。暂停后可联系团队申诉恢复。" },
          ].map((item, i) => (
            <details key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] group">
              <summary className="px-5 py-3.5 cursor-pointer text-sm font-semibold text-foreground/60 hover:text-foreground/80 transition-colors list-none flex items-center justify-between">
                {item.q}
                <span className="text-foreground/20 group-open:rotate-180 transition-transform text-xs">▼</span>
              </summary>
              <div className="px-5 pb-4 pt-0">
                <p className="text-xs text-foreground/40 leading-relaxed">{item.a}</p>
              </div>
            </details>
          ))}

          <div className="rounded-2xl p-5 mt-4" style={{ background: "rgba(10,186,181,0.04)", border: "1px solid rgba(10,186,181,0.12)" }}>
            <h3 className="text-sm font-bold text-primary/80 mb-2">联系我们</h3>
            <div className="text-xs text-foreground/40 space-y-1">
              <p>技术对接: <span className="text-primary/60">tech@coinmax-ai.com</span></p>
              <p>Telegram: <span className="text-primary/60">@coinmax_tech</span></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
