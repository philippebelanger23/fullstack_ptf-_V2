import { PortfolioAnalysisResponse, PortfolioItem } from '../../types';
import { TableItem } from './attributionUtils';

export interface CanonicalMonthPoint {
    ticker: string;
    date: string;
    weight: number;
    returnPct: number;
    contribution: number;
    isMutualFund?: boolean;
    partial?: boolean;
}

export interface CanonicalMonthlyHistory {
    allMonths: Date[];
    byTicker: Map<string, CanonicalMonthPoint[]>;
    rows: CanonicalMonthPoint[];
}

const toTime = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
    return d.getTime();
};

const groupItemsByTicker = (items: PortfolioItem[]) => {
    const grouped = new Map<string, PortfolioItem[]>();
    items.forEach(item => {
        const ticker = item.ticker;
        if (!grouped.has(ticker)) grouped.set(ticker, []);
        grouped.get(ticker)!.push(item);
    });

    grouped.forEach(history => history.sort((a, b) => toTime(a.date) - toTime(b.date)));
    return grouped;
};

const resolveLatestSnapshotOnOrBefore = (history: PortfolioItem[], boundaryDate: string) => {
    if (!history.length) return undefined;

    const boundaryTime = toTime(boundaryDate);
    let snapshot: PortfolioItem | undefined;

    for (const item of history) {
        if (toTime(item.date) <= boundaryTime) {
            snapshot = item;
            continue;
        }
        break;
    }

    return snapshot;
};

export const compoundReturnPct = (items: { returnPct?: number | null }[]) => {
    if (items.length === 0) return 0;
    return (items.reduce((product, item) => product * (1 + (item.returnPct || 0)), 1) - 1) * 100;
};

export const compoundContribution = (items: { returnPct?: number | null; contribution?: number | null }[]) => {
    if (items.length === 0) return 0;

    let contribution = 0;
    for (let t = 0; t < items.length; t++) {
        const base = items[t].contribution || 0;
        let forwardFactor = 1;
        for (let s = t + 1; s < items.length; s++) {
            forwardFactor *= 1 + (items[s].returnPct || 0);
        }
        contribution += base * forwardFactor;
    }
    return contribution;
};

export const buildCanonicalMonthlyHistory = (
    analysisResponse: PortfolioAnalysisResponse | null | undefined,
    data: PortfolioItem[]
): CanonicalMonthlyHistory => {
    if (analysisResponse?.monthlySheet?.length && analysisResponse.monthlyPeriods?.length) {
        const sourceItems = analysisResponse.items?.length ? analysisResponse.items : data;
        const itemsByTicker = groupItemsByTicker(sourceItems);

        const byTicker = new Map<string, CanonicalMonthPoint[]>();
        const rows: CanonicalMonthPoint[] = [];
        const allMonths = analysisResponse.monthlyPeriods.map(period => new Date(`${period.end}T00:00:00`));

        analysisResponse.monthlySheet.forEach(sheetRow => {
            const tickerHistory = itemsByTicker.get(sheetRow.ticker) ?? [];
            const history: CanonicalMonthPoint[] = [];
            sheetRow.months.forEach((monthDetail, idx) => {
                const period = analysisResponse.monthlyPeriods[idx];
                if (!period || !monthDetail) return;

                const weightSnapshot = resolveLatestSnapshotOnOrBefore(tickerHistory, period.end);
                const point: CanonicalMonthPoint = {
                    ticker: sheetRow.ticker,
                    date: period.end,
                    weight: weightSnapshot?.weight ?? 0,
                    returnPct: monthDetail.returnPct,
                    contribution: monthDetail.contribution,
                    isMutualFund: weightSnapshot?.isMutualFund,
                    partial: !!weightSnapshot && !!weightSnapshot.isMutualFund && (weightSnapshot.startPrice == null || weightSnapshot.endPrice == null),
                };
                history.push(point);
                rows.push(point);
            });

            byTicker.set(sheetRow.ticker, history);
        });

        byTicker.forEach(history => history.sort((a, b) => a.date.localeCompare(b.date)));
        rows.sort((a, b) => a.date.localeCompare(b.date));

        return { allMonths, byTicker, rows };
    }

    const byTicker = new Map<string, CanonicalMonthPoint[]>();
    const rows: CanonicalMonthPoint[] = [];
    data.forEach(item => {
        const point: CanonicalMonthPoint = {
            ticker: item.ticker,
            date: item.date,
            weight: item.weight,
            returnPct: item.returnPct || 0,
            contribution: item.contribution || 0,
            isMutualFund: item.isMutualFund,
            partial: !!item.isMutualFund && (item.startPrice == null || item.endPrice == null),
        };
        if (!byTicker.has(point.ticker)) byTicker.set(point.ticker, []);
        byTicker.get(point.ticker)!.push(point);
        rows.push(point);
    });
    byTicker.forEach(history => history.sort((a, b) => a.date.localeCompare(b.date)));
    rows.sort((a, b) => a.date.localeCompare(b.date));

    const uniqueMonths = Array.from(new Set(rows.map(row => row.date.slice(0, 7))))
        .map(key => {
            const [year, month] = key.split('-').map(Number);
            return new Date(year, month - 1, 1);
        })
        .sort((a, b) => a.getTime() - b.getTime());

    return { allMonths: uniqueMonths, byTicker, rows };
};

export const buildTableItemsFromHistory = (history: CanonicalMonthPoint[]): TableItem[] => {
    if (history.length === 0) return [];

    const byTicker = new Map<string, CanonicalMonthPoint[]>();
    history.forEach(point => {
        if (!byTicker.has(point.ticker)) byTicker.set(point.ticker, []);
        byTicker.get(point.ticker)!.push(point);
    });

    const results: TableItem[] = [];

    byTicker.forEach((items, ticker) => {
        const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));
        const lastItem = sortedItems[sortedItems.length - 1];
        const endOfPeriodWeight = lastItem.weight;
        const totalContrib = compoundContribution(sortedItems);
        const periodReturn = compoundReturnPct(sortedItems);

        if (endOfPeriodWeight > 0.001 || Math.abs(totalContrib) > 0.0001) {
            results.push({
                ticker,
                weight: endOfPeriodWeight,
                contribution: totalContrib,
                returnPct: periodReturn,
            });
        }
    });

    return results;
};
