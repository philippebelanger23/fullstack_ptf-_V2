import React from 'react';
import { TrendingDown } from 'lucide-react';
import type { DrawdownEpisode } from '../types';

interface DrawdownAnalysisProps {
    topDrawdowns: DrawdownEpisode[];
}

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

export const DrawdownAnalysis: React.FC<DrawdownAnalysisProps> = ({ topDrawdowns }) => {
    if (!topDrawdowns || topDrawdowns.length === 0) {
        return (
            <div className="bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm">
                <p className="text-wallstreet-500 text-sm font-mono">No significant drawdown episodes detected.</p>
            </div>
        );
    }

    const worst = topDrawdowns[0];

    return (
        <div className="bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingDown size={18} className="text-red-500" />
                    <h2 className="text-lg font-bold text-wallstreet-text">Top Drawdown Episodes</h2>
                    <span className="text-xs text-wallstreet-500 font-mono">(full history)</span>
                </div>
                {/* Worst drawdown callout */}
                <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-100">
                        <span className="text-red-400 font-medium">Worst: </span>
                        <span className="text-red-600 font-bold">({Math.abs(worst.depth).toFixed(1)}%)</span>
                        <span className="text-red-400 ml-1">{worst.durationDays}d to trough</span>
                    </div>
                    {worst.recoveryDays !== null ? (
                        <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-wallstreet-500 font-medium">Recovered in </span>
                            <span className="text-slate-700 font-bold">{worst.recoveryDays}d</span>
                        </div>
                    ) : (
                        <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
                            <span className="text-amber-600 font-bold">Ongoing</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-wallstreet-900 text-wallstreet-500 font-medium text-xs uppercase tracking-wider">
                            <th className="px-4 py-2.5 text-left rounded-l-lg">#</th>
                            <th className="px-4 py-2.5 text-left">Peak Date</th>
                            <th className="px-4 py-2.5 text-left">Trough Date</th>
                            <th className="px-4 py-2.5 text-left">Recovery Date</th>
                            <th className="px-4 py-2.5 text-right">Depth</th>
                            <th className="px-4 py-2.5 text-right">To Trough</th>
                            <th className="px-4 py-2.5 text-right rounded-r-lg">Recovery</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-wallstreet-700">
                        {topDrawdowns.map((ep, idx) => {
                            const depthAbs = Math.abs(ep.depth);
                            const depthColor =
                                depthAbs >= 15 ? 'text-red-700' :
                                depthAbs >= 8 ? 'text-red-600' :
                                depthAbs >= 4 ? 'text-orange-500' :
                                'text-amber-500';

                            return (
                                <tr key={idx} className="hover:bg-wallstreet-900 transition-colors">
                                    <td className="px-4 py-3 font-bold text-wallstreet-500 font-mono">{idx + 1}</td>
                                    <td className="px-4 py-3 font-mono text-wallstreet-text">{formatDate(ep.start)}</td>
                                    <td className="px-4 py-3 font-mono text-wallstreet-text">{formatDate(ep.trough)}</td>
                                    <td className="px-4 py-3 font-mono text-wallstreet-500">
                                        {ep.recovery
                                            ? formatDate(ep.recovery)
                                            : <span className="text-amber-500 font-semibold">Ongoing</span>}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono font-bold ${depthColor}`}>
                                        ({depthAbs.toFixed(1)}%)
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-wallstreet-text">
                                        {ep.durationDays}d
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-wallstreet-500">
                                        {ep.recoveryDays !== null ? `${ep.recoveryDays}d` : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-wallstreet-500 font-mono">
                To Trough = calendar days from peak to lowest point · Recovery = days from trough back to prior peak
            </p>
        </div>
    );
};
