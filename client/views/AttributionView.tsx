import React, { useMemo, useState, Component, ErrorInfo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, ScatterChart, Scatter, ZAxis, ComposedChart, Line, ReferenceArea, Dot } from 'recharts';
import { KPICard } from '../components/KPICard';
import { Dropdown } from '../components/Dropdown';
import { TrendingUp, Target, AlertTriangle, Calendar, Grid, Activity, Percent, Layers, Zap, Scale, Info, Printer, Download, Loader2, ArrowUpRight, ArrowDownRight, Briefcase } from 'lucide-react';
import { fetchSectorHistory, fetchSectors } from '../services/api';
import { PortfolioItem } from '../types';

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
                    <details className="whitespace-pre-wrap font-mono text-xs bg-white p-4 border border-red-100 rounded">
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}


interface AttributionViewProps {
    data: PortfolioItem[];
    selectedYear: 2025 | 2026;
    setSelectedYear: (year: 2025 | 2026) => void;
}

const formatPct = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '-';
    // ... (keep existing formatters)
    const abs = Math.abs(val);
    const str = `${abs.toFixed(2)}%`;
    return val < 0 ? `(${str})` : str;
};

const formatBps = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '-';
    const bps = Math.round(val * 100);
    const abs = Math.abs(bps);
    return val < 0 ? `(${abs})` : `${bps}`;
};

// ... (KPICard, TornadoLabel, TableItem, AttributionTable remain the same but I need to be careful not to delete them if I'm replacing a chunk. 
// Actually I should just replace the imports and then the useMemo part. I'll split this into two edits if needed, or one big one if contiguous.)



// KPICard removed - imported from components

const TornadoLabel = (props: any) => {
    const { x, y, width, height, value, payload } = props;
    // value can be absolute in some Recharts versions, so we rely on payload.value
    const realValue = payload && payload.value !== undefined ? payload.value : value;
    const isPos = realValue >= 0;
    const offset = 5;

    // Calculate visual endpoints of the bar
    // Recharts might send negative width for negative bars, or shift x.
    // robust way is to find min/max x.
    const barEnd = isPos ? Math.max(x, x + width) : Math.min(x, x + width);

    return (
        <text
            x={isPos ? barEnd + offset : barEnd - offset}
            y={y + height / 2 + 1}
            fill={isPos ? '#16a34a' : '#dc2626'}
            textAnchor={isPos ? 'start' : 'end'}
            dominantBaseline="central"
            className="text-[10px] font-mono font-bold"
        >
            {realValue > 0 ? '+' : ''}{Number(realValue).toFixed(2)}%
        </text>
    );
};

interface TableItem {
    ticker: string;
    weight: number;
    returnPct?: number;
    contribution: number;
}

const AttributionTable = ({ title, items, isQuarter = false }: { title: string, items: TableItem[], isQuarter?: boolean }) => {
    const positives = items.filter(i => i.contribution >= 0).sort((a, b) => b.contribution - a.contribution);
    const negatives = items.filter(i => i.contribution < 0).sort((a, b) => a.contribution - b.contribution);
    const topContributors = positives.slice(0, 5);
    const topContribSum = topContributors.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });
    const topDisruptors = negatives.slice(0, 5);
    const topDisruptSum = topDisruptors.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });
    const topTickerSet = new Set([...topContributors, ...topDisruptors].map(i => i.ticker));
    const others = items.filter(i => !topTickerSet.has(i.ticker));
    const othersSum = others.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });

    // User Request: Force Other Holdings Weight to be the residual so Total is always 100%
    // Weight = 100% - Sum(TopContributors) - Sum(TopDisruptors)
    const residualOtherWeight = 100 - topContribSum.weight - topDisruptSum.weight;

    // Recalculate Performance based on the Fixed Weight
    // Formula: Return = (Contribution * 100) / Weight  (derived from Contrib = Weight/100 * Return)
    const othersReturn = residualOtherWeight > 0.001 ? (othersSum.contribution * 100) / residualOtherWeight : 0;

    const totalSum = items.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });

    const RenderRow = ({ item, isBold = false, isSum = false }: { item: TableItem | any, isBold?: boolean, isSum?: boolean }) => (
        <tr className={`${isSum ? 'border-t-2 border-gray-300 bg-white' : 'border-b border-wallstreet-100 last:border-0'}`}>
            <td className={`p-1 px-3 text-left ${isBold || isSum ? 'font-bold' : 'font-medium'} text-black truncate`}>{isSum ? 'Σ' : item.ticker}</td>
            <td className={`p-1 px-2 text-center ${isBold || isSum ? 'font-bold' : ''} text-black`}>{item.weight.toFixed(2)}%</td>
            <td className={`p-1 px-2 text-center ${isBold || isSum ? 'font-bold' : ''} ${item.returnPct !== undefined ? (item.returnPct >= 0 ? 'text-green-700' : 'text-red-700') : 'text-gray-400'}`}>
                {item.returnPct !== undefined ? (item.returnPct < 0 ? `(${Math.abs(item.returnPct).toFixed(2)}%)` : `${item.returnPct.toFixed(2)}%`) : ''}
            </td>
            <td className={`p-1 px-2 text-right font-bold pr-4 ${item.contribution >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatBps(item.contribution)}
            </td>
        </tr>
    );

    return (
        <div className={`${isQuarter ? 'bg-black' : 'bg-white'} rounded-xl shadow-sm flex flex-col h-full font-mono text-xs overflow-hidden print-table ${isQuarter ? 'border-4 border-black' : 'border-4 border-[#f1f5f9]'}`}>
            {/* Title Row */}
            <div className="bg-black text-white py-4 text-center font-bold uppercase tracking-wider text-sm">
                {title}
            </div>

            <div className={`flex-1 overflow-x-auto ${isQuarter ? 'bg-white' : ''}`}>
                <table className="w-full">
                    {/* Top Contributors Section */}
                    <thead>
                        {/* Spacer Row */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        {/* Section Title - Light Grey Background for seamless look */}
                        <tr className="bg-white">
                            <td colSpan={4} className="text-center font-bold text-black py-1.5 uppercase tracking-wide text-xs">Top Contributors</td>
                        </tr>

                        {/* Column Headers */}
                        <tr className="bg-black text-white text-[10px] uppercase">
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Ticker</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Weight</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Performance</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Contrib. (bps)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topContributors.map((item, idx) => <RenderRow key={idx} item={item} />)}
                        <RenderRow item={{ ticker: '', weight: topContribSum.weight, returnPct: undefined, contribution: topContribSum.contribution }} isSum={true} />
                    </tbody>

                    {/* Top Disruptors Section */}
                    <thead>
                        {/* Spacer Row */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        {/* Section Title */}
                        <tr className="bg-white ">
                            <td colSpan={4} className="text-center font-bold text-black py-1.5 uppercase tracking-wide text-xs">Top Disruptors</td>
                        </tr>

                        {/* Column Headers */}
                        <tr className="bg-black text-white text-[10px] uppercase">
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Ticker</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Weight</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Performance</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Contrib. (bps)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topDisruptors.map((item, idx) => <RenderRow key={idx} item={item} />)}
                        <RenderRow item={{ ticker: '', weight: topDisruptSum.weight, returnPct: undefined, contribution: topDisruptSum.contribution }} isSum={true} />
                    </tbody>

                    {/* Footer Section */}
                    <tfoot>
                        {/* Spacer Row equivalent to Top Disruptors gap */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        <tr className="">
                            <td className="p-1 px-3 text-left font-bold text-black">Other Holdings</td>
                            <td className="p-1 px-2 text-center font-medium">{residualOtherWeight.toFixed(2)}%</td>
                            <td className={`p-1 px-2 text-center font-medium ${othersReturn < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {othersReturn < 0 ? `(${Math.abs(othersReturn).toFixed(2)}%)` : `${othersReturn.toFixed(2)}%`}
                            </td>
                            <td className={`p-1 px-2 text-right font-bold pr-4 ${othersSum.contribution < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {formatBps(othersSum.contribution)}
                            </td>
                        </tr>

                        {/* Gap between Other Holdings and Total Portfolio */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        {/* Total Portfolio - Grey Background */}
                        <tr className="bg-[#d1d5db]">
                            <td className="p-1.5 px-3 text-left font-extrabold text-black">Total Portfolio</td>
                            <td className="p-1.5 px-2 text-center font-bold text-black">100.00%</td>
                            <td className="p-1.5 px-2 text-center font-bold text-gray-500"></td>
                            <td className={`p-1.5 px-2 text-right font-extrabold pr-4 ${totalSum.contribution < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {formatBps(totalSum.contribution)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

const aggregatePeriodData = (data: PortfolioItem[]): TableItem[] => {
    if (data.length === 0) return [];

    // Group by Ticker
    const byTicker: Record<string, PortfolioItem[]> = {};
    data.forEach(d => {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = [];
        byTicker[d.ticker].push(d);
    });

    const results: TableItem[] = [];

    Object.keys(byTicker).forEach(ticker => {
        const items = byTicker[ticker];

        // 1. Weight: End-of-Period Weight
        // Find the item with the latest date (max date)
        // Sort items by date ascending to find the last one easily
        const sortedItems = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const lastItem = sortedItems[sortedItems.length - 1];
        const endOfPeriodWeight = lastItem.weight;

        // 2. Contribution: Sum of all particular contributions
        const totalContrib = items.reduce((sum, item) => sum + (item.contribution || 0), 0);

        // 3. Performance (Return): Weighted Average Return
        // Formula: Sum(Weight_i * Return_i) / Sum(Weight_i)
        let weightTimesReturnSum = 0;
        let weightSum = 0;

        items.forEach(item => {
            const w = item.weight || 0;
            const r = item.returnPct || 0;
            weightTimesReturnSum += (w * r);
            weightSum += w;
        });

        // Avoid division by zero
        const weightedAvgReturn = weightSum > 0 ? (weightTimesReturnSum / weightSum) : 0;

        // Only push if there is a non-zero weight OR a non-zero contribution
        // Use a small epsilon for contribution to avoid floating point noise
        if (endOfPeriodWeight > 0.001 || Math.abs(totalContrib) > 0.0001) {
            results.push({
                ticker,
                weight: endOfPeriodWeight,
                contribution: totalContrib,
                returnPct: weightedAvgReturn
            });
        }
    });

    return results;
};

const AttributionViewContent: React.FC<AttributionViewProps> = ({ data, selectedYear, setSelectedYear }) => {
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'TABLES'>('OVERVIEW');
    const [timeRange, setTimeRange] = useState<'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('YTD');
    const [sectorHistory, setSectorHistory] = useState<Record<string, { date: string, value: number }[]>>({});
    const [tickerSectors, setTickerSectors] = useState<Record<string, string>>({});
    const [loadingSectors, setLoadingSectors] = useState(true);
    const [regionFilter, setRegionFilter] = useState<'ALL' | 'US' | 'CA'>('ALL');

    React.useEffect(() => {
        const loadData = async () => {
            setLoadingSectors(true);
            const res = await fetchSectorHistory();
            setSectorHistory(res);
            setLoadingSectors(false);
        };
        loadData();
    }, []);

    // Fetch sector classifications for all tickers in the portfolio
    React.useEffect(() => {
        const tickers = Array.from(new Set(data.map(d => d.ticker))).filter(t => t !== 'CASH');
        if (tickers.length === 0) return;
        const loadTickerSectors = async () => {
            const sectors = await fetchSectors(tickers);
            setTickerSectors(sectors);
        };
        loadTickerSectors();
    }, [data]);

    const handlePrint = () => {
        window.print();
    };

    const cleanData = useMemo(() => {
        // Filter by year
        const yearFiltered = data.filter(d => new Date(d.date).getFullYear() === selectedYear);

        // Carry-over logic for 2026-01-01
        if (selectedYear === 2026) {
            const hasJan1 = yearFiltered.some(d => d.date.startsWith('2026-01-01'));
            if (!hasJan1) {
                // Find last data point from 2025
                const data2025 = data.filter(d => new Date(d.date).getFullYear() === 2025);
                if (data2025.length > 0) {
                    // Sort to find the latest
                    data2025.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const lastDate2025 = data2025[0].date;
                    const latest2025Snapshot = data2025.filter(d => d.date === lastDate2025);

                    // Create simulated entries for Jan 1st 2026 using last 2025 weights
                    const carryOver = latest2025Snapshot.map(item => ({
                        ...item,
                        date: '2026-01-01',
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
            const totalContrib = history.reduce((sum, item) => sum + (item.contribution || 0), 0);
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

            const totalReturn = history.reduce((sum, item) => sum + (item.returnPct || 0), 0);

            return { ticker, totalContrib, totalReturn, history, latestWeight, stdDevContrib, beta, riskScore: stdDevContrib };
        }).filter(t => t.latestWeight > 0.001 || Math.abs(t.totalContrib) > 0.0001);
    }, [uniqueTickers, filteredOverviewData, allMonths]);

    const sortedByContrib = useMemo(() => [...tickerStats].sort((a, b) => b.totalContrib - a.totalContrib), [tickerStats]);
    // Update: Sort by latestWeight instead of avgWeight to match Dashboard logic
    const sortedByWeight = useMemo(() => [...tickerStats].sort((a, b) => b.latestWeight - a.latestWeight), [tickerStats]);

    const matrixData = sortedByContrib.map(stat => {
        const row: any = { ticker: stat.ticker, total: stat.totalContrib, latestWeight: stat.latestWeight }; // Use latestWeight explicitly
        allMonths.forEach(monthDate => {
            const m = monthDate.getMonth();
            const y = monthDate.getFullYear();
            const monthlyEntries = stat.history.filter(h => {
                const d = new Date(h.date);
                return d.getMonth() === m && d.getFullYear() === y;
            });
            const key = `${y}-${m}`;
            row[key] = monthlyEntries.length > 0 ? monthlyEntries.reduce((acc, curr) => acc + (curr.contribution || 0), 0) : null;
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
        return hasAnyNonNullContrib;
    });


    const heatmapTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        const hasDataMap: Record<string, boolean> = {};
        const monthlyReturns: number[] = [];
        let grandTotal = 0;

        allMonths.forEach(date => {
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            totals[key] = 0;
            hasDataMap[key] = false;
        });

        matrixData.forEach(row => {
            grandTotal += row.total;
            allMonths.forEach(date => {
                const key = `${date.getFullYear()}-${date.getMonth()}`;
                const val = row[key];
                if (val !== null && val !== undefined) {
                    totals[key] += val;
                    hasDataMap[key] = true;
                }
            });
        });

        allMonths.forEach(date => {
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (hasDataMap[key]) monthlyReturns.push(totals[key]);
        });

        return { totals, grandTotal, hasDataMap, monthlyReturns };
    }, [matrixData, allMonths]);

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
            dataPoints.push({ name: item.ticker, value: [start < end ? start : end, start < end ? end : start], delta: item.totalContrib, isTotal: false, color: item.totalContrib >= 0 ? '#16a34a' : '#dc2626' });
            currentVal = end;
        });

        if (Math.abs(othersSum) > 0.001 || others.length > 0) {
            const start = currentVal;
            const end = currentVal + othersSum;
            dataPoints.push({ name: 'Others', value: [start < end ? start : end, start < end ? end : start], delta: othersSum, isTotal: false, color: othersSum >= 0 ? '#16a34a' : '#dc2626' });
            currentVal = end;
        }

        dataPoints.push({ name: 'Total', value: [0, currentVal], delta: currentVal, isTotal: true, color: '#0A2351' });
        return dataPoints;
    }, [sortedByWeight]);

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
        if (!sectorHistory || Object.keys(sectorHistory).length === 0) return {};
        
        const results: Record<string, number> = {};
        const quarters: Record<string, number[]> = { 'Q1': [0, 2], 'Q2': [3, 5], 'Q3': [6, 8], 'Q4': [9, 11] };
        
        Object.keys(sectorHistory).forEach(sector => {
            const hist = sectorHistory[sector];
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
    }, [sectorHistory, selectedYear, timeRange]);

    const sectorComparisonData = useMemo(() => {
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
            "Materials": "Basic Materials",
            "Consumer Discretionary": "Cons. Cyclical",
            "Financials": "Financial Services",
            "Real Estate": "Real Estate",
            "Communication Services": "Comm. Services",
            "Energy": "Energy",
            "Industrials": "Industrials",
            "Information Technology": "Technology",
            "Consumer Staples": "Cons. Defensive",
            "Health Care": "Health Care",
            "Utilities": "Utilities"
        };

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

        const sectorGroups: Record<string, { stocks: any[], sumWeight: number, sumWeightedReturn: number }> = {};

        // Filter tickers by region, excluding ETFs and MFs
        const filteredTickers = uniqueTickers.filter(ticker => {
            if (ticker === 'CASH' || ticker === '*CASH*') return false;
            // Exclude ETFs and Mutual Funds
            const entry = data.find(d => d.ticker === ticker);
            if (entry?.isEtf || entry?.isMutualFund) return false;
            
            if (regionFilter === 'CA') return ticker.endsWith('.TO');
            if (regionFilter === 'US') return !ticker.endsWith('.TO');
            return true; // ALL
        });

        filteredTickers.forEach(ticker => {
            const stats = tickerStats.find(t => t.ticker === ticker);
            if (!stats) return;
            
            // Get sector from fetched sector data (not from PortfolioItem which doesn't have it)
            const sectorName = tickerSectors[ticker] || 'Other';
            const benchmarkName = sectorMapping[sectorName] || 'Other';
            
            if (!sectorGroups[benchmarkName]) {
                sectorGroups[benchmarkName] = { stocks: [], sumWeight: 0, sumWeightedReturn: 0 };
            }
            
            // Calculate ticker return for the period
            const periodReturn = stats.history.reduce((sum, h) => sum + (h.returnPct || 0), 0);
            
            sectorGroups[benchmarkName].stocks.push({
                ticker,
                returnPct: periodReturn,
                weight: stats.latestWeight
            });
            sectorGroups[benchmarkName].sumWeight += stats.latestWeight;
            sectorGroups[benchmarkName].sumWeightedReturn += (periodReturn * stats.latestWeight);
        });

        // Convert to array for Chart
        const chartData = Object.keys(sectorGroups)
            .filter(s => sectorBenchmarkReturns[s] !== undefined && s !== 'Other')
            .map(sector => {
                const group = sectorGroups[sector];
                const benchReturn = sectorBenchmarkReturns[sector];

                // Relative Performance (Selection Effect)
                // Stock Perf = Sum(Wi * Perfi)
                // Sector Perf = Sum(Wi * Bench)
                const stockPerf = group.sumWeightedReturn; // This is sum(Wi * Perfi)
                const sectorPerf = (group.sumWeight * benchReturn); // This is sum(Wi) * Bench
                const selectionEffect = stockPerf - sectorPerf;
                
                return {
                    sector,
                    displayName: CANONICAL_TO_DISPLAY[sector] || sector,
                    value: selectionEffect,
                    fill: selectionEffect >= 0 ? '#22c55e' : '#ef4444',
                    benchmarkReturn: benchReturn,
                    portfolioReturn: group.sumWeight > 0 ? group.sumWeightedReturn / group.sumWeight : 0,
                    stocks: group.stocks.map(s => ({ 
                        ticker: s.ticker, 
                        returnPct: s.returnPct, 
                        weight: s.weight,
                        selectionContribution: s.weight * (s.returnPct - benchReturn)
                    }))
                };
            })
            .sort((a, b) => {
                const indexA = FIXED_SECTOR_ORDER.indexOf(a.sector);
                const indexB = FIXED_SECTOR_ORDER.indexOf(b.sector);
                return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
            });

        return chartData;
    }, [uniqueTickers, tickerStats, tickerSectors, sectorBenchmarkReturns, regionFilter, data]);

    const topMoversChartData = useMemo(() => {
        // Flatten all selection contributions from sectorComparisonData
        const allHoldings = sectorComparisonData.flatMap(s => s.stocks);
        
        const topPos = [...allHoldings].filter(i => i.selectionContribution > 0).sort((a, b) => b.selectionContribution - a.selectionContribution).slice(0, 5);
        const topNeg = [...allHoldings].filter(i => i.selectionContribution < 0).sort((a, b) => a.selectionContribution - b.selectionContribution).slice(0, 5); // Bottom 5 negative
        
        // Combine them: top performers first, then worst performers
        const combined = [...topPos, ...topNeg.reverse()]; // Reverse topNeg to show most negative at the bottom
        const maxAbs = combined.length > 0 ? Math.max(...combined.map(i => Math.abs(i.selectionContribution))) : 1;
        const domainLimit = maxAbs * 1.3;
        const data = combined.map(i => ({ ticker: i.ticker, value: i.selectionContribution, fill: i.selectionContribution >= 0 ? '#22c55e' : '#ef4444' }));
        return { data, domain: [-domainLimit, domainLimit] };
    }, [sectorComparisonData]);





    const activeReturn = heatmapTotals.grandTotal;
    const sharpeRatio = useMemo(() => {
        const returns = heatmapTotals.monthlyReturns;
        if (returns.length < 2) return 0;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
        const stdDev = Math.sqrt(variance);
        if (stdDev === 0) return 0;
        return (mean / stdDev) * Math.sqrt(12);
    }, [heatmapTotals.monthlyReturns]);

    // Debug logging


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
        <div className="max-w-[100vw] mx-auto p-4 md:p-6 space-y-6 overflow-x-hidden min-h-screen">
            <header className="border-b border-wallstreet-700 pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 print:hidden">
                <div>
                    <h2 className="text-3xl font-bold font-mono text-wallstreet-text">Performance Attribution</h2>
                    <p className="text-wallstreet-500 mt-1 text-sm">Allocation vs. Selection Effect Analysis (Excl. Cash)</p>
                </div>
                <div className="flex items-center gap-4">
                    {/* Year Selector */}
                    <Dropdown
                        value={selectedYear}
                        onChange={(val) => setSelectedYear(Number(val) as 2025 | 2026)}
                        options={[
                            { value: 2025, label: 2025 },
                            { value: 2026, label: 2026 }
                        ]}
                        className="min-w-[100px]"
                    />
                    <div className="flex p-1 bg-wallstreet-200 rounded-xl">
                        <button onClick={() => setViewMode('OVERVIEW')} className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-2 ${viewMode === 'OVERVIEW' ? 'bg-white text-wallstreet-accent shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text'}`}><Grid size={14} /> Overview</button>
                        <button onClick={() => setViewMode('TABLES')} className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-2 ${viewMode === 'TABLES' ? 'bg-white text-wallstreet-accent shadow-sm' : 'text-wallstreet-500 hover:text-wallstreet-text'}`}><Layers size={14} /> Tables</button>
                    </div>
                    {/* Time Range Selector - Only visible in Overview */}
                    {viewMode === 'OVERVIEW' && (
                        <div className="flex items-center bg-white border border-wallstreet-700 rounded-lg p-1 shadow-sm">
                            {['YTD', 'Q1', 'Q2', 'Q3', 'Q4'].map((period) => (
                                <button key={period} onClick={() => setTimeRange(period as any)} className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-all ${timeRange === period ? 'bg-wallstreet-text text-white shadow-md' : 'text-wallstreet-500 hover:bg-slate-100'}`}>{period}</button>
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
                </div>
            </header>




            {viewMode === 'OVERVIEW' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[500px]">
                        <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
                            <div className="mb-4">
                                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2"><TrendingUp size={16} className="text-wallstreet-500" /> Return Waterfall (Top 10)</h3>
                            </div>
                            <div className="flex-1 w-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={waterfallData} margin={{ top: 30, right: 30, left: 0, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#64748b' }} interval={0} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                        <YAxis domain={waterfallDomain} tickFormatter={(val) => `${val.toFixed(1)}%`} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="bg-white text-black text-xs p-2 rounded shadow-xl font-mono border border-wallstreet-200">
                                                        <div className="font-bold border-b border-wallstreet-200 pb-1 mb-1">{d.name}</div>
                                                        <div>Impact: <span className={d.delta >= 0 ? 'text-green-600' : 'text-red-600'}>{d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}%</span></div>
                                                        {!d.isTotal && <div className="text-slate-500 mt-1">Cumulative: {d.value[1].toFixed(2)}%</div>}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }} />
                                        <ReferenceLine y={0} stroke="#94a3b8" />
                                        <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                                            {waterfallData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                            <LabelList dataKey="delta" position="top" formatter={(val: number) => Math.abs(val) > 0.001 ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : ''} style={{ fill: '#64748b', fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="lg:col-span-4 flex flex-col md:gap-4 gap-4 h-full">
                            <div className="bg-white p-4 rounded-xl border border-wallstreet-700 shadow-sm flex-1 flex flex-col min-h-[400px] relative">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-xs flex items-center gap-2">
                                        <Briefcase size={14} className="text-wallstreet-500" /> Sector Comparison
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <div className="flex p-0.5 bg-wallstreet-200 rounded-lg">
                                            {(['ALL', 'US', 'CA'] as const).map(region => (
                                                <button
                                                    key={region}
                                                    onClick={() => setRegionFilter(region)}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                                                        regionFilter === region
                                                            ? 'bg-white text-wallstreet-accent shadow-sm'
                                                            : 'text-wallstreet-500 hover:text-wallstreet-text'
                                                    }`}
                                                >
                                                    {region === 'ALL' ? 'Total' : region}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex gap-2 text-[10px] font-mono">
                                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Bench</span>
                                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-wallstreet-accent"></div> Ptf</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 w-full rounded-lg relative overflow-hidden">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            data={sectorComparisonData} 
                                            layout="vertical" 
                                            margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                                            barCategoryGap="25%"
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                                            <XAxis type="number" tickFormatter={(val) => `${val.toFixed(1)}%`} tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                                            <YAxis dataKey="displayName" type="category" tick={{ fontSize: 9, fontFamily: 'monospace', width: 100 }} width={100} interval={0} />
                                            <Tooltip content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-white p-3 rounded-lg shadow-xl border border-wallstreet-200 font-mono text-xs z-50">
                                                            <div className="font-bold border-b pb-1 mb-2 uppercase">{d.displayName}</div>
                                                            <div className="flex justify-between gap-4 mb-1">
                                                                <span className="text-slate-500 text-[10px]">Relative Perf:</span>
                                                                <span className={`font-bold ${d.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {d.value > 0 ? '+' : ''}{d.value.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between gap-4 mb-1">
                                                                <span className="text-slate-500 text-[10px]">Benchmark:</span>
                                                                <span className="font-bold text-blue-600">{d.benchmarkReturn.toFixed(2)}%</span>
                                                            </div>
                                                            <div className="flex justify-between gap-4 mb-2">
                                                                <span className="text-slate-500 text-[10px]">Portfolio Avg:</span>
                                                                <span className="font-bold text-wallstreet-accent">{d.portfolioReturn.toFixed(2)}%</span>
                                                            </div>
                                                            <div className="border-t pt-2 mt-2">
                                                                <div className="text-[10px] text-slate-400 mb-1 uppercase">Selection Alpha per Holding:</div>
                                                                 {[...d.stocks].sort((a: any, b: any) => b.selectionContribution - a.selectionContribution).map((s: any, idx: number) => (
                                                                    <div key={idx} className="flex justify-between gap-4 py-0.5">
                                                                        <span className="font-bold">{s.ticker}</span>
                                                                        <span className={s.selectionContribution >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                            {s.selectionContribution >= 0 ? '+' : ''}{s.selectionContribution.toFixed(2)}%
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }} />
                                            
                                            <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1} />
                                            
                                            <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                                                {sectorComparisonData.map((entry, index) => (
                                                    <Cell key={`cell-s-${index}`} fill={entry.fill} />
                                                ))}
                                                <LabelList dataKey="value" content={TornadoLabel} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {loadingSectors && (
                                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin text-wallstreet-accent" size={24} />
                                            <span className="font-mono text-[10px] text-slate-400 font-bold uppercase tracking-widest">Loading Benchmarks</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>


                        <div className="lg:col-span-3 bg-white p-4 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
                            <div className="mb-2">
                                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-xs flex items-center gap-2"><Activity size={14} className="text-wallstreet-500" /> Best & Worst Performers (%)</h3>
                            </div>
                            <div className="flex-1 w-full min-h-[200px] flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={topMoversChartData.data} margin={{ top: 0, right: 30, left: 20, bottom: 0 }} barCategoryGap="25%">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" domain={topMoversChartData.domain} hide />
                                        <YAxis type="category" dataKey="ticker" width={55} tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#1e293b', fontWeight: 'bold' }} axisLine={false} tickLine={false} interval={0} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="bg-white text-black text-xs p-2 rounded shadow-xl font-mono border border-wallstreet-200 z-50">
                                                        <div className="font-bold border-b border-wallstreet-200 pb-1 mb-1 text-center font-bold">{d.ticker}</div>
                                                        <div className="text-center"><span className={d.value >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{d.value > 0 ? '+' : ''}{d.value.toFixed(2)}%</span></div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }} />
                                        <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1} />
                                        <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                                            {topMoversChartData.data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                            <LabelList dataKey="value" content={TornadoLabel} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>



                    <div className="bg-white rounded-xl border border-wallstreet-700 shadow-lg overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b border-wallstreet-700 bg-wallstreet-50/50">
                            <div>
                                <h3 className="text-sm font-mono font-bold text-wallstreet-text uppercase tracking-wider">Contribution Heatmap</h3>
                                <p className="text-[10px] text-wallstreet-500 mt-1 font-mono">BPS contribution per ticker. Bottom row represents the aggregate portfolio return for the period.</p>
                            </div>
                        </div>
                        <div className="w-full">
                            <table className="w-full text-xs border-collapse table-fixed">
                                <thead>
                                    <tr>
                                        <th className="p-3 text-center font-mono font-bold uppercase text-wallstreet-500 bg-wallstreet-900 border-b border-wallstreet-700 w-32">Ticker</th>
                                        {allMonths.map(date => (
                                            <th key={date.toISOString()} className="py-3 text-center font-mono font-bold uppercase text-wallstreet-500 bg-wallstreet-900 border-b border-wallstreet-700">
                                                {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                            </th>
                                        ))}
                                        <th className="p-3 text-center font-mono font-extrabold uppercase text-wallstreet-text bg-wallstreet-900 border-b border-wallstreet-700 border-l border-wallstreet-300 w-20">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.map((row) => (
                                        <tr key={row.ticker} className="hover:bg-gray-50 transition-colors group">
                                            <td className="p-3 font-mono font-extrabold text-wallstreet-text border-b border-wallstreet-100 truncate text-sm">{row.ticker}</td>
                                            {allMonths.map(date => {
                                                const val = row[`${date.getFullYear()}-${date.getMonth()}`];
                                                const intensity = val !== null ? Math.min(Math.abs(val) / 2.0, 1) : 0;
                                                let bg = '#f8fafc';
                                                if (val !== null) bg = val >= 0 ? `rgba(22, 163, 74, ${0.1 + (intensity * 0.9)})` : `rgba(220, 38, 38, ${0.1 + (intensity * 0.9)})`;
                                                if (val !== null && Math.abs(val) < 0.0001) bg = '#ffffff';
                                                const color = (val !== null && intensity > 0.5) ? 'white' : (val !== null && val >= 0 ? '#14532d' : '#7f1d1d');

                                                return (
                                                    <td key={date.toISOString()} className="p-0 border-b border-white relative group/cell">
                                                        {(() => {
                                                            const maxW = row[`w-${date.getFullYear()}-${date.getMonth()}`];
                                                            const isZeroVal = val !== null && Math.abs(val) < 0.0001;
                                                            const isZeroWeight = maxW !== undefined && maxW < 0.0001;
                                                            const showHyphen = val === null || (isZeroVal && isZeroWeight);

                                                            // Adjust bg if showing hyphen to match "no data" style
                                                            const displayBg = showHyphen ? '#f8fafc' : bg;

                                                            return (
                                                                <div className="w-full h-10 flex items-center justify-center font-mono font-medium cursor-default transition-transform hover:scale-110 hover:z-20 hover:shadow-sm relative" style={{ backgroundColor: displayBg, color }}>
                                                                    {!showHyphen ? <span className="opacity-100">{val! > 0 ? '+' : ''}{val!.toFixed(2)}%</span> : <span className="text-gray-300">-</span>}
                                                                    {!showHyphen && val !== null && (
                                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-2 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover/cell:opacity-100 pointer-events-none z-30 whitespace-nowrap shadow-xl flex flex-col items-center gap-1">
                                                                            <div className="font-bold border-b-0 pb-0 mb-0">{row.ticker} - {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-3 text-right font-mono font-extrabold border-b border-wallstreet-100 border-l border-wallstreet-300 bg-gray-50/80 text-sm">
                                                {(() => {
                                                    const isZeroTotal = Math.abs(row.total) < 0.0001;
                                                    const isZeroLatestWeight = (row.latestWeight || 0) < 0.0001; // Use latestWeight
                                                    const showTotalHyphen = isZeroTotal && isZeroLatestWeight;

                                                    if (showTotalHyphen) {
                                                        return <span className="text-gray-300">-</span>;
                                                    }
                                                    return <span className={row.total >= 0 ? 'text-green-700' : 'text-red-700'}>{row.total > 0 ? '+' : ''}{row.total.toFixed(2)}%</span>;
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-wallstreet-100 border-t-2 border-wallstreet-700 shadow-inner">
                                        <td className="p-3 font-mono font-bold text-wallstreet-text text-xs uppercase">Total Portfolio</td>
                                        {allMonths.map(date => {
                                            const key = `${date.getFullYear()}-${date.getMonth()}`;
                                            const hasData = heatmapTotals.hasDataMap[key];
                                            const val = heatmapTotals.totals[key];
                                            return (
                                                <td key={date.toISOString()} className="p-3 text-center font-mono font-bold text-xs border-b border-wallstreet-100 border-l border-white">
                                                    {hasData ? <span className={val >= 0 ? 'text-green-700' : 'text-red-700'}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span> : <span className="text-gray-300">-</span>}
                                                </td>
                                            )
                                        })}
                                        <td className="p-3 text-center font-mono font-extrabold text-xs border-l border-wallstreet-300 bg-wallstreet-200 text-wallstreet-text">
                                            <span className={heatmapTotals.grandTotal >= 0 ? 'text-green-800' : 'text-red-800'}>{heatmapTotals.grandTotal > 0 ? '+' : ''}{heatmapTotals.grandTotal.toFixed(2)}%</span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )
            }

            {/* TABLES VIEW - Combined M M M Q layout */}
            {
                viewMode === 'TABLES' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 print-area">
                        {/* Row 1: Jan, Feb, Mar, Q1 */}
                        {allMonths.length >= 3 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-spaced-row print-top-spacing">
                                {[0, 1, 2].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = data.filter(d => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);
                                    return <AttributionTable key={date.toISOString()} title={date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} items={items} />;
                                })}
                                {(() => {
                                    const q1Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [0, 1, 2].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q1Data.map(d => new Date(d.date).getMonth()));
                                    if (q1Data.length === 0 || uniqueMonths.size < 3) return null;
                                    return <AttributionTable key="Q1" title={`Q1 ${primaryYear}`} items={aggregatePeriodData(q1Data)} isQuarter={true} />;
                                })()}
                            </div>
                        )}

                        {/* Row 2: Apr, May, Jun, Q2 */}
                        {allMonths.length >= 6 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-break-after">
                                {[3, 4, 5].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = data.filter(d => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);
                                    return <AttributionTable key={date.toISOString()} title={date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} items={items} />;
                                })}
                                {(() => {
                                    const q2Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [3, 4, 5].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q2Data.map(d => new Date(d.date).getMonth()));
                                    if (q2Data.length === 0 || uniqueMonths.size < 3) return null;
                                    return <AttributionTable key="Q2" title={`Q2 ${primaryYear}`} items={aggregatePeriodData(q2Data)} isQuarter={true} />;
                                })()}
                            </div>
                        )}

                        {/* Row 3: Jul, Aug, Sep, Q3 */}
                        {allMonths.length >= 9 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end print-spaced-row print-top-spacing">
                                {[6, 7, 8].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = data.filter(d => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);
                                    return <AttributionTable key={date.toISOString()} title={date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} items={items} />;
                                })}
                                {(() => {
                                    const q3Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [6, 7, 8].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q3Data.map(d => new Date(d.date).getMonth()));
                                    if (q3Data.length === 0 || uniqueMonths.size < 3) return null;
                                    return <AttributionTable key="Q3" title={`Q3 ${primaryYear}`} items={aggregatePeriodData(q3Data)} isQuarter={true} />;
                                })()}
                            </div>
                        )}

                        {/* Row 4: Oct, Nov, Dec, Q4 */}
                        {allMonths.length >= 12 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
                                {[9, 10, 11].map(monthIdx => {
                                    const date = allMonths[monthIdx];
                                    if (!date) return <div key={monthIdx} className="hidden" />;
                                    const monthlyData = data.filter(d => {
                                        const dDate = new Date(d.date);
                                        return dDate.getFullYear() === date.getFullYear() && dDate.getMonth() === date.getMonth() && !d.ticker.toUpperCase().includes('CASH');
                                    });
                                    if (monthlyData.length === 0) return <div key={monthIdx} className="hidden" />;
                                    const items = aggregatePeriodData(monthlyData);
                                    return <AttributionTable key={date.toISOString()} title={date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} items={items} />;
                                })}
                                {(() => {
                                    const q4Data = cleanData.filter(d => {
                                        const m = new Date(d.date).getMonth();
                                        const y = new Date(d.date).getFullYear();
                                        return [9, 10, 11].includes(m) && y === primaryYear;
                                    });
                                    const uniqueMonths = new Set(q4Data.map(d => new Date(d.date).getMonth()));
                                    if (q4Data.length === 0 || uniqueMonths.size < 3) return null;
                                    return <AttributionTable key="Q4" title={`Q4 ${primaryYear}`} items={aggregatePeriodData(q4Data)} isQuarter={true} />;
                                })()}
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
};
export const AttributionView: React.FC<AttributionViewProps> = (props) => (
    <ErrorBoundary>
        <AttributionViewContent {...props} />
    </ErrorBoundary>
);
