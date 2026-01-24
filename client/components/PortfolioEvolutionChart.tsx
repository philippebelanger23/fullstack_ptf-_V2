import React, { memo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
    // Return only month name in uppercase (e.g., "JAN", "FEB")
    return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
};

const CustomAreaTooltip = ({ active, payload, label, dates }: any) => {
    if (active && payload && payload.length) {
        // Filter out zero weights and sort by value, then take top 10 for this snapshot
        const filteredPayload = [...payload]
            .filter((p: any) => (p.value || 0) > 0.001)
            .sort((a: any, b: any) => b.value - a.value)
            .slice(0, 10);

        const currentTotal = filteredPayload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
        const labelStr = label as string;

        // Safety check for date formatting
        const dateDisplay = isNaN(new Date(labelStr).getTime()) ? labelStr : new Date(labelStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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
    return (
        <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
            <div className="mb-4">
                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2"><TrendingUp size={16} className="text-wallstreet-500" /> Portfolio Evolution (Top 10) </h3>
                <p className="text-xs text-wallstreet-500 mt-1 text-slate-400">Historical absolute weight allocation of the top 10 positions over time</p>
            </div>

            <div className="flex-1 w-full h-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={formatDateTick} tick={{ fontSize: 12, fontFamily: 'monospace' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} dy={10} minTickGap={50} />
                        <YAxis stroke="#94a3b8" tickFormatter={(val) => `${val.toFixed(0)}%`} tick={{ fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <Tooltip content={(props) => <CustomAreaTooltip {...props} dates={dates} />} />
                        {topTickers.map((ticker, index) => (
                            <Area key={ticker} type="monotone" dataKey={ticker} stackId="1" stroke={colors[index % colors.length]} fill={colors[index % colors.length]} fillOpacity={0.8} strokeWidth={0} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

PortfolioEvolutionChart.displayName = 'PortfolioEvolutionChart';
