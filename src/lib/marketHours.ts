/**
 * US stock market hours detection (NYSE/NASDAQ).
 * Market open: Mon–Fri, 9:30 AM – 4:00 PM Eastern Time.
 * Does not account for holidays.
 */

function getEasternNow(): Date {
  // Convert current time to Eastern
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return eastern;
}

export function isUSMarketOpen(): boolean {
  const eastern = getEasternNow();
  const day = eastern.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = eastern.getHours();
  const minutes = eastern.getMinutes();
  const timeMinutes = hours * 60 + minutes;

  // 9:30 AM = 570, 4:00 PM = 960
  return timeMinutes >= 570 && timeMinutes < 960;
}

export function getMarketStatusLabel(): string {
  const eastern = getEasternNow();
  const day = eastern.getDay();
  if (day === 0 || day === 6) return 'Market closed';

  const hours = eastern.getHours();
  const minutes = eastern.getMinutes();
  const timeMinutes = hours * 60 + minutes;

  if (timeMinutes < 570) return 'Pre-market';
  if (timeMinutes < 960) return 'Market open';
  return 'Market closed';
}

/** Refresh interval for quotes based on market state */
export function getQuoteRefreshInterval(marketOpen: boolean, tabVisible: boolean): number {
  if (!tabVisible) return 5 * 60_000; // 5 min when hidden
  if (marketOpen) return 15_000;      // 15s during market hours
  return 2 * 60_000;                  // 2 min when closed
}
