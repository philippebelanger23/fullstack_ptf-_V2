import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Info, ChevronUp, ChevronDown, Search, Layers, AlertCircle } from 'lucide-react';
import { RiskPosition } from '../../types';

export type SortKey = 'ticker' | 'sector' | 'weight' | 'individualVol' | 'beta' | 'mctr' | 'pctOfTotalRisk' | 'annualizedReturn' | 'riskAdjustedReturn';

const COLUMN_INFO: Record<string, string> = {
    ticker: 'Security identifier',
    sector: 'Primary sector classification',
    weight: 'Current portfolio allocation as a percentage of total',
    individualVol: 'Annualized standard deviation of daily returns over the past year',
    beta: 'Sensitivity to the overall portfolio — above 1.0 amplifies portfolio moves',
    mctr: 'Marginal Contribution to Risk — how much portfolio volatility increases per unit of weight',
    pctOfTotalRisk: 'Share of total portfolio variance attributed to this position',
    annualizedReturn: 'Annualized return based on daily returns over the past year',
    riskAdjustedReturn: 'Return divided by volatility (position-level Sharpe ratio)',
    riskVsWeight: 'Difference between risk contribution and weight — positive means disproportionate risk',
};

interface RiskTableProps {
    positions: RiskPosition[];
    loading: boolean;
    missingTickers: string[];
}

export const RiskTable: React.FC<RiskTableProps> = ({ positions, loading, missingTickers }) => {
    const [sortKey, setSortKey] = useState<SortKey>('pctOfTotalRisk');
    const [sortAsc, setSortAsc] = useState(false);
    const [search, setSearch] = useState('');
    const [groupBySector, setGroupBySector] = useState(false);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(false); }
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return positions;
        return positions.filter(p =>
            p.ticker.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q)
        );
    }, [positions, search]);

    const sorted = useMemo(() =>
        [...filtered].sort((a, b) => {
            const aVal = a[sortKey]; const bVal = b[sortKey];
            if (typeof aVal === 'string' && typeof bVal === 'string')
                return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        }),
        [filtered, sortKey, sortAsc]);

    const grouped = useMemo(() => {
        if (!groupBySector) return null;
        const map = new Map<string, RiskPosition[]>();
        sorted.forEach(p => {
            const arr = map.get(p.sector) || [];
            arr.push(p);
            map.set(p.sector, arr);
        });
        return [...map.entries()].sort((a, b) => {
            const aRisk = a[1].reduce((s, p) => s + p.pctOfTotalRisk, 0);
            const bRisk = b[1].reduce((s, p) => s + p.pctOfTotalRisk, 0);
            return bRisk - aRisk;
        });
    }, [sorted, groupBySector]);

    const maxAbsDelta = Math.max(1, ...positions.map(p => Math.abs(p.pctOfTotalRisk - p.weight)));

    const totals = useMemo(() => ({
        weight: positions.reduce((s, p) => s + p.weight, 0),
        risk: positions.reduce((s, p) => s + p.pctOfTotalRisk, 0),
        avgBeta: positions.length > 0 ? positions.reduce((s, p) => s + p.beta * p.weight / 100, 0) / (positions.reduce((s, p) => s + p.weight, 0) / 100 || 1) : 0,
    }), [positions]);

    const COLUMNS: [SortKey, string, string][] = [
        ['ticker', 'Ticker', 'w-[80px]'],
        ['sector', 'Sector', 'w-[90px]'],
        ['weight', 'Weight', 'w-[70px]'],
        ['individualVol', 'Vol', 'w-[65px]'],
        ['beta', 'Beta', 'w-[60px]'],
        ['mctr', 'MCTR', 'w-[65px]'],
        ['pctOfTotalRisk', 'Risk %', 'w-[70px]'],
        ['annualizedReturn', 'Return', 'w-[75px]'],
        ['riskAdjustedReturn', 'Risk-Adj', 'w-[75px]'],
    ];

    const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
        if (sortKey !== col) return <ChevronDown size={13} className="text-wallstreet-500/40" />;
        return sortAsc
            ? <ChevronUp size={13} className="text-wallstreet-accent" />
            : <ChevronDown size={13} className="text-wallstreet-accent" />;
    };

    const renderRow = (p: RiskPosition, idx: number) => {
        const delta = p.pctOfTotalRisk - p.weight;
        const isRisky = delta > 2;
        const isDiversifier = delta < -2;
        return (
            <tr
                key={p.ticker}
                className={`border-t border-wallstreet-700/50 hover:bg-wallstreet-900/50 transition-colors ${
                    idx % 2 === 0 ? '' : 'bg-wallstreet-900/20'
                }`}
            >
                <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-0.5 h-5 rounded-full ${isRisky ? 'bg-red-500' : isDiversifier ? 'bg-green-500' : 'bg-wallstreet-700'}`} />
                        <span className="font-mono font-bold text-wallstreet-text text-[13px]">{p.ticker}</span>
                    </div>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-wallstreet-500">{p.sector}</td>
                <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1.5 bg-wallstreet-900 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, p.weight)}%` }} />
                        </div>
                        <span className="font-mono text-wallstreet-text text-[13px]">{p.weight.toFixed(1)}%</span>
                    </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-wallstreet-text text-[13px]">{p.individualVol.toFixed(1)}%</td>
                <td className={`px-3 py-2.5 font-mono text-[13px] ${
                    p.beta > 1.2 ? 'text-red-500 font-semibold' : p.beta > 1.0 ? 'text-amber-500' : p.beta < 0.8 ? 'text-green-500' : 'text-wallstreet-text'
                }`}>{p.beta.toFixed(2)}</td>
                <td className="px-3 py-2.5 font-mono text-wallstreet-text text-[13px]">{p.mctr.toFixed(2)}%</td>
                <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1.5 bg-wallstreet-900 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isRisky ? 'bg-red-500' : isDiversifier ? 'bg-green-500' : 'bg-wallstreet-500'}`}
                                style={{ width: `${Math.min(100, p.pctOfTotalRisk)}%` }} />
                        </div>
                        <span className="font-mono font-bold text-wallstreet-text text-[13px]">{p.pctOfTotalRisk.toFixed(1)}%</span>
                    </div>
                </td>
                <td className={`px-3 py-2.5 font-mono text-[13px] ${p.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {p.annualizedReturn >= 0 ? '' : ''}{p.annualizedReturn.toFixed(1)}%
                </td>
                <td className={`px-3 py-2.5 font-mono font-medium text-[13px] ${p.riskAdjustedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {p.riskAdjustedReturn < 0 ? `(${Math.abs(p.riskAdjustedReturn).toFixed(2)})` : p.riskAdjustedReturn.toFixed(2)}
                </td>
                <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-wallstreet-900 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${isRisky ? 'bg-red-400' : isDiversifier ? 'bg-green-400' : 'bg-slate-400'}`}
                                style={{ width: `${Math.min(100, (Math.abs(delta) / maxAbsDelta) * 100)}%` }}
                            />
                        </div>
                        <span className={`text-[11px] font-mono ${isRisky ? 'text-red-600' : isDiversifier ? 'text-green-600' : 'text-wallstreet-500'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                        </span>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <>
            <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm overflow-hidden">
                {/* Header bar */}
                <div className="px-5 py-3.5 border-b border-wallstreet-700 flex items-center justify-between gap-4">
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider shrink-0">Position Risk Detail</h3>
                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wallstreet-500" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Filter..."
                                className="pl-8 pr-3 py-1.5 text-xs font-mono bg-wallstreet-900 border border-wallstreet-700 rounded-lg text-wallstreet-text placeholder-wallstreet-500 w-36 focus:outline-none focus:ring-1 focus:ring-wallstreet-accent"
                            />
                        </div>
                        {/* Group toggle */}
                        <button
                            onClick={() => setGroupBySector(!groupBySector)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                                groupBySector
                                    ? 'bg-wallstreet-accent/20 text-wallstreet-accent border border-wallstreet-accent/30'
                                    : 'bg-wallstreet-900 text-wallstreet-500 border border-wallstreet-700 hover:text-wallstreet-text'
                            }`}
                        >
                            <Layers size={12} />
                            Group by Sector
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="h-40 flex items-center justify-center">
                        <div className="flex items-end gap-1.5 h-8">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="w-1.5 bg-wallstreet-accent rounded-t" style={{ animation: `barPulse 1s ease-in-out ${i * 0.15}s infinite`, height: '30%' }} />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-wallstreet-900 text-wallstreet-500 text-[10px] uppercase tracking-wider sticky top-0 z-10">
                                    {COLUMNS.map(([key, label]) => (
                                        <th
                                            key={key}
                                            className="px-3 py-2.5 text-left cursor-pointer hover:bg-wallstreet-700/50 transition-colors select-none"
                                            onClick={() => handleSort(key)}
                                        >
                                            <div className="flex items-center gap-1">
                                                {label}
                                                <InfoBubble tooltipKey={key} />
                                                <SortIcon col={key} />
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-3 py-2.5 text-left">
                                        <div className="flex items-center gap-1">
                                            Risk vs Wt
                                            <InfoBubble tooltipKey="riskVsWeight" />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {grouped ? (
                                    grouped.map(([sector, sectorPositions]) => {
                                        const sectorRisk = sectorPositions.reduce((s, p) => s + p.pctOfTotalRisk, 0);
                                        const sectorWeight = sectorPositions.reduce((s, p) => s + p.weight, 0);
                                        return (
                                            <React.Fragment key={sector}>
                                                <tr className="bg-wallstreet-accent/5 border-t-2 border-wallstreet-700">
                                                    <td colSpan={10} className="px-3 py-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-bold text-wallstreet-accent uppercase tracking-wider">{sector}</span>
                                                            <span className="text-[10px] font-mono text-wallstreet-500">
                                                                {sectorPositions.length} positions · Weight {sectorWeight.toFixed(1)}% · Risk {sectorRisk.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {sectorPositions.map((p, idx) => renderRow(p, idx))}
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    sorted.map((p, idx) => renderRow(p, idx))
                                )}
                            </tbody>
                            {/* Summary footer */}
                            <tfoot>
                                <tr className="border-t-2 border-wallstreet-700 bg-wallstreet-900/50 font-semibold">
                                    <td className="px-3 py-2.5 text-xs text-wallstreet-text uppercase tracking-wider" colSpan={2}>Portfolio Total</td>
                                    <td className="px-3 py-2.5 font-mono text-wallstreet-text text-[13px]">{totals.weight.toFixed(1)}%</td>
                                    <td className="px-3 py-2.5" />
                                    <td className="px-3 py-2.5 font-mono text-wallstreet-text text-[13px]">{totals.avgBeta.toFixed(2)}</td>
                                    <td className="px-3 py-2.5" />
                                    <td className="px-3 py-2.5 font-mono text-wallstreet-text text-[13px]">{totals.risk.toFixed(1)}%</td>
                                    <td className="px-3 py-2.5" colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {missingTickers.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="text-amber-500 mt-0.5" size={18} />
                    <div>
                        <p className="text-amber-800 dark:text-amber-300 text-sm font-medium">Missing price data</p>
                        <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                            No Yahoo Finance data for: {missingTickers.join(', ')}. Excluded from calculations.
                        </p>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes barPulse {
                    0%, 100% { height: 30%; opacity: 0.4; }
                    50% { height: 100%; opacity: 1; }
                }
            `}</style>
        </>
    );
};

/* ── Info Bubble (portal tooltip) ── */
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
                <Info size={11} className="text-wallstreet-500/50 hover:text-wallstreet-500 transition-colors cursor-help" />
            </span>
            {show && coords && COLUMN_INFO[tooltipKey] && ReactDOM.createPortal(
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
