import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useThemeColors } from '../../hooks/useThemeColors';
import { RiskBarDataPoint } from './riskUtils';
import { SectorRisk, RiskPosition } from '../../types';

interface RiskBarChartProps {
    riskBarData: RiskBarDataPoint[];
    sectorRisk?: SectorRisk[];
    positions?: RiskPosition[];
    loading: boolean;
}

/* ── Shared helpers ── */
const SHORT_SECTOR: Record<string, string> = {
    'Basic Materials': 'Basic\nMaterials',
    'Consumer Cyclical': 'Cons.\nCyclical',
    'Consumer Defensive': 'Cons.\nDefensive',
    'Communication Services': 'Comm.\nServices',
    'Financial Services': 'Financial\nServices',
    'Health Care': 'Health\nCare',
    'Real Estate': 'Real\nEstate',
};

const MultiLineTick = ({ x, y, payload, fill, fontSize = 9 }: any) => {
    const label = SHORT_SECTOR[payload.value] ?? payload.value;
    const lines = label.split('\n');
    return (
        <text x={x} y={y + 6} textAnchor="middle" fill={fill} fontSize={fontSize} fontWeight="600">
            {lines.map((line: string, i: number) => (
                <tspan key={i} x={x} dy={i === 0 ? 0 : fontSize + 2}>{line}</tspan>
            ))}
        </text>
    );
};

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
    <div className="flex justify-between gap-6">
        <span className="text-wallstreet-500">{label}</span>
        <span className={`font-bold ${color || 'text-wallstreet-text'}`}>{value}</span>
    </div>
);

/* ── Position tooltip ── */
const RiskBarTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as RiskBarDataPoint;
    const ratio = d.weight > 0 ? d.riskPct / d.weight : null;
    const isConcentrated = ratio !== null && ratio > 1;
    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-xl text-xs font-mono min-w-[210px]">
            <div className="font-bold text-wallstreet-text text-sm border-b border-wallstreet-700 pb-2 mb-2">{d.ticker}</div>
            <div className="space-y-1.5">
                <Row label="Risk %" value={`${d.riskPct.toFixed(2)}%`} color="text-red-500" />
                <Row label="Weight %" value={`${d.weight.toFixed(2)}%`} color="text-blue-500" />
                {ratio !== null && (
                    <Row label="Risk / Weight" value={`${ratio.toFixed(2)}x`} color={isConcentrated ? 'text-red-500' : 'text-green-500'} />
                )}
                {d.beta != null && <Row label="Beta" value={d.beta.toFixed(2)} />}
                {d.individualVol != null && <Row label="Volatility" value={`${d.individualVol.toFixed(1)}%`} />}
                {d.riskAdjustedReturn != null && (
                    <Row label="Risk-Adj Ret" value={d.riskAdjustedReturn.toFixed(2)} color={d.riskAdjustedReturn >= 0 ? 'text-green-500' : 'text-red-500'} />
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

/* ── Sector tooltip ── */
const SectorTooltip = ({ payload, positions }: { payload?: any[]; positions: RiskPosition[] }) => {
    if (!payload?.length) return null;
    const d = payload[0].payload as SectorRisk & { delta: number };
    const sectorPositions = positions
        .filter(p => p.sector === d.sector)
        .sort((a, b) => b.pctOfTotalRisk - a.pctOfTotalRisk);
    const topDrivers = sectorPositions.slice(0, 5);
    const avgBeta = sectorPositions.length
        ? sectorPositions.reduce((s, p) => s + p.beta, 0) / sectorPositions.length : null;
    const avgVol = sectorPositions.length
        ? sectorPositions.reduce((s, p) => s + p.individualVol, 0) / sectorPositions.length : null;
    const deltaPositive = d.delta > 0;
    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-2xl text-xs font-mono min-w-[220px]" style={{ maxWidth: 260 }}>
            <div className="px-4 py-2.5 border-b border-wallstreet-700">
                <p className="font-bold text-wallstreet-text uppercase tracking-wider text-[11px]">{d.sector}</p>
                <p className="text-wallstreet-500 text-[10px] mt-0.5">{sectorPositions.length} position{sectorPositions.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="px-4 py-2.5 border-b border-wallstreet-700 space-y-1.5">
                <div className="flex justify-between items-center">
                    <span className="text-wallstreet-500">Risk Contribution</span>
                    <span className="text-red-400 font-bold">{d.riskContribution.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-wallstreet-500">Portfolio Weight</span>
                    <span className="text-blue-400 font-bold">{d.weight.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center border-t border-wallstreet-700 pt-1.5">
                    <span className="text-wallstreet-500">Overweight Risk</span>
                    <span className={`font-bold ${deltaPositive ? 'text-red-400' : 'text-green-400'}`}>
                        {deltaPositive ? '+' : ''}{d.delta.toFixed(1)}%
                    </span>
                </div>
            </div>
            {(avgBeta !== null || avgVol !== null) && (
                <div className="px-4 py-2 border-b border-wallstreet-700 flex gap-4">
                    {avgBeta !== null && (
                        <div>
                            <p className="text-wallstreet-500 text-[9px] uppercase tracking-wider">Avg Beta</p>
                            <p className="text-wallstreet-text font-bold">{avgBeta.toFixed(2)}</p>
                        </div>
                    )}
                    {avgVol !== null && (
                        <div>
                            <p className="text-wallstreet-500 text-[9px] uppercase tracking-wider">Avg Vol</p>
                            <p className="text-wallstreet-text font-bold">{(avgVol * 100).toFixed(1)}%</p>
                        </div>
                    )}
                </div>
            )}
            {topDrivers.length > 0 && (
                <div className="px-4 py-2.5">
                    <p className="text-wallstreet-500 text-[9px] uppercase tracking-wider mb-2">Key Drivers (Risk %)</p>
                    <div className="space-y-1">
                        {topDrivers.map(p => (
                            <div key={p.ticker} className="flex justify-between items-center gap-3">
                                <span className="text-wallstreet-text font-bold">{p.ticker}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-wallstreet-500 text-[10px]">{(p.weight * 100).toFixed(1)}% wt</span>
                                    <span className="text-red-400 font-bold">{p.pctOfTotalRisk.toFixed(1)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ── Main ── */
export const RiskBarChart: React.FC<RiskBarChartProps> = ({
    riskBarData,
    sectorRisk = [],
    positions = [],
    loading,
}) => {
    const tc = useThemeColors();
    const [view, setView] = useState<'positions' | 'sectors'>('sectors');
    const [posMode, setPosMode] = useState<'absolute' | 'ratio'>('absolute');
    const [includeEtf, setIncludeEtf] = useState(false);

    /* ── Position data ── */
    const ratioData = useMemo(() =>
        riskBarData
            .filter(p => p.weight > 0)
            .map(p => ({ ...p, ratio: +(p.riskPct / p.weight).toFixed(2) }))
            .sort((a, b) => b.ratio - a.ratio),
        [riskBarData]);
    const posDisplayData = posMode === 'absolute' ? riskBarData.slice(0, 15) : ratioData.slice(0, 15);
    const posChartHeight = Math.max(300, posDisplayData.length * 28);

    /* ── Sector data ── */
    const sectorDisplayData = useMemo(() => {
        const filtered = includeEtf ? sectorRisk : sectorRisk.filter(s => s.sector !== 'Mixed');
        return [...filtered]
            .sort((a, b) => b.riskContribution - a.riskContribution)
            .map(s => ({ ...s, delta: +(s.riskContribution - s.weight).toFixed(1) }));
    }, [sectorRisk, includeEtf]);

    if (loading) return <ChartSkeleton />;

    return (
        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">
                        Risk Contribution vs Weight
                    </h3>
                    <p className="text-[11px] text-wallstreet-500 mt-0.5">
                        {view === 'positions'
                            ? (posMode === 'absolute' ? `Top ${posDisplayData.length} of ${riskBarData.length} positions` : 'Risk/weight multiplier')
                            : 'Aggregated by sector'}
                    </p>
                </div>

                {/* View toggle: Positions | Sectors */}
                <div className="flex items-center gap-2">
                    {/* ETF sub-toggle (only in sectors view) */}
                    {view === 'sectors' && (
                        <button
                            onClick={() => setIncludeEtf(v => !v)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                includeEtf
                                    ? 'bg-wallstreet-accent/20 border-wallstreet-accent text-wallstreet-accent'
                                    : 'bg-wallstreet-900 border-wallstreet-700 text-wallstreet-500 hover:text-wallstreet-text'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${includeEtf ? 'bg-wallstreet-accent' : 'bg-wallstreet-600'}`} />
                            ETF
                        </button>
                    )}

                    {/* Absolute/Ratio sub-toggle (only in positions view) */}
                    {view === 'positions' && (
                        <div className="flex items-center bg-wallstreet-900 rounded-lg p-0.5">
                            {(['absolute', 'ratio'] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setPosMode(m)}
                                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${
                                        posMode === m
                                            ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                            : 'text-wallstreet-500 hover:text-wallstreet-text'
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Main view toggle */}
                    <div className="flex items-center bg-wallstreet-900 rounded-lg p-0.5">
                        {(['positions', 'sectors'] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${
                                    view === v
                                        ? 'bg-wallstreet-accent/20 text-wallstreet-accent shadow-sm'
                                        : 'text-wallstreet-500 hover:text-wallstreet-text'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── POSITIONS view ── */}
            {view === 'positions' && (
                posDisplayData.length === 0
                    ? <div className="h-[300px] flex items-center justify-center text-wallstreet-500 text-sm">No data</div>
                    : posMode === 'absolute' ? (
                        <ResponsiveContainer width="100%" height={posChartHeight}>
                            <BarChart data={posDisplayData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} horizontal={false} />
                                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="ticker" width={65} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                <Tooltip content={<RiskBarTooltip />} cursor={{ fill: tc.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }} />
                                <Bar dataKey="riskPct" radius={[0, 4, 4, 0]} barSize={12} name="Risk %">
                                    {posDisplayData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.delta > 0 ? '#ef4444' : '#22c55e'} fillOpacity={0.85} />
                                    ))}
                                </Bar>
                                <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.35} radius={[0, 4, 4, 0]} barSize={12} name="Weight %" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <ResponsiveContainer width="100%" height={posChartHeight}>
                            <BarChart data={ratioData.slice(0, 15)} layout="vertical" margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} horizontal={false} />
                                <XAxis type="number" tickFormatter={v => `${v}x`} tick={{ fontSize: 11, fill: tc.tickFill }} domain={[0, 'auto']} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="ticker" width={65} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: tc.tickFill }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value: number) => [`${value.toFixed(2)}x`, 'Risk / Weight']}
                                    contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${tc.tooltipBorder}`, backgroundColor: tc.tooltipBgSolid }}
                                />
                                <ReferenceLine x={1} stroke={tc.referenceLine} strokeDasharray="6 4" label={{ value: '1.0x fair share', position: 'top', fontSize: 10, fill: tc.tickFill }} />
                                <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={14}>
                                    {ratioData.slice(0, 15).map((entry, idx) => (
                                        <Cell key={idx} fill={entry.ratio > 1 ? '#ef4444' : '#22c55e'} fillOpacity={0.85} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )
            )}

            {/* ── SECTORS view ── */}
            {view === 'sectors' && (
                sectorDisplayData.length === 0
                    ? <div className="h-[300px] flex items-center justify-center text-wallstreet-500 text-sm">No sector data</div>
                    : <div className="flex-1 min-h-0" style={{ minHeight: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={sectorDisplayData}
                            layout="horizontal"
                            margin={{ left: 0, right: 10, top: 5, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} vertical={false} />
                            <XAxis
                                type="category"
                                dataKey="sector"
                                height={36}
                                tick={<MultiLineTick fill={tc.tickFill} fontSize={11} />}
                                axisLine={false}
                                tickLine={false}
                                interval={0}
                            />
                            <YAxis
                                type="number"
                                tickFormatter={v => `${v}%`}
                                tick={{ fontSize: 12, fill: tc.tickFill }}
                                axisLine={false}
                                tickLine={false}
                                width={44}
                            />
                            <Tooltip content={({ payload }) => <SectorTooltip payload={payload} positions={positions} />} />
                            <Bar dataKey="riskContribution" name="Risk %" fill="#ef4444" fillOpacity={0.85} radius={[5, 5, 0, 0]} barSize={22} />
                            <Bar dataKey="weight" name="Weight %" fill="#3b82f6" fillOpacity={0.5} radius={[5, 5, 0, 0]} barSize={22} />
                        </BarChart>
                    </ResponsiveContainer>
                    </div>
            )}
        </div>
    );
};

const ChartSkeleton = () => (
    <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
        <div className="h-4 w-48 bg-wallstreet-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-14 bg-wallstreet-700 rounded animate-pulse" />
                    <div className="h-3 bg-wallstreet-700 rounded animate-pulse" style={{ width: `${70 - i * 8}%` }} />
                </div>
            ))}
        </div>
    </div>
);
