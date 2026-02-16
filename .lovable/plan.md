
# Fix Range Gain/Loss to Use Holdings Value (hv)

## Problem
Range P/L currently uses `v` (portfolio_value = holdings + cash). When a user buys assets, cash converts to holdings but total `v` stays the same -- however if the first chart point has `hv = 0` (no holdings yet), the gain appears as the full holdings value, creating fake gains.

## Solution
Switch all P/L calculations from `v` to `hv` (holdings_value only), and use the first non-zero `hv` point as the baseline. This isolates market movement from deposit/trade events.

## Changes in `src/components/PortfolioGrowthChart.tsx`

### 1. Chart data (`chartData` useMemo, lines 116-125)
- Find the first point where `hv > 0` as the baseline
- Plot `investedPL = p.hv - baselineHV`
- Store `portfolioValue = p.hv` (holdings value, not total)
- If no point has `hv > 0`, return empty array

### 2. Range stats (`onRangeStats` useEffect, lines 128-135)
Replace with the user's provided logic:
- Find first point where `hv > 0`
- If none found, emit `{ gain: 0, pct: 0 }`
- Otherwise: `gain = last.hv - firstNonZero.hv`, `pct = gain / firstNonZero.hv`

### 3. Hover baseline (line 155)
- Change `baselineV` to use the first non-zero `hv` from the raw points (not `chartData[0].portfolioValue`)
- Hover gain becomes `point.portfolioValue - baselineHV` where both are `hv`-based

### 4. Chart line color (line 151)
- Already uses `latestPL` from `chartData` -- no change needed, it will automatically reflect `hv`-based P/L

## Technical Detail

```text
Before:
  baseline = points[0].v              (portfolio value at range start)
  gain     = last.v - first.v         (includes cash movements)

After:
  baseline = first point where hv > 0 (first non-zero holdings value)
  gain     = last.hv - baseline.hv    (pure market movement)
```

## Files Modified
1. `src/components/PortfolioGrowthChart.tsx` -- switch from `v` to `hv`, use first non-zero baseline

## Acceptance Criteria
- Buy $1500 of assets with no price change: gain = $0
- Assets move +5, +10, -3: gain shows +$12
- All ranges (1D/1W/1M/ALL) use same first-non-zero-hv baseline rule
- Hover tooltip consistent with resting gain/loss pill
- No holdings in range: gain = $0, pct = 0%
