import React, { useEffect, useState, useMemo } from 'react';
import { ShieldAlert, Activity, Target, Layers, AlertCircle } from 'lucide-react';
import { MetricCard } from '../../components/ui/MetricCard';
import { loadPortfolioConfig, convertConfigToItems, fetchRiskContribution } from '../../services/api';
import { PortfolioItem, RiskContributionResponse } from '../../types';
import { RiskCharts } from './RiskCharts';
import { RiskTable, SortKey } from './RiskTable';

type PositionMode = 'actual' | 'historical';

export const RiskContributionView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RiskContributionResponse | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('pctOfTotalRisk');
    const [sortAsc, setSortAsc] = useState(false);
    const [positionMode, setPositionMode] = useState<PositionMode>('actual');
    const [expandedChart, setExpandedChart] = useState(false);
    const [barChartMode, setBarChartMode] = useState<'absolute' | 'ratio'>('absolute');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const config = await loadPortfolioConfig();
                if (!config.tickers || config.tickers.length === 0) {
                    setError("No portfolio configured. Go to Upload to configure your portfolio.");
                    setLoading(false);
                    return;
                }
                const allItems = convertConfigToItems(config.tickers, config.periods);
                if (allItems.length === 0) {
                    setError("Portfolio has no holdings with positive weights.");
                    setLoading(false);
                    return;
                }

                let items: PortfolioItem[];
                if (positionMode === 'actual') {
                    const latestDate = allItems.reduce((max, item) =>
                        item.date > max ? item.date : max, allItems[0].date
                    );
                    items = allItems.filter(item => item.date === latestDate && item.weight > 0);
                } else {
                    items = allItems;
                }

                if (items.length === 0) {
                    setError("No holdings found for selected mode.");
                    setLoading(false);
                    return;
                }

                const result = await fetchRiskContribution(items);
                if (result.error) {
                    setError(result.error);
                } else {
                    setData(result);
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [positionMode]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(false);
        }
    };

    const sortedPositions = useMemo(() => {
        if (!data) return [];
        return [...data.positions].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [data, sortKey, sortAsc]);

    const riskBarData = useMemo(() => {
        if (!data) return [];
        return [...data.positions]
            .sort((a, b) => b.pctOfTotalRisk - a.pctOfTotalRisk)
            .map(p => ({
                ticker: p.ticker,
                riskPct: p.pctOfTotalRisk,
                weight: p.weight,
                delta: +(p.pctOfTotalRisk - p.weight).toFixed(1),
            }));
    }, [data]);

    const ratioBarData = useMemo(() => {
        if (!data) return [];
        return [...data.positions]
            .filter(p => p.weight > 0)
            .map(p => ({
                ticker: p.ticker,
                ratio: +(p.pctOfTotalRisk / p.weight).toFixed(2),
            }))
            .sort((a, b) => b.ratio - a.ratio);
    }, [data]);

    const scatterData = useMemo(() => {
        if (!data) return [];
        return data.positions.map(p => ({ ticker: p.ticker, x: p.weight, y: p.pctOfTotalRisk }));
    }, [data]);

    if (error) {
        return (
            <div className="p-8">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-wallstreet-900 font-mono tracking-tighter">
                        RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                    </h2>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
                    <AlertCircle className="text-red-500 mt-0.5" size={20} />
                    <div>
                        <p className="text-red-800 font-medium">Error loading risk data</p>
                        <p className="text-red-600 text-sm mt-1">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-start justify-between mb-2">
                <div>
                    <h2 className="text-3xl font-bold text-wallstreet-900 font-mono tracking-tighter">
                        RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                    </h2>
                    <p className="text-wallstreet-500 mt-2">Marginal contribution to risk (MCTR), diversification analysis, and position-level risk decomposition.</p>
                </div>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
                    {(['actual', 'historical'] as PositionMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setPositionMode(mode)}
                            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${positionMode === mode
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {mode === 'actual' ? 'Actual Positions' : 'Historical'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
                <MetricCard positiveLabel="Good" negativeLabel="High"
                    title="Portfolio Volatility"
                    value={data ? `${data.portfolioVol.toFixed(1)}%` : '—'}
                    subtitle={data ? `Benchmark: ${data.benchmarkVol.toFixed(1)}%` : undefined}
                    isPositive={data ? data.portfolioVol < data.benchmarkVol : undefined}
                    icon={Activity}
                    loading={loading}
                />
                <MetricCard positiveLabel="Good" negativeLabel="High"
                    title="Diversification Ratio"
                    value={data ? `${data.diversificationRatio.toFixed(2)}x` : '—'}
                    subtitle="> 1.0 = diversification benefit"
                    isPositive={data ? data.diversificationRatio > 1.0 : undefined}
                    icon={Layers}
                    loading={loading}
                />
                <MetricCard positiveLabel="Good" negativeLabel="High"
                    title="Effective Bets"
                    value={data ? data.numEffectiveBets.toFixed(1) : '—'}
                    subtitle={data ? `of ${data.positions.length} positions` : undefined}
                    isPositive={data ? data.numEffectiveBets > 3 : undefined}
                    icon={Target}
                    loading={loading}
                />
                <MetricCard positiveLabel="Good" negativeLabel="High"
                    title="Top-3 Concentration"
                    value={data ? `${data.top3Concentration.toFixed(1)}%` : '—'}
                    subtitle="% of total risk from top 3"
                    isPositive={data ? data.top3Concentration < 60 : undefined}
                    icon={ShieldAlert}
                    loading={loading}
                />
            </div>

            <RiskCharts
                loading={loading}
                riskBarData={riskBarData}
                ratioBarData={ratioBarData}
                scatterData={scatterData}
                sectorRisk={data?.sectorRisk ?? []}
                barChartMode={barChartMode}
                setBarChartMode={setBarChartMode}
                expandedChart={expandedChart}
                setExpandedChart={setExpandedChart}
            />

            <RiskTable
                loading={loading}
                sortedPositions={sortedPositions}
                sortKey={sortKey}
                sortAsc={sortAsc}
                handleSort={handleSort}
                missingTickers={data?.missingTickers ?? []}
            />
        </div>
    );
};
