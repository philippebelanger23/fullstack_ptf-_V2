import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowRight, Trash2, Database, Edit, FileSpreadsheet, CheckCircle2, AlertTriangle, Upload, PieChart, RefreshCw, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { PortfolioItem } from '../types';
import { analyzeManualPortfolio, checkNavLag, loadSectorWeights, saveSectorWeights, uploadNav, saveAssetGeo } from '../services/api';
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


  // UI State
  const [isAssetSectionOpen, setIsAssetSectionOpen] = useState(true); // Default to open if data exists

  // Manual Entry State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSectorModalOpen, setIsSectorModalOpen] = useState(false);
  const [selectedTickerForSector, setSelectedTickerForSector] = useState<string>('');

  const runLagCheck = async (items: PortfolioItem[]) => {
    const mfTickers = Array.from(new Set(items.filter(i => i.isMutualFund).map(i => i.ticker)));
    if (mfTickers.length > 0) {
      setIsCheckingLag(true);
      try {
        const lagResults = await checkNavLag(mfTickers);
        setLagStatus(lagResults);
      } catch (err) {
        console.error("Lag check failed", err);
      } finally {
        setIsCheckingLag(false);
      }
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
      await uploadNav(ticker, file);

      // Proactively re-analyze and refresh lag check
      const analyzedData = await analyzeManualPortfolio(currentData);
      onDataLoaded(analyzedData, { name: "Manual Entry (Updated)", count: analyzedData.length });
      await runLagCheck(analyzedData);
    } catch (err: any) {
      setError(`Upload failed for ${ticker}: ${err.message}`);
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
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 -z-10" />

      <div className="max-w-[1400px] w-full space-y-6 mx-auto">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left Column: Weights & Periods */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-lg p-5 hover:shadow-xl transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Edit size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">1. Weights & Periods</h3>
                <p className="text-xs text-slate-500 font-bold">REBALANCING HISTORY</p>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="w-full max-w-[200px] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
              >
                <Edit size={18} /> Open Editor
              </button>
            </div>
          </div>

          {/* Right Column: Centered Summary Status Card */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-lg p-5 hover:shadow-xl transition-all flex flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl mb-2">
                <Layers size={22} className="text-white" />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">2. Asset Completion</h3>
              <p className="text-xs text-slate-500 font-bold">SECTORS & PRICING</p>
            </div>

            <div className="w-full space-y-3">
              {totalAssets > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs text-slate-400 uppercase font-black tracking-widest mb-2">Sector Weights</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-3xl font-black ${totalCompletedSectors === totalAssets ? 'text-green-600' : 'text-slate-800'}`}>
                        {totalCompletedSectors}<span className="text-slate-300 mx-1">/</span>{totalAssets}
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

                  <div className="p-5 bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs text-slate-400 uppercase font-black tracking-widest mb-2">Data Recency</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-black ${anyLagging ? 'text-amber-600' : 'text-green-600'}`}>
                        {anyLagging ? 'Lagging' : 'Optimal'}
                      </span>
                    </div>
                    {anyLagging ? (
                      <div className="flex flex-col items-center gap-1 mt-2">
                        <button
                          onClick={() => runLagCheck(currentData)}
                          className="flex items-center gap-1 text-amber-600 font-bold text-xs bg-amber-50 px-2.5 py-1 rounded-full uppercase hover:bg-amber-100 transition-colors"
                        >
                          <RefreshCw size={12} className={isCheckingLag ? "animate-spin" : ""} />
                          {isCheckingLag ? 'Checking...' : 'Refresh'}
                        </button>
                        {(() => {
                          // Find first lagging item to show dates
                          const laggingEntries = Object.values(lagStatus).filter(s => s.lagging);
                          if (laggingEntries.length > 0) {
                            const first = laggingEntries[0];
                            return (
                              <p className="text-[10px] text-slate-500 font-mono mt-1">
                                NAV: {first.last_nav} <br /> MKT: {first.last_market}
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1 text-green-600 font-bold text-xs bg-green-50 px-2.5 py-1 rounded-full uppercase">
                        <CheckCircle2 size={12} /> Current
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <PieChart size={48} className="text-slate-200 mb-4" />
                  <p className="text-slate-400 font-medium max-w-[240px]">Tickers with 'ETF' or 'MF' checked in step 1 will prompt for details here.</p>
                </div>
              )}
            </div>

            {totalAssets > 0 && (
              <button
                onClick={() => setIsAssetSectionOpen(!isAssetSectionOpen)}
                className={`mt-6 w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isAssetSectionOpen
                  ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-inner'
                  : 'bg-purple-600 text-white shadow-lg shadow-purple-200 hover:bg-purple-700'
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
          <div className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-white shadow-xl overflow-hidden animate-in slide-in-from-top-4 duration-500">
            <div className="bg-gradient-to-r from-[#9033e7] to-[#2563eb] p-4 flex items-center justify-center text-white">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black uppercase tracking-tighter">Manage Asset Specifications</h2>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Mutual Funds Section */}
              <div className={activeMfs.length === 0 ? 'opacity-20' : ''}>
                <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-1">
                  <Database size={16} className="text-purple-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Mutual Funds</h3>
                </div>
                <div className="space-y-3">
                  {activeMfs.length > 0 ? activeMfs.map(asset => (
                    <AssetCard
                      key={asset.ticker}
                      asset={asset}
                      lagStatus={lagStatus}
                      onEditSector={() => { setSelectedTickerForSector(asset.ticker); setIsSectorModalOpen(true); }}
                      onAssetGeoChange={(geo) => handleSaveAssetGeo(asset.ticker, geo)}
                      onUploadNav={handleNavUpload}
                    />
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                      <p className="text-slate-300 text-sm font-bold uppercase tracking-widest">No MFs Active</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ETFs Section */}
              <div className={activeEtfs.length === 0 ? 'opacity-20' : ''}>
                <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-1">
                  <Layers size={16} className="text-blue-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">ETFs</h3>
                </div>
                <div className="space-y-3">
                  {activeEtfs.length > 0 ? activeEtfs.map(asset => (
                    <AssetCard
                      key={asset.ticker}
                      asset={asset}
                      lagStatus={lagStatus}
                      onEditSector={() => { setSelectedTickerForSector(asset.ticker); setIsSectorModalOpen(true); }}
                      onAssetGeoChange={(geo) => handleSaveAssetGeo(asset.ticker, geo)}
                      onUploadNav={handleNavUpload}
                    />
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                      <p className="text-slate-300 text-sm font-bold uppercase tracking-widest">No ETFs Active</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
    <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4 flex flex-col gap-3 hover:border-purple-300 hover:bg-white transition-all group shadow-sm hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${asset.isEtf ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}`}>
            {asset.isEtf ? <Layers size={16} /> : <Database size={16} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-slate-800">{asset.ticker}</h4>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                {asset.isComplete ? <CheckCircle2 size={12} className="text-green-500" /> : <AlertTriangle size={12} className="text-amber-500" />}
                <span className="text-xs font-medium text-slate-500">{asset.isComplete ? 'Sectors Defined' : 'Sectors Missing'}</span>
              </div>
              {asset.isMutualFund && (
                <div className="flex items-center gap-1">
                  {isLagging ? <AlertTriangle size={12} className="text-amber-500" /> : <CheckCircle2 size={12} className="text-green-500" />}
                  <span className="text-xs font-medium text-slate-500">{isLagging ? 'Lagging' : 'Optimal'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100/50 rounded-lg p-1 border border-slate-200">
            {geoTypes.map(g => (
              <button
                key={g}
                onClick={() => onAssetGeoChange(g)}
                className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${asset.geo === g
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                  : 'text-slate-400 hover:text-slate-600'
                  }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button
            onClick={onEditSector}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg hover:-translate-y-0.5 ${asset.isEtf
              ? 'bg-[#2563eb] text-white shadow-blue-100 hover:bg-[#1d4ed8]'
              : 'bg-purple-600 text-white shadow-purple-100 hover:bg-purple-700'
              }`}
          >
            <PieChart size={16} /> {asset.isComplete ? 'Configure' : 'Configure'}
          </button>
        </div>
      </div>

      {asset.isMutualFund && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-all ${isLagging ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isLagging ? 'bg-amber-200 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
              <RefreshCw size={12} className={isLagging ? 'animate-pulse' : ''} />
            </div>
            <div>
              <p className={`text-xs font-bold leading-tight ${isLagging ? 'text-amber-800' : 'text-slate-700'}`}>
                {isLagging ? 'Update Required' : 'NAV is Current'}
              </p>
              {status && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Last: <span className="font-mono font-bold text-slate-700">{status.last_nav || 'N/A'}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  Mkt: <span className="font-mono font-bold text-slate-700">{status.last_market}</span>
                </p>
              )}
            </div>
          </div>

          <label className={`cursor-pointer group/upload px-3 py-2 rounded-lg border shadow-sm transition-all flex items-center gap-1.5 ${isLagging ? 'bg-white border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
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
