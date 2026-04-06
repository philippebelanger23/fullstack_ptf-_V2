import React from 'react';
import type { Period, PeriodMetrics } from './PerformanceKPIs';
import { UnifiedPerformancePanel } from './UnifiedPerformancePanel';
import type { PerformanceChartView } from '../../selectors/performanceSelectors';

export type ChartView = PerformanceChartView;

const BENCHMARKS = [
    { key: '75/25', label: '75/25', title: '75% ACWI (CAD) + 25% XIC.TO', color: '#10b981' },
    { key: 'ACWI',  label: 'ACWI',  title: 'ACWI CAD-converted — 100% ACWI (USD→CAD)', color: '#2563eb' },
    { key: 'TSX',   label: 'TSX',   title: 'S&P/TSX Composite — XIC.TO', color: '#dc2626' },
    { key: 'SP500', label: 'S&P 500', title: 'S&P 500 CAD — XUS.TO', color: '#8b5cf6' },
] as const;

interface PerformanceChartsProps {
    chartData: Record<string, unknown>[];
    chartView: ChartView;
    setChartView: (v: ChartView) => void;
    selectedPeriod: Period;
    setSelectedPeriod: (v: Period) => void;
    periodMetrics: PeriodMetrics | null;
    loading: boolean;
    benchmark: string;
    setBenchmark: (v: string) => void;
    hideBenchmarkSelector?: boolean;
    hideKPIs?: boolean;
    noWrapper?: boolean;
}

export const PerformanceCharts: React.FC<PerformanceChartsProps> = ({
    chartData,
    chartView,
    setChartView,
    selectedPeriod,
    setSelectedPeriod,
    periodMetrics,
    loading,
    benchmark,
    setBenchmark,
    hideBenchmarkSelector = false,
    hideKPIs = false,
    noWrapper = false,
}) => {
    const inner = (
        <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 mb-5 border-b border-wallstreet-700">
                <div className="flex items-center gap-2 flex-wrap">
                        {([
                            { key: 'absolute', label: 'Absolute' },
                            { key: 'relative', label: 'Relative' },
                            { key: 'drawdowns', label: 'Drawdowns' },
                        ] as { key: ChartView; label: string }[]).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setChartView(key)}
                                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${chartView === key
                                    ? 'bg-wallstreet-accent text-white shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                        {!hideBenchmarkSelector && (<>
                            <div className="w-px h-5 bg-wallstreet-700 mx-1" />
                            <span className="text-xs text-wallstreet-500 font-mono uppercase tracking-wider">vs.</span>
                            {BENCHMARKS.map(({ key, label, title, color }) => (
                                <button
                                    key={key}
                                    onClick={() => setBenchmark(key)}
                                    title={title}
                                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${benchmark === key
                                        ? 'text-white shadow-sm'
                                        : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                        }`}
                                    style={benchmark === key ? { backgroundColor: color } : undefined}
                                >
                                    {label}
                                </button>
                            ))}
                        </>)}
                </div>
                <div className="flex bg-wallstreet-900 p-1 rounded-xl">
                        {(['2025', 'YTD', 'Q1', '3M', '6M', '1Y'] as Period[]).map((period) => (
                            <React.Fragment key={period}>
                                <button
                                    onClick={() => setSelectedPeriod(period)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period
                                        ? 'bg-wallstreet-accent text-white shadow-sm'
                                        : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-700'
                                        }`}
                                >
                                    {period}
                                </button>
                                {period === '2025' && <div className="mx-1 h-4 w-px bg-wallstreet-600" />}
                            </React.Fragment>
                        ))}
                </div>
            </div>

            {/* Unified 70/30 Panel for All Views */}
            <UnifiedPerformancePanel
                chartData={chartData}
                chartView={chartView}
                periodMetrics={periodMetrics}
                selectedPeriod={selectedPeriod}
                benchmark={benchmark}
                loading={loading}
                hideKPIs={hideKPIs}
                noWrapper={noWrapper}
            />

        </>
    );

    return noWrapper ? (
        <div className="flex flex-col h-full bg-wallstreet-800 p-6 rounded-2xl border border-wallstreet-700 shadow-sm">{inner}</div>
    ) : inner;
};
