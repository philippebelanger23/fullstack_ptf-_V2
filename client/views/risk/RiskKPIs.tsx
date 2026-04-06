import React from 'react';
import { Activity, TrendingDown, Layers, Target, ShieldAlert, AlertTriangle } from 'lucide-react';
import { MetricCard } from '../../components/ui/MetricCard';
import { RiskContributionResponse } from '../../types';

interface RiskKPIsProps {
    data: RiskContributionResponse | null;
    loading: boolean;
}

export const RiskKPIs: React.FC<RiskKPIsProps> = ({ data, loading }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
            positiveLabel="Good" negativeLabel="High"
            title="Portfolio Volatility"
            value={data ? `${data.portfolioVol.toFixed(1)}%` : '—'}
            subtitle={data ? `Benchmark: ${data.benchmarkVol.toFixed(1)}%` : undefined}
            isPositive={data ? data.portfolioVol < data.benchmarkVol : undefined}
            icon={Activity}
            loading={loading}
            tooltip="Annualized standard deviation of daily portfolio returns. Lower than benchmark means less price swings relative to the market."
        />
        <MetricCard
            positiveLabel="Defensive" negativeLabel="Aggressive"
            title="Portfolio Beta"
            value={data ? data.portfolioBeta.toFixed(2) : '—'}
            subtitle="vs benchmark blend"
            isPositive={data ? data.portfolioBeta <= 1.0 : undefined}
            icon={TrendingDown}
            loading={loading}
            tooltip="Sensitivity to benchmark movements. Beta < 1 means the portfolio amplifies gains and losses less than the index. Beta > 1 means more amplification."
        />
        <MetricCard
            positiveLabel="Good" negativeLabel="Low"
            title="Diversification Ratio"
            value={data ? `${data.diversificationRatio.toFixed(2)}x` : '—'}
            subtitle="> 1.0 = diversification benefit"
            isPositive={data ? data.diversificationRatio > 1.0 : undefined}
            icon={Layers}
            loading={loading}
            tooltip="Weighted average of individual volatilities divided by portfolio volatility. Values above 1.0 mean holdings are not perfectly correlated — diversification is actively reducing risk."
        />
        <MetricCard
            positiveLabel="Good" negativeLabel="Low"
            title="Effective Bets"
            value={data ? data.numEffectiveBets.toFixed(1) : '—'}
            subtitle={data ? `of ${data.positions.length} positions` : undefined}
            isPositive={data ? data.numEffectiveBets > 3 : undefined}
            icon={Target}
            loading={loading}
            tooltip="Entropy-based count of independent risk positions. A portfolio with 30 holdings but 5 effective bets is highly concentrated — most risk comes from just a few positions."
        />
        <MetricCard
            title="VaR 95%"
            value={data ? `${data.var95.toFixed(2)}%` : '—'}
            subtitle="1-day historical"
            icon={ShieldAlert}
            loading={loading}
            tooltip="Value at Risk — the maximum expected 1-day portfolio loss with 95% confidence, based on historical return distribution. There is a 5% chance of losing more than this on any given day."
        />
        <MetricCard
            title="CVaR 95%"
            value={data ? `${data.cvar95.toFixed(2)}%` : '—'}
            subtitle="Expected shortfall"
            icon={AlertTriangle}
            loading={loading}
            tooltip="Conditional VaR (Expected Shortfall) — the average loss during the worst 5% of trading days. More conservative than VaR as it captures the severity of tail losses, not just their threshold."
        />
    </div>
);
