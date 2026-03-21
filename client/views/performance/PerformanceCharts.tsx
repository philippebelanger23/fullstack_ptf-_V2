import React, { useMemo } from 'react';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatPercent, formatTooltipDate } from '../../utils/formatters';
import type { Period, PeriodMetrics } from './PerformanceKPIs';
import type { BackcastResponse } from '../../types';
import { DrawdownAnalysis } from '../../components/DrawdownAnalysis';
import { useThemeColors } from '../../hooks/useThemeColors';

export type ChartView = 'absolute' | 'relative' | 'drawdowns';

const BENCHMARKS = [
    { key: '75/25', label: 'Custom', title: '75% ACWI + 25% TSX60 (CAD)' },
    { key: 'TSX60', label: 'TSX60', title: 'S&P/TSX 60 — XIU.TO' },
    { key: 'SP500', label: 'S&P 500', title: 'S&P 500 CAD — XUS.TO' },
] as const;

interface PerformanceChartsProps {
    data: BackcastResponse | null;
    chartData: Record<string, unknown>[];
    chartView: ChartView;
    setChartView: (v: ChartView) => void;
    isFullscreen: boolean;
    setIsFullscreen: (v: boolean) => void;
    selectedPeriod: Period;
    setSelectedPeriod: (v: Period) => void;
    periodMetrics: PeriodMetrics | null;
    loading: boolean;
    benchmark: string;
    setBenchmark: (v: string) => void;
}

export const PerformanceCharts: React.FC<PerformanceChartsProps> = ({
    data,
    chartData,
    chartView,
    setChartView,
    isFullscreen,
    setIsFullscreen,
    selectedPeriod,
    setSelectedPeriod,
    periodMetrics,
    loading,
    benchmark,
    setBenchmark,
}) => {
    const tc = useThemeColors();
    const formatXAxis = (str: string) => {
        if (!str) return '';
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    };

    const gradientOffset = useMemo(() => {
        if (chartView !== 'relative' || !chartData.length) return 0.5;
        const values = chartData.map((d) => d['Excess Return'] as number);
        const max = Math.max(...values);
        const min = Math.min(...values);
        if (max <= 0) return 0;
        if (min >= 0) return 1;
        return max / (max - min);
    }, [chartData, chartView]);

    const getMonthlyTicks = useMemo(() => {
        if (chartData.length === 0) return [];

        // For short periods (≤ 6M): emit a tick every ~2 weeks (every 10 trading days)
        // For 1Y: tick every month
        // For longer: tick every 2 months
        if (selectedPeriod === '3M' || selectedPeriod === 'YTD' || selectedPeriod === '2025' || selectedPeriod === '6M') {
            return chartData
                .map(item => item.date as string)
                .filter((_, i) => i % 10 === 0);
        }

        const ticks: string[] = [];
        let lastMonth = -1;
        let lastYear = -1;
        chartData.forEach(item => {
            const date = new Date(item.date as string);
            const month = date.getMonth();
            const year = date.getFullYear();
            if (month !== lastMonth || year !== lastYear) {
                ticks.push(item.date as string);
                lastMonth = month;
                lastYear = year;
            }
        });
        if (selectedPeriod === '1Y') return ticks;
        return ticks.filter((_, i) => i % 2 === 0);
    }, [chartData, selectedPeriod]);

    return (
        <>
            {/* Fullscreen Overlay */}
            {isFullscreen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setIsFullscreen(false)} />
            )}

            {/* Main Chart Area */}
            <div className={`bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm transition-all duration-300 ${isFullscreen ? 'fixed inset-4 z-50 overflow-auto' : ''}`}>
                <div className="flex items-center justify-between mb-4 border-b border-wallstreet-700 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        {([
                            { key: 'absolute', label: 'Absolute' },
                            { key: 'relative', label: 'Relative' },
                            { key: 'drawdowns', label: 'Drawdowns' },
                        ] as { key: ChartView; label: string }[]).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setChartView(key)}
                                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${chartView === key
                                    ? 'bg-wallstreet-accent text-white shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                        <div className="w-px h-5 bg-wallstreet-700 mx-1" />
                        <span className="text-xs text-wallstreet-500 font-mono uppercase tracking-wider">vs.</span>
                        {BENCHMARKS.map(({ key, label, title }) => (
                            <button
                                key={key}
                                onClick={() => setBenchmark(key)}
                                title={title}
                                className={`px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${benchmark === key
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-2 rounded-lg text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900 transition-colors"
                        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h2 className="text-lg font-bold text-wallstreet-text">
                        {chartView === 'absolute' && 'Cumulative Performance vs. Benchmark'}
                        {chartView === 'relative' && 'Excess Return (Portfolio - Benchmark)'}
                        {chartView === 'drawdowns' && 'Drawdowns from Peak'}
                    </h2>
                    <div className="flex items-center gap-4">
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
                        <div className="flex bg-wallstreet-900 p-1 rounded-xl">
                            {(['2025', 'YTD', '3M', '6M', '1Y'] as Period[]).map((period) => (
                                <React.Fragment key={period}>
                                    <button
                                        onClick={() => setSelectedPeriod(period)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period
                                            ? 'bg-wallstreet-accent text-white shadow-sm'
                                            : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-700'
                                            }`}
                                    >
                                        {period}
                                    </button>
                                    {period === '2025' && <div className="mx-1 h-4 w-px bg-wallstreet-600" />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={isFullscreen ? 'h-[calc(100vh-220px)]' : 'h-[400px]'}>
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="animate-spin text-wallstreet-500" size={40} />
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-wallstreet-500 font-mono text-sm">
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
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStroke} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 11, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(0)}%)` : `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                        tick={{ fontSize: 11, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const val = payload[0]?.value as number;
                                            return (
                                                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                                    <div className="flex justify-between items-center gap-4 py-0.5">
                                                        <span className={`font-medium ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Excess Return:</span>
                                                        <span className={`font-bold ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {val < 0 ? `(${Math.abs(val).toFixed(2)}%)` : `${val > 0 ? '+' : ''}${val.toFixed(2)}%`}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <ReferenceLine y={0} stroke={tc.referenceLine} strokeWidth={2} />
                                    <Area
                                        type="monotone"
                                        dataKey="Excess Return"
                                        stroke="#64748b"
                                        strokeWidth={2}
                                        fill="url(#splitColor)"
                                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#64748b' }}
                                    />
                                </AreaChart>
                            ) : chartView === 'drawdowns' ? (
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.04} />
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.55} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStroke} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 11, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(0)}%)` : '0%'}
                                        tick={{ fontSize: 11, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                                    {payload.map((entry) => {
                                                        const val = entry.value as number;
                                                        return (
                                                            <div key={entry.dataKey as string} className="flex justify-between items-center gap-4 py-0.5">
                                                                <span style={{ color: entry.color }} className="font-medium">{entry.dataKey}:</span>
                                                                <span style={{ color: entry.color }} className="font-bold">
                                                                    {val < 0 ? `(${Math.abs(val).toFixed(2)}%)` : '0.00%'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '15px' }} />
                                    <ReferenceLine y={0} stroke={tc.referenceLine} strokeWidth={2} />
                                    <Area type="monotone" dataKey="Portfolio" stroke="#ef4444" strokeWidth={2.5} fill="url(#drawdownGradient)" dot={false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#ef4444' }} />
                                    <Area type="monotone" dataKey="Benchmark" stroke="#94a3b8" strokeWidth={1.5} fill="none" fillOpacity={0} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: '#94a3b8' }} />
                                </AreaChart>
                            ) : (
                                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStroke} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 11, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(0)}%)` : `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                        tick={{ fontSize: 11, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                                    {payload.map((entry) => (
                                                        <div key={entry.dataKey as string} className="flex justify-between items-center gap-4 py-0.5">
                                                            <span style={{ color: entry.color }} className="font-medium">{entry.dataKey}:</span>
                                                            <span style={{ color: entry.color }} className="font-bold">
                                                                {(entry.value as number) < 0 ? `(${Math.abs(entry.value as number).toFixed(2)}%)` : `${(entry.value as number) > 0 ? '+' : ''}${(entry.value as number).toFixed(2)}%`}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '15px' }} />
                                    <ReferenceLine y={0} stroke={tc.referenceLine} strokeDasharray="4 4" />
                                    <Line type="monotone" dataKey="Portfolio" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} />
                                    <Line type="monotone" dataKey="Benchmark" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Drawdown Episodes Panel */}
            {chartView === 'drawdowns' && data?.topDrawdowns && data.topDrawdowns.length > 0 && (
                <DrawdownAnalysis topDrawdowns={data.topDrawdowns} />
            )}

            {/* Missing Tickers Warning */}
            {data?.missingTickers && data.missingTickers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                    <strong>Note:</strong> The following tickers could not be included in the backcast (no price data found): {data.missingTickers.join(', ')}
                </div>
            )}

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm">
                    <h2 className="text-lg font-bold text-wallstreet-text mb-4">Period Snapshot ({selectedPeriod})</h2>
                    <table className="w-full text-sm">
                        <thead className="bg-wallstreet-900 text-wallstreet-500 font-medium">
                            <tr>
                                <th className="px-4 py-2 text-left">Metric</th>
                                <th className="px-4 py-2 text-right">Portfolio</th>
                                <th className="px-4 py-2 text-right">Benchmark ({BENCHMARKS.find(b => b.key === benchmark)?.label ?? benchmark})</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-wallstreet-700">
                            <tr className="hover:bg-wallstreet-900 transition-colors">
                                <td className="px-4 py-3 font-medium text-wallstreet-text">Total Return</td>
                                <td className={`px-4 py-3 text-right font-mono font-bold ${periodMetrics && periodMetrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {periodMetrics ? formatPercent(periodMetrics.totalReturn) : '--'}
                                </td>
                                <td className={`px-4 py-3 text-right font-mono ${periodMetrics && periodMetrics.benchmarkReturn >= 0 ? 'text-wallstreet-text' : 'text-red-600'}`}>
                                    {periodMetrics ? formatPercent(periodMetrics.benchmarkReturn) : '--'}
                                </td>
                            </tr>
                            <tr className="hover:bg-wallstreet-900 transition-colors">
                                <td className="px-4 py-3 font-medium text-wallstreet-text">Sharpe Ratio</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-wallstreet-text">{periodMetrics ? (periodMetrics.sharpeRatio < 0 ? `(${Math.abs(periodMetrics.sharpeRatio).toFixed(2)})` : periodMetrics.sharpeRatio.toFixed(2)) : '--'}</td>
                                <td className="px-4 py-3 text-right font-mono text-wallstreet-500">{periodMetrics ? (periodMetrics.benchmarkSharpe < 0 ? `(${Math.abs(periodMetrics.benchmarkSharpe).toFixed(2)})` : periodMetrics.benchmarkSharpe.toFixed(2)) : '--'}</td>
                            </tr>
                            <tr className="hover:bg-wallstreet-900 transition-colors">
                                <td className="px-4 py-3 font-medium text-wallstreet-text">Volatility</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-wallstreet-text">{periodMetrics ? `${periodMetrics.volatility.toFixed(1)}%` : '--'}</td>
                                <td className="px-4 py-3 text-right font-mono text-wallstreet-500">{periodMetrics ? `${periodMetrics.benchmarkVolatility.toFixed(1)}%` : '--'}</td>
                            </tr>
                            <tr className="hover:bg-wallstreet-900 transition-colors">
                                <td className="px-4 py-3 font-medium text-wallstreet-text">Beta</td>
                                <td className="px-4 py-3 text-right font-mono text-wallstreet-500">—</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-wallstreet-text">{periodMetrics?.beta.toFixed(2) ?? '--'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm">
                    <h2 className="text-lg font-bold text-wallstreet-text mb-4">Risk Interpretation</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-wallstreet-900 rounded-xl border border-wallstreet-700">
                            <p className="text-xs text-wallstreet-500 uppercase font-bold tracking-wider mb-2">Portfolio Beta</p>
                            <p className="text-2xl font-bold text-wallstreet-text font-mono">{periodMetrics?.beta.toFixed(2) ?? '--'}</p>
                            <p className="text-xs text-wallstreet-500 mt-1">
                                {periodMetrics?.beta !== undefined ? (
                                    periodMetrics.beta < 0.95 ? 'Defensive (less market exposure)' :
                                        periodMetrics.beta > 1.05 ? 'Aggressive (more market exposure)' :
                                            'Neutral (moves with the market)'
                                ) : '--'}
                            </p>
                        </div>
                        <div className="p-4 bg-wallstreet-900 rounded-xl border border-wallstreet-700">
                            <p className="text-xs text-wallstreet-500 uppercase font-bold tracking-wider mb-2">Max Drawdown</p>
                            <p className="text-2xl font-bold text-red-600 font-mono">{periodMetrics ? (periodMetrics.maxDrawdown < 0 ? `(${Math.abs(periodMetrics.maxDrawdown).toFixed(1)}%)` : `${periodMetrics.maxDrawdown.toFixed(1)}%`) : '--'}</p>
                            <p className="text-xs text-wallstreet-500 mt-1">Largest decline from peak</p>
                        </div>
                    </div>
                    <div className="mt-4 p-4 bg-wallstreet-900 rounded-xl border border-wallstreet-700">
                        <p className="text-xs text-wallstreet-500 uppercase font-bold tracking-wider mb-2">Alpha ({selectedPeriod} Excess Return)</p>
                        <p className={`text-3xl font-bold font-mono ${periodMetrics && periodMetrics.alpha >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {periodMetrics ? formatPercent(periodMetrics.alpha) : '--'}
                        </p>
                        <p className="text-xs text-wallstreet-500 mt-1">
                            {periodMetrics?.alpha !== undefined ? (
                                periodMetrics.alpha > 0 ? 'Outperforming the benchmark' : 'Underperforming the benchmark'
                            ) : '--'}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};
