import React from 'react';
import { X, Save, Loader2, CheckCircle } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { PortfolioItem } from '../../types';
import { useManualEntryState } from './useManualEntryState';
import { AllocationGrid } from './AllocationGrid';

interface ManualEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: PortfolioItem[]) => void;
    existingData?: PortfolioItem[];
    selectedYear: 2025 | 2026;
    setSelectedYear: (year: 2025 | 2026) => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    existingData,
    selectedYear,
    setSelectedYear,
}) => {
    const {
        tickers,
        periods,
        isInitialLoading,
        isSaving,
        savedSuccess,
        newTickerInput,
        setNewTickerInput,
        filteredPeriods,
        displayTickers,
        handleAddTicker,
        handleRemoveTicker,
        handleToggleMutualFund,
        handleToggleEtf,
        handleWeightChange,
        handleWeightBlur,
        handleAddPeriod,
        handleRemovePeriod,
        handleDateChange,
        calculateTotal,
        handleSubmit,
    } = useManualEntryState(isOpen, existingData, selectedYear, onSubmit, onClose);

    if (!isOpen) return null;

    if (isInitialLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-2xl p-12 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-600 font-semibold text-lg">Loading portfolio configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-[95vw] h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div className="flex items-center gap-8">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Portfolio Editor</h2>
                            <p className="text-slate-500 text-sm">Manually configure weights and rebalancing periods.</p>
                        </div>

                        {/* Year Selector in Editor Header */}
                        <Dropdown
                            labelPrefix="Year"
                            value={selectedYear}
                            onChange={(val) => setSelectedYear(Number(val) as 2025 | 2026)}
                            options={[
                                { value: 2025, label: 2025 },
                                { value: 2026, label: 2026 }
                            ]}
                        />
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                {/* Content - Shared scroll container for vertical and horizontal scrolling */}
                <AllocationGrid
                    displayTickers={displayTickers}
                    newTickerInput={newTickerInput}
                    setNewTickerInput={setNewTickerInput}
                    handleAddTicker={handleAddTicker}
                    handleRemoveTicker={handleRemoveTicker}
                    handleToggleMutualFund={handleToggleMutualFund}
                    handleToggleEtf={handleToggleEtf}
                    filteredPeriods={filteredPeriods}
                    periods={periods}
                    handleRemovePeriod={handleRemovePeriod}
                    handleDateChange={handleDateChange}
                    handleWeightChange={handleWeightChange}
                    handleWeightBlur={handleWeightBlur}
                    calculateTotal={calculateTotal}
                    handleAddPeriod={handleAddPeriod}
                />

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-xl">
                    <div className="text-sm text-slate-500">
                        <span className="font-bold text-slate-700">{tickers.length}</span> tickers across <span className="font-bold text-slate-700">{periods.length}</span> rebalancing periods.
                    </div>
                    <div className="flex gap-4 items-center">
                        {isSaving ? (
                            <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 text-blue-700 rounded-lg font-semibold animate-pulse">
                                <Loader2 size={18} className="animate-spin" />
                                <span>Saving Configuration...</span>
                            </div>
                        ) : savedSuccess ? (
                            <div className="flex items-center gap-3 px-6 py-2.5 bg-green-50 text-green-700 rounded-lg font-bold border border-green-200 animate-in fade-in slide-in-from-bottom-2">
                                <CheckCircle size={18} />
                                <span>Changes have been saved</span>
                            </div>
                        ) : (
                            <>
                                <button onClick={onClose} className="px-6 py-2.5 rounded-lg text-slate-600 font-semibold hover:bg-slate-200 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
                                >
                                    <Save size={18} /> Save Configuration
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
