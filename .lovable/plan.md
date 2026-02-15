

# Maximize 1D Chart Data Density

## Current State
- You already capture snapshots every ~8 seconds while the page is open -- that's the closest to intraday possible on Finnhub's free tier (which only provides daily candles, not minute-by-minute data)
- For the current portfolio, there are **4,688 data points** in the last 24 hours alone
- However, the chart **downsamples everything to 200 points**, throwing away 95% of your data
- When the page is closed, no data is captured at all, creating gaps

## Plan

### 1. Increase downsample limits per time range
Show more data points for shorter ranges where detail matters most:

| Range | Current Max Points | New Max Points |
|-------|-------------------|----------------|
| 1D    | 200               | 800            |
| 1W    | 200               | 500            |
| 1M    | 200               | 300            |
| ALL   | 200               | 200            |

**File: `src/components/PortfolioGrowthChart.tsx`**
- Update `downsample()` to accept a dynamic `maxPoints` parameter (already does)
- Pass range-aware max points from the `filteredData` memo

### 2. Smart deduplication before downsampling
When prices are flat (weekends, after-hours), consecutive identical values waste chart points. Deduplicate consecutive points with the same `investedPL` value before downsampling, keeping only the first and last of each flat run. This preserves detail during active trading while compressing dead periods.

**File: `src/components/PortfolioGrowthChart.tsx`**
- Add a `deduplicateFlat()` function that collapses runs of identical values
- Apply it before `downsample()` in the `filteredData` memo

### 3. Backfill daily close values using market-history
For days when the user wasn't online, use the existing `market-history` edge function to reconstruct approximate portfolio values at each day's market close. This fills multi-day gaps with real Finnhub daily candle data.

**New file: `src/lib/backfill.ts`**
- `backfillDailyCloses(portfolioId, holdings, existingSnapshots)`: Identifies days with no snapshots, fetches daily candles for each held symbol via `market-history`, calculates approximate portfolio value at each day's close, and inserts synthetic `source: 'backfill'` snapshots into `value_history`
- Runs once on portfolio page load if gaps are detected
- Only backfills for dates after the portfolio's first snapshot (not before any holdings existed)

**File: `src/pages/PortfolioDetail.tsx`**
- Call `backfillDailyCloses()` after initial data load, before chart renders
- Trigger a snapshot key bump after backfill completes so the chart re-fetches

### 4. Pass selectedRange to downsample logic
**File: `src/components/PortfolioGrowthChart.tsx`**
- Add a `maxPointsForRange()` helper that returns the limit based on the selected range
- Use it in the `filteredData` memo: `downsample(points, maxPointsForRange(selectedRange))`

## Technical Details

### Smart deduplication logic
```text
Input:  [10, 10, 10, 10, 12, 12, 15, 15, 15, 10]
Output: [10, 10, 12, 12, 15, 15, 10]
         ^first ^last  ^f ^l  ^f ^l  ^single
```
Keeps first and last of each "flat run", preserving transition boundaries.

### Backfill algorithm
1. Find date range: first snapshot date to today
2. Find dates with zero snapshots (gap days)
3. For each gap day, fetch daily candles for all held symbols via `market-history`
4. Calculate portfolio value: for each symbol, `shares x close_price` on that day
5. Insert a single `source: 'backfill'` snapshot per gap day

### Files changed
| File | Change |
|------|--------|
| `src/components/PortfolioGrowthChart.tsx` | Range-aware downsample limits, smart dedup |
| `src/lib/backfill.ts` | New -- daily close backfill using market-history |
| `src/pages/PortfolioDetail.tsx` | Call backfill on load, pass range to chart |

