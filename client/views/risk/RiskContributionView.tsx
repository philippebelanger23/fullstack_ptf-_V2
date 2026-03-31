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
    const [loadProgress, setLoadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({
        holdings: 'pending', risk: 'pending',
    });

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setLoadProgress({ holdings: 'pending', risk: 'pending' });
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
                const config = await trackFetch('holdings', loadPortfolioConfig);
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

                const result = await trackFetch('risk', () => fetchRiskContribution(items));
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
        const steps = [
            { key: 'holdings', label: 'Portfolio Holdings', sub: 'Loading positions & weights' },
            { key: 'risk',     label: 'Risk Analysis',      sub: 'Volatility, beta & correlations' },
        ];
        const doneCount = Object.values(loadProgress).filter(s => s === 'done').length;
        return (
            <div className="max-w-[100vw] mx-auto p-4 md:p-6 overflow-x-hidden min-h-screen flex flex-col items-center justify-center select-none">
                <style>{`
                    @keyframes riskBarPulse {
                        0%, 100% { transform: scaleY(0.12); opacity: 0.1; }
                        50%      { transform: scaleY(1);    opacity: 1;   }
                    }
                    @keyframes riskScanLine {
                        0%   { left: -2px; }
                        100% { left: calc(100% + 2px); }
                    }
                `}</style>
                <div className="flex flex-col items-center gap-8 w-full max-w-sm">
                    {/* Animated bar chart */}
                    <div className="relative overflow-hidden rounded" style={{ width: '176px', height: '60px' }}>
                        <div className="flex items-end h-full gap-1.5">
                            {[28, 50, 36, 66, 42, 78, 54, 92, 46, 72, 58, 88, 64].map((h, i) => (
                                <div
                                    key={i}
                                    className="flex-1 rounded-t-sm origin-bottom"
                                    style={{
                                        height: `${h}%`,
                                        background: i === 12 ? '#3b82f6' : '#374151',
                                        animation: `riskBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                                    }}
                                />
                            ))}
                        </div>
                        <div
                            className="absolute top-0 bottom-0 w-px"
                            style={{
                                background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.65), transparent)',
                                animation: 'riskScanLine 2.2s linear infinite',
                            }}
                        />
                    </div>

                    <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.25em] uppercase">
                        Loading Risk Data
                    </p>

                    {/* Progress bar */}
                    <div className="w-full bg-wallstreet-700 rounded-full h-1.5 overflow-hidden">
                        <div
                            className="bg-wallstreet-accent h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(doneCount / steps.length) * 100}%` }}
                        />
                    </div>

                    {/* Step checklist */}
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
                                        <p className={`text-sm font-mono font-medium ${status === 'done' ? 'text-wallstreet-text' : status === 'error' ? 'text-red-500' : 'text-wallstreet-500'}`}>
                                            {label}
                                        </p>
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
            <div className={`grid gap-6 items-stretch ${hasCorrelation ? 'grid-cols-1 lg:grid-cols-[65%_1fr]' : 'grid-cols-1'}`}>
                <div>
                    <RiskTreemap positions={data?.positions ?? []} loading={loading} sectorCount={data?.sectorRisk?.length ?? 11} />
                </div>
                {hasCorrelation && (
                    <div>
                        <CorrelationHeatmap correlationMatrix={data!.correlationMatrix!} loading={loading} />
                    </div>
                )}
            </div>

            {/* ── Tier 3: Position Detail Table ── */}
            <RiskTable
                positions={data?.positions ?? []}
                loading={loading}
                missingTickers={data?.missingTickers ?? []}
                portfolioBeta={data?.portfolioBeta}
            />
        </div>
    );
};
