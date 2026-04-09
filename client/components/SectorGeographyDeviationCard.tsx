import React, { useMemo, useState } from 'react';
import { BenchmarkGeographyRow, BenchmarkSectorRow, PortfolioItem } from '../types';
import { useThemeColors } from '../hooks/useThemeColors';

interface Props {
    currentHoldings: PortfolioItem[];
    benchmarkSectors: BenchmarkSectorRow[];
    benchmarkGeography: BenchmarkGeographyRow[];
    assetGeo?: Record<string, string>;
    noWrapper?: boolean;
    titleActions?: React.ReactNode;
}

const SECTOR_ORDER = [
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
    'Utilities',
] as const;

const SECTOR_DISPLAY: Record<string, string> = {
    'Materials': 'Materials',
    'Consumer Discretionary': 'Discretionary',
    'Financials': 'Financials',
    'Real Estate': 'Real Estate',
    'Communication Services': 'Communications',
    'Energy': 'Energy',
    'Industrials': 'Industrials',
    'Technology': 'Technology',
    'Consumer Staples': 'Staples',
    'Health Care': 'Health Care',
    'Utilities': 'Utilities',
};

const SECTOR_GROUP_COLOR: Record<string, string> = {
    'Materials': 'text-red-700',
    'Consumer Discretionary': 'text-red-700',
    'Financials': 'text-red-700',
    'Real Estate': 'text-red-700',
    'Communication Services': 'text-blue-700',
    'Energy': 'text-blue-700',
    'Industrials': 'text-blue-700',
    'Technology': 'text-blue-700',
    'Consumer Staples': 'text-green-700',
    'Health Care': 'text-green-700',
    'Utilities': 'text-green-700',
};

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

const GEOS = ['CA', 'US', 'INTL'] as const;
type GeoKey = typeof GEOS[number];

// Helper: classify a holding into a geo bucket — identical logic to SectorDeviationCard
function getGeo(item: PortfolioItem, assetGeo?: Record<string, string>): GeoKey {
    if (assetGeo && assetGeo[item.ticker]) {
        const m = assetGeo[item.ticker];
        return m === 'CA' ? 'CA' : m === 'INTL' ? 'INTL' : 'US';
    }
    return item.ticker.toUpperCase().endsWith('.TO') ? 'CA' : 'US';
}

// Helper: benchmark geo buckets from benchmarkGeography
function getBenchGeoTotals(benchmarkGeography: BenchmarkGeographyRow[]): Record<GeoKey, number> {
    const totals: Record<GeoKey, number> = { CA: 0, US: 0, INTL: 0 };
    benchmarkGeography.forEach(entry => {
        const bucket: GeoKey =
            entry.region === 'Canada' ? 'CA' :
            entry.region === 'United States' ? 'US' : 'INTL';
        totals[bucket] += entry.weight;
    });
    return totals;
}

function getDeltaBg(_delta: number, _minDelta: number, _maxDelta: number): string {
    return 'transparent';
}

function getDeltaTextColor(delta: number, isDark: boolean): string {
    if (delta > 0.05) return isDark ? '#4ade80' : '#15803d';  // dark: green-400, light: green-700
    if (delta < -0.05) return isDark ? '#f87171' : '#b91c1c'; // dark: red-400, light: red-700
    return isDark ? '#94a3b8' : '#64748b'; // slate-400/500
}

function getAbsoluteBg(_weight: number, _maxWeight: number): string {
    return 'transparent';
}

function getAbsoluteTextColor(weight: number, isDark: boolean): string {
    if (weight < 0.005) return isDark ? '#cbd5e1' : '#94a3b8';
    return isDark ? '#f1f5f9' : '#0f172a';
}

export const SectorGeographyDeviationCard: React.FC<Props> = ({
    currentHoldings,
    benchmarkSectors,
    benchmarkGeography,
    assetGeo,
    noWrapper,
    titleActions,
}) => {
    const { isDark } = useThemeColors();
    const [viewMode, setViewMode] = useState<'RELATIVE' | 'ABSOLUTE'>('RELATIVE');
    
    const { deltaGrid, totalDelta, portfolioGrid, portfolioGeoTotal, minDelta, maxDelta, maxPortfolioWeight } = useMemo(() => {
        // ── Portfolio: sector × geo grid ─────────────────────────────────
        const portfolioGrid: Record<string, Record<GeoKey, number>> = {};
        SECTOR_ORDER.forEach(s => { portfolioGrid[s] = { CA: 0, US: 0, INTL: 0 }; });

        currentHoldings.forEach(item => {
            if (item.sector === 'CASH') return;
            const geo = getGeo(item, assetGeo);

            if (item.sectorWeights) {
                Object.entries(item.sectorWeights).forEach(([rawSector, pct]) => {
                    const normalized = SECTOR_MAP[rawSector] || (SECTOR_ORDER.includes(rawSector as any) ? rawSector : null);
                    if (normalized && portfolioGrid[normalized] && typeof pct === 'number') {
                        portfolioGrid[normalized][geo] += item.weight * (pct / 100);
                    }
                });
            } else {
                const normalized = SECTOR_MAP[item.sector];
                if (normalized && portfolioGrid[normalized]) {
                    portfolioGrid[normalized][geo] += item.weight;
                }
            }
        });

        // ── Benchmark: distribute sector weights proportionally across geos ─
        const benchGeoTotals = getBenchGeoTotals(benchmarkGeography);
        const totalGeoWeight = benchGeoTotals.CA + benchGeoTotals.US + benchGeoTotals.INTL;

        const benchmarkGrid: Record<string, Record<GeoKey, number>> = {};
        SECTOR_ORDER.forEach(s => { benchmarkGrid[s] = { CA: 0, US: 0, INTL: 0 }; });

        benchmarkSectors.forEach(item => {
            const normalized = SECTOR_MAP[item.sector] || (SECTOR_ORDER.includes(item.sector as any) ? item.sector : null);
            if (!normalized || !benchmarkGrid[normalized] || totalGeoWeight <= 0) return;
            GEOS.forEach(geo => {
                benchmarkGrid[normalized][geo] = item.benchmarkWeight * (benchGeoTotals[geo] / totalGeoWeight);
            });
        });

        // ── Delta grid ────────────────────────────────────────────────────
        const deltaGrid: Record<string, Record<GeoKey, number>> = {};
        let minDelta = 0;
        let maxDelta = 0;
        SECTOR_ORDER.forEach(s => {
            deltaGrid[s] = { CA: 0, US: 0, INTL: 0 };
            GEOS.forEach(geo => {
                const d = (portfolioGrid[s][geo] || 0) - (benchmarkGrid[s][geo] || 0);
                deltaGrid[s][geo] = d;
                if (d < minDelta) minDelta = d;
                if (d > maxDelta) maxDelta = d;
            });
        });

        // ── TOTAL row: direct geo sum — identical to SectorDeviationCard geoDeviationData ─
        // Portfolio: simple sum by geo (all holdings except CASH)
        const portfolioGeoTotal: Record<GeoKey, number> = { CA: 0, US: 0, INTL: 0 };
        currentHoldings.forEach(item => {
            if (item.sector === 'CASH') return;
            const geo = getGeo(item, assetGeo);
            portfolioGeoTotal[geo] += item.weight;
        });

        // Benchmark: same bucket logic
        const totalDelta: Record<GeoKey, number> = { CA: 0, US: 0, INTL: 0 };
        GEOS.forEach(geo => {
            totalDelta[geo] = portfolioGeoTotal[geo] - benchGeoTotals[geo];
        });

        // Extend min/max to cover total row values too
        GEOS.forEach(geo => {
            if (totalDelta[geo] < minDelta) minDelta = totalDelta[geo];
            if (totalDelta[geo] > maxDelta) maxDelta = totalDelta[geo];
        });

        // ── ABSOLUTE max for green tint
        let maxPortfolioWeight = 0;
        SECTOR_ORDER.forEach(s => {
            GEOS.forEach(geo => {
                const w = portfolioGrid[s][geo] || 0;
                if (w > maxPortfolioWeight) maxPortfolioWeight = w;
            });
        });

        GEOS.forEach(geo => {
             if (portfolioGeoTotal[geo] > maxPortfolioWeight) maxPortfolioWeight = portfolioGeoTotal[geo];
        });

        return { deltaGrid, totalDelta, portfolioGrid, portfolioGeoTotal, minDelta, maxDelta, maxPortfolioWeight };
    }, [currentHoldings, benchmarkSectors, benchmarkGeography, assetGeo]);

    const DataCell: React.FC<{ val: number; isRelative: boolean; bgColor?: string; noBg?: boolean; isBold?: boolean }> = ({ val, isRelative, bgColor, noBg, isBold }) => {
        const cellBgColor = noBg 
            ? 'transparent' 
            : (isRelative ? getDeltaBg(val, minDelta, maxDelta) : getAbsoluteBg(val, maxPortfolioWeight));

        const textColor = isRelative 
            ? getDeltaTextColor(val, isDark) 
            : getAbsoluteTextColor(val, isDark);

        const formatValue = (v: number) => {
            if (Math.abs(v) < 0.005) return <span style={{ color: isDark ? '#cbd5e1' : '#94a3b8' }}>—</span>;
            if (isRelative) {
                if (v < 0) return `(${Math.abs(v).toFixed(2)}%)`;
                return `+${v.toFixed(2)}%`;
            } else {
                return `${v.toFixed(2)}%`;
            }
        };

        return (
            <td className={`p-0 align-middle ${bgColor || ''} relative`}>
                <div
                    className={`w-full h-full flex items-center justify-center p-1 text-center text-sm relative cursor-default ${isBold ? 'font-black' : 'font-bold'}`}
                    style={{
                        backgroundColor: cellBgColor === 'transparent' ? undefined : cellBgColor,
                        color: textColor,
                    }}
                >
                    {formatValue(val)}
                </div>
            </td>
        );
    };

    const GROUPS = [
        { name: 'Cyclical', color: 'text-red-600 dark:text-red-400', borderColor: 'border-red-200 dark:border-red-800/60', bgColor: 'bg-red-100 dark:bg-red-900/20', sectors: ['Materials', 'Consumer Discretionary', 'Financials', 'Real Estate'] },
        { name: 'Sensitive', color: 'text-blue-600 dark:text-blue-400', borderColor: 'border-blue-200 dark:border-blue-800/60', bgColor: 'bg-blue-100 dark:bg-blue-900/20', sectors: ['Communication Services', 'Energy', 'Industrials', 'Technology'] },
        { name: 'Defensive', color: 'text-green-600 dark:text-green-400', borderColor: 'border-green-200 dark:border-green-800/60', bgColor: 'bg-green-100 dark:bg-green-900/20', sectors: ['Consumer Staples', 'Health Care', 'Utilities'] },
    ];

    return (
        <div className={noWrapper ? "flex flex-col h-full" : "lg:col-span-1 bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full"}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-1.5 font-mono font-bold text-wallstreet-text uppercase tracking-wider text-[16px]">
                    Regional Sector Tilt
                    {titleActions}
                </h3>
                <div className="flex gap-0.5 bg-wallstreet-50 rounded-lg p-0.5">
                    <button
                        onClick={() => setViewMode('RELATIVE')}
                        className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all ${
                            viewMode === 'RELATIVE'
                                ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                : 'text-wallstreet-500 hover:text-wallstreet-600'
                        }`}
                    >
                        Relative
                    </button>
                    <button
                        onClick={() => setViewMode('ABSOLUTE')}
                        className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all ${
                            viewMode === 'ABSOLUTE'
                                ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                : 'text-wallstreet-500 hover:text-wallstreet-600'
                        }`}
                    >
                        Absolute
                    </button>
                </div>
            </div>

            <div className="flex-1 w-full overflow-hidden">
                <table className="w-full text-sm font-mono border-collapse h-full table-fixed">
                    <thead className="bg-wallstreet-50 text-wallstreet-500 text-xs uppercase sticky top-0">
                        <tr>
                            <th className="w-8 p-1"></th>
                            <th className="p-1 text-left">Sector</th>
                            <th className="p-1 text-center text-wallstreet-500" style={{ width: '120px', minWidth: '120px' }}>CA</th>
                            <th className="p-1 text-center text-wallstreet-500" style={{ width: '120px', minWidth: '120px' }}>US</th>
                            <th className="p-1 text-center text-wallstreet-500" style={{ width: '120px', minWidth: '120px' }}>INTL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-wallstreet-100">
                        {GROUPS.map((group, gIdx) => (
                            <React.Fragment key={group.name}>
                                {group.sectors.map((sector, sIdx) => (
                                    <tr key={sector}>
                                        {sIdx === 0 && (
                                            <td
                                                rowSpan={group.sectors.length}
                                                className={`p-0 text-center border-r-2 ${group.borderColor} ${group.bgColor} align-middle relative`}
                                            >
                                                <div className="h-full w-full flex items-center justify-center py-1">
                                                    <span
                                                        className={`text-[11px] uppercase whitespace-nowrap font-black tracking-widest ${group.color}`}
                                                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
                                                    >
                                                        {group.name}
                                                    </span>
                                                </div>
                                            </td>
                                        )}
                                        <td className={`p-1 font-bold ${group.bgColor}`}>
                                            <span className={`text-sm ${group.color}`}>
                                                {SECTOR_DISPLAY[sector]}
                                            </span>
                                        </td>
                                        {GEOS.map(geo => (
                                            <DataCell 
                                                key={geo} 
                                                val={viewMode === 'RELATIVE' ? (deltaGrid[sector]?.[geo] ?? 0) : (portfolioGrid[sector]?.[geo] ?? 0)} 
                                                isRelative={viewMode === 'RELATIVE'}
                                                bgColor={group.bgColor} 
                                            />
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                    <tfoot className="bg-wallstreet-100 border-t-2 border-wallstreet-300">
                        <tr>
                            <td></td>
                            <td className="p-1 font-bold text-right text-xs uppercase text-wallstreet-500">Total</td>
                            {GEOS.map(geo => (
                                <DataCell
                                    key={geo}
                                    val={viewMode === 'RELATIVE' ? totalDelta[geo] : portfolioGeoTotal[geo]}
                                    isRelative={viewMode === 'RELATIVE'}
                                    noBg
                                    isBold
                                />
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
