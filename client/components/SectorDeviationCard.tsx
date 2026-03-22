import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { PortfolioItem } from '../types';

interface IndexSector {
    sector: string;
    Index: number;
    ACWI?: number;
    TSX?: number;
}

interface GeoEntry {
    region: string;
    weight: number;
    ACWI?: number;
    TSX?: number;
}

interface Props {
    currentHoldings: PortfolioItem[];
    benchmarkData: IndexSector[];
    benchmarkGeography?: GeoEntry[];
    assetGeo?: Record<string, string>;
}

export const SectorDeviationCard: React.FC<Props> = ({ currentHoldings, benchmarkData, benchmarkGeography, assetGeo }) => {
    const [deviationView, setDeviationView] = useState<'SECTOR' | 'GEOGRAPHY'>('SECTOR');
    const [hoveredSector, setHoveredSector] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

    // The 11 GICS Sectors
    const GICS_SECTORS = [
        'Materials',
        'Consumer Discretionary',
        'Financials',
        'Real Estate',
        'Communication Services',
        'Energy',
        'Industrials',
        'Technology',
        'Consumer Staples',
        'Health Care',
        'Utilities'
    ] as const;

    // Mapping from yfinance sector names to our standardized GICS sectors
    const SECTOR_MAP: Record<string, string> = {
        'Basic Materials': 'Materials',
        'Materials': 'Materials',
        'Consumer Cyclical': 'Consumer Discretionary',
        'Consumer Discretionary': 'Consumer Discretionary',
        'Financial Services': 'Financials',
        'Financials': 'Financials',
        'Financial': 'Financials',
        'Real Estate': 'Real Estate',
        'Communication Services': 'Communication Services',
        'Communication': 'Communication Services',
        'Energy': 'Energy',
        'Industrials': 'Industrials',
        'Industrial': 'Industrials',
        'Technology': 'Technology',
        'Information Technology': 'Technology',
        'Consumer Defensive': 'Consumer Staples',
        'Consumer Staples': 'Consumer Staples',
        'Healthcare': 'Health Care',
        'Health Care': 'Health Care',
        'Utilities': 'Utilities',
    };

    const sectorData = useMemo(() => {
        // 1. Aggregating Portfolio Weights using PortfolioTable logic
        const portfolioWeights: Record<string, number> = {};
        GICS_SECTORS.forEach(s => portfolioWeights[s] = 0);

        currentHoldings.forEach(item => {
            if (item.sector === 'CASH') return;

            // Check for explicit sector weights (ETFs/MFs)
            if (item.sectorWeights) {
                Object.entries(item.sectorWeights).forEach(([rawSector, weightVal]) => {
                    const normalized = SECTOR_MAP[rawSector] || (GICS_SECTORS.includes(rawSector as any) ? rawSector : null);

                    if (normalized && typeof weightVal === 'number') {
                        portfolioWeights[normalized] += item.weight * (weightVal / 100);
                    }
                });
            } else {
                // Standard single sector
                const normalized = SECTOR_MAP[item.sector];
                if (normalized) {
                    portfolioWeights[normalized] += item.weight;
                }
            }
        });

        // 2. Mapping Benchmark Weights
        const benchmarkWeights: Record<string, number> = {};
        benchmarkData.forEach(item => {
            const normalized = SECTOR_MAP[item.sector];
            if (normalized) {
                benchmarkWeights[normalized] = item.Index;
            }
        });

        // 3. Define Groups and Order
        const groups = [
            {
                name: 'Cyclical',
                color: 'text-red-600 dark:text-red-400',
                bgColor: 'bg-red-100 dark:bg-red-900/20',
                sectors: ['Materials', 'Consumer Discretionary', 'Financials', 'Real Estate']
            },
            {
                name: 'Sensitive',
                color: 'text-blue-600 dark:text-blue-400',
                bgColor: 'bg-blue-100 dark:bg-blue-900/20',
                sectors: ['Communication Services', 'Energy', 'Industrials', 'Technology']
            },
            {
                name: 'Defensive',
                color: 'text-green-600 dark:text-green-400',
                bgColor: 'bg-green-100 dark:bg-green-900/20',
                sectors: ['Consumer Staples', 'Health Care', 'Utilities']
            }
        ];

        // 4. Build Rows based on GROUPS
        const resultGroups = groups.map(group => {
            const groupSectors = group.sectors.map(sectorKey => {
                const actual = portfolioWeights[sectorKey] || 0;
                const bench = benchmarkWeights[sectorKey] || 0;

                // Display Name Map
                let displayName = sectorKey;
                if (sectorKey === 'Consumer Discretionary') displayName = 'Cons. Cyclical';
                if (sectorKey === 'Consumer Staples') displayName = 'Cons. Defensive';
                if (sectorKey === 'Communication Services') displayName = 'Comm. Services';
                if (sectorKey === 'Financials') displayName = 'Financials';
                if (sectorKey === 'Materials') displayName = 'Basic Materials';

                return {
                    name: displayName,
                    key: sectorKey,
                    actual: actual,
                    benchmark: bench,
                    delta: actual - bench
                };
            });
            return { ...group, sectors: groupSectors };
        });

        const totalActual = Object.values(portfolioWeights).reduce((acc, v) => acc + v, 0);

        return { groups: resultGroups, totalActual };
    }, [currentHoldings, benchmarkData]);

    // Geography deviation data
    const geoDeviationData = useMemo(() => {
        if (!benchmarkGeography || benchmarkGeography.length === 0) return [];

        // Portfolio by geography (respecting manual overrides via assetGeo)
        const portfolioGeo: Record<string, number> = { CA: 0, US: 0, INTL: 0 };
        currentHoldings.forEach(item => {
            if (item.sector === 'CASH') return;

            let region = 'US'; // default
            const t = item.ticker.toUpperCase();

            // Check manual override first
            if (assetGeo && assetGeo[item.ticker]) {
                region = assetGeo[item.ticker];
            } else if (t.endsWith('.TO')) {
                region = 'CA';
            }

            if (portfolioGeo[region] !== undefined) {
                portfolioGeo[region] += item.weight;
            } else {
                portfolioGeo['INTL'] += item.weight;
            }
        });

        // Benchmark by geography — bucket each country into CA/US/INTL
        const benchmarkGeo: Record<string, number> = { CA: 0, US: 0, INTL: 0 };
        benchmarkGeography.forEach(entry => {
            let region = 'INTL';
            if (entry.region === 'Canada') region = 'CA';
            if (entry.region === 'United States') region = 'US';
            benchmarkGeo[region] += entry.weight;
        });

        return [
            { region: 'CA', label: 'Canada', benchmark: benchmarkGeo.CA, actual: portfolioGeo.CA, delta: portfolioGeo.CA - benchmarkGeo.CA },
            { region: 'US', label: 'United States', benchmark: benchmarkGeo.US, actual: portfolioGeo.US, delta: portfolioGeo.US - benchmarkGeo.US },
            { region: 'INTL', label: 'International', benchmark: benchmarkGeo.INTL, actual: portfolioGeo.INTL, delta: portfolioGeo.INTL - benchmarkGeo.INTL },
        ];
    }, [currentHoldings, benchmarkGeography, assetGeo]);

    // Map of GICS sector key → contributors (direct holdings + ETF passthrough)
    const sectorHoldings = useMemo(() => {
        const map: Record<string, { ticker: string; weight: number; isEtf: boolean }[]> = {};
        currentHoldings.forEach(item => {
            if (item.sector === 'CASH') return;
            if (item.sectorWeights) {
                // ETF/MF: distribute weight proportionally across its sector breakdown
                Object.entries(item.sectorWeights).forEach(([rawSector, pct]) => {
                    const normalized = SECTOR_MAP[rawSector] || (GICS_SECTORS.includes(rawSector as any) ? rawSector : null);
                    if (!normalized || typeof pct !== 'number') return;
                    const contribution = item.weight * (pct / 100);
                    if (contribution < 0.001) return;
                    if (!map[normalized]) map[normalized] = [];
                    map[normalized].push({ ticker: item.ticker, weight: contribution, isEtf: true });
                });
            } else {
                const normalized = SECTOR_MAP[item.sector ?? ''];
                if (!normalized) return;
                if (!map[normalized]) map[normalized] = [];
                map[normalized].push({ ticker: item.ticker, weight: item.weight, isEtf: false });
            }
        });
        Object.keys(map).forEach(k => map[k].sort((a, b) => b.weight - a.weight));
        return map;
    }, [currentHoldings]);

    const DeltaBar = ({ val }: { val: number }) => {
        const absVal = Math.abs(val);
        const maxScale = 5;
        const width = Math.min((absVal / maxScale) * 100, 100);
        return (
            <div className="flex items-center w-full h-6 font-mono text-sm">
                <div className="flex-1 flex justify-end pr-1 relative h-full items-center">
                    {val < 0 && <div className="h-4 bg-rose-500 absolute right-0 top-1 rounded-l-sm" style={{ width: `${width}%` }} />}
                    {val >= 0 && <span className="text-emerald-700 font-bold z-10">{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>}
                </div>
                <div className="w-px h-full bg-wallstreet-500 z-10" />
                <div className="flex-1 flex justify-start pl-1 relative h-full items-center">
                    {val > 0 && <div className="h-4 bg-emerald-500 absolute left-0 top-1 rounded-r-sm" style={{ width: `${width}%` }} />}
                    {val < 0 && <span className="text-rose-700 font-bold z-10">({Math.abs(val).toFixed(2)}%)</span>}
                </div>
            </div>
        );
    };

    return (
        <>
        <div className="lg:col-span-1 bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm">
                    Benchmark Deviation
                </h3>
                <div className="flex gap-0.5 bg-wallstreet-50 rounded-lg p-0.5">
                    <button
                        onClick={() => setDeviationView('SECTOR')}
                        className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all ${
                            deviationView === 'SECTOR'
                                ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                : 'text-wallstreet-500 hover:text-wallstreet-600'
                        }`}
                    >
                        Sectors
                    </button>
                    <button
                        onClick={() => setDeviationView('GEOGRAPHY')}
                        className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all ${
                            deviationView === 'GEOGRAPHY'
                                ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                : 'text-wallstreet-500 hover:text-wallstreet-600'
                        }`}
                    >
                        Geography
                    </button>
                </div>
            </div>

            <div className="flex-1 w-full overflow-auto">
                {deviationView === 'SECTOR' ? (
                    <table className="w-full text-sm font-mono border-collapse">
                        <thead className="bg-wallstreet-50 text-wallstreet-500 text-xs uppercase sticky top-0">
                            <tr>
                                <th className="w-8 p-2"></th>
                                <th className="p-2 text-left w-[26%]">Sector</th>
                                <th className="p-2 text-right w-[22%]">Bench</th>
                                <th className="p-2 text-right w-[22%]">Actual</th>
                                <th className="p-2 text-center w-[30%] pb-2">
                                    <span className="border-b border-wallstreet-300 pb-0.5">Delta</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-wallstreet-100">
                            {sectorData.groups.map((group, gIdx) => (
                                <React.Fragment key={gIdx}>
                                    {group.sectors.map((sector, sIdx) => (
                                        <tr
                                            key={sector.name}
                                            className="hover:bg-wallstreet-50 cursor-default"
                                            onMouseEnter={(e) => {
                                                const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                                                setHoveredSector(sector.key);
                                                setTooltipPos({ x: rect.right + 8, y: rect.top });
                                            }}
                                            onMouseLeave={() => { setHoveredSector(null); setTooltipPos(null); }}
                                        >
                                            {sIdx === 0 && (
                                                <td
                                                    rowSpan={group.sectors.length}
                                                    className={`p-0 text-center border-r-2 ${group.name === 'Cyclical' ? 'border-red-200 bg-red-50 dark:border-red-800/60 dark:bg-red-900/20' : group.name === 'Sensitive' ? 'border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20' : 'border-green-200 bg-green-50 dark:border-green-800/60 dark:bg-green-900/20'} align-middle relative`}
                                                >
                                                    <div className="h-full w-full flex items-center justify-center py-4">
                                                        <span
                                                            className={`text-[11px] uppercase -rotate-90 whitespace-nowrap font-black tracking-widest ${group.color}`}
                                                            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
                                                        >
                                                            {group.name}
                                                        </span>
                                                    </div>
                                                </td>
                                            )}
                                            <td className={`p-2 font-bold ${group.bgColor}`}>
                                                <span className={`${group.color} text-sm`}>{sector.name}</span>
                                            </td>
                                            <td className={`p-2 text-right text-wallstreet-500 text-sm ${group.bgColor}`}>
                                                {sector.benchmark.toFixed(2)}%
                                            </td>
                                            <td className={`p-2 text-right font-bold text-wallstreet-text text-sm ${group.bgColor}`}>
                                                {sector.actual.toFixed(2)}%
                                            </td>
                                            <td className={`p-2 ${group.bgColor}`}>
                                                <DeltaBar val={sector.delta} />
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot className="bg-wallstreet-100 border-t-2 border-wallstreet-300">
                            <tr>
                                <td className="p-2 font-bold text-right text-xs uppercase" colSpan={3}>Total Allocated:</td>
                                <td className="p-2 text-right font-bold text-wallstreet-text text-sm">{sectorData.totalActual.toFixed(2)}%</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                ) : (
                    /* Geography view */
                    <div className="flex flex-col h-full">
                        {geoDeviationData.length === 0 ? (
                            <p className="text-xs text-wallstreet-400 italic mt-4 text-center">Geography benchmark data not available.</p>
                        ) : (
                            <table className="w-full text-sm font-mono border-collapse">
                                <thead className="bg-wallstreet-50 text-wallstreet-500 text-xs uppercase sticky top-0">
                                    <tr>
                                        <th className="p-2 text-left w-[28%]">Region</th>
                                        <th className="p-2 text-right w-[24%]">Bench</th>
                                        <th className="p-2 text-right w-[24%]">Actual</th>
                                        <th className="p-2 text-center w-[24%]">
                                            <span className="border-b border-wallstreet-300 pb-0.5">Delta</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-wallstreet-100">
                                    {geoDeviationData.map(row => (
                                        <tr key={row.region} className="hover:bg-wallstreet-50">
                                            <td className="p-2 font-bold text-wallstreet-text">{row.label}</td>
                                            <td className="p-2 text-right text-wallstreet-500">{row.benchmark.toFixed(2)}%</td>
                                            <td className="p-2 text-right font-bold text-wallstreet-text">{row.actual.toFixed(2)}%</td>
                                            <td className="p-2">
                                                <DeltaBar val={row.delta} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-wallstreet-100 border-t-2 border-wallstreet-300">
                                    <tr>
                                        <td className="p-2 font-bold text-right text-xs uppercase" colSpan={2}>Total Portfolio:</td>
                                        <td className="p-2 text-right font-bold text-wallstreet-text text-sm">
                                            {geoDeviationData.reduce((s, r) => s + r.actual, 0).toFixed(2)}%
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Sector hover tooltip — shows holdings driving the deviation */}
        {hoveredSector && tooltipPos && ReactDOM.createPortal(
            <div
                style={{ position: 'fixed', top: tooltipPos.y, left: tooltipPos.x, zIndex: 9999, transform: 'translateY(-20%)' }}
                className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg shadow-xl text-xs font-mono min-w-[200px] pointer-events-none"
                onMouseEnter={() => setHoveredSector(null)}
            >
                <div className="px-3 py-2 border-b border-wallstreet-700 font-bold text-wallstreet-text text-[11px] uppercase tracking-wider">
                    {hoveredSector} Exposure
                </div>
                {(sectorHoldings[hoveredSector] ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-wallstreet-500 italic text-[11px]">No allocation in this sector</div>
                ) : (
                    <div className="px-3 py-2 space-y-1.5">
                        {sectorHoldings[hoveredSector].map(h => (
                            <div key={h.ticker} className="flex justify-between items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-wallstreet-text">{h.ticker}</span>
                                    {h.isEtf && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-semibold">ETF</span>}
                                </div>
                                <span className="text-wallstreet-500">{h.weight.toFixed(2)}%</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>,
            document.body
        )}
        </>
    );
};
