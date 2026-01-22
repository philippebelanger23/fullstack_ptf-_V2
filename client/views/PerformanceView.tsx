import React from 'react';
import { TrendingUp, Award, Activity, ShieldAlert, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string;
    change?: string;
    isPositive?: boolean;
    icon: React.ElementType;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, change, isPositive, icon: Icon }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
                <Icon size={20} />
            </div>
            {change && (
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                    {isPositive ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                    {change}
                </span>
            )}
        </div>
        <h3 className="text-slate-500 text-sm font-medium mb-1 uppercase tracking-wider">{title}</h3>
        <p className="text-2xl font-bold text-slate-900 font-mono">{value}</p>
    </div>
);

export const PerformanceView: React.FC = () => {
    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Performance Deep Dive</h1>
                    <p className="text-slate-500 mt-2">Institutional performance analysis and risk attribution.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
                        Export Report
                    </button>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <KPICard title="Total Return" value="+18.42%" change="2.4%" isPositive={true} icon={TrendingUp} />
                <KPICard title="Annualized" value="+12.15%" icon={Activity} />
                <KPICard title="Sharpe Ratio" value="1.84" change="0.12" isPositive={true} icon={Award} />
                <KPICard title="Alpha (vs Index)" value="+4.21%" isPositive={true} icon={TrendingUp} />
                <KPICard title="Max Drawdown" value="-8.12%" isPositive={false} icon={ShieldAlert} />
            </div>

            {/* Main Chart Area */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm h-[500px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900">Cumulative Performance vs. Benchmark</h2>
                    <div className="flex gap-2">
                        {['1M', '3M', '6M', 'YTD', '1Y', 'ALL'].map(period => (
                            <button key={period} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${period === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}>
                                {period}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex items-center justify-center">
                    <p className="text-slate-400 font-medium font-mono">Performance Chart Placeholder</p>
                </div>
            </div>

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Periodic Returns */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-6">Periodic Returns</h2>
                    <div className="space-y-4">
                        {/* Simple Table Placeholder */}
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-4 py-2 text-left">Period</th>
                                    <th className="px-4 py-2 text-right">Portfolio</th>
                                    <th className="px-4 py-2 text-right">Benchmark</th>
                                    <th className="px-4 py-2 text-right">Exc. Return</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[
                                    { period: '2025 Q4', ptf: '+5.2%', bmk: '+4.1%', exc: '+1.1%' },
                                    { period: '2025 Q3', ptf: '+2.8%', bmk: '+3.0%', exc: '-0.2%' },
                                    { period: '2025 Q2', ptf: '+6.5%', bmk: '+4.5%', exc: '+2.0%' },
                                    { period: '2025 Q1', ptf: '+3.1%', bmk: '+2.8%', exc: '+0.3%' },
                                ].map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-700">{row.period}</td>
                                        <td className="px-4 py-3 text-right text-slate-900 font-mono">{row.ptf}</td>
                                        <td className="px-4 py-3 text-right text-slate-500 font-mono">{row.bmk}</td>
                                        <td className={`px-4 py-3 text-right font-bold font-mono ${row.exc.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                                            {row.exc}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Risk Metrics */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-6">Risk Attribution</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Portfolio Beta</p>
                            <p className="text-2xl font-bold text-slate-900 font-mono">0.94</p>
                            <p className="text-xs text-slate-400 mt-1">Slightly defensive relative to index</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Volatility (Std Dev)</p>
                            <p className="text-2xl font-bold text-slate-900 font-mono">11.4%</p>
                            <p className="text-xs text-slate-400 mt-1">Benchmark: 12.8%</p>
                        </div>
                    </div>
                    <div className="mt-6 flex-1 bg-slate-50 rounded-xl border border-dashed border-slate-300 h-40 flex items-center justify-center">
                        <p className="text-slate-400 font-medium font-mono text-xs">Drawdown Heatmap Placeholder</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
