import React, { useState, Component, ErrorInfo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { UploadView } from './views/UploadView';
import { DashboardView } from './views/DashboardView';
import { AnalysisView } from './views/AnalysisView';
import { CorrelationView } from './views/CorrelationView';
import { AttributionView } from './views/AttributionView';
import { IndexView } from './views/IndexView';
import { PerformanceView } from './views/PerformanceView';
import { PortfolioItem, ViewState } from './types';
import { loadPortfolioConfig, analyzeManualPortfolio, convertConfigToItems, loadSectorWeights, loadAssetGeo } from './services/api';

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
              <pre className="bg-white p-4 rounded border border-red-100 overflow-x-auto text-sm font-mono text-red-700">
                {this.state.error && this.state.error.toString()}
              </pre>
            </div>
            <div>
              <p className="font-bold mb-2">Stack Trace:</p>
              <details className="bg-white p-4 rounded border border-red-100 overflow-x-auto text-xs font-mono max-h-[300px] overflow-y-auto">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 mb-2">View Details</summary>
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
      return item?.isMutualFund && lagStatus[t]?.lagging;
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
              const results = await analyzeManualPortfolio(flatItems);
              handleDataLoaded(results, { name: "Manual Entry", count: results.length });
            } catch (analysisErr) {
              console.error("Backend analysis failed during auto-load, falling back to basic data:", analysisErr);
              // Fallback: Create basic items so the UI can still show the management list
              handleDataLoaded(flatItems, { name: "Manual Entry (Basic)", count: flatItems.length });
            }
          }
        }
      } catch (err) {
        console.error("Auto-load failed totally:", err);
      }
    };

    autoLoad();
  }, []);

  const handleDataLoaded = (data: PortfolioItem[], fileInfo?: { name: string, count: number }) => {
    setPortfolioData(data);
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

  const renderContent = () => {
    switch (currentView) {
      case ViewState.UPLOAD:
        return (
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
        );
      case ViewState.DASHBOARD:
        return <DashboardView data={portfolioData} customSectors={customSectors} assetGeo={assetGeo} />;
      case ViewState.INDEX:
        return <IndexView />;
      case ViewState.ANALYSIS:
        return <AnalysisView data={portfolioData} />;
      case ViewState.ATTRIBUTION:
        return <AttributionView data={portfolioData} selectedYear={selectedYear} setSelectedYear={setSelectedYear} />;
      case ViewState.PERFORMANCE:
        return <PerformanceView />;
      case ViewState.CORRELATION:
        return (
          <CorrelationView
            data={portfolioData}
            result={correlationResult}
            status={correlationStatus}
            setResult={setCorrelationResult}
            setStatus={setCorrelationStatus}
          />
        );
      default:
        return (
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
        );
    }
  };

  return (
    <GlobalErrorBoundary>
      <div className="flex min-h-screen bg-wallstreet-900 text-wallstreet-text font-sans">
        <Sidebar
          currentView={currentView}
          setView={setCurrentView}
          hasData={portfolioData.length > 0}
          isAssetSpecsComplete={isAssetSpecsComplete}
        />

        <main className="flex-1 overflow-y-auto max-h-screen relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-wallstreet-100 via-white to-white -z-10 pointer-events-none"></div>
          {renderContent()}
        </main>
      </div>
    </GlobalErrorBoundary>
  );
}

export default App;