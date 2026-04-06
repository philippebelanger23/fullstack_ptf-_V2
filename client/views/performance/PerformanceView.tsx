import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { PortfolioWorkspaceAttribution } from '../../types';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import type { Period, PeriodMetrics } from './PerformanceKPIs';
import { PerformanceCharts, type ChartView } from './PerformanceCharts';
import {
    buildCanonicalPerformanceSeries,
    buildChartDataFromSeries,
    computePeriodMetricsFromSeries,
    filterSeriesByPeriod,
} from '../../selectors/performanceSelectors';

export const PerformanceView: React.FC<{
    isActive?: boolean;
    defaultBenchmark?: string;
    attributionData?: PortfolioWorkspaceAttribution | null;
}> = ({ isActive, defaultBenchmark = '75/25', attributionData }) => {
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const [chartView, setChartView] = useState<ChartView>('absolute');
    const [benchmark, setBenchmark] = useState<string>(defaultBenchmark);

    const availableBenchmarks = useMemo(
        () => Object.keys(attributionData?.dailyPerformanceSeries ?? {}),
        [attributionData],
    );
    const canonicalSeries = useMemo(() => buildCanonicalPerformanceSeries(attributionData, benchmark), [attributionData, benchmark]);
    const loading = isActive !== false && !attributionData;
    const error = attributionData?.performanceErrors?.[benchmark]
        ?? (!loading && canonicalSeries.length === 0 ? 'No canonical performance series available.' : null);

    useEffect(() => {
        if (availableBenchmarks.includes(benchmark)) return;
        if (availableBenchmarks.includes(defaultBenchmark)) {
            setBenchmark(defaultBenchmark);
            return;
        }
        const firstAvailable = availableBenchmarks[0];
        if (firstAvailable) setBenchmark(firstAvailable);
    }, [availableBenchmarks, benchmark, defaultBenchmark]);

    const chartData = useMemo(() => {
        return buildChartDataFromSeries(
            filterSeriesByPeriod(canonicalSeries, selectedPeriod),
            chartView,
        );
    }, [canonicalSeries, chartView, selectedPeriod]);

    const filteredSeries = useMemo(() => {
        return filterSeriesByPeriod(canonicalSeries, selectedPeriod);
    }, [canonicalSeries, selectedPeriod]);

    const periodMetrics = useMemo((): PeriodMetrics | null => {
        return computePeriodMetricsFromSeries(filteredSeries);
    }, [filteredSeries]);

    if (loading) {
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
                                <div
                                    key={i}
                                    className="flex-1 rounded-t-sm origin-bottom"
                                    style={{
                                        height: `${h}%`,
                                        background: i === 12 ? '#3b82f6' : '#374151',
                                        animation: `perfBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                                    }}
                                />
                            ))}
                        </div>
                        <div
                            className="absolute top-0 bottom-0 w-px"
                            style={{
                                background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.65), transparent)',
                                animation: 'perfScanLine 2.2s linear infinite',
                            }}
                        />
                    </div>

                    <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.25em] uppercase">
                        Loading Performance Workspace
                    </p>
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
                        <FreshnessBadge fetchedAt={attributionData?.performanceFetchedAt ?? null} />
                    </div>
                    <p className="text-wallstreet-500 mt-1">Canonical workspace performance series and relative return metrics.</p>
                </div>
            </div>
            <div className="flex-1 min-h-0">
                <PerformanceCharts
                    noWrapper
                    chartData={chartData}
                    chartView={chartView}
                    setChartView={setChartView}
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
