const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const getSelectedYearDateWindow = (selectedYear: number): { start: string; end: string } => ({
    start: `${selectedYear - 1}-12-31`,
    end: `${selectedYear}-12-31`,
});

export const isDateInSelectedYearWindow = (isoDate: string, selectedYear: number): boolean => {
    const { start, end } = getSelectedYearDateWindow(selectedYear);
    return isoDate >= start && isoDate <= end;
};

export const getReportingYearForIsoDate = (isoDate: string): number | null => {
    const match = ISO_DATE_RE.exec(isoDate);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
        return null;
    }

    return month === 12 && day === 31 ? year + 1 : year;
};

export const getCalendarYearForIsoDate = (isoDate: string): number | null => {
    const match = ISO_DATE_RE.exec(isoDate);
    if (!match) return null;

    const year = Number(match[1]);
    return Number.isNaN(year) ? null : year;
};

export const getAvailableReportingYears = (
    isoDates: string[],
    fallbackYears: number[] = [],
): number[] => {
    const years = new Set<number>(fallbackYears);

    isoDates.forEach((isoDate) => {
        const reportingYear = getReportingYearForIsoDate(isoDate);
        if (reportingYear !== null) {
            years.add(reportingYear);
        }
    });

    return Array.from(years).sort((a, b) => b - a);
};

export const getAvailableCalendarYears = (
    isoDates: string[],
    fallbackYears: number[] = [],
): number[] => {
    const years = new Set<number>(fallbackYears);

    isoDates.forEach((isoDate) => {
        const calendarYear = getCalendarYearForIsoDate(isoDate);
        if (calendarYear !== null) {
            years.add(calendarYear);
        }
    });

    return Array.from(years).sort((a, b) => b - a);
};
