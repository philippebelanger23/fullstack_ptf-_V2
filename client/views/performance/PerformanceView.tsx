import React, { useEffect, useState, useMemo, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { loadPortfolioConfig, convertConfigToItems, fetchPortfolioBackcast, fetchIndexExposure, loadAssetGeo, fetchSectors } from '../../services/api';
import { BackcastResponse, BackcastSeriesPoint, PortfolioItem } from '../../types';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import type { Period, PeriodMetrics } from './PerformanceKPIs';
import { PerformanceCharts, ChartView } from './PerformanceCharts';
import { getDateRangeForPeriod } from '../../utils/dateUtils';

const computeMetricsFromSeries = (filtered: BackcastSeriesPoint[]): PeriodMetrics | null => {
    if (filtered.length < 5) return null;

    const ptfRets: number[] = [];
    const bmkRets: number[] = [];
    for (let i = 1; i < filtered.length; i++) {
        ptfRets.push((filtered[i].portfolio - filtered[i - 1].portfolio) / filtered[i - 1].portfolio);
        bmkRets.push((filtered[i].benchmark - filtered[i - 1].benchmark) / filtered[i - 1].benchmark);
    }
    if (ptfRets.length === 0) return null;

    const n = ptfRets.length;
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    // Sample std (ddof=1) to match backend
    const std = (arr: number[]) => {
        if (arr.length < 2) return 0;
        const m = mean(arr);
        return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
    };
    // Sample covariance (ddof=1) to match backend
    const covariance = (a: number[], b: number[]) => {
        if (a.length < 2) return 0;
        const mA = mean(a), mB = mean(b);
        return a.reduce((acc, v, i) => acc + (v - mA) * (b[i] - mB), 0) / (a.length - 1);
    };
    // Proper downside deviation: sqrt(mean(min(r, 0)^2))
    const downsideDev = (arr: number[]) => {
        const sumSq = arr.reduce((acc, r) => acc + Math.min(r, 0) ** 2, 0);
        return Math.sqrt(sumSq / arr.length);
    };

    const totalReturn = ((filtered[filtered.length - 1].portfolio - filtered[0].portfolio) / filtered[0].portfolio) * 100;
    const benchmarkReturn = ((filtered[filtered.length - 1].benchmark - filtered[0].benchmark) / filtered[0].benchmark) * 100;
    const alpha = totalReturn - benchmarkReturn;

    // Always annualize with sqrt(252) to match backend convention
    const ptfStd = std(ptfRets);
    const bmkStd = std(bmkRets);
    const ptfMean = mean(ptfRets);
    const bmkMean = mean(bmkRets);

    const volatility = ptfStd * Math.sqrt(252) * 100;
    const benchmarkVolatility = bmkStd * Math.sqrt(252) * 100;
    const sharpeRatio = ptfStd > 0 ? (ptfMean / ptfStd) * Math.sqrt(252) : 0;
    const benchmarkSharpe = bmkStd > 0 ? (bmkMean / bmkStd) * Math.sqrt(252) : 0;

    const ptfDD = downsideDev(ptfRets);
    const sortinoRatio = ptfDD > 0 ? (ptfMean / ptfDD) * Math.sqrt(252) : 0;
    const bmkDD = downsideDev(bmkRets);
    const benchmarkSortino = bmkDD > 0 ? (bmkMean / bmkDD) * Math.sqrt(252) : 0;

    const bmkVar = bmkStd ** 2;
    const beta = bmkVar > 0 ? covariance(ptfRets, bmkRets) / bmkVar : 1;

    const excessRets = ptfRets.map((r, i) => r - bmkRets[i]);
    const trackingError = std(excessRets) * Math.sqrt(252) * 100;
    const meanExcessAnn = mean(excessRets) * 252;
    const informationRatio = trackingError > 0 ? (meanExcessAnn * 100) / trackingError : 0;

    let maxPtf = filtered[0].portfolio;
    let maxDrawdown = 0;
    let maxBmk = filtered[0].benchmark;
    let benchmarkMaxDrawdown = 0;
    for (const pt of filtered) {
        maxPtf = Math.max(maxPtf, pt.portfolio);
        maxDrawdown = Math.min(maxDrawdown, (pt.portfolio - maxPtf) / maxPtf);
        maxBmk = Math.max(maxBmk, pt.benchmark);
        benchmarkMaxDrawdown = Math.min(benchmarkMaxDrawdown, (pt.benchmark - maxBmk) / maxBmk);
    }

    return {
        totalReturn, benchmarkReturn, alpha, sharpeRatio, sortinoRatio, informationRatio,
        trackingError, volatility, benchmarkVolatility, benchmarkSharpe, benchmarkSortino,
        beta, maxDrawdown: maxDrawdown * 100, benchmarkMaxDrawdown: benchmarkMaxDrawdown * 100,
    };
};


export const PerformanceView: React.FC<{
    isActive?: boolean;
    sharedBackcast?: BackcastResponse | null;
    sharedBackcastLoading?: boolean;
    prefetchedBackcasts?: Record<string, BackcastResponse>;
}> = ({ isActive, sharedBackcast, sharedBackcastLoading, prefetchedBackcasts }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BackcastResponse | null>(null);
    // Per-benchmark cache so switching back is instant. Cleared when portfolio changes.
    const backcastCache = useRef<Map<string, BackcastResponse>>(new Map());
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const [chartView, setChartView] = useState<ChartView>('absolute');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [benchmark, setBenchmark] = useState<string>('75/25');
    const [benchmarkSectors, setBenchmarkSectors] = useState<any[]>([]);
    const [benchmarkGeography, setBenchmarkGeography] = useState<any[]>([]);
    const [assetGeo, setAssetGeo] = useState<Record<string, string>>({});
    const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioItem[]>([]);
    const [loadProgress, setLoadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({
        backcast: 'pending', benchmark: 'pending', sectors: 'pending',
    });

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsFullscreen(false);
        };
        if (isFullscreen) {
            document.addEventListener('keydown', handleEsc);
            return () => document.removeEventListener('keydown', handleEsc);
        }
    }, [isFullscreen]);

    // Populate cache from app-level prefetched benchmarks (TSX, SP500).
    // Runs whenever the prefetched map changes (e.g. portfolio reloaded).
    useEffect(() => {
        if (!prefetchedBackcasts) return;
        Object.entries(prefetchedBackcasts).forEach(([bm, result]) => {
            backcastCache.current.set(bm, result);
        });
    }, [prefetchedBackcasts]);

    // Keep the 75/25 cache entry in sync with the shared backcast.
    useEffect(() => {
        if (sharedBackcast == null) return;
        backcastCache.current.set('75/25', sharedBackcast);
    }, [sharedBackcast]);

    // Data sync: update displayed data and loading state when the shared backcast
    // arrives or when the user switches to/from the default benchmark.
    useEffect(() => {
        if (benchmark === '75/25' && sharedBackcast != null) {
            setData(sharedBackcast);
            setLoading(false);
        } else if (benchmark === '75/25' && sharedBackcastLoading) {
            setLoading(true);
        }
    }, [sharedBackcast, sharedBackcastLoading, benchmark]);

    useEffect(() => {
        // Skip the fetch when the tab is not active (isActive=false).
        // On first mount isActive is undefined (no prop passed) — fetch anyway.
        if (isActive === false) return;

        // Cache hit — apply immediately with no loading state.
        const cached = backcastCache.current.get(benchmark);
        if (cached) {
            setData(cached);
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setLoadProgress({ backcast: 'pending', benchmark: 'pending', sectors: 'pending' });
            const trackFetch = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
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
                const config = await loadPortfolioConfig();
                if (!config.tickers || config.tickers.length === 0) {
                    setError("No portfolio configured. Go to Upload to configure your portfolio.");
                    setLoading(false);
                    return;
                }
                const items = convertConfigToItems(config.tickers, config.periods);
                if (items.length === 0) {
                    setError("Portfolio has no holdings with positive weights.");
                    setLoading(false);
                    return;
                }
                const latestDate = items.reduce((max, item) => item.date > max ? item.date : max, '');
                const currentHoldings = items.filter(item => item.date === latestDate);

                const backcastFetch = (benchmark === '75/25' && (sharedBackcast != null || sharedBackcastLoading))
                    ? (() => { setLoadProgress(prev => ({ ...prev, backcast: 'done' })); return Promise.resolve(sharedBackcast ?? null); })()
                    : trackFetch('backcast', () => fetchPortfolioBackcast(items, benchmark));
                const [result, exposure, geo] = await Promise.all([
                    backcastFetch,
                    trackFetch('benchmark', fetchIndexExposure),
                    loadAssetGeo(),
                ]);
                if (result?.error) {
                    setError(result.error);
                } else if (result) {
                    backcastCache.current.set(benchmark, result);
                    setData(result);
                }
                setBenchmarkSectors(exposure.sectors || []);
                setBenchmarkGeography(exposure.geography || []);
                setAssetGeo(geo);

                // Enrich holdings with sector data
                const tickers = currentHoldings.map(h => h.ticker).filter(t => t !== 'CASH');
                if (tickers.length > 0) {
                    try {
                        const sectors = await fetchSectors(tickers);
                        setLoadProgress(prev => ({ ...prev, sectors: 'done' }));
                        setPortfolioHoldings(currentHoldings.map(h => ({
                            ...h,
                            sector: sectors[h.ticker] || h.sector,
                        })));
                    } catch {
                        setLoadProgress(prev => ({ ...prev, sectors: 'error' }));
                        setPortfolioHoldings(currentHoldings);
                    }
                } else {
                    setLoadProgress(prev => ({ ...prev, sectors: 'done' }));
                    setPortfolioHoldings(currentHoldings);
                }
            } catch (e) {
                setError(String(e));
                setLoading(false);
            } finally {
                // Clear loading unless we explicitly deferred to a shared backcast that is
                // still in-flight (sharedBackcastLoading=true, sharedBackcast=null).
                // In that case Effect 1 will set loading=false when the data arrives.
                // All other cases — shared backcast already available, fetch failed, or a
                // non-default benchmark — must clear loading here because Effect 1 won't
                // re-fire (its deps haven't changed since it last ran).
                const waitingForShared = benchmark === '75/25' && sharedBackcast == null && sharedBackcastLoading;
                if (!waitingForShared) {
                    setLoading(false);
                }
            }
        };
        fetchData();
    }, [benchmark, isActive]);

    const chartData = useMemo(() => {
        if (!data?.series || data.series.length === 0) return [];
        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';
        const filtered = data.series.filter(pt => pt.date >= startDateStr && pt.date <= endDateStr);
        if (filtered.length === 0) return [];
        const startPortfolio = filtered[0].portfolio;
        const startBenchmark = filtered[0].benchmark;
        if (chartView === 'absolute') {
            return filtered.map(pt => ({
                date: pt.date,
                Portfolio: ((pt.portfolio - startPortfolio) / startPortfolio) * 100,
                Benchmark: ((pt.benchmark - startBenchmark) / startBenchmark) * 100,
            }));
        } else if (chartView === 'relative') {
            return filtered.map(pt => {
                const ptfRet = ((pt.portfolio - startPortfolio) / startPortfolio) * 100;
                const bmkRet = ((pt.benchmark - startBenchmark) / startBenchmark) * 100;
                return { date: pt.date, 'Excess Return': ptfRet - bmkRet };
            });
        } else {
            let maxPtf = filtered[0].portfolio;
            let maxBmk = filtered[0].benchmark;
            return filtered.map(pt => {
                maxPtf = Math.max(maxPtf, pt.portfolio);
                maxBmk = Math.max(maxBmk, pt.benchmark);
                return {
                    date: pt.date,
                    Portfolio: ((pt.portfolio - maxPtf) / maxPtf) * 100,
                    Benchmark: ((pt.benchmark - maxBmk) / maxBmk) * 100,
                };
            });
        }
    }, [data, selectedPeriod, chartView]);

    const filteredSeries = useMemo(() => {
        if (!data?.series || data.series.length < 5) return [];
        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';
        return data.series.filter(pt => pt.date >= startDateStr && pt.date <= endDateStr);
    }, [data, selectedPeriod]);

    const periodMetrics = useMemo((): PeriodMetrics | null => {
        // For 1Y, use the backend's pre-computed metrics (same data/formula as risk-contribution)
        // to guarantee consistency across tabs. Only compute frontend metrics for sub-periods
        // where the backend doesn't have period-specific values.
        if (selectedPeriod === '1Y' && data?.metrics) {
            return {
                totalReturn: data.metrics.totalReturn,
                benchmarkReturn: data.metrics.benchmarkReturn,
                alpha: data.metrics.alpha,
                sharpeRatio: data.metrics.sharpeRatio,
                sortinoRatio: data.metrics.sortinoRatio,
                informationRatio: data.metrics.informationRatio,
                trackingError: data.metrics.trackingError,
                volatility: data.metrics.volatility,
                benchmarkVolatility: data.metrics.benchmarkVolatility,
                benchmarkSharpe: data.metrics.benchmarkSharpe,
                benchmarkSortino: data.metrics.benchmarkSortino,
                beta: data.metrics.beta,
                maxDrawdown: data.metrics.maxDrawdown,
                benchmarkMaxDrawdown: data.metrics.benchmarkMaxDrawdown,
            };
        }
        return computeMetricsFromSeries(filteredSeries);
    }, [filteredSeries, selectedPeriod, data]);

    // Only show full-screen spinner on the very first load (no data yet).
    // Subsequent loads (e.g. benchmark switch) keep the existing UI visible
    // and show the inline chart spinner instead, avoiding a full-page flash.
    if (loading && !data) {
        const steps = [
            { key: 'backcast',  label: 'Performance Backcast',  sub: 'Historical returns vs benchmark' },
            { key: 'benchmark', label: 'Benchmark Exposure',    sub: 'Index sector & geography weights' },
            { key: 'sectors',   label: 'Sector Classification', sub: 'Holdings & industry mapping' },
        ];
        const doneCount = Object.values(loadProgress).filter(s => s === 'done').length;
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center select-none">
                <style>{`
                    @keyframes perfBarPulse {
                        0%, 100% { transform: scaleY(0.12); opacity: 0.1; }
                        50%      { transform: scaleY(1);    opacity: 1;   }
                    }
                    @keyframes perfScanLine {
                        0%   { left: -2px; }
                        100% { left: calc(100% + 2px); }
                    }
                `}</style>
                <div className="flex flex-col items-center gap-8 w-full max-w-sm">
                    <div className="relative overflow-hidden rounded" style={{ width: '176px', height: '60px' }}>
                        <div className="flex items-end h-full gap-1.5">
                            {[28, 50, 36, 66, 42, 78, 54, 92, 46, 72, 58, 88, 64].map((h, i) => (
                                <div key={i} className="flex-1 rounded-t-sm origin-bottom" style={{
                                    height: `${h}%`,
                                    background: i === 12 ? '#3b82f6' : '#374151',
                                    animation: `perfBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                                }} />
                            ))}
                        </div>
                        <div className="absolute top-0 bottom-0 w-px" style={{
                            background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.65), transparent)',
                            animation: 'perfScanLine 2.2s linear infinite',
                        }} />
                    </div>

                    <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.25em] uppercase">
                        Loading Performance Data
                    </p>

                    <div className="w-full bg-wallstreet-700 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-wallstreet-accent h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(doneCount / steps.length) * 100}%` }} />
                    </div>

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
                                            <div className="w-3.5 h-3.5 border-2 border-wallstreet-600 border-t-wallstreet-accent rounded-full animate-spin" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`text-sm font-mono font-medium ${status === 'done' ? 'text-wallstreet-text' : status === 'error' ? 'text-red-500' : 'text-wallstreet-500'}`}>{label}</p>
                                        <p className="text-xs text-wallstreet-500 truncate">{sub}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 animate-in fade-in duration-500">
                <div className="flex flex-col items-center justify-center h-[400px] bg-wallstreet-800 rounded-2xl border border-wallstreet-700">
                    <AlertCircle className="text-amber-500 mb-4" size={48} />
                    <h2 className="text-lg font-bold text-wallstreet-text mb-2">Unable to Load Performance Data</h2>
                    <p className="text-wallstreet-500 text-center max-w-md">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden p-8 gap-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end shrink-0">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-wallstreet-text tracking-tight">Performance Deep Dive</h1>
                        <FreshnessBadge fetchedAt={data?.fetchedAt ?? null} />
                    </div>
                    <p className="text-wallstreet-500 mt-1">Portfolio backcast based on current holdings vs. {benchmark === '75/25' ? '75/25 Composite (75% ACWI CAD + 25% XIC.TO)' : benchmark === 'ACWI' ? 'ACWI (CAD-converted)' : benchmark === 'TSX' ? 'XIC.TO (S&P/TSX Composite)' : 'S&P 500 CAD (XUS.TO)'}.</p>
                </div>
            </div>
            <div className="flex-1 min-h-0">
                <PerformanceCharts
                    noWrapper
                    data={data}
                    chartData={chartData}
                    chartView={chartView}
                    setChartView={setChartView}
                    isFullscreen={isFullscreen}
                    setIsFullscreen={setIsFullscreen}
                    selectedPeriod={selectedPeriod}
                    setSelectedPeriod={setSelectedPeriod}
                    periodMetrics={periodMetrics}
                    loading={loading}
                    benchmark={benchmark}
                    setBenchmark={setBenchmark}
                />
            </div>
        </div>
    );
};
