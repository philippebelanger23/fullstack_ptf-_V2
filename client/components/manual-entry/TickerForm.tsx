import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TickerRow } from './useManualEntryState';

export interface TickerFormProps {
    displayTickers: TickerRow[];
    newTickerInput: string;
    setNewTickerInput: React.Dispatch<React.SetStateAction<string>>;
    handleAddTicker: () => void;
    handleRemoveTicker: (ticker: string) => void;
    handleToggleMutualFund: (ticker: string) => void;
    handleToggleEtf: (ticker: string) => void;
    handleToggleCash: (ticker: string) => void;
}

export const TickerForm: React.FC<TickerFormProps> = ({
    displayTickers,
    newTickerInput,
    setNewTickerInput,
    handleAddTicker,
    handleRemoveTicker,
    handleToggleMutualFund,
    handleToggleEtf,
    handleToggleCash,
}) => {
    return (
        <div className="w-72 flex-shrink-0 bg-wallstreet-800 border-r border-wallstreet-700 sticky left-0 z-10 flex flex-col shadow-[4px_0_24px_-4px_rgba(0,0,0,0.1)] clip-r">
            {/* Header matching the 120px height of period headers */}
            <div className="h-[120px] px-3 py-4 border-b border-wallstreet-700 bg-wallstreet-900 flex items-end pb-2">
                <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-wallstreet-500 uppercase tracking-wider">Ticker</span>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-wider w-8 text-center text-purple-600" title="Mutual Fund">MF</span>
                        <span className="text-xs font-bold uppercase tracking-wider w-8 text-center text-blue-600" title="ETF">ETF</span>
                        <span className="text-xs font-bold uppercase tracking-wider w-8 text-center text-green-600" title="Cash Equivalent">Cash</span>
                        {/* Spacer matching the delete button width so headers align with checkboxes */}
                        <div className="w-[22px] flex-shrink-0" />
                    </div>
                </div>
            </div>

            {displayTickers.map((t) => (
                <div key={t.ticker} className="h-11 flex items-center justify-between group hover:bg-wallstreet-900/50 px-3 border-b border-gray-50/50">
                    <div className="flex items-center justify-between w-full mr-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className={`text-sm font-semibold truncate ${t.isMutualFund ? 'text-purple-700' : t.isEtf ? 'text-blue-700' : t.isCash ? 'text-green-700' : 'text-wallstreet-text'}`}>
                                {t.ticker}
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* MF Checkbox */}
                            <div className="w-8 flex justify-center">
                                <input
                                    type="checkbox"
                                    checked={t.isMutualFund || false}
                                    onChange={() => handleToggleMutualFund(t.ticker)}
                                    title="Mutual Fund"
                                    className="w-4 h-4 accent-purple-600 cursor-pointer rounded-sm"
                                />
                            </div>

                            {/* ETF Checkbox */}
                            <div className="w-8 flex justify-center">
                                <input
                                    type="checkbox"
                                    checked={t.isEtf || false}
                                    onChange={() => handleToggleEtf(t.ticker)}
                                    title="ETF"
                                    className="w-4 h-4 accent-blue-600 cursor-pointer rounded-sm"
                                />
                            </div>

                            {/* Cash Checkbox */}
                            <div className="w-8 flex justify-center">
                                <input
                                    type="checkbox"
                                    checked={t.isCash || false}
                                    onChange={() => handleToggleCash(t.ticker)}
                                    title="Cash Equivalent"
                                    className="w-4 h-4 accent-green-600 cursor-pointer rounded-sm"
                                />
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => handleRemoveTicker(t.ticker)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 rounded transition-all flex-shrink-0"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}

            {/* Add Ticker Input */}
            <div className="h-11 flex items-center px-3 mt-1">
                <div className="flex items-center gap-1.5 w-full">
                    <input
                        type="text"
                        value={newTickerInput}
                        onChange={(e) => setNewTickerInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                        placeholder="+ Add ticker"
                        className="bg-wallstreet-900 border border-wallstreet-700 rounded-lg px-2.5 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 uppercase font-semibold text-wallstreet-500 placeholder:font-normal placeholder:normal-case placeholder:text-wallstreet-500"
                    />
                    {newTickerInput && (
                        <button onClick={handleAddTicker} className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 flex-shrink-0">
                            <Plus size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
