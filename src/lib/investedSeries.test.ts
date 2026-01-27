import { describe, expect, it } from 'vitest';
import { buildInvestedValueSeries } from './investedSeries';
import type { TimeRange } from './timeRange';

const seededRng = (seed: number) => {
  let s = seed;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    // [0, 1)
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
};

describe('buildInvestedValueSeries (aggregated invested value)', () => {
  it('aggregates across all holdings and is invariant to holding order', async () => {
    const portfolioId = 'p1';
    const range: TimeRange = '1W';
    const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);

    const holdings = [
      { symbol: 'JPM', shares: 3 },
      { symbol: 'VOO', shares: 2 },
    ];

    const day1 = Date.UTC(2026, 0, 9, 0, 0, 0);
    const day2 = Date.UTC(2026, 0, 10, 0, 0, 0);

    const pricesBySymbol = new Map<string, Array<{ timestamp: number; close: number }>>([
      ['JPM', [
        { timestamp: day1, close: 100 },
        { timestamp: day2, close: 110 },
      ]],
      ['VOO', [
        { timestamp: day1, close: 200 },
        { timestamp: day2, close: 210 },
      ]],
    ]);

    const historicalProvider = async (symbol: string) => pricesBySymbol.get(symbol) ?? [];
    const latestPriceProvider = async (symbols: string[]) => {
      const m = new Map<string, number>();
      for (const s of symbols) {
        const arr = pricesBySymbol.get(s) ?? [];
        m.set(s, arr[arr.length - 1]?.close ?? 0);
      }
      return m;
    };

    const a = await buildInvestedValueSeries(portfolioId, range, {
      nowMs,
      holdings,
      historicalProvider: async (s) => historicalProvider(s),
      latestPriceProvider,
    });

    const b = await buildInvestedValueSeries('p2', range, {
      nowMs,
      holdings: [...holdings].reverse(),
      historicalProvider: async (s) => historicalProvider(s),
      latestPriceProvider,
    });

    const startA = a.series[0].investedValue;
    const endA = a.series[a.series.length - 1].investedValue;

    const expectedStart = 3 * 100 + 2 * 200;
    const expectedEnd = 3 * 110 + 2 * 210;

    expect(startA).toBe(expectedStart);
    expect(endA).toBe(expectedEnd);
    expect(a.series.map((p) => p.investedValue)).toEqual(b.series.map((p) => p.investedValue));
  });

  it('delta equals sum of all holding deltas (randomized portfolio)', async () => {
    const rng = seededRng(1337);
    const portfolioId = 'p_random';
    const range: TimeRange = '1W';
    const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);

    const holdingCount = 15;
    const holdings = Array.from({ length: holdingCount }).map((_, i) => ({
      symbol: `SYM${i}`,
      shares: Math.floor(rng() * 10) + 1,
    }));

    const day1 = Date.UTC(2026, 0, 9, 0, 0, 0);
    const day2 = Date.UTC(2026, 0, 10, 0, 0, 0);

    const pricesBySymbol = new Map<string, { start: number; end: number }>();
    for (const h of holdings) {
      const start = Math.round((50 + rng() * 150) * 100) / 100;
      const end = Math.round((50 + rng() * 150) * 100) / 100;
      pricesBySymbol.set(h.symbol, { start, end });
    }

    const historicalProvider = async (symbol: string) => {
      const px = pricesBySymbol.get(symbol)!;
      return [
        { timestamp: day1, close: px.start },
        { timestamp: day2, close: px.end },
      ];
    };

    const latestPriceProvider = async (symbols: string[]) => {
      const m = new Map<string, number>();
      for (const s of symbols) m.set(s, pricesBySymbol.get(s)!.end);
      return m;
    };

    const { series } = await buildInvestedValueSeries(portfolioId, range, {
      nowMs,
      holdings,
      historicalProvider,
      latestPriceProvider,
    });

    const startValue = series[0].investedValue;
    const endValue = series[series.length - 1].investedValue;
    const delta = endValue - startValue;

    const expectedDelta = holdings.reduce((sum, h) => {
      const px = pricesBySymbol.get(h.symbol)!;
      return sum + h.shares * (px.end - px.start);
    }, 0);

    expect(Math.abs(delta - expectedDelta)).toBeLessThan(0.01);
  });
});
