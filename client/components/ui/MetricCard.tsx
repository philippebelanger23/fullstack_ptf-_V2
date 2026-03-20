import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
}) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
                <Icon size={18} />
            </div>
            {isPositive !== undefined && !loading && (
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {isPositive ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
                    {isPositive ? positiveLabel : negativeLabel}
                </span>
            )}
        </div>
        <h3 className="text-slate-500 text-xs font-medium mb-1 uppercase tracking-wider">{title}</h3>
        {loading ? (
            <div className="h-8 flex items-center">
                <LoadingSpinner size={20} />
            </div>
        ) : (
            <p className="text-xl font-bold text-slate-900 font-mono">{value}</p>
        )}
        {subtitle && !loading && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
);
