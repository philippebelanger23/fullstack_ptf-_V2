import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RollingMetricPoint } from '../types';
import { useThemeColors } from '../hooks/useThemeColors';

type RollingWindow = 21 | 63 | 126;

interface RollingMetricsChartProps {
    windows: {
        21: RollingMetricPoint[];
        63: RollingMetricPoint[];
        126: RollingMetricPoint[];
    };
}

const WINDOW_LABELS: Record<RollingWindow, string> = { 21: '1M', 63: '3M', 126: '6M' };

const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
};

const formatLongDate = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

interface MetricPanelProps {
    title: string;
    data: RollingMetricPoint[];
    portfolioKey: 'sharpe' | 'vol' | 'beta';
    yFormat: (v: number) => string;
}

const MetricPanel: React.FC<MetricPanelProps> = ({ title, data, portfolioKey, yFormat }) => {
    const tc = useThemeColors();
    const chartData = data.map(d => ({
        date: d.date,
        Portfolio: d.portfolio[portfolioKey],
        Benchmark: d.benchmark[portfolioKey],
    }));

    return (
        <div>
            <p className="text-xs font-semibold text-wallstreet-500 uppercase tracking-wider mb-3">{title}</p>
            <ResponsiveContainer width="100%" height={130}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStroke} vertical={false} />
                    <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 10, fill: tc.tickFill }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tickFormatter={yFormat}
                        tick={{ fontSize: 10, fill: tc.tickFill }}
                        tickLine={false}
                        axisLine={false}
                        width={38}
                    />
                    <Tooltip
                        formatter={(value: number, name: string) => [yFormat(value), name]}
                        labelFormatter={(label: string) => formatLongDate(label)}
                        contentStyle={{
                            backgroundColor: tc.tooltipBgSolid,
                            border: `1px solid ${tc.tooltipBorder}`,
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            color: tc.tooltipText,
                        }}
                    />
                    <Line type="monotone" dataKey="Portfolio" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="Benchmark" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export const RollingMetricsChart: React.FC<RollingMetricsChartProps> = ({ windows }) => {
    const [activeWindow, setActiveWindow] = useState<RollingWindow>(63);
    const data = windows[activeWindow] ?? [];

    if (data.length === 0) return null;

    return (
        <div className="bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-wallstreet-700 pb-3">
                <div>
                    <h3 className="text-sm font-semibold text-wallstreet-text uppercase tracking-wider">Rolling Metrics</h3>
                    <p className="text-xs text-wallstreet-500 mt-0.5">Portfolio vs. benchmark over rolling window</p>
                </div>
                <div className="flex items-center gap-1">
                    {([21, 63, 126] as RollingWindow[]).map(w => (
                        <button
                            key={w}
                            onClick={() => setActiveWindow(w)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                activeWindow === w
                                    ? 'bg-wallstreet-accent text-white shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                            }`}
                        >
                            {WINDOW_LABELS[w]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex gap-5 text-xs text-wallstreet-500 mb-5">
                <span className="flex items-center gap-2">
                    <span className="inline-block w-5 border-t-2 border-blue-500"></span>
                    Portfolio
                </span>
                <span className="flex items-center gap-2">
                    <span className="inline-block w-5 border-t-2 border-dashed border-wallstreet-500"></span>
                    Benchmark
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricPanel
                    title="Sharpe Ratio"
                    data={data}
                    portfolioKey="sharpe"
                    yFormat={(v) => v.toFixed(2)}
                />
                <MetricPanel
                    title="Volatility (Ann.)"
                    data={data}
                    portfolioKey="vol"
                    yFormat={(v) => `${v.toFixed(1)}%`}
                />
                <MetricPanel
                    title="Beta vs Benchmark"
                    data={data}
                    portfolioKey="beta"
                    yFormat={(v) => v.toFixed(2)}
                />
            </div>
        </div>
    );
};
