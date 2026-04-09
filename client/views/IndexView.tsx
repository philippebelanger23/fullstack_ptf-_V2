import React, { useMemo } from 'react';
import { Globe, DollarSign, TrendingUp, PieChart, RefreshCw, AlertTriangle } from 'lucide-react';
import { BenchmarkWorkspaceResponse } from '../types';
import { FreshnessBadge } from '../components/ui/FreshnessBadge';
import { WorldChoroplethMap } from '../components/WorldChoroplethMap';
import { ClevelandDotPlot } from '../components/ClevelandDotPlot';
import { IndexPerformanceChart } from '../components/IndexPerformanceChart';
import { LoadingSequencePanel, type LoadStatus } from '../components/ui/LoadingSequencePanel';

interface IndexViewProps {
    benchmarkWorkspace: BenchmarkWorkspaceResponse | null;
    loading: boolean;
    error: string | null;
    refreshing: boolean;
    onRefresh: () => Promise<void> | void;
}

const INDEX_LOAD_STEPS = [
    { key: 'composition', label: 'Benchmark Composition', sub: 'Sectors & geography from the benchmark workspace' },
    { key: 'currency', label: 'Currency Rates', sub: 'FX performance vs CAD' },
    { key: 'performance', label: 'Price History', sub: 'ACWI (CAD), XIC.TO & 75/25 composite' },
] as const;

const formatPerf = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    const color = val > 0 ? 'text-green-600' : val < 0 ? 'text-red-500' : 'text-wallstreet-500';
    const pct = val * 100;
    const display = pct < 0 ? `(${Math.abs(pct).toFixed(1)}%)` : `${pct.toFixed(1)}%`;
    return <span className={color}>{display}</span>;
};

const buildLoadProgress = (benchmarkWorkspace: BenchmarkWorkspaceResponse | null): Record<string, LoadStatus> => {
    if (!benchmarkWorkspace) {
        return { composition: 'pending', currency: 'pending', performance: 'pending' };
    }

    const sourceStatus = benchmarkWorkspace.meta.sourceStatus ?? {};
    const toLoadStatus = (status?: string): LoadStatus => {
        if (status === 'fresh' || status === 'stale') return 'done';
        if (status === 'error') return 'error';
        return 'pending';
    };

    return {
        composition: toLoadStatus(sourceStatus.composition?.status),
        currency: toLoadStatus(sourceStatus.currency?.status),
        performance: toLoadStatus(sourceStatus.performance?.status),
    };
};

export const IndexView: React.FC<IndexViewProps> = ({ benchmarkWorkspace, loading, error, refreshing, onRefresh }) => {
    const loadProgress = useMemo(() => buildLoadProgress(benchmarkWorkspace), [benchmarkWorkspace]);
    const sectors = benchmarkWorkspace?.composition.sectors ?? [];
    const geography = benchmarkWorkspace?.composition.geography ?? [];
    const currencyRows = benchmarkWorkspace?.currency.rows ?? [];
    const performanceSeries = benchmarkWorkspace?.performance.series ?? {};
    const fetchedAt = benchmarkWorkspace?.meta.builtAt ?? benchmarkWorkspace?.meta.exposureAsOf ?? null;

    if (loading && !benchmarkWorkspace) {
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
                <LoadingSequencePanel
                    title="Fetching Benchmark Data"
                    steps={INDEX_LOAD_STEPS.map(step => ({ ...step, status: loadProgress[step.key] }))}
                />
            </div>
        );
    }

    if (!benchmarkWorkspace) {
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex items-center justify-center">
                <div className="bg-wallstreet-800 p-8 rounded-xl border border-wallstreet-700 shadow-sm max-w-xl text-center">
                    <AlertTriangle size={40} className="text-wallstreet-accent mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-wallstreet-text mb-2">Benchmark Workspace Unavailable</h2>
                    <p className="text-wallstreet-500 mb-6">{error ?? 'Benchmark data could not be loaded.'}</p>
                    <button
                        onClick={() => void onRefresh()}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-lg border border-wallstreet-700 bg-wallstreet-900 px-4 py-2 text-sm font-mono text-wallstreet-400 transition-colors hover:border-wallstreet-accent hover:text-wallstreet-text disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col lg:h-full overflow-x-hidden px-6 pt-6 animate-in fade-in duration-500">
            <div className="flex-shrink-0 border-b border-wallstreet-700 pb-4 mb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold font-mono text-wallstreet-text flex items-center gap-3"><Globe className="text-wallstreet-accent" /> Global 75/25 Composite</h2>
                        <p className="text-wallstreet-500 mt-2 max-w-2xl">A canonical benchmark workspace. <span className="font-bold text-wallstreet-text ml-2">75% ACWI (CAD) + 25% XIC.TO</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => void onRefresh()}
                            disabled={refreshing}
                            title="Refresh benchmark data"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wallstreet-700 bg-wallstreet-800 text-wallstreet-400 hover:text-wallstreet-text hover:border-wallstreet-accent hover:bg-wallstreet-700 text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? 'Refreshing...' : 'Refresh Data'}
                        </button>
                        <FreshnessBadge fetchedAt={fetchedAt} />
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-amber-600/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
                    Benchmark refresh warning: {error}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 pb-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
                <div className="flex flex-col gap-6 lg:w-1/2 lg:min-h-0">
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
                            <IndexPerformanceChart data={performanceSeries} />
                        </div>
                    </div>

                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[400px] lg:min-h-0 lg:flex-1">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                                <PieChart size={20} className="text-wallstreet-accent" />
                                Sector Exposure
                            </h3>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                            <ClevelandDotPlot data={sectors} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-6 lg:w-1/2 lg:min-h-0">
                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[400px] lg:min-h-0 lg:flex-[7]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                                <Globe size={20} className="text-wallstreet-accent" />
                                Geographic Breakdown
                            </h3>
                        </div>

                        <div className="flex-1 w-full relative min-h-0">
                            <WorldChoroplethMap data={geography} />
                        </div>
                    </div>

                    <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[200px] lg:min-h-0 lg:flex-[3]">
                        <div className="mb-4 flex justify-between items-center border-b border-wallstreet-100 pb-2">
                            <h3 className="text-lg font-bold font-mono text-wallstreet-text flex items-center gap-2">
                                <DollarSign size={20} className="text-wallstreet-accent" />
                                Currency Exposure
                            </h3>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto">
                            <div className="mb-2">
                                <p className="text-xs text-wallstreet-400">Derived once in the benchmark workspace from geographic allocation.</p>
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
                                    {currencyRows.map((row) => (
                                        <tr key={row.code} className={`border-b border-wallstreet-100 hover:bg-wallstreet-50 ${row.code === 'Other' ? 'text-wallstreet-500' : ''}`}>
                                            <td className="py-1.5 px-2 font-medium">{row.code}</td>
                                            <td className={`py-1.5 px-2 text-center ${row.code === 'Other' ? 'font-normal' : `font-bold ${row.code === 'USD' ? 'text-blue-700' : row.code === 'CAD' ? 'text-red-700' : 'text-wallstreet-text'}`}`}>
                                                {row.weight.toFixed(1)}%
                                            </td>
                                            {row.code !== 'Other' ? (
                                                <>
                                                    <td className="py-1.5 px-2 text-center">{formatPerf(row.performance?.YTD)}</td>
                                                    <td className="py-1.5 px-2 text-center">{formatPerf(row.performance?.['3M'])}</td>
                                                    <td className="py-1.5 px-2 text-center">{formatPerf(row.performance?.['6M'])}</td>
                                                    <td className="py-1.5 px-2 text-center">{formatPerf(row.performance?.['1Y'])}</td>
                                                </>
                                            ) : (
                                                <td colSpan={4} className="py-1.5 px-2 text-center text-wallstreet-500">-</td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
