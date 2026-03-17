import React, { useEffect, useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ShieldAlert, Activity, Target, Layers, ArrowUpRight, ArrowDownRight, Loader2, AlertCircle, ChevronUp, ChevronDown, Info, Maximize2, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell, Customized, ReferenceLine } from 'recharts';
import { loadPortfolioConfig, convertConfigToItems, fetchRiskContribution, RiskContributionResponse, RiskPosition } from '../services/api';
import { PortfolioItem } from '../types';

type PositionMode = 'actual' | 'historical';

interface KPICardProps {
    title: string;
    value: string;
    subtitle?: string;
    isPositive?: boolean;
    icon: React.ElementType;
    loading?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, isPositive, icon: Icon, loading }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
                <Icon size={18} />
            </div>
            {isPositive !== undefined && !loading && (
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {isPositive ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
                    {isPositive ? 'Good' : 'High'}
                </span>
            )}
        </div>
        <h3 className="text-slate-500 text-xs font-medium mb-1 uppercase tracking-wider">{title}</h3>
        {loading ? (
            <div className="h-8 flex items-center">
                <Loader2 className="animate-spin text-slate-400" size={20} />
            </div>
        ) : (
            <p className="text-xl font-bold text-slate-900 font-mono">{value}</p>
        )}
        {subtitle && !loading && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
);

type SortKey = 'ticker' | 'weight' | 'individualVol' | 'beta' | 'mctr' | 'pctOfTotalRisk' | 'riskAdjustedReturn';

const COLUMN_INFO: Record<string, string> = {
    ticker: 'Security identifier',
    weight: 'Current portfolio allocation as a percentage of total',
    individualVol: 'Annualized standard deviation of the position\'s daily returns over the past year',
    beta: 'Sensitivity of the position to the overall portfolio — above 1.0 means it amplifies portfolio moves',
    mctr: 'Marginal Contribution to Risk — how much portfolio volatility increases per unit of weight added to this position',
    pctOfTotalRisk: 'Share of total portfolio variance attributed to this position — compare to weight to spot risk concentrators',
    riskAdjustedReturn: 'Annualized return divided by annualized volatility (position-level Sharpe ratio)',
    riskVsWeight: 'Difference between risk contribution and weight — positive means the position takes more risk than its allocation suggests',
};

const InfoBubble: React.FC<{ tooltipKey: string }> = ({ tooltipKey }) => {
    const [show, setShow] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const iconRef = React.useRef<HTMLSpanElement>(null);

    const handleEnter = () => {
        if (iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            setCoords({ top: rect.top - 8, left: rect.left + rect.width / 2 });
        }
        setShow(true);
    };

    return (
        <span className="relative" onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
            <span ref={iconRef}>
                <Info size={12} className="text-slate-300 hover:text-slate-500 transition-colors cursor-help" />
            </span>
            {show && coords && ReactDOM.createPortal(
                <span
                    className="fixed w-52 px-3 py-2 text-[11px] font-normal normal-case tracking-normal leading-snug text-white bg-slate-800 rounded-lg shadow-lg z-[9999] pointer-events-none"
                    style={{ top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)' }}
                >
                    {COLUMN_INFO[tooltipKey]}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </span>,
                document.body
            )}
        </span>
    );
};

export const RiskContributionView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RiskContributionResponse | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('pctOfTotalRisk');
    const [sortAsc, setSortAsc] = useState(false);
    const [positionMode, setPositionMode] = useState<PositionMode>('actual');
    const [expandedChart, setExpandedChart] = useState(false);
    const [barChartMode, setBarChartMode] = useState<'absolute' | 'ratio'>('absolute');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const config = await loadPortfolioConfig();
                if (!config.tickers || config.tickers.length === 0) {
                    setError("No portfolio configured. Go to Upload to configure your portfolio.");
                    setLoading(false);
                    return;
                }
                const allItems = convertConfigToItems(config.tickers, config.periods);
                if (allItems.length === 0) {
                    setError("Portfolio has no holdings with positive weights.");
                    setLoading(false);
                    return;
                }

                let items: PortfolioItem[];
                if (positionMode === 'actual') {
                    // Only include tickers with >0% weight in the most recent period
                    const latestDate = allItems.reduce((max, item) =>
                        item.date > max ? item.date : max, allItems[0].date
                    );
                    items = allItems.filter(item => item.date === latestDate && item.weight > 0);
                } else {
                    // Historical: include all items across all periods (server takes max weight per ticker)
                    items = allItems;
                }

                if (items.length === 0) {
                    setError("No holdings found for selected mode.");
                    setLoading(false);
                    return;
                }

                const result = await fetchRiskContribution(items);
                if (result.error) {
                    setError(result.error);
                } else {
                    setData(result);
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [positionMode]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(false);
        }
    };

    const sortedPositions = useMemo(() => {
        if (!data) return [];
        const sorted = [...data.positions].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
        return sorted;
    }, [data, sortKey, sortAsc]);

    // Bar chart data: risk contribution vs weight per ticker
    const riskBarData = useMemo(() => {
        if (!data) return [];
        return [...data.positions]
            .sort((a, b) => b.pctOfTotalRisk - a.pctOfTotalRisk)
            .map(p => ({
                ticker: p.ticker,
                riskPct: p.pctOfTotalRisk,
                weight: p.weight,
                delta: +(p.pctOfTotalRisk - p.weight).toFixed(1),
            }));
    }, [data]);

    // Ratio data: risk/weight ratio per ticker
    const ratioBarData = useMemo(() => {
        if (!data) return [];
        return [...data.positions]
            .filter(p => p.weight > 0)
            .map(p => ({
                ticker: p.ticker,
                ratio: +(p.pctOfTotalRisk / p.weight).toFixed(2),
            }))
            .sort((a, b) => b.ratio - a.ratio);
    }, [data]);

    // Scatter data: weight vs risk contribution
    const scatterData = useMemo(() => {
        if (!data) return [];
        return data.positions.map(p => ({
            ticker: p.ticker,
            x: p.weight,
            y: p.pctOfTotalRisk,
        }));
    }, [data]);

    if (error) {
        return (
            <div className="p-8">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-wallstreet-900 font-mono tracking-tighter">
                        RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                    </h2>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
                    <AlertCircle className="text-red-500 mt-0.5" size={20} />
                    <div>
                        <p className="text-red-800 font-medium">Error loading risk data</p>
                        <p className="text-red-600 text-sm mt-1">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    const SortIcon: React.FC<{ column: SortKey }> = ({ column }) => {
        if (sortKey !== column) return <ChevronDown size={14} className="text-slate-300" />;
        return sortAsc ? <ChevronUp size={14} className="text-slate-700" /> : <ChevronDown size={14} className="text-slate-700" />;
    };

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <div>
                    <h2 className="text-3xl font-bold text-wallstreet-900 font-mono tracking-tighter">
                        RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                    </h2>
                    <p className="text-wallstreet-500 mt-2">Marginal contribution to risk (MCTR), diversification analysis, and position-level risk decomposition.</p>
                </div>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
                    {(['actual', 'historical'] as PositionMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setPositionMode(mode)}
                            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                                positionMode === mode
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {mode === 'actual' ? 'Actual Positions' : 'Historical'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
                <KPICard
                    title="Portfolio Volatility"
                    value={data ? `${data.portfolioVol.toFixed(1)}%` : '—'}
                    subtitle={data ? `Benchmark: ${data.benchmarkVol.toFixed(1)}%` : undefined}
                    isPositive={data ? data.portfolioVol < data.benchmarkVol : undefined}
                    icon={Activity}
                    loading={loading}
                />
                <KPICard
                    title="Diversification Ratio"
                    value={data ? `${data.diversificationRatio.toFixed(2)}x` : '—'}
                    subtitle="> 1.0 = diversification benefit"
                    isPositive={data ? data.diversificationRatio > 1.0 : undefined}
                    icon={Layers}
                    loading={loading}
                />
                <KPICard
                    title="Effective Bets"
                    value={data ? data.numEffectiveBets.toFixed(1) : '—'}
                    subtitle={data ? `of ${data.positions.length} positions` : undefined}
                    isPositive={data ? data.numEffectiveBets > 3 : undefined}
                    icon={Target}
                    loading={loading}
                />
                <KPICard
                    title="Top-3 Concentration"
                    value={data ? `${data.top3Concentration.toFixed(1)}%` : '—'}
                    subtitle="% of total risk from top 3"
                    isPositive={data ? data.top3Concentration < 60 : undefined}
                    icon={ShieldAlert}
                    loading={loading}
                />
            </div>

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
                                        className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${
                                            barChartMode === mode
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        {mode === 'absolute' ? 'Absolute' : 'Ratio'}
                                    </button>
                                ))}
                            </div>
                            {(barChartMode === 'absolute' ? riskBarData : ratioBarData).length > 10 && (
                                <button
                                    onClick={() => setExpandedChart(true)}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                                    title="Expand to see all holdings"
                                >
                                    <span className="font-medium">Top 10 of {(barChartMode === 'absolute' ? riskBarData : ratioBarData).length}</span>
                                    <Maximize2 size={14} />
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
                                    <Tooltip
                                        formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskPct' ? 'Risk %' : 'Weight %']}
                                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    />
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
                                    <Tooltip
                                        formatter={(value: number) => [`${value.toFixed(2)}x`, 'Risk / Weight']}
                                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    />
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
                                    const x1 = xAxis.scale(0);
                                    const y1 = yAxis.scale(0);
                                    const x2 = xAxis.scale(lineEnd);
                                    const y2 = yAxis.scale(lineEnd);
                                    return (
                                        <g>
                                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeDasharray="6 4" strokeWidth={1.5} />
                                            <text x={x2 + 4} y={y2 - 4} fontSize={10} fill="#94a3b8">Weight = Risk</text>
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
            {data && data.sectorRisk.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Sector Risk Decomposition</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, data.sectorRisk.length * 45)}>
                        <BarChart data={[...data.sectorRisk].sort((a, b) => b.riskContribution - a.riskContribution)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
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

            {/* Position Risk Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Position Risk Detail</h3>
                </div>
                {loading ? (
                    <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    {([
                                        ['ticker', 'Ticker'],
                                        ['weight', 'Weight'],
                                        ['individualVol', 'Volatility'],
                                        ['beta', 'Beta'],
                                        ['mctr', 'MCTR'],
                                        ['pctOfTotalRisk', '% of Risk'],
                                        ['riskAdjustedReturn', 'Risk-Adj Ret'],
                                    ] as [SortKey, string][]).map(([key, label]) => (
                                        <th
                                            key={key}
                                            className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            onClick={() => handleSort(key)}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                {label}
                                                <InfoBubble tooltipKey={key} />
                                                <SortIcon column={key} />
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-4 py-3 text-left">
                                        <div className="flex items-center gap-1.5">
                                            Risk vs Weight
                                            <InfoBubble tooltipKey="riskVsWeight" />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const maxAbsDelta = Math.max(1, ...sortedPositions.map(p => Math.abs(p.pctOfTotalRisk - p.weight)));
                                    return sortedPositions.map((p, idx) => {
                                    const riskOverweight = p.pctOfTotalRisk - p.weight;
                                    const isRisky = riskOverweight > 2;
                                    const isDiversifier = riskOverweight < -2;
                                    return (
                                        <tr
                                            key={p.ticker}
                                            className={`border-t border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-25'}`}
                                        >
                                            <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.ticker}</td>
                                            <td className="px-4 py-3 font-mono text-slate-700">{p.weight.toFixed(1)}%</td>
                                            <td className="px-4 py-3 font-mono text-slate-700">{p.individualVol.toFixed(1)}%</td>
                                            <td className="px-4 py-3 font-mono text-slate-700">{p.beta.toFixed(2)}</td>
                                            <td className="px-4 py-3 font-mono text-slate-700">{p.mctr.toFixed(2)}%</td>
                                            <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.pctOfTotalRisk.toFixed(1)}%</td>
                                            <td className={`px-4 py-3 font-mono font-medium ${p.riskAdjustedReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                                {p.riskAdjustedReturn.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden relative">
                                                        <div
                                                            className={`h-full rounded-full ${isRisky ? 'bg-red-400' : isDiversifier ? 'bg-green-400' : 'bg-slate-300'}`}
                                                            style={{ width: `${Math.min(100, (Math.abs(riskOverweight) / maxAbsDelta) * 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-mono ${isRisky ? 'text-red-600' : isDiversifier ? 'text-green-600' : 'text-slate-400'}`}>
                                                        {riskOverweight > 0 ? '+' : ''}{riskOverweight.toFixed(1)}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Missing tickers warning */}
            {data && data.missingTickers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="text-amber-500 mt-0.5" size={18} />
                    <div>
                        <p className="text-amber-800 text-sm font-medium">Missing price data</p>
                        <p className="text-amber-600 text-xs mt-1">
                            No Yahoo Finance data for: {data.missingTickers.join(', ')}. These tickers are excluded from risk calculations.
                        </p>
                    </div>
                </div>
            )}

            {/* Expanded Chart Modal */}
            {expandedChart && (barChartMode === 'absolute' ? riskBarData : ratioBarData).length > 0 && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8" onClick={() => setExpandedChart(false)}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                    {barChartMode === 'absolute' ? 'Risk Contribution vs Weight' : 'Risk / Weight Ratio'}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    All {(barChartMode === 'absolute' ? riskBarData : ratioBarData).length} positions
                                </p>
                            </div>
                            <button
                                onClick={() => setExpandedChart(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
                            >
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
                                        <Tooltip
                                            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'riskPct' ? 'Risk %' : 'Weight %']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
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
                                        <Tooltip
                                            formatter={(value: number) => [`${value.toFixed(2)}x`, 'Risk / Weight']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
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
        </div>
    );
};
