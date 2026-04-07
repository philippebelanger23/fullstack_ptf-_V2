import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { FreshnessBadge } from '../../components/ui/FreshnessBadge';
import type { RiskContributionResponse } from '../../types';
import { buildRiskBarData, buildScatterData } from './riskUtils';
import { RiskKPIs } from './RiskKPIs';
import { RiskBarChart } from './RiskBarChart';
import { ReturnRiskScatter } from './ReturnRiskScatter';
import { RiskTreemap } from './RiskTreemap';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import { RiskTable } from './RiskTable';

export const RiskContributionView: React.FC<{ workspaceRisk?: RiskContributionResponse | null }> = ({ workspaceRisk }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RiskContributionResponse | null>(null);

    useEffect(() => {
        if (!workspaceRisk) {
            setData(null);
            setError('No risk workspace data available. Rebuild the portfolio from Upload.');
            setLoading(false);
            return;
        }
        if (workspaceRisk.error) {
            setData(null);
            setError(workspaceRisk.error);
            setLoading(false);
            return;
        }
        setData(workspaceRisk);
        setError(null);
        setLoading(false);
    }, [workspaceRisk]);

    const riskBarData = useMemo(() => data ? buildRiskBarData(data.positions) : [], [data]);
    const scatterData = useMemo(() => data ? buildScatterData(data.positions) : [], [data]);
    if (loading) {
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
                        Loading Risk Workspace
                    </p>
                </div>
            </div>
        );
    }

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

            <RiskKPIs data={data} loading={loading} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <RiskBarChart
                    riskBarData={riskBarData}
                    sectorRisk={data?.sectorRisk ?? []}
                    positions={data?.positions ?? []}
                    loading={loading}
                />
                <ReturnRiskScatter data={scatterData} loading={loading} />
            </div>

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

            <RiskTable
                positions={data?.positions ?? []}
                loading={loading}
                missingTickers={data?.missingTickers ?? []}
                portfolioBeta={data?.portfolioBeta}
            />
        </div>
    );
};
