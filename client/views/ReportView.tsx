import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, Printer, ChevronDown, ArrowUpRight, Maximize2, X } from 'lucide-react';
import { WorldChoroplethMap } from '../components/WorldChoroplethMap';
import { FreshnessBadge } from '../components/ui/FreshnessBadge';
import { SectorDeviationCard } from '../components/SectorDeviationCard';
import { SectorGeographyDeviationCard } from '../components/SectorGeographyDeviationCard';
import { AttributionTable } from './attribution/AttributionTable';
import { SectorBadge } from './risk/RiskTable';
import { CorrelationHeatmap } from './risk/CorrelationHeatmap';
import type { ChartView } from './performance/PerformanceCharts';
import type { Period } from './performance/PerformanceKPIs';
import { UnifiedPerformancePanel } from './performance/UnifiedPerformancePanel';
import { LoadingSequencePanel, type LoadStatus } from '../components/ui/LoadingSequencePanel';
import {
    fetchIndexExposure, fetchSectors,
    loadSectorWeights, loadAssetGeo
} from '../services/api';
import { formatPct } from '../utils/formatters';
import { getDateRangeForPeriod } from '../utils/dateUtils';
import { buildOnePagerAttributionItems } from '../selectors/attributionSelectors';
import { buildCanonicalPerformanceSeries, buildChartDataFromSeries, filterSeriesByPeriod } from '../selectors/performanceSelectors';
import {
    PortfolioItem, PerformanceVariantResponse, PortfolioWorkspaceAttribution, RiskContributionResponse, ViewState,
} from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportViewProps {
    data: PortfolioItem[];
    customSectors?: Record<string, Record<string, number>>;
    assetGeo?: Record<string, string>;
    onNavigate?: (view: ViewState) => void;
    isActive?: boolean;
    performanceVariant?: PerformanceVariantResponse | null;
    workspaceRisk?: RiskContributionResponse | null;
    attributionData?: PortfolioWorkspaceAttribution | null;
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const PERIOD_LABELS: Record<Period, string> = {
    'YTD': 'Year to Date',
    'Q1': 'Q1',
    'Q2': 'Q2',
    'Q3': 'Q3',
    'Q4': 'Q4',
    '3M': '3 Months',
    '6M': '6 Months',
    '1Y': '1 Year',
    '2025': 'Full Year 2025',
};

const REPORT_PERIOD_GROUPS: readonly { key: string; periods: Period[] }[] = [
    { key: 'year', periods: ['2025'] },
    { key: 'rolling', periods: ['YTD', '3M', '6M', '1Y'] },
    { key: 'quarters', periods: ['Q1', 'Q2', 'Q3', 'Q4'] },
];

const getPeriodTitle = (period: Period): string => {
    const { start, end } = getDateRangeForPeriod(period);
    const endDate = end ?? new Date();
    return `${PERIOD_LABELS[period]} (${fmtDate(start)} – ${fmtDate(endDate)})`;
};

// ── KPI cell ──────────────────────────────────────────────────────────────────

const REPORT_LOAD_STEPS = [
    { key: 'benchmark', label: 'Benchmark Exposure', sub: 'Sector & geography weights' },
    { key: 'sectors', label: 'Sector Classification', sub: 'Holdings & industry mapping' },
    { key: 'performance', label: 'Performance Series', sub: 'Cumulative returns & drawdowns' },
    { key: 'attribution', label: 'Return Attribution', sub: 'Ticker-level contribution breakdown' },
    { key: 'risk', label: 'Risk Metrics', sub: 'Volatility, beta & correlation matrix' },
] as const;

const KPI: React.FC<{
    label: string;
    value: string;
    positive?: boolean;
    neutral?: boolean;
    sub?: string;
}> = ({ label, value, positive, neutral, sub }) => {
    const color = neutral
        ? 'text-wallstreet-text'
        : positive === true ? 'text-green-600'
            : positive === false ? 'text-red-500'
                : 'text-wallstreet-text';
    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl px-2 py-3 text-center shadow-sm">
            <p className="text-[10px] text-wallstreet-500 uppercase tracking-wider font-medium leading-tight mb-1">{label}</p>
            <p className={`text-sm font-bold font-mono leading-tight ${color}`}>{value}</p>
            {sub && <p className="text-[9px] text-wallstreet-500 mt-0.5">{sub}</p>}
        </div>
    );
};

// ── Panel wrapper — bare group container (no absolute buttons) ───────────────

const PanelWrapper: React.FC<{
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}> = ({ children, className = '', style }) => (
    <div className={`group ${className}`} style={style}>
        {children}
    </div>
);

// Returns a small row of [→ tab] [⤢ expand] buttons meant to live inline next
// to each panel's <h3> title.  They fade in on parent group-hover.
const PanelActions: React.FC<{
    panelId: string;
    targetView: ViewState;
    onNavigate?: (view: ViewState) => void;
    onExpand: (panelId: string) => void;
}> = ({ panelId, targetView, onNavigate, onExpand }) => (
    <span className="print-hide inline-flex items-center gap-0.5">
        <button
            onClick={() => onNavigate?.(targetView)}
            title="Go to tab"
            className="p-1 text-wallstreet-400 hover:text-wallstreet-accent hover:bg-wallstreet-700 rounded transition-colors"
        >
            <ArrowUpRight size={14} />
        </button>
        <button
            onClick={() => onExpand(panelId)}
            title="Expand"
            className="p-1 text-wallstreet-400 hover:text-wallstreet-accent hover:bg-wallstreet-700 rounded transition-colors"
        >
            <Maximize2 size={14} />
        </button>
    </span>
);

// ── Main Component ─────────────────────────────────────────────────────────────

export const ReportView: React.FC<ReportViewProps> = ({ data, customSectors, assetGeo, onNavigate, isActive, performanceVariant, workspaceRisk, attributionData }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [benchmarkSectors, setBenchmarkSectors] = useState<any[]>([]);
    const [benchmarkGeography, setBenchmarkGeography] = useState<any[]>([]);
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
    const [localCustomSectorWeights, setLocalCustomSectorWeights] = useState<Record<string, Record<string, number>>>({});
    const [localAssetGeo, setLocalAssetGeo] = useState<Record<string, string>>({});
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const [chartView, setChartView] = useState<ChartView>('absolute');
    const [loadProgress, setLoadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({
        benchmark: 'pending', sectors: 'pending',
    });
    const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
    // Close expanded panel on ESC
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedPanel(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const effectiveCustomSectors = customSectors || localCustomSectorWeights;
    const effectiveAssetGeo = assetGeo || localAssetGeo;

    // ── Data fetching ─────────────────────────────────────────────────────────
    // Re-runs whenever the tab becomes active OR the portfolio data changes.
    // The `cancelled` flag inside prevents duplicate in-flight requests on
    // StrictMode double-invocations.
    useEffect(() => {
        // Skip when tab is explicitly not active.
        if (isActive === false) return;
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setLoadProgress({ benchmark: 'pending', sectors: 'pending', performance: 'pending', attribution: 'pending', risk: 'pending' });
            const trackFetch = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
                try {
                    const result = await fn();
                    if (!cancelled) setLoadProgress(prev => ({ ...prev, [key]: 'done' }));
                    return result;
                } catch (err) {
                    if (!cancelled) setLoadProgress(prev => ({ ...prev, [key]: 'error' }));
                    throw err;
                }
            };
            try {
                if (!data.length) {
                    setError('No portfolio configured. Go to Upload to configure your portfolio.');
                    setLoading(false);
                    return;
                }
                if (!performanceVariant || !workspaceRisk) {
                    setLoading(true);
                    return;
                }
                if (performanceVariant.error) {
                    setError(performanceVariant.error);
                    setLoading(false);
                    return;
                }
                if (workspaceRisk.error) {
                    setError(workspaceRisk.error);
                    setLoading(false);
                    return;
                }

                const tickersToFetch: string[] = Array.from(new Set(
                    data
                        .filter(d => d.ticker && !d.isCash && !d.ticker.includes('$'))
                        .map(d => d.ticker.trim())
                ));
                const exposure = await trackFetch('benchmark', fetchIndexExposure);
                if (cancelled) return;
                const sectors = await trackFetch('sectors', () => fetchSectors(tickersToFetch));
                if (cancelled) return;
                setLoadProgress(prev => ({ ...prev, performance: 'done', attribution: 'done', risk: 'done' }));
                const [loadedWeights, loadedGeo] = await Promise.all([
                    customSectors ? Promise.resolve(null) : loadSectorWeights(),
                    assetGeo ? Promise.resolve(null) : loadAssetGeo(),
                ]);
                if (cancelled) return;

                if (exposure?.sectors) setBenchmarkSectors(exposure.sectors);
                if (exposure?.geography) setBenchmarkGeography(exposure.geography);
                if (Object.keys(sectors).length > 0) setSectorMap(prev => ({ ...prev, ...sectors }));
                if (!customSectors && loadedWeights && Object.keys(loadedWeights).length > 0) {
                    setLocalCustomSectorWeights(loadedWeights);
                }
                if (!assetGeo && loadedGeo && Object.keys(loadedGeo).length > 0) {
                    setLocalAssetGeo(loadedGeo);
                }
            } catch (e) {
                if (cancelled) return;
                setError(String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchData();
        return () => { cancelled = true; };
    }, [assetGeo, customSectors, data, isActive, performanceVariant, workspaceRisk]);

    // ── Derived data ──────────────────────────────────────────────────────────

    const enrichedCurrentHoldings = useMemo(() => {
        if (!data.length) return [];
        const latestDate = [...new Set(data.map(d => d.date))].sort().pop()!;
        return data
            .filter(d => d.date === latestDate && d.weight > 0.001)
            .map(item => {
                const cleanTicker = item.ticker.trim();
                let sector = sectorMap[cleanTicker] || sectorMap[item.ticker] || item.sector;
                if (item.isCash || cleanTicker.toUpperCase() === '*CASH*') sector = 'CASH';
                const sectorWeights = effectiveCustomSectors[cleanTicker] || effectiveCustomSectors[item.ticker];
                return sectorWeights ? { ...item, sector, sectorWeights } : sector ? { ...item, sector } : item;
            });
    }, [data, effectiveCustomSectors, sectorMap]);

    const canonicalPerformanceSeries = useMemo(() => (
        buildCanonicalPerformanceSeries(attributionData, '75/25')
    ), [attributionData]);

    const chartData = useMemo(() => {
        return buildChartDataFromSeries(
            filterSeriesByPeriod(canonicalPerformanceSeries, selectedPeriod),
            chartView,
        );
    }, [canonicalPerformanceSeries, chartView, selectedPeriod]);

    const periodAttribution = useMemo(() => (
        buildOnePagerAttributionItems(attributionData, selectedPeriod)
    ), [attributionData, selectedPeriod]);

    const getHoldingDisplayName = (item: PortfolioItem) => (
        item.isMutualFund ? item.ticker : (item.companyName?.trim() || item.ticker)
    );

    const getHoldingSectorDisplay = (sector?: string) => {
        if (!sector) return '—';
        switch (sector) {
            case 'Basic Materials':
            case 'Materials':
                return 'Materials';
            case 'Consumer Cyclical':
                return 'Discretionary';
            case 'Consumer Discretionary':
                return 'Discretionary';
            case 'Communication':
                return 'Communications';
            case 'Communication Services':
                return 'Communications';
            case 'Energy':
                return 'Energy';
            case 'Industrials':
            case 'Industrial':
                return 'Industrials';
            case 'Consumer Defensive':
                return 'Staples';
            case 'Consumer Staples':
                return 'Staples';
            case 'Financial Services':
            case 'Financials':
            case 'Financial':
                return 'Financials';
            case 'Real Estate':
                return 'Real Estate';
            case 'Information Technology':
                return 'Technology';
            case 'Technology':
                return 'Technology';
            case 'Healthcare':
                return 'Health Care';
            case 'Health Care':
                return 'Health Care';
            case 'Mixed':
                return 'Mixed';
            case 'CASH':
                return 'CASH';
            default:
                return sector;
        }
    };

    const sortedHoldings = useMemo(() => {
        const sorted = [...enrichedCurrentHoldings].sort((a, b) => b.weight - a.weight);
        let cum = 0;
        return sorted.map(item => {
            cum += item.weight;
            return { ...item, displayName: getHoldingDisplayName(item), cumulative: cum };
        });
    }, [enrichedCurrentHoldings]);

    const fetchedAt = useMemo(() => {
        const times = [attributionData?.performanceFetchedAt, workspaceRisk?.fetchedAt].filter(Boolean) as string[];
        return times.length > 0 ? times.sort()[0] : null;
    }, [attributionData, workspaceRisk]);

    const topCorrelationMatrix = workspaceRisk?.correlationMatrix ?? { tickers: [], matrix: [] };


    // ── Portfolio geographic exposure ──────────────────────────────────────────
    const geoExposure = useMemo(() => {
        const buckets: Record<string, number> = { CA: 0, US: 0, INTL: 0, Cash: 0 };
        enrichedCurrentHoldings.forEach(item => {
            if (item.sector === 'CASH' || item.ticker.toUpperCase() === '*CASH*') {
                buckets.Cash += item.weight;
                return;
            }
            let region = 'US';
            if (effectiveAssetGeo[item.ticker]) {
                region = effectiveAssetGeo[item.ticker];
            } else if (item.ticker.toUpperCase().endsWith('.TO')) {
                region = 'CA';
            }
            if (buckets[region] !== undefined) {
                buckets[region] += item.weight;
            } else {
                buckets.INTL += item.weight;
            }
        });
        return [
            { key: 'CA', label: 'Canada', flag: '🇨🇦', weight: buckets.CA, color: '#ef4444' },
            { key: 'US', label: 'United States', flag: '🇺🇸', weight: buckets.US, color: '#3b82f6' },
            { key: 'INTL', label: 'International', flag: '🌍', weight: buckets.INTL, color: '#10b981' },
            { key: 'Cash', label: 'Cash', flag: '💵', weight: buckets.Cash, color: '#6b7280' },
        ].filter(r => r.weight > 0.001);
    }, [enrichedCurrentHoldings, effectiveAssetGeo]);

    // ── Sunburst segments for portfolio geography ──────────────────────────────
    const portfolioGeoSegments = useMemo(() => {
        const na = geoExposure.filter(g => g.key === 'US' || g.key === 'CA');
        const intl = geoExposure.filter(g => g.key === 'INTL');
        const cash = geoExposure.filter(g => g.key === 'Cash');
        const segs = [];
        const naVal = na.reduce((s, g) => s + g.weight, 0);
        if (naVal > 0.001) segs.push({
            name: 'NA', value: parseFloat(naVal.toFixed(2)), color: '#1e3a8a',
            children: na.map(g => ({ name: g.label, value: g.weight, color: g.color }))
        });
        const intlVal = intl.reduce((s, g) => s + g.weight, 0);
        if (intlVal > 0.001) segs.push({
            name: 'INTL', value: parseFloat(intlVal.toFixed(2)), color: '#9d174d',
            children: intl.map(g => ({ name: g.label, value: g.weight, color: g.color }))
        });
        const cashVal = cash.reduce((s, g) => s + g.weight, 0);
        if (cashVal > 0.001) segs.push({
            name: 'Cash', value: parseFloat(cashVal.toFixed(2)), color: '#374151',
            children: cash.map(g => ({ name: g.label, value: g.weight, color: '#6b7280' }))
        });
        return segs;
    }, [geoExposure]);

    // ── States ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] select-none">
                <LoadingSequencePanel
                    title="Loading Report Data"
                    steps={REPORT_LOAD_STEPS.map(step => ({ ...step, status: loadProgress[step.key] as LoadStatus }))}
                />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-start gap-3 p-6 m-6 bg-red-950 border border-red-700 rounded-xl text-red-400">
                <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
                <p className="text-sm font-mono">{error}</p>
            </div>
        );
    }

    if (!performanceVariant || !workspaceRisk) return null;

    const m = performanceVariant.metrics;
    const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Expanded panel content ────────────────────────────────────────────────
    const renderExpandedContent = (panelId: string) => {
        switch (panelId) {
            case 'performance':
                return (
                    <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between mb-3 flex-shrink-0">
                            <h3 className="text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider">Performance</h3>
                        <div className="flex items-center gap-1">
                            {(['absolute', 'relative', 'drawdowns'] as ChartView[]).map(v => (
                                <button key={v} onClick={() => setChartView(v)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${chartView === v ? 'bg-wallstreet-accent text-white shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'}`}>
                                        {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                            ))}
                        </div>
                        </div>
                        {/* Explicit flex column so noWrapper flex-1 resolves in expanded modal */}
                        <div className="flex-1 min-h-0 flex flex-col">
                            <UnifiedPerformancePanel chartData={chartData} chartView={chartView} periodMetrics={null} selectedPeriod={selectedPeriod} benchmark="75/25" loading={false} hideKPIs noWrapper />
                        </div>
                    </div>
                );
            case 'deviation':
                return (
                    <div className="flex gap-8 h-full">
                        <div className="flex flex-col flex-1 min-w-0">
                            <SectorDeviationCard currentHoldings={enrichedCurrentHoldings} benchmarkData={benchmarkSectors} benchmarkGeography={benchmarkGeography} assetGeo={effectiveAssetGeo} noWrapper isActive={isActive} />
                        </div>
                        <div className="w-px bg-wallstreet-700 self-stretch" />
                        <div className="flex flex-col flex-1 min-w-0">
                            <SectorGeographyDeviationCard currentHoldings={enrichedCurrentHoldings} benchmarkSectors={benchmarkSectors} benchmarkGeography={benchmarkGeography} assetGeo={effectiveAssetGeo} noWrapper />
                        </div>
                    </div>
                );
            case 'holdings':
                return (
                    <div className="flex flex-col">
                        <h3 className="text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider mb-3 flex-shrink-0">Holdings</h3>
                        <div>
                            <table className="w-full text-sm font-mono table-fixed">
                                <thead className="sticky top-0 bg-wallstreet-800 z-10">
                                    <tr className="text-wallstreet-500 uppercase text-xs tracking-wide border-b border-wallstreet-700">
                                        <th className="text-left pb-2.5 w-[44%]">Name</th>
                                        <th className="text-left pb-2.5 w-[26%]">Sector</th>
                                        <th className="text-right pb-2.5 pr-8 w-[15%]">Weight</th>
                                        <th className="text-right pb-2.5 pr-8 w-[15%]">Cumul.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedHoldings.map((item, i) => (
                                        <tr
                                            key={item.ticker}
                                            className={`group/holding-row transition-colors ${i % 2 === 0 ? '' : 'bg-wallstreet-900/40'}`}
                                        >
                                            <td className="py-1 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 font-medium text-wallstreet-text truncate" title={item.displayName}>{item.displayName}</td>
                                            <td className="py-1 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40"><SectorBadge sector={getHoldingSectorDisplay(item.sector)} className="!text-xs" /></td>
                                            <td className="py-1 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 text-right pr-8 text-wallstreet-text">{formatPct(item.weight)}</td>
                                            <td className="py-1 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 text-right pr-8 text-wallstreet-500 font-bold">{formatPct(item.cumulative)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'geography':
                return (
                    <div className="flex flex-col h-full">
                        <p className="text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider mb-3 flex-shrink-0">Geographic Breakdown</p>
                        <div className="flex-1 min-h-0">
                            <WorldChoroplethMap data={benchmarkGeography} projectionConfig={{ rotate: [-10, 0, 0], scale: 135, center: [0, 45] }} />
                        </div>
                    </div>
                );
            case 'attribution':
                return (
                    <div style={{ zoom: 2 }}>
                        <AttributionTable title={getPeriodTitle(selectedPeriod)} items={periodAttribution} contributionFormat="pct" />
                    </div>
                );
            case 'correlation':
                return (
                    <div className="flex flex-col h-full">
                        <p className="text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider mb-3 flex-shrink-0 z-10 relative">Correlation Matrix</p>
                        <div className="flex-1 flex items-center justify-center min-h-0 relative">
                            {/* Scale up the strictly-sized pixel component to fill the square modal frame */}
                            <div className="scale-[1.1] md:scale-[1.25] lg:scale-[1.4] xl:scale-[1.5] origin-center transition-transform">
                                <CorrelationHeatmap correlationMatrix={topCorrelationMatrix} loading={false} noWrapper />
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="report-page p-6 max-w-[100vw] h-screen flex flex-col overflow-hidden">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="grid gap-4 mb-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold font-mono text-wallstreet-text tracking-tighter">
                        PORTFOLIO <span className="text-wallstreet-accent">REPORT</span>
                    </h1>
                    <p className="text-wallstreet-500 text-xs mt-0.5 font-mono">
                        {genDate} &middot; Benchmark: 75/25 Composite (75% ACWI (CAD) + 25% XIC.TO)
                    </p>
                </div>
                <div className="print-hide flex justify-center">
                    <div className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-wallstreet-700 bg-wallstreet-800 px-3 py-2 shadow-sm">
                        {REPORT_PERIOD_GROUPS.map((group, groupIndex) => (
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
                                            {period}
                                        </button>
                                    ))}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
                <div className="print-hide flex items-center justify-end gap-3">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-wallstreet-accent text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                        <Printer size={15} /> Print / PDF
                    </button>
                </div>
            </div>

            {/* ── Main Bento: 2-col left (perf + holdings) · 2-col right (4 panels) ── */}
            <div className="grid gap-4 mb-4 flex-1 min-h-0" style={{
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
            }}>

                {/* ── ROW 1, COL 1-2: Performance Chart ───────────────────── */}
                <PanelWrapper style={{ gridColumn: '1 / 3' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl p-5 shadow-sm flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                        <h3 className="flex items-center gap-1.5 text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider flex-shrink-0">
                            Performance
                            <PanelActions panelId="performance" targetView={ViewState.PERFORMANCE} onNavigate={onNavigate} onExpand={setExpandedPanel} />
                        </h3>
                        <div className="flex items-center gap-1">
                            {(['absolute', 'relative', 'drawdowns'] as ChartView[]).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setChartView(v)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${chartView === v
                                        ? 'bg-wallstreet-accent text-white shadow-sm'
                                        : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                        }`}
                                >
                                    {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <UnifiedPerformancePanel
                        chartData={chartData}
                        chartView={chartView}
                        periodMetrics={null}
                        selectedPeriod={selectedPeriod}
                        benchmark="75/25"
                        loading={false}
                        hideKPIs
                        noWrapper
                    />
                </PanelWrapper>

                {/* ── ROW 1, COL 3-4: Benchmark Deviation + Regional Sector Tilt ── */}
                <PanelWrapper style={{ gridColumn: '3 / 5' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl p-5 shadow-sm flex gap-6 h-full relative">
                    <div className="flex flex-col flex-1 min-w-0">
                        <SectorDeviationCard
                            currentHoldings={enrichedCurrentHoldings}
                            benchmarkData={benchmarkSectors}
                            benchmarkGeography={benchmarkGeography}
                            assetGeo={effectiveAssetGeo}
                            noWrapper
                            isActive={isActive}
                            titleActions={<PanelActions panelId="deviation" targetView={ViewState.DASHBOARD} onNavigate={onNavigate} onExpand={setExpandedPanel} />}
                        />
                    </div>
                    <div className="w-px bg-wallstreet-700 self-stretch" />
                    <div className="flex flex-col flex-1 min-w-0">
                        <SectorGeographyDeviationCard
                            currentHoldings={enrichedCurrentHoldings}
                            benchmarkSectors={benchmarkSectors}
                            benchmarkGeography={benchmarkGeography}
                            assetGeo={effectiveAssetGeo}
                            noWrapper
                            titleActions={<PanelActions panelId="deviation" targetView={ViewState.DASHBOARD} onNavigate={onNavigate} onExpand={setExpandedPanel} />}
                        />
                    </div>
                    {/* Action buttons are now passed inline to the cards directly above */}
                </PanelWrapper>

                {/* ── ROW 2, COL 1: Top 10 Holdings ────────────────────────── */}
                <PanelWrapper className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <h3 className="flex items-center gap-1.5 text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider flex-shrink-0">
                            Holdings
                            <PanelActions panelId="holdings" targetView={ViewState.DASHBOARD} onNavigate={onNavigate} onExpand={setExpandedPanel} />
                        </h3>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            <table className="w-full text-sm font-mono table-fixed">
                                <thead className="sticky top-0 bg-wallstreet-800 z-10">
                                    <tr className="text-wallstreet-500 uppercase text-xs tracking-wide border-b border-wallstreet-700">
                                        <th className="text-right pb-2.5 pr-4 w-[7%]">#</th>
                                        <th className="text-left pb-2.5 pl-3 w-[33%]">Name</th>
                                        <th className="text-left pb-2.5 pl-3 w-[24%]">Sector</th>
                                        <th className="text-right pb-2.5 pr-8 w-[18%]">Weight</th>
                                        <th className="text-right pb-2.5 pr-8 w-[18%]">Cumul.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedHoldings.map((item, i) => (
                                        <tr
                                            key={item.ticker}
                                            className={`group/holding-row transition-colors ${i % 2 === 0 ? '' : 'bg-wallstreet-900/40'}`}
                                        >
                                            <td className="py-1 pr-4 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 text-right text-wallstreet-500 font-bold">{i + 1}</td>
                                            <td className="py-1 pl-3 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 font-medium text-wallstreet-text truncate" title={item.displayName}>{item.displayName}</td>
                                            <td className="py-1 pl-3 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40"><SectorBadge sector={getHoldingSectorDisplay(item.sector)} className="!text-xs" /></td>
                                            <td className="py-1 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 text-right pr-8 text-wallstreet-text">{formatPct(item.weight)}</td>
                                            <td className="py-1 bg-transparent transition-colors group-hover/holding-row:bg-slate-100 dark:group-hover/holding-row:bg-slate-700/40 text-right pr-8 text-wallstreet-500 font-bold">{formatPct(item.cumulative)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </PanelWrapper>

                {/* ── ROW 2, COL 2: Geographic Breakdown ───────────────────── */}
                <PanelWrapper className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl p-4 shadow-sm flex flex-col overflow-hidden">
                    <p className="flex items-center gap-1.5 text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider mb-1 flex-shrink-0">
                        Geographic Breakdown
                        <PanelActions panelId="geography" targetView={ViewState.INDEX} onNavigate={onNavigate} onExpand={setExpandedPanel} />
                    </p>
                    <div className="flex-1 min-h-0">
                        <WorldChoroplethMap
                            data={benchmarkGeography}
                            projectionConfig={{ rotate: [-10, 0, 0], scale: 118, center: [0, 45] }}
                        />
                    </div>
                </PanelWrapper>

                {/* ── ROW 2, COL 3: Attribution Table ─────────────────────── */}
                <PanelWrapper style={{ gridColumn: '3 / 4' }} className="min-h-0 overflow-hidden relative">
                    <AttributionTable
                        title={getPeriodTitle(selectedPeriod)}
                        items={periodAttribution}
                        contributionFormat="pct"
                    />
                    {/* Action buttons overlay the component's own dark title bar — always visible */}
                    <span className="print-hide absolute top-[10px] right-3 inline-flex items-center gap-0.5">
                        <button onClick={() => onNavigate?.(ViewState.ATTRIBUTION)} title="Go to tab" className="p-1 text-wallstreet-400 hover:text-white hover:bg-wallstreet-700 rounded transition-colors"><ArrowUpRight size={14} /></button>
                        <button onClick={() => setExpandedPanel('attribution')} title="Expand" className="p-1 text-wallstreet-400 hover:text-white hover:bg-wallstreet-700 rounded transition-colors"><Maximize2 size={14} /></button>
                    </span>
                </PanelWrapper>

                {/* ── ROW 2, COL 4: Correlation Matrix ─────────────────────── */}
                <PanelWrapper style={{ gridColumn: '4 / 5' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl shadow-sm overflow-hidden relative">
                    {/* Title + actions pinned to top-left */}
                    <div className="absolute top-3 left-4 z-10 flex items-center gap-1.5 print-hide">
                        <p className="text-[16px] font-bold font-mono text-wallstreet-text uppercase tracking-wider">Correlation</p>
                        <PanelActions panelId="correlation" targetView={ViewState.RISK_CONTRIBUTION} onNavigate={onNavigate} onExpand={setExpandedPanel} />
                    </div>
                    <div style={{ position: 'absolute', top: '53%', left: '50%', transform: 'translate(-50%, -50%) scale(0.78)' }}>
                        <CorrelationHeatmap
                            correlationMatrix={topCorrelationMatrix}
                            loading={false}
                            noWrapper
                        />
                    </div>
                </PanelWrapper>

            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="pt-3 border-t border-wallstreet-700 flex justify-between items-center text-[10px] font-mono text-wallstreet-500">
                <span className="flex items-center gap-2">
                    Generated {genDate}
                    {fetchedAt && <><span>&middot;</span><FreshnessBadge fetchedAt={fetchedAt} /></>}
                </span>
                <span>Past performance does not guarantee future results. For informational purposes only.</span>
            </div>

            {/* ── Expand overlay ──────────────────────────────────────────── */}
            {expandedPanel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
                    <div
                        className="absolute inset-0 backdrop-blur-md bg-wallstreet-900/40"
                        onClick={() => setExpandedPanel(null)}
                    />
                    <div className="relative z-10">
                        <div
                            className={`bg-wallstreet-800 border border-wallstreet-700 rounded-2xl shadow-2xl p-6 flex flex-col overflow-hidden max-w-[95vw] max-h-[95vh] ${expandedPanel === 'correlation' ? 'aspect-square w-auto h-[85vh] max-h-[90vw]' :
                                        expandedPanel === 'deviation' ? 'w-[95vw] xl:w-[1400px] h-[85vh] xl:max-h-[900px]' :
                                            expandedPanel === 'performance' ? 'w-[98vw] xl:w-[1700px] h-[93vh] xl:max-h-[1050px]' :
                                                expandedPanel === 'geography' ? 'aspect-[4/3] w-auto h-[85vh] max-h-[90vw] max-w-[90vw]' :
                                            expandedPanel === 'holdings' ? 'w-[90vw] lg:w-[980px] h-auto max-h-[95vh]' :
                                            expandedPanel === 'attribution' ? 'w-[80vw] lg:w-[900px] h-auto max-h-[95vh] overflow-auto' :
                                            'w-[80vw] lg:w-[1000px] h-[85vh] lg:max-h-[800px]'
                                }`}
                        >
                            <div className={expandedPanel === 'attribution' || expandedPanel === 'holdings' ? '' : 'flex-1 min-h-0 overflow-hidden'}>
                                {renderExpandedContent(expandedPanel)}
                            </div>
                        </div>
                        <button
                            onClick={() => setExpandedPanel(null)}
                            className="absolute -top-3.5 -right-3.5 p-1.5 bg-wallstreet-900 border border-wallstreet-600 hover:border-wallstreet-500 hover:bg-wallstreet-800 text-wallstreet-400 hover:text-wallstreet-text rounded-full shadow-lg transition-colors z-50"
                            title="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
