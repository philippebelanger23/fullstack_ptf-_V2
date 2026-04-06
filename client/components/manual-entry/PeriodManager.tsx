import React from 'react';
import { X, Calendar, Plus } from 'lucide-react';
import { AllocationPeriod, TickerRow } from './useManualEntryState';

export interface PeriodManagerProps {
    filteredPeriods: AllocationPeriod[];
    periods: AllocationPeriod[];
    displayTickers: TickerRow[];
    handleRemovePeriod: (id: string) => void;
    handleDateChange: (id: string, field: 'startDate' | 'endDate', val: string) => void;
    handleWeightChange: (periodId: string, ticker: string, val: string) => void;
    handleWeightBlur: (periodId: string, ticker: string, val: string) => void;
    calculateTotal: (period: AllocationPeriod) => number;
    handleAddPeriod: () => void;
}

export const PeriodManager: React.FC<PeriodManagerProps> = ({
    filteredPeriods,
    periods,
    displayTickers,
    handleRemovePeriod,
    handleDateChange,
    handleWeightChange,
    handleWeightBlur,
    calculateTotal,
    handleAddPeriod,
}) => {
    return (
        <div className="flex-1 flex gap-4 pl-4">
            {filteredPeriods.map((period) => {
                const total = calculateTotal(period);
                const isTotalValid = Math.abs(total - 100) < 0.1;

                // Fallback to original periods for comparison
                const originalIdx = periods.findIndex(p => p.id === period.id);

                // Determine display dates
                // For the endDate display, we look at the 'next' period in original periods if it exists
                const nextInOriginal = originalIdx < periods.length - 1 ? periods[originalIdx + 1] : null;

                return (
                    <div key={period.id} className="w-64 bg-wallstreet-800 border border-wallstreet-700 rounded-xl shadow-sm flex flex-col flex-shrink-0">
                        {/* Header - Fixed Height 120px */}
                        <div className="h-[120px] p-4 border-b border-wallstreet-700 bg-wallstreet-900 rounded-t-xl flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-wallstreet-500 uppercase tracking-wider">Period {originalIdx + 1}</h4>
                                {periods.length > 1 && (
                                    <button onClick={() => handleRemovePeriod(period.id)} className="text-wallstreet-500 hover:text-red-500 transition-colors">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center gap-2 bg-wallstreet-800 border border-wallstreet-700 rounded-md px-2 py-1.5 shadow-sm">
                                    <Calendar size={12} className="text-wallstreet-500 flex-shrink-0" />
                                    <input
                                        type="date"
                                        value={period.startDate}
                                        onChange={(e) => handleDateChange(period.id, 'startDate', e.target.value)}
                                        className="w-full text-xs font-semibold text-wallstreet-text focus:outline-none bg-transparent"
                                    />
                                </div>
                                <div className="text-[10px] text-center font-medium text-wallstreet-500">
                                    to {nextInOriginal ? nextInOriginal.startDate : <span className="text-wallstreet-500 font-bold">Present</span>}
                                </div>
                            </div>

                            <div className={`text-center py-1 rounded text-xs font-bold border ${isTotalValid ? 'bg-green-100 text-green-800 border-green-700 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700' : 'bg-amber-100 text-amber-700 border-amber-600 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700'}`}>
                                Allocated: {total.toFixed(2)}%
                            </div>
                        </div>

                        {/* Weights */}
                        <div>
                            {displayTickers.map(t => {
                                const currentWeight = parseFloat(period.weights[t.ticker] || '0');
                                const prevWeight = originalIdx > 0 ? parseFloat(periods[originalIdx - 1].weights[t.ticker] || '0') : currentWeight;
                                const isZeroWeight = Math.abs(currentWeight) < 0.0001;

                                let bgClass = "bg-wallstreet-700 hover:bg-wallstreet-600";
                                let textClass = "text-wallstreet-text";
                                let borderClass = "border-wallstreet-600";

                                if (originalIdx > 0) {
                                    if (currentWeight > prevWeight + 0.001) {
                                        bgClass = "bg-green-100 hover:bg-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/40";
                                        textClass = "text-green-700 dark:text-green-400";
                                        borderClass = "border-green-700 dark:border-green-700";
                                    } else if (currentWeight < prevWeight - 0.001) {
                                        bgClass = "bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40";
                                        textClass = "text-red-600 dark:text-red-400";
                                        borderClass = "border-red-600 dark:border-red-700";
                                    }
                                }

                                if (isZeroWeight) {
                                    textClass = "text-gray-400 placeholder:text-gray-400 dark:text-gray-400 dark:placeholder:text-gray-400";
                                }

                                return (
                                    <div key={`${period.id}-${t.ticker}`} className="h-11 flex items-center justify-center px-2">
                                        <div className="relative w-full">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={period.weights[t.ticker] || ''}
                                                onChange={(e) => handleWeightChange(period.id, t.ticker, e.target.value)}
                                                onBlur={(e) => handleWeightBlur(period.id, t.ticker, e.target.value)}
                                                className={`w-full text-right pr-5 pl-2 py-1.5 text-sm ${bgClass} ${textClass} border ${borderClass} rounded-lg font-mono font-medium focus:ring-1 focus:ring-blue-400 focus:outline-none transition-colors`}
                                                placeholder="0.00"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-wallstreet-500 text-[10px] font-bold">%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* New Allocation Button */}
            <div className="pt-4 flex-shrink-0">
                <button
                    onClick={handleAddPeriod}
                    className="flex items-center gap-2 px-4 py-2 bg-wallstreet-900 hover:bg-wallstreet-900 text-wallstreet-500 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap"
                >
                    <Plus size={16} /> New Allocation
                </button>
            </div>
        </div>
    );
};
