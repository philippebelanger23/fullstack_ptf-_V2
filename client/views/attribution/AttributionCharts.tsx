import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import { TrendingUp, Layers, Info, Loader2 } from 'lucide-react';

// ── TornadoLabel ────────────────────────────────────────────────────────────

export const TornadoLabel = (props: any) => {
    const { x, y, width, height, value, payload } = props;
    // value can be absolute in some Recharts versions, so we rely on payload.value
    const realValue = payload && payload.value !== undefined ? payload.value : value;
    const isPos = realValue >= 0;
    const offset = 5;

    // Calculate visual endpoints of the bar
    // Recharts might send negative width for negative bars, or shift x.
    // robust way is to find min/max x.
    const barEnd = isPos ? Math.max(x, x + width) : Math.min(x, x + width);

    const isZero = Math.abs(realValue) < 0.005;
    const fillColor = isZero ? '#e5eaf0' : (isPos ? '#16a34a' : '#dc2626');

    return (
        <text
            x={isPos ? barEnd + offset : barEnd - offset}
            y={y + height / 2 + 1}
            fill={fillColor}
            textAnchor={isPos ? 'start' : 'end'}
            dominantBaseline="central"
            className="text-[12px] font-mono font-bold"
        >
            {realValue > 0 ? '+' : ''}{Number(realValue).toFixed(2)}%
        </text>
    );
};

// ── WaterfallChart ───────────────────────────────────────────────────────────

interface WaterfallChartProps {
    waterfallData: any[];
    waterfallDomain: [number, number];
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({ waterfallData, waterfallDomain }) => (
    <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
        <div className="mb-4">
            <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2"><TrendingUp size={16} className="text-wallstreet-500" /> Return Waterfall (Top 10)</h3>
        </div>
        <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 30, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b', fontWeight: 'bold' }} interval={0} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis domain={waterfallDomain} tickFormatter={(val) => `${val.toFixed(1)}%`} tick={{ fontSize: 12, fontFamily: 'monospace', fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                                <div className="bg-white text-black text-xs p-2 rounded shadow-xl font-mono border border-wallstreet-200">
                                    <div className="font-bold border-b border-wallstreet-200 pb-1 mb-1">{d.name}</div>
                                    <div>Impact: <span className={d.delta >= 0 ? 'text-green-600' : 'text-red-600'}>{d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}%</span></div>
                                    {!d.isTotal && <div className="text-slate-500 mt-1">Cumulative: {d.value[1].toFixed(2)}%</div>}
                                </div>
                            );
                        }
                        return null;
                    }} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                        {waterfallData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        <LabelList dataKey="delta" position="top" formatter={(val: number) => Math.abs(val) > 0.001 ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : ''} style={{ fill: '#64748b', fontSize: '11px', fontWeight: 'black', fontFamily: 'monospace' }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
);

// ── SectorAttributionCharts ──────────────────────────────────────────────────

interface SectorAttributionChartsProps {
    sectorAttributionData: {
        data: any[];
        selectionDomain: [number, number];
        allocationDomain: [number, number];
        interactionDomain: [number, number];
    };
    regionFilter: 'ALL' | 'US' | 'CA';
    setRegionFilter: (region: 'ALL' | 'US' | 'CA') => void;
    benchmarkMode: 'SECTOR' | 'SP500' | 'TSX60';
    setBenchmarkMode: (mode: 'SECTOR' | 'SP500' | 'TSX60') => void;
    isAttributionLoading: boolean;
}

export const SectorAttributionCharts: React.FC<SectorAttributionChartsProps> = ({
    sectorAttributionData,
    regionFilter,
    setRegionFilter,
    benchmarkMode,
    setBenchmarkMode,
    isAttributionLoading,
}) => (
    <div className="lg:col-span-8 bg-white p-4 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col relative">
        <div className="flex justify-between items-start mb-4 border-b border-wallstreet-100 pb-2">
            <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-xs flex items-center gap-2 group/title relative">
                <Layers size={14} className="text-wallstreet-500" /> Attribution Analysis
                <Info size={11} className="text-slate-300 cursor-help" />

                {/* Consolidated Info Bubble Tooltip */}
                <div className="absolute top-full left-0 mt-2 p-4 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 w-72 invisible group-hover/title:visible z-[100] transition-all opacity-0 group-hover/title:opacity-100 font-mono text-[10px] normal-case tracking-normal">
                    <div className="space-y-3">
                        <div>
                            <span className="text-green-400 font-bold block mb-1">SELECTION EFFECT</span>
                            <p className="text-slate-300 leading-relaxed">Measures the ability to select securities that outperform their sector benchmark.</p>
                        </div>
                        <div>
                            <span className="text-blue-400 font-bold block mb-1">ALLOCATION EFFECT</span>
                            <p className="text-slate-300 leading-relaxed">Measures the impact of overweighting or underweighting sectors relative to the benchmark.</p>
                        </div>
                        <div>
                            <span className="text-amber-400 font-bold block mb-1">INTERACTION EFFECT</span>
                            <p className="text-slate-300 leading-relaxed">The combined effect of selection and allocation decisions. Positive when overweighting winners or underweighting losers.</p>
                        </div>
                    </div>
                </div>
            </h3>
            <div className="flex items-center gap-2">
                <div className="flex p-0.5 bg-wallstreet-200 rounded-lg">
                    {(['SECTOR', 'SP500', 'TSX60'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setBenchmarkMode(mode)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                                benchmarkMode === mode
                                    ? 'bg-white text-wallstreet-accent shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
                <div className="flex p-0.5 bg-wallstreet-200 rounded-lg">
                    {(['ALL', 'US', 'CA'] as const).map(region => (
                        <button
                            key={region}
                            onClick={() => setRegionFilter(region)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                                regionFilter === region
                                    ? 'bg-white text-wallstreet-accent shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text'
                            }`}
                        >
                            {region === 'ALL' ? 'Total' : region}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        {isAttributionLoading ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-wallstreet-accent" size={28} />
                    <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-widest">Loading Attribution Data</span>
                </div>
            </div>
        ) : (
        <div className="flex h-full min-h-0 w-full">
            {/* Dedicated Label Column for aligned Y-Axis */}
            <div className="w-[105px] flex flex-col shrink-0">
                <div className="h-[44px]"></div> {/* Title Spacer */}
                <div className="flex-1 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sectorAttributionData.data} layout="vertical" margin={{ top: 0, right: 0, left: 5, bottom: 0 }} barCategoryGap="20%">
                            <YAxis dataKey="displayName" type="category" width={100} tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#1e293b', fontWeight: 'bold' }} axisLine={false} tickLine={false} interval={0} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-1 flex-1 min-h-0">
                {/* SELECTION EFFECT */}
                <div className="flex flex-col">
                    <div className="mb-4 relative w-full text-center">
                        <span className="text-[12px] font-mono font-black text-slate-700 uppercase tracking-wider inline-block">Selection</span>
                    </div>
                    <div className="flex-1 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={sectorAttributionData.data}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                                <XAxis type="number" domain={sectorAttributionData.selectionDomain} hide />
                                <YAxis dataKey="displayName" type="category" hide />
                                <Tooltip content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        const hasHoldings = d.portfolioWeight > 0.001;
                                        return (
                                            <div className="bg-white p-4 rounded-lg shadow-xl border border-wallstreet-200 font-mono text-[12px] z-50 min-w-[220px]">
                                                <div className="font-bold border-b pb-2 mb-2 uppercase text-[13px]">{d.displayName} Selection</div>
                                                {!hasHoldings ? (
                                                    <div className="text-slate-400 italic text-[11px] py-2">No holdings in this sector — selection effect is zero.</div>
                                                ) : (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Selection:</span>
                                                        <span className={`font-bold ${d.selectionEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.selectionEffect > 0 ? '+' : ''}{d.selectionEffect.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Portfolio Return:</span>
                                                        <span className="font-bold">{d.portfolioReturn.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Bench Return ({d.benchmarkETF}):</span>
                                                        <span className="font-bold">{d.benchmarkReturn.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Benchmark Weight:</span>
                                                        <span className="font-bold text-blue-600">{d.benchmarkWeight.toFixed(2)}%</span>
                                                    </div>
                                                </div>
                                                )}
                                                {hasHoldings && d.stocks.length > 0 && (
                                                <div className="border-t mt-3 pt-2">
                                                    <div className="text-[10px] text-slate-400 mb-2 uppercase text-center font-bold">Key Drivers (Selection):</div>
                                                    {[...d.stocks].sort((a: any, b: any) => Math.abs(b.selectionContribution) - Math.abs(a.selectionContribution)).slice(0, 3).map((s: any, idx: number) => (
                                                        <div key={idx} className="flex justify-between gap-4 py-1 text-[10px]">
                                                            <span className="font-bold">{s.ticker}</span>
                                                            <div className="text-right">
                                                                <span className={s.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                    {s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(1)}%
                                                                </span>
                                                                <span className="text-slate-400 ml-1">
                                                                    ({s.selectionContribution >= 0 ? '+' : ''}{s.selectionContribution.toFixed(2)}%)
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1} />
                                <Bar dataKey="selectionEffect" radius={[2, 2, 2, 2]}>
                                    {sectorAttributionData.data.map((entry, index) => (
                                        <Cell key={`cell-s-${index}`} fill={entry.selectionEffect >= 0 ? '#22c55e' : '#ef4444'} />
                                    ))}
                                    <LabelList dataKey="selectionEffect" content={TornadoLabel} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ALLOCATION EFFECT */}
                <div className="flex flex-col border-l border-wallstreet-100">
                    <div className="mb-4 relative w-full text-center">
                        <span className="text-[12px] font-mono font-black text-slate-700 uppercase tracking-wider inline-block">Allocation</span>
                    </div>
                    {benchmarkMode !== 'SECTOR' ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center px-4">
                                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1">N/A</div>
                                <div className="text-[9px] font-mono text-slate-300 leading-tight">Allocation effect is always zero<br/>vs a single broad index</div>
                            </div>
                        </div>
                    ) : (
                    <div className="flex-1 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={sectorAttributionData.data}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                                <XAxis type="number" domain={sectorAttributionData.allocationDomain} hide />
                                <YAxis dataKey="displayName" type="category" hide />
                                <Tooltip content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div className="bg-white p-4 rounded-lg shadow-xl border border-wallstreet-200 font-mono text-[12px] z-50 min-w-[220px]">
                                                <div className="font-bold border-b pb-2 mb-2 uppercase text-[13px]">{d.displayName} Allocation</div>
                                                <div className="space-y-1.5 text-[12px]">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Allocation:</span>
                                                        <span className={`font-bold ${d.allocationEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.allocationEffect > 0 ? '+' : ''}{d.allocationEffect.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Portfolio Weight:</span>
                                                        <span className="font-bold text-wallstreet-text">{d.portfolioWeight.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Benchmark Weight:</span>
                                                        <span className="font-bold text-blue-600">{d.benchmarkWeight.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Bench Return ({d.benchmarkETF}):</span>
                                                        <span className="font-bold">{d.benchmarkReturn.toFixed(2)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1} />
                                <Bar dataKey="allocationEffect" radius={[2, 2, 2, 2]}>
                                    {sectorAttributionData.data.map((entry, index) => (
                                        <Cell key={`cell-a-${index}`} fill={entry.allocationEffect >= 0 ? '#22c55e' : '#ef4444'} />
                                    ))}
                                    <LabelList dataKey="allocationEffect" content={TornadoLabel} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    )}
                </div>


                {/* INTERACTION EFFECT */}
                <div className="flex flex-col border-l border-wallstreet-100">
                    <div className="mb-4 relative w-full text-center">
                        <span className="text-[12px] font-mono font-black text-slate-700 uppercase tracking-wider inline-block">Interaction</span>
                    </div>
                    <div className="flex-1 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={sectorAttributionData.data}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                                <XAxis type="number" domain={sectorAttributionData.interactionDomain} hide />
                                <YAxis dataKey="displayName" type="category" hide />
                                <Tooltip content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        const hasHoldings = d.portfolioWeight > 0.001;
                                        return (
                                            <div className="bg-white p-4 rounded-lg shadow-xl border border-wallstreet-200 font-mono text-[12px] z-50 min-w-[220px]">
                                                <div className="font-bold border-b pb-2 mb-2 uppercase text-[13px]">{d.displayName} Interaction</div>
                                                {!hasHoldings ? (
                                                    <div className="text-slate-400 italic text-[11px] py-2">No holdings in this sector — interaction effect is zero.</div>
                                                ) : (
                                                <div className="space-y-1.5 text-[12px]">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-500">Interaction:</span>
                                                        <span className={`font-bold ${d.interactionEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.interactionEffect > 0 ? '+' : ''}{d.interactionEffect.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 mt-3 italic border-t pt-2">
                                                        Combined effect of selection and allocation. Usually small, but large when overweighting significant winners.
                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1} />
                                <Bar dataKey="interactionEffect" radius={[2, 2, 2, 2]}>
                                    {sectorAttributionData.data.map((entry, index) => (
                                        <Cell key={`cell-i-${index}`} fill={entry.interactionEffect >= 0 ? '#22c55e' : '#ef4444'} />
                                    ))}
                                    <LabelList dataKey="interactionEffect" content={TornadoLabel} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
        )}
    </div>
);
