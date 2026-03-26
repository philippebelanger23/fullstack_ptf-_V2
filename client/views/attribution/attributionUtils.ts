import { PortfolioItem } from '../../types';

export interface TableItem {
    ticker: string;
    weight: number;
    returnPct?: number;
    contribution: number;
}

/**
 * Forward-compounded contribution across sub-periods (ATTRIBUTION_LOGIC.md §4).
 *
 * Formula:  C = Σ_t [ w_t × r_t × Π_{s>t}(1 + r_s) ]
 *
 * Each sub-period's contribution is compounded forward by the holding's
 * subsequent returns so that all contributions share the same end-of-period base.
 *
 * @param items  Chronologically-sorted sub-period data with weight (%-form, e.g. 1.5)
 *               and returnPct (decimal form, e.g. 0.34 for 34%).
 */
export const forwardCompoundedContribution = (
    items: { weight: number; returnPct?: number | null | undefined }[]
): number => {
    if (items.length === 0) return 0;
    if (items.length === 1) return (items[0].weight) * (items[0].returnPct || 0);

    let contribution = 0;
    for (let t = 0; t < items.length; t++) {
        const w_t = items[t].weight;
        const r_t = items[t].returnPct || 0;
        let forwardFactor = 1.0;
        for (let s = t + 1; s < items.length; s++) {
            const r_s = items[s].returnPct || 0;
            forwardFactor *= (1 + r_s);
        }
        contribution += w_t * r_t * forwardFactor;
    }
    return contribution;
};

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

        // Sort items chronologically
        const sortedItems = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // 1. Weight: End-of-Period Weight
        const lastItem = sortedItems[sortedItems.length - 1];
        const endOfPeriodWeight = lastItem.weight;

        // 2. Contribution: Forward-compounded across sub-periods (ATTRIBUTION_LOGIC.md §4)
        const totalContrib = forwardCompoundedContribution(sortedItems);

        // 3. Performance (Return): Geometric chain of sub-period returns
        //    This perfectly respects FX adjustments and multi-period chaining 
        //    from the server (ATTRIBUTION_LOGIC.md)
        const compoundReturn = sortedItems.reduce((product, item) => {
            const r = item.returnPct || 0;
            return product * (1 + r);
        }, 1) - 1;
        const periodReturn = compoundReturn * 100;

        // Only push if there is a non-zero weight OR a non-zero contribution
        if (endOfPeriodWeight > 0.001 || Math.abs(totalContrib) > 0.0001) {
            results.push({
                ticker,
                weight: endOfPeriodWeight,
                contribution: totalContrib,
                returnPct: periodReturn
            });
        }
    });

    return results;
};
