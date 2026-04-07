import React, { useMemo, useState, useCallback, Component, ErrorInfo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Dropdown } from '../../components/Dropdown';
import { AlertTriangle, Calendar, Grid, Layers, Info, Printer } from 'lucide-react';
import { PortfolioWorkspaceAttribution } from '../../types';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import { formatBps } from '../../utils/formatters';
import { getAvailableCalendarYears } from '../../utils/selectedYear';
import { buildCanonicalMonthlyHistory, compoundContribution, compoundReturnPct } from './canonicalAttribution';
import { AttributionTable } from './AttributionTable';
import { WaterfallChart, SectorAttributionCharts } from './AttributionCharts';
import {
    buildCanonicalContributorPages,
    buildCanonicalPortfolioMonthlyPerformance,
    type CanonicalAttributionMatrixLayout,
    type CanonicalContributorPageLayout,
} from '../../selectors/attributionSelectors';

// â”€â”€ ErrorBoundary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null, errorInfo: ErrorInfo | null }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("AttributionView Crashed:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-900 border border-red-200 rounded-lg m-4">
                    <h2 className="text-xl font-bold mb-4">Something went wrong in Attribution View</h2>
                    <p className="font-mono text-sm mb-2">{this.state.error && this.state.error.toString()}</p>
                    <details className="whitespace-pre-wrap font-mono text-xs bg-wallstreet-900 p-4 border border-red-100 rounded">
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AttributionViewProps {
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    tablesRequest?: number;
    attributionData?: PortfolioWorkspaceAttribution | null;
}

type AttributionTickerStat = {
    ticker: string;
    totalContrib: number;
    totalReturn: number;
    ytdReturn: number;
    history: ReturnType<typeof buildCanonicalMonthlyHistory>['rows'];
    latestWeight: number;
    stdDevContrib: number;
    beta: number;
    riskScore: number;
};

type AttributionMatrixRow = {
    ticker: string;
    total: number;
    totalContribution: number;
    totalPerformance: number;
    latestWeight: number;
    [key: string]: string | number | boolean | null;
};

const QUARTER_MONTHS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number[]> = {
    Q1: [0, 1, 2],
    Q2: [3, 4, 5],
    Q3: [6, 7, 8],
    Q4: [9, 10, 11],
};

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;

const buildAttributionTickerStats = (
    tickers: string[],
    sourceData: ReturnType<typeof buildCanonicalMonthlyHistory>['rows'],
    allMonths: Date[],
    yearData: ReturnType<typeof buildCanonicalMonthlyHistory>['rows'],
    selectedYear: number,
): AttributionTickerStat[] => {
    const portRetSeries: number[] = [];
    allMonths.forEach(month => {
        const monthData = sourceData.filter(d => {
            const dDate = new Date(d.date);
            return dDate.getFullYear() === month.getFullYear() && dDate.getMonth() === month.getMonth();
        });
        const sumContrib = monthData.reduce((sum, d) => sum + (d.contribution || 0), 0);
        portRetSeries.push(sumContrib);
    });

    const portMean = portRetSeries.reduce((a, b) => a + b, 0) / (portRetSeries.length || 1);
    const portVariance = portRetSeries.reduce((a, b) => a + Math.pow(b - portMean, 2), 0) / (portRetSeries.length || 1);

    return tickers.map(ticker => {
        const history = sourceData.filter(d => d.ticker === ticker);
        const yearHistory = yearData.filter(d => d.ticker === ticker && new Date(d.date).getFullYear() === selectedYear);

        const totalContrib = compoundContribution(history);
        const tickerContribSeries: number[] = [];

        allMonths.forEach(month => {
            const entry = history.find(d => {
                const dDate = new Date(d.date);
                return dDate.getFullYear() === month.getFullYear() && dDate.getMonth() === month.getMonth();
            });
            tickerContribSeries.push(entry ? (entry.contribution || 0) : 0);
        });

        const meanContrib = tickerContribSeries.reduce((a, b) => a + b, 0) / (tickerContribSeries.length || 1);
        const varianceContrib = tickerContribSeries.reduce((a, b) => a + Math.pow(b - meanContrib, 2), 0) / (tickerContribSeries.length || 1);
        const stdDevContrib = Math.sqrt(varianceContrib);

        let covariance = 0;
        for (let i = 0; i < portRetSeries.length; i++) {
            covariance += (tickerContribSeries[i] - meanContrib) * (portRetSeries[i] - portMean);
        }
        covariance /= (portRetSeries.length || 1);

        const beta = portVariance !== 0 ? covariance / portVariance : 0;
        const latestEntry = history.reduce((latest, current) => {
            return new Date(current.date).getTime() > new Date(latest.date).getTime() ? current : latest;
        }, history[0]);
        const latestWeight = latestEntry ? latestEntry.weight : 0;

        return {
            ticker,
            totalContrib,
            totalReturn: compoundReturnPct(history),
            ytdReturn: compoundReturnPct(yearHistory),
            history,
            latestWeight,
            stdDevContrib,
            beta,
            riskScore: stdDevContrib,
        };
    }).filter(t => t.latestWeight > 0.001 || Math.abs(t.totalContrib) > 0.0001);
};

const buildAttributionMatrixData = (
    stats: AttributionTickerStat[],
    allMonths: Date[],
) => stats.map(stat => {
    const row: AttributionMatrixRow = {
        ticker: stat.ticker,
        total: stat.totalContrib,
        totalContribution: stat.totalContrib,
        totalPerformance: stat.totalReturn,
        latestWeight: stat.latestWeight,
    };

    allMonths.forEach(monthDate => {
        const key = monthKey(monthDate);
        const monthlyEntry = stat.history.find(h => {
            const d = new Date(h.date);
            return d.getMonth() === monthDate.getMonth() && d.getFullYear() === monthDate.getFullYear();
        });
        if (monthlyEntry) {
            row[key] = monthlyEntry.contribution;
            row[`p-${key}`] = monthlyEntry.returnPct * 100;
            row[`partial-${key}`] = !!monthlyEntry.partial;
            row[`w-${key}`] = monthlyEntry.weight;
        } else {
            row[key] = null;
            row[`p-${key}`] = null;
            row[`partial-${key}`] = false;
            row[`w-${key}`] = 0;
        }
    });

    return row;
}).filter(row => {
    const hasAnyNonNullContrib = allMonths.some(monthDate => row[monthKey(monthDate)] !== null);
    const tickerUpper = row.ticker.toUpperCase();
    return hasAnyNonNullContrib && tickerUpper !== 'CASH' && tickerUpper !== '*CASH*';
});

// â”€â”€ FuturePeriodMessage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FuturePeriodMessage = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-12 text-center animate-in fade-in zoom-in duration-500">
        <div className="bg-wallstreet-800 p-10 rounded-2xl border border-wallstreet-700 shadow-xl max-w-2xl relative overflow-hidden">
            {/* Subtle background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-wallstreet-900 rounded-full -mr-16 -mt-16 z-0" />

            <div className="relative z-10">
                <div className="w-20 h-20 bg-wallstreet-accent rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg rotate-3">
                    <Calendar size={40} className="text-white -rotate-3" />
                </div>

                <h2 className="text-2xl font-black text-wallstreet-text mb-4 uppercase tracking-tight font-mono">Future Period Selected</h2>

                <div className="h-1 w-20 bg-wallstreet-accent mx-auto mb-6 rounded-full" />

                <p className="text-wallstreet-500 mb-8 leading-relaxed font-medium">
                    The requested analysis period is currently in the future. To populate this panel with data once available, please ensure your data is correctly implemented in the <span className="text-wallstreet-text font-bold uppercase tracking-tight">Data Import</span> tab.
                </p>

                <div className="flex items-center justify-center gap-3 text-wallstreet-500 font-mono text-xs font-bold uppercase tracking-widest bg-wallstreet-900 py-3 px-6 rounded-xl border border-wallstreet-700">
                    <Info size={16} />
                    <span>Action Required in Data Import Tab</span>
                </div>
            </div>
        </div>
    </div>
);

const formatMatrixReturn = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return value < 0 ? `(${Math.abs(value).toFixed(2)}%)` : `${value.toFixed(2)}%`;
};

const formatMatrixContribution = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return formatBps(value);
};

const formatContributionShare = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return value < 0 ? `(${Math.abs(value).toFixed(2)}%)` : `${value.toFixed(2)}%`;
};

const CanonicalContributorPagesSection: React.FC<{
    pages: CanonicalContributorPageLayout[];
    year: number;
}> = ({ pages, year }) => {
    if (pages.length === 0) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 text-center">
                    <p className="text-wallstreet-500 text-sm font-mono">No canonical contributor tables available for {year}.</p>
                </div>
            </div>
        );
    }
 
    return (
        <div className="space-y-6 print-area">
            {pages.map((page, pageIndex) => (
                <div key={page.key} className="print-page">
                    {pageIndex === 0 && (
                        <div className="hidden print-title-block">
                            <h1 className="font-bold text-center">Top Contributors &amp; Disruptors â€” {year}</h1>
                        </div>
                    )}
                    {page.rows.map((cards, rowIndex) => (
                        <React.Fragment key={`${page.key}-row-${rowIndex}`}>
                            {rowIndex > 0 && <div className="h-5" aria-hidden="true" />}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-row">
                                {cards.map((card) => card.isEmpty ? (
                                    <div key={card.key} />
                                ) : (
                                    <AttributionTable
                                        key={card.key}
                                        title={card.title}
                                        items={card.items}
                                        isQuarter={card.isQuarter}
                                        status={card.status}
                                    />
                                ))}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            ))}
        </div>
    );
};

const CanonicalMatrixTable: React.FC<{
    layout: CanonicalAttributionMatrixLayout;
    emptyMessage: string;
    showContributionShare?: boolean;
}> = ({ layout, emptyMessage, showContributionShare = false }) => {
    if (layout.columns.length === 0 || layout.rows.length === 0) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 text-center">
                    <p className="text-wallstreet-500 text-sm font-mono">{emptyMessage}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-wallstreet-700">
            <table className="w-full text-xs font-mono border-collapse">
                <thead>
                    <tr className="bg-wallstreet-800 border-b border-wallstreet-700">
                        <th className="text-left px-4 py-3 text-wallstreet-500 font-bold sticky left-0 bg-wallstreet-800 min-w-[90px]">Ticker</th>
                        {layout.columns.map((column) => (
                            <th key={column.key} colSpan={3} className="text-center px-2 py-3 text-wallstreet-500 font-bold border-l border-wallstreet-700 whitespace-nowrap">
                                {column.label}
                            </th>
                        ))}
                        <th colSpan={showContributionShare ? 3 : 2} className="text-center px-2 py-3 text-wallstreet-accent font-bold border-l border-wallstreet-700">YTD</th>
                    </tr>
                    <tr className="bg-wallstreet-900 border-b border-wallstreet-700">
                        <th className="sticky left-0 bg-wallstreet-900 px-4 py-2 text-wallstreet-500"></th>
                        {layout.columns.map((column) => (
                            <React.Fragment key={`${column.key}-subhead`}>
                                <th className="px-2 py-2 text-right text-wallstreet-500 border-l border-wallstreet-700">Wt%</th>
                                <th className="px-2 py-2 text-right text-wallstreet-500">Ret%</th>
                                <th className="px-2 py-2 text-right text-wallstreet-500">Contrib</th>
                            </React.Fragment>
                        ))}
                        <th className="px-2 py-2 text-right text-wallstreet-500 border-l border-wallstreet-700">Ret%</th>
                        <th className="px-2 py-2 text-right text-wallstreet-accent font-bold">Contrib</th>
                        {showContributionShare && (
                            <th className="px-2 py-2 text-right text-wallstreet-accent font-bold">% of Contribution</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {layout.rows.map((row, rowIndex) => (
                        <tr key={row.ticker} className={`border-b border-wallstreet-800 hover:bg-wallstreet-700/40 transition-colors ${rowIndex % 2 === 0 ? '' : 'bg-wallstreet-800/30'}`}>
                            <td className="sticky left-0 px-4 py-2.5 font-bold text-wallstreet-text bg-wallstreet-900">{row.ticker}</td>
                            {row.cells.map((cell, cellIndex) => {
                                const hasData = cell.returnPct !== null && cell.contribution !== null;
                                return (
                                    <React.Fragment key={`${row.ticker}-cell-${cellIndex}`}>
                                        <td className="px-2 py-2.5 text-right text-wallstreet-500 border-l border-wallstreet-800">{hasData ? `${(cell.weight ?? 0).toFixed(1)}%` : '-'}</td>
                                        <td className={`px-2 py-2.5 text-right ${!hasData ? 'text-wallstreet-500' : (cell.returnPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {formatMatrixReturn(cell.returnPct)}
                                        </td>
                                        <td className={`px-2 py-2.5 text-right font-semibold ${!hasData ? 'text-wallstreet-500' : (cell.contribution ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {formatMatrixContribution(cell.contribution)}
                                        </td>
                                    </React.Fragment>
                                );
                            })}
                            <td className={`px-2 py-2.5 text-right border-l border-wallstreet-700 ${row.ytdReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMatrixReturn(row.ytdReturn)}</td>
                            <td className={`px-2 py-2.5 text-right font-bold ${row.ytdContribution >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMatrixContribution(row.ytdContribution)}</td>
                            {showContributionShare && (
                                <td className={`px-2 py-2.5 text-right font-bold border-l border-wallstreet-700 ${row.contributionShare === null ? 'text-wallstreet-500' : row.contributionShare >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatContributionShare(row.contributionShare)}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// â”€â”€ HeatmapSection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface HeatmapSectionProps {
    matrixData: any[];
    allMonths: Date[];
    portfolioMonthlyPerformance: Record<string, number | null>;
    portfolioTotalPerformance: number | null;
    tc: ReturnType<typeof useThemeColors>;
}

const HeatmapSection: React.FC<HeatmapSectionProps> = ({ matrixData, allMonths, portfolioMonthlyPerformance, portfolioTotalPerformance, tc }) => {
    const [heatmapMode, setHeatmapMode] = useState<'CONTRIBUTION' | 'PERFORMANCE'>('CONTRIBUTION');

    const formatHeatmapReturn = useCallback((value: number) => {
        return value < 0 ? `(${Math.abs(value).toFixed(2)}%)` : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
    }, []);

    const formatHeatmapContribution = useCallback((value: number) => {
        return value < 0 ? `(${Math.abs(value).toFixed(2)}%)` : `${Math.abs(value).toFixed(2)}%`;
    }, []);

    const getHeatmapCellStyle = useCallback((value: number | null, mode: 'CONTRIBUTION' | 'PERFORMANCE') => {
        const emptyBg = tc.isDark ? '#1e293b' : '#f8fafc';
        if (value === null) {
            return {
                bg: emptyBg,
                text: tc.tickFill,
                showNeutral: true,
            };
        }

        const isPerformanceMode = mode === 'PERFORMANCE';
        const scale = isPerformanceMode ? 8 : 0.75;
        const minAlpha = isPerformanceMode ? 0.18 : 0.3;
        const maxAlpha = isPerformanceMode ? 0.9 : 1;
        const intensity = Math.min(Math.abs(value) / scale, 1);
        const alpha = minAlpha + (intensity * (maxAlpha - minAlpha));
        const rgb = value >= 0 ? '22, 163, 74' : '220, 38, 38';

        let bg = `rgba(${rgb}, ${alpha})`;
        if (Math.abs(value) < 0.0001) {
            bg = tc.isDark ? '#1e293b' : '#ffffff';
        }

        const text = intensity > (isPerformanceMode ? 0.55 : 0.45)
            ? 'white'
            : (tc.isDark ? (value >= 0 ? '#4ade80' : '#f87171') : (value >= 0 ? '#14532d' : '#7f1d1d'));

        return { bg, text, showNeutral: false };
    }, [tc.isDark, tc.tickFill]);

    const heatmapTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        const hasDataMap: Record<string, boolean> = {};
        if (heatmapMode === 'PERFORMANCE') {
            allMonths.forEach(month => {
                const key = monthKey(month);
                const value = portfolioMonthlyPerformance[key];
                totals[key] = value ?? 0;
                hasDataMap[key] = value !== null && value !== undefined;
            });

            return {
                totals,
                hasDataMap,
                grandTotal: portfolioTotalPerformance ?? 0,
            };
        }

        allMonths.forEach(month => {
            const key = monthKey(month);
            totals[key] = 0;
            hasDataMap[key] = false;
        });

        matrixData.forEach(row => {
            allMonths.forEach(month => {
                const key = monthKey(month);
                const val = row[key];
                if (val !== null && !hasDataMap[key]) {
                    hasDataMap[key] = true;
                }
                totals[key] += (typeof val === 'number' ? val : 0);
            });
        });

        return {
            totals,
            hasDataMap,
            grandTotal: portfolioTotalPerformance ?? 0,
        };
    }, [allMonths, heatmapMode, matrixData, portfolioMonthlyPerformance, portfolioTotalPerformance]);

    const heatmapFooterLabel = heatmapMode === 'PERFORMANCE' ? 'YTD Performance' : 'Portfolio Total';

    return (
        <div className="bg-wallstreet-800 rounded-xl border border-wallstreet-700 shadow-lg flex flex-col mt-6">
            <div className="flex justify-between items-start gap-4 p-6 border-b border-wallstreet-700 bg-wallstreet-900/50">
                <div>
                    <h3 className="text-lg font-mono font-black text-wallstreet-text uppercase tracking-widest">Heatmap</h3>
                    <p className="text-[11px] text-wallstreet-500 mt-2 font-mono font-bold uppercase tracking-tight">
                        {heatmapMode === 'CONTRIBUTION'
                            ? 'BPS contribution per ticker.'
                            : 'Monthly position performance per ticker. * marks partial MF NAV coverage.'}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex p-0.5 bg-wallstreet-900 rounded-lg border border-wallstreet-700">
                        {(['CONTRIBUTION', 'PERFORMANCE'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setHeatmapMode(mode)}
                                className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all ${
                                    heatmapMode === mode
                                        ? 'bg-[#0A2351] text-white shadow-sm ring-1 ring-[#0A2351]/40'
                                        : 'text-wallstreet-500 hover:text-wallstreet-text'
                                }`}
                            >
                                {mode === 'CONTRIBUTION' ? 'Contribution' : 'Performance'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="w-full">
                <table className="w-full text-[12px] border-collapse table-fixed">
                    <thead>
                        <tr>
                            <th className="px-3 py-2 text-center font-mono font-bold uppercase text-wallstreet-400 bg-wallstreet-900 border-b border-wallstreet-700 w-44 tracking-widest sticky top-0 z-30 text-sm">Ticker</th>
                            {allMonths.map(date => (
                                <th key={date.toISOString()} className="py-2 text-center font-mono font-bold uppercase text-wallstreet-400 bg-wallstreet-900 border-b border-wallstreet-700 tracking-tighter sticky top-0 z-30 text-sm">
                                    {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                </th>
                            ))}
                            <th className="px-3 py-2 text-center font-mono font-bold uppercase text-wallstreet-text bg-wallstreet-900 border-b border-wallstreet-700 border-l border-wallstreet-300 w-24 sticky top-0 z-30 text-sm">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrixData.map((row) => (
                            <tr key={row.ticker} className="hover:bg-wallstreet-900/50 transition-colors group">
                                <td className="px-3 py-0 font-mono font-bold text-wallstreet-text border-b border-wallstreet-700 truncate text-base">{row.ticker}</td>
                                {allMonths.map(date => {
                                    const key = `${date.getFullYear()}-${date.getMonth()}`;
                                    const val = heatmapMode === 'PERFORMANCE' ? row[`p-${key}`] : row[key];
                                    const isPartialMf = heatmapMode === 'PERFORMANCE' && !!row[`partial-${key}`];
                                    const { bg, text } = getHeatmapCellStyle(val, heatmapMode);

                                    return (
                                        <td key={date.toISOString()} className="p-0 border-b border-wallstreet-700 relative group/cell">
                                            {(() => {
                                                const maxW = row[`w-${key}`];
                                                const isZeroVal = val !== null && Math.abs(val) < 0.0001;
                                                const isZeroWeight = maxW !== undefined && maxW < 0.0001;
                                                const showHyphen = val === null || (isZeroVal && isZeroWeight);

                                                const displayBg = showHyphen ? (tc.isDark ? '#1e293b' : '#f8fafc') : bg;
                                                const tooltipLabel = heatmapMode === 'PERFORMANCE' ? 'Performance' : 'Contribution';

                                                return (
                                                    <div
                                                        className="w-full h-7 flex items-center justify-center font-mono font-bold cursor-default transition-transform hover:scale-110 hover:z-20 hover:shadow-sm relative text-sm"
                                                        style={{ backgroundColor: displayBg, color: showHyphen ? tc.tickFill : text }}
                                                        title={showHyphen ? undefined : `${row.ticker} - ${date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`}
                                                    >
                                                {!showHyphen ? (
                                                    <span className="opacity-100">
                                                                {heatmapMode === 'PERFORMANCE' ? formatHeatmapReturn(val!) : formatHeatmapContribution(val!)}
                                                                {isPartialMf && <sup className="ml-0.5 text-[10px] text-amber-300">*</sup>}
                                                            </span>
                                                        ) : <span className="text-gray-300">-</span>}
                                                        {!showHyphen && val !== null && (
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-2 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover/cell:opacity-100 pointer-events-none z-50 whitespace-nowrap shadow-xl flex flex-col items-center gap-1">
                                                                <div className="font-bold border-b-0 pb-0 mb-0">{row.ticker} - {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
                                                                <div className="text-wallstreet-500">{tooltipLabel}: {heatmapMode === 'PERFORMANCE' ? formatHeatmapReturn(val) : formatHeatmapContribution(val)}</div>
                                                                {isPartialMf && <div className="text-amber-300 font-bold">* Partial MF NAV coverage through the period</div>}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    );
                                })}
                                <td className="px-3 py-0 text-center font-mono font-bold border-b border-wallstreet-700 border-l border-wallstreet-300 bg-wallstreet-900/80 text-sm">
                                    {(() => {
                                        const rowTotal = heatmapMode === 'PERFORMANCE' ? (row.totalPerformance ?? 0) : row.total;
                                        const isZeroTotal = Math.abs(rowTotal) < 0.0001;
                                        const isZeroLatestWeight = (row.latestWeight || 0) < 0.0001;
                                        const showTotalHyphen = isZeroTotal && isZeroLatestWeight;

                                        if (showTotalHyphen) {
                                            return <span className="text-gray-300">-</span>;
                                        }
                                        return <span className={rowTotal >= 0 ? 'text-green-700' : 'text-red-700'}>{heatmapMode === 'PERFORMANCE' ? formatHeatmapReturn(rowTotal) : formatHeatmapContribution(rowTotal)}</span>;
                                    })()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-wallstreet-100 border-t-2 border-wallstreet-700 shadow-inner">
                            <td className="px-3 py-1 font-mono font-bold text-wallstreet-text text-xs uppercase">{heatmapFooterLabel}</td>
                            {allMonths.map(date => {
                                const key = `${date.getFullYear()}-${date.getMonth()}`;
                                const hasData = heatmapTotals.hasDataMap[key];
                                const val = heatmapTotals.totals[key];
                                return (
                                    <td key={date.toISOString()} className="px-3 py-1 text-center font-mono font-bold text-sm border-b border-wallstreet-700 border-l border-wallstreet-700">
                                        {hasData ? <span className={val >= 0 ? 'text-green-700' : 'text-red-700'}>{heatmapMode === 'PERFORMANCE' ? formatHeatmapReturn(val) : formatHeatmapContribution(val)}</span> : <span className="text-gray-300">-</span>}
                                    </td>
                                )
                            })}
                            <td className="px-3 py-1 text-center font-mono font-bold text-sm border-l border-wallstreet-300 bg-wallstreet-200 text-wallstreet-text">
                                <span className={heatmapTotals.grandTotal >= 0 ? 'text-green-800' : 'text-red-800'}>{heatmapMode === 'PERFORMANCE' ? formatHeatmapReturn(heatmapTotals.grandTotal) : formatHeatmapContribution(heatmapTotals.grandTotal)}</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// â”€â”€ AttributionHeader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AttributionHeaderProps {
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    availableYears: number[];
    fetchedAt: string | null;
    onPrint: () => void;
    timeRange: 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
    setTimeRange: (range: 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4') => void;
    currentViewMode: 'OVERVIEW' | 'TABLES';
    onViewModeChange: (mode: 'OVERVIEW' | 'TABLES') => void;
}

const AttributionHeader: React.FC<AttributionHeaderProps> = ({ selectedYear, setSelectedYear, availableYears, fetchedAt, onPrint, timeRange, setTimeRange, currentViewMode, onViewModeChange }) => {
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'TABLES'>('OVERVIEW');

    const handleViewModeChange = useCallback((mode: 'OVERVIEW' | 'TABLES') => {
        setViewMode(mode);
        onViewModeChange(mode);
    }, [onViewModeChange]);

    const handleTimeRange = useCallback((period: 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4') => {
        setTimeRange(period);
    }, [setTimeRange]);

    const handleYearChange = useCallback((val: number) => {
        setSelectedYear(val);
    }, [setSelectedYear]);

    return (
        <header className="border-b border-wallstreet-700 pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 print:hidden">
            <div>
                <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-bold font-mono text-wallstreet-text">Performance Attribution</h2>
                    <FreshnessBadge fetchedAt={fetchedAt} />
                </div>
                <p className="text-wallstreet-500 mt-1 text-sm">Allocation vs. Selection Effect Analysis (Excl. Cash)</p>
            </div>
            <div className="flex items-center gap-4">
                {/* Time Range Selector - Only visible in Overview */}
                {viewMode === 'OVERVIEW' && (
                    <div className="flex items-center bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-1 shadow-sm">
                        {['YTD', 'Q1', 'Q2', 'Q3', 'Q4'].map((period) => (
                            <button key={period} onClick={() => handleTimeRange(period as any)} className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-all ${timeRange === period ? 'bg-wallstreet-accent text-white shadow-md' : 'text-wallstreet-500 hover:bg-wallstreet-900'}`}>{period}</button>
                        ))}
                    </div>
                )}

                {/* Print PDF Button - Only visible in Tables view */}
                {viewMode === 'TABLES' && (
                    <button
                        onClick={onPrint}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <Printer size={18} /> Print PDF
                    </button>
                )}

                {/* Year Selector */}
                <Dropdown
                    value={selectedYear}
                    onChange={(val) => handleYearChange(Number(val))}
                    options={availableYears.map((year) => ({ value: year, label: year }))}
                    className="min-w-[100px]"
                />

                {/* View Mode Toggle */}
                <div className="flex p-1 bg-wallstreet-200 rounded-xl">
                    <button onClick={() => handleViewModeChange('OVERVIEW')} className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-2 ${viewMode === 'OVERVIEW' ? 'bg-wallstreet-800 text-wallstreet-accent shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text'}`}><Grid size={14} /> Overview</button>
                    <button onClick={() => handleViewModeChange('TABLES')} className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-2 ${viewMode === 'TABLES' ? 'bg-wallstreet-800 text-wallstreet-accent shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text'}`}><Layers size={14} /> Tables</button>
                </div>
            </div>
        </header>
    );
};

// â”€â”€ AttributionViewContent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const AttributionViewContent: React.FC<AttributionViewProps> = ({ selectedYear, setSelectedYear, tablesRequest, attributionData }) => {
    const analysisResponse = attributionData;
    const tc = useThemeColors();
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'TABLES'>('OVERVIEW');
    const availableYears = useMemo(() => (
        getAvailableCalendarYears(
            [
                ...(analysisResponse?.monthlyPeriods?.map((period) => period.end) ?? []),
                ...(analysisResponse?.periods?.map((period) => period.end) ?? []),
            ],
            [selectedYear, new Date().getFullYear()],
        )
    ), [analysisResponse, selectedYear]);

    // Deep-link from Portfolio Report: switch to TABLES mode when requested
    React.useEffect(() => {
        if ((tablesRequest ?? 0) > 0) setViewMode('TABLES');
    }, [tablesRequest]);

    // Part 4 â€” Dev-only invariant check: monthly YTD â‰ˆ period YTD per ticker
    React.useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        if (!analysisResponse) return;
        const { periodSheet, monthlySheet } = analysisResponse;
        periodSheet.forEach(pRow => {
            const mRow = monthlySheet.find(r => r.ticker === pRow.ticker);
            if (mRow) {
                const diff = Math.abs(pRow.ytdContrib - mRow.ytdContrib);
                if (diff > 0.0001) {
                    console.warn(
                        `[Attribution] YTD invariant broken for ${pRow.ticker}: ` +
                        `period=${pRow.ytdContrib.toFixed(6)}, monthly=${mRow.ytdContrib.toFixed(6)}, diff=${diff.toFixed(6)}`
                    );
                }
            }
        });
    }, [analysisResponse]);
    const [timeRange, setTimeRange] = useState<'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('YTD');
    const [regionFilter, setRegionFilter] = useState<'ALL' | 'US' | 'CA'>('ALL');
    const [benchmarkMode, setBenchmarkMode] = useState<'SECTOR' | 'SP500' | 'TSX'>('SECTOR');
    const fetchedAt = null;

    const isFuture = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        if (selectedYear < currentYear) return false;
        if (selectedYear > currentYear) return true;

        const quarterStarts: Record<string, number> = { 'Q1': 0, 'Q2': 3, 'Q3': 6, 'Q4': 9 };
        if (timeRange === 'YTD') return false;
        return now.getMonth() < quarterStarts[timeRange];
    }, [selectedYear, timeRange]);

    const handlePrint = () => {
        window.print();
    };

    const canonicalMonthlyHistory = useMemo(() => buildCanonicalMonthlyHistory(analysisResponse), [analysisResponse]);

    const cleanData = useMemo(() => canonicalMonthlyHistory.rows, [canonicalMonthlyHistory]);
    const yearData = useMemo(() => cleanData.filter(d => new Date(d.date).getFullYear() === selectedYear), [cleanData, selectedYear]);

    const allMonths = useMemo(() => Array.from({ length: 12 }, (_, monthIndex) => new Date(selectedYear, monthIndex, 1)), [selectedYear]);

    const filteredOverviewData = useMemo(() => {
        if (timeRange === 'YTD') return yearData;
        const allowedMonths = QUARTER_MONTHS[timeRange];
        return yearData.filter(d => allowedMonths.includes(new Date(d.date).getMonth()));
    }, [timeRange, yearData]);

    const overviewUniqueTickers = useMemo(() => Array.from(new Set(filteredOverviewData.map(d => d.ticker))), [filteredOverviewData]);
    const overviewTickerStats = useMemo(
        () => buildAttributionTickerStats(overviewUniqueTickers, filteredOverviewData, allMonths, yearData, selectedYear),
        [overviewUniqueTickers, filteredOverviewData, allMonths, yearData, selectedYear],
    );

    const sortedByContrib = useMemo(() => [...overviewTickerStats].sort((a, b) => b.totalContrib - a.totalContrib), [overviewTickerStats]);
    const matrixData = useMemo(() => buildAttributionMatrixData(sortedByContrib, allMonths), [sortedByContrib, allMonths]);

    const selectedOverviewLayout = useMemo(() => (
        analysisResponse?.overviewLayouts?.[String(selectedYear)]?.[timeRange] ?? null
    ), [analysisResponse, selectedYear, timeRange]);

    const portfolioMonthlyPerformance = useMemo(() => (
        buildCanonicalPortfolioMonthlyPerformance(analysisResponse, allMonths, selectedYear, timeRange)
    ), [analysisResponse, allMonths, selectedYear, timeRange]);

    const portfolioTotalReturn = useMemo(() => {
        const rangeTotal = selectedOverviewLayout?.waterfall?.portfolioReturn;
        return typeof rangeTotal === 'number' ? rangeTotal : null;
    }, [selectedOverviewLayout]);

    const canonicalWaterfallLayout = useMemo(() => {
        const waterfall = selectedOverviewLayout?.waterfall;
        if (!waterfall?.bars?.length) {
            return {
                bars: [],
                domain: [0, 10] as [number, number],
            };
        }

        const canonicalTotal = portfolioTotalReturn;
        if (canonicalTotal === null) {
            return {
                bars: waterfall.bars,
                domain: waterfall.domain,
            };
        }

        const nonTotalBars = waterfall.bars.filter((bar) => !bar.isTotal);
        const topBars = nonTotalBars.filter((bar) => bar.name !== 'Others');
        const topBarTotal = topBars.reduce((sum, bar) => sum + Number(bar.delta ?? 0), 0);
        const othersDelta = canonicalTotal - topBarTotal;
        const hasOthersBar = nonTotalBars.some((bar) => bar.name === 'Others');
        const totalBar = waterfall.bars.find((bar) => bar.isTotal);

        const bars = topBars.map((bar) => ({ ...bar }));
        if (hasOthersBar || Math.abs(othersDelta) > 0.0001) {
            const baseOthers = nonTotalBars.find((bar) => bar.name === 'Others');
            bars.push(
                baseOthers
                    ? { ...baseOthers, value: [Math.min(topBarTotal, canonicalTotal), Math.max(topBarTotal, canonicalTotal)] as [number, number], delta: othersDelta }
                    : {
                        name: 'Others',
                        value: [Math.min(topBarTotal, canonicalTotal), Math.max(topBarTotal, canonicalTotal)] as [number, number],
                        delta: othersDelta,
                        isTotal: false,
                    },
            );
        }

        bars.push(
            totalBar
                ? {
                    ...totalBar,
                    value: [0, canonicalTotal] as [number, number],
                    delta: canonicalTotal,
                }
                : {
                    name: 'Total',
                    value: [0, canonicalTotal] as [number, number],
                    delta: canonicalTotal,
                    isTotal: true,
                },
        );

        const allValues = bars.flatMap((bar) => bar.value);
        if (allValues.length === 0) {
            return {
                bars,
                domain: [0, 10] as [number, number],
            };
        }

        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);
        const span = maxValue - minValue;
        const buffer = span > 0 ? span * 0.15 : 1;

        return {
            bars,
            domain: [minValue - buffer, maxValue + buffer] as [number, number],
        };
    }, [portfolioTotalReturn, selectedOverviewLayout]);

    const emptySectorAttributionData = useMemo(() => ({
        data: [],
        selectionDomain: [-0.01, 0.01] as [number, number],
        allocationDomain: [-0.01, 0.01] as [number, number],
        interactionDomain: [-0.01, 0.01] as [number, number],
    }), []);

    const canonicalSectorAttributionData = useMemo(() => (
        selectedOverviewLayout?.sectorAttribution?.[regionFilter]?.[benchmarkMode] ?? emptySectorAttributionData
    ), [benchmarkMode, emptySectorAttributionData, regionFilter, selectedOverviewLayout]);

    const canonicalContributorPages = useMemo(() => (
        buildCanonicalContributorPages(analysisResponse, selectedYear)
    ), [analysisResponse, selectedYear]);

    if (!analysisResponse) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div className="bg-wallstreet-800 p-8 rounded-xl border border-wallstreet-700 shadow-sm max-w-lg">
                    <AlertTriangle size={48} className="text-wallstreet-accent mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-wallstreet-text mb-2">No Attribution Data Found</h2>
                    <p className="text-wallstreet-500 mb-6">Load a workspace with canonical attribution data.</p>
                </div>
            </div>
        );
    }

    if (!analysisResponse.monthlySheet.length || !analysisResponse.periodSheet.length) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div className="bg-wallstreet-800 p-8 rounded-xl border border-wallstreet-700 shadow-sm max-w-lg">
                    <AlertTriangle size={48} className="text-wallstreet-accent mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-wallstreet-text mb-2">Canonical Attribution Missing</h2>
                    <p className="text-wallstreet-500 mb-6">The workspace loaded, but the canonical attribution sheets are empty.</p>
                </div>
            </div>
        );
    }

    if (!cleanData.some(d => d.contribution !== undefined)) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div className="bg-wallstreet-800 p-8 rounded-xl border border-wallstreet-700 shadow-sm max-w-lg">
                    <AlertTriangle size={48} className="text-wallstreet-accent mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-wallstreet-text mb-2">No Attribution Data Found</h2>
                    <p className="text-wallstreet-500 mb-6">Import a dataset with Return and Contribution columns.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[100vw] mx-auto p-4 md:p-6 space-y-6">
            <AttributionHeader
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                availableYears={availableYears}
                fetchedAt={fetchedAt}
                currentViewMode={viewMode}
                onViewModeChange={setViewMode}
                onPrint={handlePrint}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
            />




            {viewMode === 'OVERVIEW' ? (
                isFuture ? (
                    <FuturePeriodMessage />
                ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[500px]">

                        <WaterfallChart waterfallData={canonicalWaterfallLayout.bars} waterfallDomain={canonicalWaterfallLayout.domain} />

                        <SectorAttributionCharts
                            sectorAttributionData={canonicalSectorAttributionData}
                            regionFilter={regionFilter}
                            setRegionFilter={(region) => {
                                setRegionFilter(region);
                                // Auto-correct incompatible region/benchmark combos
                                if (region === 'US' && benchmarkMode === 'TSX') setBenchmarkMode('SP500');
                                if (region === 'CA' && benchmarkMode === 'SP500') setBenchmarkMode('TSX');
                                if (region === 'ALL' && benchmarkMode !== 'SECTOR') setBenchmarkMode('SECTOR');
                            }}
                            benchmarkMode={benchmarkMode}
                            setBenchmarkMode={setBenchmarkMode}
                            isAttributionLoading={false}
                        />
                    </div>



                        <HeatmapSection
                            matrixData={matrixData}
                            allMonths={allMonths}
                            portfolioMonthlyPerformance={portfolioMonthlyPerformance}
                            portfolioTotalPerformance={portfolioTotalReturn}
                            tc={tc}
                        />
                </div>
                )
            ) : (
                    <div className="space-y-4">
                        <CanonicalContributorPagesSection
                            pages={canonicalContributorPages}
                            year={selectedYear}
                        />
                    </div>
                )}
        </div>
    );
};

export const AttributionView: React.FC<AttributionViewProps> = (props) => (
    <ErrorBoundary>
        <AttributionViewContent {...props} />
    </ErrorBoundary>
);
