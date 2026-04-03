import React, { useMemo } from 'react';
import { PortfolioItem } from '../types';
import { PortfolioTable } from '../components/PortfolioTable';
import { KPICard } from '../components/KPICard';
import { PortfolioEvolutionChart } from '../components/PortfolioEvolutionChart';
import { SectorDeviationCard } from '../components/SectorDeviationCard';
import { SectorGeographyDeviationCard } from '../components/SectorGeographyDeviationCard';
import { Wallet, Layers, PieChart as PieChartIcon, Wallet2Icon, WalletIcon, AlertCircle, RefreshCw } from 'lucide-react';
import { FreshnessBadge } from '../components/ui/FreshnessBadge';

interface DashboardViewProps {
  data: PortfolioItem[];
  customSectors?: Record<string, Record<string, number>>;
  assetGeo?: Record<string, string>;
  isActive?: boolean;
}

const COLORS = [
  '#09214c', '#2563eb', '#10b981', '#f59e0b', '#8e2cd4',
  '#f43f5e', '#0ea5e9', '#16a34a', '#ea580c', '#4f46e5',
  '#db2777', '#06b6d4', '#64748b',
];

const isCashHolding = (item: PortfolioItem) => !!item.isCash || item.sector === 'CASH' || item.ticker.toUpperCase() === '*CASH*';

export const DashboardView: React.FC<DashboardViewProps> = ({ data, customSectors, assetGeo, isActive }) => {
  const { dates, latestDate, currentHoldings, totalWeight } = useMemo(() => {
    const dates = Array.from(new Set(data.map(d => d.date))).sort() as string[];
    const latestDate = dates[dates.length - 1];
    const currentHoldings = data.filter(d => d.date === latestDate && d.weight > 0.001);
    const totalWeight = currentHoldings.reduce((acc, item) => acc + item.weight, 0);
    return { dates, latestDate, currentHoldings, totalWeight };
  }, [data]);

  const realPositionCount = useMemo(
    () => currentHoldings.filter(item => item.weight > 0.01 && !isCashHolding(item)).length,
    [currentHoldings]
  );

  const { topHoldings, top10TotalWeight, topTickers, areaChartData } = useMemo(() => {
    // Current top 10 for the Pie Chart and KPI
    const currentTopHoldings = [...currentHoldings]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map(item => ({ name: item.ticker, value: item.weight }));

    const top10TotalWeight = currentTopHoldings.reduce((sum, item) => sum + item.value, 0);

    // Global top tickers for the Evolution Chart
    const historicalTopTickersSet = new Set<string>();
    
    // Process history data map internally here so we can constrain the chart to ONLY the top 10 of each date
    const historyDataMap = new Map<string, any>();
    dates.forEach(date => historyDataMap.set(date, { date }));

    // Group all data by date
    const dataByDate = new Map<string, typeof data>();
    data.forEach(d => {
      const dateStr = d.date as string;
      if (!dataByDate.has(dateStr)) dataByDate.set(dateStr, []);
      dataByDate.get(dateStr)!.push(d);
    });

    dataByDate.forEach((dateItems, dateStr) => {
      const dailyTop = [...dateItems]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10);
      
      const entry = historyDataMap.get(dateStr);
      if (entry) {
        dailyTop.forEach(item => {
          historicalTopTickersSet.add(item.ticker);
          entry[item.ticker] = item.weight;
        });
      }
    });

    // Build latest-date weight map from currentHoldings (for stack ordering)
    const latestWeightMap = new Map<string, number>();
    currentHoldings.forEach(item => latestWeightMap.set(item.ticker, item.weight));

    // Fallback: cumulative historical weight for tickers no longer held
    const tickerTotalWeightMap = new Map<string, number>();
    dataByDate.forEach((dateItems) => {
      dateItems.forEach(item => {
        if (historicalTopTickersSet.has(item.ticker)) {
          tickerTotalWeightMap.set(item.ticker, (tickerTotalWeightMap.get(item.ticker) || 0) + item.weight);
        }
      });
    });

    // Sort: largest CURRENT holding → bottom of chart (rendered first in Recharts)
    // Tickers no longer held fall back to total historical weight, then alpha
    const topTickersFinal = Array.from(historicalTopTickersSet).sort((a, b) => {
      const latestA = latestWeightMap.get(a) || 0;
      const latestB = latestWeightMap.get(b) || 0;
      if (latestB !== latestA) return latestB - latestA;

      const weightA = tickerTotalWeightMap.get(a) || 0;
      const weightB = tickerTotalWeightMap.get(b) || 0;
      if (weightB !== weightA) return weightB - weightA;
      return a.localeCompare(b);
    });

    const finalAreaChartData = Array.from(historyDataMap.values()).map(entry => {
      const completeEntry = { ...entry };
      topTickersFinal.forEach(ticker => {
        if (completeEntry[ticker] === undefined) completeEntry[ticker] = 0;
      });
      return completeEntry;
    });

    return { topHoldings: currentTopHoldings, top10TotalWeight, topTickers: topTickersFinal, areaChartData: finalAreaChartData };
  }, [currentHoldings, data, dates]);

  const tickerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let colorIndex = 0;

    // 1. Assign colors to current holdings (sorted by weight)
    const sortedCurrent = [...currentHoldings].sort((a, b) => b.weight - a.weight);
    sortedCurrent.forEach(item => {
      if (!map[item.ticker]) {
        map[item.ticker] = COLORS[colorIndex % COLORS.length];
        colorIndex++;
      }
    });

    // 2. Assign colors to all historical tickers that are no longer held
    const allHistoricalTickers = Array.from(new Set<string>(data.map(d => d.ticker as string))).sort();
    allHistoricalTickers.forEach(ticker => {
      if (!map[ticker]) {
        map[ticker] = COLORS[colorIndex % COLORS.length];
        colorIndex++;
      }
    });

    return map;
  }, [currentHoldings, data]);

  const chartColors = useMemo(() => {
    return topTickers.map(t => tickerColorMap[t] || COLORS[0]);
  }, [topTickers, tickerColorMap]);

  // Separate state for sector map - persists independently of data changes
  const [sectorMap, setSectorMap] = React.useState<Record<string, string>>({});

  // Local state fallbacks if props not provided (though App.tsx should provide them)
  const [localCustomSectorWeights, setLocalCustomSectorWeights] = React.useState<Record<string, Record<string, number>>>({});
  const [localAssetGeo, setLocalAssetGeo] = React.useState<Record<string, string>>({});

  const effectiveCustomSectors = customSectors || localCustomSectorWeights;
  const effectiveAssetGeo = assetGeo || localAssetGeo;

  const [marketBetaMap, setMarketBetaMap] = React.useState<Record<string, number>>({});
  const [marketDividendYieldMap, setMarketDividendYieldMap] = React.useState<Record<string, number>>({});
  const [benchmarkSectors, setBenchmarkSectors] = React.useState<any[]>([]);
  const [benchmarkGeography, setBenchmarkGeography] = React.useState<any[]>([]);
  const [portfolioBeta, setPortfolioBeta] = React.useState<number | null>(null);

  // Error and loading state for better UX
  const [dataFetchError, setDataFetchError] = React.useState<string | null>(null);
  const [isLoadingMarketData, setIsLoadingMarketData] = React.useState(true);
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(null);
  const [loadProgress, setLoadProgress] = React.useState<Record<string, 'pending' | 'done' | 'error'>>({
    sectors: 'pending', market: 'pending', risk: 'pending', benchmark: 'pending',
  });

  // Fetch Sectors, Betas, Dividends, and Portfolio Beta effect
  React.useEffect(() => {
    let cancelled = false;

    const resetDerivedMarketState = () => {
      setMarketBetaMap({});
      setMarketDividendYieldMap({});
      setBenchmarkSectors([]);
      setBenchmarkGeography([]);
      setPortfolioBeta(null);
      setDataFetchError(null);
      setFetchedAt(null);
    };

    const fetchData = async () => {
      const isCash = (item: PortfolioItem) => !!item.isCash || item.sector === 'CASH' || item.ticker.toUpperCase() === '*CASH*';
      const isDirectStock = (item: PortfolioItem) => !isCash(item) && !item.isEtf && !item.isMutualFund;

      // Get unique tickers from the latest holdings slice
      const currentTickers = Array.from(
        new Set<string>(
          currentHoldings
            .filter(d => d.ticker && !(d.ticker as string).includes('$'))
            .map(d => (d.ticker as string).trim())
        )
      );

      if (currentTickers.length === 0) {
        if (!cancelled) {
          setIsLoadingMarketData(false);
        }
        return;
      }

      if (cancelled) return;
      setIsLoadingMarketData(true);
      setLoadProgress({ sectors: 'pending', market: 'pending', risk: 'pending', benchmark: 'pending' });

      const errors: string[] = [];

      try {
        const { fetchSectors, fetchBetas, fetchDividends, loadSectorWeights, loadAssetGeo, fetchIndexExposure, fetchRiskContribution } = await import('../services/api');
        if (cancelled) return;

        // Fetch Sectors with error handling
        try {
          const sectors = await fetchSectors(currentTickers);
          if (cancelled) return;
          if (Object.keys(sectors).length > 0) {
            setSectorMap(prev => ({ ...prev, ...sectors }));
          }
          setLoadProgress(prev => ({ ...prev, sectors: 'done' }));
        } catch (e) {
          console.error("Failed to fetch sectors:", e);
          errors.push("sectors");
          if (!cancelled) setLoadProgress(prev => ({ ...prev, sectors: 'error' }));
        }

        // Fetch Market Betas with error handling
        // NOTE: These are market betas to S&P 500, used only for individual stock display in PortfolioTable
        // Portfolio-level beta comes from risk-contribution endpoint (see below)
        try {
          const directStockTickers = currentHoldings
            .filter(isDirectStock)
            .map(item => item.ticker);
          const betas = directStockTickers.length > 0 ? await fetchBetas(directStockTickers) : {};
          if (cancelled) return;
          if (Object.keys(betas).length > 0) {
            setMarketBetaMap(betas);
          }
        } catch (e) {
          console.error("Failed to fetch market betas:", e);
          errors.push("market betas");
        }

        // Fetch holding-level dividend yields with error handling
        try {
          const dividends = await fetchDividends(currentTickers);
          if (cancelled) return;
          if (Object.keys(dividends).length > 0) {
            setMarketDividendYieldMap(dividends);
          }
          setLoadProgress(prev => ({ ...prev, market: 'done' }));
        } catch (e) {
          console.error("Failed to fetch dividends:", e);
          errors.push("dividends");
          if (!cancelled) setLoadProgress(prev => ({ ...prev, market: 'error' }));
        }

        // Fetch Portfolio Beta from Risk Contribution endpoint
        // This gives us the true portfolio-to-benchmark beta
        try {
          const riskData = await fetchRiskContribution(currentHoldings);
          if (cancelled) return;
          if (riskData && !riskData.error && riskData.portfolioBeta !== undefined) {
            setPortfolioBeta(riskData.portfolioBeta);
          }
          setLoadProgress(prev => ({ ...prev, risk: 'done' }));
        } catch (e) {
          console.error("Failed to fetch portfolio beta:", e);
          errors.push("portfolio beta");
          if (!cancelled) setLoadProgress(prev => ({ ...prev, risk: 'error' }));
        }

        // Only fetch if props are missing
        if (!customSectors) {
          try {
            const loadedWeights = await loadSectorWeights();
            if (cancelled) return;
            if (Object.keys(loadedWeights).length > 0) {
              setLocalCustomSectorWeights(loadedWeights);
            }
          } catch (e) {
            console.error("Failed to load sector weights:", e);
          }
        }

        if (!assetGeo) {
          try {
            const loadedGeo = await loadAssetGeo();
            if (cancelled) return;
            if (Object.keys(loadedGeo).length > 0) {
              setLocalAssetGeo(loadedGeo);
            }
          } catch (e) {
            console.error("Failed to load asset geo:", e);
          }
        }

        // Fetch Benchmark Data
        try {
          const exposure = await fetchIndexExposure();
          if (cancelled) return;
          if (exposure && exposure.sectors) {
            setBenchmarkSectors(exposure.sectors);
          }
          if (exposure && exposure.geography) {
            setBenchmarkGeography(exposure.geography);
          }
          setLoadProgress(prev => ({ ...prev, benchmark: 'done' }));
        } catch (e) {
          console.error("Failed to fetch benchmark data:", e);
          errors.push("benchmark");
          if (!cancelled) setLoadProgress(prev => ({ ...prev, benchmark: 'error' }));
        }

        // Set error message if any fetches failed
        if (errors.length > 0) {
          if (cancelled) return;
          setDataFetchError(`Failed to load: ${errors.join(", ")}. Some data may be incomplete.`);
        }

      } catch (error) {
        if (cancelled) return;
        console.error("Critical error fetching market data:", error);
        setDataFetchError("Failed to connect to market data service. Please check your connection and try again.");
      } finally {
        if (cancelled) return;
        setIsLoadingMarketData(false);
        setFetchedAt(new Date().toISOString());
      }
    };

    if (data.length > 0) {
      resetDerivedMarketState();
      fetchData();
    }
    return () => {
      cancelled = true;
    };
  }, [data, customSectors, assetGeo, currentHoldings]);

  // Derive enrichedCurrentHoldings by merging sectorMap at render time
  const enrichedCurrentHoldings = useMemo(() => {
    return currentHoldings.map(item => {
      const cleanTicker = item.ticker.trim();
      let sector = sectorMap[cleanTicker] || sectorMap[item.ticker] || item.sector;

      // Explicitly set sector for Cash
      if (item.isCash || cleanTicker.toUpperCase() === '*CASH*') {
        sector = 'CASH';
      }

      // Attach custom sector weights if available
      const sectorWeights = effectiveCustomSectors[cleanTicker] || effectiveCustomSectors[item.ticker];

      return sectorWeights
        ? { ...item, sector, sectorWeights }
        : sector ? { ...item, sector } : item;
    });
  }, [currentHoldings, sectorMap, effectiveCustomSectors]);


  if (isLoadingMarketData) {
    const steps = [
      { key: 'sectors',   label: 'Sector Classification', sub: 'Holdings & industry mapping' },
      { key: 'market',    label: 'Market Data',           sub: 'Betas & dividend yields' },
      { key: 'risk',      label: 'Portfolio Beta',        sub: 'Sensitivity to benchmark' },
      { key: 'benchmark', label: 'Benchmark Exposure',    sub: 'Index sector & geography weights' },
    ];
    const doneCount = Object.values(loadProgress).filter(s => s === 'done').length;
    return (
      <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center select-none">
        <style>{`
          @keyframes dashBarPulse {
            0%, 100% { transform: scaleY(0.12); opacity: 0.1; }
            50%      { transform: scaleY(1);    opacity: 1;   }
          }
          @keyframes dashScanLine {
            0%   { left: -2px; }
            100% { left: calc(100% + 2px); }
          }
        `}</style>
        <div className="flex flex-col items-center gap-8 w-full max-w-sm">
          <div className="relative overflow-hidden rounded" style={{ width: '176px', height: '60px' }}>
            <div className="flex items-end h-full gap-1.5">
              {[28, 50, 36, 66, 42, 78, 54, 92, 46, 72, 58, 88, 64].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm origin-bottom" style={{
                  height: `${h}%`,
                  background: i === 12 ? '#3b82f6' : '#374151',
                  animation: `dashBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                }} />
              ))}
            </div>
            <div className="absolute top-0 bottom-0 w-px" style={{
              background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.65), transparent)',
              animation: 'dashScanLine 2.2s linear infinite',
            }} />
          </div>

          <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.25em] uppercase">
            Loading Holdings Data
          </p>

          <div className="w-full bg-wallstreet-700 rounded-full h-1.5 overflow-hidden">
            <div className="bg-wallstreet-accent h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>

          <div className="w-full space-y-3">
            {steps.map(({ key, label, sub }) => {
              const status = loadProgress[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {status === 'done' ? (
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : status === 'error' ? (
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <div className="w-3.5 h-3.5 border-2 border-wallstreet-600 border-t-wallstreet-accent rounded-full animate-spin" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-mono font-medium ${status === 'done' ? 'text-wallstreet-text' : status === 'error' ? 'text-red-500' : 'text-wallstreet-500'}`}>{label}</p>
                    <p className="text-xs text-wallstreet-500 truncate">{sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[100vw] mx-auto p-4 md:p-6 space-y-6 overflow-x-hidden min-h-screen">
      <header className="border-b border-wallstreet-700 pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold font-mono text-wallstreet-text">Portfolio Holdings</h2>
            <FreshnessBadge fetchedAt={fetchedAt} />
          </div>
          <p className="text-wallstreet-500 mt-1 text-sm">Exposure analysis and allocation breakdown as of {latestDate}.</p>
        </div>
      </header>

      {/* Error Banner for Market Data Fetch Failures */}
      {dataFetchError && (
        <div className="bg-amber-900/20 border border-amber-600/50 rounded-lg px-4 py-3 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-200">{dataFetchError}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-amber-900/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2">
        {/* Calculated Capital Allocation KPI */}
        {(() => {
          // Calculate Cash based on the explicit 'CASH' sector we just assigned
          const cashWeight = enrichedCurrentHoldings
            .filter(h => h.sector === 'CASH')
            .reduce((sum, h) => sum + h.weight, 0);

          const investedWeight = totalWeight - cashWeight;

          return (
            <KPICard
              title="Capital Allocated"
              value={
                <div className="flex w-full items-center mt-1">
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">Invested</span></div>
                    <span className="text-xl font-bold text-wallstreet-text font-mono">{investedWeight.toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-wallstreet-100"></div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">Cash or Equivalents</span></div>
                    <span className="text-xl font-bold text-wallstreet-text font-mono">{cashWeight.toFixed(2)}%</span>
                  </div>
                </div> as any
              }
              colorClass="text-wallstreet-text"
            />
          );
        })()}

        <KPICard
          title="Concentration"
          value={
            <div className="flex w-full items-center mt-1">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">Positions</span></div>
                <span className="text-xl font-bold text-wallstreet-text font-mono">{realPositionCount}</span>
              </div>
              <div className="w-px h-8 bg-wallstreet-100"></div>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">Top 10</span></div>
                <span className="text-xl font-bold text-wallstreet-text font-mono">{top10TotalWeight.toFixed(2)}%</span>
              </div>
            </div> as any
          }
          icon={null}
          colorClass="text-wallstreet-text"
        />

        {/* Calculated Currency Exposure KPI */}
        {(() => {
          let usWeight = 0;
          let cadWeight = 0;
          let intlWeight = 0;

          // Helper logic duplicated from PortfolioTable (ideal to refactor later but inline for now)
          currentHoldings.forEach(item => {
            const t = item.ticker.toUpperCase();

            // Skip cash — no currency region
            if (item.isCash || item.ticker.toUpperCase() === '*CASH*') return;

            // New Logic for manual/suffix based check
            let region = 'US';

            if (item.isEtf || item.isMutualFund) {
              // Use manual setting if available, otherwise default to US or maybe infer from suffix?
              // But user said: if ETF/MF use manual.
              // We need to pass assetGeo here too effectively, but for now I'll use the suffix fallback
              // IF assetGeo isn't available in this scope easily without refactoring the KPI calculation to separate function.
              // Since we have assetGeo in state, let's use it.
              // Since we have assetGeo in state/props using effectiveAssetGeo (which handles fallbacks), let's use it.
              const manualGeo = effectiveAssetGeo[item.ticker];
              if (manualGeo) region = manualGeo;
            } else {
              if (t.endsWith('.TO')) region = 'CA';
              else region = 'US';
            }

            if (region === 'US') usWeight += item.weight;
            else if (region === 'CA') cadWeight += item.weight;
            else intlWeight += item.weight;
          });

          return (
            <KPICard
              title="Currency Exposure"
              value={
                <div className="flex w-full items-center mt-1">
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">USD</span></div>
                    <span className="text-xl font-bold text-blue-600 font-mono">{usWeight.toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-wallstreet-100"></div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">CAD</span></div>
                    <span className="text-xl font-bold text-red-600 font-mono">{cadWeight.toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-wallstreet-100"></div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">INTL</span></div>
                    <span className="text-xl font-bold text-slate-600 font-mono">{intlWeight.toFixed(2)}%</span>
                  </div>
                </div> as any
              }
              icon={null}
              colorClass="text-wallstreet-text w-full"
            />
          );
        })()}

        <KPICard
          title="Portfolio Risk & Income"
          value={
            <div className="flex w-full items-center mt-1">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">Beta vs Benchmark</span>
                  <span className="text-xs text-wallstreet-500/60" title="Portfolio sensitivity to your chosen benchmark (75/25 Composite: 75% ACWI (CAD) + 25% XIC.TO)"></span>
                </div>
                <span className="text-xl font-bold text-wallstreet-text font-mono">
                  {portfolioBeta !== null ? portfolioBeta.toFixed(2) : "—"}
                </span>
              </div>
              <div className="w-px h-8 bg-wallstreet-100"></div>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-wallstreet-500 uppercase tracking-wider">Dividend Yield</span></div>
                <span className="text-xl font-bold text-green-600 font-mono">
                  {(() => {
                    let weightedDivSum = 0;
                    let totalInvestedWeight = 0;
                    enrichedCurrentHoldings.forEach(item => {
                      // Exclude Cash
                      if (item.sector === 'CASH') return;

                      const divYield = marketDividendYieldMap[item.ticker] || 0;
                      weightedDivSum += (item.weight * divYield);
                      totalInvestedWeight += item.weight;
                    });

                    if (totalInvestedWeight === 0) return "0.00%";
                    return (weightedDivSum / totalInvestedWeight).toFixed(2) + '%';
                  })()}
                </span>
              </div>
            </div> as any
          }
          icon={null}
          colorClass="text-wallstreet-text"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8 items-stretch" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gridTemplateRows: 'minmax(0, 1fr)' }}>
        <PortfolioEvolutionChart data={areaChartData} topTickers={topTickers} dates={dates} colors={chartColors} />
        <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex gap-6 h-full">
          <div className="flex flex-col flex-1 min-w-0">
            <SectorDeviationCard
              currentHoldings={enrichedCurrentHoldings}
              benchmarkData={benchmarkSectors}
              benchmarkGeography={benchmarkGeography}
              assetGeo={effectiveAssetGeo}
              noWrapper
              isActive={isActive}
            />
          </div>
          <div className="w-px bg-wallstreet-700 self-stretch" />
          <div className="flex flex-col flex-1 min-w-0">
            <SectorGeographyDeviationCard
              currentHoldings={enrichedCurrentHoldings}
              benchmarkSectors={benchmarkSectors}
              benchmarkGeography={benchmarkGeography}
              assetGeo={effectiveAssetGeo}
              noWrapper
            />
          </div>
        </div>
      </div>

      <PortfolioTable
        currentHoldings={enrichedCurrentHoldings}
        allData={data}
        marketBetaMap={marketBetaMap}
        marketDividendYieldMap={marketDividendYieldMap}
        assetGeo={effectiveAssetGeo}
      />
    </div>
  );
};
