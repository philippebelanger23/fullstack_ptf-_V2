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
import { PortfolioItem, ViewState, BackcastResponse, PortfolioWorkspaceAttribution, PortfolioWorkspaceResponse } from './types';
import { loadPortfolioConfig, convertConfigToItems, loadSectorWeights, loadAssetGeo, fetchPortfolioWorkspace } from './services/api';

const AUTOLOAD_WORKSPACE_TIMEOUT_MS = 60000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutLabel: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then((value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

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
  const [workspace, setWorkspace] = useState<PortfolioWorkspaceResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  // Historical upload metadata retained for the current workspace session.
  const [fileHistory, setFileHistory] = useState<{ name: string, count: number }[]>([]);

  // Lifted state for Correlation Analysis to prevent regeneration
  const [correlationResult, setCorrelationResult] = useState<any>(null);
  const [correlationStatus, setCorrelationStatus] = useState<'idle' | 'analyzing' | 'complete' | 'error'>('idle');

  // Shared state for year selection
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // Asset Completion & Persistence State
  const [customSectors, setCustomSectors] = useState<Record<string, Record<string, number>>>({});
  const [assetGeo, setAssetGeo] = useState<Record<string, string>>({});
  const [lagStatus, setLagStatus] = useState<Record<string, any>>({});

  // Deep-link state: incremented to trigger Attribution view to switch to TABLES mode
  const [attributionTablesRequest, setAttributionTablesRequest] = useState(0);

  // Single canonical backcast — fetched once whenever portfolioData changes, shared to all views.
  // includeAttribution=true adds per-period, per-ticker return data derived from the same daily
  // series, ensuring all views (waterfall, performance graph, one pager) are consistent.
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [showBootOverlay, setShowBootOverlay] = useState(false);
  const portfolioData = useMemo<PortfolioItem[]>(() => workspace?.holdings.items ?? [], [workspace]);
  const attributionData = useMemo<PortfolioWorkspaceAttribution | null>(() => workspace?.attribution ?? null, [workspace]);
  const performanceVariant = useMemo<BackcastResponse | null>(() => workspace?.performance?.variants?.['75/25'] ?? null, [workspace]);
  const workspaceRisk = useMemo(() => workspace?.risk ?? null, [workspace]);
  // Portfolio items come from the canonical workspace payload.
  // Shared attribution and performance selectors derive container-specific views from that spine.

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
    let cancelled = false;
    const autoLoad = async () => {
      try {
        // Load reference metadata opportunistically. This should never block the app shell.
        const [sectors, geo] = await Promise.all([
          loadSectorWeights(),
          loadAssetGeo(),
        ]);
        if (cancelled) return;
        setCustomSectors(sectors);
        setAssetGeo(geo);

        const config = await loadPortfolioConfig();
        if (cancelled) return;
        if (config.tickers && config.tickers.length > 0 && config.periods && config.periods.length > 0) {
          const flatItems = convertConfigToItems(config.tickers, config.periods);
          if (flatItems.length > 0) {
            setBootError(null);
            setIsBootstrapping(true);
            try {
              const nextWorkspace = await withTimeout(
                fetchPortfolioWorkspace(flatItems),
                AUTOLOAD_WORKSPACE_TIMEOUT_MS,
                'Workspace autoload'
              );
              if (cancelled) return;
              handleDataLoaded(nextWorkspace, { name: "Manual Entry", count: nextWorkspace.holdings.items.length });
            } catch (analysisErr) {
              console.error("Backend workspace build failed during auto-load:", analysisErr);
              if (!cancelled) {
                setBootError(analysisErr instanceof Error ? analysisErr.message : 'Workspace auto-load failed.');
              }
            } finally {
              if (!cancelled) setIsBootstrapping(false);
            }
          }
        }
      } catch (err) {
        console.error("Auto-load failed totally:", err);
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : 'Workspace auto-load failed.');
        }
      }
    };

    autoLoad();
    return () => { cancelled = true; };
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

  const handleDataLoaded = (nextWorkspace: PortfolioWorkspaceResponse | null, fileInfo?: { name: string, count: number }) => {
    setWorkspace(nextWorkspace);
    setBootError(null);
    setCorrelationResult(null);
    setCorrelationStatus('idle');

    if (!nextWorkspace || nextWorkspace.holdings.items.length === 0) {
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

          {bootError && portfolioData.length === 0 && (
            <div className="mx-8 mt-8 rounded-xl border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-900 shadow-sm">
              Workspace auto-load failed: {bootError}
            </div>
          )}

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
            <DashboardView data={portfolioData} customSectors={customSectors} assetGeo={assetGeo} isActive={currentView === ViewState.DASHBOARD} workspaceRisk={workspaceRisk} />
          )}
          {visited.has(ViewState.INDEX) && viewPane(ViewState.INDEX,
            <IndexView />
          )}
          {visited.has(ViewState.ATTRIBUTION) && viewPane(ViewState.ATTRIBUTION,
            <AttributionView selectedYear={selectedYear} setSelectedYear={setSelectedYear} tablesRequest={attributionTablesRequest} attributionData={attributionData} />
          )}
          {visited.has(ViewState.PERFORMANCE) && viewPane(ViewState.PERFORMANCE,
            <PerformanceView
              isActive={currentView === ViewState.PERFORMANCE}
              variants={workspace?.performance?.variants}
              defaultBenchmark={workspace?.performance?.defaultBenchmark}
            />
          )}
          {visited.has(ViewState.RISK_CONTRIBUTION) && viewPane(ViewState.RISK_CONTRIBUTION,
            <RiskContributionView workspaceRisk={workspaceRisk} />
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
              data={portfolioData}
              customSectors={customSectors}
              assetGeo={assetGeo}
              isActive={currentView === ViewState.ANALYSIS}
              performanceVariant={performanceVariant}
              workspaceRisk={workspaceRisk}
              attributionData={attributionData}
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
