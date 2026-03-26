import React, { memo, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useThemeColors } from '../hooks/useThemeColors';

interface AreaChartDataPoint {
    date: string;
    timestamp: number;
    [ticker: string]: number | string;
}

interface Props {
    data: AreaChartDataPoint[];
    topTickers: string[];
    dates: string[];
    colors: string[];
}

const formatDateTick = (value: number) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
    const day = date.getUTCDate();
    return `${month} ${day}`;
};

// Half-day tolerance to be robust against DST edge cases
const isTimestampMajorDate = (timestamp: number, xAxisTicks: number[]) => {
    return xAxisTicks.some((tick: number) => Math.abs(tick - timestamp) < 43200000);
};

const CustomAreaTooltip = ({ active, payload, label, xAxisTicks }: any) => {
    if (!active || !payload || !payload.length) return null;

    const isMajorDate = isTimestampMajorDate(label as number, xAxisTicks);
    const date = new Date(label as number);
    const dateDisplay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

    const filteredPayload = [...payload]
        .filter((p: any) => (p.value || 0) > 0.001)
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 10);

    const currentTotal = filteredPayload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);

    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 p-4 rounded-lg shadow-2xl text-xs font-mono min-w-[280px] z-50">
            <div className="mb-3 border-b border-wallstreet-700 pb-2 flex justify-between items-center gap-4">
                <span className="text-wallstreet-500 font-bold uppercase tracking-wider">
                    {dateDisplay}{isMajorDate ? ' · Rebalance' : ''}
                </span>
                <span className="text-wallstreet-text font-bold">{currentTotal.toFixed(1)}% Top 10</span>
            </div>
            <div className="space-y-2">
                {filteredPayload.map((entry: any, index: number) => (
                    <div key={index} className="grid grid-cols-[1fr_auto] gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                            <span className="text-wallstreet-text font-bold truncate max-w-[120px]">{entry.name}</span>
                        </div>
                        <div className="text-right text-wallstreet-text font-bold text-sm">{entry.value.toFixed(1)}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
};


export const PortfolioEvolutionChart = memo(({ data, topTickers, dates, colors }: Props) => {
    const tc = useThemeColors();
    const [selectedRange, setSelectedRange] = useState<'YTD' | '3M' | '6M' | '1Y' | 'ALL'>('YTD');

    const filteredData = useMemo(() => {
        let baseData = data;
        if (selectedRange !== 'ALL' && data.length) {
            const latestDateStr = data[data.length - 1].date as string;
            const latestDate = new Date(latestDateStr);
            const startDate = new Date(latestDate);

            if (selectedRange === 'YTD') { startDate.setMonth(0); startDate.setDate(1); }
            else if (selectedRange === '3M') startDate.setMonth(latestDate.getMonth() - 3);
            else if (selectedRange === '6M') startDate.setMonth(latestDate.getMonth() - 6);
            else if (selectedRange === '1Y') startDate.setFullYear(latestDate.getFullYear() - 1);

            baseData = data.filter(d => new Date(d.date as string) >= startDate);
        }

        const mappedData = baseData.map(d => ({
            ...d,
            timestamp: new Date(d.date as string).getTime()
        }));

        if (mappedData.length < 2) return mappedData;

        // Fill gaps to ensure smooth hover — use weekly steps for long ranges to reduce point count
        const filledData: AreaChartDataPoint[] = [];
        const oneDay = 24 * 60 * 60 * 1000;
        const fillStep = (selectedRange === '1Y' || selectedRange === 'ALL') ? 7 * oneDay : oneDay;

        for (let i = 0; i < mappedData.length - 1; i++) {
            const start = mappedData[i];
            const end = mappedData[i + 1];
            filledData.push(start);

            let currentTimestamp = start.timestamp + fillStep;
            while (currentTimestamp < end.timestamp) {
                filledData.push({
                    ...start,
                    date: new Date(currentTimestamp).toISOString().split('T')[0],
                    timestamp: currentTimestamp
                });
                currentTimestamp += fillStep;
            }
        }
        filledData.push(mappedData[mappedData.length - 1]);

        return filledData;
    }, [data, selectedRange]);

    const xAxisTicks = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return [];

        const ticks: number[] = [];
        ticks.push(new Date(filteredData[0].date as string).getTime());

        for (let i = 1; i < filteredData.length; i++) {
            const prev = filteredData[i - 1];
            const curr = filteredData[i];

            let changed = false;
            for (const ticker of topTickers) {
                if (Math.abs(((curr[ticker] as number) || 0) - ((prev[ticker] as number) || 0)) > 0.1) {
                    changed = true;
                    break;
                }
            }

            if (changed) {
                ticks.push(new Date(curr.date as string).getTime());
            }
        }

        const lastDate = filteredData[filteredData.length - 1];
        const lastTimestamp = new Date(lastDate.date as string).getTime();
        if (ticks[ticks.length - 1] !== lastTimestamp) {
            ticks.push(lastTimestamp);
        }

        return ticks;
    }, [filteredData, topTickers]);

    const yAxisTicks = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return [0, 20, 40, 60, 80, 100];

        const maxDataValue = Math.max(...filteredData.map(d => {
            return topTickers.reduce((sum, t) => sum + ((d[t] as number) || 0), 0);
        }));

        const paddedMax = Math.min(maxDataValue + 10, 100);
        const targetMax = Math.ceil(paddedMax / 5) * 5;

        let bestStep = 20;
        if (targetMax % 25 === 0 && targetMax / 25 <= 4) bestStep = 25;
        else if (targetMax % 20 === 0 && targetMax / 20 <= 5) bestStep = 20;
        else if (targetMax % 15 === 0 && targetMax / 15 <= 5) bestStep = 15;
        else if (targetMax % 10 === 0 && targetMax / 10 <= 6) bestStep = 10;
        else bestStep = Math.ceil(targetMax / 4 / 5) * 5;

        const ticks = [];
        for (let i = 0; i <= targetMax; i += bestStep) {
            ticks.push(i);
        }
        if (ticks[ticks.length - 1] < targetMax) {
            ticks.push(ticks[ticks.length - 1] + bestStep);
        }

        return ticks;
    }, [filteredData, topTickers]);

    return (
        <div className="lg:col-span-1 bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
            <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2">
                        <TrendingUp size={16} className="text-wallstreet-500" /> ACTUAL TOP 10 - HISTORICAL WEIGHTS
                    </h3>
                    <p className="text-xs text-wallstreet-500 mt-1">Historical absolute weight allocation of the top 10 positions over time</p>
                </div>
                <div className="flex items-center bg-wallstreet-900 rounded-lg p-1 border border-wallstreet-700 shadow-inner">
                    {(['YTD', '3M', '6M', '1Y', 'ALL'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setSelectedRange(range)}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono transition-all duration-200 ${
                                selectedRange === range
                                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/50'
                                    : 'text-wallstreet-500 hover:bg-wallstreet-700 hover:text-wallstreet-text'
                            }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 w-full h-full min-w-0 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} vertical={false} />
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            stroke="#94a3b8"
                            ticks={xAxisTicks}
                            tickFormatter={formatDateTick}
                            tick={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                            axisLine={{ stroke: tc.gridStroke }}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis
                            domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
                            ticks={yAxisTicks}
                            stroke="#94a3b8"
                            tickFormatter={(val) => `${val.toFixed(0)}%`}
                            tick={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={(props) => <CustomAreaTooltip {...props} xAxisTicks={xAxisTicks} />} />
                        {topTickers.map((ticker, index) => (
                            <Area
                                key={ticker}
                                type="stepAfter"
                                dataKey={ticker}
                                stackId="1"
                                stroke={colors[index % colors.length]}
                                fill={colors[index % colors.length]}
                                fillOpacity={0.8}
                                strokeWidth={0}
                                activeDot={(props: any) =>
                                    isTimestampMajorDate(props.payload.timestamp, xAxisTicks)
                                        ? <Dot {...props} r={4} strokeWidth={2} stroke="#fff" fill={colors[index % colors.length]} />
                                        : null
                                }
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>

        </div>
    );
});

PortfolioEvolutionChart.displayName = 'PortfolioEvolutionChart';
