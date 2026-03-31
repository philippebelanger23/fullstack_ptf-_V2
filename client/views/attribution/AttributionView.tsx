import React, { useMemo, useState, useRef, useCallback, Component, ErrorInfo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { KPICard } from '../../components/KPICard';
import { Dropdown } from '../../components/Dropdown';
import { TrendingUp, Target, AlertTriangle, Calendar, Grid, Activity, Percent, Layers, Zap, Scale, Info, Printer, Download, Loader2, ArrowUpRight, ArrowDownRight, Briefcase } from 'lucide-react';
import { fetchSectorHistory, fetchSectors, fetchIndexExposure, SectorHistoryData } from '../../services/api';
import { PortfolioItem, BackcastResponse } from '../../types';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import { formatPct, formatBps } from '../../utils/formatters';
import { aggregatePeriodData, forwardCompoundedContribution } from './attributionUtils';
import { AttributionTable } from './AttributionTable';
import { WaterfallChart, SectorAttributionCharts } from './AttributionCharts';

// ── ErrorBoundary ────────────────────────────────────────────────────────────

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

// ── Types ────────────────────────────────────────────────────────────────────

interface AttributionViewProps {
    data: PortfolioItem[];
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    customSectors?: Record<string, Record<string, number>>;
    tablesRequest?: number;
    sharedBackcast?: BackcastResponse | null;
}

// ── FuturePeriodMessage ──────────────────────────────────────────────────────

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

// ── AttributionViewContent ───────────────────────────────────────────────────

const AttributionViewContent: React.FC<AttributionViewProps> = ({ data, selectedYear, setSelectedYear, customSectors, tablesRequest, sharedBackcast }) => {
    const tc = useThemeColors();
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'TABLES'>('OVERVIEW');

    // Deep-link from Portfolio Report: switch to TABLES mode when requested
    React.useEffect(() => {
        if ((tablesRequest ?? 0) > 0) setViewMode('TABLES');
    }, [tablesRequest]);
    const [timeRange, setTimeRange] = useState<'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('YTD');
    const [sectorHistory, setSectorHistory] = useState<{ US: SectorHistoryData, CA: SectorHistoryData, OVERALL: SectorHistoryData }>({ US: {}, CA: {}, OVERALL: {} });
    const [tickerSectors, setTickerSectors] = useState<Record<string, string>>({});
    const [isAttributionLoading, setIsAttributionLoading] = useState(true);
    const [loadProgress, setLoadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({
        benchmark: 'pending', history: 'pending', sectors: 'pending',
    });
    const [regionFilter, setRegionFilter] = useState<'ALL' | 'US' | 'CA'>('ALL');
    const [benchmarkMode, setBenchmarkMode] = useState<'SECTOR' | 'SP500' | 'TSX'>('SECTOR');
    const [heatmapMode, setHeatmapMode] = useState<'CONTRIBUTION' | 'PERFORMANCE'>('CONTRIBUTION');
    const [benchmarkExposure, setBenchmarkExposure] = useState<any[]>([]);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);

    // Stable ticker key — only changes when actual ticker set changes, not on every data reference swap
    const tickerKey = useMemo(() => {
        return Array.from(new Set(data.map(d => d.ticker))).filter(t => t !== 'CASH').sort().join(',');
    }, [data]);
    const prevTickerKeyRef = useRef(tickerKey);

    // Single consolidated load: runs all fetches in parallel, sets state once
    const loadAllData = useCallback(async (tickers: string[]) => {
        setIsAttributionLoading(true);
        setLoadProgress({ benchmark: 'pending', history: 'pending', sectors: 'pending' });
        const trackFetch = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
            try {
                const result = await fn();
                setLoadProgress(prev => ({ ...prev, [key]: 'done' }));
                return result;
            } catch (err) {
                setLoadProgress(prev => ({ ...prev, [key]: 'error' }));
                throw err;
            }
        };
        try {
            const [exposureRes, historyRes, sectorsRes] = await Promise.all([
                trackFetch('benchmark', fetchIndexExposure),
                trackFetch('history', fetchSectorHistory),
                tickers.length > 0
                    ? trackFetch('sectors', () => fetchSectors(tickers))
                    : (() => { setLoadProgress(prev => ({ ...prev, sectors: 'done' })); return Promise.resolve({} as Record<string, string>); })(),
            ]);

            if (exposureRes?.sectors) setBenchmarkExposure(exposureRes.sectors);
            setSectorHistory(historyRes);
            setTickerSectors(sectorsRes);
        } finally {
            setIsAttributionLoading(false);
            setFetchedAt(new Date().toISOString());
        }
    }, []);

    // Initial load
    React.useEffect(() => {
        const tickers = tickerKey ? tickerKey.split(',') : [];
        loadAllData(tickers);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-fetch only ticker sectors when the ticker set actually changes (not on every data reference swap)
    React.useEffect(() => {
        if (tickerKey === prevTickerKeyRef.current) return;
        prevTickerKeyRef.current = tickerKey;
        if (!tickerKey) return;
        const tickers = tickerKey.split(',');
        let cancelled = false;
        (async () => {
            const sectors = await fetchSectors(tickers);
            if (!cancelled) setTickerSectors(sectors);
        })();
        return () => { cancelled = true; };
    }, [tickerKey]);

    const isFuture = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        if (selectedYear < currentYear) return false;
        if (selectedYear > currentYear) return true;

        const quarterStarts: Record<string, number> = { 'Q1': 0, 'Q2': 3, 'Q3': 6, 'Q4': 9 };
        if (timeRange === 'YTD') return false;
        return now.getMonth() < quarterStarts[timeRange];
    }, [selectedYear, timeRange]);

    // Select sector history based on region filter: CA uses Canadian ETFs, US uses US ETFs
    const activeSectorHistory = useMemo(() => {
        if (regionFilter === 'CA') return sectorHistory.CA || {};
        return sectorHistory.US || {};
    }, [sectorHistory, regionFilter]);

    // For "ALL" region, also keep CA history available for blending
    const caSectorHistory = useMemo(() => {
        return sectorHistory.CA || {};
    }, [sectorHistory]);

    const handlePrint = () => {
        window.print();
    };

    const cleanData = useMemo(() => {
        // Filter by year
        const yearFiltered = data.filter(d => new Date(d.date).getFullYear() === selectedYear);
        const currentYear = new Date().getFullYear();
        // Carry-over logic for Jan 1st of current year
        if (selectedYear === currentYear) {
            const hasJan1 = yearFiltered.some(d => d.date.startsWith(`${currentYear}-01-01`));
            if (!hasJan1) {
                // Find last data point from previous year
                const prevYear = currentYear - 1;
                const dataPrevYear = data.filter(d => new Date(d.date).getFullYear() === prevYear);
                if (dataPrevYear.length > 0) {
                    // Sort to find the latest
                    dataPrevYear.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const lastDatePrevYear = dataPrevYear[0].date;
                    const latestPrevSnapshot = dataPrevYear.filter(d => d.date === lastDatePrevYear);

                    // Create simulated entries for Jan 1st using last year weights
                    const carryOver = latestPrevSnapshot.map(item => ({
                        ...item,
                        date: `${currentYear}-01-01`,
                        contribution: 0, // Reset contribution for the start of the year
                        returnPct: 0    // Reset performance for the start of the year
                    }));
                    return [...carryOver, ...yearFiltered];
                }
            }
        }


        return yearFiltered;
    }, [data, selectedYear]);

    const { allMonths, primaryYear } = useMemo(() => {
        if (cleanData.length === 0) return { allMonths: [], primaryYear: new Date().getFullYear() };
        const dates = cleanData.map(d => new Date(d.date).getTime());
        const maxDate = new Date(Math.max(...dates));
        const year = maxDate.getFullYear();
        const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
        return { allMonths: months, primaryYear: year };
    }, [cleanData]);

    const filteredOverviewData = useMemo(() => {
        if (timeRange === 'YTD') return cleanData;
        const quarters: Record<string, number[]> = { 'Q1': [0, 1, 2], 'Q2': [3, 4, 5], 'Q3': [6, 7, 8], 'Q4': [9, 10, 11] };
        const allowedMonths = quarters[timeRange];
        return cleanData.filter(d => allowedMonths.includes(new Date(d.date).getMonth()));
    }, [cleanData, timeRange]);

    const uniqueTickers = useMemo(() => Array.from(new Set(filteredOverviewData.map(d => d.ticker))), [filteredOverviewData]);

    const tickerStats = useMemo(() => {
        // 1. First, calculate Portfolio Monthly Returns for Beta calculation
        const portfolioMonthlyReturns: Record<string, number> = {};
        allMonths.forEach(m => {
            const key = `${m.getFullYear()}-${m.getMonth()}`;
            portfolioMonthlyReturns[key] = 0;
        });

        // We need to aggregate contributions by month across all tickers first to get the "Market/Portfolio" return series
        // Actually we can use heatmapTotals logic, but that is calculated AFTER. Let's pull it up or duplicate simple logic.
        const portRetSeries: number[] = [];

        allMonths.forEach(month => {
            const key = `${month.getFullYear()}-${month.getMonth()}`;
            // Filter data for this month
            const monthData = filteredOverviewData.filter(d => {
                const dDate = new Date(d.date);
                return dDate.getFullYear() === month.getFullYear() && dDate.getMonth() === month.getMonth();
            });
            const sumContrib = monthData.reduce((sum, d) => sum + (d.contribution || 0), 0);
            portfolioMonthlyReturns[key] = sumContrib;
            portRetSeries.push(sumContrib);
        });

        const portMean = portRetSeries.reduce((a, b) => a + b, 0) / (portRetSeries.length || 1);
        const portVariance = portRetSeries.reduce((a, b) => a + Math.pow(b - portMean, 2), 0) / (portRetSeries.length || 1);

        return uniqueTickers.map(ticker => {
            const history = filteredOverviewData.filter(d => d.ticker === ticker);
            const yearHistory = cleanData.filter(d => d.ticker === ticker);
            // Forward-compounded contribution (ATTRIBUTION_LOGIC.md §4)
            const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const totalContrib = forwardCompoundedContribution(sortedHistory);
            // Removed avgWeight calculation as per user request

            // Calculate StdDev of *Contribution* (Risk Contribution Proxy) and *Return* (Standalone Risk)
            // Ideally we need Returns for Beta.
            // Let's build the monthly return series for this ticker
            const tickerRetSeries: number[] = [];
            const tickerContribSeries: number[] = [];

            allMonths.forEach(month => {
                const key = `${month.getFullYear()}-${month.getMonth()}`;
                const entry = history.find(d => {
                    const dDate = new Date(d.date);
                    return dDate.getFullYear() === month.getFullYear() && dDate.getMonth() === month.getMonth();
                });
                tickerRetSeries.push(entry ? (entry.returnPct || 0) : 0);
                tickerContribSeries.push(entry ? (entry.contribution || 0) : 0);
            });

            // Volatility of Contribution (How much it shakes the boat)
            const meanContrib = tickerContribSeries.reduce((a, b) => a + b, 0) / (tickerContribSeries.length || 1);
            const varianceContrib = tickerContribSeries.reduce((a, b) => a + Math.pow(b - meanContrib, 2), 0) / (tickerContribSeries.length || 1);
            const stdDevContrib = Math.sqrt(varianceContrib);

            // Beta Calculation (Covariance(TickerContrib, PortContrib) / Var(PortContrib))
            // using Contribution series for Beta to see "contribution to portfolio swing"
            let covariance = 0;
            for (let i = 0; i < portRetSeries.length; i++) {
                covariance += (tickerContribSeries[i] - meanContrib) * (portRetSeries[i] - portMean);
            }
            covariance /= (portRetSeries.length || 1);

            const beta = portVariance !== 0 ? covariance / portVariance : 0;

            // Risk Contribution = Beta * Portfolio StdDev (Since we are using contribution series, this is direct)
            // Or simply use stdDevContrib as "Marginal Risk Contribution" proxy for display

            // Get latest weight for "Current Exposure" sorting logic
            // Find the entry with the max date in the history
            const latestEntry = history.reduce((latest, current) => {
                return new Date(current.date).getTime() > new Date(latest.date).getTime() ? current : latest;
            }, history[0]);
            const latestWeight = latestEntry ? latestEntry.weight : 0;

            const totalReturn = (history.reduce(
                (product: number, item: PortfolioItem) => product * (1 + (item.returnPct || 0)),
                1
            ) - 1) * 100;
            const ytdReturn = (yearHistory.reduce(
                (product: number, item: PortfolioItem) => product * (1 + (item.returnPct || 0)),
                1
            ) - 1) * 100;

            return { ticker, totalContrib, totalReturn, ytdReturn, history, latestWeight, stdDevContrib, beta, riskScore: stdDevContrib };
        }).filter(t => t.latestWeight > 0.001 || Math.abs(t.totalContrib) > 0.0001);
    }, [uniqueTickers, filteredOverviewData, allMonths]);

    const sortedByContrib = useMemo(() => [...tickerStats].sort((a, b) => b.totalContrib - a.totalContrib), [tickerStats]);
    // Update: Sort by latestWeight instead of avgWeight to match Dashboard logic
    const sortedByWeight = useMemo(() => [...tickerStats].sort((a, b) => b.latestWeight - a.latestWeight), [tickerStats]);

    const chainReturnPct = useCallback((items: { returnPct?: number | null | undefined }[]) => {
        if (items.length === 0) return 0;
        return (items.reduce((product, item) => product * (1 + (item.returnPct || 0)), 1) - 1) * 100;
    }, []);

    const formatHeatmapPct = useCallback((value: number) => {
        return value < 0 ? `(${Math.abs(value).toFixed(2)}%)` : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
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

    const matrixData = sortedByContrib.map(stat => {
        const row: any = {
            ticker: stat.ticker,
            total: stat.totalContrib,
            totalContribution: stat.totalContrib,
            totalPerformance: stat.ytdReturn,
            latestWeight: stat.latestWeight,
        }; // Use latestWeight explicitly
        allMonths.forEach(monthDate => {
            const m = monthDate.getMonth();
            const y = monthDate.getFullYear();
            const monthlyEntries = stat.history.filter(h => {
                const d = new Date(h.date);
                return d.getMonth() === m && d.getFullYear() === y;
            });
            const key = `${y}-${m}`;
            // Forward-compounded contribution per month (ATTRIBUTION_LOGIC.md §4)
            if (monthlyEntries.length > 0) {
                const sorted = [...monthlyEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                row[key] = forwardCompoundedContribution(sorted);
                row[`p-${key}`] = chainReturnPct(sorted);
                row[`partial-${key}`] = sorted.some(item => item.isMutualFund && (item.startPrice == null || item.endPrice == null));
            } else {
                row[key] = null;
                row[`p-${key}`] = null;
                row[`partial-${key}`] = false;
            }
            // Capture max weight for this month to determine if 0.00% is due to strict 0 position
            row[`w-${key}`] = monthlyEntries.length > 0 ? Math.max(...monthlyEntries.map(e => e.weight)) : 0;
        });
        return row;
    }).filter(row => {
        // Filter out tickers where ALL months have null contributions (no data for this year)
        const hasAnyNonNullContrib = allMonths.some(monthDate => {
            const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
            return row[key] !== null;
        });

        // Filter out CASH and *CASH*
        const tickerUpper = row.ticker.toUpperCase();
        const isNotCash = tickerUpper !== 'CASH' && tickerUpper !== '*CASH*';

        return hasAnyNonNullContrib && isNotCash;
    });

    const toBackcastDateKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getBackcastReturnForRange = useCallback((startDateKey: string, endDateKey: string): number | null => {
        if (!sharedBackcast?.series || sharedBackcast.series.length === 0) return null;

        const startPoints = sharedBackcast.series.filter(pt => pt.date <= startDateKey);
        const endPoints = sharedBackcast.series.filter(pt => pt.date <= endDateKey);
        if (startPoints.length === 0 || endPoints.length === 0) return null;

        const startValue = startPoints[startPoints.length - 1].portfolio;
        const endValue = endPoints[endPoints.length - 1].portfolio;
        if (startValue === 0) return null;

        return ((endValue - startValue) / startValue) * 100;
    }, [sharedBackcast]);

    const getMonthlyBackcastReturn = useCallback((date: Date): number | null => {
        const start = new Date(date.getFullYear(), date.getMonth(), 0);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        return getBackcastReturnForRange(toBackcastDateKey(start), toBackcastDateKey(end));
    }, [getBackcastReturnForRange]);

    const heatmapFooterLabel = heatmapMode === 'PERFORMANCE' ? 'YTD Performance' : 'Compounded Total';
    const compoundedTotalLabel = 'Total';

    // Geometric portfolio total return from the backcast series for the current time window.
    // This is the same value shown on the performance graph, ensuring cross-view consistency.
    // Must be defined BEFORE heatmapTotals which references it.
    const portfolioTotalReturn = useMemo((): number | null => {
        let startStr: string;
        let endStr: string;
        if (timeRange === 'YTD') {
            startStr = `${selectedYear - 1}-12-31`;
            endStr = '9999-12-31';
        } else {
            const quarterStart: Record<string, number> = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 };
            const startMonth = quarterStart[timeRange];
            const start = new Date(selectedYear, startMonth, 1);
            const end = new Date(selectedYear, startMonth + 3, 0);
            startStr = toBackcastDateKey(start);
            endStr = toBackcastDateKey(end);
        }
        return getBackcastReturnForRange(startStr, endStr);
    }, [getBackcastReturnForRange, timeRange, selectedYear]);

    const portfolioYtdReturn = useMemo((): number | null => {
        if (!sharedBackcast?.series || sharedBackcast.series.length === 0) return null;
        const startStr = `${selectedYear - 1}-12-31`;
        const endStr = '9999-12-31';
        return getBackcastReturnForRange(startStr, endStr);
    }, [getBackcastReturnForRange, selectedYear, sharedBackcast]);

    // Per-period geometric returns from the backcast series, used to override the
    // compounded total row in each monthly and quarterly AttributionTable.
    const backcastQuarterReturns = useMemo((): Record<string, number> => {
        const result: Record<string, number> = {};
        const quarters: Record<string, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] };
        Object.entries(quarters).forEach(([q, [startM, endM]]) => {
            // prevEnd = last day before quarter start (i.e. end of prior quarter)
            const prevEnd = toBackcastDateKey(new Date(primaryYear, startM, 0));
            const qEnd = toBackcastDateKey(new Date(primaryYear, endM + 1, 0));
            const quarterReturn = getBackcastReturnForRange(prevEnd, qEnd);
            if (quarterReturn !== null) result[q] = quarterReturn;
        });
        return result;
    }, [getBackcastReturnForRange, primaryYear]);

    const heatmapTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        const hasDataMap: Record<string, boolean> = {};
        const monthlyReturns: number[] = [];
        const partialMap: Record<string, boolean> = {};
        let grandTotal = 0;

        allMonths.forEach(date => {
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            totals[key] = 0;
            hasDataMap[key] = false;
            partialMap[key] = false;
        });

        matrixData.forEach(row => {
            grandTotal += heatmapMode === 'PERFORMANCE' ? (row.totalPerformance ?? 0) : row.total;
            allMonths.forEach(date => {
                const key = `${date.getFullYear()}-${date.getMonth()}`;
                const val = heatmapMode === 'PERFORMANCE' ? row[`p-${key}`] : row[key];
                if (val !== null && val !== undefined) {
                    totals[key] += val;
                    hasDataMap[key] = true;
                    if (heatmapMode === 'PERFORMANCE' && row[`partial-${key}`]) {
                        partialMap[key] = true;
                    }
                }
            });
        });

        // Override only the grand total with the geometric portfolio return from the backcast
        // series (same source as the performance graph). Monthly cells remain as contribution
        // sums — only the YTD/period total needs to match the graph exactly.
        const selectedTotal = heatmapMode === 'PERFORMANCE'
            ? (portfolioYtdReturn ?? portfolioTotalReturn)
            : portfolioTotalReturn;

        if (selectedTotal !== null) grandTotal = selectedTotal;

        allMonths.forEach(date => {
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (hasDataMap[key]) monthlyReturns.push(totals[key]);
        });

        return { totals, grandTotal, hasDataMap, monthlyReturns, partialMap };
    }, [matrixData, allMonths, portfolioTotalReturn, portfolioYtdReturn, heatmapMode]);

    const waterfallData = useMemo(() => {
        if (sortedByWeight.length === 0) return [];
        const top10 = sortedByWeight.slice(0, 10);
        const top10Tickers = new Set(top10.map(i => i.ticker));
        const others = sortedByWeight.filter(i => !top10Tickers.has(i.ticker));
        const othersSum = others.reduce((sum, i) => sum + i.totalContrib, 0);

        const dataPoints: any[] = [];
        let currentVal = 0;

        top10.forEach(item => {
            const start = currentVal;
            const end = currentVal + item.totalContrib;
            const portfolioItem = data.find(d => d.ticker === item.ticker);
            dataPoints.push({
                name: item.ticker,
                value: [start < end ? start : end, start < end ? end : start],
                delta: item.totalContrib,
                isTotal: false,
                color: item.totalContrib >= 0 ? '#16a34a' : '#dc2626',
                sector: portfolioItem?.sector,
                weight: item.latestWeight,
                totalReturn: item.totalReturn,
                beta: item.beta,
            });
            currentVal = end;
        });

        if (Math.abs(othersSum) > 0.001 || others.length > 0) {
            const start = currentVal;
            const end = currentVal + othersSum;
            dataPoints.push({ name: 'Others', value: [start < end ? start : end, start < end ? end : start], delta: othersSum, isTotal: false, color: othersSum >= 0 ? '#16a34a' : '#dc2626' });
            currentVal = end;
        }

        const totalVal = portfolioTotalReturn ?? currentVal;
        dataPoints.push({ name: compoundedTotalLabel, value: [0, totalVal], delta: totalVal, isTotal: true, color: tc.isDark ? '#38bdf8' : '#0A2351' });
        return dataPoints;
    }, [sortedByWeight, tc.isDark, portfolioTotalReturn]);

    const waterfallDomain = useMemo(() => {
        if (waterfallData.length === 0) return [0, 10];
        let min = 0;
        let max = 0;
        waterfallData.forEach(d => {
            if (d.value[0] < min) min = d.value[0];
            if (d.value[1] < min) min = d.value[1];
            if (d.value[0] > max) max = d.value[0];
            if (d.value[1] > max) max = d.value[1];
        });

        // Add a more generous buffer (15%) to both top and bottom so labels don't get cut off
        const range = max - min;
        const buffer = range * 0.15;

        return [min - buffer, max + buffer];
    }, [waterfallData]);

    const sectorBenchmarkReturns = useMemo(() => {
        if (!activeSectorHistory || Object.keys(activeSectorHistory).length === 0) return {};

        const results: Record<string, number> = {};
        const quarters: Record<string, number[]> = { 'Q1': [0, 2], 'Q2': [3, 5], 'Q3': [6, 8], 'Q4': [9, 11] };

        Object.keys(activeSectorHistory).forEach(sector => {
            const hist = activeSectorHistory[sector];
            if (!hist || hist.length < 2) return;

            // Safer Year parsing (avoid JS Date UTC issues)
            const yearHist = hist.filter(h => h.date.startsWith(selectedYear.toString()));
            if (yearHist.length < 2) return;

            // Sort by date
            const sortedYearHist = [...yearHist].sort((a,b) => a.date.localeCompare(b.date));

            let startPoint, endPoint;

            if (timeRange === 'YTD') {
                startPoint = sortedYearHist[0];
                endPoint = sortedYearHist[sortedYearHist.length - 1];
            } else {
                const months = quarters[timeRange];
                const periodHist = yearHist.filter(h => {
                    // Month is index 5-6 in YYYY-MM-DD
                    const m = parseInt(h.date.substring(5, 7)) - 1;
                    return m >= months[0] && m <= months[1];
                });
                if (periodHist.length < 2) return;
                const sortedPeriodHist = [...periodHist].sort((a,b) => a.date.localeCompare(b.date));
                startPoint = sortedPeriodHist[0];
                endPoint = sortedPeriodHist[sortedPeriodHist.length - 1];
            }

            if (startPoint && endPoint && startPoint.value > 0) {
                results[sector] = (endPoint.value / startPoint.value - 1) * 100;
            }
        });

        return results;
    }, [activeSectorHistory, selectedYear, timeRange]);

    // CA sector benchmark returns (used for blending when regionFilter === 'ALL')
    const caSectorBenchmarkReturns = useMemo(() => {
        if (!caSectorHistory || Object.keys(caSectorHistory).length === 0) return {};

        const results: Record<string, number> = {};
        const quarters: Record<string, number[]> = { 'Q1': [0, 2], 'Q2': [3, 5], 'Q3': [6, 8], 'Q4': [9, 11] };

        Object.keys(caSectorHistory).forEach(sector => {
            const hist = caSectorHistory[sector];
            if (!hist || hist.length < 2) return;

            const yearHist = hist.filter((h: any) => h.date.startsWith(selectedYear.toString()));
            if (yearHist.length < 2) return;

            const sortedYearHist = [...yearHist].sort((a: any, b: any) => a.date.localeCompare(b.date));

            let startPoint, endPoint;

            if (timeRange === 'YTD') {
                startPoint = sortedYearHist[0];
                endPoint = sortedYearHist[sortedYearHist.length - 1];
            } else {
                const months = quarters[timeRange];
                const periodHist = yearHist.filter((h: any) => {
                    const m = parseInt(h.date.substring(5, 7)) - 1;
                    return m >= months[0] && m <= months[1];
                });
                if (periodHist.length < 2) return;
                const sortedPeriodHist = [...periodHist].sort((a: any, b: any) => a.date.localeCompare(b.date));
                startPoint = sortedPeriodHist[0];
                endPoint = sortedPeriodHist[sortedPeriodHist.length - 1];
            }

            if (startPoint && endPoint && startPoint.value > 0) {
                results[sector] = (endPoint.value / startPoint.value - 1) * 100;
            }
        });

        return results;
    }, [caSectorHistory, selectedYear, timeRange]);

    const overallBenchmarkReturn = useMemo(() => {
        if (benchmarkMode === 'SECTOR') return null;
        const key = benchmarkMode === 'SP500' ? 'SP500' : 'TSX';
        const hist = sectorHistory.OVERALL?.[key];
        if (!hist || hist.length < 2) return null;

        const yearHist = hist.filter(h => h.date.startsWith(selectedYear.toString()));
        if (yearHist.length < 2) return null;
        const sorted = [...yearHist].sort((a, b) => a.date.localeCompare(b.date));

        let startPoint, endPoint;
        if (timeRange === 'YTD') {
            startPoint = sorted[0];
            endPoint = sorted[sorted.length - 1];
        } else {
            const quarters: Record<string, number[]> = { 'Q1': [0, 2], 'Q2': [3, 5], 'Q3': [6, 8], 'Q4': [9, 11] };
            const [m0, m1] = quarters[timeRange];
            const periodHist = sorted.filter(h => {
                const m = parseInt(h.date.substring(5, 7)) - 1;
                return m >= m0 && m <= m1;
            });
            if (periodHist.length < 2) return null;
            startPoint = periodHist[0];
            endPoint = periodHist[periodHist.length - 1];
        }

        if (startPoint && endPoint && startPoint.value > 0) {
            return (endPoint.value / startPoint.value - 1) * 100;
        }
        return null;
    }, [sectorHistory, benchmarkMode, selectedYear, timeRange]);

    const sectorAttributionData = useMemo(() => {
        const sectorMapping: Record<string, string> = {
            "Information Technology": "Information Technology",
            "Information Tech": "Information Technology",
            "Technology": "Information Technology",
            "Financials": "Financials",
            "Financial Services": "Financials",
            "Finance": "Financials",
            "Health Care": "Health Care",
            "Healthcare": "Health Care",
            "Consumer Discretionary": "Consumer Discretionary",
            "Consumer Cyclical": "Consumer Discretionary",
            "Cyclical Consumer": "Consumer Discretionary",
            "Communication Services": "Communication Services",
            "Communications": "Communication Services",
            "Industrials": "Industrials",
            "Industrial": "Industrials",
            "Consumer Staples": "Consumer Staples",
            "Consumer Defensive": "Consumer Staples",
            "Energy": "Energy",
            "Oil & Gas": "Energy",
            "Utilities": "Utilities",
            "Utility": "Utilities",
            "Real Estate": "Real Estate",
            "Materials": "Materials",
            "Basic Materials": "Materials"
        };

        const CANONICAL_TO_DISPLAY: Record<string, string> = {
            "Materials": "Materials",
            "Consumer Discretionary": "Discretionary",
            "Financials": "Financials",
            "Real Estate": "Real Estate",
            "Communication Services": "Communications",
            "Energy": "Energy",
            "Industrials": "Industrials",
            "Information Technology": "Technology",
            "Consumer Staples": "Staples",
            "Health Care": "Health Care",
            "Utilities": "Utilities"
        };

        const US_SECTOR_BENCHMARK_ETF: Record<string, string> = {
            "Materials": "XLB",
            "Consumer Discretionary": "XLY",
            "Financials": "XLF",
            "Real Estate": "XLRE",
            "Communication Services": "XLC",
            "Energy": "XLE",
            "Industrials": "XLI",
            "Information Technology": "XLK",
            "Consumer Staples": "XLP",
            "Health Care": "XLV",
            "Utilities": "XLU"
        };

        const CA_SECTOR_BENCHMARK_ETF: Record<string, string> = {
            "Financials": "XFN.TO",
            "Energy": "XEG.TO",
            "Materials": "XMA.TO",
            "Industrials": "ZIN.TO",
            "Information Technology": "XIT.TO",
            "Utilities": "XUT.TO",
            "Real Estate": "XRE.TO",
            "Consumer Staples": "XST.TO",
            "Consumer Discretionary": "XCD.TO",
            "Health Care": "XIC.TO",           // No pure CA healthcare ETF → TSX fallback
            "Communication Services": "XIC.TO", // No CA comm services ETF → TSX fallback
        };

        const activeBenchmarkETFs = regionFilter === 'CA' ? CA_SECTOR_BENCHMARK_ETF : US_SECTOR_BENCHMARK_ETF;

        const FIXED_SECTOR_ORDER = [
            "Materials",
            "Consumer Discretionary",
            "Financials",
            "Real Estate",
            "Communication Services",
            "Energy",
            "Industrials",
            "Information Technology",
            "Consumer Staples",
            "Health Care",
            "Utilities"
        ];

        // 1. Map Benchmark Weights to Canonical Names (region-aware)
        const benchmarkWeights: Record<string, number> = {};
        benchmarkExposure.forEach(item => {
            const normalized = sectorMapping[item.sector];
            if (normalized) {
                if (regionFilter === 'CA') benchmarkWeights[normalized] = item.TSX || 0;
                else if (regionFilter === 'US') benchmarkWeights[normalized] = item.ACWI || 0;
                else benchmarkWeights[normalized] = item.Index;
            }
        });

        const sectorGroups: Record<string, { stocks: any[], sumWeight: number, sumWeightedReturn: number, stockOnlyWeight: number, stockOnlyWeightedReturn: number }> = {};
        // Track US vs CA weight per sector for blended benchmarking
        const sectorRegionWeights: Record<string, { usWeight: number, caWeight: number }> = {};

        // Filter tickers by region, excluding ETFs and MFs (for stock-level attribution)
        const filteredTickers = uniqueTickers.filter(ticker => {
            if (ticker === 'CASH' || ticker === '*CASH*') return false;
            const entry = data.find(d => d.ticker === ticker);
            if (entry?.isEtf || entry?.isMutualFund) return false;

            if (regionFilter === 'CA') return ticker.endsWith('.TO');
            if (regionFilter === 'US') return !ticker.endsWith('.TO');
            return true;
        });

        filteredTickers.forEach(ticker => {
            const stats = tickerStats.find(t => t.ticker === ticker);
            if (!stats) return;

            const sectorName = tickerSectors[ticker] || 'Other';
            const canonicalName = sectorMapping[sectorName] || 'Other';

            if (!sectorGroups[canonicalName]) {
                sectorGroups[canonicalName] = { stocks: [], sumWeight: 0, sumWeightedReturn: 0, stockOnlyWeight: 0, stockOnlyWeightedReturn: 0 };
            }

            // Accumulate regional weights for blending
            if (!sectorRegionWeights[canonicalName]) {
                sectorRegionWeights[canonicalName] = { usWeight: 0, caWeight: 0 };
            }
            if (ticker.endsWith('.TO')) {
                sectorRegionWeights[canonicalName].caWeight += stats.latestWeight;
            } else {
                sectorRegionWeights[canonicalName].usWeight += stats.latestWeight;
            }

            // returnPct from server is in decimal form (0.05 = 5%), convert to percentage for consistency with benchmark returns
            const periodReturn = stats.history.reduce((sum, h) => sum + (h.returnPct || 0), 0) * 100;

            sectorGroups[canonicalName].stocks.push({
                ticker,
                returnPct: periodReturn,
                weight: stats.latestWeight
            });
            sectorGroups[canonicalName].sumWeight += stats.latestWeight;
            sectorGroups[canonicalName].sumWeightedReturn += (periodReturn * stats.latestWeight);
            // Track direct stock holdings separately (excludes ETF/MF distributed weight)
            sectorGroups[canonicalName].stockOnlyWeight += stats.latestWeight;
            sectorGroups[canonicalName].stockOnlyWeightedReturn += (periodReturn * stats.latestWeight);
        });

        // Include ETF/MF sector weight contributions (distributes their weight across sectors)
        uniqueTickers.forEach(ticker => {
            if (ticker === 'CASH' || ticker === '*CASH*') return;
            const entry = data.find(d => d.ticker === ticker);
            if (!entry?.isEtf && !entry?.isMutualFund) return;

            if (regionFilter === 'CA' && !ticker.endsWith('.TO')) return;
            if (regionFilter === 'US' && ticker.endsWith('.TO')) return;

            const stats = tickerStats.find(t => t.ticker === ticker);
            if (!stats) return;

            const sectorBreakdown = customSectors?.[ticker];
            if (sectorBreakdown) {
                // Distribute ETF/MF weight across sectors using custom sector breakdown
                Object.entries(sectorBreakdown).forEach(([rawSector, pct]) => {
                    const canonicalName = sectorMapping[rawSector] || (FIXED_SECTOR_ORDER.includes(rawSector) ? rawSector : null);
                    if (!canonicalName || typeof pct !== 'number') return;

                    if (!sectorGroups[canonicalName]) {
                        sectorGroups[canonicalName] = { stocks: [], sumWeight: 0, sumWeightedReturn: 0, stockOnlyWeight: 0, stockOnlyWeightedReturn: 0 };
                    }
                    sectorGroups[canonicalName].sumWeight += stats.latestWeight * (pct / 100);
                });
            }
        });

        // 2a. Resolve effective benchmark returns (sector ETFs or broad index override)
        // When regionFilter === 'ALL' and benchmarkMode === 'SECTOR', blend US/CA benchmark returns
        // weighted by the portfolio's actual regional mix per sector.
        const effectiveBenchmarkReturns: Record<string, number> = {};
        const blendedBenchmarkETFLabels: Record<string, string> = {};
        if (benchmarkMode !== 'SECTOR' && overallBenchmarkReturn !== null) {
            FIXED_SECTOR_ORDER.forEach(sector => {
                effectiveBenchmarkReturns[sector] = overallBenchmarkReturn;
            });
        } else if (regionFilter === 'ALL') {
            // Blend US + CA sector benchmark returns based on portfolio weight mix
            FIXED_SECTOR_ORDER.forEach(sector => {
                const usReturn = sectorBenchmarkReturns[sector];       // US ETF return
                const caReturn = caSectorBenchmarkReturns[sector];     // CA ETF return
                const regionW = sectorRegionWeights[sector] || { usWeight: 0, caWeight: 0 };
                const totalW = regionW.usWeight + regionW.caWeight;

                if (totalW < 0.001) {
                    // No portfolio holdings — fall back to US benchmark return
                    if (usReturn !== undefined) effectiveBenchmarkReturns[sector] = usReturn;
                    return;
                }

                const usFrac = regionW.usWeight / totalW;
                const caFrac = regionW.caWeight / totalW;

                const usETF = US_SECTOR_BENCHMARK_ETF[sector];
                const caETF = CA_SECTOR_BENCHMARK_ETF[sector];

                if (usReturn !== undefined && caReturn !== undefined && usFrac > 0.001 && caFrac > 0.001) {
                    // Both regions present — blend
                    effectiveBenchmarkReturns[sector] = usFrac * usReturn + caFrac * caReturn;
                    const usPct = Math.round(usFrac * 100);
                    const caPct = Math.round(caFrac * 100);
                    blendedBenchmarkETFLabels[sector] = `${usPct}% ${usETF} + ${caPct}% ${caETF}`;
                } else if (caReturn !== undefined && caFrac > 0.999) {
                    // All CA
                    effectiveBenchmarkReturns[sector] = caReturn;
                    blendedBenchmarkETFLabels[sector] = caETF;
                } else if (usReturn !== undefined) {
                    // All US or CA return unavailable
                    effectiveBenchmarkReturns[sector] = usReturn;
                    blendedBenchmarkETFLabels[sector] = usETF;
                } else if (caReturn !== undefined) {
                    effectiveBenchmarkReturns[sector] = caReturn;
                    blendedBenchmarkETFLabels[sector] = caETF;
                }
            });
        } else {
            Object.assign(effectiveBenchmarkReturns, sectorBenchmarkReturns);
        }

        const overallBenchmarkETF = benchmarkMode === 'SP500' ? 'SPY' : benchmarkMode === 'TSX' ? 'XIC.TO' : null;

        // 2b. Calculate Total Benchmark Return (Weighted sum of sector benchmark returns)
        let totalBenchReturnSum = 0;
        let totalBenchWeight = 0;
        Object.keys(benchmarkWeights).forEach(sector => {
            const bWeight = benchmarkWeights[sector];
            const bReturn = effectiveBenchmarkReturns[sector];
            if (bReturn !== undefined) {
                totalBenchReturnSum += (bWeight * bReturn);
                totalBenchWeight += bWeight;
            }
        });
        const totalBenchmarkReturn = totalBenchWeight > 0 ? (totalBenchReturnSum / totalBenchWeight) : 0;

        // 3. Combine into Attribution Data
        const chartData = FIXED_SECTOR_ORDER
            .filter(sector => {
                const group = sectorGroups[sector];
                const bReturn = effectiveBenchmarkReturns[sector];
                const bWeight = benchmarkWeights[sector];
                return (group && group.sumWeight > 0.001) || (bWeight !== undefined && bWeight > 0);
            })
            .map(sector => {
                const group = sectorGroups[sector] || { stocks: [], sumWeight: 0, sumWeightedReturn: 0, stockOnlyWeight: 0, stockOnlyWeightedReturn: 0 };
                const benchReturn = effectiveBenchmarkReturns[sector] || 0;
                const benchWeight = benchmarkWeights[sector] || 0;

                // Selection/Interaction use only direct stock holdings (not ETF-distributed weight).
                // ETF weight contributes to sector exposure (Allocation) but not stock-picking (Selection).
                const hasDirectHoldings = group.stockOnlyWeight > 0.001;
                const stockReturn = hasDirectHoldings ? group.stockOnlyWeightedReturn / group.stockOnlyWeight : 0;

                // Selection Effect = W_b * (R_p - R_b)
                // Only meaningful when we hold direct stocks in this sector;
                // ETF-only exposure has no stock-picking component.
                const selectionEffect = hasDirectHoldings
                    ? (benchWeight * (stockReturn - benchReturn)) / 100
                    : 0;

                // Allocation Effect = (W_p - W_b) * (R_b - R_total_b)
                // Always valid — uses total weight (stocks + ETF-distributed) to capture full sector exposure.
                const allocationEffect = ((group.sumWeight - benchWeight) * (benchReturn - totalBenchmarkReturn)) / 100;

                // Interaction Effect = (W_p - W_b) * (R_p - R_b)
                // Only meaningful when we hold direct stocks in this sector.
                const interactionEffect = hasDirectHoldings
                    ? ((group.sumWeight - benchWeight) * (stockReturn - benchReturn)) / 100
                    : 0;

                // Portfolio return shown in tooltip: use stock return when available, otherwise 0
                const displayReturn = hasDirectHoldings ? stockReturn : 0;

                return {
                    sector,
                    displayName: CANONICAL_TO_DISPLAY[sector] || sector,
                    benchmarkETF: overallBenchmarkETF ?? (blendedBenchmarkETFLabels[sector] || activeBenchmarkETFs[sector] || '—'),
                    selectionEffect,
                    allocationEffect,
                    interactionEffect,
                    benchmarkReturn: benchReturn,
                    benchmarkWeight: benchWeight,
                    portfolioWeight: group.sumWeight,
                    portfolioReturn: displayReturn,
                    hasDirectHoldings,
                    stocks: group.stocks.map(s => ({
                        ticker: s.ticker,
                        returnPct: s.returnPct,
                        weight: s.weight,
                        // Per-stock decomposition of sector selection effect:
                        // Each stock's contribution = W_b * w_i * (R_i - R_b) / (W_p_stocks * 100)
                        selectionContribution: hasDirectHoldings
                            ? (benchWeight * s.weight * (s.returnPct - benchReturn)) / (group.stockOnlyWeight * 100)
                            : 0
                    }))
                };
            });

        const maxSelection = chartData.length > 0 ? Math.max(...chartData.map(i => Math.abs(i.selectionEffect))) : 1;
        const maxAllocation = chartData.length > 0 ? Math.max(...chartData.map(i => Math.abs(i.allocationEffect))) : 1;
        const maxInteraction = chartData.length > 0 ? Math.max(...chartData.map(i => Math.abs(i.interactionEffect))) : 1;

        // Clamp to minimum 0.01 to prevent domain collapse to [0,0] when all values are zero
        const selectionDomainLimit = Math.max(maxSelection * 1.5, 0.01);
        const allocationDomainLimit = Math.max(maxAllocation * 1.5, 0.01);
        const interactionDomainLimit = Math.max(maxInteraction * 1.5, 0.01);

        return {
            data: chartData,
            selectionDomain: [-selectionDomainLimit, selectionDomainLimit] as [number, number],
            allocationDomain: [-allocationDomainLimit, allocationDomainLimit] as [number, number],
            interactionDomain: [-interactionDomainLimit, interactionDomainLimit] as [number, number]
        };
    }, [uniqueTickers, tickerStats, tickerSectors, sectorBenchmarkReturns, caSectorBenchmarkReturns, regionFilter, data, benchmarkExposure, benchmarkMode, overallBenchmarkReturn, customSectors]);

    const topMoversChartData = useMemo(() => {
        // Flatten all selection contributions from sectorAttributionData
        const allHoldings = sectorAttributionData.data.flatMap(s => s.stocks);

        const topPos = [...allHoldings].filter(i => i.selectionContribution > 0).sort((a, b) => b.selectionContribution - a.selectionContribution).slice(0, 5);
        const topNeg = [...allHoldings].filter(i => i.selectionContribution < 0).sort((a, b) => a.selectionContribution - b.selectionContribution).slice(0, 5); // Bottom 5 negative

        // Combine them: top performers first, then worst performers
        const combined = [...topPos, ...topNeg.reverse()]; // Reverse topNeg to show most negative at the bottom
        const maxAbs = combined.length > 0 ? Math.max(...combined.map(i => Math.abs(i.selectionContribution))) : 1;
        const domainLimit = maxAbs * 1.3;
        const chartData = combined.map(i => ({ ticker: i.ticker, value: i.selectionContribution, fill: i.selectionContribution >= 0 ? '#22c55e' : '#ef4444' }));
        return { data: chartData, domain: [-domainLimit, domainLimit] };
    }, [sectorAttributionData.data]);

    // Debug logging


    if (isAttributionLoading) {
        const steps = [
            { key: 'benchmark', label: 'Benchmark Exposure',     sub: 'Index sector & geography weights' },
            { key: 'history',   label: 'Sector Return History',  sub: 'Historical sector benchmarks' },
            { key: 'sectors',   label: 'Holdings Classification', sub: 'Sector mapping for your holdings' },
        ];
        const doneCount = Object.values(loadProgress).filter(s => s === 'done').length;
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center select-none">
                <style>{`
                    @keyframes attrBarPulse {
                        0%, 100% { transform: scaleY(0.12); opacity: 0.1; }
                        50%      { transform: scaleY(1);    opacity: 1;   }
                    }
                    @keyframes attrScanLine {
                        0%   { left: -2px; }
                        100% { left: calc(100% + 2px); }
                    }
                `}</style>
                <div className="flex flex-col items-center gap-8 w-full max-w-sm">
                    <div className="relative overflow-hidden rounded" style={{ width: '176px', height: '60px' }}>
                        <div className="flex items-end h-full gap-1.5">
                            {[28, 50, 36, 66, 42, 78, 54, 92, 46, 72, 58, 88, 64].map((h, i) => (
                                <div key={i} className="flex-1 rounded-t-sm origin-bottom" style={{
                                    height: `${h}%`,
                                    background: i === 12 ? '#3b82f6' : '#374151',
                                    animation: `attrBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                                }} />
                            ))}
                        </div>
                        <div className="absolute top-0 bottom-0 w-px" style={{
                            background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.65), transparent)',
                            animation: 'attrScanLine 2.2s linear infinite',
                        }} />
                    </div>

                    <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.25em] uppercase">
                        Loading Attribution Data
                    </p>

                    <div className="w-full bg-wallstreet-700 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-wallstreet-accent h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(doneCount / steps.length) * 100}%` }} />
                    </div>

                    <div className="w-full space-y-3">
                        {steps.map(({ key, label, sub }) => {
                            const status = loadProgress[key];
                            return (
                                <div key={key} className="flex items-center gap-3">
                                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                        {status === 'done' ? (
                                            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : status === 'error' ? (
                                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        ) : (
                                            <div className="w-3.5 h-3.5 border-2 border-wallstreet-600 border-t-wallstreet-accent rounded-full animate-spin" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`text-sm font-mono font-medium ${status === 'done' ? 'text-wallstreet-text' : status === 'error' ? 'text-red-500' : 'text-wallstreet-500'}`}>{label}</p>
                                        <p className="text-xs text-wallstreet-500 truncate">{sub}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
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

    // Safety check for data integrity
    const hasValidData = data.some(d => d.contribution !== undefined);
    if (!hasValidData) {
        console.warn("Data missing contribution field:", data[0]);
        return (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div className="bg-wallstreet-800 p-8 rounded-xl border border-wallstreet-700 shadow-sm max-w-lg">
                    <AlertTriangle size={48} className="text-wallstreet-accent mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-wallstreet-text mb-2">Invalid Data Format</h2>
                    <p className="text-wallstreet-500 mb-6">Data loaded but missing 'contribution' field.</p>
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
                                <button key={period} onClick={() => setTimeRange(period as any)} className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-all ${timeRange === period ? 'bg-wallstreet-accent text-white shadow-md' : 'text-wallstreet-500 hover:bg-wallstreet-900'}`}>{period}</button>
                            ))}
                        </div>
                    )}

                    {/* Print PDF Button - Only visible in Tables view */}
                    {viewMode === 'TABLES' && (
                        <button
                            onClick={handlePrint}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <Printer size={18} /> Print PDF
                        </button>
                    )}

                    {/* Year Selector */}
                    <Dropdown
                        value={selectedYear}
                        onChange={(val) => setSelectedYear(Number(val))}
                        options={[
                            { value: new Date().getFullYear() - 1, label: new Date().getFullYear() - 1 },
                            { value: new Date().getFullYear(), label: new Date().getFullYear() }
                        ]}
                        className="min-w-[100px]"
                    />

                    {/* View Mode Toggle */}
                    <div className="flex p-1 bg-wallstreet-200 rounded-xl">
                        <button onClick={() => setViewMode('OVERVIEW')} className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-2 ${viewMode === 'OVERVIEW' ? 'bg-wallstreet-800 text-wallstreet-accent shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text'}`}><Grid size={14} /> Overview</button>
                        <button onClick={() => setViewMode('TABLES')} className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-2 ${viewMode === 'TABLES' ? 'bg-wallstreet-800 text-wallstreet-accent shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text'}`}><Layers size={14} /> Tables</button>
                    </div>
                </div>
            </header>




            {isFuture ? (
                <FuturePeriodMessage />
            ) : (
                <>
                    {viewMode === 'OVERVIEW' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[500px]">

                        <WaterfallChart waterfallData={waterfallData} waterfallDomain={waterfallDomain as [number, number]} />

                        <SectorAttributionCharts
                            sectorAttributionData={sectorAttributionData}
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
                            isAttributionLoading={isAttributionLoading}
                        />
                    </div>



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
                            <table className="w-full text-[11px] border-collapse table-fixed">
                                <thead>
                                    <tr>
                                        <th className="px-3 py-2 text-center font-mono font-bold uppercase text-wallstreet-400 bg-wallstreet-900 border-b border-wallstreet-700 w-44 tracking-widest sticky top-0 z-30">Ticker</th>
                                        {allMonths.map(date => (
                                            <th key={date.toISOString()} className="py-2 text-center font-mono font-bold uppercase text-wallstreet-400 bg-wallstreet-900 border-b border-wallstreet-700 tracking-tighter sticky top-0 z-30">
                                                {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                            </th>
                                        ))}
                                        <th className="px-3 py-2 text-center font-mono font-bold uppercase text-wallstreet-text bg-wallstreet-900 border-b border-wallstreet-700 border-l border-wallstreet-300 w-24 sticky top-0 z-30">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.map((row) => (
                                        <tr key={row.ticker} className="hover:bg-wallstreet-900/50 transition-colors group">
                                            <td className="px-3 py-0 font-mono font-bold text-wallstreet-text border-b border-wallstreet-700 truncate text-sm">{row.ticker}</td>
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

                                                            // Adjust bg if showing hyphen to match "no data" style
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
                                                                            {formatHeatmapPct(val!)}
                                                                            {isPartialMf && <sup className="ml-0.5 text-[10px] text-amber-300">*</sup>}
                                                                        </span>
                                                                    ) : <span className="text-gray-300">-</span>}
                                                                    {!showHyphen && val !== null && (
                                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-2 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover/cell:opacity-100 pointer-events-none z-50 whitespace-nowrap shadow-xl flex flex-col items-center gap-1">
                                                                            <div className="font-bold border-b-0 pb-0 mb-0">{row.ticker} - {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
                                                                            <div className="text-wallstreet-500">{tooltipLabel}: {formatHeatmapPct(val)}</div>
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
                                                    const isZeroLatestWeight = (row.latestWeight || 0) < 0.0001; // Use latestWeight
                                                    const showTotalHyphen = isZeroTotal && isZeroLatestWeight;

                                                    if (showTotalHyphen) {
                                                        return <span className="text-gray-300">-</span>;
                                                    }
                                                    return <span className={rowTotal >= 0 ? 'text-green-700' : 'text-red-700'}>{formatHeatmapPct(rowTotal)}</span>;
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
                                                    {hasData ? <span className={val >= 0 ? 'text-green-700' : 'text-red-700'}>{formatHeatmapPct(val)}</span> : <span className="text-gray-300">-</span>}
                                                </td>
                                            )
                                        })}
                                        <td className="px-3 py-1 text-center font-mono font-bold text-sm border-l border-wallstreet-300 bg-wallstreet-200 text-wallstreet-text">
                                            <span className={heatmapTotals.grandTotal >= 0 ? 'text-green-800' : 'text-red-800'}>{formatHeatmapPct(heatmapTotals.grandTotal)}</span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                        <div className="space-y-6 print-area">
                        {/* Page 1: Q1 + Q2 */}
                        <div className="print-page">
                        {/* Print-only title */}
                        <div className="hidden print-title-block">
                            <h1 className="font-bold text-center">Top Contributors &amp; Disruptors — {primaryYear}</h1>
                        </div>
                        {/* Row 1: Jan, Feb, Mar, Q1 */}
                        {allMonths.length >= 3 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-row">
                                {[0, 1, 2].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = cleanData.filter((d: PortfolioItem) => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);

                                    // Status Indicators
                                    const now = new Date();
                                    const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

                                    let displayTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                    let status: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentMonth) {
                                        displayTitle += ' (MTD)';
                                        status = 'IN_PROGRESS';
                                    }

                                    const monthlyTotalReturn = getMonthlyBackcastReturn(date);

                                    return <AttributionTable key={date.toISOString()} title={displayTitle} items={items} status={status} totalContribution={monthlyTotalReturn ?? undefined} totalLabel={monthlyTotalReturn !== null ? compoundedTotalLabel : 'Total Portfolio'} />;
                                })}
                                {(() => {
                                    const q1Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [0, 1, 2].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q1Data.map(d => new Date(d.date).getMonth()));
                                    if (q1Data.length === 0 || uniqueMonths.size < 3) return null;

                                    // Quarter Status
                                    const now = new Date();
                                    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
                                    const isCurrentQuarter = primaryYear === now.getFullYear() && currentQuarter === 1;

                                    let qTitle = `Q1 ${primaryYear}`;
                                    let qStatus: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentQuarter) {
                                        qTitle += ' (QTD)';
                                        qStatus = 'IN_PROGRESS';
                                    }

                                    return <AttributionTable key="Q1" title={qTitle} items={aggregatePeriodData(q1Data)} isQuarter={true} status={qStatus} totalContribution={backcastQuarterReturns['Q1']} totalLabel={compoundedTotalLabel} />;
                                })()}
                            </div>
                        )}

                        {/* Row 2: Apr, May, Jun, Q2 */}
                        {allMonths.length >= 6 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-row">
                                {[3, 4, 5].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = cleanData.filter((d: PortfolioItem) => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);

                                    // Status Indicators
                                    const now = new Date();
                                    const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

                                    let displayTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                    let status: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentMonth) {
                                        displayTitle += ' (MTD)';
                                        status = 'IN_PROGRESS';
                                    }

                                    const monthlyTotalReturn = getMonthlyBackcastReturn(date);

                                    return <AttributionTable key={date.toISOString()} title={displayTitle} items={items} status={status} totalContribution={monthlyTotalReturn ?? undefined} totalLabel={monthlyTotalReturn !== null ? compoundedTotalLabel : 'Total Portfolio'} />;
                                })}
                                {(() => {
                                    const q2Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [3, 4, 5].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q2Data.map(d => new Date(d.date).getMonth()));
                                    if (q2Data.length === 0 || uniqueMonths.size < 3) return null;

                                    // Quarter Status
                                    const now = new Date();
                                    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
                                    const isCurrentQuarter = primaryYear === now.getFullYear() && currentQuarter === 2;

                                    let qTitle = `Q2 ${primaryYear}`;
                                    let qStatus: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentQuarter) {
                                        qTitle += ' (QTD)';
                                        qStatus = 'IN_PROGRESS';
                                    }

                                    return <AttributionTable key="Q2" title={qTitle} items={aggregatePeriodData(q2Data)} isQuarter={true} status={qStatus} totalContribution={backcastQuarterReturns['Q2']} totalLabel={compoundedTotalLabel} />;
                                })()}
                            </div>
                        )}

                        </div>{/* end print-page 1 */}

                        {/* Page 2: Q3 + Q4 */}
                        <div className="print-page">
                        {/* Row 3: Jul, Aug, Sep, Q3 */}
                        {allMonths.length >= 9 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-row">
                                {[6, 7, 8].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = cleanData.filter((d: PortfolioItem) => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);

                                    // Status Indicators
                                    const now = new Date();
                                    const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

                                    let displayTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                    let status: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentMonth) {
                                        displayTitle += ' (MTD)';
                                        status = 'IN_PROGRESS';
                                    }

                                    const monthlyTotalReturn = getMonthlyBackcastReturn(date);

                                    return <AttributionTable key={date.toISOString()} title={displayTitle} items={items} status={status} totalContribution={monthlyTotalReturn ?? undefined} totalLabel={monthlyTotalReturn !== null ? compoundedTotalLabel : 'Total Portfolio'} />;
                                })}
                                {(() => {
                                    const q3Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [6, 7, 8].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q3Data.map(d => new Date(d.date).getMonth()));
                                    if (q3Data.length === 0 || uniqueMonths.size < 3) return null;

                                    // Quarter Status
                                    const now = new Date();
                                    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
                                    const isCurrentQuarter = primaryYear === now.getFullYear() && currentQuarter === 3;

                                    let qTitle = `Q3 ${primaryYear}`;
                                    let qStatus: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentQuarter) {
                                        qTitle += ' (QTD)';
                                        qStatus = 'IN_PROGRESS';
                                    }

                                    return <AttributionTable key="Q3" title={qTitle} items={aggregatePeriodData(q3Data)} isQuarter={true} status={qStatus} totalContribution={backcastQuarterReturns['Q3']} totalLabel={compoundedTotalLabel} />;
                                })()}
                            </div>
                        )}

                        {/* Row 4: Oct, Nov, Dec, Q4 */}
                        {allMonths.length >= 12 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-row">
                                {[9, 10, 11].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = cleanData.filter((d: PortfolioItem) => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);

                                    // Status Indicators
                                    const now = new Date();
                                    const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

                                    let displayTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                    let status: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentMonth) {
                                        displayTitle += ' (MTD)';
                                        status = 'IN_PROGRESS';
                                    }

                                    const monthlyTotalReturn = getMonthlyBackcastReturn(date);

                                    return <AttributionTable key={date.toISOString()} title={displayTitle} items={items} status={status} totalContribution={monthlyTotalReturn ?? undefined} totalLabel={monthlyTotalReturn !== null ? compoundedTotalLabel : 'Total Portfolio'} />;
                                })}
                                {(() => {
                                    const q4Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [9, 10, 11].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q4Data.map(d => new Date(d.date).getMonth()));
                                    if (q4Data.length === 0 || uniqueMonths.size < 3) return null;

                                    // Quarter Status
                                    const now = new Date();
                                    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
                                    const isCurrentQuarter = primaryYear === now.getFullYear() && currentQuarter === 4;

                                    let qTitle = `Q4 ${primaryYear}`;
                                    let qStatus: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED';
                                    if (isCurrentQuarter) {
                                        qTitle += ' (QTD)';
                                        qStatus = 'IN_PROGRESS';
                                    }

                                    return <AttributionTable key="Q4" title={qTitle} items={aggregatePeriodData(q4Data)} isQuarter={true} status={qStatus} totalContribution={backcastQuarterReturns['Q4']} totalLabel={compoundedTotalLabel} />;
                                })()}
                            </div>
                        )}
                        </div>{/* end print-page 2 */}
                    </div>
                )}
            </>
        )}
        </div>
    );
};

export const AttributionView: React.FC<AttributionViewProps> = (props) => (
    <ErrorBoundary>
        <AttributionViewContent {...props} />
    </ErrorBoundary>
);
