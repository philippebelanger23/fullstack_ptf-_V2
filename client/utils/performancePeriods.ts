import type { PerformancePeriod, PerformanceWindowRange } from '../types';

export const PERFORMANCE_PERIOD_LABELS: Record<PerformancePeriod, string> = {
    YTD: 'Year to Date',
    Q1: 'Q1',
    Q2: 'Q2',
    Q3: 'Q3',
    Q4: 'Q4',
    '3M': '3 Months',
    '6M': '6 Months',
    '1Y': '1 Year',
    FULL_YEAR: 'Full Year',
};

export const PERFORMANCE_PERIOD_GROUPS: readonly { key: string; periods: PerformancePeriod[] }[] = [
    { key: 'year', periods: ['FULL_YEAR'] },
    { key: 'rolling', periods: ['YTD', '3M', '6M', '1Y'] },
    { key: 'quarters', periods: ['Q1', 'Q2', 'Q3', 'Q4'] },
];

const toIsoDate = (value: string | null | undefined): string | null => {
    if (!value) return null;
    return value.slice(0, 10);
};

const formatDateLabel = (value: string) => (
    new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
);

export const resolvePerformanceWindowBounds = (
    windowRange: PerformanceWindowRange | null | undefined,
    asOfDate?: string | null,
): { start: string; end: string } | null => {
    const start = toIsoDate(windowRange?.start);
    const end = toIsoDate(windowRange?.end ?? asOfDate);
    if (!start || !end) return null;
    return { start, end };
};

export const getPerformancePeriodButtonLabel = (
    period: PerformancePeriod,
    windowRange?: PerformanceWindowRange | null,
): string => {
    if (period !== 'FULL_YEAR') return period;

    const fullYearEnd = toIsoDate(windowRange?.end);
    if (!fullYearEnd) return PERFORMANCE_PERIOD_LABELS.FULL_YEAR;

    return String(new Date(`${fullYearEnd}T00:00:00`).getFullYear());
};

export const getPerformancePeriodTitle = (
    period: PerformancePeriod,
    windowRange: PerformanceWindowRange | null | undefined,
    asOfDate?: string | null,
): string => {
    const bounds = resolvePerformanceWindowBounds(windowRange, asOfDate);
    if (!bounds) return getPerformancePeriodButtonLabel(period, windowRange);

    const endYear = new Date(`${bounds.end}T00:00:00`).getFullYear();
    const label = period === 'FULL_YEAR'
        ? `${PERFORMANCE_PERIOD_LABELS.FULL_YEAR} ${endYear}`
        : PERFORMANCE_PERIOD_LABELS[period];

    return `${label} (${formatDateLabel(bounds.start)} - ${formatDateLabel(bounds.end)})`;
};
