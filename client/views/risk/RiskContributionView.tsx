import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import { loadPortfolioConfig, convertConfigToItems, fetchRiskContribution } from '../../services/api';
import { PortfolioItem, RiskContributionResponse } from '../../types';
import { buildRiskBarData, buildScatterData } from './riskUtils';
import { RiskKPIs } from './RiskKPIs';
import { RiskBarChart } from './RiskBarChart';
import { ReturnRiskScatter } from './ReturnRiskScatter';
import { RiskTreemap } from './RiskTreemap';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import { RiskTable } from './RiskTable';

type PositionMode = 'actual' | 'historical';

export const RiskContributionView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RiskContributionResponse | null>(null);
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

    const riskBarData = useMemo(() => data ? buildRiskBarData(data.positions) : [], [data]);
    const scatterData = useMemo(() => data ? buildScatterData(data.positions) : [], [data]);

    /* ── Loading state ── */
    if (loading) {
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    <div className="flex items-end gap-1.5 h-12">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                className="w-2 bg-wallstreet-accent rounded-t"
                                style={{ animation: `barPulse 1s ease-in-out ${i * 0.15}s infinite`, height: '30%' }}
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

    /* ── Error state ── */
    if (error) {
        return (
            <div className="p-8">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-wallstreet-text font-mono tracking-tighter">
                        RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                    </h2>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-6 flex items-start gap-3">
                    <AlertCircle className="text-red-500 mt-0.5" size={20} />
                    <div>
                        <p className="text-red-800 dark:text-red-300 font-medium">Error loading risk data</p>
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    const hasCorrelation = data?.correlationMatrix && data.correlationMatrix.tickers.length > 0;

    return (
        <div className="p-6 md:p-8 space-y-6">
            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-1">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-bold text-wallstreet-text font-mono tracking-tighter">
                            RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
                        </h2>
                        <FreshnessBadge fetchedAt={data?.fetchedAt ?? null} />
                    </div>
                    <p className="text-wallstreet-500 mt-2 text-sm">
                        Marginal contribution to risk, diversification analysis, and position-level risk decomposition. Based on 1 year of daily returns.
                    </p>
                </div>
            </div>

            {/* ── Tier 1: KPIs ── */}
            <RiskKPIs data={data} loading={loading} />

            {/* ── Tier 2A: Superchart (positions/sectors) + Scatter ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <RiskBarChart
                    riskBarData={riskBarData}
                    sectorRisk={data?.sectorRisk ?? []}
                    positions={data?.positions ?? []}
                    loading={loading}
                />
                <ReturnRiskScatter data={scatterData} loading={loading} />
            </div>

            {/* ── Tier 2B: Treemap + Correlation side by side ── */}
            <div className={`grid gap-6 items-stretch ${hasCorrelation ? 'grid-cols-1 lg:grid-cols-10' : 'grid-cols-1'}`}>
                <div className={hasCorrelation ? 'lg:col-span-7' : ''}>
                    <RiskTreemap positions={data?.positions ?? []} loading={loading} sectorCount={data?.sectorRisk?.length ?? 11} />
                </div>
                {hasCorrelation && (
                    <div className="lg:col-span-3">
                        <CorrelationHeatmap correlationMatrix={data!.correlationMatrix!} loading={loading} />
                    </div>
                )}
            </div>

            {/* ── Tier 3: Position Detail Table ── */}
            <RiskTable
                positions={data?.positions ?? []}
                loading={loading}
                missingTickers={data?.missingTickers ?? []}
            />
        </div>
    );
};
