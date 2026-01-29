import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp, Award, Activity, ShieldAlert, ArrowUpRight, ArrowDownRight, BarChart3, Loader2, AlertCircle, Target } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { loadPortfolioConfig, convertConfigToItems, fetchPortfolioBackcast, BackcastResponse, BackcastSeriesPoint } from '../services/api';

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
                    {isPositive ? 'Above' : 'Below'}
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

type Period = 'YTD' | '3M' | '6M' | '1Y' | '2025';

const getDateRangeForPeriod = (period: Period): { start: Date; end?: Date } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    switch (period) {
        case '2025':
            return { start: new Date(2025, 0, 1), end: new Date(2025, 11, 31) };
        case 'YTD':
            return { start: new Date(now.getFullYear(), 0, 1) };
        case '3M':
            return { start: new Date(new Date().setMonth(now.getMonth() - 3)) };
        case '6M':
            return { start: new Date(new Date().setMonth(now.getMonth() - 6)) };
        case '1Y':
            return { start: new Date(new Date().setFullYear(now.getFullYear() - 1)) };
        default:
            return { start: new Date(new Date().setFullYear(now.getFullYear() - 1)) };
    }
};

type ChartView = 'absolute' | 'relative' | 'drawdowns';

export const PerformanceView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BackcastResponse | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('1Y');
    const [chartView, setChartView] = useState<ChartView>('absolute');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Load portfolio config
                const config = await loadPortfolioConfig();
                if (!config.tickers || config.tickers.length === 0) {
                    setError("No portfolio configured. Go to Upload to configure your portfolio.");
                    setLoading(false);
                    return;
                }

                // 2. Convert to items (use most recent period)
                const items = convertConfigToItems(config.tickers, config.periods);
                if (items.length === 0) {
                    setError("Portfolio has no holdings with positive weights.");
                    setLoading(false);
                    return;
                }

                // 3. Fetch backcast
                const result = await fetchPortfolioBackcast(items);
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
    }, []);

    // Filter and compute chart data based on selected period and view
    const chartData = useMemo(() => {
        if (!data?.series || data.series.length === 0) return [];

        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';

        const filtered = data.series.filter(pt => pt.date >= startDateStr && pt.date <= endDateStr);
        if (filtered.length === 0) return [];

        // Normalize to start at 0%
        const startPortfolio = filtered[0].portfolio;
        const startBenchmark = filtered[0].benchmark;

        if (chartView === 'absolute') {
            // Cumulative returns from start of period
            return filtered.map(pt => ({
                date: pt.date,
                Portfolio: ((pt.portfolio - startPortfolio) / startPortfolio) * 100,
                Benchmark: ((pt.benchmark - startBenchmark) / startBenchmark) * 100,
            }));
        } else if (chartView === 'relative') {
            // Portfolio excess return over benchmark (relative performance)
            return filtered.map(pt => {
                const ptfRet = ((pt.portfolio - startPortfolio) / startPortfolio) * 100;
                const bmkRet = ((pt.benchmark - startBenchmark) / startBenchmark) * 100;
                return {
                    date: pt.date,
                    'Excess Return': ptfRet - bmkRet,
                };
            });
        } else {
            // Drawdowns: distance from running peak
            let maxPtf = filtered[0].portfolio;
            let maxBmk = filtered[0].benchmark;
            return filtered.map(pt => {
                maxPtf = Math.max(maxPtf, pt.portfolio);
                maxBmk = Math.max(maxBmk, pt.benchmark);
                return {
                    date: pt.date,
                    Portfolio: ((pt.portfolio - maxPtf) / maxPtf) * 100,
                    Benchmark: ((pt.benchmark - maxBmk) / maxBmk) * 100,
                };
            });
        }
    }, [data, selectedPeriod, chartView]);

    // Calculate gradient offset for relative chart (position of 0 in the y-axis range)
    const gradientOffset = useMemo(() => {
        if (chartView !== 'relative' || !chartData.length) return 0.5;
        const values = chartData.map((d: Record<string, unknown>) => d['Excess Return'] as number);
        const max = Math.max(...values);
        const min = Math.min(...values);
        if (max <= 0) return 0; // All negative
        if (min >= 0) return 1; // All positive
        return max / (max - min); // Position of 0 in the range
    }, [chartData, chartView]);
    // Compute ALL metrics dynamically from the selected period
    const periodMetrics = useMemo(() => {
        if (!data?.series || data.series.length < 5) return null;

        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';
        const filtered = data.series.filter(pt => pt.date >= startDateStr && pt.date <= endDateStr);

        if (filtered.length < 5) return null;

        // Compute daily returns from cumulative series
        const ptfRets: number[] = [];
        const bmkRets: number[] = [];
        for (let i = 1; i < filtered.length; i++) {
            ptfRets.push((filtered[i].portfolio - filtered[i - 1].portfolio) / filtered[i - 1].portfolio);
            bmkRets.push((filtered[i].benchmark - filtered[i - 1].benchmark) / filtered[i - 1].benchmark);
        }

        if (ptfRets.length === 0) return null;

        // Helper functions
        const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = (arr: number[]) => {
            const m = mean(arr);
            return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length);
        };
        const covariance = (a: number[], b: number[]) => {
            const mA = mean(a), mB = mean(b);
            return a.reduce((acc, v, i) => acc + (v - mA) * (b[i] - mB), 0) / a.length;
        };

        // Total Returns (from first to last of filtered period)
        const totalReturn = ((filtered[filtered.length - 1].portfolio - filtered[0].portfolio) / filtered[0].portfolio) * 100;
        const benchmarkReturn = ((filtered[filtered.length - 1].benchmark - filtered[0].benchmark) / filtered[0].benchmark) * 100;
        const alpha = totalReturn - benchmarkReturn;

        // Volatility (period, NOT annualized)
        const volatility = std(ptfRets) * Math.sqrt(ptfRets.length) * 100;
        const benchmarkVolatility = std(bmkRets) * Math.sqrt(bmkRets.length) * 100;

        // Sharpe (period-based: total return / volatility)
        const sharpeRatio = volatility > 0 ? totalReturn / volatility : 0;
        const benchmarkSharpe = benchmarkVolatility > 0 ? benchmarkReturn / benchmarkVolatility : 0;

        // Sortino (using downside deviation)
        const negRets = ptfRets.filter(r => r < 0);
        const downsideStd = negRets.length > 0 ? std(negRets) * Math.sqrt(ptfRets.length) * 100 : volatility;
        const sortinoRatio = downsideStd > 0 ? totalReturn / downsideStd : 0;

        const bmkNegRets = bmkRets.filter(r => r < 0);
        const bmkDownsideStd = bmkNegRets.length > 0 ? std(bmkNegRets) * Math.sqrt(bmkRets.length) * 100 : benchmarkVolatility;
        const benchmarkSortino = bmkDownsideStd > 0 ? benchmarkReturn / bmkDownsideStd : 0;

        // Beta
        const bmkVar = std(bmkRets) ** 2;
        const beta = bmkVar > 0 ? covariance(ptfRets, bmkRets) / bmkVar : 1;

        // Information Ratio & Tracking Error
        const excessRets = ptfRets.map((r, i) => r - bmkRets[i]);
        const trackingError = std(excessRets) * Math.sqrt(excessRets.length) * 100;
        const excessReturn = totalReturn - benchmarkReturn;
        const informationRatio = trackingError > 0 ? excessReturn / trackingError : 0;

        // Max Drawdown (from cumulative series)
        let maxPtf = filtered[0].portfolio;
        let maxDrawdown = 0;
        let maxBmk = filtered[0].benchmark;
        let benchmarkMaxDrawdown = 0;
        for (const pt of filtered) {
            maxPtf = Math.max(maxPtf, pt.portfolio);
            const dd = (pt.portfolio - maxPtf) / maxPtf;
            maxDrawdown = Math.min(maxDrawdown, dd);

            maxBmk = Math.max(maxBmk, pt.benchmark);
            const bmkDd = (pt.benchmark - maxBmk) / maxBmk;
            benchmarkMaxDrawdown = Math.min(benchmarkMaxDrawdown, bmkDd);
        }

        return {
            totalReturn,
            benchmarkReturn,
            alpha,
            sharpeRatio,
            sortinoRatio,
            informationRatio,
            trackingError,
            volatility,
            benchmarkVolatility,
            benchmarkSharpe,
            benchmarkSortino,
            beta,
            maxDrawdown: maxDrawdown * 100,
            benchmarkMaxDrawdown: benchmarkMaxDrawdown * 100,
        };
    }, [data, selectedPeriod]);

    const formatPercent = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

    const formatXAxis = (str: string) => {
        const date = new Date(str);
        const month = date.getMonth();
        const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
        if (month === 0) {
            return `${monthName} '${date.getFullYear().toString().slice(-2)}`;
        }
        return monthName;
    };

    // Get ticks that represent first trading day of each month
    const getMonthlyTicks = useMemo(() => {
        const ticks: string[] = [];
        let lastMonth = -1;
        let lastYear = -1;

        chartData.forEach(item => {
            const date = new Date(item.date);
            const month = date.getMonth();
            const year = date.getFullYear();

            if (month !== lastMonth || year !== lastYear) {
                ticks.push(item.date);
                lastMonth = month;
                lastYear = year;
            }
        });

        // Thin out for longer periods
        if (selectedPeriod === '1Y') {
            return ticks.filter((_, i) => i % 2 === 0);
        }
        return ticks;
    }, [chartData, selectedPeriod]);

    if (error) {
        return (
            <div className="p-8 animate-in fade-in duration-500">
                <div className="flex flex-col items-center justify-center h-[400px] bg-white rounded-2xl border border-slate-200">
                    <AlertCircle className="text-amber-500 mb-4" size={48} />
                    <h2 className="text-lg font-bold text-slate-700 mb-2">Unable to Load Performance Data</h2>
                    <p className="text-slate-500 text-center max-w-md">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Performance Deep Dive</h1>
                    <p className="text-slate-500 mt-1">Portfolio backcast based on current holdings vs. 75/25 Global Index.</p>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard
                    title={`Return (${selectedPeriod})`}
                    value={periodMetrics ? formatPercent(periodMetrics.totalReturn) : '--'}
                    subtitle={periodMetrics ? `Benchmark: ${formatPercent(periodMetrics.benchmarkReturn)}` : undefined}
                    isPositive={periodMetrics ? periodMetrics.totalReturn > periodMetrics.benchmarkReturn : undefined}
                    icon={TrendingUp}
                    loading={loading}
                />
                <KPICard
                    title="Alpha"
                    value={periodMetrics ? formatPercent(periodMetrics.alpha) : '--'}
                    subtitle={`Excess return (${selectedPeriod})`}
                    isPositive={periodMetrics ? periodMetrics.alpha > 0 : undefined}
                    icon={Target}
                    loading={loading}
                />
                <KPICard
                    title="Sharpe"
                    value={periodMetrics ? periodMetrics.sharpeRatio.toFixed(2) : '--'}
                    subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkSharpe.toFixed(2)}` : undefined}
                    isPositive={periodMetrics ? periodMetrics.sharpeRatio > periodMetrics.benchmarkSharpe : undefined}
                    icon={Award}
                    loading={loading}
                />
                <KPICard
                    title="Sortino"
                    value={periodMetrics ? periodMetrics.sortinoRatio.toFixed(2) : '--'}
                    subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkSortino.toFixed(2)}` : undefined}
                    isPositive={periodMetrics ? periodMetrics.sortinoRatio > periodMetrics.benchmarkSortino : undefined}
                    icon={Award}
                    loading={loading}
                />
                <KPICard
                    title="Info Ratio"
                    value={periodMetrics ? periodMetrics.informationRatio.toFixed(2) : '--'}
                    subtitle={periodMetrics ? `T.E.: ${periodMetrics.trackingError.toFixed(1)}%` : undefined}
                    isPositive={periodMetrics ? periodMetrics.informationRatio > 0 : undefined}
                    icon={Target}
                    loading={loading}
                />
                <KPICard
                    title="Beta"
                    value={periodMetrics ? periodMetrics.beta.toFixed(2) : '--'}
                    subtitle={periodMetrics?.beta && periodMetrics.beta < 1 ? 'Defensive' : 'Aggressive'}
                    icon={Activity}
                    loading={loading}
                />
                <KPICard
                    title="Volatility"
                    value={periodMetrics ? `${periodMetrics.volatility.toFixed(1)}%` : '--'}
                    subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkVolatility.toFixed(1)}%` : undefined}
                    isPositive={periodMetrics ? periodMetrics.volatility < periodMetrics.benchmarkVolatility : undefined}
                    icon={BarChart3}
                    loading={loading}
                />
                <KPICard
                    title="Max Drawdown"
                    value={periodMetrics ? `${periodMetrics.maxDrawdown.toFixed(1)}%` : '--'}
                    subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkMaxDrawdown.toFixed(1)}%` : undefined}
                    isPositive={periodMetrics ? periodMetrics.maxDrawdown > periodMetrics.benchmarkMaxDrawdown : undefined}
                    icon={ShieldAlert}
                    loading={loading}
                />
            </div>

            {/* Main Chart Area */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                {/* Chart View Tabs */}
                <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                    {([
                        { key: 'absolute', label: 'Absolute' },
                        { key: 'relative', label: 'Relative' },
                        { key: 'drawdowns', label: 'Drawdowns' },
                    ] as { key: ChartView; label: string }[]).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setChartView(key)}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${chartView === key
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h2 className="text-lg font-bold text-slate-900">
                        {chartView === 'absolute' && 'Cumulative Performance vs. Benchmark'}
                        {chartView === 'relative' && 'Excess Return (Portfolio - Benchmark)'}
                        {chartView === 'drawdowns' && 'Drawdowns from Peak'}
                    </h2>
                    <div className="flex items-center gap-4">
                        {/* Period Summary */}
                        {periodMetrics && (
                            <div className="flex items-center gap-3 text-xs font-mono">
                                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                                    <span className="font-bold">PTF:</span>
                                    <span className="font-bold">{formatPercent(periodMetrics.totalReturn)}</span>
                                </div>
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${periodMetrics.benchmarkReturn >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                                    <span className="font-bold">BMK:</span>
                                    <span className="font-bold">{formatPercent(periodMetrics.benchmarkReturn)}</span>
                                </div>
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${periodMetrics.alpha >= 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
                                    <span className="font-bold">Δ:</span>
                                    <span className="font-bold">{formatPercent(periodMetrics.alpha)}</span>
                                </div>
                            </div>
                        )}
                        {/* Period Selector Pills */}
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {(['2025', 'YTD', '3M', '6M', '1Y'] as Period[]).map((period) => (
                                <React.Fragment key={period}>
                                    <button
                                        onClick={() => setSelectedPeriod(period)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                                            }`}
                                    >
                                        {period}
                                    </button>
                                    {period === '2025' && <div className="mx-1 h-4 w-px bg-slate-300" />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="animate-spin text-slate-400" size={40} />
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm">
                            Insufficient data for selected period
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            {chartView === 'relative' ? (
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                                            <stop offset={`${gradientOffset * 100}%`} stopColor="#10b981" stopOpacity={0.2} />
                                            <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" stopOpacity={0.2} />
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const val = payload[0]?.value as number;
                                            const formatTooltipDate = (str: string) => {
                                                const date = new Date(str);
                                                return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
                                            };
                                            return (
                                                <div className="bg-white/95 border border-slate-200 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-slate-600 mb-2 border-b pb-1">{formatTooltipDate(String(label))}</p>
                                                    <div className="flex justify-between items-center gap-4 py-0.5">
                                                        <span className={`font-medium ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            Excess Return:
                                                        </span>
                                                        <span className={`font-bold ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {val > 0 ? '+' : ''}{val.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <ReferenceLine y={0} stroke="#475569" strokeWidth={2} />
                                    <Area
                                        type="monotone"
                                        dataKey="Excess Return"
                                        stroke="#64748b"
                                        strokeWidth={2}
                                        fill="url(#splitColor)"
                                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#64748b' }}
                                    />
                                </AreaChart>
                            ) : (
                                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const formatTooltipDate = (str: string) => {
                                                const date = new Date(str);
                                                return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
                                            };
                                            return (
                                                <div className="bg-white/95 border border-slate-200 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-slate-600 mb-2 border-b pb-1">{formatTooltipDate(String(label))}</p>
                                                    {payload.map((entry) => (
                                                        <div key={entry.dataKey} className="flex justify-between items-center gap-4 py-0.5">
                                                            <span style={{ color: entry.color }} className="font-medium">
                                                                {entry.dataKey}:
                                                            </span>
                                                            <span style={{ color: entry.color }} className="font-bold">
                                                                {(entry.value as number) > 0 ? '+' : ''}{(entry.value as number).toFixed(2)}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '15px' }} />
                                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                                    <Line
                                        type="monotone"
                                        dataKey="Portfolio"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        dot={false}
                                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="Benchmark"
                                        stroke="#2563eb"
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                    />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Missing Tickers Warning */}
            {data?.missingTickers && data.missingTickers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                    <strong>Note:</strong> The following tickers could not be included in the backcast (no price data found): {data.missingTickers.join(', ')}
                </div>
            )}

            {/* Bottom Grid - Risk Metrics Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Periodic Returns */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Period Snapshot ({selectedPeriod})</h2>
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-4 py-2 text-left">Metric</th>
                                <th className="px-4 py-2 text-right">Portfolio</th>
                                <th className="px-4 py-2 text-right">Benchmark</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-700">Total Return</td>
                                <td className={`px-4 py-3 text-right font-mono font-bold ${periodMetrics && periodMetrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {periodMetrics ? formatPercent(periodMetrics.totalReturn) : '--'}
                                </td>
                                <td className={`px-4 py-3 text-right font-mono ${periodMetrics && periodMetrics.benchmarkReturn >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                                    {periodMetrics ? formatPercent(periodMetrics.benchmarkReturn) : '--'}
                                </td>
                            </tr>
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-700">Sharpe Ratio</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{periodMetrics?.sharpeRatio.toFixed(2) ?? '--'}</td>
                                <td className="px-4 py-3 text-right font-mono text-slate-500">{periodMetrics?.benchmarkSharpe.toFixed(2) ?? '--'}</td>
                            </tr>
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-700">Volatility</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{periodMetrics ? `${periodMetrics.volatility.toFixed(1)}%` : '--'}</td>
                                <td className="px-4 py-3 text-right font-mono text-slate-500">{periodMetrics ? `${periodMetrics.benchmarkVolatility.toFixed(1)}%` : '--'}</td>
                            </tr>
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-700">Beta</td>
                                <td className="px-4 py-3 text-right font-mono text-slate-400">—</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{periodMetrics?.beta.toFixed(2) ?? '--'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Risk Attribution */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Risk Interpretation</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Portfolio Beta</p>
                            <p className="text-2xl font-bold text-slate-900 font-mono">{periodMetrics?.beta.toFixed(2) ?? '--'}</p>
                            <p className="text-xs text-slate-400 mt-1">
                                {periodMetrics?.beta !== undefined ? (
                                    periodMetrics.beta < 0.95 ? 'Defensive (less market exposure)' :
                                        periodMetrics.beta > 1.05 ? 'Aggressive (more market exposure)' :
                                            'Neutral (moves with the market)'
                                ) : '--'}
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Max Drawdown</p>
                            <p className="text-2xl font-bold text-red-600 font-mono">{periodMetrics ? `${periodMetrics.maxDrawdown.toFixed(1)}%` : '--'}</p>
                            <p className="text-xs text-slate-400 mt-1">Largest decline from peak</p>
                        </div>
                    </div>
                    <div className="mt-4 p-4 bg-gradient-to-br from-emerald-50 to-blue-50 rounded-xl border border-emerald-100">
                        <p className="text-xs text-slate-600 uppercase font-bold tracking-wider mb-2">Alpha ({selectedPeriod} Excess Return)</p>
                        <p className={`text-3xl font-bold font-mono ${periodMetrics && periodMetrics.alpha >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {periodMetrics ? formatPercent(periodMetrics.alpha) : '--'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {periodMetrics?.alpha !== undefined ? (
                                periodMetrics.alpha > 0 ? 'Outperforming the benchmark' : 'Underperforming the benchmark'
                            ) : '--'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
