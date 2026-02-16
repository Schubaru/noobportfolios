
# Chart: Show Market Impact, Not Trade Activity

## Problem

The chart currently plots `holdingsValue - firstHoldingsValue`. When a user buys $500 of stock, the chart jumps up $500 instantly -- but that is not a market gain. It is capital being deployed. The chart should only move when market prices change the value of invested money.

## Solution

Track **cost basis** (what the user paid) alongside holdings value at every time bucket. The chart then plots **unrealized P/L** = `holdingsValue - costBasis`, which only changes when market prices move.

```text
Example:
  T1: Own 10 AAPL @ $150, costBasis=$1500, hv=$1500 --> unrealizedPL = $0
  T2: Buy 5 more AAPL @ $150, costBasis=$2250, hv=$2250 --> unrealizedPL = $0 (no jump!)
  T3: AAPL rises to $155, costBasis=$2250, hv=$2325 --> unrealizedPL = +$75 (market moved!)
```

## Changes

### 1. Backend: `supabase/functions/portfolio-performance/index.ts`

Add a `cb` (cost basis) field to each data point alongside the existing `hv` (holdings value):

- In the bucket loop (lines 272-324), compute `costBasis = SUM(shares x avg_cost)` for all active holdings at each bucket time, using the same time-window logic already used for `holdingsValue`
- Add `cb: Math.round(costBasis * 100) / 100` to each point object
- In the live last-point block (lines 327-358), also compute and include `liveCB` in the live point
- Response shape changes from `{ t, v, hv }` to `{ t, v, hv, cb }`

### 2. Frontend: `src/components/PortfolioGrowthChart.tsx`

Update the chart to use unrealized P/L instead of raw holdings delta:

- Add `cb` to the `PerformancePoint` interface
- Change `chartData` derivation (lines 116-127):
  - Compute `unrealizedPL = hv - cb` at each point
  - Compute baseline unrealized P/L from first point with holdings
  - Plot `unrealizedPL - baselineUnrealizedPL` as the Y-axis value (this shows the *change* in market-driven P/L over the selected range)
- Update `rangeStats` calculation (lines 130-148) to use `hv - cb` instead of raw `hv`
- Update hover handler (lines 180-195) to report gain based on unrealized P/L delta
- Update tooltip to show unrealized P/L

### 3. What This Means for the User

- **Before**: Buying stock makes the chart jump up. Selling makes it drop. Chart mixes trade activity with market performance.
- **After**: Buying or selling stock has zero visible effect on the chart. The line only moves when market prices change. This accurately answers "how is the market treating my investments?"

## Files Modified

1. `supabase/functions/portfolio-performance/index.ts` -- add `cb` field to each point
2. `src/components/PortfolioGrowthChart.tsx` -- chart plots unrealized P/L delta instead of holdings delta
