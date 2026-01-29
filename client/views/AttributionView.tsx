import React, { useMemo, useState, Component, ErrorInfo } from 'react';
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

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, ScatterChart, Scatter, ZAxis, ComposedChart, Line, ReferenceArea } from 'recharts';
import { KPICard } from '../components/KPICard';
import { Dropdown } from '../components/Dropdown';
import { TrendingUp, Target, AlertTriangle, Calendar, Grid, Activity, Percent, Layers, Zap, Scale, Info, Printer, Download, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';


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
        items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const lastItem = items[items.length - 1];
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

            return { ticker, totalContrib, history, latestWeight, stdDevContrib, beta, riskScore: stdDevContrib };
        }).filter(t => t.latestWeight > 0.001 || Math.abs(t.totalContrib) > 0.0001);
    }, [uniqueTickers, filteredOverviewData, allMonths]);

    const sortedByContrib = useMemo(() => [...tickerStats].sort((a, b) => b.totalContrib - a.totalContrib), [tickerStats]);
    // Update: Sort by latestWeight instead of avgWeight to match Dashboard logic
    const sortedByWeight = useMemo(() => [...tickerStats].sort((a, b) => b.latestWeight - a.latestWeight), [tickerStats]);

    const capitalEfficiencyData = useMemo(() => {
        // Calculate Total Portfolio Contribution (Sum of all ticker total contributions)
        const totalPortfolioContrib = tickerStats.reduce((sum, t) => sum + t.totalContrib, 0);

        // Sort by Weight Descending and take Top 15 for cleaner visualization
        const top30 = [...tickerStats]
            .sort((a, b) => b.latestWeight - a.latestWeight)
            .slice(0, 15);

        return top30.map(s => {
            // Efficiency Score: Distance from the expected return line
            // Expected Return = Weight * (TotalPortfolioReturn / 100)
            const expectedContrib = (s.latestWeight / 100) * totalPortfolioContrib;
            const efficiencyScore = s.totalContrib - expectedContrib; // Positive = Improving Efficiency

            // Total Return % (Simple approximation: Contrib / Weight)
            const impliedReturn = s.latestWeight > 0.01 ? (s.totalContrib / s.latestWeight) * 100 : 0;

            return {
                ticker: s.ticker,
                x: s.latestWeight,
                y: s.totalContrib, // Absolute Contribution %
                absoluteContrib: s.totalContrib,
                efficiencyScore: efficiencyScore,
                impliedReturn: impliedReturn,
                z: 1 // Placeholder for Sizing if we had Conviction data
            };
        });
    }, [tickerStats]);

    // Calculate dynamic domains for X and Y to maximize graph space usage with constant increments
    const { xDomain, xTicks, yDomain, yTicks, portfolioReturn } = useMemo(() => {
        // Calculate Portfolio Return for Reference Line Slope
        const totalPortRet = tickerStats.reduce((sum, t) => sum + t.totalContrib, 0);

        if (capitalEfficiencyData.length === 0) return { xDomain: [0, 10], xTicks: [0, 2, 4, 6, 8, 10], yDomain: [0, 10], yTicks: [0, 2, 4, 6, 8, 10], portfolioReturn: totalPortRet };

        const minX = 0; // Weights are always positive
        const maxX = Math.max(0, ...capitalEfficiencyData.map(d => d.x));

        const minY = Math.min(0, ...capitalEfficiencyData.map(d => d.y));
        const maxY = Math.max(0, ...capitalEfficiencyData.map(d => d.y));

        const getTicks = (minVal: number, maxVal: number) => {
            // Determine range to find step size
            const range = maxVal - minVal;
            const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));

            let step = 1;
            if (absMax > 100) step = 20;
            else if (absMax > 50) step = 10;
            else if (absMax > 25) step = 5;
            else if (absMax > 8) step = 2; // Granular step for small contributions
            else if (absMax > 2) step = 0.5; // Very granular for small contribs
            else step = 0.1;

            // Round min/max to nearest step
            const niceMin = Math.floor(minVal / step) * step;
            const niceMax = Math.ceil(maxVal / step) * step;

            const ticks: number[] = [];
            // Use epsilon to avoid float artifacts
            for (let i = niceMin; i <= niceMax + (step / 1000); i += step) {
                ticks.push(Number(i.toFixed(2))); // Keep 2 decimals for small contribs if needed
            }
            return { domain: [niceMin, niceMax], ticks };
        };

        const xData = getTicks(minX, maxX); // X is always 0 to Max
        const yData = getTicks(minY, maxY); // Y can be negative (No buffer needed if ticks align)

        return { xDomain: xData.domain, xTicks: xData.ticks, yDomain: yData.domain, yTicks: yData.ticks, portfolioReturn: totalPortRet };
    }, [capitalEfficiencyData, tickerStats]);

    const diagonalEndpoint = useMemo(() => {
        // Line Equation: y = x * (PortfolioReturn / 100)
        // We start at (0,0). We need to find where this line intersects the bounding box defined by domains.
        // Slope m
        const m = portfolioReturn / 100;

        // Bounding Box
        const xMin = xDomain[0] as number;
        const xMax = xDomain[1] as number;
        const yMin = yDomain[0] as number;
        const yMax = yDomain[1] as number;

        // Candidates for end point:
        // 1. Right Wall (x = xMax) -> y = m * xMax
        const yAtRight = m * xMax;
        if (yAtRight >= yMin && yAtRight <= yMax) {
            return [{ x: 0, y: 0 }, { x: xMax, y: yAtRight }];
        }

        // 2. Top Wall (y = yMax) -> x = yMax / m (Only if m > 0)
        if (m > 0) {
            const xAtTop = yMax / m;
            if (xAtTop >= xMin && xAtTop <= xMax) {
                return [{ x: 0, y: 0 }, { x: xAtTop, y: yMax }];
            }
        }

        // 3. Bottom Wall (y = yMin) -> x = yMin / m (Only if m < 0)
        if (m < 0) {
            const xAtBottom = yMin / m;
            if (xAtBottom >= xMin && xAtBottom <= xMax) {
                return [{ x: 0, y: 0 }, { x: xAtBottom, y: yMin }];
            }
        }

        // Fallback default (should be covered by above unless 0 slope)
        return [{ x: 0, y: 0 }, { x: xMax, y: 0 }];
    }, [xDomain, yDomain, portfolioReturn]);

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

        // Add a tiny buffer (5%) so the top label doesn't get cut off, but keep it tight
        const range = max - min;
        const buffer = range * 0.05;

        return [min, max + buffer];
    }, [waterfallData]);

    const topMoversChartData = useMemo(() => {
        const topPos = sortedByContrib.filter(i => i.totalContrib > 0).slice(0, 5);
        const topNeg = sortedByContrib.filter(i => i.totalContrib < 0).slice(-5);
        const combined = [...topPos, ...topNeg].sort((a, b) => b.totalContrib - a.totalContrib);
        const maxAbs = combined.length > 0 ? Math.max(...combined.map(i => Math.abs(i.totalContrib))) : 1;
        const domainLimit = maxAbs * 1.6;
        const data = combined.map(i => ({ ticker: i.ticker, value: i.totalContrib, fill: i.totalContrib >= 0 ? '#16a34a' : '#dc2626' }));
        return { data, domain: [-domainLimit, domainLimit] };
    }, [sortedByContrib]);





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
                                    <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
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
                            <div className="bg-white p-4 rounded-xl border border-wallstreet-700 shadow-sm flex-1 flex flex-col min-h-[220px]">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-xs flex items-center gap-2">
                                        <Scale size={14} className="text-wallstreet-500" /> Capital Efficiency Matrix (Top 15)
                                    </h3>
                                    <div className="flex gap-2 text-[10px] font-mono">
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Accretive</span>
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Dilutive</span>
                                    </div>
                                </div>
                                <div className="flex-1 w-full rounded-lg relative" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0) 60%, rgba(244, 63, 94, 0.08) 100%)' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis type="number" dataKey="x" name="Weight" unit="%" tick={{ fontSize: 10 }} tickFormatter={(val: number) => `${val.toFixed(1)}`} label={{ value: 'Weight %', position: 'bottom', offset: 0, fontSize: 10 }} domain={xDomain} allowDecimals={false} ticks={xTicks} />
                                            <YAxis type="number" dataKey="y" name="Contribution" unit="%" tick={{ fontSize: 10 }} tickFormatter={(val: number) => `${val.toFixed(1)}`} label={{ value: 'Contribution %', angle: -90, position: 'insideLeft', fontSize: 10 }} domain={yDomain} allowDecimals={false} ticks={yTicks} />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    const effScore = d.efficiencyScore;
                                                    let action = "Hold";
                                                    let actionColor = "text-slate-500";

                                                    // Action Logic
                                                    if (effScore > 0.05) {
                                                        action = d.x < 3 ? "Add / Scale Up" : "Winner (Keep Riding)";
                                                        actionColor = "text-emerald-600";
                                                    } else if (effScore < -0.05) {
                                                        action = d.x > 3 ? "Review / Trim" : "Watch (Speculative)";
                                                        actionColor = "text-rose-600";
                                                    }

                                                    return (
                                                        <div className="bg-white text-black text-xs p-3 rounded-lg shadow-xl font-mono border border-wallstreet-200 z-50 min-w-[180px]">
                                                            <div className="flex justify-between items-center border-b border-wallstreet-200 pb-2 mb-2">
                                                                <span className="font-bold text-sm">{d.ticker}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${effScore > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                                    {effScore > 0 ? 'Efficient' : 'Inefficient'}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                                                                <span className="text-slate-500 text-left">Weight:</span>
                                                                <span className="text-right font-bold text-slate-700">{d.x.toFixed(2)}%</span>

                                                                <span className="text-slate-500 text-left">Contrib:</span>
                                                                <span className={`text-right font-bold ${d.y > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                                    {d.y > 0 ? '+' : ''}{d.y.toFixed(2)}%
                                                                </span>

                                                                <div className="col-span-2 border-t border-slate-100 my-1"></div>

                                                                <span className="text-slate-500 text-left flex items-center gap-1"><Info size={10} /> Action:</span>
                                                                <span className={`text-right font-bold ${actionColor}`}>
                                                                    {action}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }} />
                                            {/* Reference Line at Expected Contribution (y = Weight * PortfolioReturn) */}
                                            <ReferenceLine segment={diagonalEndpoint as any} stroke="#94a3b8" strokeDasharray="3 3" />
                                            <Scatter name="Tickers" data={capitalEfficiencyData} fill="#004dea">
                                                {capitalEfficiencyData.map((entry, index) => {
                                                    // Gradient coloring based on Efficiency Score
                                                    // Map score (-0.5 to +0.5 typically) to color saturation
                                                    const score = entry.efficiencyScore;
                                                    let fill = '#64748b'; // Neutral

                                                    if (score > 0) {
                                                        // Green Gradient
                                                        if (score > 0.2) fill = '#15803d'; // Deep Green
                                                        else if (score > 0.05) fill = '#22c55e'; // Bright Green
                                                        else fill = '#86efac'; // Light Green
                                                    } else {
                                                        // Red Gradient
                                                        if (score < -0.2) fill = '#b91c1c'; // Deep Red
                                                        else if (score < -0.05) fill = '#ef4444'; // Bright Red
                                                        else fill = '#fca5a5'; // Light Red
                                                    }

                                                    return <Cell key={`cell-${index}`} fill={fill} stroke="#ffffff" strokeWidth={2} />;
                                                })}
                                                {/* Minimal Labeling: Only label the 1-2 most extreme & isolated points */}
                                                <LabelList
                                                    dataKey="ticker"
                                                    position="top"
                                                    content={(props: any) => {
                                                        const { x, y, value, index } = props;
                                                        const item = capitalEfficiencyData[index];

                                                        // Find the max and min Y values to only label extremes
                                                        const maxY = Math.max(...capitalEfficiencyData.map(d => d.y));
                                                        const minY = Math.min(...capitalEfficiencyData.map(d => d.y));

                                                        // Only label THE top performer and THE worst performer
                                                        const isTopPerformer = item.y === maxY && maxY > 1.0;
                                                        const isWorstPerformer = item.y === minY && minY < -0.3;

                                                        if (isTopPerformer) {
                                                            return (
                                                                <text x={x} y={y} dy={-10} fill="#15803d" fontSize={10} fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                                                                    {value}
                                                                </text>
                                                            );
                                                        }

                                                        if (isWorstPerformer) {
                                                            return (
                                                                <text x={x} y={y} dy={18} fill="#b91c1c" fontSize={10} fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                                                                    {value}
                                                                </text>
                                                            );
                                                        }

                                                        return null;
                                                    }}
                                                />
                                            </Scatter>
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-3 bg-white p-4 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col">
                            <div className="mb-2">
                                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-xs flex items-center gap-2"><Activity size={14} className="text-wallstreet-500" /> Best & Worst Performers (%)</h3>
                            </div>
                            <div className="flex-1 w-full min-h-[200px] flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={topMoversChartData.data} margin={{ top: 0, right: 30, left: 30, bottom: 0 }} barCategoryGap="20%">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9e3" />
                                        <XAxis type="number" domain={topMoversChartData.domain} hide />
                                        <YAxis type="category" dataKey="ticker" width={45} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#475569', fontWeight: 'bold' }} axisLine={false} tickLine={false} interval={0} />
                                        <Tooltip cursor={{ fill: '#f1f5f9' }} content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="bg-white text-black text-xs p-2 rounded shadow-xl font-mono border border-wallstreet-200 z-50">
                                                        <div className="font-bold border-b border-wallstreet-200 pb-1 mb-1 text-center">{d.ticker}</div>
                                                        <div className="text-center"><span className={d.value >= 0 ? 'text-green-600' : 'text-red-600'}>{d.value > 0 ? '+' : ''}{d.value.toFixed(2)}%</span></div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }} />
                                        <ReferenceLine x={0} stroke="#94a3b8" />
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
