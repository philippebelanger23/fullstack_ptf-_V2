import { Period } from '../views/performance/PerformanceKPIs';

/**
 * Returns the start (and optional end) Date for a given performance period.
 *
 * YTD starts from Dec 31 of the prior year — this aligns with the attribution
 * period-start convention (rebalance periods begin at the Dec 31 close) and
 * matches standard financial reporting (YTD = since Dec 31 prior-year close).
 */
export const getDateRangeForPeriod = (period: Period): { start: Date; end?: Date } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    switch (period) {
        case '2025':
            return { start: new Date(2025, 0, 1), end: new Date(2025, 11, 31) };
        case 'YTD':
            return { start: new Date(now.getFullYear() - 1, 11, 31) };
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
