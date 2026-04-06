import React, { useMemo, useState, useId } from 'react';
import { Info } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { formatPercent, formatTooltipDate } from '../../utils/formatters';
import type { PeriodMetrics } from './PerformanceKPIs';
import { useThemeColors } from '../../hooks/useThemeColors';

type ChartView = 'absolute' | 'relative' | 'drawdowns';

interface UnifiedPerformancePanelProps {
    chartData: Record<string, unknown>[];
    chartView: ChartView;
    periodMetrics: PeriodMetrics | null;
    selectedPeriod: string;
    benchmark: string;
    loading?: boolean;
    hideKPIs?: boolean;
    noWrapper?: boolean;
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
    'Total Return': 'Cumulative return of the portfolio over the selected period, expressed as a percentage.',
    'Sharpe Ratio': 'Risk-adjusted return metric. Higher values indicate better risk-adjusted performance.',
    'Sortino Ratio': 'Similar to Sharpe but only penalizes downside volatility, ignoring upside movements.',
    'Volatility': 'Standard deviation of returns, measuring the variability and risk of the portfolio.',
    'Info Ratio': 'Measures excess return per unit of tracking error. Indicates how consistently the portfolio outperforms.',
    'Beta': 'Measures portfolio sensitivity to market movements. Beta > 1 means more volatile than benchmark.',
    'Max Drawdown': 'Largest peak-to-trough decline from a historical high. Indicates worst-case scenario loss.',
};

export const UnifiedPerformancePanel: React.FC<UnifiedPerformancePanelProps> = ({
    chartData,
    chartView,
    periodMetrics,
    selectedPeriod,
    benchmark,
    loading = false,
    hideKPIs = false,
    noWrapper = false,
}) => {
    const tc = useThemeColors();
    const uid = useId();
    const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);
    const benchmarkLabel = benchmark === '75/25' ? '75/25 Composite'
        : benchmark === 'ACWI' ? 'ACWI (CAD)'
        : benchmark === 'TSX' ? 'TSX'
        : 'S&P 500';
    const benchmarkColor = benchmark === '75/25' ? '#10b981'
        : benchmark === 'ACWI' ? '#2563eb'
        : benchmark === 'TSX' ? '#dc2626'
        : '#8b5cf6'; // SP500 = violet

    const formatXAxis = (str: string) => {
        if (!str) return '';
        const date = new Date(str);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();

        // Check if we have data spanning multiple years by looking at the first and last dates in chartData
        const hasMultipleYears = chartData.length > 0 &&
            new Date(chartData[0]?.date as string).getFullYear() !== new Date(chartData[chartData.length - 1]?.date as string).getFullYear();

        // Show year if data spans multiple years, or if it's a boundary month (Jan/Dec)
        if (hasMultipleYears || date.getMonth() === 0 || date.getMonth() === 11) {
            return `${day} ${month} ${year}`;
        }
        return `${day} ${month}`;
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

    const metrics = [
        { label: 'Total Return', ptf: periodMetrics?.totalReturn, bmk: periodMetrics?.benchmarkReturn, format: 'percent' },
        { label: 'Sharpe Ratio', ptf: periodMetrics?.sharpeRatio, bmk: periodMetrics?.benchmarkSharpe, format: 'decimal' },
        { label: 'Sortino Ratio', ptf: periodMetrics?.sortinoRatio, bmk: periodMetrics?.benchmarkSortino, format: 'decimal' },
        { label: 'Volatility', ptf: periodMetrics?.volatility, bmk: periodMetrics?.benchmarkVolatility, format: 'vol' },
        { label: 'Info Ratio', ptf: periodMetrics?.informationRatio, bmk: 0, format: 'decimal' },
        { label: 'Beta', ptf: periodMetrics?.beta, bmk: 1, format: 'decimal' },
        { label: 'Max Drawdown', ptf: periodMetrics?.maxDrawdown, bmk: periodMetrics?.benchmarkMaxDrawdown, format: 'drawdown' },
    ];

    const formatValue = (value: number | undefined, format: string) => {
        if (value === undefined || value === null) return '--';
        switch (format) {
            case 'percent':
                return formatPercent(value);
            case 'vol':
            case 'drawdown':
                return `${value < 0 ? '(' : ''}${Math.abs(value).toFixed(1)}%${value < 0 ? ')' : ''}`;
            case 'decimal':
                return value < 0 ? `(${Math.abs(value).toFixed(2)})` : value.toFixed(2);
            default:
                return value.toFixed(2);
        }
    };

    const getValueColor = (value: number | undefined, format: string) => {
        if (value === undefined || value === null) return 'text-wallstreet-500';
        if (format === 'decimal' || format === 'vol') {
            return value >= 0 ? 'text-wallstreet-text' : 'text-red-600';
        }
        return value >= 0 ? 'text-emerald-600' : 'text-red-600';
    };

    const getDeltaColor = (value: number | undefined, metricLabel: string) => {
        if (value === undefined || value === null) return 'text-wallstreet-500';
        // Metrics where positive delta (higher) is better
        const positiveBetter = ['Total Return', 'Sharpe Ratio', 'Sortino Ratio', 'Info Ratio', 'Max Drawdown'];
        // Metrics where negative delta (lower) is better
        const negativeBetter = ['Volatility'];

        if (positiveBetter.includes(metricLabel)) {
            return value >= 0 ? 'text-emerald-600' : 'text-red-600';
        } else if (negativeBetter.includes(metricLabel)) {
            return value < 0 ? 'text-emerald-600' : 'text-red-600';
        }
        // Default: neutral color
        return 'text-wallstreet-text';
    };

    return (
        <div className={`${noWrapper ? 'flex-1' : 'bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm h-[calc(100vh-280px)]'} flex flex-col ${hideKPIs ? '' : 'lg:flex-row gap-6'}`}>
            {/* 70% - Chart (full width when hideKPIs) */}
            <div className={`${hideKPIs ? 'w-full' : 'lg:w-[70%]'} w-full flex-1 flex flex-col`}>
                <div className="w-full h-full">
                    {loading ? (
                        <div className="w-full h-full relative overflow-hidden">
                            <svg className="w-full h-full" viewBox="0 0 500 190" preserveAspectRatio="none">
                                <defs>
                                    <linearGradient id={`${uid}-shimmer`} x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="transparent" />
                                        <stop offset="50%" stopColor="rgba(148,163,184,0.09)" />
                                        <stop offset="100%" stopColor="transparent" />
                                    </linearGradient>
                                </defs>
                                {/* Grid lines */}
                                {[38, 76, 114, 152].map(y => (
                                    <line key={y} x1="48" y1={y} x2="492" y2={y} stroke="#1e293b" strokeWidth="1" />
                                ))}
                                {/* Y-axis label placeholders */}
                                {[34, 72, 110, 148].map(y => (
                                    <rect key={y} x="2" y={y} width="36" height="9" rx="3" fill="#1e293b">
                                        <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" />
                                    </rect>
                                ))}
                                {/* Ghost portfolio line */}
                                <polyline
                                    points="52,158 105,144 165,130 220,136 275,118 330,108 385,92 440,98 490,80"
                                    fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25">
                                    <animate attributeName="stroke-opacity" values="0.25;0.10;0.25" dur="2s" repeatCount="indefinite" />
                                </polyline>
                                {/* Ghost benchmark line */}
                                <polyline
                                    points="52,165 105,153 165,141 220,147 275,130 330,120 385,106 440,112 490,96"
                                    fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 5" strokeOpacity="0.2">
                                    <animate attributeName="stroke-opacity" values="0.2;0.07;0.2" dur="2s" begin="0.4s" repeatCount="indefinite" />
                                </polyline>
                                {/* X-axis label placeholders */}
                                {[85, 175, 265, 355, 445].map(x => (
                                    <rect key={x} x={x - 25} y="178" width="50" height="9" rx="3" fill="#1e293b">
                                        <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" />
                                    </rect>
                                ))}
                                {/* Shimmer sweep */}
                                <rect fill={`url(#${uid}-shimmer)`} x="0" y="0" width="200" height="190">
                                    <animateTransform attributeName="transform" type="translate" from="-200 0" to="700 0" dur="2.2s" repeatCount="indefinite" />
                                </rect>
                            </svg>
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-wallstreet-500 font-mono text-sm">
                            Insufficient data for selected period
                        </div>
                    ) : (
                        <div key={chartView} className="w-full h-full">
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
                                        tick={{ fontSize: 13, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(0)}%)` : `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                        tick={{ fontSize: 13, fill: tc.tickFill }}
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
                                        stroke="#94a3b8"
                                        strokeWidth={2}
                                        fill="url(#splitColor)"
                                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#94a3b8' }}
                                                                           />
                                </AreaChart>
                            ) : chartView === 'drawdowns' ? (
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.04} />
                                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.45} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStroke} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 13, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(0)}%)` : '0%'}
                                        tick={{ fontSize: 13, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
                                            return (
                                                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                                    {sorted.map((entry) => {
                                                        const val = entry.value as number;
                                                        return (
                                                            <div key={entry.dataKey as string} className="flex justify-between items-center gap-4 py-0.5">
                                                                <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
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
                                    <Area type="monotone" dataKey="Portfolio" stroke="#10b981" strokeWidth={2.5} fill="url(#drawdownGradient)" dot={false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#10b981' }} />
                                    <Area type="monotone" dataKey="Benchmark" name={benchmarkLabel} stroke="#000000" strokeWidth={1.5} fill="none" fillOpacity={0} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: '#000000' }} />
                                </AreaChart>
                            ) : (
                                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStroke} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 13, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={getMonthlyTicks}
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => val < 0 ? `(${Math.abs(val).toFixed(0)}%)` : `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                        tick={{ fontSize: 13, fill: tc.tickFill }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
                                            return (
                                                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                                    {sorted.map((entry) => (
                                                        <div key={entry.dataKey as string} className="flex justify-between items-center gap-4 py-0.5">
                                                            <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
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
                                    <Line type="monotone" dataKey="Benchmark" name={benchmarkLabel} stroke="#000000" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* 30% - KPI Table */}
            {!hideKPIs && <div className="lg:w-[30%] w-full flex flex-col overflow-hidden">
                <h3 className="text-sm font-bold text-wallstreet-500 uppercase tracking-wider px-4 pb-3">Key Metrics ({selectedPeriod})</h3>
                <div className="flex-1 overflow-y-auto">
                    <div className="overflow-x-auto h-full">
                        <table className="w-full h-full text-base bg-wallstreet-900/30 rounded-xl overflow-hidden border border-wallstreet-700/30 table-fixed">
                            <colgroup>
                                <col className="w-[40%]" />
                                <col className="w-[20%]" />
                                <col className="w-[20%]" />
                                <col className="w-[20%]" />
                            </colgroup>
                            <thead>
                                <tr className="border-b border-wallstreet-700/50 sticky top-0 bg-wallstreet-900/50">
                                    <th className="px-3 py-2 text-left text-wallstreet-500 font-semibold">Metric</th>
                                    <th className="px-3 py-2 text-right text-wallstreet-500 font-semibold">Portfolio</th>
                                    <th className="px-3 py-2 text-right text-wallstreet-500 font-semibold">Benchmark</th>
                                    <th className="px-3 py-2 text-right text-wallstreet-500 font-semibold">Delta</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-wallstreet-700/30 h-full">
                                {metrics.map((metric, idx) => {
                                    const vs = (metric.ptf ?? 0) - (metric.bmk ?? 0);
                                    const isLast = idx === metrics.length - 1;
                                    return (
                                        <tr key={metric.label} className={`hover:bg-wallstreet-700/20 transition-colors ${isLast ? '' : ''}`}>
                                            <td className="px-3 py-2.5 font-medium text-wallstreet-400">
                                                <div className="flex items-center gap-2 relative group">
                                                    <span>{metric.label}</span>
                                                    <button
                                                        onMouseEnter={() => setHoveredMetric(metric.label)}
                                                        onMouseLeave={() => setHoveredMetric(null)}
                                                        className="relative flex items-center justify-center"
                                                    >
                                                        <Info size={14} className="text-wallstreet-500 hover:text-wallstreet-300 transition-colors cursor-help" />
                                                        {hoveredMetric === metric.label && (
                                                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-wallstreet-950 border border-wallstreet-500 rounded-lg p-3 text-xs text-wallstreet-100 z-10 shadow-xl whitespace-normal">
                                                                {METRIC_DESCRIPTIONS[metric.label] || 'No description available'}
                                                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-wallstreet-950" />
                                                            </div>
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className={`px-3 py-2.5 text-right font-mono font-bold ${getValueColor(metric.ptf, metric.format)}`}>
                                                {formatValue(metric.ptf, metric.format)}
                                            </td>
                                            <td className={`px-3 py-2.5 text-right font-mono font-bold ${getValueColor(metric.bmk, metric.format)}`}>
                                                {formatValue(metric.bmk, metric.format)}
                                            </td>
                                            <td className={`px-3 py-2.5 text-right font-mono font-bold ${getDeltaColor(vs, metric.label)}`}>
                                                {formatValue(vs, metric.format)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="text-xs text-wallstreet-500 px-4 mt-3 pt-3 border-t border-wallstreet-700/30">
                    <p>Benchmark: {benchmark === '75/25' ? '75/25 Composite (75% ACWI CAD + 25% XIC.TO)' : benchmark === 'ACWI' ? 'ACWI (CAD-converted)' : benchmark === 'TSX' ? 'XIC.TO (S&P/TSX Composite)' : 'S&P 500 CAD (XUS.TO)'}</p>
                </div>
            </div>}
        </div>
    );
};
