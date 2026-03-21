import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { LoadingSpinner } from './LoadingSpinner';

export interface MetricCardProps {
    title: string;
    value: string;
    subtitle?: string;
    isPositive?: boolean;
    positiveLabel?: string;
    negativeLabel?: string;
    icon: React.ElementType;
    loading?: boolean;
    delta?: number;
    trend?: number[];
}

export const MetricCard: React.FC<MetricCardProps> = ({
    title,
    value,
    subtitle,
    isPositive,
    positiveLabel = 'Above',
    negativeLabel = 'Below',
    icon: Icon,
    loading,
    delta,
    trend,
}) => (
    <div className="bg-wallstreet-800 p-5 rounded-xl border border-wallstreet-700 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-wallstreet-900 rounded-lg text-wallstreet-500">
                <Icon size={18} />
            </div>
            {isPositive !== undefined && !loading && (
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {isPositive ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
                    {isPositive ? positiveLabel : negativeLabel}
                </span>
            )}
        </div>
        <h3 className="text-wallstreet-500 text-xs font-medium mb-1 uppercase tracking-wider">{title}</h3>
        {loading ? (
            <div className="h-8 flex items-center">
                <LoadingSpinner size={20} />
            </div>
        ) : (
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <p className="text-xl font-bold text-wallstreet-text font-mono">{value}</p>
                    {delta !== undefined && (
                        <span className={`text-[10px] font-mono font-semibold ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)} vs 30d ago
                        </span>
                    )}
                </div>
                {trend && trend.length > 1 && (
                    <div className="w-12 h-6 flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trend.map((v, i) => ({ i, v }))}>
                                <Line
                                    type="monotone"
                                    dataKey="v"
                                    stroke={trend[trend.length - 1] >= trend[0] ? '#16a34a' : '#dc2626'}
                                    strokeWidth={1.5}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        )}
        {subtitle && !loading && <p className="text-xs text-wallstreet-500 mt-1">{subtitle}</p>}
    </div>
);
