import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, Printer, ChevronDown } from 'lucide-react';
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
import {
    loadPortfolioConfig, convertConfigToItems,
    fetchPortfolioBackcast, fetchRiskContribution, fetchIndexExposure, fetchSectors,
    loadSectorWeights, loadAssetGeo
} from '../services/api';
import { formatPct } from '../utils/formatters';
import { aggregatePeriodData } from './attribution/attributionUtils';
import { getDateRangeForPeriod } from '../utils/dateUtils';
import {
    PortfolioItem, BackcastResponse, RiskContributionResponse,
} from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportViewProps {
    data: PortfolioItem[];
    customSectors?: Record<string, Record<string, number>>;
    assetGeo?: Record<string, string>;
    onViewAttribution?: () => void;
    isActive?: boolean;
    sharedBackcast?: BackcastResponse | null;
    sharedBackcastLoading?: boolean;
}

const getPeriodCutoff = (period: Period): Date => getDateRangeForPeriod(period).start;

// ── KPI cell ──────────────────────────────────────────────────────────────────

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

// ── Main Component ─────────────────────────────────────────────────────────────

export const ReportView: React.FC<ReportViewProps> = ({ data, customSectors, assetGeo, onViewAttribution, isActive, sharedBackcast, sharedBackcastLoading }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [backcast, setBackcast] = useState<BackcastResponse | null>(null);
    const [riskData, setRiskData] = useState<RiskContributionResponse | null>(null);
    const [benchmarkSectors, setBenchmarkSectors] = useState<any[]>([]);
    const [benchmarkGeography, setBenchmarkGeography] = useState<any[]>([]);
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
    const [localCustomSectorWeights, setLocalCustomSectorWeights] = useState<Record<string, Record<string, number>>>({});
    const [localAssetGeo, setLocalAssetGeo] = useState<Record<string, string>>({});
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('YTD');
    const [chartView, setChartView] = useState<ChartView>('absolute');

    const effectiveCustomSectors = customSectors || localCustomSectorWeights;
    const effectiveAssetGeo = assetGeo || localAssetGeo;

    // When shared backcast updates (e.g. portfolio reloaded), sync it in directly
    useEffect(() => {
        if (sharedBackcast != null) setBackcast(sharedBackcast);
        else if (sharedBackcastLoading) setLoading(true);
    }, [sharedBackcast, sharedBackcastLoading]);

    // ── Data fetching ─────────────────────────────────────────────────────────
    useEffect(() => {
        // Skip when tab is not active; re-fetch every time it becomes active.
        if (isActive === false) return;
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const config = await loadPortfolioConfig();
                if (cancelled) return;
                if (!config.tickers || config.tickers.length === 0) {
                    setError('No portfolio configured. Go to Upload to configure your portfolio.');
                    setLoading(false);
                    return;
                }
                const allItems = convertConfigToItems(config.tickers, config.periods);
                if (allItems.length === 0) {
                    setError('Portfolio has no holdings with positive weights.');
                    setLoading(false);
                    return;
                }
                const latestDate = allItems.reduce((max, i) => i.date > max ? i.date : max, allItems[0].date);
                const latestItems = allItems.filter(i => i.date === latestDate && i.weight > 0);

                const tickersToFetch: string[] = Array.from(new Set(
                    data.filter(d => d.ticker && !d.ticker.includes('$')).map(d => d.ticker.trim())
                ));
                const [backcastRes, riskRes, exposure, sectors] = await Promise.all([
                    sharedBackcast != null ? Promise.resolve(sharedBackcast) : fetchPortfolioBackcast(allItems),
                    fetchRiskContribution(latestItems),
                    fetchIndexExposure(),
                    fetchSectors(tickersToFetch),
                ]);
                if (cancelled) return;
                if (backcastRes.error) { setError(backcastRes.error); setLoading(false); return; }
                if (riskRes.error) { setError(riskRes.error); setLoading(false); return; }
                setBackcast(backcastRes);
                setRiskData(riskRes);
                if (exposure?.sectors) setBenchmarkSectors(exposure.sectors);
                if (exposure?.geography) setBenchmarkGeography(exposure.geography);
                if (Object.keys(sectors).length > 0) setSectorMap(prev => ({ ...prev, ...sectors }));

                // Load fallback sector weights if not provided via props
                if (!customSectors) {
                    try {
                        const loadedWeights = await loadSectorWeights();
                        if (Object.keys(loadedWeights).length > 0) {
                            setLocalCustomSectorWeights(loadedWeights);
                        }
                    } catch (e) {
                        console.error("Failed to load sector weights:", e);
                    }
                }

                // Load fallback asset geo if not provided via props
                if (!assetGeo) {
                    try {
                        const loadedGeo = await loadAssetGeo();
                        if (Object.keys(loadedGeo).length > 0) {
                            setLocalAssetGeo(loadedGeo);
                        }
                    } catch (e) {
                        console.error("Failed to load asset geo:", e);
                    }
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
    }, [isActive]);

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

    const chartData = useMemo(() => {
        if (!backcast?.series?.length) return [];
        const { start, end } = getDateRangeForPeriod(selectedPeriod);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end ? end.toISOString().split('T')[0] : '9999-12-31';
        const filtered = backcast.series.filter(p => p.date >= startStr && p.date <= endStr);
        if (!filtered.length) return [];
        const s = filtered[0];
        if (chartView === 'absolute') {
            return filtered.map(p => ({
                date: p.date,
                Portfolio: ((p.portfolio - s.portfolio) / s.portfolio) * 100,
                Benchmark: ((p.benchmark - s.benchmark) / s.benchmark) * 100,
            }));
        } else if (chartView === 'relative') {
            return filtered.map(p => ({
                date: p.date,
                'Excess Return': ((p.portfolio - s.portfolio) / s.portfolio - (p.benchmark - s.benchmark) / s.benchmark) * 100,
            }));
        } else {
            let maxPtf = s.portfolio, maxBmk = s.benchmark;
            return filtered.map(p => {
                maxPtf = Math.max(maxPtf, p.portfolio);
                maxBmk = Math.max(maxBmk, p.benchmark);
                return {
                    date: p.date,
                    Portfolio: ((p.portfolio - maxPtf) / maxPtf) * 100,
                    Benchmark: ((p.benchmark - maxBmk) / maxBmk) * 100,
                };
            });
        }
    }, [backcast, selectedPeriod, chartView]);

    const periodAttribution = useMemo(() => {
        if (!data.length) return [];
        const cutoff = getPeriodCutoff(selectedPeriod);
        const filtered = data.filter(d => new Date(d.date) >= cutoff);
        return aggregatePeriodData(filtered).sort((a, b) => b.contribution - a.contribution);
    }, [data, selectedPeriod]);

    const sortedHoldings = useMemo(() => {
        const sorted = [...enrichedCurrentHoldings].sort((a, b) => b.weight - a.weight);
        let cum = 0;
        return sorted.map(item => {
            cum += item.weight;
            return { ...item, cumulative: cum };
        });
    }, [enrichedCurrentHoldings]);

    const fetchedAt = useMemo(() => {
        const times = [backcast?.fetchedAt, riskData?.fetchedAt].filter(Boolean) as string[];
        return times.length > 0 ? times.sort()[0] : null;
    }, [backcast, riskData]);


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
            { key: 'CA',   label: 'Canada',         flag: '🇨🇦', weight: buckets.CA,   color: '#ef4444' },
            { key: 'US',   label: 'United States',   flag: '🇺🇸', weight: buckets.US,   color: '#3b82f6' },
            { key: 'INTL', label: 'International',   flag: '🌍', weight: buckets.INTL, color: '#10b981' },
            { key: 'Cash', label: 'Cash',            flag: '💵', weight: buckets.Cash, color: '#6b7280' },
        ].filter(r => r.weight > 0.001);
    }, [enrichedCurrentHoldings, effectiveAssetGeo]);

    // ── Sunburst segments for portfolio geography ──────────────────────────────
    const portfolioGeoSegments = useMemo(() => {
        const na = geoExposure.filter(g => g.key === 'US' || g.key === 'CA');
        const intl = geoExposure.filter(g => g.key === 'INTL');
        const cash = geoExposure.filter(g => g.key === 'Cash');
        const segs = [];
        const naVal = na.reduce((s, g) => s + g.weight, 0);
        if (naVal > 0.001) segs.push({ name: 'NA', value: parseFloat(naVal.toFixed(2)), color: '#1e3a8a',
            children: na.map(g => ({ name: g.label, value: g.weight, color: g.color })) });
        const intlVal = intl.reduce((s, g) => s + g.weight, 0);
        if (intlVal > 0.001) segs.push({ name: 'INTL', value: parseFloat(intlVal.toFixed(2)), color: '#9d174d',
            children: intl.map(g => ({ name: g.label, value: g.weight, color: g.color })) });
        const cashVal = cash.reduce((s, g) => s + g.weight, 0);
        if (cashVal > 0.001) segs.push({ name: 'Cash', value: parseFloat(cashVal.toFixed(2)), color: '#374151',
            children: cash.map(g => ({ name: g.label, value: g.weight, color: '#6b7280' })) });
        return segs;
    }, [geoExposure]);

    // ── States ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="space-y-2 w-48">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-2 bg-wallstreet-700 rounded animate-pulse" style={{ width: `${100 - i * 10}%` }} />
                    ))}
                </div>
                <p className="text-wallstreet-500 text-sm font-mono uppercase tracking-wider">Loading Report Data</p>
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

    if (!backcast || !riskData) return null;

    const m = backcast.metrics;
    const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="report-page p-6 max-w-[100vw] h-screen flex flex-col overflow-hidden">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex justify-between items-center mb-5">
                <div>
                    <h1 className="text-2xl font-bold font-mono text-wallstreet-text tracking-tighter">
                        PORTFOLIO <span className="text-wallstreet-accent">REPORT</span>
                    </h1>
                    <p className="text-wallstreet-500 text-xs mt-0.5 font-mono">
                        {genDate} &middot; Benchmark: 75/25 Composite (75% ACWI (CAD) + 25% XIC.TO)
                    </p>
                </div>
                <div className="print-hide flex items-center gap-3">
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
                <div style={{ gridColumn: '1 / 3' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl p-5 shadow-sm flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                        <h3 className="text-xs font-bold font-mono text-wallstreet-text uppercase tracking-wider">Performance</h3>
                        <div className="flex items-center gap-1">
                            {(['absolute', 'relative', 'drawdowns'] as ChartView[]).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setChartView(v)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                                        chartView === v
                                            ? 'bg-wallstreet-accent text-white shadow-sm'
                                            : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900'
                                    }`}
                                >
                                    {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="flex bg-wallstreet-900 p-0.5 rounded-lg">
                            {(['2025', 'YTD', '3M', '6M', '1Y'] as Period[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setSelectedPeriod(p)}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all duration-200 ${
                                        selectedPeriod === p
                                            ? 'bg-wallstreet-accent text-white shadow-sm'
                                            : 'text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-700'
                                    }`}
                                >
                                    {p}
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
                </div>

                {/* ── ROW 1, COL 3-4: Benchmark Deviation + Regional Sector Tilt ── */}
                <div style={{ gridColumn: '3 / 5' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl p-5 shadow-sm flex gap-6 h-full">
                    <div className="flex flex-col flex-1 min-w-0">
                        <SectorDeviationCard
                            currentHoldings={enrichedCurrentHoldings}
                            benchmarkData={benchmarkSectors}
                            benchmarkGeography={benchmarkGeography}
                            assetGeo={effectiveAssetGeo}
                            noWrapper
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
                        />
                    </div>
                </div>

                {/* ── ROW 2, COL 1: Top 10 Holdings ────────────────────────── */}
                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <h3 className="text-xs font-bold font-mono text-wallstreet-text uppercase tracking-wider">
                            Holdings
                        </h3>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-xs font-mono table-fixed">
                                <thead className="sticky top-0 bg-wallstreet-800 z-10">
                                    <tr className="text-wallstreet-500 uppercase text-[11px] tracking-wide border-b border-wallstreet-700">
                                        <th className="text-left pb-2.5 w-[22%]">Ticker</th>
                                        <th className="text-left pb-2.5 w-[38%]">Sector</th>
                                        <th className="text-right pb-2.5 pr-8 w-[20%]">Weight</th>
                                        <th className="text-right pb-2.5 pr-8 w-[20%]">Cumul.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedHoldings.map((item, i) => (
                                        <tr key={item.ticker} className={i % 2 === 0 ? '' : 'bg-wallstreet-900/40'}>
                                            <td className="py-1.5 font-bold text-wallstreet-text">{item.ticker}</td>
                                            <td className="py-1.5"><SectorBadge sector={item.sector ?? '—'} /></td>
                                            <td className="py-1.5 text-right pr-8 text-wallstreet-text">{formatPct(item.weight)}</td>
                                            <td className="py-1.5 text-right pr-8 text-wallstreet-500 font-bold">{formatPct(item.cumulative)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ── ROW 2, COL 2: Geographic Breakdown ───────────────────── */}
                <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl p-4 shadow-sm flex flex-col overflow-hidden">
                    <p className="text-[10px] font-bold font-mono text-wallstreet-text uppercase tracking-wider mb-1 flex-shrink-0">Geographic Breakdown</p>
                    <div className="flex-1 min-h-0">
                        <WorldChoroplethMap
                            data={benchmarkGeography}
                            projectionConfig={{ rotate: [-10, 0, 0], scale: 118, center: [0, 45] }}
                        />
                    </div>
                </div>

                {/* ── ROW 2, COL 3: Attribution Table ─────────────────────── */}
                <div style={{ gridColumn: '3 / 4' }} className="min-h-0 overflow-hidden">
                    <AttributionTable
                        title={selectedPeriod}
                        items={periodAttribution}
                        contributionFormat="pct"
                    />
                </div>

                {/* ── ROW 2, COL 4: Correlation Matrix ─────────────────────── */}
                <div style={{ gridColumn: '4 / 5' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-2xl shadow-sm overflow-hidden relative">
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(0.75)' }}>
                        <CorrelationHeatmap
                            correlationMatrix={riskData.correlationMatrix ?? { tickers: [], matrix: [] }}
                            loading={false}
                            noWrapper
                        />
                    </div>
                </div>

            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="pt-3 border-t border-wallstreet-700 flex justify-between items-center text-[10px] font-mono text-wallstreet-500">
                <span className="flex items-center gap-2">
                    Generated {genDate}
                    {fetchedAt && <><span>&middot;</span><FreshnessBadge fetchedAt={fetchedAt} /></>}
                </span>
                <span>Past performance does not guarantee future results. For informational purposes only.</span>
            </div>
        </div>
    );
};
