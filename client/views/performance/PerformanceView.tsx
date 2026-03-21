import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { loadPortfolioConfig, convertConfigToItems, fetchPortfolioBackcast, fetchRollingMetrics } from '../../services/api';
import { BackcastResponse, BackcastSeriesPoint, RollingMetricsResponse } from '../../types';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import { PerformanceKPIs, Period, PeriodMetrics } from './PerformanceKPIs';
import { PerformanceCharts, ChartView } from './PerformanceCharts';
import { RollingMetricsChart } from '../../components/RollingMetricsChart';

const computeMetricsFromSeries = (filtered: BackcastSeriesPoint[]): PeriodMetrics | null => {
    if (filtered.length < 5) return null;

    const ptfRets: number[] = [];
    const bmkRets: number[] = [];
    for (let i = 1; i < filtered.length; i++) {
        ptfRets.push((filtered[i].portfolio - filtered[i - 1].portfolio) / filtered[i - 1].portfolio);
        bmkRets.push((filtered[i].benchmark - filtered[i - 1].benchmark) / filtered[i - 1].benchmark);
    }
    if (ptfRets.length === 0) return null;

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[]) => {
        const m = mean(arr);
        return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length);
    };
    const covariance = (a: number[], b: number[]) => {
        const mA = mean(a), mB = mean(b);
        return a.reduce((acc, v, i) => acc + (v - mA) * (b[i] - mB), 0) / a.length;
    };

    const totalReturn = ((filtered[filtered.length - 1].portfolio - filtered[0].portfolio) / filtered[0].portfolio) * 100;
    const benchmarkReturn = ((filtered[filtered.length - 1].benchmark - filtered[0].benchmark) / filtered[0].benchmark) * 100;
    const alpha = totalReturn - benchmarkReturn;
    const volatility = std(ptfRets) * Math.sqrt(ptfRets.length) * 100;
    const benchmarkVolatility = std(bmkRets) * Math.sqrt(bmkRets.length) * 100;
    const sharpeRatio = volatility > 0 ? totalReturn / volatility : 0;
    const benchmarkSharpe = benchmarkVolatility > 0 ? benchmarkReturn / benchmarkVolatility : 0;
    const negRets = ptfRets.filter(r => r < 0);
    const downsideStd = negRets.length > 0 ? std(negRets) * Math.sqrt(ptfRets.length) * 100 : volatility;
    const sortinoRatio = downsideStd > 0 ? totalReturn / downsideStd : 0;
    const bmkNegRets = bmkRets.filter(r => r < 0);
    const bmkDownsideStd = bmkNegRets.length > 0 ? std(bmkNegRets) * Math.sqrt(bmkRets.length) * 100 : benchmarkVolatility;
    const benchmarkSortino = bmkDownsideStd > 0 ? benchmarkReturn / bmkDownsideStd : 0;
    const bmkVar = std(bmkRets) ** 2;
    const beta = bmkVar > 0 ? covariance(ptfRets, bmkRets) / bmkVar : 1;
    const excessRets = ptfRets.map((r, i) => r - bmkRets[i]);
    const trackingError = std(excessRets) * Math.sqrt(excessRets.length) * 100;
    const informationRatio = trackingError > 0 ? (totalReturn - benchmarkReturn) / trackingError : 0;
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

const getDateRangeForPeriod = (period: Period): { start: Date; end?: Date } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    switch (period) {
        case '2025':
            return { start: new Date(2025, 0, 1), end: new Date(2025, 11, 31) };
        case 'YTD':
            return { start: new Date(now.getFullYear(), 0, 1) };
        case '3M':
            return { start: new Date(new Date().setMonth(now.getMonth() - 3)) };
        case '6M':
            return { start: new Date(new Date().setMonth(now.getMonth() - 6)) };
        case '1Y':
            return { start: new Date(new Date().setFullYear(now.getFullYear() - 1)) };
        default:
            return { start: new Date(new Date().setFullYear(now.getFullYear() - 1)) };
    }
};

export const PerformanceView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BackcastResponse | null>(null);
    const [rollingData, setRollingData] = useState<RollingMetricsResponse | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const [chartView, setChartView] = useState<ChartView>('absolute');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [benchmark, setBenchmark] = useState<string>('75/25');

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsFullscreen(false);
        };
        if (isFullscreen) {
            document.addEventListener('keydown', handleEsc);
            return () => document.removeEventListener('keydown', handleEsc);
        }
    }, [isFullscreen]);

    useEffect(() => {
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
                const [result, rolling] = await Promise.all([
                    fetchPortfolioBackcast(items, benchmark),
                    fetchRollingMetrics(items, benchmark),
                ]);
                if (result.error) {
                    setError(result.error);
                } else {
                    setData(result);
                }
                if (!rolling.error) {
                    setRollingData(rolling);
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [benchmark]);

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
        return computeMetricsFromSeries(filteredSeries);
    }, [filteredSeries]);

    const previousPeriodMetrics = useMemo((): PeriodMetrics | null => {
        if (filteredSeries.length < 10) return null;
        // Compute metrics as of ~30 days ago (cut off the last 30 data points)
        const cutoff = Math.max(5, filteredSeries.length - 30);
        return computeMetricsFromSeries(filteredSeries.slice(0, cutoff));
    }, [filteredSeries]);

    if (loading) {
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
        <div className="p-8 space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-wallstreet-text tracking-tight">Performance Deep Dive</h1>
                        <FreshnessBadge fetchedAt={data?.fetchedAt ?? null} />
                    </div>
                    <p className="text-wallstreet-500 mt-1">Portfolio backcast based on current holdings vs. {benchmark === '75/25' ? 'Custom Benchmark (75% ACWI in CAD + 25% XIU.TO)' : benchmark === 'TSX60' ? 'TSX 60 (XIU.TO)' : 'S&P 500 CAD (XUS.TO)'}.</p>
                </div>
            </div>
            <PerformanceKPIs periodMetrics={periodMetrics} previousPeriodMetrics={previousPeriodMetrics} selectedPeriod={selectedPeriod} loading={loading} />
            <PerformanceCharts
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
            {rollingData && !rollingData.error && (
                <RollingMetricsChart windows={rollingData.windows} />
            )}
        </div>
    );
};
