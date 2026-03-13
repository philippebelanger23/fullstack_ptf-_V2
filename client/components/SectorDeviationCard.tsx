import React, { useMemo } from 'react';
import { PortfolioItem } from '../types';

interface IndexSector {
    sector: string;
    Index: number; // The benchmark weight
    ACWI?: number;
    TSX?: number;
}

interface Props {
    currentHoldings: PortfolioItem[];
    benchmarkData: IndexSector[];
}

export const SectorDeviationCard: React.FC<Props> = ({ currentHoldings, benchmarkData }) => {

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
                    // Normalize the key just in case
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
                // Benchmark data: assumption is field 'Index' is %
                benchmarkWeights[normalized] = item.Index;
            }
        });

        // 3. Define Groups and Order
        const groups = [
            {
                name: 'Cyclical',
                color: 'text-red-700',
                sectors: ['Materials', 'Consumer Discretionary', 'Financials', 'Real Estate']
            },
            {
                name: 'Sensitive',
                color: 'text-blue-700',
                sectors: ['Communication Services', 'Energy', 'Industrials', 'Technology']
            },
            {
                name: 'Defensive',
                color: 'text-green-700',
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
                if (sectorKey === 'Financials') displayName = 'Financial Services';
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

    return (
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
            <div className="mb-4">
                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2">
                    Sector Deviation vs Benchmark
                </h3>
            </div>

            <div className="flex-1 w-full overflow-auto">
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
                                    <tr key={sector.name} className="hover:bg-wallstreet-50">
                                        {sIdx === 0 && (
                                            <td
                                                rowSpan={group.sectors.length}
                                                className={`p-0 text-center border-r-2 ${group.name === 'Cyclical' ? 'border-red-100 bg-red-50/10' : group.name === 'Sensitive' ? 'border-blue-100 bg-blue-50/10' : 'border-green-100 bg-green-50/10'} align-middle relative`}
                                            >
                                                {/* Container for vertical text */}
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
                                        <td className="p-2 font-bold">
                                            <span className={`${group.color} text-sm`}>
                                                {sector.name}
                                            </span>
                                        </td>
                                        <td className="p-2 text-right text-slate-500 text-sm">
                                            {sector.benchmark.toFixed(2)}%
                                        </td>
                                        <td className="p-2 text-right font-bold text-wallstreet-text text-sm">
                                            {sector.actual.toFixed(2)}%
                                        </td>
                                        <td className="p-2">
                                            {(() => {
                                                const val = sector.delta;
                                                const absVal = Math.abs(val);
                                                const maxScale = 5;
                                                const width = Math.min((absVal / maxScale) * 100, 100);

                                                return (
                                                    <div className="flex items-center w-full h-6 font-mono text-sm">
                                                        {/* Left Half (Text for positive, Bar for negative) */}
                                                        <div className="flex-1 flex justify-end pr-1 relative h-full items-center">
                                                            {val < 0 && <div className="h-4 bg-rose-500 absolute right-0 top-1 rounded-l-sm" style={{ width: `${width}%` }} />}
                                                            {val >= 0 && <span className="text-emerald-700 font-bold z-10">+{val.toFixed(2)}%</span>}
                                                        </div>

                                                        {/* Center Divider */}
                                                        <div className="w-px h-full bg-slate-300 z-10" />

                                                        {/* Right Half (Bar for positive, Text for negative) */}
                                                        <div className="flex-1 flex justify-start pl-1 relative h-full items-center">
                                                            {val > 0 && <div className="h-4 bg-emerald-500 absolute left-0 top-1 rounded-r-sm" style={{ width: `${width}%` }} />}
                                                            {val < 0 && <span className="text-rose-700 font-bold z-10">{val.toFixed(2)}%</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                                {/* Spacer Row between groups? Optional but good for visual separation */}
                                {gIdx < sectorData.groups.length - 1 && (
                                    <tr className="h-1 bg-white border-0"></tr>
                                )}
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
            </div>
        </div>
    );
};
