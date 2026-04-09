import type { PortfolioWorkspaceAttribution } from '../types';
import type { Period } from '../views/performance/PerformanceKPIs';
import type { TableItem } from '../views/attribution/attributionUtils';
import { getDateRangeForPeriod } from '../utils/dateUtils';
import { compoundContribution, compoundReturnPct } from '../views/attribution/canonicalAttribution';

export type AttributionOverviewRange = 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

const QUARTER_MONTHS: Record<Exclude<AttributionOverviewRange, 'YTD'>, number[]> = {
    Q1: [0, 1, 2],
    Q2: [3, 4, 5],
    Q3: [6, 7, 8],
    Q4: [9, 10, 11],
};

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;

const monthLabel = (value: Date) => value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export const buildCanonicalPortfolioMonthlyPerformance = (
    attribution: PortfolioWorkspaceAttribution | null | undefined,
    allMonths: Date[],
    selectedYear: number,
    selectedRange: AttributionOverviewRange,
): Record<string, number | null> => {
    const valuesByMonth: Record<string, number | null> = {};
    allMonths.forEach(date => {
        valuesByMonth[monthKey(date)] = null;
    });

    if (!attribution?.monthlyPeriods?.length) return valuesByMonth;

    for (const period of attribution.monthlyPeriods) {
        const endDate = new Date(`${period.end}T00:00:00`);
        const endMonth = endDate.getMonth();
        const isSelectedQuarter = selectedRange === 'YTD' || QUARTER_MONTHS[selectedRange].includes(endMonth);
        if (endDate.getFullYear() !== selectedYear || !isSelectedQuarter) continue;

        const returnKey = `${period.start}|${period.end}`;
        const returnValue = attribution.portfolioMonthlyReturns[returnKey];
        valuesByMonth[`${selectedYear}-${endMonth}`] = typeof returnValue === 'number' ? returnValue * 100 : null;
    }

    return valuesByMonth;
};

export const compoundCanonicalMonthlyPerformance = (
    monthlyPerformance: Record<string, number | null>,
): number | null => {
    const selectedReturns = Object.values(monthlyPerformance).filter(
        (value): value is number => value !== null && value !== undefined,
    );
    if (selectedReturns.length === 0) return null;
    return (selectedReturns.reduce((product, value) => product * (1 + (value / 100)), 1) - 1) * 100;
};

const isCashTicker = (ticker: string) => {
    const tickerUpper = ticker.toUpperCase();
    return tickerUpper === 'CASH' || tickerUpper === '*CASH*';
};

const toTableItem = (row: { ticker: string; weight: number; returnPct: number; contribution: number }): TableItem => ({
    ticker: row.ticker,
    weight: row.weight,
    returnPct: row.returnPct * 100,
    contribution: row.contribution,
});

const chunk = <T>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};

export interface CanonicalContributorCardLayout {
    key: string;
    title: string;
    items: TableItem[];
    isQuarter: boolean;
    isEmpty?: boolean;
    status: 'COMPLETED' | 'IN_PROGRESS';
}

export interface CanonicalContributorPageLayout {
    key: string;
    rows: CanonicalContributorCardLayout[][];
}

export const buildCanonicalContributorPages = (
    attribution: PortfolioWorkspaceAttribution | null | undefined,
    selectedYear: number,
): CanonicalContributorPageLayout[] => {
    if (!attribution?.topContributors?.length) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3) + 1;

    const quarterRows = attribution.topContributors
        .map((layout, layoutIndex) => {
            // Place each monthly card in its correct slot within the quarter (0, 1, or 2)
            const monthlySlots: (CanonicalContributorCardLayout | null)[] = [null, null, null];

            layout.monthlyTables.forEach((table, tableIndex) => {
                const tableDate = new Date(`${table.label} 1`);
                if (Number.isNaN(tableDate.getTime()) || tableDate.getFullYear() !== selectedYear) return;
                const isCurrentMonth = tableDate.getFullYear() === currentYear && tableDate.getMonth() === currentMonth;
                const slotIndex = tableDate.getMonth() % 3; // 0, 1, or 2 within the quarter
                monthlySlots[slotIndex] = {
                    key: `month-${layoutIndex}-${tableIndex}`,
                    title: isCurrentMonth ? `${table.label} (MTD)` : table.label,
                    items: table.rows.filter((row) => !isCashTicker(row.ticker)).map(toTableItem),
                    isQuarter: false,
                    status: isCurrentMonth ? 'IN_PROGRESS' : 'COMPLETED',
                };
            });

            const hasAnyMonth = monthlySlots.some(Boolean);
            if (!hasAnyMonth) return null;

            const firstMonthDate = new Date(`${layout.monthlyTables[0].label} 1`);
            const quarterNumber = Math.floor(firstMonthDate.getMonth() / 3) + 1;
            const quarterCard = layout.quarterTable
                ? {
                    key: `quarter-${layoutIndex}`,
                    title: selectedYear === currentYear && quarterNumber === currentQuarter ? `Q${quarterNumber} ${selectedYear} (QTD)` : `Q${quarterNumber} ${selectedYear}`,
                    items: layout.quarterTable.rows.filter((row) => !isCashTicker(row.ticker)).map(toTableItem),
                    isQuarter: true,
                    status: selectedYear === currentYear && quarterNumber === currentQuarter ? 'IN_PROGRESS' : 'COMPLETED',
                } satisfies CanonicalContributorCardLayout
                : null;

            if (!quarterCard) {
                // No quarterly table yet — just return the months that exist without padding
                return monthlySlots.filter((card): card is CanonicalContributorCardLayout => Boolean(card));
            }

            // Pad missing month slots with invisible placeholders so the quarterly card always sits in column 4
            const cards: CanonicalContributorCardLayout[] = monthlySlots.map((slot, i) =>
                slot ?? {
                    key: `placeholder-${layoutIndex}-${i}`,
                    title: '',
                    items: [],
                    isQuarter: false,
                    isEmpty: true,
                    status: 'COMPLETED' as const,
                },
            );
            cards.push(quarterCard);
            return cards;
        })
        .filter((row): row is CanonicalContributorCardLayout[] => Boolean(row));

    return chunk(quarterRows, 2).map((rows, pageIndex) => ({
        key: `contributors-page-${pageIndex}`,
        rows,
    }));
};

export const buildOnePagerAttributionItems = (
    attribution: PortfolioWorkspaceAttribution | null | undefined,
    selectedPeriod: Period,
): TableItem[] => {
    if (!attribution?.periodSheet?.length || !attribution?.periods?.length) return [];

    const { start, end } = getDateRangeForPeriod(selectedPeriod);
    const periodEnd = end ?? new Date();
    const selectedIndexes = attribution.periods
        .map((period, index) => ({ period, index }))
        .filter(({ period }) => {
            const itemDate = new Date(`${period.end}T00:00:00`);
            return itemDate >= start && itemDate <= periodEnd;
        })
        .map(({ index }) => index);

    if (selectedIndexes.length === 0) return [];

    return attribution.periodSheet
        .map(row => {
            const tickerUpper = row.ticker.toUpperCase();
            if (tickerUpper === 'CASH' || tickerUpper === '*CASH*') return null;

            const periods = selectedIndexes
                .map(index => row.periods[index])
                .filter((period): period is typeof row.periods[number] => Boolean(period));
            if (periods.length === 0) return null;

            const contribution = compoundContribution(periods.map(period => ({
                returnPct: period.returnPct,
                contribution: period.contribution,
            })));
            const returnPct = compoundReturnPct(periods.map(period => ({ returnPct: period.returnPct })));
            const weight = periods[periods.length - 1].weight;

            if (weight <= 0.001 && Math.abs(contribution) <= 0.0001) return null;
            return {
                ticker: row.ticker,
                weight,
                returnPct,
                contribution,
            };
        })
        .filter((item): item is TableItem => item !== null)
        .sort((left, right) => right.contribution - left.contribution);
};

export const describeMonthlyPerformanceMap = (monthlyPerformance: Record<string, number | null>) => (
    Object.entries(monthlyPerformance)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => {
            const [year, month] = key.split('-').map(Number);
            return `${monthLabel(new Date(year, month, 1))}=${value?.toFixed(4)}`;
        })
        .join(', ')
);
