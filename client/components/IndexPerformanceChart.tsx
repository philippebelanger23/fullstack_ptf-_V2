import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatXAxis as formatXAxisBase, formatTooltipDate, formatPercent, getPerformanceColor } from '../utils/formatters';
import { useThemeColors } from '../hooks/useThemeColors';

type Period = 'YTD' | '3M' | '6M' | '1Y' | '3Y' | '5Y';

interface IndexPerformanceChartProps {
    data: Record<string, { date: string, value: number }[]>;
}

const getDateRangeForPeriod = (period: Period): { start: Date; end?: Date } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    switch (period) {
        case 'YTD':
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
    }
};

const getTodayIsoDate = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString().split('T')[0];
};

export const IndexPerformanceChart: React.FC<IndexPerformanceChartProps> = ({ data }) => {
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const tc = useThemeColors();

    const chartData = useMemo(() => {
        const acwi = data['ACWI'] || [];
        const xic = data['XIC.TO'] || [];
        const composite = data['75/25'] || [];
        if (acwi.length === 0 || xic.length === 0) return [];

        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const todayStr = getTodayIsoDate();
        const endDateStr = end
            ? [end.toISOString().split('T')[0], todayStr].sort()[0]
            : todayStr;
        const dateMap = new Map<string, { date: string; ACWI?: number; XIC?: number; Composite?: number }>();

        acwi.forEach((item) => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                dateMap.set(item.date, { date: item.date, ACWI: item.value });
            }
        });
        xic.forEach((item) => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                const existing = dateMap.get(item.date) || { date: item.date };
                dateMap.set(item.date, { ...existing, XIC: item.value });
            }
        });
        composite.forEach((item) => {
            if (item.date >= startDateStr && item.date <= endDateStr) {
                const existing = dateMap.get(item.date) || { date: item.date };
                dateMap.set(item.date, { ...existing, Composite: item.value });
            }
        });

        const combined = Array.from(dateMap.values())
            .filter((item) => item.ACWI !== undefined && item.XIC !== undefined)
            .sort((a, b) => a.date.localeCompare(b.date));

        if (combined.length === 0) return [];

        const startACWI = combined[0].ACWI!;
        const startXIC = combined[0].XIC!;
        const startComposite = combined[0].Composite;

        return combined.map((item) => {
            const point: Record<string, string | number> = {
                date: item.date,
                ACWI: ((item.ACWI! - startACWI) / startACWI) * 100,
                XIC: ((item.XIC! - startXIC) / startXIC) * 100,
            };
            if (startComposite !== undefined && item.Composite !== undefined) {
                point.Composite = ((item.Composite - startComposite) / startComposite) * 100;
            }
            return point;
        });
    }, [data, selectedPeriod]);

    const performanceMetrics = useMemo(() => {
        if (chartData.length === 0) return null;
        const lastPoint = chartData[chartData.length - 1] as Record<string, number>;

        const yearsInPeriod = (() => {
            switch (selectedPeriod) {
                case 'YTD': {
                    const now = new Date();
                    const yearStart = new Date(now.getFullYear(), 0, 1);
                    const days = (now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24);
                    return Math.max(days / 365, 0.01);
                }
                case '3M':
                    return 0.25;
                case '6M':
                    return 0.5;
                case '1Y':
                    return 1;
                case '3Y':
                    return 3;
                case '5Y':
                    return 5;
            }
        })();

        const calcCagr = (cumulative: number | undefined) => {
            if (cumulative === undefined) return undefined;
            return (Math.pow(1 + cumulative / 100, 1 / yearsInPeriod) - 1) * 100;
        };

        return {
            composite: calcCagr(lastPoint.Composite),
            acwi: calcCagr(lastPoint.ACWI),
            xic: calcCagr(lastPoint.XIC),
        };
    }, [chartData, selectedPeriod]);

    const monthlyTicks = useMemo(() => {
        const ticks: string[] = [];
        let lastMonth = -1;
        let lastYear = -1;

        chartData.forEach((item) => {
            const date = new Date(String(item.date));
            const month = date.getMonth();
            const year = date.getFullYear();
            if (month !== lastMonth || year !== lastYear) {
                ticks.push(String(item.date));
                lastMonth = month;
                lastYear = year;
            }
        });

        if (selectedPeriod === '3Y' || selectedPeriod === '5Y') {
            return ticks.filter((_, index) => index % 6 === 0);
        }
        if (selectedPeriod === '1Y') {
            return ticks.filter((_, index) => index % 2 === 0);
        }
        return ticks;
    }, [chartData, selectedPeriod]);

    const quarterEndLines = useMemo(() => {
        const lines: { date: string; isYearEnd: boolean }[] = [];
        let lastQuarter = -1;

        chartData.forEach((item) => {
            const date = new Date(String(item.date));
            const quarter = Math.floor(date.getMonth() / 3);
            if (quarter !== lastQuarter && lastQuarter !== -1) {
                lines.push({ date: String(item.date), isYearEnd: lastQuarter === 3 });
            }
            lastQuarter = quarter;
        });

        return lines;
    }, [chartData]);

    const getPerformanceIcon = (val: number | undefined) => {
        if (val === undefined) return <Minus size={14} />;
        if (val > 0) return <TrendingUp size={14} />;
        if (val < 0) return <TrendingDown size={14} />;
        return <Minus size={14} />;
    };

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-wallstreet-500 font-mono text-sm">
                Insufficient data for graph
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="grid w-full max-w-[390px] grid-cols-6 items-center h-9 bg-wallstreet-900 px-1 rounded-xl">
                    {(['YTD', '3M', '6M', '1Y', '3Y', '5Y'] as Period[]).map((period) => (
                        <button
                            key={period}
                            onClick={() => setSelectedPeriod(period)}
                            className={`w-full h-7 flex items-center justify-center px-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period ? 'bg-wallstreet-accent text-white shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'}`}
                        >
                            {period}
                        </button>
                    ))}
                </div>

                {performanceMetrics && (
                    <div className="flex items-center justify-end gap-3 flex-wrap w-full text-xs font-mono">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-700 ${getPerformanceColor(performanceMetrics.composite)}`}>
                            {getPerformanceIcon(performanceMetrics.composite)}
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">75/25 Composite:</span>
                            <span className="font-bold">{formatPercent(performanceMetrics.composite)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 ${getPerformanceColor(performanceMetrics.acwi)}`}>
                            {getPerformanceIcon(performanceMetrics.acwi)}
                            <span className="font-bold text-blue-700 dark:text-blue-300">ACWI:</span>
                            <span className="font-bold">{formatPercent(performanceMetrics.acwi)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-700 ${getPerformanceColor(performanceMetrics.xic)}`}>
                            {getPerformanceIcon(performanceMetrics.xic)}
                            <span className="font-bold text-red-700 dark:text-red-300">TSX:</span>
                            <span className="font-bold">{formatPercent(performanceMetrics.xic)}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tc.gridStroke} />
                        <XAxis
                            dataKey="date"
                            tickFormatter={(value) => formatXAxisBase(String(value), selectedPeriod)}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            tickLine={false}
                            axisLine={false}
                            ticks={monthlyTicks}
                        />
                        <YAxis
                            tickFormatter={(value) => value < 0 ? `(${Math.abs(Number(value)).toFixed(0)}%)` : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(0)}%`}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            tickLine={false}
                            axisLine={false}
                            width={50}
                        />
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const order = ['Composite', 'XIC', 'ACWI'] as const;
                                const entriesByKey = new Map(
                                    payload
                                        .filter((entry) => entry.dataKey)
                                        .map((entry) => [String(entry.dataKey), entry])
                                );
                                const compositeEntry = entriesByKey.get('Composite');
                                const detailEntries = order
                                    .slice(1)
                                    .map((key) => entriesByKey.get(key))
                                    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

                                const getDisplayName = (dataKey: string) => {
                                    if (dataKey === 'Composite') return '75/25 Composite';
                                    if (dataKey === 'ACWI') return 'ACWI (CAD)';
                                    if (dataKey === 'XIC') return 'XIC.TO (Canada)';
                                    return dataKey;
                                };

                                return (
                                    <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-lg p-3 font-mono text-sm">
                                        <p className="font-bold text-wallstreet-500 mb-2 border-b border-wallstreet-700 pb-1">{formatTooltipDate(String(label))}</p>
                                        {compositeEntry && (
                                            <div className="flex justify-between items-center gap-4 py-0.5">
                                                <span style={{ color: compositeEntry.color }} className="font-medium">
                                                    {getDisplayName(String(compositeEntry.dataKey))}:
                                                </span>
                                                <span style={{ color: compositeEntry.color }} className="font-bold">
                                                    {Number(compositeEntry.value) < 0 ? `(${Math.abs(Number(compositeEntry.value)).toFixed(2)}%)` : `${Number(compositeEntry.value) > 0 ? '+' : ''}${Number(compositeEntry.value).toFixed(2)}%`}
                                                </span>
                                            </div>
                                        )}
                                        {compositeEntry && detailEntries.length > 0 && <div className="h-2" />}
                                        {detailEntries.map((entry) => (
                                            <div key={String(entry.dataKey)} className="flex justify-between items-center gap-4 py-0.5">
                                                <span style={{ color: entry.color }} className="font-medium">
                                                    {getDisplayName(String(entry.dataKey))}:
                                                </span>
                                                <span style={{ color: entry.color }} className="font-bold">
                                                    {Number(entry.value) < 0 ? `(${Math.abs(Number(entry.value)).toFixed(2)}%)` : `${Number(entry.value) > 0 ? '+' : ''}${Number(entry.value).toFixed(2)}%`}
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
                                if (value === 'Composite') return '75/25 Composite';
                                if (value === 'ACWI') return 'ACWI (CAD)';
                                if (value === 'XIC') return 'XIC.TO (Canada)';
                                return value;
                            }}
                        />
                        <ReferenceLine y={0} stroke={tc.referenceLine} strokeDasharray="4 4" />
                        {quarterEndLines.map((line, index) => (
                            <ReferenceLine
                                key={`q-${index}`}
                                x={line.date}
                                stroke={tc.gridStroke}
                                strokeWidth={line.isYearEnd ? 1.5 : 1}
                                strokeDasharray={line.isYearEnd ? '0' : '4 4'}
                            />
                        ))}
                        <Line type="monotone" dataKey="Composite" name="75/25 Composite" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} />
                        <Line type="monotone" dataKey="ACWI" name="ACWI (CAD)" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                        <Line type="monotone" dataKey="XIC" name="XIC.TO" stroke="#dc2626" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
