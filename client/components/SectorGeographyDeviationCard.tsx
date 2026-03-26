import React, { useMemo } from 'react';
import { PortfolioItem } from '../types';
import { useThemeColors } from '../hooks/useThemeColors';

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
    benchmarkSectors: IndexSector[];
    benchmarkGeography: GeoEntry[];
    assetGeo?: Record<string, string>;
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
function getBenchGeoTotals(benchmarkGeography: GeoEntry[]): Record<GeoKey, number> {
    const totals: Record<GeoKey, number> = { CA: 0, US: 0, INTL: 0 };
    benchmarkGeography.forEach(entry => {
        const bucket: GeoKey =
            entry.region === 'Canada' ? 'CA' :
            entry.region === 'United States' ? 'US' : 'INTL';
        totals[bucket] += entry.weight;
    });
    return totals;
}

// Light background tint (rose-50 → rose-200 range) + #f43f5e/#10b981 text
function getDeltaBg(delta: number, minDelta: number, maxDelta: number): string {
    if (Math.abs(delta) < 0.005) return 'transparent';
    if (delta < 0 && minDelta < 0) {
        const t = Math.min(1, delta / minDelta);
        return `rgba(220, 38, 38, ${0.2 + t * 0.65})`;
    } else if (delta > 0 && maxDelta > 0) {
        const t = Math.min(1, delta / maxDelta);
        return `rgba(22, 163, 74, ${0.2 + t * 0.65})`;
    }
    return 'transparent';
}

function getDeltaTextColor(delta: number, isDark: boolean): string {
    if (delta > 0.05) return isDark ? '#4ade80' : '#15803d';  // dark: green-400, light: green-700
    if (delta < -0.05) return isDark ? '#f87171' : '#b91c1c'; // dark: red-400, light: red-700
    return isDark ? '#94a3b8' : '#64748b'; // slate-400/500
}

export const SectorGeographyDeviationCard: React.FC<Props> = ({
    currentHoldings,
    benchmarkSectors,
    benchmarkGeography,
    assetGeo,
}) => {
    const { isDark } = useThemeColors();
    const { deltaGrid, totalDelta, minDelta, maxDelta } = useMemo(() => {
        // ── Portfolio: sector × geo grid ─────────────────────────────────
        const portfolioGrid: Record<string, Record<GeoKey, number>> = {};
        SECTOR_ORDER.forEach(s => { portfolioGrid[s] = { CA: 0, US: 0, INTL: 0 }; });

        currentHoldings.forEach(item => {
            if (item.sector === 'CASH') return;
            const geo = getGeo(item, assetGeo);

            if (item.sectorWeights) {
                Object.entries(item.sectorWeights).forEach(([rawSector, pct]) => {
                    const normalized = SECTOR_MAP[rawSector] || (SECTOR_ORDER.includes(rawSector as any) ? rawSector : null);
                    if (normalized && portfolioGrid[normalized]) {
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
                benchmarkGrid[normalized][geo] = item.Index * (benchGeoTotals[geo] / totalGeoWeight);
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

        return { deltaGrid, totalDelta, minDelta, maxDelta };
    }, [currentHoldings, benchmarkSectors, benchmarkGeography, assetGeo]);

    const formatDelta = (v: number) => {
        if (Math.abs(v) < 0.005) return <span style={{ color: isDark ? '#cbd5e1' : '#94a3b8' }}>—</span>;
        if (v < 0) return `(${Math.abs(v).toFixed(2)}%)`;
        return `+${v.toFixed(2)}%`;
    };

    const DeltaCell = ({ delta, bgColor, noBg }: { delta: number; bgColor?: string; noBg?: boolean }) => {
        const deltaBgColor = noBg ? 'transparent' : getDeltaBg(delta, minDelta, maxDelta);
        return (
            <td
                className={`p-2 text-center font-bold text-sm ${bgColor || ''}`}
                style={{
                    backgroundColor: deltaBgColor === 'transparent' ? undefined : deltaBgColor,
                    color: getDeltaTextColor(delta, isDark),
                }}
            >
                {formatDelta(delta)}
            </td>
        );
    };

    const GROUPS = [
        { name: 'Cyclical', color: 'text-red-600 dark:text-red-400', borderColor: 'border-red-200 dark:border-red-800/60', bgColor: 'bg-red-100 dark:bg-red-900/20', sectors: ['Materials', 'Consumer Discretionary', 'Financials', 'Real Estate'] },
        { name: 'Sensitive', color: 'text-blue-600 dark:text-blue-400', borderColor: 'border-blue-200 dark:border-blue-800/60', bgColor: 'bg-blue-100 dark:bg-blue-900/20', sectors: ['Communication Services', 'Energy', 'Industrials', 'Technology'] },
        { name: 'Defensive', color: 'text-green-600 dark:text-green-400', borderColor: 'border-green-200 dark:border-green-800/60', bgColor: 'bg-green-100 dark:bg-green-900/20', sectors: ['Consumer Staples', 'Health Care', 'Utilities'] },
    ];

    return (
        <div className="lg:col-span-1 bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full">
            <div className="mb-4">
                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm">
                    Regional Sector Tilt
                </h3>
            </div>

            <div className="flex-1 w-full overflow-auto">
                <table className="w-full text-sm font-mono border-collapse h-full">
                    <thead className="bg-wallstreet-50 text-wallstreet-500 text-xs uppercase sticky top-0">
                        <tr>
                            <th className="w-8 p-2"></th>
                            <th className="p-2 text-left">Sector</th>
                            <th className="p-2 text-center text-wallstreet-500">CA</th>
                            <th className="p-2 text-center text-wallstreet-500">US</th>
                            <th className="p-2 text-center text-wallstreet-500">INTL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-wallstreet-100">
                        {GROUPS.map((group, gIdx) => (
                            <React.Fragment key={group.name}>
                                {group.sectors.map((sector, sIdx) => (
                                    <tr key={sector} className="hover:bg-wallstreet-50" style={{ height: '42px' }}>
                                        {sIdx === 0 && (
                                            <td
                                                rowSpan={group.sectors.length}
                                                className={`p-0 text-center border-r-2 ${group.borderColor} ${group.bgColor} align-middle relative`}
                                            >
                                                <div className="h-full w-full flex items-center justify-center py-4">
                                                    <span
                                                        className={`text-[11px] uppercase whitespace-nowrap font-black tracking-widest ${group.color}`}
                                                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
                                                    >
                                                        {group.name}
                                                    </span>
                                                </div>
                                            </td>
                                        )}
                                        <td className={`p-2 font-bold ${group.bgColor}`}>
                                            <span className={`text-sm ${group.color}`}>
                                                {SECTOR_DISPLAY[sector]}
                                            </span>
                                        </td>
                                        {GEOS.map(geo => (
                                            <DeltaCell key={geo} delta={deltaGrid[sector]?.[geo] ?? 0} bgColor={group.bgColor} />
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                    <tfoot className="bg-wallstreet-100 border-t-2 border-wallstreet-300">
                        <tr style={{ height: '42px' }}>
                            <td></td>
                            <td className="p-2 font-bold text-right text-xs uppercase text-wallstreet-500">Total</td>
                            {GEOS.map(geo => (
                                <DeltaCell key={geo} delta={totalDelta[geo]} noBg />
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
