import React from 'react';
import type { PerformanceMetrics, PerformancePeriod, PerformanceWindowRange } from '../../types';
import { UnifiedPerformancePanel } from './UnifiedPerformancePanel';
import type { PerformanceChartView } from '../../selectors/performanceSelectors';
import { PERFORMANCE_PERIOD_GROUPS, getPerformancePeriodButtonLabel } from '../../utils/performancePeriods';

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
    selectedPeriod: PerformancePeriod;
    setSelectedPeriod: (v: PerformancePeriod) => void;
    periodMetrics: PerformanceMetrics | null;
    loading: boolean;
    benchmark: string;
    setBenchmark: (v: string) => void;
    windowRanges?: Partial<Record<PerformancePeriod, PerformanceWindowRange>> | null;
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
    windowRanges,
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
                <div className="print-hide flex justify-center">
                    <div className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-wallstreet-700 bg-wallstreet-800 px-3 py-2 shadow-sm">
                        {PERFORMANCE_PERIOD_GROUPS.map((group, groupIndex) => (
                            <React.Fragment key={group.key}>
                                {groupIndex > 0 && <span className="px-1 text-xs font-bold text-wallstreet-500">/</span>}
                                <div className="flex items-center gap-1">
                                    {group.periods.map((period) => (
                                        <button
                                            key={period}
                                            onClick={() => setSelectedPeriod(period)}
                                            className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 ${selectedPeriod === period
                                                ? 'bg-wallstreet-accent text-white shadow-sm'
                                                : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                                }`}
                                        >
                                            {getPerformancePeriodButtonLabel(period, windowRanges?.[period])}
                                        </button>
                                    ))}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
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
