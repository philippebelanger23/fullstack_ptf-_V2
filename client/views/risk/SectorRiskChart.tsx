import React, { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from 'recharts';
import { SectorRisk, RiskPosition } from '../../types';
import { useThemeColors } from '../../hooks/useThemeColors';

interface SectorRiskChartProps {
    sectorRisk: SectorRisk[];
    positions?: RiskPosition[];
    loading: boolean;
    sectorCount?: number;
}

const SHORT_SECTOR: Record<string, string> = {
    'Basic Materials': 'Basic\nMaterials',
    'Consumer Cyclical': 'Cons.\nCyclical',
    'Consumer Defensive': 'Cons.\nDefensive',
    'Communication Services': 'Comm.\nServices',
    'Financial Services': 'Financial\nServices',
    'Health Care': 'Health\nCare',
    'Real Estate': 'Real\nEstate',
};

const MultiLineTick = ({ x, y, payload, fill }: any) => {
    const label = SHORT_SECTOR[payload.value] ?? payload.value;
    const lines = label.split('\n');
    return (
        <text x={x} y={y} textAnchor="middle" fill={fill} fontSize={9}>
            {lines.map((line: string, i: number) => (
                <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>{line}</tspan>
            ))}
        </text>
    );
};

const SectorTooltip = ({ payload, positions }: { payload?: any[]; positions: RiskPosition[] }) => {
    if (!payload?.length) return null;
    const d = payload[0].payload as SectorRisk & { delta: number };

    // Positions in this sector, sorted by pctOfTotalRisk desc
    const sectorPositions = positions
        .filter(p => p.sector === d.sector)
        .sort((a, b) => b.pctOfTotalRisk - a.pctOfTotalRisk);

    const topDrivers = sectorPositions.slice(0, 5);
    const avgBeta = sectorPositions.length
        ? sectorPositions.reduce((s, p) => s + p.beta, 0) / sectorPositions.length
        : null;
    const avgVol = sectorPositions.length
        ? sectorPositions.reduce((s, p) => s + p.individualVol, 0) / sectorPositions.length
        : null;

    const deltaPositive = d.delta > 0;

    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-2xl text-xs font-mono min-w-[220px]" style={{ maxWidth: 260 }}>
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-wallstreet-700">
                <p className="font-bold text-wallstreet-text uppercase tracking-wider text-[11px]">{d.sector}</p>
                <p className="text-wallstreet-500 text-[10px] mt-0.5">{sectorPositions.length} position{sectorPositions.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Risk / Weight summary */}
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

            {/* Avg stats */}
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

            {/* Top drivers */}
            {topDrivers.length > 0 && (
                <div className="px-4 py-2.5">
                    <p className="text-wallstreet-500 text-[9px] uppercase tracking-wider mb-2">Key Drivers (Risk %)</p>
                    <div className="space-y-1">
                        {topDrivers.map(p => (
                            <div key={p.ticker} className="flex justify-between items-center gap-3">
                                <span className="text-wallstreet-text font-bold">{p.ticker}</span>
                                <div className="flex items-center gap-2 text-right">
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

export const SectorRiskChart: React.FC<SectorRiskChartProps> = ({
    sectorRisk,
    positions = [],
    loading,
    sectorCount = 11,
}) => {
    const tc = useThemeColors();
    const [includeEtf, setIncludeEtf] = useState(false);

    if (loading) return <ChartSkeleton />;
    if (sectorRisk.length === 0) return null;

    const filtered = includeEtf
        ? sectorRisk
        : sectorRisk.filter(s => s.sector !== 'Mixed');

    const sorted = [...filtered]
        .sort((a, b) => b.riskContribution - a.riskContribution)
        .map(s => ({ ...s, delta: +(s.riskContribution - s.weight).toFixed(1) }));

    return (
        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6 h-full flex flex-col">
            {/* Header row */}
            <div className="flex items-start justify-between mb-2">
                <div>
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Sector Risk Decomposition</h3>
                    <p className="text-[11px] text-wallstreet-500 mt-0.5">Risk contribution vs allocation by sector</p>
                </div>
                {/* ETF toggle */}
                <button
                    onClick={() => setIncludeEtf(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all shrink-0 ${
                        includeEtf
                            ? 'bg-wallstreet-accent/20 border-wallstreet-accent text-wallstreet-accent'
                            : 'bg-wallstreet-900 border-wallstreet-700 text-wallstreet-500 hover:text-wallstreet-text'
                    }`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${includeEtf ? 'bg-wallstreet-accent' : 'bg-wallstreet-600'}`} />
                    ETF
                </button>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={sorted}
                        layout="horizontal"
                        margin={{ left: 0, right: 10, top: 25, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} vertical={false} />
                        <XAxis
                            type="category"
                            dataKey="sector"
                            height={40}
                            tick={<MultiLineTick fill={tc.tickFill} />}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                        />
                        <YAxis
                            type="number"
                            tickFormatter={v => `${v}%`}
                            tick={{ fontSize: 10, fill: tc.tickFill }}
                            axisLine={false}
                            tickLine={false}
                            width={40}
                        />
                        <Tooltip
                            content={({ payload }) => (
                                <SectorTooltip payload={payload} positions={positions} />
                            )}
                        />
                        <Legend
                            formatter={v => v === 'riskContribution' ? 'Risk %' : 'Weight %'}
                            wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', position: 'relative', right: 0, top: 0 }}
                            verticalAlign="top"
                            align="right"
                        />
                        <Bar dataKey="riskContribution" fill="#ef4444" fillOpacity={0.85} radius={[0, 4, 4, 0]} barSize={13} />
                        <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.5} radius={[0, 4, 4, 0]} barSize={13} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const ChartSkeleton = () => (
    <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
        <div className="h-4 w-48 bg-wallstreet-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-20 bg-wallstreet-700 rounded animate-pulse" />
                    <div className="h-3 bg-wallstreet-700 rounded animate-pulse" style={{ width: `${60 - i * 10}%` }} />
                </div>
            ))}
        </div>
    </div>
);
