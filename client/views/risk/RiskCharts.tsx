import React from 'react';
import { Loader2, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell, Customized, ReferenceLine } from 'recharts';
import { SectorRisk } from '../../types';

interface RiskBarDataPoint {
    ticker: string;
    riskPct: number;
    weight: number;
    delta: number;
}

interface RatioBarDataPoint {
    ticker: string;
    ratio: number;
}

interface ScatterDataPoint {
    ticker: string;
    x: number;
    y: number;
}

interface RiskChartsProps {
    loading: boolean;
    riskBarData: RiskBarDataPoint[];
    ratioBarData: RatioBarDataPoint[];
    scatterData: ScatterDataPoint[];
    sectorRisk: SectorRisk[];
    barChartMode: 'absolute' | 'ratio';
    setBarChartMode: (mode: 'absolute' | 'ratio') => void;
    expandedChart: boolean;
    setExpandedChart: (v: boolean) => void;
}

export const RiskCharts: React.FC<RiskChartsProps> = ({
    loading,
    riskBarData,
    ratioBarData,
    scatterData,
    sectorRisk,
    barChartMode,
    setBarChartMode,
    expandedChart,
    setExpandedChart,
}) => {
    const activeBarData = barChartMode === 'absolute' ? riskBarData : ratioBarData;

    return (
        <>
            {/* Charts Row */}
            <div className="grid grid-cols-2 gap-6">
                {/* Risk vs Weight Bar Chart */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Risk Contribution vs Weight</h3>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-slate-100 rounded-md p-0.5">
                                {(['absolute', 'ratio'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setBarChartMode(mode)}
                                        className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${barChartMode === mode
                                            ? 'bg-white text-slate-800 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                    >
                                        {mode === 'absolute' ? 'Absolute' : 'Ratio'}
                                    </button>
                                ))}
                            </div>
                            {activeBarData.length > 10 && (
                                <button
                                    onClick={() => setExpandedChart(true)}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                                    title="Expand to see all holdings"
                                >
                                    <span className="font-medium">Top 10 of {activeBarData.length}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    {loading ? (
                        <div className="h-[350px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                    ) : barChartMode === 'absolute' ? (
                        riskBarData.length === 0 ? (
                            <div className="h-[350px] flex items-center justify-center text-slate-400">No data</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={riskBarData.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="ticker" width={70} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                                    <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskPct' ? 'Risk %' : 'Weight %']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    <Legend formatter={(value) => value === 'riskPct' ? 'Risk Contribution' : 'Portfolio Weight'} />
                                    <Bar dataKey="riskPct" fill="#ef4444" fillOpacity={0.8} radius={[0, 4, 4, 0]} barSize={12} />
                                    <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.5} radius={[0, 4, 4, 0]} barSize={12} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    ) : (
                        ratioBarData.length === 0 ? (
                            <div className="h-[350px] flex items-center justify-center text-slate-400">No data</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={ratioBarData.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" tickFormatter={(v) => `${v}x`} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                                    <YAxis type="category" dataKey="ticker" width={70} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                                    <Tooltip formatter={(value: number) => [`${value.toFixed(2)}x`, 'Risk / Weight']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="6 4" label={{ value: '1.0x (fair share)', position: 'top', fontSize: 10, fill: '#94a3b8' }} />
                                    <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={14}>
                                        {ratioBarData.slice(0, 10).map((entry, idx) => (
                                            <Cell key={idx} fill={entry.ratio > 1 ? '#ef4444' : '#22c55e'} fillOpacity={0.8} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    )}
                </div>

                {/* Weight vs Risk Scatter */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">Weight vs Risk</h3>
                    <p className="text-xs text-slate-400 mb-4">Above the line = disproportionate risk contributor</p>
                    {loading ? (
                        <div className="h-[350px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                    ) : scatterData.length === 0 ? (
                        <div className="h-[350px] flex items-center justify-center text-slate-400">No data</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={350}>
                            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" dataKey="x" name="Weight" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Weight %', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                                <YAxis type="number" dataKey="y" name="Risk" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Risk Contribution %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }} />
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
                                            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-md text-xs">
                                                <p className="font-bold font-mono text-slate-800">{d.ticker}</p>
                                                <p className="text-slate-500">Weight: {d.x.toFixed(1)}%</p>
                                                <p className="text-slate-500">Risk: {d.y.toFixed(1)}%</p>
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
            </div>

            {/* Sector Risk Decomposition */}
            {sectorRisk.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Sector Risk Decomposition</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, sectorRisk.length * 45)}>
                        <BarChart data={[...sectorRisk].sort((a, b) => b.riskContribution - a.riskContribution)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="sector" width={120} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskContribution' ? 'Risk Contribution' : 'Weight']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                            <Legend formatter={(value) => value === 'riskContribution' ? 'Risk Contribution' : 'Sector Weight'} />
                            <Bar dataKey="riskContribution" fill="#ef4444" fillOpacity={0.8} radius={[0, 4, 4, 0]} barSize={14} />
                            <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.5} radius={[0, 4, 4, 0]} barSize={14} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Expanded Chart Modal */}
            {expandedChart && activeBarData.length > 0 && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8" onClick={() => setExpandedChart(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                    {barChartMode === 'absolute' ? 'Risk Contribution vs Weight' : 'Risk / Weight Ratio'}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">All {activeBarData.length} positions</p>
                            </div>
                            <button onClick={() => setExpandedChart(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6">
                            {barChartMode === 'absolute' ? (
                                <ResponsiveContainer width="100%" height={Math.max(400, riskBarData.length * 32)}>
                                    <BarChart data={riskBarData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                                        <YAxis type="category" dataKey="ticker" width={70} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                                        <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskPct' ? 'Risk %' : 'Weight %']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                        <Legend formatter={(value) => value === 'riskPct' ? 'Risk Contribution' : 'Portfolio Weight'} />
                                        <Bar dataKey="riskPct" fill="#ef4444" fillOpacity={0.8} radius={[0, 4, 4, 0]} barSize={14} />
                                        <Bar dataKey="weight" fill="#3b82f6" fillOpacity={0.5} radius={[0, 4, 4, 0]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <ResponsiveContainer width="100%" height={Math.max(400, ratioBarData.length * 32)}>
                                    <BarChart data={ratioBarData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis type="number" tickFormatter={(v) => `${v}x`} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                                        <YAxis type="category" dataKey="ticker" width={70} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                                        <Tooltip formatter={(value: number) => [`${value.toFixed(2)}x`, 'Risk / Weight']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                        <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="6 4" label={{ value: '1.0x (fair share)', position: 'top', fontSize: 10, fill: '#94a3b8' }} />
                                        <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={14}>
                                            {ratioBarData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.ratio > 1 ? '#ef4444' : '#22c55e'} fillOpacity={0.8} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
