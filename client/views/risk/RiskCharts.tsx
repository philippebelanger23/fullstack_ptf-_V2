import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ScatterChart, Scatter, Cell, Customized, ReferenceLine,
} from 'recharts';
import { SectorRisk } from '../../types';
import { useThemeColors } from '../../hooks/useThemeColors';

/* ── Types ─────────────────────────────────────────────── */

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

/* ── Correlation Heatmap (standalone) ──────────────────── */

const CORR_COLORS = {
    // Strong diverging scale: blue → neutral → red
    interpolate(value: number, isDark: boolean): string {
        const v = Math.max(-1, Math.min(1, value));
        if (v < 0) {
            const t = (v + 1); // 0..1
            if (isDark) {
                return `rgb(${Math.round(30 + t * 30)}, ${Math.round(64 + t * 70)}, ${Math.round(175 + t * 40)})`;
            }
            return `rgb(${Math.round(37 + t * 180)}, ${Math.round(99 + t * 130)}, ${Math.round(235 + t * 20)})`;
        } else {
            const t = v; // 0..1
            if (isDark) {
                return `rgb(${Math.round(60 + t * 150)}, ${Math.round(134 - t * 100)}, ${Math.round(215 - t * 175)})`;
            }
            return `rgb(${Math.round(255 - t * 35)}, ${Math.round(228 - t * 170)}, ${Math.round(228 - t * 170)})`;
        }
    },
};

const CorrelationHeatmap: React.FC<{
    correlationMatrix: { tickers: string[]; matrix: number[][] };
}> = ({ correlationMatrix }) => {
    const tc = useThemeColors();
    const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);

    const { tickers, matrix } = correlationMatrix;
    const n = tickers.length;
    // Cap display at 12 for readability
    const maxShow = Math.min(n, 12);
    const displayTickers = tickers.slice(0, maxShow);
    const displayMatrix = matrix.slice(0, maxShow).map(row => row.slice(0, maxShow));

    return (
        <div className="w-full">
            {/* Column headers */}
            <div className="flex ml-[72px]">
                {displayTickers.map((ticker, j) => (
                    <div
                        key={j}
                        className="flex-1 text-center text-[10px] font-mono font-medium text-wallstreet-500 truncate px-0.5 pb-1"
                        title={ticker}
                    >
                        {ticker.replace('.TO', '')}
                    </div>
                ))}
            </div>

            {/* Grid rows */}
            {displayMatrix.map((row, i) => (
                <div key={i} className="flex items-center">
                    {/* Row label */}
                    <div className="w-[72px] shrink-0 text-right pr-2 text-[10px] font-mono font-medium text-wallstreet-500 truncate" title={displayTickers[i]}>
                        {displayTickers[i].replace('.TO', '')}
                    </div>
                    {/* Cells */}
                    {row.map((value, j) => {
                        const isHov = hovered?.i === i && hovered?.j === j;
                        const isRowOrCol = hovered !== null && (hovered.i === i || hovered.j === j);
                        return (
                            <div
                                key={j}
                                className={`flex-1 aspect-square flex items-center justify-center cursor-pointer transition-all duration-100 border ${
                                    isHov
                                        ? 'border-wallstreet-text z-10 scale-110'
                                        : isRowOrCol
                                            ? 'border-wallstreet-700/50'
                                            : 'border-transparent'
                                }`}
                                style={{ backgroundColor: CORR_COLORS.interpolate(value, tc.isDark) }}
                                onMouseEnter={() => setHovered({ i, j })}
                                onMouseLeave={() => setHovered(null)}
                                title={`${displayTickers[i]} ↔ ${displayTickers[j]}: ${value.toFixed(3)}`}
                            >
                                <span className={`text-[9px] font-mono font-semibold ${
                                    Math.abs(value) > 0.55
                                        ? 'text-white'
                                        : tc.isDark ? 'text-slate-300' : 'text-slate-600'
                                }`}>
                                    {i === j ? '' : value.toFixed(2)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}

            {/* Hovered pair detail */}
            {hovered && (
                <div className="mt-3 px-1 flex items-center justify-between text-xs font-mono">
                    <span className="text-wallstreet-500">
                        {displayTickers[hovered.i]} ↔ {displayTickers[hovered.j]}
                    </span>
                    <span className={`font-bold ${
                        displayMatrix[hovered.i][hovered.j] > 0.7 ? 'text-red-500'
                            : displayMatrix[hovered.i][hovered.j] < 0.3 ? 'text-blue-500'
                                : 'text-wallstreet-text'
                    }`}>
                        {displayMatrix[hovered.i][hovered.j].toFixed(3)}
                    </span>
                </div>
            )}

            {/* Legend */}
            <div className="mt-2 flex items-center gap-2 justify-center">
                <span className="text-[10px] font-mono text-wallstreet-500">-1.0</span>
                <div className="h-2.5 w-32 rounded-full overflow-hidden flex">
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex-1 h-full"
                            style={{ backgroundColor: CORR_COLORS.interpolate((i / 19) * 2 - 1, tc.isDark) }}
                        />
                    ))}
                </div>
                <span className="text-[10px] font-mono text-wallstreet-500">+1.0</span>
            </div>
        </div>
    );
};

/* ── Custom Tooltip (shared) ──────────────────────────── */

const RiskBarTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as RiskBarDataPoint;
    const ratio = d.weight > 0 ? d.riskPct / d.weight : null;
    const isConcentrated = ratio !== null && ratio > 1;

    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-lg text-xs font-mono min-w-[200px]">
            <div className="font-bold text-wallstreet-text text-sm border-b border-wallstreet-700 pb-2 mb-2">{d.ticker}</div>
            <div className="space-y-1.5">
                <div className="flex justify-between gap-6">
                    <span className="text-wallstreet-500">Risk %</span>
                    <span className="font-bold text-red-500">{d.riskPct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between gap-6">
                    <span className="text-wallstreet-500">Weight %</span>
                    <span className="font-bold text-blue-500">{d.weight.toFixed(2)}%</span>
                </div>
                {ratio !== null && (
                    <div className="flex justify-between gap-6">
                        <span className="text-wallstreet-500">Risk / Weight</span>
                        <span className={`font-bold ${isConcentrated ? 'text-red-500' : 'text-green-500'}`}>{ratio.toFixed(2)}x</span>
                    </div>
                )}
                {d.beta != null && (
                    <div className="flex justify-between gap-6">
                        <span className="text-wallstreet-500">Beta</span>
                        <span className="font-bold text-wallstreet-text">{d.beta.toFixed(2)}</span>
                    </div>
                )}
                {d.individualVol != null && (
                    <div className="flex justify-between gap-6">
                        <span className="text-wallstreet-500">Volatility</span>
                        <span className="font-bold text-wallstreet-text">{d.individualVol.toFixed(1)}%</span>
                    </div>
                )}
                {d.riskAdjustedReturn != null && (
                    <div className="flex justify-between gap-6">
                        <span className="text-wallstreet-500">Risk-Adj Ret</span>
                        <span className={`font-bold ${d.riskAdjustedReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {d.riskAdjustedReturn.toFixed(2)}
                        </span>
                    </div>
                )}
            </div>
            {isConcentrated && (
                <div className="mt-2 pt-2 border-t border-wallstreet-700 text-red-400 text-[10px]">
                    Disproportionate risk contributor
                </div>
            )}
        </div>
    );
};

/* ── Main Component ───────────────────────────────────── */

export const RiskCharts: React.FC<RiskChartsProps> = ({
    loading,
    riskBarData,
    scatterData,
    sectorRisk,
    correlationMatrix,
}) => {
    const tc = useThemeColors();
    const [barChartMode, setBarChartMode] = useState<'absolute' | 'ratio'>('absolute');

    const ratioBarData = useMemo(() => {
        return riskBarData
            .filter(p => p.weight > 0)
            .map(p => ({ ticker: p.ticker, ratio: +(p.riskPct / p.weight).toFixed(2) }))
            .sort((a, b) => b.ratio - a.ratio);
    }, [riskBarData]);

    const displayBarData = barChartMode === 'absolute' ? riskBarData.slice(0, 12) : ratioBarData.slice(0, 12);
    const hasCorrelation = correlationMatrix && correlationMatrix.tickers.length > 0;
    const hasSectors = sectorRisk.length > 0;

    /* ── Loader ── */
    const ChartLoader = () => (
        <div className="h-full min-h-[300px] flex items-center justify-center">
            <Loader2 className="animate-spin text-wallstreet-500" size={24} />
        </div>
    );

    return (
        <>
            {/* ── Row 1: Bar Chart + Scatter ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Risk Contribution vs Weight */}
                <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Risk Contribution vs Weight</h3>
                            <p className="text-[11px] text-wallstreet-500 mt-0.5">
                                Top 12 of {riskBarData.length} positions
                            </p>
                        </div>
                        <div className="flex items-center bg-wallstreet-900 rounded-lg p-0.5">
                            {(['absolute', 'ratio'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setBarChartMode(mode)}
                                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${
                                        barChartMode === mode
                                            ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                            : 'text-wallstreet-500 hover:text-wallstreet-text'
                                    }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? <ChartLoader /> : displayBarData.length === 0 ? (
                        <div className="h-[350px] flex items-center justify-center text-wallstreet-500 text-sm">No data</div>
                    ) : barChartMode === 'absolute' ? (
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart
                                data={riskBarData.slice(0, 12)}
                                layout="vertical"
                                margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} horizontal={false} />
                                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="ticker" width={65} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                <Tooltip content={<RiskBarTooltip />} cursor={{ fill: tc.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }} />
                                <Legend
                                    formatter={v => v === 'riskPct' ? 'Risk Contribution' : 'Portfolio Weight'}
                                    wrapperStyle={{ fontSize: 11, fontFamily: 'Inter' }}
                                />
                                <Bar dataKey="riskPct" fill="#ef4444" fillOpacity={0.85} radius={[0, 4, 4, 0]} barSize={11} name="riskPct" />
                                <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.55} radius={[0, 4, 4, 0]} barSize={11} name="weight" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart
                                data={ratioBarData.slice(0, 12)}
                                layout="vertical"
                                margin={{ left: 0, right: 30, top: 5, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} horizontal={false} />
                                <XAxis type="number" tickFormatter={v => `${v}x`} tick={{ fontSize: 11, fill: tc.tickFill }} domain={[0, 'auto']} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="ticker" width={65} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value: number) => [`${value.toFixed(2)}x`, 'Risk / Weight']}
                                    contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${tc.tooltipBorder}`, backgroundColor: tc.tooltipBgSolid }}
                                />
                                <ReferenceLine x={1} stroke={tc.referenceLine} strokeDasharray="6 4" label={{ value: '1.0x fair share', position: 'top', fontSize: 10, fill: tc.tickFill }} />
                                <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={13}>
                                    {ratioBarData.slice(0, 12).map((entry, idx) => (
                                        <Cell key={idx} fill={entry.ratio > 1 ? '#ef4444' : '#22c55e'} fillOpacity={0.85} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Weight vs Risk Scatter */}
                <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Weight vs Risk</h3>
                        <p className="text-[11px] text-wallstreet-500 mt-0.5">Above line = disproportionate risk contributor</p>
                    </div>

                    {loading ? <ChartLoader /> : scatterData.length === 0 ? (
                        <div className="h-[350px] flex items-center justify-center text-wallstreet-500 text-sm">No data</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={350}>
                            <ScatterChart margin={{ left: -5, right: 20, top: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} />
                                <XAxis
                                    type="number" dataKey="x" name="Weight" unit="%"
                                    tick={{ fontSize: 11, fill: tc.tickFill }}
                                    axisLine={false} tickLine={false}
                                    label={{ value: 'Weight %', position: 'insideBottom', offset: -5, fontSize: 11, fill: tc.tickFill }}
                                />
                                <YAxis
                                    type="number" dataKey="y" name="Risk" unit="%"
                                    tick={{ fontSize: 11, fill: tc.tickFill }}
                                    axisLine={false} tickLine={false}
                                    label={{ value: 'Risk Contribution %', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, fill: tc.tickFill }}
                                />
                                <Customized component={({ xAxisMap, yAxisMap }: any) => {
                                    if (!xAxisMap || !yAxisMap) return null;
                                    const xAxis = Object.values(xAxisMap)[0] as any;
                                    const yAxis = Object.values(yAxisMap)[0] as any;
                                    if (!xAxis?.scale || !yAxis?.scale) return null;
                                    const maxVal = Math.max(...scatterData.map(d => Math.max(d.x, d.y)));
                                    const lineEnd = Math.min(xAxis.domain?.[1] ?? maxVal, yAxis.domain?.[1] ?? maxVal);
                                    return (
                                        <g>
                                            <line
                                                x1={xAxis.scale(0)} y1={yAxis.scale(0)}
                                                x2={xAxis.scale(lineEnd)} y2={yAxis.scale(lineEnd)}
                                                stroke={tc.referenceLine} strokeDasharray="6 4" strokeWidth={1.5}
                                            />
                                            <text x={xAxis.scale(lineEnd) + 4} y={yAxis.scale(lineEnd) - 6} fontSize={9} fill={tc.tickFill} fontFamily="Inter">
                                                Weight = Risk
                                            </text>
                                        </g>
                                    );
                                }} />
                                <Tooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ payload }) => {
                                        if (!payload?.length) return null;
                                        const d = payload[0].payload;
                                        const isRisky = d.y > d.x;
                                        return (
                                            <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-lg text-xs font-mono">
                                                <p className="font-bold text-wallstreet-text mb-1">{d.ticker}</p>
                                                <p className="text-wallstreet-500">Weight: {d.x.toFixed(1)}%</p>
                                                <p className="text-wallstreet-500">Risk: {d.y.toFixed(1)}%</p>
                                                <p className={`font-medium mt-1.5 ${isRisky ? 'text-red-500' : 'text-green-500'}`}>
                                                    {isRisky ? 'Risk exceeds weight' : 'Diversifier'}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Scatter data={scatterData}>
                                    {scatterData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.y > entry.x ? '#ef4444' : '#22c55e'} fillOpacity={0.75} r={6} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* ── Row 2: Correlation + Sectors ── */}
            {(hasCorrelation || hasSectors) && (
                <div className={`grid gap-6 ${hasCorrelation && hasSectors ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>

                    {/* Correlation Matrix */}
                    {hasCorrelation && (
                        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
                            <div className="mb-4">
                                <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Correlation Matrix</h3>
                                <p className="text-[11px] text-wallstreet-500 mt-0.5">Pairwise return correlations (1Y daily)</p>
                            </div>
                            {loading ? <ChartLoader /> : (
                                <CorrelationHeatmap correlationMatrix={correlationMatrix!} />
                            )}
                        </div>
                    )}

                    {/* Sector Risk Decomposition */}
                    {hasSectors && (
                        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
                            <div className="mb-4">
                                <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Sector Risk Decomposition</h3>
                                <p className="text-[11px] text-wallstreet-500 mt-0.5">Risk contribution vs allocation by sector</p>
                            </div>
                            {loading ? <ChartLoader /> : (
                                <ResponsiveContainer width="100%" height={Math.max(250, sectorRisk.length * 40)}>
                                    <BarChart
                                        data={[...sectorRisk].sort((a, b) => b.riskContribution - a.riskContribution)}
                                        layout="vertical"
                                        margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} horizontal={false} />
                                        <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="sector" width={100} tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskContribution' ? 'Risk Contribution' : 'Weight']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${tc.tooltipBorder}`, backgroundColor: tc.tooltipBgSolid }}
                                        />
                                        <Legend
                                            formatter={v => v === 'riskContribution' ? 'Risk Contribution' : 'Sector Weight'}
                                            wrapperStyle={{ fontSize: 11, fontFamily: 'Inter' }}
                                        />
                                        <Bar dataKey="riskContribution" fill="#ef4444" fillOpacity={0.85} radius={[0, 4, 4, 0]} barSize={13} />
                                        <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.55} radius={[0, 4, 4, 0]} barSize={13} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
};
