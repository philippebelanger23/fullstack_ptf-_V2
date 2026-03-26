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

        // DEBUG: Log raw data for CCO.TO
        if (ticker.toUpperCase() === "CCO.TO") {
            console.log(`[aggregatePeriodData] RAW DATA for ${ticker}:`);
            items.forEach((item, idx) => {
                console.log(`  Item ${idx}: date=${item.date} weight=${item.weight} returnPct=${item.returnPct} contribution=${item.contribution}`);
            });
        }

        // 1. Weight: End-of-Period Weight
        // Find the item with the latest date (max date)
        // Sort items by date ascending to find the last one easily
        const sortedItems = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const lastItem = sortedItems[sortedItems.length - 1];
        const endOfPeriodWeight = lastItem.weight;

        // 2. Contribution: Sum of all particular contributions
        const totalContrib = items.reduce((sum, item) => sum + (item.contribution || 0), 0);

        // 3. Performance (Return): Period return calculated from first and last price
        // Find earliest and latest dates in this period
        const sortedByDate = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const firstDate = sortedByDate[0];
        const lastDate = sortedByDate[sortedByDate.length - 1];

        // If we have multiple items with price-based returns, compound them properly
        // Formula: (1 + r1) × (1 + r2) × ... × (1 + rn) - 1
        // NOTE: returnPct is in decimal form from backend (e.g., 0.3397 for 33.97%), NOT percentage form
        const compoundReturn = items.reduce((product, item) => {
            const r = item.returnPct || 0; // Already in decimal form, do NOT divide by 100
            return product * (1 + r);
        }, 1) - 1;

        const weightedAvgReturn = compoundReturn * 100; // Convert to percentage for display

        // DEBUG: Log to verify the calculation
        console.debug(`[aggregatePeriodData] ${ticker} from ${firstDate?.date} to ${lastDate?.date}: entries=${items.length} returnPcts=${items.map(i => (i.returnPct || 0).toFixed(4)).join(',')} contributions=${items.map(i => (i.contribution || 0).toFixed(6)).join(',')} -> return=${(compoundReturn * 100).toFixed(2)}% totalContrib=${totalContrib.toFixed(2)}% (percentage form)`);

        // Only push if there is a non-zero weight OR a non-zero contribution
        // Use a small epsilon for contribution to avoid floating point noise
        if (endOfPeriodWeight > 0.001 || Math.abs(totalContrib) > 0.0001) {
            const result = {
                ticker,
                weight: endOfPeriodWeight,
                contribution: totalContrib,
                returnPct: weightedAvgReturn
            };

            // DEBUG: Log aggregated output for CCO.TO
            if (ticker.toUpperCase() === "CCO.TO") {
                console.log(`[aggregatePeriodData] AGGREGATED for ${ticker}:`);
                console.log(`  weight=${result.weight}`);
                console.log(`  contribution=${result.contribution}`);
                console.log(`  returnPct=${result.returnPct}`);
                console.log(`  formatBps(contribution) would show: ${Math.round(result.contribution * 100)}`);
            }

            results.push(result);
        }
    });

    return results;
};
