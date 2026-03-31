import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { formatXAxis as formatXAxisBase, formatTooltipDate, formatPercent, getPerformanceColor } from '../utils/formatters';
import { useThemeColors } from '../hooks/useThemeColors';

type Period = 'YTD' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '2025';

interface IndexPerformanceChartProps {
    data: Record<string, { date: string, value: number }[]>;
}

const periodLabels: Record<Period, string> = {
    'YTD': 'Year to Date',
    '3M': '3 Months',
    '6M': '6 Months',
    '1Y': '1 Year',
    '3Y': '3 Years',
    '5Y': '5 Years',
    '2025': '2025'
};

const getDateRangeForPeriod = (period: Period): { start: Date; end?: Date } => {
    const now = new Date();
    // Reset time to midnight for consistency
    now.setHours(0, 0, 0, 0);

    switch (period) {
        case '2025':
            return {
                start: new Date(2025, 0, 1),
                end: new Date(2025, 11, 31)
            };
        case 'YTD':
            // Dec 31 of prior year — matches financial reporting convention and
            // aligns with attribution's period-start (same as PerformanceView/ReportView).
            return { start: new Date(now.getFullYear() - 1, 11, 31) };
        case '3M': {
            const date = new Date(now);
            date.setMonth(date.getMonth() - 3);
            return { start: date };
        }
        case '6M': {
            const date = new Date(now);
            date.setMonth(date.getMonth() - 6);
            return { start: date };
        }
        case '1Y': {
            const date = new Date(now);
            date.setFullYear(date.getFullYear() - 1);
            return { start: date };
        }
        case '3Y': {
            const date = new Date(now);
            date.setFullYear(date.getFullYear() - 3);
            return { start: date };
        }
        case '5Y': {
            const date = new Date(now);
            date.setFullYear(date.getFullYear() - 5);
            return { start: date };
        }
        default: {
            const date = new Date(now);
            date.setFullYear(date.getFullYear() - 5);
            return { start: date };
        }
    }
};

export const IndexPerformanceChart: React.FC<IndexPerformanceChartProps> = ({ data }) => {
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const tc = useThemeColors();

    const chartData = useMemo(() => {
        const acwi = data['ACWI'] || [];
        const xiu = data['XIC.TO'] || [];
        const index = data['Index'] || [];

        if (acwi.length === 0 || xiu.length === 0) return [];

        // Filter by period
        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';

        // Create a map for quick lookup by date
        const dateMap = new Map<string, { date: string, ACWI?: number, XIC?: number, Index?: number }>();

        acwi.forEach(item => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                dateMap.set(item.date, { date: item.date, ACWI: item.value });
            }
        });

        xiu.forEach(item => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                const existing = dateMap.get(item.date) || { date: item.date };
                dateMap.set(item.date, { ...existing, XIC: item.value });
            }
        });

        index.forEach(item => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                const existing = dateMap.get(item.date) || { date: item.date };
                dateMap.set(item.date, { ...existing, Index: item.value });
            }
        });

        // Convert map to array and sort by date
        const combined = Array.from(dateMap.values())
            .filter(item => item.ACWI !== undefined && item.XIC !== undefined)
            .sort((a, b) => a.date.localeCompare(b.date));

        // Normalize to start at 0%
        if (combined.length > 0) {
            const startACWI = combined[0].ACWI!;
            const startXIC = combined[0].XIC!;
            const startIndex = combined[0].Index;

            return combined.map(item => {
                const pt: any = {
                    date: item.date,
                    ACWI: ((item.ACWI! - startACWI) / startACWI) * 100,
                    XIC: ((item.XIC! - startXIC) / startXIC) * 100,
                };

                if (startIndex !== undefined && item.Index !== undefined) {
                    pt.Index = ((item.Index - startIndex) / startIndex) * 100;
                }

                return pt;
            });
        }

        return [];
    }, [data, selectedPeriod]);

    // Calculate CAGR for the selected period
    const performanceMetrics = useMemo(() => {
        if (chartData.length === 0) return null;

        const lastPoint = chartData[chartData.length - 1];

        // Calculate years in the period
        const getYearsInPeriod = (): number => {
            switch (selectedPeriod) {
                case '2025': return 1;
                case 'YTD': {
                    // Days since Jan 1 of current year
                    const now = new Date();
                    const yearStart = new Date(now.getFullYear(), 0, 1);
                    const days = (now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24);
                    return Math.max(days / 365, 0.01); // Avoid division by zero
                }
                case '3M': return 0.25;
                case '6M': return 0.5;
                case '1Y': return 1;
                case '3Y': return 3;
                case '5Y': return 5;
                default: return 1;
            }
        };

        const years = getYearsInPeriod();

        // CAGR formula: (1 + cumulative_return)^(1/years) - 1
        // cumulative_return is already in percentage, so divide by 100
        const calcCAGR = (cumulative: number | undefined): number | undefined => {
            if (cumulative === undefined) return undefined;
            const cumulativeDecimal = cumulative / 100;
            const cagr = (Math.pow(1 + cumulativeDecimal, 1 / years) - 1) * 100;
            return cagr;
        };

        return {
            acwi: calcCAGR(lastPoint.ACWI),
            xiu: calcCAGR(lastPoint.XIC),
            index: calcCAGR(lastPoint.Index),
            isCAGR: years >= 1, // Only label as CAGR if period >= 1 year
        };
    }, [chartData, selectedPeriod]);

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-wallstreet-500 font-mono text-sm">
                Insufficient data for graph
            </div>
        );
    }

    const formatXAxis = (str: string) => formatXAxisBase(str, selectedPeriod);

    // Get ticks that represent first trading day of each month (no duplicates)
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

        // For very short periods, return all ticks; otherwise thin them out
        if (selectedPeriod === '3Y' || selectedPeriod === '5Y') {
            // Show roughly every 6 months for multi-year
            return ticks.filter((_, i) => i % 6 === 0);
        } else if (selectedPeriod === '1Y') {
            // Show every other month for 1Y
            return ticks.filter((_, i) => i % 2 === 0);
        }
        return ticks;
    }, [chartData, selectedPeriod]);

    // Get quarter-end and year-end dates for vertical reference lines
    const quarterEndLines = useMemo(() => {
        const lines: { date: string; isYearEnd: boolean }[] = [];
        let lastQuarter = -1;
        let lastYear = -1;

        chartData.forEach(item => {
            const date = new Date(item.date);
            const month = date.getMonth();
            const year = date.getFullYear();
            const quarter = Math.floor(month / 3);

            // Detect quarter transitions (Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec)
            if (quarter !== lastQuarter && lastQuarter !== -1) {
                // The previous quarter just ended
                const isYearEnd = lastQuarter === 3; // Q4 ending = year end
                lines.push({ date: item.date, isYearEnd });
            }

            lastQuarter = quarter;
            lastYear = year;
        });

        return lines;
    }, [chartData]);

    const getPerformanceIcon = (val: number | undefined) => {
        if (val === undefined) return <Minus size={14} />;
        if (val > 0) return <TrendingUp size={14} />;
        if (val < 0) return <TrendingDown size={14} />;
        return <Minus size={14} />;
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Period Selector & Performance Summary */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                {/* Period Selector Pills */}
                <div className="grid w-full max-w-[440px] grid-cols-7 items-center h-9 bg-wallstreet-900 px-1 rounded-xl">
                    {(['2025', 'YTD', '3M', '6M', '1Y', '3Y', '5Y'] as Period[]).map((period) => (
                        <button
                            key={period}
                            onClick={() => setSelectedPeriod(period)}
                            className={`w-full h-7 flex items-center justify-center px-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period
                                ? 'bg-wallstreet-accent text-white shadow-sm'
                                : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                } ${period === '2025' ? 'relative after:content-[""] after:absolute after:top-0 after:-right-[1px] after:h-full after:w-px after:bg-wallstreet-500/40 after:rounded-none pr-0.5' : ''}`}
                        >
                            {period}
                        </button>
                    ))}
                </div>

                {/* Performance Summary Cards */}
                {performanceMetrics && (
                    <div className="flex items-center justify-end gap-3 flex-wrap w-full text-xs font-mono">
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-700 ${getPerformanceColor(performanceMetrics.index)}`}>
                                {getPerformanceIcon(performanceMetrics.index)}
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">75/25 Composite:</span>
                                <span className="font-bold">{formatPercent(performanceMetrics.index)}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 ${getPerformanceColor(performanceMetrics.acwi)}`}>
                                {getPerformanceIcon(performanceMetrics.acwi)}
                                <span className="font-bold text-blue-700 dark:text-blue-300">ACWI:</span>
                                <span className="font-bold">{formatPercent(performanceMetrics.acwi)}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-700 ${getPerformanceColor(performanceMetrics.xiu)}`}>
                                {getPerformanceIcon(performanceMetrics.xiu)}
                                <span className="font-bold text-red-700 dark:text-red-300">TSX:</span>
                                <span className="font-bold">{formatPercent(performanceMetrics.xiu)}</span>
                            </div>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                            <linearGradient id="indexGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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

                                // Sort payload by value descending (highest first)
                                const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));

                                const getDisplayName = (dataKey: string) => {
                                    if (dataKey === 'Index') return '75/25 Composite';
                                    if (dataKey === 'ACWI') return 'ACWI (CAD)';
                                    if (dataKey === 'XIC') return 'XIC.TO (Canada)';
                                    return dataKey;
                                };

                                return (
                                    <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                        <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                        {sorted.map((entry, idx) => (
                                            <div key={entry.dataKey} className="flex justify-between items-center gap-4 py-0.5">
                                                <span style={{ color: entry.color }} className="font-medium">
                                                    {getDisplayName(entry.dataKey as string)}:
                                                </span>
                                                <span style={{ color: entry.color }} className="font-bold">
                                                    {(entry.value as number) < 0 ? `(${Math.abs(entry.value as number).toFixed(2)}%)` : `${(entry.value as number) > 0 ? '+' : ''}${(entry.value as number).toFixed(2)}%`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '15px' }}
                            formatter={(value) => {
                                if (value === 'Index') return '75/25 Composite';
                                if (value === 'ACWI') return 'ACWI (CAD)';
                                if (value === 'XIC') return 'XIC.TO (Canada)';
                                return value;
                            }}
                        />
                        <ReferenceLine y={0} stroke={tc.referenceLine} strokeDasharray="4 4" />
                        {/* Quarter-end and year-end vertical lines */}
                        {quarterEndLines.map((line, idx) => (
                            <ReferenceLine
                                key={`q-${idx}`}
                                x={line.date}
                                stroke={tc.gridStroke}
                                strokeWidth={line.isYearEnd ? 1.5 : 1}
                                strokeDasharray={line.isYearEnd ? '0' : '4 4'}
                            />
                        ))}
                        <Line
                            type="monotone"
                            dataKey="Index"
                            name="75/25 Composite"
                            stroke="#10b981"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="ACWI"
                            name="ACWI (CAD)"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="XIC"
                            name="XIC.TO"
                            stroke="#dc2626"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
