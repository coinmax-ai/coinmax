import { useQuery } from "@tanstack/react-query";
import { getMaPrice } from "@/lib/api";

const DEFAULT_MA_PRICE = 0.1;

export function useMaPrice() {
  const { data, isLoading } = useQuery({
    queryKey: ["ma-price"],
    queryFn: getMaPrice,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const price = data?.price ?? DEFAULT_MA_PRICE;
  const source = data?.source ?? "DEFAULT";

  const usdcToMA = (usdc: number) => usdc / price;

  const formatMA = (usdc: number) => {
    const ma = usdcToMA(usdc);
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ma)} MA`;
  };

  const formatCompactMA = (usdc: number) => {
    const ma = usdcToMA(usdc);
    if (ma >= 1_000_000) return `${(ma / 1_000_000).toFixed(2)}M MA`;
    if (ma >= 1_000) return `${(ma / 1_000).toFixed(1)}K MA`;
    return `${ma.toFixed(2)} MA`;
  };

  return { price, source, isLoading, usdcToMA, formatMA, formatCompactMA };
}
