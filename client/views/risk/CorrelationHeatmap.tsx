import React, { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { correlationColor } from './riskUtils';

interface CorrelationHeatmapProps {
    correlationMatrix: { tickers: string[]; matrix: number[][] };
    loading: boolean;
    noWrapper?: boolean;
}

const CELL_SIZE = 38;

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
                        <div className="flex items-center gap-2.5">
                            <span className="text-sm font-mono font-bold text-wallstreet-500">0.0</span>
                            <div className="h-4 w-48 rounded-full overflow-hidden flex relative">
                                {Array.from({ length: 24 }).map((_, k) => (
                                    <div key={k} className="flex-1 h-full" style={{ backgroundColor: correlationColor(k / 23, tc.isDark) }} />
                                ))}
                            </div>
                            <span className="text-sm font-mono font-bold text-red-500">1.0</span>
                        </div>
                        <div className="h-6 flex items-center text-sm font-mono">
                            {hovered && hovered.i !== hovered.j ? (
                                <span className={`font-bold ${
                                    displayMatrix[hovered.i][hovered.j] > 0.7 ? 'text-red-500'
                                        : displayMatrix[hovered.i][hovered.j] < 0.3 ? 'text-blue-500'
                                            : 'text-wallstreet-text'
                                }`}>
                                    {displayTickers[hovered.i].replace('.TO','')} ↔ {displayTickers[hovered.j].replace('.TO','')} — {displayMatrix[hovered.i][hovered.j].toFixed(3)}
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
                                {displayTickers[i].replace('.TO', '')}
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
                                {ticker.replace('.TO', '')}
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
