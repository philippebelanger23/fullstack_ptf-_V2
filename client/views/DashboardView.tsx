import React, { useMemo } from 'react';
import { PortfolioItem } from '../types';
import { PortfolioTable } from '../components/PortfolioTable';
import { KPICard } from '../components/KPICard';
import { PortfolioEvolutionChart } from '../components/PortfolioEvolutionChart';
import { SectorDeviationCard } from '../components/SectorDeviationCard';
import { Wallet, Layers, PieChart as PieChartIcon, Wallet2Icon, WalletIcon, AlertCircle, RefreshCw } from 'lucide-react';

interface DashboardViewProps {
  data: PortfolioItem[];
  customSectors?: Record<string, Record<string, number>>;
  assetGeo?: Record<string, string>;
}

const COLORS = [
  '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626',
  '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#0d9488',
  '#1d4ed8', '#c2410c', '#15803d', '#7e22ce', '#b91c1c',
  '#0e7490', '#a16207', '#be185d', '#4338ca', '#0f766e'
];

export const DashboardView: React.FC<DashboardViewProps> = ({ data, customSectors, assetGeo }) => {
  const { dates, latestDate, currentHoldings, totalWeight } = useMemo(() => {
    const dates = Array.from(new Set(data.map(d => d.date))).sort() as string[];
    const latestDate = dates[dates.length - 1];
    const currentHoldings = data.filter(d => d.date === latestDate && d.weight > 0.001);
    const totalWeight = currentHoldings.reduce((acc, item) => acc + item.weight, 0);
    return { dates, latestDate, currentHoldings, totalWeight };
  }, [data]);

  const { topHoldings, top10TotalWeight, topTickers } = useMemo(() => {
    // Current top 10 for the Pie Chart and KPI
    const currentTopHoldings = [...currentHoldings]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map(item => ({ name: item.ticker, value: item.weight }));

    const top10TotalWeight = currentTopHoldings.reduce((sum, item) => sum + item.value, 0);

    // Global top tickers for the Evolution Chart
    // RESTRICTED TO CURRENT TOP 10 ONLY based on user feedback to reduce clutter
    const topTickers = currentTopHoldings.map(h => h.name);

    return { topHoldings: currentTopHoldings, top10TotalWeight, topTickers };
  }, [currentHoldings, data, dates]);

  const areaChartData = useMemo(() => {
    const historyDataMap = new Map<string, any>();
    dates.forEach(date => historyDataMap.set(date, { date }));

    data.forEach((item: PortfolioItem) => {
      if (topTickers.includes(item.ticker)) {
        const entry = historyDataMap.get(item.date as string);
        if (entry) entry[item.ticker] = item.weight;
      }
    });

    return Array.from(historyDataMap.values()).map(entry => {
      const completeEntry = { ...entry };
      topTickers.forEach(ticker => {
        if (completeEntry[ticker] === undefined) completeEntry[ticker] = 0;
      });
      return completeEntry;
    });
  }, [dates, data, topTickers]);

  // Separate state for sector map - persists independently of data changes
  const [sectorMap, setSectorMap] = React.useState<Record<string, string>>({});

  // Local state fallbacks if props not provided (though App.tsx should provide them)
  const [localCustomSectorWeights, setLocalCustomSectorWeights] = React.useState<Record<string, Record<string, number>>>({});
  const [localAssetGeo, setLocalAssetGeo] = React.useState<Record<string, string>>({});

  const effectiveCustomSectors = customSectors || localCustomSectorWeights;
  const effectiveAssetGeo = assetGeo || localAssetGeo;

  const [betaMap, setBetaMap] = React.useState<Record<string, number>>({});
  const [divYieldMap, setDivYieldMap] = React.useState<Record<string, number>>({});
  const [benchmarkSectors, setBenchmarkSectors] = React.useState<any[]>([]);

  // Error and loading state for better UX
  const [dataFetchError, setDataFetchError] = React.useState<string | null>(null);
  const [isLoadingMarketData, setIsLoadingMarketData] = React.useState(true);

  // Fetch Sectors and Betas effect
  React.useEffect(() => {
    const fetchData = async () => {
      // Get unique tickers
      const tickersToFetch = Array.from(
        new Set(
          data
            .filter(d => d.ticker && !d.ticker.includes('$'))
            .map(d => d.ticker.trim())
        )
      );

      if (tickersToFetch.length === 0) return;

      setIsLoadingMarketData(true);
      setDataFetchError(null);

      const errors: string[] = [];

      try {
        const { fetchSectors, fetchBetas, fetchDividends, loadSectorWeights, loadAssetGeo, fetchIndexExposure } = await import('../services/api');

        // Fetch Sectors with error handling
        try {
          const sectors = await fetchSectors(tickersToFetch);
          if (Object.keys(sectors).length > 0) {
            setSectorMap(prev => ({ ...prev, ...sectors }));
          }
        } catch (e) {
          console.error("Failed to fetch sectors:", e);
          errors.push("sectors");
        }

        // Fetch Betas with error handling
        try {
          const betas = await fetchBetas(tickersToFetch);
          if (Object.keys(betas).length > 0) {
            setBetaMap(betas);
          }
        } catch (e) {
          console.error("Failed to fetch betas:", e);
          errors.push("betas");
        }

        // Fetch Dividends with error handling
        try {
          const dividends = await fetchDividends(tickersToFetch);
          if (Object.keys(dividends).length > 0) {
            setDivYieldMap(dividends);
          }
        } catch (e) {
          console.error("Failed to fetch dividends:", e);
          errors.push("dividends");
        }

        // Only fetch if props are missing
        if (!customSectors) {
          try {
            const loadedWeights = await loadSectorWeights();
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
          if (exposure && exposure.sectors) {
            setBenchmarkSectors(exposure.sectors);
          }
        } catch (e) {
          console.error("Failed to fetch benchmark data:", e);
          errors.push("benchmark");
        }

        // Set error message if any fetches failed
        if (errors.length > 0) {
          setDataFetchError(`Failed to load: ${errors.join(", ")}. Some data may be incomplete.`);
        }

      } catch (error) {
        console.error("Critical error fetching market data:", error);
        setDataFetchError("Failed to connect to market data service. Please check your connection and try again.");
      } finally {
        setIsLoadingMarketData(false);
      }
    };

    if (data.length > 0) {
      fetchData();
    }
  }, [data, customSectors, assetGeo]);

  // Derive enrichedCurrentHoldings by merging sectorMap at render time
  const enrichedCurrentHoldings = useMemo(() => {
    return currentHoldings.map(item => {
      const cleanTicker = item.ticker.trim();
      let sector = sectorMap[cleanTicker] || sectorMap[item.ticker] || item.sector;

      // Explicitly set sector for Cash
      if (cleanTicker.toLowerCase() === '*cash*' || cleanTicker.toUpperCase().includes('CASH')) {
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
    return (
      <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          {/* Animated bars */}
          <div className="flex items-end gap-1.5 h-12">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-2 bg-wallstreet-accent rounded-t"
                style={{
                  animation: `barPulse 1s ease-in-out ${i * 0.15}s infinite`,
                  height: '30%',
                }}
              />
            ))}
          </div>
          <p className="text-sm font-mono text-wallstreet-500 tracking-wide uppercase">Loading Holdings Data</p>
        </div>
        <style>{`
          @keyframes barPulse {
            0%, 100% { height: 30%; opacity: 0.4; }
            50% { height: 100%; opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="max-w-[100vw] mx-auto p-4 md:p-6 space-y-6 overflow-x-hidden min-h-screen">
      <header className="border-b border-wallstreet-700 pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold font-mono text-wallstreet-text">Portfolio Holdings</h2>
          <p className="text-wallstreet-500 mt-1 text-sm">Exposure analysis and allocation breakdown as of {latestDate}.</p>
        </div>
        <div className="flex items-center gap-2 bg-wallstreet-200 px-3 py-1 rounded text-xs font-mono text-wallstreet-500">
          <span>{dates.length} Snapshots</span>
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
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Invested</span></div>
                    <span className="text-xl font-bold text-wallstreet-text font-mono">{investedWeight.toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-wallstreet-100"></div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Cash or Equivalents</span></div>
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
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Positions</span></div>
                <span className="text-xl font-bold text-wallstreet-text font-mono">{currentHoldings.filter(h => h.weight > 0.01).length}</span>
              </div>
              <div className="w-px h-8 bg-wallstreet-100"></div>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Top 10</span></div>
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
            if (t === '*CASH*' || t.includes('CASH')) return;

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
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">USD</span></div>
                    <span className="text-xl font-bold text-blue-600 font-mono">{usWeight.toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-wallstreet-100"></div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">CAD</span></div>
                    <span className="text-xl font-bold text-red-600 font-mono">{cadWeight.toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-wallstreet-100"></div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">INTL</span></div>
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
          title="Risk & Income"
          value={
            <div className="flex w-full items-center mt-1">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Beta</span></div>
                <span className="text-xl font-bold text-wallstreet-text font-mono">
                  {(() => {
                    let weightedBetaSum = 0;
                    let totalInvestedWeight = 0;
                    enrichedCurrentHoldings.forEach(item => {
                      // Exclude Cash
                      if (item.sector === 'CASH') return;

                      const beta = betaMap[item.ticker] !== undefined ? betaMap[item.ticker] : 1.0;
                      weightedBetaSum += (item.weight * beta);
                      totalInvestedWeight += item.weight;
                    });

                    if (totalInvestedWeight === 0) return "0.00";
                    return (weightedBetaSum / totalInvestedWeight).toFixed(2);
                  })()}
                </span>
              </div>
              <div className="w-px h-8 bg-wallstreet-100"></div>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 mb-1"><span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Div Yield</span></div>
                <span className="text-xl font-bold text-green-600 font-mono">
                  {(() => {
                    let weightedDivSum = 0;
                    let totalInvestedWeight = 0;
                    enrichedCurrentHoldings.forEach(item => {
                      // Exclude Cash
                      if (item.sector === 'CASH') return;

                      const divYield = divYieldMap[item.ticker] || 0;
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[450px] mb-8">
        <PortfolioEvolutionChart data={areaChartData} topTickers={topTickers} dates={dates} colors={COLORS} />
        <SectorDeviationCard currentHoldings={enrichedCurrentHoldings} benchmarkData={benchmarkSectors} />
      </div>

      <PortfolioTable
        currentHoldings={enrichedCurrentHoldings}
        allData={data}
        betaMap={betaMap}
        divYieldMap={divYieldMap}
        assetGeo={assetGeo}
      />
    </div>
  );
};
