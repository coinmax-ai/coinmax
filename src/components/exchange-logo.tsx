const EXCHANGE_LOGOS: Record<string, string> = {
  Binance: "https://bin.bnbstatic.com/static/images/common/favicon.ico",
  OKX: "https://static.okx.com/cdn/assets/imgs/226/DF679B3DAD8B5765.png",
  Bybit: "https://www.bybit.com/favicon.ico",
  Bitget: "https://img.bitgetimg.com/image/third/1723517477631.png",
  Kraken: "https://assets-cms.kraken.com/images/51n36hrp/facade/favicon-32x32.png",
  Coinbase: "https://assets.coinbase.com/exchange/favicon.ico",
  Gate: "https://www.gate.io/favicon.ico",
  MEXC: "https://www.mexc.com/favicon.png",
  CoinEx: "https://asset.coinex.com/favicon.ico",
  LBank: "https://assets.lbkrs.com/v1/favicon.ico",
  Hyperliquid: "https://app.hyperliquid.xyz/favicon.ico",
  Bitmex: "https://www.bitmex.com/favicon.ico",
  "Crypto.com": "https://crypto.com/favicon.ico",
  Bitunix: "https://www.bitunix.com/favicon.ico",
  KuCoin: "https://assets.staticimg.com/cms/media/7AV75b9jzr9S8H3eNuOuoqj8PwdUjmUBmMsGPGP7J.png",
  Huobi: "https://www.htx.com/favicon.ico",
};

const EXCHANGE_COLORS: Record<string, string> = {
  Binance: "#F0B90B",
  OKX: "#fff",
  Bybit: "#F7A600",
  Coinbase: "#0052FF",
  Bitget: "#00F0FF",
  Gate: "#2354E6",
  KuCoin: "#23AF5F",
  Kraken: "#5741D9",
  MEXC: "#1972E2",
  CoinEx: "#46C8A3",
  LBank: "#1C6BF5",
  Hyperliquid: "#00D1A9",
  Bitmex: "#F7931A",
  "Crypto.com": "#002D74",
  Bitunix: "#3B82F6",
  Huobi: "#2BAE73",
};

export function getExchangeColor(name: string) {
  return EXCHANGE_COLORS[name] || "#888";
}

interface ExchangeLogoProps {
  name: string;
  size?: number;
  className?: string;
}

export function ExchangeLogo({ name, size = 16, className = "" }: ExchangeLogoProps) {
  const url = EXCHANGE_LOGOS[name];
  const color = EXCHANGE_COLORS[name] || "#888";

  if (!url) {
    return (
      <div
        className={`rounded-full shrink-0 flex items-center justify-center font-bold text-white ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45, backgroundColor: color }}
      >
        {name[0]}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      className={`rounded-full shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const fallback = document.createElement("div");
        fallback.className = `rounded-full shrink-0 flex items-center justify-center font-bold text-white`;
        fallback.style.cssText = `width:${size}px;height:${size}px;font-size:${size * 0.45}px;background-color:${color}`;
        fallback.textContent = name[0];
        el.parentNode?.insertBefore(fallback, el);
      }}
    />
  );
}
