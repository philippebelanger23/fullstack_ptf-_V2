import { PortfolioItem } from '../../types';

export interface TableItem {
    ticker: string;
    weight: number;
    returnPct?: number;
    contribution: number;
}

export const aggregatePeriodData = (data: PortfolioItem[]): TableItem[] => {
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
