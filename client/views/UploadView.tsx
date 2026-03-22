import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, ArrowRight, Trash2, Database, Edit, FileSpreadsheet, CheckCircle2, AlertTriangle, Upload, PieChart, RefreshCw, Layers, ChevronDown, ChevronUp, HelpCircle, Search, Eye, Plus, Save } from 'lucide-react';
import { PortfolioItem } from '../types';
import { analyzeManualPortfolio, checkNavLag, loadSectorWeights, saveSectorWeights, uploadNav, saveAssetGeo, fetchNavAudit, saveManualNav } from '../services/api';
import { ManualEntryModal } from '../components/ManualEntryModal';
import { SectorWeightsModal } from '../components/SectorWeightsModal';

interface UploadViewProps {
  onDataLoaded: (data: PortfolioItem[], fileInfo?: { name: string, count: number }, files?: { weightsFile: File | null, navFile: File | null }) => void;
  onProceed: () => void;
  currentData: PortfolioItem[];
  fileHistory?: { name: string, count: number }[];
  selectedYear: 2025 | 2026;
  setSelectedYear: (year: 2025 | 2026) => void;
  customSectors: Record<string, Record<string, number>>;
  setCustomSectors: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  assetGeo: Record<string, string>;
  setAssetGeo: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  lagStatus: Record<string, any>;
  setLagStatus: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export const UploadView: React.FC<UploadViewProps> = ({
  onDataLoaded, onProceed, currentData, selectedYear, setSelectedYear,
  customSectors, setCustomSectors, assetGeo, setAssetGeo, lagStatus, setLagStatus
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCheckingLag, setIsCheckingLag] = useState(false);

  // NAV Audit State
  const [isNavAuditOpen, setIsNavAuditOpen] = useState(false);
  const [navAuditData, setNavAuditData] = useState<Record<string, { date: string, nav: number, source: string, returnPct: number | null }[]>>({});
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditExpandedTicker, setAuditExpandedTicker] = useState<string | null>(null);
  const [addNavTicker, setAddNavTicker] = useState<string | null>(null);
  const [addNavDate, setAddNavDate] = useState('');
  const [addNavValue, setAddNavValue] = useState('');
  const [isSavingNav, setIsSavingNav] = useState(false);

  // UI State
  const [isAssetSectionOpen, setIsAssetSectionOpen] = useState(true); // Default to open if data exists

  const runLagCheck = useCallback(async (items: PortfolioItem[], forceRefresh: boolean = false) => {
    if (items.length === 0) return;

    // Find the latest date specifically for Mutual Funds to decouple them from live Stock dates
    // This ensures we check lag relative to the latest available MF data point
    const mfLatestDate = items
      .filter(i => i.isMutualFund && i.weight > 0)
      .reduce((max, item) => (item.date > max ? item.date : max), '');

    // Use mutual fund date if available, otherwise fallback to global (though we filter for MFs later)
    const referenceDate = mfLatestDate || items.reduce((max, item) => (item.date > max ? item.date : max), '');

    // Only check mutual funds that are ACTIVE (weight > 0) in that specific reference period
    const mfTickers = Array.from(new Set(
      items
        .filter(i => i.isMutualFund && i.date === referenceDate && i.weight > 0)
        .map(i => i.ticker)
    ));

    if (mfTickers.length > 0) {
      setIsCheckingLag(true);
      try {
        // Pass referenceDate so we check lag relative to the MF snapshot
        const lagResults = await checkNavLag(mfTickers, forceRefresh, referenceDate);
        setLagStatus(lagResults);
      } catch (err) {
        console.error("Lag check failed", err);
      } finally {
        setIsCheckingLag(false);
      }
    } else {
      // If no active mutual funds, clear any existing lag status (or set to empty)
      setLagStatus({});
      setIsCheckingLag(false);
    }
  }, []);

  // Auto-run lag check when portfolio data changes and lag hasn't been checked yet
  useEffect(() => {
    if (currentData.length > 0 && Object.keys(lagStatus).length === 0) {
      runLagCheck(currentData);
    }
  }, [currentData, lagStatus, runLagCheck]);

  // Manual Entry State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSectorModalOpen, setIsSectorModalOpen] = useState(false);
  const [selectedTickerForSector, setSelectedTickerForSector] = useState<string>('');

  const refreshAuditData = async () => {
    try {
      const data = await fetchNavAudit();
      setNavAuditData(data);
    } catch (err) {
      console.error("Failed to refresh NAV audit data", err);
    }
  };

  const handleSaveManualNav = async (ticker: string) => {
    if (!addNavDate || !addNavValue) return;
    const nav = parseFloat(addNavValue);
    if (isNaN(nav)) return;
    setIsSavingNav(true);
    try {
      await saveManualNav(ticker, addNavDate, nav);
      await refreshAuditData();
      setAddNavTicker(null);
      setAddNavDate('');
      setAddNavValue('');
    } catch (err: any) {
      setError(`Failed to save NAV for ${ticker}: ${err.message}`);
    } finally {
      setIsSavingNav(false);
    }
  };

  const handleAuditCsvUpload = async (ticker: string, file: File) => {
    try {
      setError(null);
      await uploadNav(ticker, file);
      await new Promise(resolve => setTimeout(resolve, 300));
      await refreshAuditData();
    } catch (err: any) {
      setError(`Upload failed for ${ticker}: ${err.message}`);
    }
  };

  const handleOpenNavAudit = async () => {
    if (isNavAuditOpen) {
      setIsNavAuditOpen(false);
      return;
    }
    setIsNavAuditOpen(true);
    setIsLoadingAudit(true);
    try {
      const data = await fetchNavAudit();
      setNavAuditData(data);
    } catch (err) {
      console.error("Failed to load NAV audit data", err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleFullRefresh = async () => {
    setIsCheckingLag(true);
    try {
      // 1. Re-analyze portfolio to pick up any new NAVs on disk
      const results = await analyzeManualPortfolio(currentData);
      onDataLoaded(results, { name: "Manual Entry (Refreshed)", count: results.length });

      // 2. Re-check lag status with forceRefresh=true
      await runLagCheck(results, true);
    } catch (err) {
      console.error("Full refresh failed", err);
      setError("Failed to refresh data. Please try again.");
    } finally {
      setIsCheckingLag(false);
    }
  };

  const handleManualSubmit = async (items: PortfolioItem[]) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const results = await analyzeManualPortfolio(items);
      onDataLoaded(results, { name: "Manual Entry", count: results.length });
      await runLagCheck(results);
      setIsAssetSectionOpen(true); // Open section automatically after entry
    } catch (err: any) {
      console.error("Manual analysis failed, falling back to basic data:", err);
      // Fallback: Still load the basic data so the user can see and fix the error
      onDataLoaded(items, { name: "Manual Entry (Basic)", count: items.length });
      setIsAssetSectionOpen(true);
      setError("Analysis failed: " + (err.message || "Unknown error") + ". Showing basic list for correction.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNavUpload = async (ticker: string, file: File) => {
    try {
      setError(null);
      setIsCheckingLag(true);  // Show loading state immediately

      await uploadNav(ticker, file);

      // Small delay to ensure file is written on server
      await new Promise(resolve => setTimeout(resolve, 300));

      // Proactively re-analyze and refresh lag check with force refresh
      // forceRefresh=true ensures server re-reads NAV files from disk
      const analyzedData = await analyzeManualPortfolio(currentData);
      onDataLoaded(analyzedData, { name: "Manual Entry (Updated)", count: analyzedData.length });

      // Run lag check to update status with new data (force refresh)
      await runLagCheck(analyzedData, true);
    } catch (err: any) {
      setError(`Upload failed for ${ticker}: ${err.message}`);
    } finally {
      setIsCheckingLag(false);
    }
  };

  const handleSaveSectorWeights = async (ticker: string, weights: Record<string, number>) => {
    // Calculate new state immediately
    const updated = { ...customSectors, [ticker]: weights };

    // Update local/lifted state
    setCustomSectors(updated);

    // Persist to backend
    try {
      await saveSectorWeights(updated);
    } catch (err) {
      console.error("Failed to persist sector weights to backend:", err);
      setError("Warning: Changes saved in browser but failed to persist to server.");
    }
  };

  const handleSaveAssetGeo = async (ticker: string, geo: string) => {
    const updated = { ...assetGeo, [ticker]: geo };
    setAssetGeo(updated);
    try {
      await saveAssetGeo(updated);
    } catch (err: any) {
      console.error("Failed to persist asset geography", err);
      setError(`Warning: Failed to save geography for ${ticker}.`);
    }
  };

  const globalLatestDate = currentData.length > 0
    ? currentData.reduce((max, item) => (item.date > max ? item.date : max), '')
    : '';

  const activeTickersData = Array.from(new Set(currentData.filter(i => i.isEtf || i.isMutualFund).map(i => i.ticker)))
    .filter(ticker => {
      const tickerData = currentData.filter(d => d.ticker === ticker);
      if (tickerData.length === 0) return false;
      const latestRecord = tickerData.reduce((prev, curr) => (curr.date > prev.date) ? curr : prev);
      // Only show in "Manage Asset Specifications" if it's active in the latest period
      return latestRecord.date === globalLatestDate && latestRecord.weight > 0;
    })
    .map(ticker => {
      const item = currentData.find(i => i.ticker === ticker);
      const tickerData = currentData.filter(d => d.ticker === ticker);
      const latestRecord = tickerData.reduce((prev, curr) => (curr.date > prev.date) ? curr : prev);

      return {
        ticker,
        isEtf: item?.isEtf,
        isMutualFund: item?.isMutualFund,
        isComplete: !!customSectors[ticker],
        geo: assetGeo[ticker] || '',
        weight: latestRecord.weight
      };
    });

  const activeEtfs = activeTickersData.filter(a => a.isEtf);
  const activeMfs = activeTickersData.filter(a => a.isMutualFund);

  const totalCompletedSectors = activeTickersData.filter(a => a.isComplete).length;
  const totalAssets = activeTickersData.length;
  const anyLagging = Object.values(lagStatus).some(s => s.lagging);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 p-8 relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-wallstreet-900 via-wallstreet-900/30 to-wallstreet-900/40 -z-10" />

      <div className="max-w-[1400px] w-full space-y-6 mx-auto">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left Column: Weights & Periods */}
          <div className="bg-wallstreet-800/70 backdrop-blur-xl rounded-2xl border border-wallstreet-700 shadow-lg p-5 hover:shadow-xl transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Edit size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-black text-wallstreet-text uppercase tracking-tight">1. Weights & Periods</h3>
                <p className="text-xs text-wallstreet-500 font-bold">REBALANCING HISTORY</p>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="w-full max-w-[200px] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30"
              >
                <Edit size={18} /> Open Editor
              </button>
            </div>
          </div>

          {/* Right Column: Centered Summary Status Card */}
          <div className="bg-wallstreet-800/70 backdrop-blur-xl rounded-2xl border border-wallstreet-700 shadow-lg p-5 hover:shadow-xl transition-all flex flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl mb-2">
                <Layers size={22} className="text-white" />
              </div>
              <h3 className="text-lg font-black text-wallstreet-text uppercase tracking-tight">2. Asset Completion</h3>
              <p className="text-xs text-wallstreet-500 font-bold">SECTORS & PRICING</p>
            </div>

            <div className="w-full space-y-3">
              {totalAssets > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-wallstreet-800 rounded-2xl border border-wallstreet-700 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs text-wallstreet-500 uppercase font-black tracking-widest mb-2">Sector Weights</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-3xl font-black ${totalCompletedSectors === totalAssets ? 'text-green-600' : 'text-wallstreet-text'}`}>
                        {totalCompletedSectors}<span className="text-wallstreet-500 mx-1">/</span>{totalAssets}
                      </span>
                    </div>
                    {totalCompletedSectors === totalAssets ?
                      <div className="mt-2 flex items-center gap-1 text-green-600 font-bold text-xs bg-green-50 px-2.5 py-1 rounded-full uppercase">
                        <CheckCircle2 size={12} /> Complete
                      </div> :
                      <div className="mt-2 flex items-center gap-1 text-amber-600 font-bold text-xs bg-amber-50 px-2.5 py-1 rounded-full uppercase">
                        <AlertTriangle size={12} /> Missing Data
                      </div>
                    }
                  </div>

                  <div className="p-5 bg-wallstreet-800 rounded-2xl border border-wallstreet-700 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs text-wallstreet-500 uppercase font-black tracking-widest mb-2">Data Recency</p>
                    {(() => {
                      const activeMfItems = currentData.filter(i => i.isMutualFund && i.weight > 0);
                      const hasMfs = activeMfItems.length > 0;

                      if (!hasMfs) {
                        return (
                          <div className="flex flex-col items-center gap-2 py-4">
                            <span className="text-green-600 font-bold text-lg">Live Data</span>
                            <span className="text-xs text-wallstreet-500 px-4 text-center">Using real-time market pricing</span>
                          </div>
                        );
                      }

                      const lastMfDate = activeMfItems.reduce((max, item) => (item.date > max ? item.date : max), '');
                      const activeMfTickers = activeMfItems.map(i => i.ticker);
                      const relevantStatuses = activeMfTickers.map(t => lagStatus[t]).filter(Boolean);

                      const navDates = relevantStatuses.map(s => s.last_nav).filter(Boolean).sort();
                      const oldestNavDate = navDates[0] || '';

                      const marketDates = relevantStatuses.map(s => s.last_market).filter(Boolean).sort();
                      const latestMarketDate = marketDates[marketDates.length - 1] || '';

                      // Check for match
                      const isSynced = oldestNavDate && lastMfDate && oldestNavDate >= lastMfDate;
                      const isChecking = isCheckingLag;

                      const todayStr = new Date().toISOString().split('T')[0];
                      const isStockCurrent = latestMarketDate === todayStr;

                      return (
                        <>
                          <div className="flex items-center gap-2 mb-3">
                            {isChecking ? (
                              <RefreshCw size={20} className="animate-spin text-wallstreet-500" />
                            ) : (
                              <span className={`text-2xl font-black ${isSynced ? 'text-green-600' : 'text-amber-600'}`}>
                                {isSynced ? 'Synced' : 'Lagging'}
                              </span>
                            )}
                            {!isSynced && !isChecking && (
                              <button
                                onClick={() => runLagCheck(currentData, true)}
                                className="ml-1 bg-amber-50 text-amber-600 p-1.5 rounded-full hover:bg-amber-100 transition-colors"
                                title="Force refresh"
                              >
                                <RefreshCw size={10} />
                              </button>
                            )}
                          </div>

                          <div className="w-full bg-wallstreet-900 rounded-lg p-3 text-xs font-mono space-y-2.5 border border-wallstreet-700">
                            <div className="flex justify-between items-center border-b border-wallstreet-700 pb-2 mb-1">
                              <span className="text-wallstreet-500 uppercase tracking-tighter">Stock Data</span>
                              <span className={isStockCurrent ? "text-green-600 font-bold" : "text-wallstreet-500 font-bold"}>
                                {latestMarketDate || 'N/A'}
                              </span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-wallstreet-500 uppercase tracking-tighter">Last MF Date</span>
                              <span className="text-wallstreet-text font-bold">{lastMfDate || '-'}</span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-wallstreet-500 uppercase tracking-tighter">Last NAV Data</span>
                              <span className={`font-bold ${isSynced ? 'text-green-600' : 'text-amber-600'}`}>
                                {oldestNavDate || (isChecking ? '...' : 'Missing')}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <PieChart size={48} className="text-wallstreet-500 mb-4" />
                  <p className="text-wallstreet-500 font-medium max-w-[240px]">Tickers with 'ETF' or 'MF' checked in step 1 will prompt for details here.</p>
                </div>
              )}
            </div>

            {totalAssets > 0 && (
              <button
                onClick={() => setIsAssetSectionOpen(!isAssetSectionOpen)}
                className={`mt-6 w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isAssetSectionOpen
                  ? 'bg-purple-50 text-purple-700 border-2 border-purple-300 shadow-inner dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700'
                  : 'bg-purple-600 text-white shadow-lg shadow-purple-900/30 hover:bg-purple-700'
                  }`}
              >
                {isAssetSectionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                {isAssetSectionOpen ? 'Hide Asset Details Section' : 'Manage Sector Weights and NAVs'}
              </button>
            )}
          </div>
        </div>

        {/* --- NEW SECTION: Asset Details Expansion --- */}
        {totalAssets > 0 && isAssetSectionOpen && (
          <div className="bg-wallstreet-800/80 backdrop-blur-2xl rounded-2xl border border-wallstreet-700 shadow-xl overflow-hidden animate-in slide-in-from-top-4 duration-500">
            <div className="bg-gradient-to-r from-[#9033e7] to-[#2563eb] p-4 flex items-center justify-center text-white">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black uppercase tracking-tighter">Manage Asset Specifications</h2>
              </div>
            </div>

            <div className={`p-5 grid grid-cols-1 ${activeMfs.length > 0 && activeEtfs.length > 0 ? 'md:grid-cols-2' : ''} gap-8`}>
              {/* Mutual Funds Section */}
              {activeMfs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 border-b border-wallstreet-700 pb-1">
                    <Database size={16} className="text-purple-600" />
                    <h3 className="text-sm font-black text-wallstreet-text uppercase tracking-widest">Mutual Funds</h3>
                  </div>
                  <div className="space-y-3">
                    {activeMfs.map(asset => (
                      <AssetCard
                        key={asset.ticker}
                        asset={asset}
                        lagStatus={lagStatus}
                        onEditSector={() => { setSelectedTickerForSector(asset.ticker); setIsSectorModalOpen(true); }}
                        onAssetGeoChange={(geo) => handleSaveAssetGeo(asset.ticker, geo)}
                        onUploadNav={handleNavUpload}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ETFs Section */}
              {activeEtfs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 border-b border-wallstreet-700 pb-1">
                    <Layers size={16} className="text-blue-600" />
                    <h3 className="text-sm font-black text-wallstreet-text uppercase tracking-widest">ETFs</h3>
                  </div>
                  <div className="space-y-3">
                    {activeEtfs.map(asset => (
                      <AssetCard
                        key={asset.ticker}
                        asset={asset}
                        lagStatus={lagStatus}
                        onEditSector={() => { setSelectedTickerForSector(asset.ticker); setIsSectorModalOpen(true); }}
                        onAssetGeoChange={(geo) => handleSaveAssetGeo(asset.ticker, geo)}
                        onUploadNav={handleNavUpload}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NAV Audit Section — only show if MFs with weight exist in the selected year */}
        {currentData.some(i => {
          if (!i.isMutualFund || !i.weight) return false;
          const yearStart = selectedYear === 2025 ? '2024-12-31' : '2025-12-31';
          const yearEnd = selectedYear === 2025 ? '2025-12-31' : '2026-12-31';
          return i.date >= yearStart && i.date <= yearEnd;
        }) && (
          <div className="bg-wallstreet-800/80 backdrop-blur-2xl rounded-2xl border border-wallstreet-700 shadow-xl overflow-hidden">
            <button
              onClick={handleOpenNavAudit}
              className="w-full bg-gradient-to-r from-slate-700 to-slate-900 p-4 flex items-center justify-center text-white gap-3 hover:from-slate-600 hover:to-slate-800 transition-all"
            >
              <Eye size={18} />
              <h2 className="text-lg font-black uppercase tracking-tighter">NAV Audit</h2>
              {isNavAuditOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isNavAuditOpen && (
              <div className="p-5">
                {isLoadingAudit ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-wallstreet-500">
                    <RefreshCw size={16} className="animate-spin" />
                    <span className="text-sm font-medium">Loading NAV data...</span>
                  </div>
                ) : Object.keys(navAuditData).length === 0 ? (
                  <p className="text-center text-wallstreet-500 py-8 text-sm">No NAV data found on server.</p>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const yearStart = selectedYear === 2025 ? '2024-12-31' : '2025-12-31';
                      const yearEnd = selectedYear === 2025 ? '2025-12-31' : '2026-12-31';
                      const activeMfTickers = new Set(
                        currentData
                          .filter(i => i.isMutualFund && i.weight && i.weight > 0 && i.date >= yearStart && i.date <= yearEnd)
                          .map(i => i.ticker.toUpperCase())
                      );
                      return Object.entries(navAuditData)
                        .filter(([ticker]) => activeMfTickers.has(ticker.toUpperCase()))
                        .map(([ticker, entries]) => {
                          const isExpanded = auditExpandedTicker === ticker;
                          const yearEntries = entries.filter(e => e.date >= yearStart && e.date <= yearEnd);
                          const allEntries = entries;
                          const mostRecentNav = allEntries.length > 0 ? allEntries[allEntries.length - 1] : null;
                          const latestYearEntry = yearEntries[yearEntries.length - 1];
                          const manualCount = yearEntries.filter(e => e.source === 'manual').length;
                          const csvCount = yearEntries.filter(e => e.source === 'csv').length;
                          const isAddingNav = addNavTicker === ticker;

                          // Portfolio holding status for this ticker
                          const tickerHoldings = currentData
                            .filter(i => i.ticker.toUpperCase() === ticker.toUpperCase() && i.date >= yearStart && i.date <= yearEnd)
                            .sort((a, b) => a.date.localeCompare(b.date));
                          const latestHolding = tickerHoldings[tickerHoldings.length - 1];
                          const isCurrentlyHeld = latestHolding && latestHolding.weight > 0;
                          // Find the last period where weight > 0
                          const lastHeldRecord = [...tickerHoldings].reverse().find(h => h.weight > 0);
                          const formatDateDMY = (d: string) => {
                            const [y, m, day] = d.split('-');
                            return `${day}/${m}/${y}`;
                          };

                          return (
                            <div key={ticker} className="border border-wallstreet-700 rounded-xl overflow-hidden">
                              {/* Header row */}
                              <button
                                onClick={() => setAuditExpandedTicker(isExpanded ? null : ticker)}
                                className="w-full flex items-center justify-between p-3 bg-wallstreet-900 hover:bg-wallstreet-900 transition-colors text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                                    <Database size={14} className="text-white" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-wallstreet-text">{ticker}</span>
                                      {isCurrentlyHeld ? (
                                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">Currently held</span>
                                      ) : lastHeldRecord ? (
                                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">Last held {formatDateDMY(lastHeldRecord.date)}</span>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] font-bold text-wallstreet-500">{yearEntries.length} entries</span>
                                      {manualCount > 0 && <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">manual: {manualCount}</span>}
                                      {csvCount > 0 && <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">csv: {csvCount}</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  {/* Most recent NAV (across all data, not just year) */}
                                  <div className="text-right">
                                    <p className="text-[10px] text-wallstreet-500 uppercase tracking-wider font-bold">Latest NAV</p>
                                    {mostRecentNav ? (
                                      <>
                                        <p className="text-sm font-mono font-bold text-wallstreet-text">{mostRecentNav.nav.toFixed(4)}</p>
                                        <p className="text-[10px] font-mono text-wallstreet-500">{mostRecentNav.date}</p>
                                      </>
                                    ) : (
                                      <p className="text-xs text-wallstreet-500">N/A</p>
                                    )}
                                  </div>
                                  {isExpanded ? <ChevronUp size={16} className="text-wallstreet-500" /> : <ChevronDown size={16} className="text-wallstreet-500" />}
                                </div>
                              </button>

                              {isExpanded && (
                                <div>
                                  {/* Action bar: Add NAV + Upload CSV */}
                                  <div className="flex items-center gap-2 px-3 py-2 bg-wallstreet-900/80 border-t border-wallstreet-700">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setAddNavTicker(isAddingNav ? null : ticker); setAddNavDate(''); setAddNavValue(''); }}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isAddingNav ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-wallstreet-800 text-wallstreet-500 border border-wallstreet-700 hover:border-purple-300 hover:text-purple-600'}`}
                                    >
                                      <Plus size={12} /> Add NAV
                                    </button>
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-wallstreet-800 text-wallstreet-500 border border-wallstreet-700 hover:border-blue-300 hover:text-blue-600 cursor-pointer transition-all">
                                      <Upload size={12} /> Upload CSV
                                      <input type="file" className="hidden" accept=".csv" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleAuditCsvUpload(ticker, file);
                                        e.target.value = '';
                                      }} />
                                    </label>
                                    <div className="flex-1" />
                                    {latestYearEntry && (
                                      <span className="text-[10px] text-wallstreet-500 font-mono">
                                        Year range: {yearEntries[0]?.date} to {latestYearEntry.date}
                                      </span>
                                    )}
                                  </div>

                                  {/* Inline add NAV form */}
                                  {isAddingNav && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border-t border-purple-200">
                                      <input
                                        type="date"
                                        value={addNavDate}
                                        onChange={(e) => setAddNavDate(e.target.value)}
                                        className="px-2 py-1.5 rounded-lg border border-purple-200 text-xs font-mono bg-wallstreet-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                      />
                                      <input
                                        type="number"
                                        step="0.0001"
                                        placeholder="NAV value"
                                        value={addNavValue}
                                        onChange={(e) => setAddNavValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveManualNav(ticker); }}
                                        className="px-2 py-1.5 rounded-lg border border-purple-200 text-xs font-mono bg-wallstreet-800 w-32 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                      />
                                      <button
                                        onClick={() => handleSaveManualNav(ticker)}
                                        disabled={isSavingNav || !addNavDate || !addNavValue}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                      >
                                        {isSavingNav ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} Save
                                      </button>
                                    </div>
                                  )}

                                  {/* NAV table */}
                                  <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-wallstreet-900">
                                        <tr className="text-left">
                                          <th className="px-3 py-2 font-black text-wallstreet-500 uppercase tracking-widest text-[10px]">Date</th>
                                          <th className="px-3 py-2 font-black text-wallstreet-500 uppercase tracking-widest text-[10px] text-right">NAV</th>
                                          <th className="px-3 py-2 font-black text-wallstreet-500 uppercase tracking-widest text-[10px] text-right">Return</th>
                                          <th className="px-3 py-2 font-black text-wallstreet-500 uppercase tracking-widest text-[10px] text-center">Source</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {[...yearEntries].reverse().map((entry, idx) => (
                                          <tr key={entry.date} className={`border-t border-wallstreet-700 ${idx % 2 === 0 ? 'bg-wallstreet-800' : 'bg-wallstreet-900/50'} hover:bg-blue-50/50 transition-colors`}>
                                            <td className="px-3 py-2 font-mono text-wallstreet-text">{entry.date}</td>
                                            <td className="px-3 py-2 font-mono text-wallstreet-text font-bold text-right">{entry.nav.toFixed(4)}</td>
                                            <td className={`px-3 py-2 font-mono text-right font-bold ${entry.returnPct === null ? 'text-wallstreet-500' : entry.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {entry.returnPct !== null ? `${entry.returnPct >= 0 ? '+' : ''}${entry.returnPct.toFixed(2)}%` : '-'}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${entry.source === 'csv' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {entry.source}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-4 p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Manual Entry Modal */}
      <ManualEntryModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSubmit={handleManualSubmit}
        existingData={currentData}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
      />

      {/* Sector Weights Modal */}
      <SectorWeightsModal
        isOpen={isSectorModalOpen}
        onClose={() => setIsSectorModalOpen(false)}
        ticker={selectedTickerForSector}
        initialWeights={customSectors[selectedTickerForSector]}
        onSave={handleSaveSectorWeights}
      />
    </div>
  );
};

// --- Sub-Components ---

interface AssetCardProps {
  asset: any;
  lagStatus: Record<string, any>;
  onEditSector: () => void;
  onAssetGeoChange: (geo: string) => void;
  onUploadNav: (ticker: string, file: File) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, lagStatus, onEditSector, onAssetGeoChange, onUploadNav }) => {
  const status = lagStatus[asset.ticker];
  const isLagging = status?.lagging;

  const geoTypes = ['CA', 'US', 'INTL'];

  return (
    <div className="bg-wallstreet-900/50 rounded-2xl border border-wallstreet-700 p-4 flex flex-col gap-3 hover:border-purple-300 hover:bg-wallstreet-800 transition-all group shadow-sm hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${asset.isEtf ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}`}>
            {asset.isEtf ? <Layers size={16} /> : <Database size={16} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-wallstreet-text">{asset.ticker}</h4>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                {asset.isComplete ? <CheckCircle2 size={12} className="text-green-500" /> : <AlertTriangle size={12} className="text-amber-500" />}
                <span className="text-xs font-medium text-wallstreet-500">{asset.isComplete ? 'Sectors Defined' : 'Sectors Missing'}</span>
              </div>
              {asset.isMutualFund && (
                <div className="flex items-center gap-1">
                  {isLagging ? <AlertTriangle size={12} className="text-amber-500" /> : <CheckCircle2 size={12} className="text-green-500" />}
                  <span className="text-xs font-medium text-wallstreet-500">{isLagging ? 'Lagging' : 'Optimal'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-wallstreet-900/50 rounded-lg p-1 border border-wallstreet-700">
            {geoTypes.map(g => (
              <button
                key={g}
                onClick={() => onAssetGeoChange(g)}
                className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${asset.geo === g
                  ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm border border-wallstreet-700'
                  : 'text-wallstreet-500 hover:text-wallstreet-500'
                  }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button
            onClick={onEditSector}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg hover:-translate-y-0.5 ${asset.isEtf
              ? 'bg-[#2563eb] text-white shadow-blue-900/30 hover:bg-[#1d4ed8]'
              : 'bg-purple-600 text-white shadow-purple-900/30 hover:bg-purple-700'
              }`}
          >
            <PieChart size={16} /> {asset.isComplete ? 'Configure' : 'Configure'}
          </button>
        </div>
      </div>

      {asset.isMutualFund && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-all ${isLagging ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-wallstreet-900 border-wallstreet-700'}`}>
          <div className="flex gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isLagging ? 'bg-amber-200 text-amber-700' : 'bg-wallstreet-900 text-wallstreet-500'}`}>
              <RefreshCw size={12} className={isLagging ? 'animate-pulse' : ''} />
            </div>
            <div>
              <p className={`text-xs font-bold leading-tight ${isLagging ? 'text-amber-800' : 'text-wallstreet-text'}`}>
                {isLagging ? 'Update Required' : 'NAV is Current'}
              </p>
              {status && (
                <p className="text-[11px] text-wallstreet-500 mt-1">
                  Last: <span className="font-mono font-bold text-wallstreet-text">{status.last_nav || 'N/A'}</span>
                  <span className="mx-1 text-wallstreet-500">|</span>
                  Mkt: <span className="font-mono font-bold text-wallstreet-text">{status.last_market}</span>
                </p>
              )}
            </div>
          </div>

          <label className={`cursor-pointer group/upload px-3 py-2 rounded-lg border shadow-sm transition-all flex items-center gap-1.5 ${isLagging ? 'bg-wallstreet-800 border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-wallstreet-800 border-wallstreet-700 text-wallstreet-500 hover:bg-wallstreet-900'}`}>
            <Upload size={14} className="group-hover/upload:-translate-y-0.5 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-tighter">Upload CSV</span>
            <input
              type="file"
              className="hidden"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadNav(asset.ticker, file);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default UploadView;
