import React, { useMemo, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatPercent, formatTooltipDate } from '../../utils/formatters';
import type { PeriodMetrics } from './PerformanceKPIs';
import { useThemeColors } from '../../hooks/useThemeColors';

interface RelativePerformancePanelProps {
    chartData: Record<string, unknown>[];
    periodMetrics: PeriodMetrics | null;
    selectedPeriod: string;
    benchmark: string;
    loading?: boolean;
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
    'Total Return': 'Cumulative return of the portfolio over the selected period, expressed as a percentage.',
    'Alpha': 'Excess return of the portfolio compared to the benchmark. Positive alpha indicates outperformance.',
    'Sharpe Ratio': 'Risk-adjusted return metric. Higher values indicate better risk-adjusted performance.',
    'Sortino Ratio': 'Similar to Sharpe but only penalizes downside volatility, ignoring upside movements.',
    'Volatility': 'Standard deviation of returns, measuring the variability and risk of the portfolio.',
    'Info Ratio': 'Measures excess return per unit of tracking error. Indicates how consistently the portfolio outperforms.',
    'Beta': 'Measures portfolio sensitivity to market movements. Beta > 1 means more volatile than benchmark.',
    'Max Drawdown': 'Largest peak-to-trough decline from a historical high. Indicates worst-case scenario loss.',
};

export const RelativePerformancePanel: React.FC<RelativePerformancePanelProps> = ({
    chartData,
    periodMetrics,
    selectedPeriod,
    benchmark,
    loading = false,
}) => {
    const tc = useThemeColors();
    const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

    const formatXAxis = (str: string) => {
        if (!str) return '';
        const [y, m, d] = str.split('-');
        return `${d}/${m}`;
    };

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
        { label: 'Alpha', ptf: periodMetrics?.alpha, bmk: 0, format: 'percent' },
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

    return (
        <div className="bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-6 h-[700px]">
                {/* 70% - Chart */}
                <div className="lg:w-[70%] w-full h-full">
                    <div className="w-full h-full">
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
                                            const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
                                            return (
                                                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                                    <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                                    {sorted.map((entry) => (
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
                                    <ReferenceLine y={0} stroke={tc.referenceLine} strokeDasharray="4 4" />
                                    <Line type="monotone" dataKey="Portfolio" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} />
                                    <Line type="monotone" dataKey="Benchmark" stroke="#000000" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 30% - KPI Table */}
                <div className="lg:w-[30%] w-full h-full flex flex-col overflow-hidden">
                    <h3 className="text-sm font-bold text-wallstreet-500 uppercase tracking-wider px-4 pb-3">Key Metrics ({selectedPeriod})</h3>
                    <div className="flex-1 overflow-y-auto">
                        <div className="overflow-x-auto h-full">
                            <table className="w-full h-full text-xs bg-wallstreet-900/30 rounded-xl overflow-hidden border border-wallstreet-700/30">
                                <thead>
                                    <tr className="border-b border-wallstreet-700/50 sticky top-0 bg-wallstreet-900/50">
                                        <th className="px-3 py-2 text-left text-wallstreet-500 font-semibold">Metric</th>
                                        <th className="px-3 py-2 text-right text-wallstreet-500 font-semibold">Portfolio</th>
                                        <th className="px-3 py-2 text-right text-wallstreet-500 font-semibold">Benchmark</th>
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
                                                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-wallstreet-900 border border-wallstreet-600 rounded-lg p-2.5 text-xs text-wallstreet-300 z-10 shadow-lg whitespace-normal">
                                                                    {METRIC_DESCRIPTIONS[metric.label] || 'No description available'}
                                                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-wallstreet-900" />
                                                                </div>
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className={`px-3 py-2.5 text-right font-mono font-bold ${getValueColor(metric.ptf, metric.format)}`}>
                                                    {formatValue(metric.ptf, metric.format)}
                                                </td>
                                                <td className={`px-3 py-2.5 text-right font-mono ${getValueColor(metric.bmk, metric.format)}`}>
                                                    {formatValue(metric.bmk, metric.format)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="text-xs text-wallstreet-500 px-4 mt-3 pt-3 border-t border-wallstreet-700/30">
                        <p>Benchmark: {benchmark === '75/25' ? '75/25 Composite (75% ACWI (CAD) + 25% XIC.TO)' : benchmark === 'TSX' ? 'XIC.TO (S&P/TSX Composite)' : 'S&P 500 CAD (XUS.TO)'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
