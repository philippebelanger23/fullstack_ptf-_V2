import React, { useState, useRef, Component, ErrorInfo, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { UploadView } from './views/UploadView';
import { DashboardView } from './views/DashboardView';
import { ReportView } from './views/ReportView';
import { CorrelationView } from './views/CorrelationView';
import { AttributionView } from './views/attribution/AttributionView';
import { IndexView } from './views/IndexView';
import { PerformanceView } from './views/PerformanceView';
import { RiskContributionView } from './views/RiskContributionView';
import { PortfolioItem, ViewState, BackcastResponse, PortfolioAnalysisResponse } from './types';
import { loadPortfolioConfig, analyzeManualPortfolioFull, convertConfigToItems, loadSectorWeights, loadAssetGeo, fetchPortfolioBackcast } from './services/api';

class GlobalErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null, errorInfo: ErrorInfo | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App Crashed:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-wallstreet-900 text-wallstreet-text p-8">
          <div className="bg-red-50 text-red-900 border border-red-200 rounded-xl p-8 max-w-2xl w-full shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-3xl">💥</span> Application Crashed
            </h2>
            <div className="mb-6">
              <p className="font-bold mb-2">Error Message:</p>
              <pre className="bg-wallstreet-800 p-4 rounded border border-red-100 overflow-x-auto text-sm font-mono text-red-700">
                {this.state.error && this.state.error.toString()}
              </pre>
            </div>
            <div>
              <p className="font-bold mb-2">Stack Trace:</p>
              <details className="bg-wallstreet-800 p-4 rounded border border-red-100 overflow-x-auto text-xs font-mono max-h-[300px] overflow-y-auto">
                <summary className="cursor-pointer text-wallstreet-500 hover:text-wallstreet-text mb-2">View Details</summary>
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </details>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.UPLOAD);
  const [portfolioData, setPortfolioData] = useState<PortfolioItem[]>([]);
  // Full attribution sheets from /analyze-manual — periodSheet, monthlySheet, boundaries, benchmarks
  const [analysisResponse, setAnalysisResponse] = useState<PortfolioAnalysisResponse | null>(null);
  const [fileHistory, setFileHistory] = useState<{ name: string, count: number }[]>([]);

  // Lifted state for Correlation Analysis to prevent regeneration
  const [correlationResult, setCorrelationResult] = useState<any>(null);
  const [correlationStatus, setCorrelationStatus] = useState<'idle' | 'analyzing' | 'complete' | 'error'>('idle');

  // Shared state for year selection
  const [selectedYear, setSelectedYear] = useState<2025 | 2026>(2026);

  // Asset Completion & Persistence State
  const [customSectors, setCustomSectors] = useState<Record<string, Record<string, number>>>({});
  const [assetGeo, setAssetGeo] = useState<Record<string, string>>({});
  const [lagStatus, setLagStatus] = useState<Record<string, any>>({});

  // Deep-link state: incremented to trigger Attribution view to switch to TABLES mode
  const [attributionTablesRequest, setAttributionTablesRequest] = useState(0);

  // Single canonical backcast — fetched once whenever portfolioData changes, shared to all views.
  // includeAttribution=true adds per-period, per-ticker return data derived from the same daily
  // series, ensuring all views (waterfall, performance graph, one pager) are consistent.
  const [backcastData, setBackcastData] = useState<BackcastResponse | null>(null);
  const [backcastLoading, setBackcastLoading] = useState(false);
  // Pre-fetched non-default benchmarks so the Performance tab switches are instant.
  const [prefetchedBackcasts, setPrefetchedBackcasts] = useState<Record<string, BackcastResponse>>({});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [showBootOverlay, setShowBootOverlay] = useState(true);

  useEffect(() => {
    if (portfolioData.length === 0) {
      setBackcastData(null);
      setPrefetchedBackcasts({});
      return;
    }
    let cancelled = false;
    setBackcastLoading(true);
    // Fetch 75/25 (with attribution for waterfall) plus all benchmark variants in parallel.
    Promise.all([
      fetchPortfolioBackcast(portfolioData, '75/25', true),
      fetchPortfolioBackcast(portfolioData, 'TSX'),
      fetchPortfolioBackcast(portfolioData, 'SP500'),
      fetchPortfolioBackcast(portfolioData, 'ACWI'),
    ])
      .then(([r7525, rTSX, rSP500, rACWI]) => {
        if (cancelled) return;
        if (!r7525.error) setBackcastData(r7525);
        const pre: Record<string, BackcastResponse> = {};
        if (!rTSX.error) pre['TSX'] = rTSX;
        if (!rSP500.error) pre['SP500'] = rSP500;
        if (!rACWI.error) pre['ACWI'] = rACWI;
        setPrefetchedBackcasts(pre);
      })
      .catch(e => console.error('Backcast prefetch failed:', e))
      .finally(() => { if (!cancelled) setBackcastLoading(false); });
    return () => { cancelled = true; };
  }, [portfolioData]);

  // Merge period attribution from the backcast (daily-chain returns) into portfolioData.
  // Only returnPct and contribution are overridden — all metadata (isMutualFund, sectorWeights,
  // startPrice, etc.) is preserved from /analyze-manual. Views that receive mergedPortfolioData
  // will automatically show returns consistent with the performance graph.
  const mergedPortfolioData = useMemo(() => {
    if (!backcastData?.periodAttribution || backcastData.periodAttribution.length === 0) {
      return portfolioData;
    }
    const attrMap = new Map<string, { returnPct: number; contribution: number }>();
    backcastData.periodAttribution.forEach(item => {
      attrMap.set(`${item.ticker}|${item.date}`, {
        returnPct: item.returnPct,
        contribution: item.contribution,
      });
    });
    return portfolioData.map(item => {
      const key = `${item.ticker}|${item.date}`;
      const override = attrMap.get(key);
      return override ? { ...item, returnPct: override.returnPct, contribution: override.contribution } : item;
    });
  }, [portfolioData, backcastData]);

  // Logic to determine if all active ETFs/MFs have sector data and no lags
  const getIsAssetSpecsComplete = () => {
    if (portfolioData.length === 0) return true; // No data = nothing to complete

    // Identify active ETFs/MFs (non-zero weight in latest period)
    const activeTickers = Array.from(new Set(portfolioData.filter(i => i.isEtf || i.isMutualFund).map(i => i.ticker)))
      .filter(ticker => {
        const tickerData = portfolioData.filter(d => d.ticker === ticker);
        const latestRecord = tickerData.reduce((prev, curr) => (curr.date > prev.date) ? curr : prev);
        return latestRecord.weight > 0;
      });

    if (activeTickers.length === 0) return true;

    // Must have sector data for all
    const allSectorsDone = activeTickers.every(t => !!customSectors[t]);

    // Must have no lagging NAVs for MFs
    const anyLagging = activeTickers.some(t => {
      const item = portfolioData.find(i => i.ticker === t);
      if (!item?.isMutualFund) return false;

      const status = lagStatus[t];
      // If status is missing, we treat it as "not complete" because check hasn't run
      if (!status) return true;
      return status.lagging;
    });

    return allSectorsDone && !anyLagging;
  };

  const isAssetSpecsComplete = getIsAssetSpecsComplete();

  // Auto-load persisted manual configuration on reach
  useEffect(() => {
    const autoLoad = async () => {
      try {
        // Load custom sectors first so they are available for the analysis
        const [sectors, geo] = await Promise.all([
          loadSectorWeights(),
          loadAssetGeo(),
        ]);
        setCustomSectors(sectors);
        setAssetGeo(geo);

        const config = await loadPortfolioConfig();
        if (config.tickers && config.tickers.length > 0 && config.periods && config.periods.length > 0) {
          // Convert the grid state into a flat list of items per the backend requirement
          const flatItems = convertConfigToItems(config.tickers, config.periods);

          if (flatItems.length > 0) {
            console.log("Auto-loading saved portfolio...");
            try {
              const response = await analyzeManualPortfolioFull(flatItems);
              handleDataLoaded(response.items, { name: "Manual Entry", count: response.items.length }, undefined, response);

            } catch (analysisErr) {
              console.error("Backend analysis failed during auto-load, falling back to basic data:", analysisErr);
              // Fallback: Create basic items so the UI can still show the management list
              handleDataLoaded(flatItems, { name: "Manual Entry (Basic)", count: flatItems.length });
            }
          }
        }
      } catch (err) {
        console.error("Auto-load failed totally:", err);
      } finally {
        setIsBootstrapping(false);
      }
    };

    autoLoad();
  }, []);

  useEffect(() => {
    if (isBootstrapping) {
      setShowBootOverlay(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowBootOverlay(false);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [isBootstrapping]);

  const bootSteps = [
    { key: 'portfolio', label: 'Loading Portfolio Data', sub: 'Saved holdings and allocations' },
    { key: 'nav', label: 'Refreshing NAV History', sub: 'Mutual fund CSV inputs and lag status' },
    { key: 'benchmarks', label: 'Prefetching Benchmarks', sub: 'Backcast series and performance views' },
    { key: 'views', label: 'Building Workspace', sub: 'Charts, tables, and shared state' },
  ] as const;

  const handleDataLoaded = (data: PortfolioItem[], fileInfo?: { name: string, count: number }, _files?: any, response?: PortfolioAnalysisResponse) => {
    setPortfolioData(data);
    setAnalysisResponse(response ?? null);
    setCorrelationResult(null);
    setCorrelationStatus('idle');

    if (data.length === 0) {
      setFileHistory([]);
    } else if (fileInfo) {
      if (fileInfo.name === "Manual Entry") {
        // Manual entry replaces all - show only this entry
        setFileHistory([fileInfo]);
      } else {
        setFileHistory(prev => [...prev, fileInfo]);
      }
    }
  };

  // Trigger resize so Recharts ResponsiveContainer recalculates dimensions after tab switch
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [currentView]);

  // Track which views have been visited so we mount them once and keep them alive
  const visitedViews = useRef(new Set<ViewState>([ViewState.UPLOAD]));
  if (!visitedViews.current.has(currentView)) {
    visitedViews.current.add(currentView);
  }
  const visited = visitedViews.current;

  // Helper: wrap each view with fade transition
  const viewPane = (view: ViewState, children: React.ReactNode) => (
    <div
      key={view}
      className={`transition-opacity duration-300 ease-in-out ${
        currentView === view ? 'opacity-100 h-full' : 'opacity-0 pointer-events-none absolute inset-0 overflow-hidden'
      }`}
    >
      {children}
    </div>
  );

  return (
    <GlobalErrorBoundary>
      <div className="flex min-h-screen bg-wallstreet-900 text-wallstreet-text font-sans relative">
        {showBootOverlay && (
          <div
            className={`fixed inset-0 z-[80] flex items-center justify-center bg-wallstreet-900/96 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
              isBootstrapping ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-busy="true"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-8 w-full max-w-sm px-6">
              <style>{`
                @keyframes bootBarPulse {
                  0%, 100% { transform: scaleY(0.14); opacity: 0.12; }
                  50% { transform: scaleY(1); opacity: 1; }
                }
                @keyframes bootScanLine {
                  0% { left: -2px; }
                  100% { left: calc(100% + 2px); }
                }
                @keyframes bootStepPulse {
                  0%, 100% { opacity: 0.45; transform: translateY(0); }
                  50% { opacity: 1; transform: translateY(-1px); }
                }
              `}</style>
              <div className="relative overflow-hidden rounded" style={{ width: '176px', height: '60px' }}>
                <div className="flex items-end h-full gap-1.5">
                  {[20, 44, 30, 58, 40, 74, 50, 86, 44, 68, 56, 84, 60].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm origin-bottom"
                      style={{
                        height: `${h}%`,
                        background: i === 12 ? 'var(--wallstreet-accent)' : 'var(--wallstreet-700)',
                        animation: `bootBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <div
                  className="absolute top-0 bottom-0 w-px"
                  style={{
                    background: 'linear-gradient(to bottom, transparent, rgba(10,35,81,0.72), transparent)',
                    animation: 'bootScanLine 2.2s linear infinite',
                  }}
                />
              </div>

              <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.28em] uppercase">
                Loading Workspace
              </p>

              <div className="w-full bg-wallstreet-700 rounded-full h-1.5 overflow-hidden">
                <div className="bg-wallstreet-accent h-full rounded-full w-2/5 transition-all duration-500 ease-out" />
              </div>

              <div className="w-full space-y-3">
                {bootSteps.map(({ key, label, sub }, index) => (
                  <div key={key} className="flex items-center gap-3" style={{ animation: `bootStepPulse 2.2s ease-in-out ${index * 0.16}s infinite` }}>
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {index === 0 ? (
                        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className={`w-3.5 h-3.5 border-2 border-wallstreet-600 rounded-full ${index === 1 ? 'border-t-wallstreet-accent animate-spin' : 'border-wallstreet-600 opacity-70'}`} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium text-wallstreet-500">
                        {label}
                      </p>
                      <p className="text-xs text-wallstreet-500 truncate">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <Sidebar
          currentView={currentView}
          setView={setCurrentView}
          hasData={portfolioData.length > 0}
          isAssetSpecsComplete={isAssetSpecsComplete}
        />

        <main className="flex-1 overflow-y-auto max-h-screen relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-wallstreet-100 via-wallstreet-900 to-wallstreet-900 -z-10 pointer-events-none"></div>

          {/* Always render Upload */}
          {viewPane(ViewState.UPLOAD,
            <UploadView
              onDataLoaded={handleDataLoaded}
              onProceed={() => setCurrentView(ViewState.DASHBOARD)}
              currentData={portfolioData}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              customSectors={customSectors}
              setCustomSectors={setCustomSectors}
              assetGeo={assetGeo}
              setAssetGeo={setAssetGeo}
              lagStatus={lagStatus}
              setLagStatus={setLagStatus}
            />
          )}

          {/* Mount once visited, then keep alive */}
          {visited.has(ViewState.DASHBOARD) && viewPane(ViewState.DASHBOARD,
            <DashboardView data={mergedPortfolioData} customSectors={customSectors} assetGeo={assetGeo} isActive={currentView === ViewState.DASHBOARD} />
          )}
          {visited.has(ViewState.INDEX) && viewPane(ViewState.INDEX,
            <IndexView />
          )}
          {visited.has(ViewState.ATTRIBUTION) && viewPane(ViewState.ATTRIBUTION,
            <AttributionView data={mergedPortfolioData} selectedYear={selectedYear} setSelectedYear={setSelectedYear} customSectors={customSectors} tablesRequest={attributionTablesRequest} sharedBackcast={backcastData} analysisResponse={analysisResponse} />
          )}
          {visited.has(ViewState.PERFORMANCE) && viewPane(ViewState.PERFORMANCE,
            <PerformanceView isActive={currentView === ViewState.PERFORMANCE} sharedBackcast={backcastData} sharedBackcastLoading={backcastLoading} prefetchedBackcasts={prefetchedBackcasts} />
          )}
          {visited.has(ViewState.RISK_CONTRIBUTION) && viewPane(ViewState.RISK_CONTRIBUTION,
            <RiskContributionView />
          )}
          {visited.has(ViewState.CORRELATION) && viewPane(ViewState.CORRELATION,
            <CorrelationView
              data={portfolioData}
              result={correlationResult}
              status={correlationStatus}
              setResult={setCorrelationResult}
              setStatus={setCorrelationStatus}
            />
          )}
          {visited.has(ViewState.ANALYSIS) && viewPane(ViewState.ANALYSIS,
            <ReportView
              data={mergedPortfolioData}
              customSectors={customSectors}
              assetGeo={assetGeo}
              isActive={currentView === ViewState.ANALYSIS}
              sharedBackcast={backcastData}
              sharedBackcastLoading={backcastLoading}
              onNavigate={(view) => {
                if (view === ViewState.ATTRIBUTION) setAttributionTablesRequest(r => r + 1);
                setCurrentView(view);
              }}
            />
          )}
        </main>
      </div>
    </GlobalErrorBoundary>
  );
}

export default App;
