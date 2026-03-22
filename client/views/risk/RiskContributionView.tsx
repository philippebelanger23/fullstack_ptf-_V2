import React, { useEffect, useState, useMemo } from 'react';
import { ShieldAlert, Activity, Target, Layers, AlertCircle } from 'lucide-react';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
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

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const config = await loadPortfolioConfig();
                if (cancelled) return;
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
                if (cancelled) return;
                if (result.error) {
                    setError(result.error);
                } else {
                    setData(result);
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
                beta: p.beta,
                mctr: p.mctr,
                individualVol: p.individualVol,
                annualizedReturn: p.annualizedReturn,
                riskAdjustedReturn: p.riskAdjustedReturn,
            }));
    }, [data]);

    const scatterData = useMemo(() => {
        if (!data) return [];
        return data.positions.map(p => ({ ticker: p.ticker, x: p.weight, y: p.pctOfTotalRisk }));
    }, [data]);

    if (loading) {
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    <div className="flex items-end gap-1.5 h-12">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                className="w-2 bg-wallstreet-accent rounded-t"
                                style={{
                                    animation: `barPulse 1s ease-in-out ${i * 0.15}s infinite`,
                                    height: '30%',
                                }}
                            />
                        ))}
                    </div>
                    <p className="text-sm font-mono text-wallstreet-500 tracking-wide uppercase">Loading Risk Data</p>
                </div>
                <style>{`
                    @keyframes barPulse {
                        0%, 100% { height: 30%; opacity: 0.4; }
                        50% { height: 100%; opacity: 1; }
                    }
                `}</style>
            </div>
        );
    }

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
                    <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-bold text-wallstreet-900 font-mono tracking-tighter">
                            RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                        </h2>
                        <FreshnessBadge fetchedAt={data?.fetchedAt ?? null} />
                    </div>
                    <p className="text-wallstreet-500 mt-2">Marginal contribution to risk (MCTR), diversification analysis, and position-level risk decomposition.</p>
                </div>
                <div className="flex items-center bg-wallstreet-900 rounded-lg p-0.5 shrink-0">
                    {(['actual', 'historical'] as PositionMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setPositionMode(mode)}
                            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${positionMode === mode
                                ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                : 'text-wallstreet-500 hover:text-wallstreet-text'
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
                scatterData={scatterData}
                sectorRisk={data?.sectorRisk ?? []}
                correlationMatrix={data?.correlationMatrix}
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
