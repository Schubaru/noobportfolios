

# Free-Tier Chart Solution: Self-Recorded Portfolio Snapshots

## Overview

This plan replaces the broken Finnhub historical data approach with a self-recorded snapshot system. The chart will display "Your invested value over time since you started" based on snapshots stored in our database, not external historical price APIs.

## Current State Analysis

### Existing Infrastructure
- **`value_history` table**: Already exists with columns `id`, `portfolio_id`, `value`, `recorded_at`. Currently stores total portfolio value (cash + holdings).
- **Trade execution**: Already records a snapshot after each trade in `TradeModal.tsx` (lines 663-691).
- **Chart system**: `usePortfolioChart` hook + `InteractivePortfolioChart` component currently try to build series from Finnhub historical candles, which fail on free tier.

### Problem
- Finnhub free tier returns 403 Forbidden for historical candle data
- Current fallback shows a flat line with $0 change and "Historical data unavailable" message
- No periodic snapshot recording exists (only on trades)

## Technical Implementation

### Phase 1: Database Schema Update

#### Extend `value_history` table to store invested value
Add a new column `invested_value` to distinguish holdings-only value from total portfolio value:

```sql
ALTER TABLE value_history
ADD COLUMN invested_value numeric;

-- Add index for efficient range queries
CREATE INDEX idx_value_history_portfolio_recorded 
ON value_history (portfolio_id, recorded_at DESC);

-- Add source column to track how snapshot was created
ALTER TABLE value_history
ADD COLUMN source text DEFAULT 'manual';
```

This preserves backward compatibility while enabling invested-value-only charts.

### Phase 2: Snapshot Recording Logic

#### 2.1 Create a reusable snapshot utility

Create `src/lib/snapshotService.ts`:

```text
+------------------------------------------+
|         recordPortfolioSnapshot()        |
+------------------------------------------+
| Input: portfolioId                       |
| 1. Fetch holdings from database          |
| 2. Fetch current quotes for all symbols  |
| 3. Compute invested_value = sum(shares   |
|    * currentPrice)                       |
| 4. Compute portfolio_value = invested    |
|    + cash                                |
| 5. Insert into value_history with        |
|    throttle check (max 1 per 5 min)      |
+------------------------------------------+
```

Key behaviors:
- Uses `fetchMultipleQuotes` from existing `finnhub.ts`
- Throttles to max 1 snapshot per 5 minutes per portfolio
- Stores both `value` (total) and `invested_value` (holdings only)
- Returns silently on errors (non-blocking)

#### 2.2 Snapshot trigger points

| Trigger | Location | Behavior |
|---------|----------|----------|
| **Trade execution** | `TradeModal.tsx` | Already exists; update to use new utility and store `invested_value` |
| **Page view** | `PortfolioDetail.tsx` | Add snapshot call in `loadPortfolioData()` with 5-min throttle |
| **Scheduled job** | Edge function + pg_cron | Every 15 minutes during market hours (future enhancement) |

### Phase 3: Chart Data Source Refactor

#### 3.1 Update `buildInvestedValueSeries`

Refactor `src/lib/investedSeries.ts`:

```text
OLD FLOW:
  portfolioId + range
       |
       v
  Load holdings from DB
       |
       v
  Fetch historical prices from Finnhub (FAILS)
       |
       v
  Build time series

NEW FLOW:
  portfolioId + range
       |
       v
  Query value_history WHERE recorded_at >= rangeStart
       |
       v
  Map to [{timestamp, investedValue}]
       |
       v
  If only 1 point, duplicate for $0 change
       |
       v
  Return series + hasHistory flag
```

Key changes:
- Reads from `value_history` table instead of Finnhub
- Falls back to current quote if no history exists
- Sets `hasHistory: true` when 2+ points exist
- No external API dependency for the chart

#### 3.2 Update `usePortfolioChart` hook

Minimal changes needed:
- Already consumes `buildInvestedValueSeries`
- `hasHistory` flag already controls UI messaging
- Add `refetchOnFocus` behavior to pick up new snapshots

### Phase 4: UI Updates

#### 4.1 Update helper text in `InteractivePortfolioChart.tsx`

Replace:
```
"Historical price data unavailable. Showing current invested value."
```

With:
```
"Chart shows your portfolio value since you started. History grows as you use the app."
```

#### 4.2 Time range tab behavior

For ranges without sufficient data:
- Show available points (may be sparse)
- Add subtle note: "More data will appear as you use the app"
- Never disable tabs (always show something)

### Phase 5: Scheduled Snapshot Job (Optional Enhancement)

Create edge function `record-portfolio-snapshots/index.ts`:
- Called by pg_cron every 15 minutes
- Fetches all active portfolios (with holdings)
- Records snapshot for each using service role
- Respects throttle per portfolio

This ensures chart continuity even if user doesn't visit the page.

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx.sql` | Create | Add `invested_value` and `source` columns, add index |
| `src/lib/snapshotService.ts` | Create | Reusable snapshot recording utility |
| `src/lib/investedSeries.ts` | Update | Read from value_history instead of Finnhub |
| `src/components/TradeModal.tsx` | Update | Use snapshot service, record invested_value |
| `src/pages/PortfolioDetail.tsx` | Update | Record snapshot on page load (throttled) |
| `src/components/InteractivePortfolioChart.tsx` | Update | Change helper text |
| `src/hooks/usePortfolioChart.ts` | Minor | Adjust loading states |
| `supabase/functions/record-snapshots/index.ts` | Create (optional) | Scheduled snapshot job |
| `src/lib/finnhub-history.ts` | Delete | No longer needed |

## Data Flow Diagram

```text
User opens portfolio page
        |
        v
  PortfolioDetail.tsx
        |
        +---> recordPortfolioSnapshot(portfolioId)
        |            |
        |            v
        |     Fetch current quotes
        |            |
        |            v
        |     Compute invested_value
        |            |
        |            v
        |     INSERT into value_history
        |            (if >5 min since last)
        |
        +---> usePortfolioChart(portfolioId)
                     |
                     v
              buildInvestedValueSeries()
                     |
                     v
              SELECT from value_history
              WHERE portfolio_id = ?
              AND recorded_at >= rangeStart
                     |
                     v
              Return [{timestamp, investedValue}]
                     |
                     v
              Render chart + header
```

## Acceptance Criteria

1. Chart displays recorded snapshot data, not Finnhub historical candles
2. Header values (value, +$, +%) are derived from snapshot series start/end
3. Hover values show invested_value at that snapshot timestamp
4. New snapshot recorded on each trade and page view (throttled)
5. If only 1 snapshot exists, show $0 change and "—%"
6. Message reads "Chart shows your portfolio value since you started..."
7. Works for all users and all portfolio compositions
8. Never uses single-holding values for aggregate calculations

## Testing Strategy

1. **Fresh portfolio**: Create new portfolio, buy asset, verify first snapshot appears
2. **Multiple trades**: Execute multiple trades, verify chart shows change over time
3. **Page refresh**: Return to page, verify new snapshot recorded (after throttle)
4. **Time ranges**: Switch between 1D/1W/1M, verify correct filtering
5. **Hover**: Scrub across chart, verify header updates with snapshot values
6. **Empty portfolio**: Verify graceful handling when no holdings exist

## Technical Notes

### Throttle Logic
```typescript
const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

async function shouldRecordSnapshot(portfolioId: string): Promise<boolean> {
  const { data } = await supabase
    .from('value_history')
    .select('recorded_at')
    .eq('portfolio_id', portfolioId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
    
  if (!data) return true;
  
  const lastRecorded = new Date(data.recorded_at).getTime();
  return Date.now() - lastRecorded > SNAPSHOT_THROTTLE_MS;
}
```

### Backward Compatibility
- Existing `value_history` rows have `invested_value = NULL`
- For old rows, approximate invested_value as `value - cash_at_time` if possible, or skip
- New rows always have both columns populated

