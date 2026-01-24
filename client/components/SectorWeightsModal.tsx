import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, PieChart } from 'lucide-react';

interface SectorWeightsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (ticker: string, weights: Record<string, number>) => void;
    ticker: string;
    initialWeights?: Record<string, number>;
}

const GICS_SECTORS = [
    'Materials',
    'Consumer Discretionary',
    'Financials',
    'Real Estate',
    'Communication Services',
    'Energy',
    'Industrials',
    'Technology',
    'Consumer Staples',
    'Health Care',
    'Utilities'
];

export const SectorWeightsModal: React.FC<SectorWeightsModalProps> = ({ isOpen, onClose, onSave, ticker, initialWeights }) => {
    const [weights, setWeights] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            const normalized: Record<string, string> = {};
            GICS_SECTORS.forEach(s => {
                normalized[s] = initialWeights?.[s]?.toString() || '0';
            });
            setWeights(normalized);
        }
    }, [isOpen, initialWeights]);

    if (!isOpen) return null;

    const total = Object.values(weights).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const isTotalValid = Math.abs(total - 100) < 0.01;

    const handleWeightChange = (sector: string, value: string) => {
        // Only allow numbers and decimal point
        if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
        setWeights(prev => ({ ...prev, [sector]: value }));
    };

    const handleSave = () => {
        if (!isTotalValid) return;

        const numericWeights: Record<string, number> = {};
        Object.entries(weights).forEach(([s, v]) => {
            const num = parseFloat(v);
            if (num > 0) numericWeights[s] = num;
        });

        onSave(ticker, numericWeights);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                            <PieChart size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Sector Weights: {ticker}</h2>
                            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Breakdown must sum to 100%</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-md rounded-full transition-all group">
                        <X size={20} className="text-slate-400 group-hover:text-slate-600" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto custom-scrollbar">
                    <div className="space-y-3">
                        {GICS_SECTORS.map(sector => (
                            <div key={sector} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-transparent hover:border-slate-200 hover:bg-white transition-all group">
                                <label className="text-sm font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">
                                    {sector}
                                </label>
                                <div className="relative group/input">
                                    <input
                                        type="text"
                                        value={weights[sector] || ''}
                                        onChange={(e) => handleWeightChange(sector, e.target.value)}
                                        className="w-28 pr-8 pl-3 py-2 bg-white border border-slate-200 rounded-lg text-right font-mono text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                        placeholder="0.00"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 group-focus-within/input:text-blue-500 transition-colors">
                                        %
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-slate-50/50 flex flex-col gap-4">
                    <div className={`p-4 rounded-xl flex items-center justify-between shadow-inner ${isTotalValid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        <div className="flex items-center gap-2">
                            {isTotalValid ? <Save size={18} /> : <AlertCircle size={18} />}
                            <span className="font-bold">Total Allocation</span>
                        </div>
                        <span className={`text-xl font-mono font-bold ${isTotalValid ? 'text-green-600' : 'text-amber-600'}`}>
                            {total.toFixed(2)}%
                        </span>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!isTotalValid}
                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isTotalValid
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                            }`}
                    >
                        <Save size={18} /> Save Sector Breakdown
                    </button>
                </div>
            </div>
        </div>
    );
};
