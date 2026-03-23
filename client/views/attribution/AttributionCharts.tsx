import React, { useCallback, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import { TrendingUp, Layers, Loader2 } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';

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
            {realValue < 0 ? `(${Math.abs(realValue).toFixed(2)}%)` : `${realValue > 0 ? '+' : ''}${Number(realValue).toFixed(2)}%`}
        </text>
    );
};

// ── WaterfallChart ───────────────────────────────────────────────────────────

interface WaterfallChartProps {
    waterfallData: any[];
    waterfallDomain: [number, number];
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({ waterfallData, waterfallDomain }) => {
    const tc = useThemeColors();
    return (
    <div className="lg:col-span-4 bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
        <div className="mb-4">
            <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2"><TrendingUp size={16} className="text-wallstreet-500" /> Return Waterfall (Top 10)</h3>
        </div>
        <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 30, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStrokeLight} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'monospace', fill: tc.tickFill, fontWeight: 'bold' }} interval={0} axisLine={{ stroke: tc.gridStroke }} tickLine={false} />
                    <YAxis domain={waterfallDomain} tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(1)}%)` : `${val.toFixed(1)}%`} tick={{ fontSize: 12, fontFamily: 'monospace', fill: tc.tickFill, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: tc.isDark ? 'rgba(51,65,85,0.3)' : '#f8fafc' }} content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                                <div className="bg-wallstreet-800 text-wallstreet-text text-xs p-3 rounded-lg shadow-xl font-mono border border-wallstreet-700 min-w-[180px]">
                                    <div className="font-bold border-b border-wallstreet-700 pb-1.5 mb-1.5 text-[13px]">{d.name}</div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-wallstreet-500">Impact</span>
                                            <span className={`font-bold ${d.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.delta < 0 ? `(${Math.abs(d.delta).toFixed(2)}%)` : `${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)}%`}</span>
                                        </div>
                                        {!d.isTotal && <div className="flex justify-between gap-4"><span className="text-wallstreet-500">Cumulative</span><span>{d.value[1].toFixed(2)}%</span></div>}
                                        {d.weight !== undefined && <div className="flex justify-between gap-4"><span className="text-wallstreet-500">Weight</span><span className="text-blue-600 font-bold">{d.weight.toFixed(2)}%</span></div>}
                                        {d.totalReturn !== undefined && !d.isTotal && <div className="flex justify-between gap-4"><span className="text-wallstreet-500">Period Return</span><span className={d.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}>{d.totalReturn < 0 ? `(${Math.abs(d.totalReturn).toFixed(2)}%)` : `+${d.totalReturn.toFixed(2)}%`}</span></div>}
                                        {d.beta !== undefined && !d.isTotal && <div className="flex justify-between gap-4"><span className="text-wallstreet-500">Beta</span><span>{d.beta.toFixed(2)}</span></div>}
                                        {d.sector && <div className="flex justify-between gap-4"><span className="text-wallstreet-500">Sector</span><span className="text-wallstreet-text">{d.sector}</span></div>}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }} />
                    <ReferenceLine y={0} stroke={tc.referenceLine} />
                    <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                        {waterfallData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        <LabelList dataKey="delta" position="top" formatter={(val: number) => Math.abs(val) > 0.001 ? (val < 0 ? `(${Math.abs(val).toFixed(2)}%)` : `+${val.toFixed(2)}%`) : ''} style={{ fill: tc.tickFill, fontSize: '11px', fontWeight: 'black', fontFamily: 'monospace' }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
    );
};

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
}) => {
    const tc = useThemeColors();
    const explanationRef = useRef<HTMLDivElement>(null);
    const hoveredKeyRef = useRef<string | null>(null);

    // Calculate totals for each attribution factor
    const totals = useMemo(() => ({
        selection: sectorAttributionData.data.reduce((sum, d) => sum + d.selectionEffect, 0),
        allocation: sectorAttributionData.data.reduce((sum, d) => sum + d.allocationEffect, 0),
        interaction: sectorAttributionData.data.reduce((sum, d) => sum + d.interactionEffect, 0),
    }), [sectorAttributionData.data]);

    const colorSpan = (val: number, text: string) =>
        `<strong class="${val >= 0 ? 'text-green-600' : 'text-red-600'}">${text}</strong>`;

    const fmt = (val: number) => val < 0 ? `(${Math.abs(val).toFixed(2)}%)` : `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

    const buildExplanationHTML = useCallback((d: any, chart: string): string => {
        const regionLabel = regionFilter === 'ALL' ? '' : regionFilter === 'US' ? 'US ' : 'Canadian ';
        const benchLabel = benchmarkMode === 'SECTOR' ? d.benchmarkETF : benchmarkMode;

        if (d.portfolioWeight <= 0.001) {
            return `No holdings in <strong>${d.displayName}</strong> — all effects are zero.`;
        }

        if (chart === 'selection') {
            if (!d.hasDirectHoldings) {
                return `Your <strong>${d.displayName}</strong> exposure (${d.portfolioWeight.toFixed(1)}%) comes entirely from ETFs/index funds — no stock picks to evaluate, so selection effect is zero.`;
            }
            const diff = d.portfolioReturn - d.benchmarkReturn;
            const verb = diff >= 0 ? 'outperformed' : 'underperformed';
            return `Your ${regionLabel}<strong>${d.displayName}</strong> picks returned ${colorSpan(d.portfolioReturn, fmt(d.portfolioReturn))} vs. ${benchLabel}'s <strong>${fmt(d.benchmarkReturn)}</strong> — your stock selection ${verb} by ${colorSpan(d.selectionEffect, Math.abs(diff).toFixed(2) + '%')}, contributing a ${colorSpan(d.selectionEffect, fmt(d.selectionEffect))} selection effect to the portfolio.`;
        }

        if (chart === 'allocation') {
            if (benchmarkMode !== 'SECTOR') {
                return `Allocation effect is N/A when benchmarking against a single broad index (${benchmarkMode}).`;
            }
            const overUnder = d.portfolioWeight > d.benchmarkWeight ? 'overweight' : 'underweight';
            const sectorBeat = d.benchmarkReturn >= 0 ? 'outperformed' : 'underperformed';
            return `Your portfolio holds <strong>${d.portfolioWeight.toFixed(1)}%</strong> in ${regionLabel}<strong>${d.displayName}</strong> vs. the benchmark's <strong class="text-blue-600">${d.benchmarkWeight.toFixed(1)}%</strong> — you are ${overUnder}. ${d.displayName} ${sectorBeat} (${benchLabel} ${fmt(d.benchmarkReturn)}), resulting in a ${colorSpan(d.allocationEffect, fmt(d.allocationEffect))} allocation effect.`;
        }

        if (!d.hasDirectHoldings) {
            return `Your <strong>${d.displayName}</strong> exposure comes entirely from ETFs/index funds — interaction effect is zero.`;
        }
        return `Interaction effect for ${regionLabel}<strong>${d.displayName}</strong> vs. ${benchLabel}: ${colorSpan(d.interactionEffect, fmt(d.interactionEffect))}. The combined overlap of your weight tilt (${d.portfolioWeight.toFixed(1)}% vs. ${d.benchmarkWeight.toFixed(1)}%) and stock selection ${d.interactionEffect >= 0 ? 'compounded positively' : 'created additional drag'}.`;
    }, [regionFilter, benchmarkMode]);

    const handleChartMove = useCallback((chart: 'selection' | 'allocation' | 'interaction') => (state: any) => {
        if (state && state.activeTooltipIndex != null && state.activeTooltipIndex >= 0) {
            const d = sectorAttributionData.data[state.activeTooltipIndex];
            const key = `${d.sector}:${chart}`;
            if (hoveredKeyRef.current !== key) {
                hoveredKeyRef.current = key;
                if (explanationRef.current) {
                    explanationRef.current.style.opacity = '1';
                    explanationRef.current.innerHTML = `<span class="text-wallstreet-500">${buildExplanationHTML(d, chart)}</span>`;
                }
            }
        }
    }, [sectorAttributionData.data, buildExplanationHTML]);

    const handleChartLeave = useCallback(() => {
        hoveredKeyRef.current = null;
        if (explanationRef.current) {
            explanationRef.current.style.opacity = '0.6';
            explanationRef.current.innerHTML = '<span class="text-wallstreet-500 italic">Hover a sector bar to see a contextual explanation.</span>';
        }
    }, []);

    return (
    <div className="lg:col-span-8 bg-wallstreet-800 p-4 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col relative">
        <div className="flex justify-between items-start mb-4 border-b border-wallstreet-700 pb-2">
            <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-xs flex items-center gap-2">
                <Layers size={14} className="text-wallstreet-500" /> Attribution Analysis
            </h3>
            <div className="flex items-center gap-2">
                <div className="flex p-0.5 bg-wallstreet-900 rounded-lg">
                    {(['SECTOR', 'SP500', 'TSX60'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setBenchmarkMode(mode)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                                benchmarkMode === mode
                                    ? 'bg-wallstreet-800 text-wallstreet-accent shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
                <div className="flex p-0.5 bg-wallstreet-900 rounded-lg">
                    {(['ALL', 'US', 'CA'] as const).map(region => (
                        <button
                            key={region}
                            onClick={() => setRegionFilter(region)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                                regionFilter === region
                                    ? 'bg-wallstreet-800 text-wallstreet-accent shadow-sm'
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
                    <span className="font-mono text-xs text-wallstreet-500 font-bold uppercase tracking-widest">Loading Attribution Data</span>
                </div>
            </div>
        ) : (<>
        <div className="flex h-full min-h-0 w-full">
            {/* Dedicated Label Column for aligned Y-Axis */}
            <div className="w-[105px] flex flex-col shrink-0">
                <div className="h-[44px]"></div> {/* Title Spacer */}
                <div className="flex-1 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sectorAttributionData.data} layout="vertical" margin={{ top: 0, right: 0, left: 5, bottom: 0 }} barCategoryGap="20%">
                            <YAxis dataKey="displayName" type="category" width={100} tick={{ fontSize: 11, fontFamily: 'monospace', fill: tc.tickFill, fontWeight: 'bold' }} axisLine={false} tickLine={false} interval={0} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-1 flex-1 min-h-0">
                {/* SELECTION EFFECT */}
                <div className="flex flex-col">
                    <div className="mb-4 w-full text-center">
                        <span className="text-[12px] font-mono font-black text-wallstreet-text uppercase tracking-wider">
                            Selection
                        </span>
                        <div className={`text-[11px] font-mono font-bold ${totals.selection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {totals.selection < 0 ? `(${Math.abs(totals.selection).toFixed(2)}%)` : `+${totals.selection.toFixed(2)}%`}
                        </div>
                    </div>
                    <div className="flex-1 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={sectorAttributionData.data}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                barCategoryGap="20%"
                                onMouseMove={handleChartMove('selection')}
                                onMouseLeave={handleChartLeave}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke={tc.gridStrokeLight} />
                                <XAxis type="number" domain={sectorAttributionData.selectionDomain} hide />
                                <YAxis dataKey="displayName" type="category" hide />
                                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.10)', radius: 4 }} content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        const hasHoldings = d.portfolioWeight > 0.001;
                                        const hasStocks = d.hasDirectHoldings;
                                        return (
                                            <div className="bg-wallstreet-800 p-4 rounded-lg shadow-xl border border-wallstreet-700 font-mono text-[12px] z-50 min-w-[220px]">
                                                <div className="font-bold border-b pb-2 mb-2 uppercase text-[13px]">{d.displayName} Selection</div>
                                                {!hasHoldings ? (
                                                    <div className="text-wallstreet-500 italic text-[11px] py-2">No holdings in this sector — selection effect is zero.</div>
                                                ) : !hasStocks ? (
                                                    <div className="text-wallstreet-500 italic text-[11px] py-2">Index-only exposure ({d.portfolioWeight.toFixed(2)}% via ETFs) — no stock picks to evaluate.</div>
                                                ) : (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Selection:</span>
                                                        <span className={`font-bold ${d.selectionEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.selectionEffect < 0 ? `(${Math.abs(d.selectionEffect).toFixed(2)}%)` : `${d.selectionEffect > 0 ? '+' : ''}${d.selectionEffect.toFixed(2)}%`}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Portfolio Return:</span>
                                                        <span className="font-bold">{d.portfolioReturn < 0 ? `(${Math.abs(d.portfolioReturn).toFixed(2)}%)` : `${d.portfolioReturn.toFixed(2)}%`}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Bench Return ({d.benchmarkETF}):</span>
                                                        <span className="font-bold">{d.benchmarkReturn < 0 ? `(${Math.abs(d.benchmarkReturn).toFixed(2)}%)` : `${d.benchmarkReturn.toFixed(2)}%`}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Benchmark Weight:</span>
                                                        <span className="font-bold text-blue-600">{d.benchmarkWeight.toFixed(2)}%</span>
                                                    </div>
                                                </div>
                                                )}
                                                {hasStocks && d.stocks.length > 0 && (
                                                <div className="border-t mt-3 pt-2">
                                                    <div className="text-[10px] text-wallstreet-500 mb-2 uppercase text-center font-bold">Key Drivers (Selection):</div>
                                                    <div className="grid text-[10px] font-mono" style={{ gridTemplateColumns: 'auto 1fr 1fr', fontVariantNumeric: 'tabular-nums' }}>
                                                        {[...d.stocks].sort((a: any, b: any) => Math.abs(b.selectionContribution) - Math.abs(a.selectionContribution)).map((s: any, idx: number) => (
                                                            <React.Fragment key={idx}>
                                                                <span className="font-bold py-1">{s.ticker}</span>
                                                                <span className={`text-right py-1 ${s.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {s.returnPct < 0 ? `(${Math.abs(s.returnPct).toFixed(1)}%)` : <><span style={{visibility:'hidden'}}>(</span>{`+${s.returnPct.toFixed(1)}%`}<span style={{visibility:'hidden'}}>)</span></>}
                                                                </span>
                                                                <span className="text-wallstreet-500 text-right py-1 pl-1">
                                                                    {s.selectionContribution < 0 ? `(${Math.abs(s.selectionContribution).toFixed(2)}%)` : <><span style={{visibility:'hidden'}}>(</span>{`+${s.selectionContribution.toFixed(2)}%`}<span style={{visibility:'hidden'}}>)</span></>}
                                                                </span>
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={0} stroke={tc.referenceLine} strokeWidth={1} />
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
                <div className="flex flex-col border-l border-wallstreet-700">
                    <div className="mb-4 w-full text-center">
                        <span className="text-[12px] font-mono font-black text-wallstreet-text uppercase tracking-wider">
                            Allocation
                        </span>
                        {benchmarkMode === 'SECTOR' && (
                            <div className={`text-[11px] font-mono font-bold ${totals.allocation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {totals.allocation < 0 ? `(${Math.abs(totals.allocation).toFixed(2)}%)` : `+${totals.allocation.toFixed(2)}%`}
                            </div>
                        )}
                    </div>
                    {benchmarkMode !== 'SECTOR' ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center px-4">
                                <div className="text-[10px] font-mono font-bold text-wallstreet-500 uppercase tracking-widest mb-1">N/A</div>
                                <div className="text-[9px] font-mono text-wallstreet-500 leading-tight">Allocation effect is always zero<br/>vs a single broad index</div>
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
                                onMouseMove={handleChartMove('allocation')}
                                onMouseLeave={handleChartLeave}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke={tc.gridStrokeLight} />
                                <XAxis type="number" domain={sectorAttributionData.allocationDomain} hide />
                                <YAxis dataKey="displayName" type="category" hide />
                                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.10)', radius: 4 }} content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div className="bg-wallstreet-800 p-4 rounded-lg shadow-xl border border-wallstreet-700 font-mono text-[12px] z-50 min-w-[220px]">
                                                <div className="font-bold border-b pb-2 mb-2 uppercase text-[13px]">{d.displayName} Allocation</div>
                                                <div className="space-y-1.5 text-[12px]">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Allocation:</span>
                                                        <span className={`font-bold ${d.allocationEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.allocationEffect < 0 ? `(${Math.abs(d.allocationEffect).toFixed(2)}%)` : `${d.allocationEffect > 0 ? '+' : ''}${d.allocationEffect.toFixed(2)}%`}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Portfolio Weight:</span>
                                                        <span className="font-bold text-wallstreet-text">{d.portfolioWeight.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Benchmark Weight:</span>
                                                        <span className="font-bold text-blue-600">{d.benchmarkWeight.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Bench Return ({d.benchmarkETF}):</span>
                                                        <span className="font-bold">{d.benchmarkReturn < 0 ? `(${Math.abs(d.benchmarkReturn).toFixed(2)}%)` : `${d.benchmarkReturn.toFixed(2)}%`}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={0} stroke={tc.referenceLine} strokeWidth={1} />
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
                <div className="flex flex-col border-l border-wallstreet-700">
                    <div className="mb-4 w-full text-center">
                        <span className="text-[12px] font-mono font-black text-wallstreet-text uppercase tracking-wider">
                            Interaction
                        </span>
                        <div className={`text-[11px] font-mono font-bold ${totals.interaction >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {totals.interaction < 0 ? `(${Math.abs(totals.interaction).toFixed(2)}%)` : `+${totals.interaction.toFixed(2)}%`}
                        </div>
                    </div>
                    <div className="flex-1 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={sectorAttributionData.data}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                barCategoryGap="20%"
                                onMouseMove={handleChartMove('interaction')}
                                onMouseLeave={handleChartLeave}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke={tc.gridStrokeLight} />
                                <XAxis type="number" domain={sectorAttributionData.interactionDomain} hide />
                                <YAxis dataKey="displayName" type="category" hide />
                                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.10)', radius: 4 }} content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        const hasHoldings = d.portfolioWeight > 0.001;
                                        const hasStocks = d.hasDirectHoldings;
                                        return (
                                            <div className="bg-wallstreet-800 p-4 rounded-lg shadow-xl border border-wallstreet-700 font-mono text-[12px] z-50 min-w-[220px]">
                                                <div className="font-bold border-b pb-2 mb-2 uppercase text-[13px]">{d.displayName} Interaction</div>
                                                {!hasHoldings ? (
                                                    <div className="text-wallstreet-500 italic text-[11px] py-2">No holdings in this sector — interaction effect is zero.</div>
                                                ) : !hasStocks ? (
                                                    <div className="text-wallstreet-500 italic text-[11px] py-2">Index-only exposure ({d.portfolioWeight.toFixed(2)}% via ETFs) — interaction effect is zero.</div>
                                                ) : (
                                                <div className="space-y-1.5 text-[12px]">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-wallstreet-500">Interaction:</span>
                                                        <span className={`font-bold ${d.interactionEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.interactionEffect < 0 ? `(${Math.abs(d.interactionEffect).toFixed(2)}%)` : `${d.interactionEffect > 0 ? '+' : ''}${d.interactionEffect.toFixed(2)}%`}</span>
                                                    </div>
                                                    <div className="text-[10px] text-wallstreet-500 mt-3 italic border-t pt-2">
                                                        Combined effect of selection and allocation. Usually small, but large when overweighting significant winners.
                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={0} stroke={tc.referenceLine} strokeWidth={1} />
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
        {/* Dynamic explanation bar — updated via ref, no re-renders */}
        <div
            ref={explanationRef}
            className="bg-wallstreet-900 rounded-md border border-wallstreet-700 px-4 py-2.5 mt-3 font-mono text-[11px] leading-relaxed transition-opacity duration-200 opacity-60"
        >
            <span className="text-wallstreet-500 italic">Hover a sector bar to see a contextual explanation.</span>
        </div>
        </>)}
    </div>
    );
};
