import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Trash2, Database, Edit, FileSpreadsheet } from 'lucide-react';
import { PortfolioItem } from '../types';
import { analyzeManualPortfolio } from '../services/api';
import { ManualEntryModal } from '../components/ManualEntryModal';

interface UploadViewProps {
  onDataLoaded: (data: PortfolioItem[], fileInfo?: { name: string, count: number }, files?: { weightsFile: File | null, navFile: File | null }) => void;
  onProceed: () => void;
  currentData: PortfolioItem[];
  fileHistory?: { name: string, count: number }[];
  selectedYear: 2025 | 2026;
  setSelectedYear: (year: 2025 | 2026) => void;
}

export const UploadView: React.FC<UploadViewProps> = ({ onDataLoaded, onProceed, currentData, selectedYear, setSelectedYear }) => {
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual Entry State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const handleManualSubmit = async (items: PortfolioItem[]) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const results = await analyzeManualPortfolio(items);
      // Replace entirely - only most recent manual entry populates the app
      onDataLoaded(results, { name: "Manual Entry", count: results.length });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Manual analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };





  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 -z-10" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-blue-100/40 to-transparent rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-indigo-100/30 to-transparent rounded-full blur-3xl -z-10" />

      <div className="max-w-xl w-full">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-wallstreet-accent to-blue-600 rounded-2xl shadow-lg shadow-blue-200/50 mb-6">
            <Database size={28} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-wallstreet-text tracking-tight mb-3">
            Portfolio Deep Dive
          </h1>
          <p className="text-wallstreet-500 text-lg">
            Configure and analyze your investment portfolio
          </p>

        </div>

        {/* Manual Entry Card - Glassmorphism */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 shadow-xl shadow-slate-200/50 p-8 mb-8 hover:shadow-2xl hover:shadow-slate-300/50 transition-all duration-300">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shadow-lg">
              <Edit size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-wallstreet-text">Manual Entry</h3>
              <p className="text-sm text-wallstreet-400">Type in weights & allocation periods</p>
            </div>
          </div>

          <p className="text-sm text-wallstreet-500 mb-6 leading-relaxed">
            Configure tickers, weights, and rebalancing dates using the spreadsheet-style editor.
          </p>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="w-full py-3.5 bg-gradient-to-r from-wallstreet-accent to-blue-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-200/50 hover:shadow-blue-300/60 hover:-translate-y-0.5"
          >
            <Edit size={18} /> Open Editor
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Success Panel */}
        {currentData.length > 0 && (
          <div className="bg-gradient-to-br from-emerald-50 to-green-50/80 backdrop-blur rounded-2xl border border-green-200 shadow-lg p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
                  <Database size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-800">Ready to Analyze</h3>
                  <p className="text-sm text-green-600 font-medium">{currentData.length} records loaded</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => onDataLoaded([])}
                  className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Clear Data"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={onProceed}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-200 flex items-center gap-2 shadow-lg shadow-green-200/50 hover:shadow-green-300/60 hover:-translate-y-0.5"
                >
                  Proceed <ArrowRight size={18} />
                </button>
              </div>
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
    </div>
  );
};

