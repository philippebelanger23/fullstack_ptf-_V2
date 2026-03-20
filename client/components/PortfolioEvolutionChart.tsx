import React, { memo, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface Props {
    data: any[];
    topTickers: string[];
    dates: string[];
    colors: string[];
}

const formatDateTick = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    return `${month} ${day}`;
};

const isTimestampMajorDate = (timestamp: number, xAxisTicks: number[]) => {
    return xAxisTicks.some((tick: number) => Math.abs(tick - timestamp) < 1000); // 1s tolerance
};

const CustomAreaTooltip = ({ active, payload, label, xAxisTicks }: any) => {
    const isMajorDate = isTimestampMajorDate(label as number, xAxisTicks);

    if (active && payload && payload.length) {
        const filteredPayload = [...payload]
            .filter((p: any) => (p.value || 0) > 0.001)
            .sort((a: any, b: any) => b.value - a.value)
            .slice(0, 10);

        const currentTotal = filteredPayload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
        const labelStr = label as string;
        const dateDisplay = isNaN(new Date(labelStr).getTime()) ? labelStr : new Date(labelStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        // Light tooltip for non-rebalance dates
        if (!isMajorDate) {
            return (
                <div className="bg-white/90 border border-slate-200 px-3 py-2 rounded-lg shadow-md text-xs font-mono">
                    <span className="text-slate-400 uppercase tracking-wider">{dateDisplay}</span>
                    <span className="text-slate-600 font-bold ml-2">{currentTotal.toFixed(1)}% Top 10</span>
                </div>
            );
        }

        // Full breakdown tooltip for rebalance dates
        return (
            <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-2xl text-xs font-mono min-w-[280px] z-50">
                <div className="mb-3 border-b border-slate-200 pb-2 flex justify-between items-center gap-4">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">{dateDisplay} Breakdown</span>
                    <span className="text-slate-700 font-bold">{currentTotal.toFixed(1)}% Top 10</span>
                </div>
                <div className="space-y-2">
                    {filteredPayload.map((entry: any, index: number) => (
                        <div key={index} className="grid grid-cols-[1fr_auto] gap-4 items-center group">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                                <span className="text-slate-700 font-bold truncate max-w-[120px]">{entry.name}</span>
                            </div>
                            <div className="text-right text-slate-900 font-bold text-sm">{entry.value.toFixed(1)}%</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};


export const PortfolioEvolutionChart = memo(({ data, topTickers, dates, colors }: Props) => {
    const [selectedRange, setSelectedRange] = useState<'3M' | '6M' | '1Y' | 'ALL'>('ALL');

    const filteredData = useMemo(() => {
        let baseData = data;
        if (selectedRange !== 'ALL' && data.length) {
            const latestDateStr = data[data.length - 1].date;
            const latestDate = new Date(latestDateStr);
            const startDate = new Date(latestDate);

            if (selectedRange === '3M') startDate.setMonth(latestDate.getMonth() - 3);
            else if (selectedRange === '6M') startDate.setMonth(latestDate.getMonth() - 6);
            else if (selectedRange === '1Y') startDate.setFullYear(latestDate.getFullYear() - 1);

            baseData = data.filter(d => new Date(d.date) >= startDate);
        }

        const mappedData = baseData.map(d => ({
            ...d,
            timestamp: new Date(d.date).getTime()
        }));

        if (mappedData.length < 2) return mappedData;

        // Fill gaps to ensure smooth hover (one point per day)
        const filledData = [];
        const oneDay = 24 * 60 * 60 * 1000;

        for (let i = 0; i < mappedData.length - 1; i++) {
            const start = mappedData[i];
            const end = mappedData[i + 1];
            filledData.push(start);

            let currentTimestamp = start.timestamp + oneDay;
            // Add intermediate points if there's a gap of more than 1 day
            while (currentTimestamp < end.timestamp) {
                // Using the start point's weights (stepAfter logic)
                filledData.push({
                    ...start,
                    date: new Date(currentTimestamp).toISOString().split('T')[0],
                    timestamp: currentTimestamp
                });
                currentTimestamp += oneDay;
            }
        }
        filledData.push(mappedData[mappedData.length - 1]);

        return filledData;
    }, [data, selectedRange]);

    const xAxisTicks = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return [];

        const ticks = [];
        if (filteredData.length > 0) {
            ticks.push(new Date(filteredData[0].date).getTime());
        }

        for (let i = 1; i < filteredData.length; i++) {
            const prev = filteredData[i - 1];
            const curr = filteredData[i];

            // Check if any weights changed significantly (> 0.1%)
            let changed = false;
            for (const ticker of topTickers) {
                if (Math.abs((curr[ticker] || 0) - (prev[ticker] || 0)) > 0.1) {
                    changed = true;
                    break;
                }
            }

            if (changed) {
                ticks.push(new Date(curr.date).getTime());
            }
        }

        // Ensure the last data point is included if not already
        const lastDate = filteredData[filteredData.length - 1];
        const lastTimestamp = new Date(lastDate.date).getTime();
        if (ticks[ticks.length - 1] !== lastTimestamp) {
            ticks.push(lastTimestamp);
        }

        return ticks;
    }, [filteredData, topTickers]);

    const yAxisTicks = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return [0, 20, 40, 60, 80, 100];

        const maxDataValue = Math.max(...filteredData.map(d => {
            return topTickers.reduce((sum, t) => sum + (d[t] || 0), 0);
        }));

        const step = 20;
        // Ensure we have some buffer (10% or at least a bit) before snapping to next 20
        const maxTick = Math.ceil((maxDataValue * 1.05) / step) * step;

        const ticks = [];
        for (let i = 0; i <= maxTick; i += step) {
            ticks.push(i);
        }
        return ticks;
    }, [filteredData, topTickers]);

    return (
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
            <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2">
                        <TrendingUp size={16} className="text-wallstreet-500" /> ACTUAL TOP 10 - HISTORICAL WEIGHTS
                    </h3>
                    <p className="text-xs text-wallstreet-500 mt-1">Historical absolute weight allocation of the top 10 positions over time</p>
                </div>
                <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 shadow-inner">
                    {(['3M', '6M', '1Y', 'ALL'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setSelectedRange(range)}
                            className={`px-3 py-1 rounded-md text-[10px] font-bold font-mono transition-all duration-200 ${
                                selectedRange === range
                                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/50'
                                    : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis 
                            dataKey="timestamp" 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            stroke="#94a3b8" 
                            ticks={xAxisTicks}
                            tickFormatter={formatDateTick} 
                            tick={{ fontSize: 10, fontFamily: 'monospace' }} 
                            axisLine={{ stroke: '#e2e8f0' }} 
                            tickLine={false} 
                            dy={10} 
                        />
                        <YAxis domain={[0, yAxisTicks[yAxisTicks.length - 1]]} ticks={yAxisTicks} stroke="#94a3b8" tickFormatter={(val) => `${val.toFixed(0)}%`} tick={{ fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
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
