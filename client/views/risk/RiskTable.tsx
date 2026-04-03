import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Info, ChevronUp, ChevronDown, Search, Layers, AlertCircle } from 'lucide-react';
import { RiskPosition } from '../../types';

export type SortKey = 'ticker' | 'sector' | 'weight' | 'individualVol' | 'beta' | 'mctr' | 'pctOfTotalRisk' | 'annualizedReturn' | 'riskAdjustedReturn' | 'riskVsWeight';

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
    riskVsWeight: 'Difference between risk contribution and weight — positive means disproportionate risk taker',
};

/* ── Sector color palette ── */
const SECTOR_COLORS: Record<string, { bg: string; text: string }> = {
    'Technology':             { bg: '#e0e7ff', text: '#3730a3' },
    'Information Technology': { bg: '#e0e7ff', text: '#3730a3' },
    'Financial Services':     { bg: '#d1fae5', text: '#065f46' },
    'Financials':             { bg: '#d1fae5', text: '#065f46' },
    'Health Care':            { bg: '#ffe4e6', text: '#9f1239' },
    'Healthcare':             { bg: '#ffe4e6', text: '#9f1239' },
    'Energy':                 { bg: '#fef3c7', text: '#92400e' },
    'Consumer Cyclical':      { bg: '#f3e8ff', text: '#6b21a8' },
    'Consumer Discretionary': { bg: '#f3e8ff', text: '#6b21a8' },
    'Discretionary':         { bg: '#f3e8ff', text: '#6b21a8' },
    'Consumer Defensive':     { bg: '#ccfbf1', text: '#134e4a' },
    'Consumer Staples':       { bg: '#ccfbf1', text: '#134e4a' },
    'Staples':                { bg: '#ccfbf1', text: '#134e4a' },
    'Communication Services': { bg: '#e0f2fe', text: '#0c4a6e' },
    'Communications':         { bg: '#e0f2fe', text: '#0c4a6e' },
    'Industrials':            { bg: '#dbeafe', text: '#0037e8' },
    'Basic Materials':        { bg: '#ecfccb', text: '#365314' },
    'Materials':              { bg: '#ecfccb', text: '#365314' },
    'Utilities':              { bg: '#dcfce7', text: '#14532d' },
    'Real Estate':            { bg: '#ffedd5', text: '#7c2d12' },
    'Mixed':                  { bg: '#f1f5f9', text: '#334155' },
    'CASH':                   { bg: '#f1f5f9', text: '#334155' },
};
const defaultSectorColor = { bg: '#f1f5f9', text: '#334155' };

export const SectorBadge: React.FC<{ sector: string; className?: string }> = ({ sector, className }) => {
    const c = SECTOR_COLORS[sector] ?? defaultSectorColor;
    return (
        <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold leading-tight whitespace-nowrap${className ? ` ${className}` : ''}`}
            style={{ backgroundColor: c.bg, color: c.text }}
        >
            {sector}
        </span>
    );
};

/* ── Mini bar scaled relative to column max ── */
const MiniBar: React.FC<{ value: number; max: number; color: string; width?: number }> = ({
    value, max, color, width = 56,
}) => (
    <div className="bg-wallstreet-900 rounded-full overflow-hidden shrink-0" style={{ width, height: 6 }}>
        <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, max > 0 ? (Math.abs(value) / max) * 100 : 0)}%`, backgroundColor: color }}
        />
    </div>
);

/* ── Signed number ── */
const Signed: React.FC<{ value: number; decimals?: number; suffix?: string; className?: string }> = ({
    value, decimals = 2, suffix = '', className = '',
}) => (
    <span className={className}>
        {value > 0 ? '+' : ''}{value.toFixed(decimals)}{suffix}
    </span>
);

interface RiskTableProps {
    positions: RiskPosition[];
    loading: boolean;
    missingTickers: string[];
    portfolioBeta?: number;
}

export const RiskTable: React.FC<RiskTableProps> = ({ positions, loading, missingTickers, portfolioBeta }) => {
    const [sortKey, setSortKey] = useState<SortKey>('pctOfTotalRisk');
    const [sortAsc, setSortAsc] = useState(false);
    const [search, setSearch] = useState('');
    const [groupBySector, setGroupBySector] = useState(false);

    const colMax = useMemo(() => ({
        weight: Math.max(1, ...positions.map(p => p.weight)),
        vol:    Math.max(1, ...positions.map(p => p.individualVol)),
        mctr:   Math.max(0.001, ...positions.map(p => Math.abs(p.mctr))),
        risk:   Math.max(1, ...positions.map(p => p.pctOfTotalRisk)),
        delta:  Math.max(1, ...positions.map(p => Math.abs(p.pctOfTotalRisk - p.weight))),
    }), [positions]);

    const riskRank = useMemo(() => {
        const ranked = [...positions].sort((a, b) => b.pctOfTotalRisk - a.pctOfTotalRisk);
        const map = new Map<string, number>();
        ranked.forEach((p, i) => map.set(p.ticker, i + 1));
        return map;
    }, [positions]);

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
            let aVal: number | string;
            let bVal: number | string;
            if (sortKey === 'riskVsWeight') {
                aVal = a.pctOfTotalRisk - a.weight;
                bVal = b.pctOfTotalRisk - b.weight;
            } else {
                aVal = a[sortKey as keyof RiskPosition] as number | string;
                bVal = b[sortKey as keyof RiskPosition] as number | string;
            }
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
        return [...map.entries()].sort((a, b) =>
            b[1].reduce((s, p) => s + p.pctOfTotalRisk, 0) - a[1].reduce((s, p) => s + p.pctOfTotalRisk, 0)
        );
    }, [sorted, groupBySector]);

    const totals = useMemo(() => {
        const totalWeight = positions.reduce((s, p) => s + p.weight, 0);
        const wt = totalWeight / 100 || 1;
        return {
            weight:    totalWeight,
            risk:      positions.reduce((s, p) => s + p.pctOfTotalRisk, 0),
            avgReturn: positions.reduce((s, p) => s + p.annualizedReturn * p.weight / 100, 0) / wt,
            avgRiskAdj: positions.reduce((s, p) => s + p.riskAdjustedReturn * p.weight / 100, 0) / wt,
        };
    }, [positions]);

    const COLUMNS: [SortKey, string, 'pos' | 'perf'][] = [
        ['ticker',            'Ticker',     'pos'],
        ['sector',            'Sector',     'pos'],
        ['weight',            'Weight',     'pos'],
        ['individualVol',     'Vol',        'pos'],
        ['beta',              'Beta',       'pos'],
        ['mctr',              'MCTR',       'pos'],
        ['pctOfTotalRisk',    'Risk %',     'perf'],
        ['annualizedReturn',  'Return',     'perf'],
        ['riskAdjustedReturn','Risk-Adj',   'perf'],
        ['riskVsWeight',      'Risk vs Wt', 'perf'],
    ];

    const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
        if (sortKey !== col) return <ChevronDown size={12} className="text-wallstreet-500/40 shrink-0" />;
        return sortAsc
            ? <ChevronUp size={12} className="text-wallstreet-accent shrink-0" />
            : <ChevronDown size={12} className="text-wallstreet-accent shrink-0" />;
    };

    const renderRow = (p: RiskPosition, idx: number) => {
        const delta = p.pctOfTotalRisk - p.weight;
        const isRisky     = delta > 2;
        const isDiversifier = delta < -2;
        const rank = riskRank.get(p.ticker) ?? 99;
        const isTopRisk = rank <= 3;

        /* Beta pill */
        const betaColor = p.beta > 1.2
            ? 'bg-red-500/15 text-red-400'
            : p.beta > 1.0
                ? 'bg-amber-500/15 text-amber-400'
                : p.beta < 0.8
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-wallstreet-700/50 text-wallstreet-400';

        return (
            <tr
                key={p.ticker}
                className={`border-t border-wallstreet-700/40 hover:bg-wallstreet-700/25 transition-colors cursor-default ${
                    idx % 2 !== 0 ? 'bg-wallstreet-900/30' : ''
                }`}
            >
                {/* Ticker */}
                <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                        <div className={`w-[3px] h-6 rounded-full shrink-0 ${isRisky ? 'bg-red-500' : isDiversifier ? 'bg-green-500' : 'bg-wallstreet-700'}`} />
                        <span className="font-mono font-bold text-wallstreet-text text-[14px] tracking-tight">{p.ticker}</span>
                    </div>
                </td>

                {/* Sector */}
                <td className="px-4 py-3.5 border-r border-wallstreet-700/30">
                    <SectorBadge sector={p.sector} />
                </td>

                {/* Weight */}
                <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                        <MiniBar value={p.weight} max={colMax.weight} color="#3b82f6" />
                        <span className="font-mono text-wallstreet-text text-[13px] tabular-nums w-10 shrink-0">{p.weight.toFixed(1)}%</span>
                    </div>
                </td>

                {/* Vol */}
                <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                        <MiniBar value={p.individualVol} max={colMax.vol} color="#64748b" />
                        <span className="font-mono text-wallstreet-400 text-[13px] tabular-nums w-10 shrink-0">{p.individualVol.toFixed(1)}%</span>
                    </div>
                </td>

                {/* Beta — pill badge */}
                <td className="px-4 py-3.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-bold font-mono tabular-nums ${betaColor}`}>
                        {p.beta.toFixed(2)}
                    </span>
                </td>

                {/* MCTR */}
                <td className="px-4 py-3.5 border-r border-wallstreet-700/30">
                    <div className="flex items-center gap-2">
                        <MiniBar value={p.mctr} max={colMax.mctr} color="#8b5cf6" />
                        <span className="font-mono text-wallstreet-400 text-[13px] tabular-nums w-12 shrink-0">{p.mctr.toFixed(2)}%</span>
                    </div>
                </td>

                {/* Risk % — hero column */}
                <td className="px-4 py-3.5 bg-wallstreet-900/20">
                    <div className="flex items-center gap-2">
                        <MiniBar value={p.pctOfTotalRisk} max={colMax.risk} color={isRisky ? '#ef4444' : isDiversifier ? '#22c55e' : '#475569'} width={64} />
                        <span className={`font-mono font-bold text-[15px] tabular-nums w-10 shrink-0 ${isRisky ? 'text-red-400' : isDiversifier ? 'text-green-400' : 'text-wallstreet-text'}`}>
                            {p.pctOfTotalRisk.toFixed(1)}%
                        </span>
                        {isTopRisk && (
                            <span className="text-[9px] font-bold font-mono px-1 py-px rounded leading-tight bg-wallstreet-accent text-wallstreet-900">
                                #{rank}
                            </span>
                        )}
                    </div>
                </td>

                {/* Return */}
                <td className="px-4 py-3.5 bg-wallstreet-900/20">
                    <Signed
                        value={p.annualizedReturn}
                        decimals={1}
                        suffix="%"
                        className={`font-mono font-semibold text-[14px] tabular-nums ${p.annualizedReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    />
                </td>

                {/* Risk-Adj */}
                <td className="px-4 py-3.5 bg-wallstreet-900/20">
                    <Signed
                        value={p.riskAdjustedReturn}
                        decimals={2}
                        className={`font-mono font-semibold text-[14px] tabular-nums ${p.riskAdjustedReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    />
                </td>

                {/* Risk vs Weight */}
                <td className="px-4 py-3.5 bg-wallstreet-900/20">
                    <div className="flex items-center gap-2">
                        <MiniBar value={delta} max={colMax.delta} color={isRisky ? '#ef4444' : isDiversifier ? '#22c55e' : '#475569'} width={52} />
                        <Signed
                            value={delta}
                            decimals={1}
                            suffix="%"
                            className={`text-[13px] font-mono font-semibold tabular-nums w-12 shrink-0 ${isRisky ? 'text-red-400' : isDiversifier ? 'text-green-400' : 'text-wallstreet-500'}`}
                        />
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <>
            <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm overflow-hidden">
                {/* Header bar */}
                <div className="px-5 py-4 border-b border-wallstreet-700 flex items-center justify-between gap-4">
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider shrink-0">Position Risk Detail</h3>
                    <div className="flex items-center gap-3">
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
                                <tr className="bg-wallstreet-900 text-[10px] uppercase tracking-wider sticky top-0 z-10">
                                    {COLUMNS.map(([key, label, group], i) => {
                                        const isFirstPerf = group === 'perf' && COLUMNS[i - 1]?.[2] !== 'perf';
                                        const isPerf = group === 'perf';
                                        return (
                                            <th
                                                key={key}
                                                className={`px-4 py-3 text-left cursor-pointer hover:bg-wallstreet-700/50 transition-colors select-none font-semibold ${
                                                    isFirstPerf ? 'border-l border-wallstreet-700/50' : ''
                                                } ${isPerf ? 'text-wallstreet-accent/70 bg-wallstreet-900/20' : 'text-wallstreet-500'}`}
                                                onClick={() => handleSort(key)}
                                            >
                                                <div className="flex items-center gap-1">
                                                    {label}
                                                    <InfoBubble tooltipKey={key} />
                                                    <SortIcon col={key} />
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {grouped ? (
                                    grouped.map(([sector, sectorPositions]) => {
                                        const sectorRisk   = sectorPositions.reduce((s, p) => s + p.pctOfTotalRisk, 0);
                                        const sectorWeight = sectorPositions.reduce((s, p) => s + p.weight, 0);
                                        const sectorDelta  = sectorRisk - sectorWeight;
                                        const c = SECTOR_COLORS[sector] ?? defaultSectorColor;
                                        return (
                                            <React.Fragment key={sector}>
                                                <tr className="border-t-2 border-wallstreet-700" style={{ backgroundColor: c.bg }}>
                                                    <td colSpan={10} className="px-4 py-2.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: c.text }}>{sector}</span>
                                                            <span className="text-[11px] font-mono text-wallstreet-500 flex items-center gap-4">
                                                                <span>{sectorPositions.length} position{sectorPositions.length !== 1 ? 's' : ''}</span>
                                                                <span>Weight <span className="text-wallstreet-text font-semibold">{sectorWeight.toFixed(1)}%</span></span>
                                                                <span>Risk <span className="text-wallstreet-text font-semibold">{sectorRisk.toFixed(1)}%</span></span>
                                                                <span className={sectorDelta > 1 ? 'text-red-400 font-semibold' : sectorDelta < -1 ? 'text-green-400 font-semibold' : 'text-wallstreet-500'}>
                                                                    {sectorDelta > 0 ? '▲' : '▼'} {Math.abs(sectorDelta).toFixed(1)}%
                                                                </span>
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
                            <tfoot>
                                <tr className="border-t-2 border-wallstreet-700 bg-wallstreet-900/60 font-semibold">
                                    <td className="px-4 py-3 text-xs text-wallstreet-text uppercase tracking-wider font-bold" colSpan={2}>Portfolio Total</td>
                                    <td className="px-4 py-3 font-mono text-wallstreet-text text-[13px]">{totals.weight.toFixed(1)}%</td>
                                    <td className="px-4 py-3" />
                                    <td className="px-4 py-3 font-mono text-wallstreet-text text-[13px]">{portfolioBeta != null ? portfolioBeta.toFixed(2) : '—'}</td>
                                    <td className="px-4 py-3 border-r border-wallstreet-700/30" />
                                    <td className="px-4 py-3 bg-wallstreet-900/20 font-mono text-wallstreet-text font-bold text-[14px]">{totals.risk.toFixed(1)}%</td>
                                    <td className="px-4 py-3 bg-wallstreet-900/20">
                                        <Signed value={totals.avgReturn} decimals={1} suffix="%" className={`font-mono font-bold text-[14px] ${totals.avgReturn >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                                    </td>
                                    <td className="px-4 py-3 bg-wallstreet-900/20">
                                        <Signed value={totals.avgRiskAdj} decimals={2} className={`font-mono font-bold text-[14px] ${totals.avgRiskAdj >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                                    </td>
                                    <td className="px-4 py-3 bg-wallstreet-900/20" />
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
                <Info size={10} className="text-wallstreet-500/40 hover:text-wallstreet-500 transition-colors cursor-help" />
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
