import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, Printer } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useThemeColors } from '../hooks/useThemeColors';
import { FreshnessBadge } from '../components/ui/FreshnessBadge';
import { SectorDeviationCard } from '../components/SectorDeviationCard';
import { SectorGeographyDeviationCard } from '../components/SectorGeographyDeviationCard';
import { AttributionTable } from './attribution/AttributionTable';
import {
    loadPortfolioConfig, convertConfigToItems,
    fetchPortfolioBackcast, fetchRiskContribution, fetchIndexExposure, fetchSectors,
    loadSectorWeights, loadAssetGeo
} from '../services/api';
import { formatPct, formatPercent } from '../utils/formatters';
import { aggregatePeriodData } from './attribution/attributionUtils';
import {
    PortfolioItem, BackcastResponse, RiskContributionResponse,
    BackcastSeriesPoint
} from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportViewProps {
    data: PortfolioItem[];
    customSectors?: Record<string, Record<string, number>>;
    assetGeo?: Record<string, string>;
    onViewAttribution?: () => void;
}

type Period = '1M' | '3M' | '6M' | 'YTD' | '1Y';

const PERIOD_LABELS: Record<Period, string> = {
    '1M': 'Last Month',
    '3M': 'Last 3 Months',
    '6M': 'Last 6 Months',
    'YTD': 'Year to Date',
    '1Y': 'Last 12 Months',
};

const getPeriodCutoff = (period: Period): Date => {
    const now = new Date();
    if (period === '1M') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
    if (period === '3M') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
    if (period === '6M') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
    if (period === 'YTD') { return new Date(now.getFullYear(), 0, 1); }
    /* 1Y */ const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d;
};

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

const ttStyle = (tc: ReturnType<typeof useThemeColors>) => ({
    backgroundColor: tc.tooltipBg,
    border: `1px solid ${tc.gridStroke}`,
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
});

// ── Main Component ─────────────────────────────────────────────────────────────

export const ReportView: React.FC<ReportViewProps> = ({ data, customSectors, assetGeo, onViewAttribution }) => {
    const tc = useThemeColors();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [backcast, setBackcast] = useState<BackcastResponse | null>(null);
    const [riskData, setRiskData] = useState<RiskContributionResponse | null>(null);
    const [benchmarkSectors, setBenchmarkSectors] = useState<any[]>([]);
    const [benchmarkGeography, setBenchmarkGeography] = useState<any[]>([]);
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
    const [localCustomSectorWeights, setLocalCustomSectorWeights] = useState<Record<string, Record<string, number>>>({});
    const [localAssetGeo, setLocalAssetGeo] = useState<Record<string, string>>({});
    const [period, setPeriod] = useState<Period>('YTD');

    const effectiveCustomSectors = customSectors || localCustomSectorWeights;
    const effectiveAssetGeo = assetGeo || localAssetGeo;

    // ── Data fetching ─────────────────────────────────────────────────────────
    useEffect(() => {
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

                const tickersToFetch = Array.from(new Set(
                    data.filter(d => d.ticker && !d.ticker.includes('$')).map(d => d.ticker.trim())
                ));
                const [backcastRes, riskRes, exposure, sectors] = await Promise.all([
                    fetchPortfolioBackcast(allItems),
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
    }, []);

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

    const top10 = useMemo(() => {
        if (!data.length) return [];
        const latestDate = [...new Set(data.map(d => d.date))].sort().pop()!;
        return data
            .filter(d => d.date === latestDate && d.weight > 0.001)
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 10);
    }, [data]);

    const chartData = useMemo(() => {
        if (!backcast?.series?.length) return [];
        const cutoff = getPeriodCutoff(period);
        const filtered = backcast.series.filter((p: BackcastSeriesPoint) => new Date(p.date) >= cutoff);
        if (!filtered.length) return [];
        const base = filtered[0];
        return filtered.map((p: BackcastSeriesPoint) => ({
            date: p.date,
            portfolio: ((p.portfolio - base.portfolio) / base.portfolio) * 100,
            benchmark: ((p.benchmark - base.benchmark) / base.benchmark) * 100,
        }));
    }, [backcast, period]);

    const periodAttribution = useMemo(() => {
        if (!data.length) return [];
        const cutoff = getPeriodCutoff(period);
        const filtered = data.filter(d => new Date(d.date) >= cutoff);
        return aggregatePeriodData(filtered).sort((a, b) => b.contribution - a.contribution);
    }, [data, period]);

    const fetchedAt = useMemo(() => {
        const times = [backcast?.fetchedAt, riskData?.fetchedAt].filter(Boolean) as string[];
        return times.length > 0 ? times.sort()[0] : null;
    }, [backcast, riskData]);

    // ── Extract monthly data for attribution cards ──────────────────────────────
    const monthlyCardData = useMemo(() => {
        if (!data.length) return [];
        const cutoff = getPeriodCutoff(period);
        const filtered = data.filter(d => new Date(d.date) >= cutoff);

        // Group by month
        const byMonth: Record<string, PortfolioItem[]> = {};
        filtered.forEach(d => {
            const date = new Date(d.date);
            const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
            if (!byMonth[key]) byMonth[key] = [];
            byMonth[key].push(d);
        });

        // Convert to array of {monthKey, monthDate, items}
        return Object.entries(byMonth)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, items]) => {
                const [year, month] = key.split('-');
                const monthDate = new Date(parseInt(year), parseInt(month));
                return { monthKey: key, monthDate, items };
            });
    }, [data, period]);

    // ── Enrich Top Holdings with period contribution + risk % ──────────────────
    const enrichedTop10 = useMemo(() => {
        if (!riskData) return top10;

        const riskMap = new Map(riskData.positions.map(p => [
            p.ticker,
            { riskContribution: p.riskContribution }
        ]));

        const contribMap = new Map(periodAttribution.map(p => [
            p.ticker,
            p.contribution
        ]));

        return top10.map(item => ({
            ...item,
            periodContribution: contribMap.get(item.ticker) ?? 0,
            riskPercent: riskMap.get(item.ticker)?.riskContribution ?? 0
        }));
    }, [top10, riskData, periodAttribution]);

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
    const top10Sum = top10.reduce((s, i) => s + i.weight, 0);

    return (
        <div className="report-page p-6 max-w-[100vw] min-h-screen">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex justify-between items-center mb-5">
                <div>
                    <h1 className="text-2xl font-bold font-mono text-wallstreet-text tracking-tighter">
                        PORTFOLIO <span className="text-wallstreet-accent">REPORT</span>
                    </h1>
                    <p className="text-wallstreet-500 text-xs mt-0.5 font-mono">
                        {genDate} &middot; Benchmark: 75% ACWI + 25% TSX60
                    </p>
                </div>
                <div className="print-hide flex items-center gap-3">
                    <div className="flex bg-wallstreet-700 rounded-xl p-1 gap-0.5">
                        {(['1M', '3M', '6M', 'YTD', '1Y'] as Period[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                                    period === p
                                        ? 'bg-wallstreet-accent text-white shadow-sm'
                                        : 'text-wallstreet-500 hover:text-wallstreet-text'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-wallstreet-accent text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                        <Printer size={15} /> Print / PDF
                    </button>
                </div>
            </div>

            {/* ── KPI Strip ───────────────────────────────────────────────── */}
            <div className="report-kpi-strip grid grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
                <KPI label="Total Return" value={formatPercent(m.totalReturn)} positive={m.totalReturn >= 0} sub="Full Period" />
                <KPI label="Alpha" value={formatPercent(m.alpha)} positive={m.alpha >= 0} sub="vs Benchmark" />
                <KPI label="Sharpe" value={m.sharpeRatio.toFixed(2)} positive={m.sharpeRatio >= 1} neutral={m.sharpeRatio >= 0 && m.sharpeRatio < 1} />
                <KPI label="Sortino" value={m.sortinoRatio.toFixed(2)} positive={m.sortinoRatio >= 1} neutral={m.sortinoRatio >= 0 && m.sortinoRatio < 1} />
                <KPI label="Volatility" value={formatPct(m.volatility)} neutral />
                <KPI label="Beta" value={m.beta.toFixed(2)} neutral />
                <KPI label="Max DD" value={formatPercent(m.maxDrawdown)} positive={false} />
                <KPI label="VaR 95%" value={`${riskData.var95.toFixed(2)}%`} positive={false} />
            </div>

            {/* ── Bento Grid ──────────────────────────────────────────────── */}
            {/*
                4-column layout:
                Row 1: [Performance ×2] [Benchmark Deviation] [Regional Tilt]  ← all same height
                Row 2: [Top Holdings ×4]
            */}
            <div
                className="grid gap-4 mb-8"
                style={{
                    gridTemplateAreas: '"perf perf sector geosector" "top10 top10 top10 top10"',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                }}
            >

                {/* ── Performance Chart ────────────────────────────────────── */}
                <div style={{ gridArea: 'perf' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl p-5 shadow-sm">
                    <div className="mb-3">
                        <h3 className="text-xs font-bold font-mono text-wallstreet-text uppercase tracking-wider">Performance</h3>
                        <p className="text-[10px] text-wallstreet-500 font-mono mt-0.5">{PERIOD_LABELS[period]} · Rebased to 0%</p>
                    </div>
                    <div className="report-chart-container h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 9, fill: tc.axisColor, fontFamily: 'monospace' }}
                                    tickFormatter={d => {
                                        const dt = new Date(d);
                                        return `${dt.toLocaleString('en', { month: 'short' })} '${String(dt.getFullYear()).slice(2)}`;
                                    }}
                                    interval="preserveStartEnd"
                                    stroke={tc.gridStroke}
                                />
                                <YAxis
                                    tick={{ fontSize: 9, fill: tc.axisColor, fontFamily: 'monospace' }}
                                    tickFormatter={v => `${v.toFixed(0)}%`}
                                    stroke={tc.gridStroke}
                                    width={42}
                                />
                                <ReferenceLine y={0} stroke={tc.gridStroke} strokeDasharray="3 3" />
                                <Tooltip
                                    contentStyle={ttStyle(tc)}
                                    formatter={(val: number, name: string) => [
                                        `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`,
                                        name === 'portfolio' ? 'Portfolio' : 'Benchmark',
                                    ]}
                                    labelFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                />
                                <Line type="monotone" dataKey="portfolio" stroke={tc.accentColor ?? '#0ea5e9'} strokeWidth={2} dot={false} name="portfolio" />
                                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="benchmark" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex gap-5 mt-2 text-[10px] font-mono text-wallstreet-500">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-5 h-0.5" style={{ background: tc.accentColor ?? '#0ea5e9' }} />
                            Portfolio
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-5" style={{ borderTop: '1.5px dashed #94a3b8' }} />
                            Benchmark
                        </span>
                    </div>
                </div>

                {/* ── Benchmark Deviation ──────────────────────────────────── */}
                <div style={{ gridArea: 'sector' }}>
                    <SectorDeviationCard
                        currentHoldings={enrichedCurrentHoldings}
                        benchmarkData={benchmarkSectors}
                        benchmarkGeography={benchmarkGeography}
                        assetGeo={effectiveAssetGeo}
                    />
                </div>

                {/* ── Regional Sector Tilt ─────────────────────────────────── */}
                <div style={{ gridArea: 'geosector' }}>
                    <SectorGeographyDeviationCard
                        currentHoldings={enrichedCurrentHoldings}
                        benchmarkSectors={benchmarkSectors}
                        benchmarkGeography={benchmarkGeography}
                        assetGeo={effectiveAssetGeo}
                    />
                </div>

                {/* ── Top 10 Holdings (enriched with contribution + risk %) ──── */}
                <div style={{ gridArea: 'top10' }} className="bg-wallstreet-800 border border-wallstreet-700 rounded-xl p-5 shadow-sm flex flex-col">
                    <h3 className="text-xs font-bold font-mono text-wallstreet-text uppercase tracking-wider mb-3">Top Holdings</h3>
                    <table className="w-full text-xs font-mono">
                        <thead>
                            <tr className="text-[10px] text-wallstreet-500 uppercase border-b border-wallstreet-700">
                                <th className="text-left pb-1.5 font-medium">#</th>
                                <th className="text-left pb-1.5 font-medium">Ticker</th>
                                <th className="text-right pb-1.5 font-medium">Wt</th>
                                <th className="text-right pb-1.5 font-medium">Contrib</th>
                                <th className="text-right pb-1.5 font-medium">Risk %</th>
                                <th className="text-left pb-1.5 pl-2 font-medium">Sector</th>
                            </tr>
                        </thead>
                        <tbody>
                            {enrichedTop10.map((item, i) => (
                                <tr key={item.ticker} className="border-b border-wallstreet-700 last:border-0">
                                    <td className="py-1.5 text-wallstreet-500 text-[10px]">{i + 1}</td>
                                    <td className="py-1.5 text-wallstreet-text font-bold">{item.ticker}</td>
                                    <td className="py-1.5 text-right text-wallstreet-text">{item.weight.toFixed(2)}%</td>
                                    <td className="py-1.5 text-right text-wallstreet-text">{(item.periodContribution * 100).toFixed(2)} bps</td>
                                    <td className="py-1.5 text-right text-wallstreet-text">{(item.riskPercent * 100).toFixed(2)}%</td>
                                    <td className="py-1.5 pl-2 text-wallstreet-500 truncate max-w-[80px]">{item.sector ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-wallstreet-700">
                                <td className="pt-2 pb-1 text-[10px] text-wallstreet-500 uppercase font-medium" colSpan={2}>Top 10 Total</td>
                                <td className="pt-2 pb-1 text-right font-bold text-wallstreet-text">{top10Sum.toFixed(2)}%</td>
                                <td className="pt-2 pb-1 text-right font-bold text-wallstreet-text">{(periodAttribution.reduce((s, i) => s + i.contribution, 0) * 100).toFixed(0)} bps</td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                </div>

            </div>

            {/* ── Monthly Attribution Cards ───────────────────────────────── */}
            {monthlyCardData.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-bold font-mono text-wallstreet-text uppercase tracking-wider">
                            Return Attribution by Month
                        </h2>
                        {onViewAttribution && (
                            <button
                                onClick={onViewAttribution}
                                className="text-[11px] font-mono text-wallstreet-accent hover:opacity-80 transition-opacity underline underline-offset-2 print-hide"
                            >
                                View Full Analysis →
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {monthlyCardData.map(({ monthDate, items }) => (
                            <AttributionTable
                                key={monthDate.toISOString()}
                                title={monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                items={aggregatePeriodData(items)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="mt-5 pt-3 border-t border-wallstreet-700 flex justify-between items-center text-[10px] font-mono text-wallstreet-500">
                <span className="flex items-center gap-2">
                    Generated {genDate}
                    {fetchedAt && <><span>&middot;</span><FreshnessBadge fetchedAt={fetchedAt} /></>}
                </span>
                <span>Past performance does not guarantee future results. For informational purposes only.</span>
            </div>
        </div>
    );
};
