import { PortfolioAnalysisResponse, PortfolioItem } from '../../types';

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

const getBoundaryDate = (item: PortfolioItem) => item.periodEnd ?? item.date;

const groupItemsByTicker = (items: PortfolioItem[]) => {
    const grouped = new Map<string, PortfolioItem[]>();
    items.forEach(item => {
        const ticker = item.ticker;
        if (!grouped.has(ticker)) grouped.set(ticker, []);
        grouped.get(ticker)!.push(item);
    });

    grouped.forEach(history => history.sort((a, b) => toTime(getBoundaryDate(a)) - toTime(getBoundaryDate(b))));
    return grouped;
};

const resolveLatestSnapshotOnOrBefore = (history: PortfolioItem[], boundaryDate: string) => {
    if (!history.length) return undefined;

    const boundaryTime = toTime(boundaryDate);
    let snapshot: PortfolioItem | undefined;

    for (const item of history) {
        if (toTime(getBoundaryDate(item)) <= boundaryTime) {
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
): CanonicalMonthlyHistory => {
    const byTicker = new Map<string, CanonicalMonthPoint[]>();
    const rows: CanonicalMonthPoint[] = [];

    if (!analysisResponse?.monthlySheet?.length || !analysisResponse.monthlyPeriods?.length) {
        return { allMonths: [], byTicker, rows };
    }

    const itemsByTicker = groupItemsByTicker(analysisResponse.periodItems ?? analysisResponse.items ?? []);
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
};
