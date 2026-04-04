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
    selectedYear: number;
    setSelectedYear: (year: number) => void;
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
        availableYears,
        filteredPeriods,
        displayTickers,
        handleAddTicker,
        handleRemoveTicker,
        handleToggleMutualFund,
        handleToggleEtf,
        handleToggleCash,
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
                <div className="bg-wallstreet-800 rounded-xl shadow-2xl p-12 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-wallstreet-500 font-semibold text-lg">Loading portfolio configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-wallstreet-800 rounded-xl shadow-2xl w-[95vw] h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-wallstreet-700">
                    <div className="flex items-center gap-8">
                        <div>
                            <h2 className="text-2xl font-bold text-wallstreet-text">Portfolio Editor</h2>
                            <p className="text-wallstreet-500 text-sm">Manually configure weights and rebalancing periods.</p>
                        </div>

                        {/* Year Selector in Editor Header */}
                        <Dropdown
                            labelPrefix="Year"
                            value={selectedYear}
                            onChange={(val) => setSelectedYear(Number(val))}
                            options={availableYears.map((year) => ({ value: year, label: year }))}
                        />
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-wallstreet-900 rounded-full transition-colors">
                        <X size={24} className="text-wallstreet-500" />
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
                    handleToggleCash={handleToggleCash}
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
                <div className="p-6 border-t border-wallstreet-700 flex justify-between items-center bg-wallstreet-900 rounded-b-xl">
                    <div className="text-sm text-wallstreet-500">
                        <span className="font-bold text-wallstreet-text">{tickers.length}</span> tickers across <span className="font-bold text-wallstreet-text">{periods.length}</span> rebalancing periods.
                    </div>
                    <div className="flex gap-4 items-center">
                        {isSaving ? (
                            <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-900/40 text-blue-300 rounded-lg font-semibold animate-pulse">
                                <Loader2 size={18} className="animate-spin" />
                                <span>Saving Configuration...</span>
                            </div>
                        ) : savedSuccess ? (
                            <div className="flex items-center gap-3 px-6 py-2.5 bg-green-900/40 text-green-400 rounded-lg font-bold border border-green-700 animate-in fade-in slide-in-from-bottom-2">
                                <CheckCircle size={18} />
                                <span>Changes have been saved</span>
                            </div>
                        ) : (
                            <>
                                <button onClick={onClose} className="px-6 py-2.5 rounded-lg text-wallstreet-500 font-semibold hover:bg-wallstreet-900 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-900/30 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
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
