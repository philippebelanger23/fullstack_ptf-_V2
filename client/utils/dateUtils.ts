import type { PerformancePeriod } from '../types';

/**
 * Returns the start (and optional end) Date for a given performance period.
 *
 * YTD starts from Dec 31 of the prior year — this aligns with the attribution
 * period-start convention (rebalance periods begin at the Dec 31 close) and
 * matches standard financial reporting (YTD = since Dec 31 prior-year close).
 */
export const getDateRangeForPeriod = (period: PerformancePeriod): { start: Date; end?: Date } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const year = now.getFullYear();

    const quarterRange = (quarter: 1 | 2 | 3 | 4): { start: Date; end: Date } => {
        switch (quarter) {
            case 1:
                return { start: new Date(year, 0, 1), end: new Date(year, 2, 31) };
            case 2:
                return { start: new Date(year, 3, 1), end: new Date(year, 5, 30) };
            case 3:
                return { start: new Date(year, 6, 1), end: new Date(year, 8, 30) };
            case 4:
                return { start: new Date(year, 9, 1), end: new Date(year, 11, 31) };
        }
    };

    switch (period) {
        case 'FULL_YEAR':
            return { start: new Date(year - 2, 11, 31), end: new Date(year - 1, 11, 31) };
        case 'YTD':
            return { start: new Date(year - 1, 11, 31) };
        case 'Q1':
            return quarterRange(1);
        case 'Q2':
            return quarterRange(2);
        case 'Q3':
            return quarterRange(3);
        case 'Q4':
            return quarterRange(4);
        case '3M':
            return { start: new Date(new Date().setMonth(now.getMonth() - 3)) };
        case '6M':
            return { start: new Date(new Date().setMonth(now.getMonth() - 6)) };
        case '1Y':
            return { start: new Date(new Date().setFullYear(now.getFullYear() - 1)) };
        default:
            return { start: new Date(new Date().setFullYear(now.getFullYear() - 1)) };
    }
};
