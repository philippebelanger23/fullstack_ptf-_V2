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

                const [result, exposure, geo] = await Promise.all([
                    (benchmark === '75/25' && (sharedBackcast != null || sharedBackcastLoading))
                        ? Promise.resolve(sharedBackcast ?? null)
                        : fetchPortfolioBackcast(items, benchmark),
                    fetchIndexExposure(),
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
                        setPortfolioHoldings(currentHoldings.map(h => ({
                            ...h,
                            sector: sectors[h.ticker] || h.sector,
                        })));
                    } catch {
                        setPortfolioHoldings(currentHoldings);
                    }
                } else {
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
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
                <div className="flex flex-col items-center gap-6">
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
                    <p className="text-sm font-mono text-wallstreet-500 tracking-wide uppercase">Loading Performance Data</p>
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
