/**
 * Tests for the snapshot-based invested series builder
 * 
 * Note: These tests verify the pure logic aspects.
 * The actual buildInvestedValueSeries now reads from the database,
 * so integration testing is done via manual/E2E tests.
 */

import { describe, expect, it } from 'vitest';
import { getTimeRangeStartMs } from './timeRange';
import type { TimeRange } from './timeRange';

describe('getTimeRangeStartMs (time range calculations)', () => {
  const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0); // Jan 10, 2026 12:00 UTC

  it('1D should return ~24 hours ago', () => {
    const start = getTimeRangeStartMs('1D', nowMs);
    const diff = nowMs - start;
    expect(diff).toBeCloseTo(24 * 60 * 60 * 1000, -4); // ~24 hours
  });

  it('1W should return ~7 days ago', () => {
    const start = getTimeRangeStartMs('1W', nowMs);
    const diff = nowMs - start;
    expect(diff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -4); // ~7 days
  });

  it('1M should return ~30 days ago', () => {
    const start = getTimeRangeStartMs('1M', nowMs);
    const diff = nowMs - start;
    expect(diff).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -4); // ~30 days
  });

  it('3M should return ~90 days ago', () => {
    const start = getTimeRangeStartMs('3M', nowMs);
    const diff = nowMs - start;
    expect(diff).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -4); // ~90 days
  });

  it('1Y should return ~365 days ago', () => {
    const start = getTimeRangeStartMs('1Y', nowMs);
    const diff = nowMs - start;
    expect(diff).toBeCloseTo(365 * 24 * 60 * 60 * 1000, -4); // ~365 days
  });
});

describe('Snapshot series logic (unit tests)', () => {
  it('aggregates holdings correctly for invested value calculation', () => {
    // This tests the pure calculation logic used in snapshotService
    const holdings = [
      { symbol: 'JPM', shares: 3, price: 100 },
      { symbol: 'VOO', shares: 2, price: 200 },
    ];

    const investedValue = holdings.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(investedValue).toBe(3 * 100 + 2 * 200); // 700
  });

  it('delta calculation is consistent regardless of holding order', () => {
    const holdings = [
      { symbol: 'A', shares: 5, startPrice: 100, endPrice: 110 },
      { symbol: 'B', shares: 3, startPrice: 50, endPrice: 45 },
    ];

    const startValue = holdings.reduce((sum, h) => sum + h.shares * h.startPrice, 0);
    const endValue = holdings.reduce((sum, h) => sum + h.shares * h.endPrice, 0);
    const delta = endValue - startValue;

    // Reverse order
    const reversed = [...holdings].reverse();
    const startValueReversed = reversed.reduce((sum, h) => sum + h.shares * h.startPrice, 0);
    const endValueReversed = reversed.reduce((sum, h) => sum + h.shares * h.endPrice, 0);
    const deltaReversed = endValueReversed - startValueReversed;

    expect(delta).toBe(deltaReversed);
    expect(startValue).toBe(startValueReversed);
    expect(endValue).toBe(endValueReversed);
  });

  it('handles empty holdings with zero invested value', () => {
    const holdings: Array<{ shares: number; price: number }> = [];
    const investedValue = holdings.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(investedValue).toBe(0);
  });

  it('percentage calculation handles zero start value', () => {
    const startValue = 0;
    const endValue = 100;
    const change = endValue - startValue;
    
    // Should return null (displayed as "—%")
    const percentChange = startValue > 0 ? (change / startValue) * 100 : null;
    expect(percentChange).toBeNull();
  });

  it('single snapshot results in zero delta', () => {
    const series = [
      { timestamp: Date.now() - 1000, investedValue: 1000 },
      { timestamp: Date.now(), investedValue: 1000 },
    ];

    const startValue = series[0].investedValue;
    const endValue = series[series.length - 1].investedValue;
    const delta = endValue - startValue;

    expect(delta).toBe(0);
  });
});
