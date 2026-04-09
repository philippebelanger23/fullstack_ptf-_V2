import React, { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { correlationColor } from './riskUtils';

type CorrelationMatrix = { tickers: string[]; matrix: number[][] };

type WeightedTicker = {
    ticker: string;
    weight: number;
};

interface CorrelationHeatmapProps {
    correlationMatrix: CorrelationMatrix;
    loading: boolean;
    noWrapper?: boolean;
}

const CELL_SIZE = 38;

const formatTickerLabel = (ticker: string) => {
    const clean = ticker.replace('.TO', '');
    if (clean.includes('-')) return clean.replace(/-/g, '·');
    return clean;
};

export const buildTopWeightedCorrelationMatrix = (
    correlationMatrix: CorrelationMatrix | null | undefined,
    positions: WeightedTicker[] | null | undefined,
    limit = 15,
): CorrelationMatrix => {
    if (!correlationMatrix?.tickers.length || !correlationMatrix.matrix.length || !positions?.length) {
        return correlationMatrix ?? { tickers: [], matrix: [] };
    }

    const orderedTickers = positions
        .map(({ ticker, weight }) => ({ ticker: ticker.trim(), weight: Number(weight ?? 0) }))
        .filter(({ ticker }) => ticker.length > 0)
        .sort((left, right) => right.weight - left.weight)
        .slice(0, limit);

    if (orderedTickers.length === 0) return correlationMatrix;

    const indexByTicker = new Map(
        correlationMatrix.tickers.map((ticker, index) => [ticker.toUpperCase(), index] as const),
    );
    const selectedIndices = orderedTickers
        .map(({ ticker }) => indexByTicker.get(ticker.toUpperCase()))
        .filter((index): index is number => index !== undefined);

    if (selectedIndices.length === 0) return correlationMatrix;

    return {
        tickers: selectedIndices.map((index) => correlationMatrix.tickers[index]),
        matrix: selectedIndices.map((rowIndex) => selectedIndices.map((colIndex) => correlationMatrix.matrix[rowIndex]?.[colIndex] ?? 0)),
    };
};

export const CorrelationHeatmap: React.FC<CorrelationHeatmapProps> = ({ correlationMatrix, loading, noWrapper }) => {
    const tc = useThemeColors();
    const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);

    if (loading) return <HeatmapSkeleton />;

    const { tickers, matrix } = correlationMatrix;
    const n = tickers.length;
    if (n === 0) return null;

    const maxShow = Math.min(n, 15);
    const displayTickers = tickers.slice(0, maxShow);
    const displayMatrix = matrix.slice(0, maxShow).map(row => row.slice(0, maxShow));
    const gridWidth = maxShow * (CELL_SIZE + 2); // +2 for margin:1 on each side
    const labelWidth = 72;

    const inner = (
        <>
            {!noWrapper && (
                <div className="mb-5">
                    <h3 className="text-[22px] font-bold font-mono text-wallstreet-text uppercase tracking-wider">Correlation Matrix</h3>
                </div>
            )}

            <div className="flex justify-center overflow-x-auto">
                <div style={{ width: labelWidth + gridWidth }} className="relative">
                    {/* Legend + hover detail — floated into the empty upper-right triangle */}
                    <div className="absolute flex flex-col items-end gap-1 pointer-events-none" style={{ top: 0, left: labelWidth + (CELL_SIZE + 2) * 2, right: 0 }}>
                        <div className="flex items-center gap-3">
                            <span className="text-base font-mono font-bold text-wallstreet-500">0.0</span>
                            <div className="h-5 w-64 rounded-full overflow-hidden flex relative">
                                {Array.from({ length: 24 }).map((_, k) => (
                                    <div key={k} className="flex-1 h-full" style={{ backgroundColor: correlationColor(k / 23, tc.isDark) }} />
                                ))}
                            </div>
                            <span className="text-base font-mono font-bold text-red-500">1.0</span>
                        </div>
                        <div className="h-7 flex items-center text-base font-mono">
                            {hovered && hovered.i !== hovered.j ? (
                                <span className={`font-bold ${
                                    displayMatrix[hovered.i][hovered.j] > 0.7 ? 'text-red-500'
                                        : displayMatrix[hovered.i][hovered.j] < 0.3 ? 'text-blue-500'
                                            : 'text-wallstreet-text'
                                }`}>
                                    {formatTickerLabel(displayTickers[hovered.i])} ↔ {formatTickerLabel(displayTickers[hovered.j])} — {displayMatrix[hovered.i][hovered.j].toFixed(3)}
                                </span>
                            ) : (
                                <span className="text-wallstreet-500">Hover a cell to see details</span>
                            )}
                        </div>
                    </div>

                    {/* Grid - lower triangular only */}
                    {displayMatrix.map((row, i) => (
                        <div key={i} className="flex items-center">
                            <div
                                className={`shrink-0 text-right pr-2 text-[14px] font-mono font-medium truncate transition-colors ${
                                    hovered?.i === i ? 'text-wallstreet-text' : 'text-wallstreet-500'
                                }`}
                                style={{ width: labelWidth }}
                                title={displayTickers[i]}
                            >
                                {formatTickerLabel(displayTickers[i])}
                            </div>
                            {row.map((value, j) => {
                                // Only render lower triangular (j <= i)
                                if (j > i) return null;

                                const isHov = hovered?.i === i && hovered?.j === j;
                                const isHighlight = hovered !== null && (hovered.i === i || hovered.j === j);
                                const isDiag = i === j;
                                return (
                                    <div
                                        key={j}
                                        className={`flex items-center justify-center cursor-pointer transition-all duration-75 ${
                                            isHov ? 'ring-2 ring-wallstreet-text z-10 scale-110' : ''
                                        }`}
                                        style={{
                                            width: CELL_SIZE,
                                            height: CELL_SIZE,
                                            backgroundColor: isDiag
                                                ? (tc.isDark ? '#1e293b' : '#f1f5f9')
                                                : correlationColor(value, tc.isDark),
                                            opacity: isHighlight || hovered === null ? 1 : 0.7,
                                            borderRadius: 3,
                                            margin: 1,
                                        }}
                                        onMouseEnter={() => setHovered({ i, j })}
                                        onMouseLeave={() => setHovered(null)}
                                    >
                                        <span className={`text-[13px] font-mono font-semibold select-none ${
                                            isDiag
                                                ? 'text-wallstreet-500'
                                                : Math.abs(value) > 0.55
                                                    ? 'text-white'
                                                    : tc.isDark ? 'text-slate-300' : 'text-slate-600'
                                        }`}>
                                            {isDiag ? '—' : value.toFixed(2)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* Column headers (X axis) — bottom, horizontal */}
                    <div className="flex" style={{ marginLeft: labelWidth }}>
                        {displayTickers.map((ticker, j) => (
                            <div
                                key={j}
                                className={`shrink-0 flex items-center justify-center pt-1 text-[14px] font-mono font-medium transition-colors ${
                                    hovered?.j === j ? 'text-wallstreet-text' : 'text-wallstreet-500'
                                }`}
                                style={{ width: CELL_SIZE + 2 }}
                                title={ticker}
                            >
                                {formatTickerLabel(ticker)}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </>
    );

    return noWrapper ? inner : (
        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
            {inner}
        </div>
    );
};

const HeatmapSkeleton = () => (
    <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
        <div className="h-4 w-40 bg-wallstreet-700 rounded animate-pulse mb-4" />
        <div className="flex justify-center">
            <div className="grid grid-cols-8 gap-1">
                {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i} className="w-8 h-8 bg-wallstreet-700 rounded animate-pulse" />
                ))}
            </div>
        </div>
    </div>
);
