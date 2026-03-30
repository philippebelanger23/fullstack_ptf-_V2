import React, { useMemo, useState } from 'react';
import { PortfolioItem } from '../types';

interface PortfolioTableProps {
  currentHoldings: PortfolioItem[];
  allData: PortfolioItem[];
  marketBetaMap?: Record<string, number>;
  marketDividendYieldMap?: Record<string, number>;
  assetGeo?: Record<string, string>;
}

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

// Geography display names and order
const GEO_SECTIONS = [
  { key: 'CASH', label: 'Cash', color: 'bg-wallstreet-900 text-wallstreet-text border-wallstreet-700', bg: 'bg-wallstreet-900' },
  { key: 'INTL', label: 'International', color: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { key: 'US', label: 'United States', color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  { key: 'CA', label: 'Canada', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700', bg: 'bg-red-100 dark:bg-red-900/30' },
] as const;

export const PortfolioTable: React.FC<PortfolioTableProps> = ({ currentHoldings: rawHoldings, marketBetaMap, marketDividendYieldMap, assetGeo }) => {
  // Pin cash items to the front before any grouping/sorting
  const currentHoldings = useMemo(() => {
    const cashItems = rawHoldings.filter(i => i.isCash || i.sector === 'CASH' || i.ticker.toUpperCase() === '*CASH*');
    const rest = rawHoldings.filter(i => !i.isCash && i.sector !== 'CASH' && i.ticker.toUpperCase() !== '*CASH*');
    return [...cashItems, ...rest];
  }, [rawHoldings]);

  // Collapse state for each geography section
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (geo: string) => {
    setCollapsed(prev => ({ ...prev, [geo]: !prev[geo] }));
  };

  // Helper to determine if ticker is ETF/MF
  const isETFOrMF = (item: PortfolioItem) => {
    // Keep basic checks for now if we don't have perfect flags, assuming passed items have flags
    // If we only rely on flags from UploadView:
    if (item.isEtf || item.isMutualFund) return true;

    // Fallback logic if flags missing (legacy safety, but ideally we trust flags)
    const t = item.ticker.toUpperCase();
    if (t.startsWith('TDB') || t.startsWith('DYN') || t.startsWith('MFC')) return true;
    if (item.sector === 'Mixed') return true;
    if (t.match(/^X[A-Z]{2,3}\.TO$/)) return true;

    return false;
  };

  // Helper to determine Region based on underlying exposure (not listing currency)
  const getRegion = (item: PortfolioItem) => {
    // Cash has no region — check flag, sector, or known cash ticker name
    if (item.isCash || item.sector === 'CASH' || item.ticker.toUpperCase() === '*CASH*') return 'CASH';

    // If ETF or Mutual Fund, use manual override from UploadView (assetGeo)
    if (isETFOrMF(item)) {
      // Default to US if not specified, or INTL/CA if mapped
      if (assetGeo && assetGeo[item.ticker]) {
        return assetGeo[item.ticker];
      }
      // Fallback default for Funds if no manual setting? Default to US as per user implicit preference or safe default
      return 'US';
    }

    // For plain stocks: Check suffix
    if (item.ticker.toUpperCase().endsWith('.TO')) return 'CA';

    // Default everything else to US
    return 'US';
  };

  // Check if item is Cash
  const isCash = (item: PortfolioItem) => !!item.isCash || item.sector === 'CASH' || item.ticker.toUpperCase() === '*CASH*';

  // Normalize sector to standard GICS sector
  const normalizeToGICS = (sector: string | undefined): string | null => {
    if (!sector || sector.trim() === '' || sector === '-' || sector === 'Mixed') return null;
    return SECTOR_MAP[sector] || null;
  };

  // Get sector index for sorting
  const getSectorIndex = (item: PortfolioItem): number => {
    if (isETFOrMF(item)) return -1;
    const normalizedSector = normalizeToGICS(item.sector);
    if (!normalizedSector) return 999;
    return GICS_SECTORS.indexOf(normalizedSector as typeof GICS_SECTORS[number]);
  };

  // Group holdings by geography
  const groupedData = useMemo(() => {
    const groups: Record<string, PortfolioItem[]> = {
      'CASH': [],
      'INTL': [],
      'US': [],
      'CA': [],
    };

    currentHoldings.forEach(item => {
      const geo = getRegion(item);
      if (groups[geo]) {
        groups[geo].push(item);
      }
    });

    // Sort within each group
    Object.keys(groups).forEach(geo => {
      groups[geo].sort((a, b) => {
        // *CASH* ticker always first, then other cash-flagged items
        const aIsRealCash = a.ticker.toUpperCase() === '*CASH*';
        const bIsRealCash = b.ticker.toUpperCase() === '*CASH*';
        if (aIsRealCash && !bIsRealCash) return -1;
        if (!aIsRealCash && bIsRealCash) return 1;

        const aIsCash = isCash(a);
        const bIsCash = isCash(b);
        if (aIsCash && !bIsCash) return -1;
        if (!aIsCash && bIsCash) return 1;

        // ETFs/MFs first
        const aIsETF = isETFOrMF(a);
        const bIsETF = isETFOrMF(b);
        if (aIsETF && !bIsETF) return -1;
        if (!aIsETF && bIsETF) return 1;
        if (aIsETF && bIsETF) return b.weight - a.weight;

        // By sector column position
        const aSectorIdx = getSectorIndex(a);
        const bSectorIdx = getSectorIndex(b);
        if (aSectorIdx !== bSectorIdx) return aSectorIdx - bSectorIdx;

        return b.weight - a.weight;
      });
    });

    return groups;
  }, [currentHoldings]);

  // Get sector exposure for a single holding
  const getSectorExposure = (item: PortfolioItem): Record<string, number | string> => {
    const exposure: Record<string, number | string> = {};
    GICS_SECTORS.forEach(s => exposure[s] = '');

    if (isCash(item)) {
      return exposure;
    }

    if (isETFOrMF(item)) {
      if (item.sectorWeights) {
        GICS_SECTORS.forEach(s => {
          exposure[s] = item.sectorWeights?.[s] || '';
        });
      } else {
        GICS_SECTORS.forEach(s => exposure[s] = 'N/A');
      }
      return exposure;
    }

    const normalizedSector = normalizeToGICS(item.sector);
    if (normalizedSector) {
      exposure[normalizedSector] = 100;
    }

    return exposure;
  };

  // Calculate sector totals
  const sectorTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    GICS_SECTORS.forEach(s => totals[s] = 0);

    currentHoldings.forEach(item => {
      if (isCash(item)) return;

      const sectorExposure = getSectorExposure(item);

      GICS_SECTORS.forEach(sector => {
        const exposureVal = sectorExposure[sector];
        if (typeof exposureVal === 'number') {
          // Weighted contribution: Item Weight * (Sector Exposure / 100)
          totals[sector] += item.weight * (exposureVal / 100);
        }
      });
    });

    return totals;
  }, [currentHoldings]);

  // Calculate total weight per geography
  const geoTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(groupedData).forEach(([geo, items]) => {
      totals[geo] = items.reduce((sum, item) => sum + item.weight, 0);
    });
    return totals;
  }, [groupedData]);

  const getRegionColor = (region: string) => {
    switch (region) {
      case 'US': return 'text-blue-700 bg-blue-100 border-blue-300 dark:text-blue-300 dark:bg-blue-900/40 dark:border-blue-700';
      case 'CA': return 'text-red-700 bg-red-100 border-red-300 dark:text-red-300 dark:bg-red-900/40 dark:border-red-700';
      case 'INTL': return 'text-purple-700 bg-purple-100 border-purple-300 dark:text-purple-300 dark:bg-purple-900/40 dark:border-purple-700';
      default: return 'text-wallstreet-500 bg-wallstreet-900 border-wallstreet-700';
    }
  };


  let globalIndex = 0;

  return (
    <div className="bg-wallstreet-800 rounded-xl border border-wallstreet-700 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-wallstreet-700 flex justify-between items-center bg-wallstreet-50">
        <h3 className="font-mono text-lg font-bold text-wallstreet-text">Holdings Breakdown</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-wallstreet-500 font-mono">
          <thead className="bg-wallstreet-100 text-xs uppercase font-bold text-wallstreet-500 border-b border-wallstreet-200">
            <tr>
              <th className="px-3 py-1.5 w-12 text-center sticky left-0 bg-wallstreet-100 z-10">#</th>
              <th className="px-3 py-1.5 min-w-[140px] sticky left-12 bg-wallstreet-100 z-10">Ticker</th>
              {/* Gap 1 - Equal spacing */}
              <th className="min-w-[60px]"></th>
              <th className="px-3 py-1.5 text-right min-w-[80px]">Weight</th>
              <th className="px-3 py-1.5 text-center min-w-[60px]">Loc</th>
              <th className="px-3 py-1.5 text-center min-w-[50px]">Market Beta</th>
              <th className="px-3 py-1.5 text-center min-w-[60px]">Market Div %</th>
              {/* Gap 2 - Equal spacing */}
              <th className="min-w-[60px]"></th>
              {GICS_SECTORS.map(sector => (
                <th key={sector} className="px-2 py-2 text-center min-w-[70px] text-[10px]">
                  {sector === 'Consumer Discretionary' ? 'Discretionary' : sector === 'Consumer Staples' ? 'Staples' : sector === 'Communication Services' ? 'Communications' : sector}
                </th>
              ))}
              <th className="px-3 py-1.5 text-center min-w-[60px] bg-wallstreet-200">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-wallstreet-700">
            {GEO_SECTIONS.map(({ key: geo, label, color, bg }) => {
              const items = groupedData[geo] || [];
              if (items.length === 0) return null;

              const isCollapsed = collapsed[geo];
              const geoTotal = geoTotals[geo] || 0;
              const isCashSection = geo === 'CASH';

              return (
                <React.Fragment key={geo}>
                  {/* Geography Header Row */}
                  {!isCashSection && (
                    <tr
                      className={`cursor-pointer hover:opacity-80 transition-opacity border-t-2 border-wallstreet-300 ${color}`}
                      onClick={() => toggleCollapse(geo)}
                    >
                      <td className={`px-3 py-1.5 text-center sticky left-0 z-10 ${color}`}>
                        <span className="text-lg">{isCollapsed ? '▶' : '▼'}</span>
                      </td>
                      <td className={`px-3 py-1.5 font-bold sticky left-12 z-10 ${color}`} colSpan={1}>
                        {label} ({items.length})
                      </td>
                      {/* Gap 1 */}
                      <td className={`min-w-[60px] ${bg}`}></td>
                      {/* Weight */}
                      <td className={`px-3 py-1.5 text-right font-bold ${bg}`}>
                        {geoTotal.toFixed(2)}%
                      </td>
                      {/* Stats + Gap 2 + Sectors + Total */}
                      <td colSpan={3 + 1 + GICS_SECTORS.length + 1} className={`px-3 py-1.5 ${bg}`}></td>
                    </tr>
                  )}

                  {/* Holdings Rows */}
                  {(!isCollapsed || isCashSection) && items.map((item) => {
                    globalIndex++;
                    const region = getRegion(item);
                    const isDirectEquity = !isCash(item) && !isETFOrMF(item);
                    const beta = isDirectEquity && marketBetaMap && marketBetaMap[item.ticker] !== undefined
                      ? marketBetaMap[item.ticker]
                      : null;
                    const sectorExposure = getSectorExposure(item);

                    const rowTotal = isCash(item)
                      ? null
                      : GICS_SECTORS.reduce((sum, s) => sum + (typeof sectorExposure[s] === 'number' ? sectorExposure[s] as number : 0), 0);

                    return (
                      <tr key={item.ticker} className="hover:bg-wallstreet-700/30 transition-colors group">
                        <td className="px-3 py-1.5 text-center text-wallstreet-400 font-medium sticky left-0 bg-wallstreet-800 group-hover:bg-wallstreet-700/30 z-10">
                          {globalIndex}
                        </td>
                        <td className="px-3 py-1.5 font-bold text-wallstreet-text sticky left-12 bg-wallstreet-800 group-hover:bg-wallstreet-700/30 z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-wallstreet-100 text-wallstreet-600 flex items-center justify-center text-[9px] font-bold shadow-sm border border-wallstreet-200">
                              {item.ticker.substring(0, 2)}
                            </div>
                            <span className="truncate max-w-[100px]">{item.ticker}</span>
                          </div>
                        </td>
                        {/* Gap 1 */}
                        <td className="min-w-[60px]"></td>
                        <td className="px-3 py-1.5 text-right text-wallstreet-text font-bold">
                          {item.weight.toFixed(2)}%
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {region !== 'CASH' && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getRegionColor(region)}`}>
                              {region}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-3 py-1.5 text-center font-mono text-wallstreet-text"
                          title="Market beta to S&P 500 for direct equities. See Risk Contribution view for portfolio-level beta analysis."
                        >
                          <span className={`font-bold text-xs ${beta !== null ? 'text-wallstreet-text' : 'text-wallstreet-500'}`}>
                            {beta !== null ? beta.toFixed(2) : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono text-wallstreet-text">
                          {(() => {
                            const divYield = marketDividendYieldMap && marketDividendYieldMap[item.ticker] !== undefined
                              ? marketDividendYieldMap[item.ticker]
                              : 0;
                            return (
                              <span className={`font-bold text-xs ${divYield > 0 ? 'text-wallstreet-text' : 'text-wallstreet-500'}`}>
                                {divYield > 0 ? divYield.toFixed(2) + '%' : '-'}
                              </span>
                            );
                          })()}
                        </td>
                        {/* Gap 2 */}
                        <td className="min-w-[60px]"></td>
                        {GICS_SECTORS.map(sector => {
                          const val = sectorExposure[sector];
                          return (
                            <td key={sector} className="px-2 py-1.5 text-center text-xs">
                              {val === 'N/A' ? (
                                <span className="text-wallstreet-500 italic text-[10px]">N/A</span>
                              ) : val !== '' ? (
                                <span>{(typeof val === 'number' ? val.toFixed(2) : val)}%</span>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-center font-bold text-xs bg-wallstreet-50">
                          {rowTotal !== null && rowTotal !== '' ? (
                            <span className="text-wallstreet-text">{typeof rowTotal === 'number' ? rowTotal.toFixed(2) : rowTotal}%</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {/* Total Row */}
            <tr className="bg-wallstreet-200 border-t-2 border-wallstreet-400 font-bold">
              <td className="px-3 py-1.5 text-center sticky left-0 bg-wallstreet-200 z-10"></td>
              <td className="px-3 py-1.5 text-wallstreet-text sticky left-12 bg-wallstreet-200 z-10">TOTAL</td>
              {/* Gap 1 */}
              <td className="min-w-[60px]"></td>
              <td className="px-3 py-1.5 text-right text-wallstreet-text">
                {currentHoldings.reduce((sum, item) => sum + item.weight, 0).toFixed(2)}%
              </td>
              <td className="px-3 py-1.5"></td>
              <td className="px-3 py-1.5"></td>
              <td className="px-3 py-1.5"></td>
              {/* Gap 2 */}
              <td className="min-w-[60px]"></td>
              {GICS_SECTORS.map(sector => (
                <td key={sector} className="px-2 py-1.5 text-center text-xs">
                  {sectorTotals[sector] > 0 ? (
                    <span className="text-wallstreet-text">{sectorTotals[sector].toFixed(2)}%</span>
                  ) : null}
                </td>
              ))}
              <td className="px-3 py-1.5 text-center text-xs bg-wallstreet-300">
                <span className="text-wallstreet-text">
                  {Object.values(sectorTotals).reduce((sum, v) => sum + v, 0).toFixed(2)}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
