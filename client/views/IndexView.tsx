import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Globe, DollarSign, TrendingUp, PieChart, RefreshCw } from 'lucide-react';
import { fetchIndexExposure, fetchCurrencyPerformance, fetchIndexHistory, triggerIndexRefresh } from '../services/api';
import { FreshnessBadge } from '../components/ui/FreshnessBadge';
import { WorldChoroplethMap } from '../components/WorldChoroplethMap';
import { ClevelandDotPlot } from '../components/ClevelandDotPlot';
import { IndexPerformanceChart } from '../components/IndexPerformanceChart';
import { LoadingSequencePanel, type LoadStatus } from '../components/ui/LoadingSequencePanel';

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
    ACWI: number;
    TSX: number;
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
const INDEX_LOAD_STEPS = [
    { key: 'exposure', label: 'Benchmark Composition', sub: 'Sectors & geography from iShares' },
    { key: 'currency', label: 'Currency Rates', sub: 'FX performance vs CAD' },
    { key: 'history', label: 'Price History', sub: 'ACWI (CAD), XIC.TO & 75/25 composite' },
] as const;

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

const COUNTRY_MARKET_CLASS: Record<string, 'NA' | 'DM' | 'EM'> = {
    'United States': 'NA', 'Canada': 'NA',
    'Japan': 'DM', 'United Kingdom': 'DM', 'France': 'DM', 'Switzerland': 'DM',
    'Germany': 'DM', 'Australia': 'DM', 'Netherlands': 'DM', 'Sweden': 'DM',
    'Spain': 'DM', 'Italy': 'DM', 'Hong Kong': 'DM', 'Singapore': 'DM',
    'Denmark': 'DM', 'Finland': 'DM', 'Belgium': 'DM', 'Norway': 'DM',
    'Israel': 'DM', 'New Zealand': 'DM', 'Austria': 'DM', 'Ireland': 'DM', 'Portugal': 'DM',
    'China': 'EM', 'Taiwan': 'EM', 'Korea (South)': 'EM', 'India': 'EM',
    'Brazil': 'EM', 'South Africa': 'EM', 'Saudi Arabia': 'EM', 'Mexico': 'EM',
    'Malaysia': 'EM', 'Thailand': 'EM', 'United Arab Emirates': 'EM', 'Indonesia': 'EM',
    'Philippines': 'EM', 'Turkey': 'EM', 'Poland': 'EM', 'Egypt': 'EM',
    'Peru': 'EM', 'Colombia': 'EM', 'Kuwait': 'EM', 'Qatar': 'EM',
    'Hungary': 'EM', 'Czech Republic': 'EM', 'Greece': 'EM',
};

const MARKET_COLORS: Record<'NA' | 'DM' | 'EM', { inner: string; label: string; shades: string[] }> = {
    NA: { inner: '#1e3a8a', label: 'North America',    shades: ['#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'] },
    DM: { inner: '#9d174d', label: 'Developed Mkts',   shades: ['#9d174d', '#be185d', '#db2777', '#ec4899', '#f472b6', '#fbcfe8'] },
    EM: { inner: '#064e3b', label: 'Emerging Mkts',    shades: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'] },
};

const CURRENCY_CODE_TO_TICKER: Record<string, string> = {
    'USD': 'USDCAD=X',
    'JPY': 'JPYCAD=X',
    'EUR': 'EURCAD=X',
    'CAD': 'CAD',
};

const formatPerf = (val: number | undefined) => {
    if (val === undefined) return '-';
    const color = val > 0 ? 'text-green-600' : val < 0 ? 'text-red-500' : 'text-wallstreet-500';
    const pct = val * 100;
    const display = pct < 0 ? `(${Math.abs(pct).toFixed(1)}%)` : `${pct.toFixed(1)}%`;
    return <span className={color}>{display}</span>;
};


export const IndexView: React.FC = () => {
    const [exposure, setExposure] = useState<IndexExposureData>({ sectors: [], geography: [] });
    const [currencyPerf, setCurrencyPerf] = useState<Record<string, Record<string, number>>>({});
    const [indexHistory, setIndexHistory] = useState<Record<string, { date: string, value: number }[]>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({
        exposure: 'pending',
        currency: 'pending',
        history: 'pending',
    });
    const loadTokenRef = useRef(0);

    const load = useCallback(async () => {
        const loadToken = ++loadTokenRef.current;
        const isCurrent = () => loadTokenRef.current === loadToken;

        setLoading(true);
        setLoadProgress({ exposure: 'pending', currency: 'pending', history: 'pending' });

        const trackFetch = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
            try {
                const result = await fn();
                if (!isCurrent()) return result;
                setLoadProgress(prev => ({ ...prev, [key]: 'done' }));
                return result;
            } catch (err) {
                if (!isCurrent()) throw err;
                setLoadProgress(prev => ({ ...prev, [key]: 'error' }));
                throw err;
            }
        };

        try {
            const res = await trackFetch('exposure', fetchIndexExposure);
            if (!isCurrent()) return;
            setExposure(res);

            const perf = await trackFetch('currency', () => fetchCurrencyPerformance(CURRENCY_TICKERS));
            if (!isCurrent()) return;
            setCurrencyPerf(perf);

            const history = await trackFetch('history', fetchIndexHistory);
            if (!isCurrent()) return;
            setIndexHistory(history);

        } catch (err) {
            console.error("Failed to load index data:", err);
            if (!isCurrent()) return;
        } finally {
            if (!isCurrent()) return;
            setLoading(false);
            setFetchedAt(new Date().toISOString());
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await triggerIndexRefresh();
        } catch (err) {
            console.error("Refresh trigger failed:", err);
        }
        await load();
        setRefreshing(false);
    }, [refreshing, load]);



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

    // Sunburst: grouped segments (NA / DM / EM) with country children
    const sunburstSegments = useMemo(() => {
        if (exposure.geography.length === 0) return [];

        const groups: Record<'NA' | 'DM' | 'EM', { region: string; weight: number }[]> = { NA: [], DM: [], EM: [] };
        exposure.geography.forEach(g => {
            const cls = COUNTRY_MARKET_CLASS[g.region] ?? 'EM';
            groups[cls].push({ region: g.region, weight: g.weight });
        });
        (['NA', 'DM', 'EM'] as const).forEach(cls => groups[cls].sort((a, b) => b.weight - a.weight));

        return (['NA', 'DM', 'EM'] as const).map(cls => {
            const { inner, label, shades } = MARKET_COLORS[cls];
            const children = groups[cls].map((c, i) => ({
                name: c.region,
                value: c.weight,
                color: shades[Math.min(i, shades.length - 1)],
            }));
            const value = parseFloat(children.reduce((s, c) => s + c.value, 0).toFixed(2));
            return { name: label, value, color: inner, children };
        }).filter(s => s.value > 0);
    }, [exposure.geography]);

    // Geography data for choropleth map (no bucketing needed — map shows all countries)
    const geoMapData = exposure.geography;

    if (loading) {
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
                <LoadingSequencePanel
                    title="Fetching Benchmark Data"
                    steps={INDEX_LOAD_STEPS.map(step => ({ ...step, status: loadProgress[step.key] as LoadStatus }))}
                />
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col lg:h-full overflow-x-hidden px-6 pt-6 animate-in fade-in duration-500">

            <div className="flex-shrink-0 border-b border-wallstreet-700 pb-4 mb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold font-mono text-wallstreet-text flex items-center gap-3"><Globe className="text-wallstreet-accent" /> Global 75/25 Composite</h2>
                        <p className="text-wallstreet-500 mt-2 max-w-2xl">A custom synthetic benchmark. <span className="font-bold text-wallstreet-text ml-2">75% ACWI (CAD) + 25% XIC.TO</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            title="Refresh benchmark data"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wallstreet-700 bg-wallstreet-800 text-wallstreet-400 hover:text-wallstreet-text hover:border-wallstreet-accent hover:bg-wallstreet-700 text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? 'Refreshing…' : 'Refresh Data'}
                        </button>
                        <FreshnessBadge fetchedAt={fetchedAt} />
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 pb-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">

                {/* Left column: Composite Performance + Sector Exposure (equal split) */}
                <div className="flex flex-col gap-6 lg:w-1/2 lg:min-h-0">
                    {/* Composite Performance Graph */}
                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[400px] lg:min-h-0 lg:flex-1">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                                <TrendingUp size={20} className="text-wallstreet-accent" />
                                Composite Performance
                            </h3>
                            <span className="pt-0.5 text-wallstreet-500 italic text-[15px] tracking-wider whitespace-nowrap">
                                Annualized Return (all in CAD)
                            </span>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                            <IndexPerformanceChart data={indexHistory} />
                        </div>
                    </div>

                    {/* Sector Exposure */}
                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[400px] lg:min-h-0 lg:flex-1">
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
                </div>

                {/* Right column: Geographic Breakdown (2/3) + Currency Exposure (1/3) */}
                <div className="flex flex-col gap-6 lg:w-1/2 lg:min-h-0">
                    {/* Geographic Breakdown — 80% */}
                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[400px] lg:min-h-0 lg:flex-[7]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                                <Globe size={20} className="text-wallstreet-accent" />
                                Geographic Breakdown
                            </h3>
                        </div>

                        <div className="flex-1 w-full relative min-h-0">
                            <WorldChoroplethMap data={geoMapData} />
                        </div>
                    </div>

                    {/* Currency Exposure — 20% */}
                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[200px] lg:min-h-0 lg:flex-[3]">
                        <div className="mb-4 flex justify-between items-center border-b border-wallstreet-100 pb-2">
                            <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                                <DollarSign size={20} className="text-wallstreet-accent" />
                                Currency Exposure
                            </h3>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto">
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
                                            <tr key={c.code} className={`border-b border-wallstreet-100 hover:bg-wallstreet-50 ${c.code === 'Other' ? 'text-wallstreet-500' : ''}`}>
                                                <td className="py-1.5 px-2 font-medium">{c.code}</td>
                                                <td className={`py-1.5 px-2 text-center ${c.code === 'Other' ? 'font-normal' : `font-bold ${c.code === 'USD' ? 'text-blue-700' : c.code === 'CAD' ? 'text-red-700' : 'text-wallstreet-text'}`}`}>
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
                                                    <td colSpan={4} className="py-1.5 px-2 text-center text-wallstreet-500">-</td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
