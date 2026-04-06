import React from 'react';
import { TrendingUp, Award, Activity, ShieldAlert, BarChart3, Target } from 'lucide-react';
import { MetricCard } from '../../components/ui/MetricCard';
import { formatPercent } from '../../utils/formatters';

export type Period = 'YTD' | 'Q1' | '3M' | '6M' | '1Y' | '2025';

export interface PeriodMetrics {
    totalReturn: number;
    benchmarkReturn: number;
    alpha: number;
    sharpeRatio: number;
    sortinoRatio: number;
    informationRatio: number;
    trackingError: number;
    volatility: number;
    benchmarkVolatility: number;
    benchmarkSharpe: number;
    benchmarkSortino: number;
    beta: number;
    maxDrawdown: number;
    benchmarkMaxDrawdown: number;
}

interface PerformanceKPIsProps {
    periodMetrics: PeriodMetrics | null;
    previousPeriodMetrics?: PeriodMetrics | null;
    selectedPeriod: Period;
    loading: boolean;
}

const delta = (current: PeriodMetrics | null, previous: PeriodMetrics | null | undefined, key: keyof PeriodMetrics): number | undefined => {
    if (!current || !previous) return undefined;
    return current[key] - previous[key];
};

export const PerformanceKPIs: React.FC<PerformanceKPIsProps> = ({ periodMetrics, previousPeriodMetrics, selectedPeriod, loading }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
            title={`Return (${selectedPeriod})`}
            value={periodMetrics ? formatPercent(periodMetrics.totalReturn) : '--'}
            subtitle={periodMetrics ? `Benchmark: ${formatPercent(periodMetrics.benchmarkReturn)}` : undefined}
            isPositive={periodMetrics ? periodMetrics.totalReturn > periodMetrics.benchmarkReturn : undefined}
            icon={TrendingUp}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'totalReturn')}
        />
        <MetricCard
            title="Alpha"
            value={periodMetrics ? formatPercent(periodMetrics.alpha) : '--'}
            subtitle={`Excess return (${selectedPeriod})`}
            isPositive={periodMetrics ? periodMetrics.alpha > 0 : undefined}
            icon={Target}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'alpha')}
        />
        <MetricCard
            title="Sharpe"
            value={periodMetrics ? (periodMetrics.sharpeRatio < 0 ? `(${Math.abs(periodMetrics.sharpeRatio).toFixed(2)})` : periodMetrics.sharpeRatio.toFixed(2)) : '--'}
            subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkSharpe < 0 ? `(${Math.abs(periodMetrics.benchmarkSharpe).toFixed(2)})` : periodMetrics.benchmarkSharpe.toFixed(2)}` : undefined}
            isPositive={periodMetrics ? periodMetrics.sharpeRatio > periodMetrics.benchmarkSharpe : undefined}
            icon={Award}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'sharpeRatio')}
        />
        <MetricCard
            title="Sortino"
            value={periodMetrics ? (periodMetrics.sortinoRatio < 0 ? `(${Math.abs(periodMetrics.sortinoRatio).toFixed(2)})` : periodMetrics.sortinoRatio.toFixed(2)) : '--'}
            subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkSortino < 0 ? `(${Math.abs(periodMetrics.benchmarkSortino).toFixed(2)})` : periodMetrics.benchmarkSortino.toFixed(2)}` : undefined}
            isPositive={periodMetrics ? periodMetrics.sortinoRatio > periodMetrics.benchmarkSortino : undefined}
            icon={Award}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'sortinoRatio')}
        />
        <MetricCard
            title="Info Ratio"
            value={periodMetrics ? (periodMetrics.informationRatio < 0 ? `(${Math.abs(periodMetrics.informationRatio).toFixed(2)})` : periodMetrics.informationRatio.toFixed(2)) : '--'}
            subtitle={periodMetrics ? `T.E.: ${periodMetrics.trackingError.toFixed(1)}%` : undefined}
            isPositive={periodMetrics ? periodMetrics.informationRatio > 0 : undefined}
            icon={Target}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'informationRatio')}
        />
        <MetricCard
            title="Beta"
            value={periodMetrics ? periodMetrics.beta.toFixed(2) : '--'}
            subtitle={periodMetrics?.beta && periodMetrics.beta < 1 ? 'Defensive' : 'Aggressive'}
            icon={Activity}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'beta')}
        />
        <MetricCard
            title="Volatility"
            value={periodMetrics ? `${periodMetrics.volatility.toFixed(1)}%` : '--'}
            subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkVolatility.toFixed(1)}%` : undefined}
            isPositive={periodMetrics ? periodMetrics.volatility < periodMetrics.benchmarkVolatility : undefined}
            icon={BarChart3}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'volatility')}
        />
        <MetricCard
            title="Max Drawdown"
            value={periodMetrics ? (periodMetrics.maxDrawdown < 0 ? `(${Math.abs(periodMetrics.maxDrawdown).toFixed(1)}%)` : `${periodMetrics.maxDrawdown.toFixed(1)}%`) : '--'}
            subtitle={periodMetrics ? `Benchmark: ${periodMetrics.benchmarkMaxDrawdown < 0 ? `(${Math.abs(periodMetrics.benchmarkMaxDrawdown).toFixed(1)}%)` : `${periodMetrics.benchmarkMaxDrawdown.toFixed(1)}%`}` : undefined}
            isPositive={periodMetrics ? periodMetrics.maxDrawdown > periodMetrics.benchmarkMaxDrawdown : undefined}
            icon={ShieldAlert}
            loading={loading}
            delta={delta(periodMetrics, previousPeriodMetrics, 'maxDrawdown')}
        />
    </div>
);
