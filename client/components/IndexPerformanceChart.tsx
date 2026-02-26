import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';

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
            return { start: new Date(now.getFullYear(), 0, 1) };
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
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('1Y');

    const chartData = useMemo(() => {
        const acwi = data['ACWI'] || [];
        const xiu = data['XIU.TO'] || [];
        const index = data['Index'] || [];

        if (acwi.length === 0 || xiu.length === 0) return [];

        // Filter by period
        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';

        // Create a map for quick lookup by date
        const dateMap = new Map<string, { date: string, ACWI?: number, XIU?: number, Index?: number }>();

        acwi.forEach(item => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                dateMap.set(item.date, { date: item.date, ACWI: item.value });
            }
        });

        xiu.forEach(item => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                const existing = dateMap.get(item.date) || { date: item.date };
                dateMap.set(item.date, { ...existing, XIU: item.value });
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
            .filter(item => item.ACWI !== undefined && item.XIU !== undefined)
            .sort((a, b) => a.date.localeCompare(b.date));

        // Normalize to start at 0%
        if (combined.length > 0) {
            const startACWI = combined[0].ACWI!;
            const startXIU = combined[0].XIU!;
            const startIndex = combined[0].Index;

            return combined.map(item => {
                const pt: any = {
                    date: item.date,
                    ACWI: ((item.ACWI! - startACWI) / startACWI) * 100,
                    XIU: ((item.XIU! - startXIU) / startXIU) * 100,
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
            xiu: calcCAGR(lastPoint.XIU),
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

    // Dynamic date formatters based on period - only show unique labels
    const formatXAxis = (str: string) => {
        const date = new Date(str);
        const month = date.getMonth();
        const year = date.getFullYear();

        if (selectedPeriod === '3Y' || selectedPeriod === '5Y') {
            // Multi-year: show "Jan 2024" format for January, "Jul" for mid-year
            if (month === 0) {
                return year.toString();
            }
            return '';
        } else {
            // For shorter periods: show "Jan" or "Jan '25" at year boundaries
            const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
            if (month === 0) {
                return `${monthName} '${year.toString().slice(-2)}`;
            }
            return monthName;
        }
    };

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

    const formatTooltipDate = (str: string) => {
        const date = new Date(str);
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    };

    const formatPercent = (val: number | undefined) => {
        if (val === undefined) return 'N/A';
        return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
    };

    const getPerformanceColor = (val: number | undefined) => {
        if (val === undefined) return 'text-slate-400';
        if (val > 0) return 'text-green-600';
        if (val < 0) return 'text-red-500';
        return 'text-slate-500';
    };

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
                <div className="flex bg-slate-100 px-1 rounded-xl items-center h-9 overflow-x-auto max-w-full">
                    {(['2025', 'YTD', '3M', '6M', '1Y', '3Y', '5Y'] as Period[]).map((period) => (
                        <React.Fragment key={period}>
                            <button
                                onClick={() => setSelectedPeriod(period)}
                                className={`px-3 h-7 flex items-center justify-center text-xs font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period
                                    ? 'bg-wallstreet-accent text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                                    }`}
                            >
                                {period}
                            </button>
                            {period === '2025' && <div className="mx-1 w-px bg-slate-400 h-full" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* Performance Summary Cards */}
                {performanceMetrics && (
                    <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-slate-400 italic text-[15px] tracking-wider">CAGR (Annualized)</span>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 ${getPerformanceColor(performanceMetrics.index)}`}>
                            {getPerformanceIcon(performanceMetrics.index)}
                            <span className="font-bold text-emerald-700">75/25:</span>
                            <span className="font-bold">{formatPercent(performanceMetrics.index)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 ${getPerformanceColor(performanceMetrics.acwi)}`}>
                            {getPerformanceIcon(performanceMetrics.acwi)}
                            <span className="font-bold text-blue-700">ACWI:</span>
                            <span className="font-bold">{formatPercent(performanceMetrics.acwi)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 ${getPerformanceColor(performanceMetrics.xiu)}`}>
                            {getPerformanceIcon(performanceMetrics.xiu)}
                            <span className="font-bold text-red-700">XIU:</span>
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

                                // Sort payload by value descending (highest first)
                                const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));

                                const getDisplayName = (dataKey: string) => {
                                    if (dataKey === 'Index') return 'Global 75/25';
                                    if (dataKey === 'ACWI') return 'ACWI (Global)';
                                    if (dataKey === 'XIU') return 'XIU (Canada)';
                                    return dataKey;
                                };

                                return (
                                    <div className="bg-white/95 border border-slate-200 rounded-xl shadow-lg p-3 font-mono text-sm">
                                        <p className="font-bold text-slate-600 mb-2 border-b pb-1">{formatTooltipDate(String(label))}</p>
                                        {sorted.map((entry, idx) => (
                                            <div key={entry.dataKey} className="flex justify-between items-center gap-4 py-0.5">
                                                <span style={{ color: entry.color }} className="font-medium">
                                                    {getDisplayName(entry.dataKey as string)}:
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
                        <Legend
                            wrapperStyle={{ paddingTop: '15px' }}
                            formatter={(value) => {
                                if (value === 'Index') return 'Global 75/25 (Composite)';
                                if (value === 'ACWI') return 'ACWI (Global Markets)';
                                if (value === 'XIU') return 'XIU (Canada TSX)';
                                return value;
                            }}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                        {/* Quarter-end and year-end vertical lines */}
                        {quarterEndLines.map((line, idx) => (
                            <ReferenceLine
                                key={`q-${idx}`}
                                x={line.date}
                                stroke="#cbd5e1"
                                strokeWidth={line.isYearEnd ? 1.5 : 1}
                                strokeDasharray={line.isYearEnd ? '0' : '4 4'}
                            />
                        ))}
                        <Line
                            type="monotone"
                            dataKey="Index"
                            name="Index"
                            stroke="#10b981"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="ACWI"
                            name="ACWI"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="XIU"
                            name="XIU"
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
