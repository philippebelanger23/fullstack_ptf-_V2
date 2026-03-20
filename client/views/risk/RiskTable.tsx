import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Info, ChevronUp, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { RiskPosition } from '../../types';

type SortKey = 'ticker' | 'weight' | 'individualVol' | 'beta' | 'mctr' | 'pctOfTotalRisk' | 'riskAdjustedReturn';

const COLUMN_INFO: Record<string, string> = {
    ticker: 'Security identifier',
    weight: 'Current portfolio allocation as a percentage of total',
    individualVol: 'Annualized standard deviation of the position\'s daily returns over the past year',
    beta: 'Sensitivity of the position to the overall portfolio — above 1.0 means it amplifies portfolio moves',
    mctr: 'Marginal Contribution to Risk — how much portfolio volatility increases per unit of weight added to this position',
    pctOfTotalRisk: 'Share of total portfolio variance attributed to this position — compare to weight to spot risk concentrators',
    riskAdjustedReturn: 'Annualized return divided by annualized volatility (position-level Sharpe ratio)',
    riskVsWeight: 'Difference between risk contribution and weight — positive means the position takes more risk than its allocation suggests',
};

const InfoBubble: React.FC<{ tooltipKey: string }> = ({ tooltipKey }) => {
    const [show, setShow] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const iconRef = React.useRef<HTMLSpanElement>(null);

    const handleEnter = () => {
        if (iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            setCoords({ top: rect.top - 8, left: rect.left + rect.width / 2 });
        }
        setShow(true);
    };

    return (
        <span className="relative" onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
            <span ref={iconRef}>
                <Info size={12} className="text-slate-300 hover:text-slate-500 transition-colors cursor-help" />
            </span>
            {show && coords && ReactDOM.createPortal(
                <span
                    className="fixed w-52 px-3 py-2 text-[11px] font-normal normal-case tracking-normal leading-snug text-white bg-slate-800 rounded-lg shadow-lg z-[9999] pointer-events-none"
                    style={{ top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)' }}
                >
                    {COLUMN_INFO[tooltipKey]}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </span>,
                document.body
            )}
        </span>
    );
};

interface RiskTableProps {
    loading: boolean;
    sortedPositions: RiskPosition[];
    sortKey: SortKey;
    sortAsc: boolean;
    handleSort: (key: SortKey) => void;
    missingTickers: string[];
}

export const RiskTable: React.FC<RiskTableProps> = ({ loading, sortedPositions, sortKey, sortAsc, handleSort, missingTickers }) => {
    const SortIcon: React.FC<{ column: SortKey }> = ({ column }) => {
        if (sortKey !== column) return <ChevronDown size={14} className="text-slate-300" />;
        return sortAsc ? <ChevronUp size={14} className="text-slate-700" /> : <ChevronDown size={14} className="text-slate-700" />;
    };

    return (
        <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Position Risk Detail</h3>
                </div>
                {loading ? (
                    <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    {([
                                        ['ticker', 'Ticker'],
                                        ['weight', 'Weight'],
                                        ['individualVol', 'Volatility'],
                                        ['beta', 'Beta'],
                                        ['mctr', 'MCTR'],
                                        ['pctOfTotalRisk', '% of Risk'],
                                        ['riskAdjustedReturn', 'Risk-Adj Ret'],
                                    ] as [SortKey, string][]).map(([key, label]) => (
                                        <th
                                            key={key}
                                            className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            onClick={() => handleSort(key)}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                {label}
                                                <InfoBubble tooltipKey={key} />
                                                <SortIcon column={key} />
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-4 py-3 text-left">
                                        <div className="flex items-center gap-1.5">
                                            Risk vs Weight
                                            <InfoBubble tooltipKey="riskVsWeight" />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const maxAbsDelta = Math.max(1, ...sortedPositions.map(p => Math.abs(p.pctOfTotalRisk - p.weight)));
                                    return sortedPositions.map((p, idx) => {
                                        const riskOverweight = p.pctOfTotalRisk - p.weight;
                                        const isRisky = riskOverweight > 2;
                                        const isDiversifier = riskOverweight < -2;
                                        return (
                                            <tr
                                                key={p.ticker}
                                                className={`border-t border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-25'}`}
                                            >
                                                <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.ticker}</td>
                                                <td className="px-4 py-3 font-mono text-slate-700">{p.weight.toFixed(1)}%</td>
                                                <td className="px-4 py-3 font-mono text-slate-700">{p.individualVol.toFixed(1)}%</td>
                                                <td className="px-4 py-3 font-mono text-slate-700">{p.beta.toFixed(2)}</td>
                                                <td className="px-4 py-3 font-mono text-slate-700">{p.mctr.toFixed(2)}%</td>
                                                <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.pctOfTotalRisk.toFixed(1)}%</td>
                                                <td className={`px-4 py-3 font-mono font-medium ${p.riskAdjustedReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                                    {p.riskAdjustedReturn < 0 ? `(${Math.abs(p.riskAdjustedReturn).toFixed(2)})` : p.riskAdjustedReturn.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden relative">
                                                            <div
                                                                className={`h-full rounded-full ${isRisky ? 'bg-red-400' : isDiversifier ? 'bg-green-400' : 'bg-slate-300'}`}
                                                                style={{ width: `${Math.min(100, (Math.abs(riskOverweight) / maxAbsDelta) * 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-xs font-mono ${isRisky ? 'text-red-600' : isDiversifier ? 'text-green-600' : 'text-slate-400'}`}>
                                                            {riskOverweight < 0 ? `(${Math.abs(riskOverweight).toFixed(1)})` : `${riskOverweight > 0 ? '+' : ''}${riskOverweight.toFixed(1)}`}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {missingTickers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="text-amber-500 mt-0.5" size={18} />
                    <div>
                        <p className="text-amber-800 text-sm font-medium">Missing price data</p>
                        <p className="text-amber-600 text-xs mt-1">
                            No Yahoo Finance data for: {missingTickers.join(', ')}. These tickers are excluded from risk calculations.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};

export type { SortKey };
