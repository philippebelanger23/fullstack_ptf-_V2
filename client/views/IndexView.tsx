import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Globe, DollarSign, Map as MapIcon, Zap, TrendingUp, Layers, PieChart } from 'lucide-react';
import { fetchIndexExposure, fetchCurrencyPerformance, fetchIndexHistory } from '../services/api';
import { CountryTreemap } from '../components/CountryTreemap';
import { ClevelandDotPlot } from '../components/ClevelandDotPlot';
import { IndexPerformanceChart } from '../components/IndexPerformanceChart';

export const IndexView: React.FC = () => {
    const [exposure, setExposure] = useState<{ sectors: any[], geography: any[], raw?: any, last_scraped?: string }>({ sectors: [], geography: [] });
    const [currencyPerf, setCurrencyPerf] = useState<Record<string, Record<string, number>>>({});
    const [indexHistory, setIndexHistory] = useState<Record<string, { date: string, value: number }[]>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'regional' | 'currency'>('regional');
    const [lastUpdated, setLastUpdated] = useState<string>('');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const res = await fetchIndexExposure();
            setExposure(res);

            // Fetch currency performance
            const perf = await fetchCurrencyPerformance(["USDCAD=X", "JPYCAD=X", "EURCAD=X"]);
            setCurrencyPerf(perf);

            // Fetch index history
            const history = await fetchIndexHistory();
            setIndexHistory(history);

            if (history["ACWI"] && history["ACWI"].length > 0) {
                const lastPoint = history["ACWI"][history["ACWI"].length - 1];
                setLastUpdated(lastPoint.date);
            }

            setLoading(false);
        };
        load();
    }, []);



    // Calculate currency exposure from geography data
    const currencyExposure = React.useMemo(() => {
        if (exposure.geography.length === 0) return [];

        const currencyMap: Record<string, string> = {
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
            'India': 'INR'
        };

        const totals: Record<string, number> = {};

        exposure.geography.forEach(g => {
            const curr = currencyMap[g.region] || 'Other';
            totals[curr] = (totals[curr] || 0) + g.weight;
        });

        // Convert to array and sort
        const sorted = Object.entries(totals)
            .map(([code, weight]) => ({ code, weight }))
            .sort((a, b) => b.weight - a.weight);

        // Always keep USD and CAD at the top if they exist (or just rely on sort if they are big)
        // User asked to break out next top 2.
        // We will return top 4 currencies + Other

        const topCurrencies = sorted.filter(c => c.code !== 'Other').slice(0, 4);
        const otherWeight = sorted
            .filter(c => c.code === 'Other' || !topCurrencies.includes(c))
            .reduce((sum, c) => sum + c.weight, 0);

        if (otherWeight > 0.01) {
            topCurrencies.push({ code: 'Other', weight: otherWeight });
        }

        return topCurrencies;
    }, [exposure.geography]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-wallstreet-500 font-mono">Loading index data...</div>
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
                        {lastUpdated && (
                            <div className="text-red-500 font-mono font-bold text-sm">
                                last updated : {(() => {
                                    // Format YYYY-MM-DD
                                    const parts = lastUpdated.split('-');
                                    if (parts.length === 3) {
                                        const [y, m, d] = parts;
                                        return `${d} / ${m} / ${y}`;
                                    }
                                    return lastUpdated;
                                })()}
                            </div>
                        )}
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
                        {exposure.last_scraped && (
                            <div className="text-red-500 font-mono font-bold text-sm">
                                last updated : {(() => {
                                    const parts = exposure.last_scraped.split('-');
                                    if (parts.length === 3) {
                                        const [y, m, d] = parts;
                                        return `${d} / ${m} / ${y}`;
                                    }
                                    return exposure.last_scraped;
                                })()}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 w-full min-h-0">
                        <ClevelandDotPlot data={exposure.sectors} />
                    </div>
                </div>

                {/* Bottom Left: Exposure Analysis (Tabs) */}
                <div className="bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col h-full min-h-[600px]">
                    <div className="mb-4 flex justify-between items-center border-b border-wallstreet-100 pb-2">
                        <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                            <DollarSign size={20} className="text-wallstreet-accent" />
                            Currency Exposure
                        </h3>
                        {exposure.last_scraped && (
                            <div className="text-red-500 font-mono font-bold text-sm ml-4">
                                last updated : {(() => {
                                    const parts = exposure.last_scraped.split('-');
                                    if (parts.length === 3) {
                                        const [y, m, d] = parts;
                                        return `${d} / ${m} / ${y}`;
                                    }
                                    return exposure.last_scraped;
                                })()}
                            </div>
                        )}
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
                                    {(() => {
                                        const totalCurrency = currencyExposure.reduce((sum, c) => sum + c.weight, 0);
                                        let finalCurrency = [...currencyExposure];

                                        if (totalCurrency < 99.9) {
                                            const diff = 100 - totalCurrency;
                                            const otherIndex = finalCurrency.findIndex(c => c.code === 'Other');
                                            if (otherIndex >= 0) {
                                                finalCurrency[otherIndex].weight += diff;
                                            } else {
                                                finalCurrency.push({ code: 'Other', weight: diff });
                                            }
                                        }

                                        const getTicker = (code: string) => {
                                            if (code === 'USD') return 'USDCAD=X';
                                            if (code === 'JPY') return 'JPYCAD=X';
                                            if (code === 'EUR') return 'EURCAD=X';
                                            if (code === 'CAD') return 'CAD';
                                            return '';
                                        };

                                        const formatPerf = (val: number | undefined) => {
                                            if (val === undefined) return '-';
                                            const color = val > 0 ? 'text-green-600' : val < 0 ? 'text-red-500' : 'text-slate-400';
                                            return <span className={color}>{(val * 100).toFixed(1)}%</span>;
                                        };

                                        return finalCurrency.map((c) => {
                                            const ticker = getTicker(c.code);
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
                                            )
                                        });
                                    })()}
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
                        {exposure.last_scraped && (
                            <div className="text-red-500 font-mono font-bold text-sm">
                                last updated : {(() => {
                                    const parts = exposure.last_scraped.split('-');
                                    if (parts.length === 3) {
                                        const [y, m, d] = parts;
                                        return `${d} / ${m} / ${y}`;
                                    }
                                    return exposure.last_scraped;
                                })()}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 w-full relative min-h-0">
                        <CountryTreemap data={(() => {
                            let data = exposure.geography.map(g => ({ name: g.region, value: g.weight }));
                            data.sort((a, b) => b.value - a.value);

                            const top9 = data.slice(0, 9);
                            const others = data.slice(9);

                            let othersVal = others.reduce((sum, item) => sum + item.value, 0);
                            const top9Total = top9.reduce((sum, item) => sum + item.value, 0);

                            // Add missing weight to Others if total < 100
                            if (top9Total + othersVal < 99.9) {
                                othersVal += (100 - (top9Total + othersVal));
                            }

                            // Splitting logic REMOVED. Just add Others as a single block.
                            if (othersVal > 0.01) {
                                top9.push({ name: 'Others', value: othersVal });
                            }

                            return top9;
                        })()} />
                    </div>
                </div>

            </div>
        </div>
    );
};