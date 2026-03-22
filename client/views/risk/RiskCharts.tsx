import React, { useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell, Customized, ReferenceLine } from 'recharts';
import { SectorRisk } from '../../types';
import { useThemeColors } from '../../hooks/useThemeColors';

interface RiskBarDataPoint {
    ticker: string;
    riskPct: number;
    weight: number;
    delta: number;
    beta?: number;
    mctr?: number;
    individualVol?: number;
    annualizedReturn?: number;
    riskAdjustedReturn?: number;
}

interface ScatterDataPoint {
    ticker: string;
    x: number;
    y: number;
}

interface RiskChartsProps {
    loading: boolean;
    riskBarData: RiskBarDataPoint[];
    scatterData: ScatterDataPoint[];
    sectorRisk: SectorRisk[];
    correlationMatrix?: { tickers: string[]; matrix: number[][] };
}

export const RiskCharts: React.FC<RiskChartsProps> = ({
    loading,
    riskBarData,
    scatterData,
    sectorRisk,
    correlationMatrix,
}) => {
    const tc = useThemeColors();

    // Treemap layout algorithm
    const treemapLayout = (
        data: Array<{ name: string; weight: number; riskRatio: number; riskPct: number; beta?: number; mctr?: number; individualVol?: number; annualizedReturn?: number; riskAdjustedReturn?: number }>,
        width: number,
        height: number
    ): Array<{ data: typeof data[0]; x: number; y: number; w: number; h: number }> => {
        const result: Array<{ data: typeof data[0]; x: number; y: number; w: number; h: number }> = [];
        const totalValue = data.reduce((sum, d) => sum + d.weight, 0);
        if (totalValue === 0) return result;

        // Simple row-based layout
        let y = 0;
        let rowHeight = Math.sqrt((width * height) / totalValue);
        let rowData: typeof data = [];
        let rowWidth = 0;

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            const ratio = item.weight / totalValue;
            const itemWidth = (ratio * width * height) / rowHeight;

            if (rowWidth + itemWidth > width * 0.95 && rowData.length > 0) {
                // New row
                let x = 0;
                const actualRowHeight = (rowData.reduce((sum, d) => sum + d.weight, 0) / totalValue * width * height) / rowWidth;
                for (const d of rowData) {
                    const itemW = (d.weight / totalValue * width * height) / actualRowHeight;
                    result.push({ data: d, x, y, w: itemW, h: actualRowHeight });
                    x += itemW;
                }
                y += actualRowHeight;
                rowData = [item];
                rowWidth = itemWidth;
            } else {
                rowData.push(item);
                rowWidth += itemWidth;
            }
        }

        // Last row
        if (rowData.length > 0) {
            let x = 0;
            const actualRowHeight = (rowData.reduce((sum, d) => sum + d.weight, 0) / totalValue * width * height) / rowWidth;
            for (const d of rowData) {
                const itemW = (d.weight / totalValue * width * height) / actualRowHeight;
                result.push({ data: d, x, y, w: itemW, h: actualRowHeight });
                x += itemW;
            }
        }

        return result;
    };

    // RiskTreemap sub-component
    const RiskTreemap: React.FC<{ data: typeof treemapData }> = ({ data: treemapData }) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
        const width = 300;
        const height = 350;

        const layout = useMemo(() => treemapLayout(treemapData, width, height), [treemapData]);

        return (
            <div ref={containerRef} className="relative w-full h-[350px] bg-wallstreet-900 rounded overflow-hidden">
                <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="absolute inset-0">
                    {layout.map((item, idx) => (
                        <g
                            key={idx}
                            onMouseEnter={() => setHoveredIdx(idx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            style={{ cursor: 'pointer' }}
                        >
                            <rect
                                x={item.x}
                                y={item.y}
                                width={item.w}
                                height={item.h}
                                fill={getRiskRatioColor(item.data.riskRatio)}
                                stroke={tc.gridStrokeLight}
                                strokeWidth={2}
                                opacity={hoveredIdx === idx ? 1 : 0.85}
                            />
                            {item.w > 40 && item.h > 30 && (
                                <>
                                    <text
                                        x={item.x + item.w / 2}
                                        y={item.y + item.h / 2 - 8}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={11}
                                        fontWeight="bold"
                                        fontFamily="JetBrains Mono, monospace"
                                        fill={tc.tooltipText}
                                    >
                                        {item.data.name}
                                    </text>
                                    <text
                                        x={item.x + item.w / 2}
                                        y={item.y + item.h / 2 + 8}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={9}
                                        fontFamily="JetBrains Mono, monospace"
                                        fill={tc.tickFill}
                                    >
                                        {item.data.riskRatio.toFixed(2)}x
                                    </text>
                                </>
                            )}
                        </g>
                    ))}
                </svg>

                {/* Tooltip */}
                {hoveredIdx !== null && layout[hoveredIdx] && (
                    <div className="fixed bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-lg text-xs font-mono z-50 pointer-events-none"
                        style={{
                            left: `${layout[hoveredIdx].x + layout[hoveredIdx].w / 2}px`,
                            top: `${layout[hoveredIdx].y - 10}px`,
                            transform: 'translate(-50%, -100%)',
                            minWidth: '200px'
                        }}>
                        <div className="font-bold text-wallstreet-text text-sm border-b border-wallstreet-700 pb-2 mb-2">{layout[hoveredIdx].data.name}</div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between gap-6"><span className="text-wallstreet-500">Risk %</span><span className="font-bold text-red-600">{layout[hoveredIdx].data.riskPct.toFixed(2)}%</span></div>
                            <div className="flex justify-between gap-6"><span className="text-wallstreet-500">Weight %</span><span className="font-bold text-blue-600">{layout[hoveredIdx].data.weight.toFixed(2)}%</span></div>
                            <div className="flex justify-between gap-6"><span className="text-wallstreet-500">Risk/Weight</span><span className={`font-bold ${layout[hoveredIdx].data.riskRatio > 1 ? 'text-red-600' : 'text-green-600'}`}>{layout[hoveredIdx].data.riskRatio.toFixed(2)}x</span></div>
                            {layout[hoveredIdx].data.beta !== undefined && <div className="flex justify-between gap-6"><span className="text-wallstreet-500">Beta</span><span className="font-bold">{layout[hoveredIdx].data.beta.toFixed(2)}</span></div>}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Treemap data: sized by weight, colored by risk ratio
    const treemapData = useMemo(() => {
        return riskBarData.map(p => {
            const ratio = p.weight > 0 ? p.riskPct / p.weight : 1;
            return {
                name: p.ticker,
                value: Math.max(0.5, p.weight), // ensure non-zero for treemap
                riskRatio: ratio,
                riskPct: p.riskPct,
                weight: p.weight,
                beta: p.beta,
                mctr: p.mctr,
                individualVol: p.individualVol,
                annualizedReturn: p.annualizedReturn,
                riskAdjustedReturn: p.riskAdjustedReturn,
            };
        });
    }, [riskBarData]);

    // Color for treemap: green (diversifier) -> yellow -> red (concentrator)
    const getRiskRatioColor = (ratio: number): string => {
        const clamped = Math.max(0.25, Math.min(2.5, ratio));
        if (clamped < 1) {
            // 0.25 -> 1.0: green (#22c55e) to yellow-green
            const t = (clamped - 0.25) / 0.75;
            return `rgba(34, 197, 94, ${0.7 + t * 0.2})`;
        } else {
            // 1.0 -> 2.5: yellow-green to red (#ef4444)
            const t = (clamped - 1) / 1.5;
            const r = Math.round(34 + t * 221);
            const g = Math.round(197 - t * 57);
            const b = Math.round(94 - t * 50);
            return `rgba(${r}, ${g}, ${b}, 0.85)`;
        }
    };

    // Correlation heatmap renderer
    const CorrelationHeatmap: React.FC = () => {
        if (!correlationMatrix || correlationMatrix.tickers.length === 0) {
            return (
                <div className="h-[350px] flex items-center justify-center text-wallstreet-500">
                    No correlation data
                </div>
            );
        }

        const { tickers, matrix } = correlationMatrix;
        const n = tickers.length;
        const cellSize = Math.max(20, Math.min(28, 280 / n));
        const labelWidth = 50;
        const labelHeight = 50;
        const padding = 10;
        const width = labelWidth + n * cellSize + padding * 2;
        const height = labelHeight + n * cellSize + padding * 2;

        // Color scale: blue (-1) -> white (0) -> red (+1)
        const getHeatmapColor = (value: number): string => {
            if (value < 0) {
                // -1 to 0: blue to white
                const t = (value + 1) / 2; // 0 to 1
                const r = Math.round(59 + t * 196);
                const g = Math.round(130 + t * 125);
                const b = Math.round(246);
                return `rgb(${r}, ${g}, ${b})`;
            } else {
                // 0 to 1: white to red
                const t = value; // 0 to 1
                const r = 239;
                const g = Math.round(68 + (1 - t) * 187);
                const b = Math.round(68 + (1 - t) * 187);
                return `rgb(${r}, ${g}, ${b})`;
            }
        };

        return (
            <svg width="100%" height={Math.min(500, height)} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
                {/* Column labels (rotated) */}
                {tickers.map((ticker, j) => (
                    <g key={`col-${j}`} transform={`translate(${labelWidth + j * cellSize + cellSize / 2}, ${padding})`}>
                        <text
                            x={0}
                            y={0}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fontSize={10}
                            fontFamily="JetBrains Mono, monospace"
                            fill={tc.tooltipText}
                            transform="rotate(-45)"
                        >
                            {ticker}
                        </text>
                    </g>
                ))}

                {/* Row labels */}
                {tickers.map((ticker, i) => (
                    <text
                        key={`row-${i}`}
                        x={labelWidth - 5}
                        y={labelHeight + i * cellSize + cellSize / 2}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fontSize={10}
                        fontFamily="JetBrains Mono, monospace"
                        fill={tc.tooltipText}
                    >
                        {ticker}
                    </text>
                ))}

                {/* Heatmap cells */}
                {matrix.map((row, i) =>
                    row.map((value, j) => (
                        <g
                            key={`cell-${i}-${j}`}
                            onMouseEnter={(e) => {
                                const title = `${tickers[i]} ↔ ${tickers[j]}: ${value.toFixed(3)}`;
                                const tooltip = document.createElement('div');
                                tooltip.className = 'fixed bg-wallstreet-800 border border-wallstreet-700 rounded px-2 py-1 text-xs text-wallstreet-text font-mono z-50';
                                tooltip.textContent = title;
                                document.body.appendChild(tooltip);
                                const rect = (e.target as SVGElement).getBoundingClientRect();
                                tooltip.style.left = `${rect.left}px`;
                                tooltip.style.top = `${rect.top - 30}px`;
                                (e.target as SVGElement).setAttribute('data-tooltip-id', String(Math.random()));
                            }}
                            onMouseLeave={() => {
                                const tooltips = document.querySelectorAll('[style*="fixed"][class*="bg-wallstreet-800"]');
                                tooltips.forEach(t => t.remove());
                            }}
                        >
                            <rect
                                x={labelWidth + j * cellSize}
                                y={labelHeight + i * cellSize}
                                width={cellSize}
                                height={cellSize}
                                fill={getHeatmapColor(value)}
                                stroke={tc.gridStrokeLight}
                                strokeWidth={0.5}
                                style={{ cursor: 'pointer' }}
                            />
                            {/* Show value in cell for larger grids */}
                            {cellSize > 22 && (
                                <text
                                    x={labelWidth + j * cellSize + cellSize / 2}
                                    y={labelHeight + i * cellSize + cellSize / 2}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize={8}
                                    fontFamily="JetBrains Mono, monospace"
                                    fill={Math.abs(value) > 0.5 ? '#f8fafc' : tc.tooltipText}
                                    pointerEvents="none"
                                >
                                    {value.toFixed(2)}
                                </text>
                            )}
                        </g>
                    ))
                )}
            </svg>
        );
    };

    return (
        <>
            {/* Charts Row: Treemap, Scatter, Correlation */}
            <div className="grid gap-6" style={{ gridTemplateColumns: '2fr 1.75fr 1.25fr' }}>
                {/* Risk Treemap */}
                <div className="bg-wallstreet-800 rounded-xl border border-wallstreet-700 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider mb-1">Risk Treemap</h3>
                    <p className="text-xs text-wallstreet-500 mb-4">sized by weight · colored by risk intensity</p>
                    {loading ? (
                        <div className="h-[350px] flex items-center justify-center"><Loader2 className="animate-spin text-wallstreet-500" size={24} /></div>
                    ) : treemapData.length === 0 ? (
                        <div className="h-[350px] flex items-center justify-center text-wallstreet-500">No data</div>
                    ) : (
                        <RiskTreemap data={treemapData} colorFn={getRiskRatioColor} themeColors={tc} />
                    )}
                </div>

                {/* Weight vs Risk Scatter */}
                <div className="bg-wallstreet-800 rounded-xl border border-wallstreet-700 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider mb-1">Weight vs Risk</h3>
                    <p className="text-xs text-wallstreet-500 mb-4">above line = risk concentrator</p>
                    {loading ? (
                        <div className="h-[350px] flex items-center justify-center"><Loader2 className="animate-spin text-wallstreet-500" size={24} /></div>
                    ) : scatterData.length === 0 ? (
                        <div className="h-[350px] flex items-center justify-center text-wallstreet-500">No data</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={350}>
                            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} />
                                <XAxis type="number" dataKey="x" name="Weight" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Weight %', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                                <YAxis type="number" dataKey="y" name="Risk" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Risk %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }} />
                                <Customized component={({ xAxisMap, yAxisMap }: any) => {
                                    if (!xAxisMap || !yAxisMap) return null;
                                    const xAxis = Object.values(xAxisMap)[0] as any;
                                    const yAxis = Object.values(yAxisMap)[0] as any;
                                    if (!xAxis?.scale || !yAxis?.scale) return null;
                                    const maxVal = Math.max(...scatterData.map(d => Math.max(d.x, d.y)));
                                    const lineEnd = Math.min(xAxis.domain?.[1] ?? maxVal, yAxis.domain?.[1] ?? maxVal);
                                    return (
                                        <g>
                                            <line x1={xAxis.scale(0)} y1={yAxis.scale(0)} x2={xAxis.scale(lineEnd)} y2={yAxis.scale(lineEnd)} stroke="#94a3b8" strokeDasharray="6 4" strokeWidth={1.5} />
                                            <text x={xAxis.scale(lineEnd) + 4} y={yAxis.scale(lineEnd) - 4} fontSize={10} fill="#94a3b8">Weight = Risk</text>
                                        </g>
                                    );
                                }} />
                                <Tooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ payload }) => {
                                        if (!payload || !payload.length) return null;
                                        const d = payload[0].payload;
                                        const isRisky = d.y > d.x;
                                        return (
                                            <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-md text-xs">
                                                <p className="font-bold font-mono text-wallstreet-text">{d.ticker}</p>
                                                <p className="text-wallstreet-500">Weight: {d.x.toFixed(1)}%</p>
                                                <p className="text-wallstreet-500">Risk: {d.y.toFixed(1)}%</p>
                                                <p className={`font-medium mt-1 ${isRisky ? 'text-red-600' : 'text-green-600'}`}>
                                                    {isRisky ? 'Risk exceeds weight' : 'Diversifier'}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Scatter data={scatterData}>
                                    {scatterData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.y > entry.x ? '#ef4444' : '#22c55e'} fillOpacity={0.8} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Correlation Heatmap */}
                <div className="bg-wallstreet-800 rounded-xl border border-wallstreet-700 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider mb-1">Correlation Matrix</h3>
                    <p className="text-xs text-wallstreet-500 mb-4">pairwise return correlations</p>
                    {loading ? (
                        <div className="h-[350px] flex items-center justify-center"><Loader2 className="animate-spin text-wallstreet-500" size={24} /></div>
                    ) : (
                        <div className="h-[350px] overflow-auto">
                            <CorrelationHeatmap />
                        </div>
                    )}
                </div>
            </div>

            {/* Sector Risk Decomposition */}
            {sectorRisk.length > 0 && (
                <div className="bg-wallstreet-800 rounded-xl border border-wallstreet-700 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider mb-4">Sector Risk Decomposition</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, sectorRisk.length * 45)}>
                        <BarChart data={[...sectorRisk].sort((a, b) => b.riskContribution - a.riskContribution)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} />
                            <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="sector" width={120} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskContribution' ? 'Risk Contribution' : 'Weight']} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${tc.tooltipBorder}` }} />
                            <Legend formatter={(value) => value === 'riskContribution' ? 'Risk Contribution' : 'Sector Weight'} />
                            <Bar dataKey="riskContribution" fill="#ef4444" fillOpacity={0.8} radius={[0, 4, 4, 0]} barSize={14} />
                            <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.5} radius={[0, 4, 4, 0]} barSize={14} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </>
    );
};
