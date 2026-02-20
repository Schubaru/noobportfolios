

# Add Range-Start Anchor Point to portfolio-performance

## Problem

The chart's first data point comes from the earliest Alpaca bar, which can be well after `rangeStart`. This causes `startEquity` to be an arbitrary mid-range value (e.g. ~$393), producing absurd deltas like +1500%.

## Solution

Prepend a synthetic anchor point at `rangeStart = max(selectedRangeStart, portfolioCreatedAt)` before bar-driven points. This anchor becomes `chartData[0]`, which the frontend already uses as `startEquity`.

## Changes (single file: `supabase/functions/portfolio-performance/index.ts`)

### 1. Add `getPriceAtOrBefore` helper (after `getActiveHoldings`)

Resolves the best price for a symbol at a given timestamp:
- Scans bars (sorted asc) for the last bar with `t <= tsMs` (number-to-number comparison)
- Falls back to `seedPrices` only if no bar qualifies
- Returns `null` if neither source has data

```typescript
function getPriceAtOrBefore(sym: string, tsMs: number): number | null {
  const bars = barsBySymbol.get(sym) || [];
  let bestBarPrice: number | null = null;
  for (const b of bars) {
    if (b.t <= tsMs) {
      bestBarPrice = b.c;
    } else {
      break;
    }
  }
  if (bestBarPrice !== null) return bestBarPrice;
  return seedPrices.get(sym) ?? null;
}
```

### 2. Compute anchor point (replace the "no canonical timestamps" early return + the rawPoints loop)

- Remove the early return when `canonicalTs.length === 0` (anchor still valid even with no bars)
- Compute anchor using `getActiveHoldings(startMs)`, `getCashAt(startMs)`, and `getPriceAtOrBefore` for each held symbol
- Track `unpricedAtAnchor` for symbols with no price source
- Include `cash` field on every point for debugging

```typescript
const startMs = start; // number from rangeConfig -- ensures number-to-number comparisons

const anchorHoldings = getActiveHoldings(startMs);
const anchorCash = getCashAt(startMs);
let anchorHV = 0;
let anchorCB = 0;
const unpricedAtAnchor: string[] = [];

for (const h of anchorHoldings) {
  anchorCB += h.shares * h.avgCost;
  const price = getPriceAtOrBefore(h.symbol, startMs);
  if (price !== null) {
    anchorHV += h.shares * price;
  } else {
    unpricedAtAnchor.push(h.symbol);
  }
}

const anchorPoint = {
  t: new Date(startMs).toISOString(),
  v: Math.round((anchorHV + anchorCash) * 100) / 100,
  hv: Math.round(anchorHV * 100) / 100,
  cb: Math.round(anchorCB * 100) / 100,
  cash: Math.round(anchorCash * 100) / 100,
};
```

### 3. Build rawPoints starting with anchor, skipping duplicates

```typescript
const rawPoints = [anchorPoint];

for (const t of canonicalTs) {
  if (t <= startMs) continue; // anchor already covers this
  // ... existing equity computation, but add cash field
  rawPoints.push({
    t: new Date(t).toISOString(),
    v: Math.round((hv + cash) * 100) / 100,
    hv: Math.round(hv * 100) / 100,
    cb: Math.round(cb * 100) / 100,
    cash: Math.round(cash * 100) / 100,
  });
}
```

### 4. Add `cash` field to live point (1D) for consistency

The existing live point block also gets the `cash` field added.

### 5. Include `unpricedAtAnchor` in the response JSON

```typescript
unpricedAtAnchor: unpricedAtAnchor.length > 0 ? unpricedAtAnchor : undefined,
```

### 6. Update `available` check

Change from `points.length >= 2` to `points.length >= 1` since the anchor alone is a valid single point showing current equity. Actually keep `>= 2` -- anchor + at least one bar point is needed for a meaningful chart line.

## What stays the same

- `getCashAt` -- unchanged (already hardened with nearest-prior fallback)
- `getActiveHoldings` -- unchanged
- `fetchSeedPrices`, `fetchBars`, `fetchLiveQuotesFromCache` -- unchanged
- Frontend `PortfolioGrowthChart.tsx` -- unchanged (already uses `chartData[0].equity` as `startEquity`)
- `initialize-portfolio` -- unchanged (already updated in previous fix)
- `priceMaps` forward-fill logic -- unchanged (still used for bar-driven points)

## Technical Details

### All 4 requested tweaks addressed:

1. **Price at-or-before start**: `getPriceAtOrBefore` checks bars first (last bar with `t <= tsMs`), only falls back to seedPrice if no bar qualifies
2. **Number-to-number comparisons**: `startMs = start` (already a number from `rangeConfig`), all comparisons use `t <= startMs` where both are ms timestamps
3. **Cash on all points**: Every point (anchor, bar-driven, live) includes a `cash` field for debugging/consistency
4. **Unpriced tracking**: `unpricedAtAnchor` array tracks symbols held at start with no price source, included in response

## Acceptance Criteria

- 1M pill shows sane delta (baseline ~$10k for a $10k portfolio, not ~$393)
- BUY events appear flat on chart (cash down + holdings up = same equity)
- Hover equity never shows absurd baselines
- `unpricedAtAnchor` in response flags any symbols that couldn't be valued at the anchor

