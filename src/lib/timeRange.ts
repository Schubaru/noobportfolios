export type TimeRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export const getTimeRangeStartMs = (range: TimeRange, nowMs: number = Date.now()): number => {
  const day = 24 * 60 * 60 * 1000;

  switch (range) {
    case '1D':
      return nowMs - day;
    case '1W':
      return nowMs - 7 * day;
    case '1M':
      return nowMs - 30 * day;
    case '3M':
      return nowMs - 90 * day;
    case 'YTD':
      return new Date(new Date(nowMs).getFullYear(), 0, 1).getTime();
    case '1Y':
      return nowMs - 365 * day;
    case 'ALL':
    default:
      return 0;
  }
};
