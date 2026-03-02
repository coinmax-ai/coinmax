import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TradeBet } from "@shared/types";

interface CellData {
  direction: "up" | "down";
  change: number;
  isOver5: boolean;
  isReversal: boolean;
  isLatest: boolean;
}

interface PredictionGridProps {
  bets: TradeBet[];
  gridType: "big" | "small";
  timeframe?: string;
}

function generateCellData(bets: TradeBet[], gridType: "big" | "small", timeframe?: string): CellData[] {
  const totalCells = gridType === "big" ? 56 : 120;
  const cells: CellData[] = [];
  const seed = timeframe === "30M" ? 17 : timeframe === "4H" ? 31 : timeframe === "1M" ? 53 : 7;

  const rawDirs: ("up" | "down")[] = [];
  const rawChanges: number[] = [];

  if (bets && bets.length > 0) {
    for (const bet of bets) {
      rawDirs.push(bet.direction === "up" || bet.direction === "bull" ? "up" : "down");
      rawChanges.push(Math.random() * 8);
    }
  }

  const remaining = totalCells - rawDirs.length;
  for (let i = 0; i < remaining; i++) {
    const v = ((i + seed) * 13 + seed * 3) % 100;
    rawDirs.push(v > 46 ? "up" : "down");
    const changeSeed = ((i + seed) * 7 + seed * 11) % 100;
    rawChanges.push(changeSeed < 12 ? 5 + (changeSeed % 10) * 0.5 : (changeSeed % 45) * 0.1);
  }

  for (let i = 0; i < totalCells && i < rawDirs.length; i++) {
    const dir = rawDirs[i];
    const change = rawChanges[i] ?? 0;
    const isReversal = i > 0 && rawDirs[i] !== rawDirs[i - 1];
    cells.push({
      direction: dir,
      change,
      isOver5: change >= 5,
      isReversal,
      isLatest: false,
    });
  }

  if (cells.length > 0) {
    cells[cells.length - 1] = { ...cells[cells.length - 1], isLatest: true };
  }
  return cells;
}

function BigRoadGrid({ cells, visibleCount }: { cells: CellData[]; visibleCount: number }) {
  const cols = 7;
  const rows = 8;

  return (
    <div className="relative overflow-hidden rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
      <div className="flex">
        <div className="flex flex-col shrink-0" style={{ width: 22 }}>
          {Array.from({ length: rows }, (_, r) => (
            <div
              key={r}
              className="flex items-center justify-center text-[11px] text-muted-foreground/50 font-mono"
              style={{ height: 48 }}
              data-testid={`row-label-${r + 1}`}
            >
              {r + 1}
            </div>
          ))}
        </div>

        <div
          className="grid flex-1"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 48px)`,
          }}
        >
          {Array.from({ length: cols * rows }, (_, i) => {
            const cell = cells[i];
            if (!cell) return <div key={i} className="border-r border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }} />;

            const isVisible = i < visibleCount;
            const isUp = cell.direction === "up";

            const upBg = "rgba(80,140,50,0.65)";
            const downBg = "rgba(160,30,70,0.7)";
            const upBorder = "rgba(130,180,70,0.5)";
            const downBorder = "rgba(200,50,90,0.5)";

            return (
              <div
                key={i}
                className={`relative flex items-center justify-center transition-all duration-200 ${isVisible ? "opacity-100" : "opacity-0"}`}
                style={{
                  background: isUp ? upBg : downBg,
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isVisible
                    ? `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.15)`
                    : "none",
                }}
                data-testid={`grid-cell-${i}`}
              >
                <span className="text-white/90 text-sm font-bold select-none" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
                  {isUp ? "↑" : "↓"}
                </span>

                {cell.isOver5 && isVisible && (
                  <span
                    className="absolute top-[3px] right-[3px] h-[6px] w-[6px] rounded-full"
                    style={{
                      backgroundColor: "#f59e0b",
                      boxShadow: "0 0 4px rgba(245,158,11,0.6)",
                    }}
                  />
                )}

                {cell.isReversal && isVisible && (
                  <span
                    className="absolute bottom-[3px] left-[3px] h-[6px] w-[6px] rounded-full"
                    style={{
                      backgroundColor: "#3b82f6",
                      boxShadow: "0 0 4px rgba(59,130,246,0.6)",
                      animation: cell.isLatest ? "reversalBounce 1.5s ease-in-out infinite" : "none",
                    }}
                  />
                )}

                {cell.isLatest && isVisible && (
                  <div
                    className="absolute inset-0 rounded-[1px]"
                    style={{
                      border: "2px solid rgba(250,204,21,0.7)",
                      animation: "gridBlink 1.2s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex ml-[22px]">
        {Array.from({ length: cols }, (_, c) => (
          <div
            key={c}
            className="flex-1 text-center text-[11px] text-muted-foreground/50 font-mono py-1"
            data-testid={`col-label-${c + 1}`}
          >
            {c + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SmallRoadColumn {
  direction: "up" | "down";
  circles: { isOver5: boolean }[];
}

function buildSmallRoadColumns(cells: CellData[]): SmallRoadColumn[] {
  const columns: SmallRoadColumn[] = [];
  let currentDir: "up" | "down" | null = null;
  let currentCol: { isOver5: boolean }[] = [];

  for (const cell of cells) {
    if (currentDir === null || cell.direction !== currentDir) {
      if (currentCol.length > 0 && currentDir !== null) {
        columns.push({ direction: currentDir, circles: currentCol });
      }
      currentDir = cell.direction;
      currentCol = [{ isOver5: cell.isOver5 }];
    } else {
      currentCol.push({ isOver5: cell.isOver5 });
    }
  }
  if (currentCol.length > 0 && currentDir !== null) {
    columns.push({ direction: currentDir, circles: currentCol });
  }
  return columns;
}

function SmallRoadGrid({ cells, visibleCount }: { cells: CellData[]; visibleCount: number }) {
  const columns = useMemo(() => buildSmallRoadColumns(cells), [cells]);
  const maxRows = 9;
  const startCol = Math.max(0, columns.length - 13);
  const visibleCols = columns.slice(startCol);

  const colOffsets = useMemo(() => {
    let offset = 0;
    for (let c = 0; c < startCol; c++) {
      offset += Math.min(columns[c].circles.length, maxRows);
    }
    const offsets: number[] = [];
    for (const col of visibleCols) {
      offsets.push(offset);
      offset += Math.min(col.circles.length, maxRows);
    }
    return offsets;
  }, [columns, startCol, visibleCols, maxRows]);

  return (
    <div className="relative overflow-hidden rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
      <div className="flex">
        <div className="flex flex-col shrink-0" style={{ width: 22 }}>
          {Array.from({ length: maxRows }, (_, r) => (
            <div
              key={r}
              className="flex items-center justify-center text-[11px] text-muted-foreground/50 font-mono"
              style={{ height: 32 }}
              data-testid={`row-label-${r + 1}`}
            >
              {r + 1}
            </div>
          ))}
        </div>

        <div className="flex flex-1">
          {visibleCols.map((col, ci) => {
            const colCells = col.circles.slice(0, maxRows);
            const isUp = col.direction === "up";
            const strokeColor = isUp ? "#a3e635" : "#f43f5e";
            const fillColor = isUp ? "#65a30d" : "#be123c";
            const baseIdx = colOffsets[ci] ?? 0;

            return (
              <div key={ci + startCol} className="flex-1 flex flex-col">
                {Array.from({ length: maxRows }, (_, ri) => {
                  const circle = colCells[ri];
                  const globalIdx = baseIdx + ri;
                  const isVis = globalIdx < visibleCount;
                  const isLast = ci === visibleCols.length - 1 && ri === colCells.length - 1;

                  return (
                    <div
                      key={ri}
                      className="flex items-center justify-center"
                      style={{
                        height: 32,
                        borderRight: "1px solid rgba(255,255,255,0.04)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {circle && isVis ? (
                        <div
                          className="rounded-full transition-all duration-200"
                          style={{
                            width: 20,
                            height: 20,
                            border: `2.5px solid ${strokeColor}`,
                            backgroundColor: circle.isOver5 ? fillColor : "transparent",
                            boxShadow: isLast
                              ? `0 0 8px ${strokeColor}80`
                              : circle.isOver5
                                ? `0 0 4px ${strokeColor}40`
                                : "none",
                            animation: isLast ? "gridBlink 1.2s ease-in-out infinite" : "none",
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex ml-[22px]">
        {visibleCols.map((_, ci) => (
          <div
            key={ci}
            className="flex-1 text-center text-[11px] text-muted-foreground/50 font-mono py-1"
            data-testid={`col-label-${ci + startCol + 1}`}
          >
            {ci + startCol + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PredictionGrid({ bets, gridType, timeframe }: PredictionGridProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const [visibleCount, setVisibleCount] = useState(0);
  const cells = useMemo(
    () => generateCellData(bets || [], gridType, timeframe),
    [bets, gridType, timeframe]
  );

  useEffect(() => {
    setVisibleCount(0);
    let frame = 0;
    const batchSize = gridType === "big" ? 3 : 5;
    const interval = setInterval(() => {
      frame += batchSize;
      if (frame >= cells.length) {
        setVisibleCount(cells.length);
        clearInterval(interval);
      } else {
        setVisibleCount(frame);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [cells.length, gridType, timeframe]);

  const ups = cells.filter(c => c.direction === "up").length;
  const downs = cells.filter(c => c.direction === "down").length;
  const over5Count = cells.filter(c => c.isOver5).length;

  return (
    <div data-testid={`prediction-grid-${gridType}`}>
      <div className="flex items-center gap-3 mb-3 text-[12px] flex-wrap">
        <span className="font-bold" style={{ color: "#00e7a0" }} data-testid="text-bull-count">
          {isZh ? "多" : t("trade.bull")}: {ups}
        </span>
        <span className="font-bold" style={{ color: "#ff4976" }} data-testid="text-bear-count">
          {isZh ? "空" : t("trade.bear")}: {downs}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#f59e0b", boxShadow: "0 0 4px rgba(245,158,11,0.5)" }} />
          {isZh ? "超过5%" : ">5%"}
        </span>
        {gridType === "big" && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#3b82f6", boxShadow: "0 0 4px rgba(59,130,246,0.5)" }} />
            {isZh ? "反转" : t("trade.reversal")}
          </span>
        )}
      </div>

      {gridType === "big" ? (
        <BigRoadGrid cells={cells} visibleCount={visibleCount} />
      ) : (
        <SmallRoadGrid cells={cells} visibleCount={visibleCount} />
      )}

      <style>{`
        @keyframes gridBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes reversalBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.6); }
        }
      `}</style>
    </div>
  );
}
