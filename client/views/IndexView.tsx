import React, { useState, useEffect, useMemo } from 'react';
import { Globe, DollarSign, TrendingUp, PieChart } from 'lucide-react';
import { fetchIndexExposure, fetchCurrencyPerformance, fetchIndexHistory } from '../services/api';
import { CountryTreemap } from '../components/CountryTreemap';
import { ClevelandDotPlot } from '../components/ClevelandDotPlot';
import { IndexPerformanceChart } from '../components/IndexPerformanceChart';

// --- Types ---
interface SectorExposure {
    sector: string;
    ACWI: number;
    TSX: number;
    Index: number;
}

interface GeoExposure {
    region: string;
    weight: number;
}

interface IndexExposureData {
    sectors: SectorExposure[];
    geography: GeoExposure[];
    raw?: Record<string, any>;
    last_scraped?: string;
}

interface CurrencyWeight {
    code: string;
    weight: number;
}

// --- Constants ---
const CURRENCY_TICKERS = ["USDCAD=X", "JPYCAD=X", "EURCAD=X"];

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
    'United States': 'USD',
    'Canada': 'CAD',
    'Japan': 'JPY',
    'United Kingdom': 'GBP',
    'France': 'EUR',
    'Germany': 'EUR',
    'Netherlands': 'EUR',
    'Switzerland': 'CHF',
    'Australia': 'AUD',
    'China': 'CNY',
    'Taiwan': 'TWD',
    'India': 'INR',
};

const CURRENCY_CODE_TO_TICKER: Record<string, string> = {
    'USD': 'USDCAD=X',
    'JPY': 'JPYCAD=X',
    'EUR': 'EURCAD=X',
    'CAD': 'CAD',
};

const formatPerf = (val: number | undefined) => {
    if (val === undefined) return '-';
    const color = val > 0 ? 'text-green-600' : val < 0 ? 'text-red-500' : 'text-slate-400';
    const pct = val * 100;
    const display = pct < 0 ? `(${Math.abs(pct).toFixed(1)}%)` : `${pct.toFixed(1)}%`;
    return <span className={color}>{display}</span>;
};

/** Format "YYYY-MM-DD" → "DD / MM / YYYY" */
const formatDateDMY = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${d} / ${m} / ${y}`;
    }
    return dateStr;
};

export const IndexView: React.FC = () => {
    const [exposure, setExposure] = useState<IndexExposureData>({ sectors: [], geography: [] });
    const [currencyPerf, setCurrencyPerf] = useState<Record<string, Record<string, number>>>({});
    const [indexHistory, setIndexHistory] = useState<Record<string, { date: string, value: number }[]>>({});
    const [loading, setLoading] = useState(true);
    const [loadProgress, setLoadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({
        exposure: 'pending',
        currency: 'pending',
        history: 'pending',
    });

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setLoadProgress({ exposure: 'pending', currency: 'pending', history: 'pending' });

            const trackFetch = async <T,>(
                key: string,
                fn: () => Promise<T>,
            ): Promise<T> => {
                try {
                    const result = await fn();
                    setLoadProgress(prev => ({ ...prev, [key]: 'done' }));
                    return result;
                } catch (err) {
                    setLoadProgress(prev => ({ ...prev, [key]: 'error' }));
                    throw err;
                }
            };

            try {
                const [res, perf, history] = await Promise.all([
                    trackFetch('exposure', fetchIndexExposure),
                    trackFetch('currency', () => fetchCurrencyPerformance(CURRENCY_TICKERS)),
                    trackFetch('history', fetchIndexHistory),
                ]);

                setExposure(res);
                setCurrencyPerf(perf);
                setIndexHistory(history);
            } catch (err) {
                console.error("Failed to load index data:", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);



    // Calculate currency exposure from geography data
    const currencyExposure = useMemo((): CurrencyWeight[] => {
        if (exposure.geography.length === 0) return [];

        const totals: Record<string, number> = {};
        exposure.geography.forEach(g => {
            const curr = COUNTRY_CURRENCY_MAP[g.region] || 'Other';
            totals[curr] = (totals[curr] || 0) + g.weight;
        });

        const sorted = Object.entries(totals)
            .map(([code, weight]) => ({ code, weight }))
            .sort((a, b) => b.weight - a.weight);

        const topCurrencies = sorted.filter(c => c.code !== 'Other').slice(0, 4);
        const otherWeight = sorted
            .filter(c => c.code === 'Other' || !topCurrencies.includes(c))
            .reduce((sum, c) => sum + c.weight, 0);

        if (otherWeight > 0.01) {
            topCurrencies.push({ code: 'Other', weight: otherWeight });
        }

        return topCurrencies;
    }, [exposure.geography]);

    // Normalized currency rows with "Other" absorbing rounding gaps
    const currencyRows = useMemo((): CurrencyWeight[] => {
        const totalCurrency = currencyExposure.reduce((sum, c) => sum + c.weight, 0);
        const rows = [...currencyExposure];

        if (totalCurrency < 99.9) {
            const diff = 100 - totalCurrency;
            const otherIndex = rows.findIndex(c => c.code === 'Other');
            if (otherIndex >= 0) {
                rows[otherIndex] = { ...rows[otherIndex], weight: rows[otherIndex].weight + diff };
            } else {
                rows.push({ code: 'Other', weight: diff });
            }
        }
        return rows;
    }, [currencyExposure]);

    // Treemap data: top 9 countries + Others bucket
    const treemapData = useMemo(() => {
        const data = exposure.geography
            .map(g => ({ name: g.region, value: g.weight }))
            .sort((a, b) => b.value - a.value);

        const top9 = data.slice(0, 9);
        const others = data.slice(9);

        let othersVal = others.reduce((sum, item) => sum + item.value, 0);
        const top9Total = top9.reduce((sum, item) => sum + item.value, 0);

        if (top9Total + othersVal < 99.9) {
            othersVal += (100 - (top9Total + othersVal));
        }

        if (othersVal > 0.01) {
            top9.push({ name: 'Others', value: othersVal });
        }

        return top9;
    }, [exposure.geography]);

    if (loading) {
        const steps = [
            { key: 'exposure', label: 'Index Composition', sub: 'Sectors & geography from iShares' },
            { key: 'currency', label: 'Currency Rates', sub: 'FX performance vs CAD' },
            { key: 'history', label: 'Price History', sub: 'ACWI, XIU.TO & composite index' },
        ];
        const doneCount = Object.values(loadProgress).filter(s => s === 'done').length;

        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
                <div className="flex flex-col items-center gap-8 w-full max-w-sm">

                    {/* Animated bars */}
                    <div className="flex items-end gap-1.5 h-12">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                className="w-2 bg-wallstreet-accent rounded-t"
                                style={{
                                    animation: `barPulse 1s ease-in-out ${i * 0.15}s infinite`,
                                    height: '30%',
                                }}
                            />
                        ))}
                    </div>

                    <p className="text-sm font-mono text-wallstreet-500 tracking-wide uppercase">
                        Fetching Index Data
                    </p>

                    {/* Progress bar */}
                    <div className="w-full bg-wallstreet-100 rounded-full h-1.5 overflow-hidden">
                        <div
                            className="bg-wallstreet-accent h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(doneCount / steps.length) * 100}%` }}
                        />
                    </div>

                    {/* Step checklist */}
                    <div className="w-full space-y-3">
                        {steps.map(({ key, label, sub }) => {
                            const status = loadProgress[key];
                            return (
                                <div key={key} className="flex items-center gap-3">
                                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                        {status === 'done' ? (
                                            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : status === 'error' ? (
                                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        ) : (
                                            <div className="w-3.5 h-3.5 border-2 border-wallstreet-300 border-t-wallstreet-accent rounded-full animate-spin" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`text-sm font-mono font-medium ${status === 'done' ? 'text-wallstreet-text' : status === 'error' ? 'text-red-500' : 'text-wallstreet-400'}`}>
                                            {label}
                                        </p>
                                        <p className="text-xs text-wallstreet-400 truncate">{sub}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
                <style>{`
                    @keyframes barPulse {
                        0%, 100% { height: 30%; opacity: 0.4; }
                        50% { height: 100%; opacity: 1; }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[100vw] mx-auto p-6 space-y-8 animate-in fade-in duration-500 pb-20 overflow-x-hidden">

            <div className="border-b border-wallstreet-700 pb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold font-mono text-wallstreet-text flex items-center gap-3"><Globe className="text-wallstreet-accent" /> Global 75/25 Index</h2>
                        <p className="text-wallstreet-500 mt-2 max-w-2xl">A custom synthetic benchmark. <span className="font-bold text-wallstreet-text ml-2">75% ACWI (USD) + 25% XIU.TO (CAD)</span></p>
                    </div>
                    {exposure.last_scraped && (
                        <div className="text-red-500 font-mono font-bold text-sm flex-shrink-0 ml-4 mt-1">
                            last updated : {formatDateDMY(exposure.last_scraped)}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Top Left: Index Performance Graph */}
                <div className="bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full min-h-[600px]">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                            <TrendingUp size={20} className="text-wallstreet-accent" />
                            Index Performance
                        </h3>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                        <IndexPerformanceChart data={indexHistory} />
                    </div>
                </div>

                {/* Top Right: Sector Exposure */}
                <div className="bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full min-h-[600px]">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                            <PieChart size={20} className="text-wallstreet-accent" />
                            Sector Exposure
                        </h3>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                        <ClevelandDotPlot data={exposure.sectors} />
                    </div>
                </div>

                {/* Bottom Left: Currency Exposure */}
                <div className="bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full min-h-[600px]">
                    <div className="mb-4 flex justify-between items-center border-b border-wallstreet-100 pb-2">
                        <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                            <DollarSign size={20} className="text-wallstreet-accent" />
                            Currency Exposure
                        </h3>
                    </div>

                    <div className="flex-1">
                        <div className="flex flex-col h-full">
                            <div className="mb-2">
                                <p className="text-xs text-wallstreet-400">Derived from geographic allocation.</p>
                            </div>
                            <table className="w-full text-sm font-mono table-fixed">
                                <thead className="bg-wallstreet-50 text-wallstreet-500 text-xs uppercase">
                                    <tr>
                                        <th className="p-2 text-left w-[15%]">Curr</th>
                                        <th className="p-2 text-center w-[25%]">Exp</th>
                                        <th className="p-2 text-center text-xs text-wallstreet-400 w-[15%]">YTD</th>
                                        <th className="p-2 text-center text-xs text-wallstreet-400 w-[15%]">3M</th>
                                        <th className="p-2 text-center text-xs text-wallstreet-400 w-[15%]">6M</th>
                                        <th className="p-2 text-center text-xs text-wallstreet-400 w-[15%]">1Y</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currencyRows.map((c) => {
                                        const ticker = CURRENCY_CODE_TO_TICKER[c.code] || '';
                                        let perf = currencyPerf[ticker] || {};
                                        if (ticker === 'CAD') {
                                            perf = { YTD: 0, '1Y': 0, '6M': 0, '3M': 0 };
                                        }

                                        return (
                                            <tr key={c.code} className={`border-b border-wallstreet-100 hover:bg-wallstreet-50 ${c.code === 'Other' ? 'text-slate-400' : ''}`}>
                                                <td className="py-1.5 px-2 font-medium">{c.code}</td>
                                                <td className={`py-1.5 px-2 text-center ${c.code === 'Other' ? 'font-normal' : `font-bold ${c.code === 'USD' ? 'text-blue-700' : c.code === 'CAD' ? 'text-red-700' : 'text-slate-700'}`}`}>
                                                    {c.weight.toFixed(1)}%
                                                </td>
                                                {c.code !== 'Other' ? (
                                                    <>
                                                        <td className="py-1.5 px-2 text-center">{formatPerf(perf.YTD)}</td>
                                                        <td className="py-1.5 px-2 text-center">{formatPerf(perf['3M'])}</td>
                                                        <td className="py-1.5 px-2 text-center">{formatPerf(perf['6M'])}</td>
                                                        <td className="py-1.5 px-2 text-center">{formatPerf(perf['1Y'])}</td>
                                                    </>
                                                ) : (
                                                    <td colSpan={4} className="py-1.5 px-2 text-center text-slate-300">-</td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Bottom Right: Geographic Breakdown */}
                <div className="bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full min-h-[600px]">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                            <Globe size={20} className="text-wallstreet-accent" />
                            Geographic Breakdown
                        </h3>
                    </div>
                    <div className="flex-1 w-full relative min-h-0">
                        <CountryTreemap data={treemapData} />
                    </div>
                </div>

            </div>
        </div>
    );
};