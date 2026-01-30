
# Fractional Shares Display Rounding

## Summary

Round fractional share values to 2 decimal places for display only (not for calculations), ensuring clean, readable UI while preserving full precision in trading math and database storage.

## Scope & Requirements

**What we're changing:**
- Display formatting only - how shares appear to users
- Round to nearest hundredth (2 decimals) for readability
- Trim trailing zeros when appropriate (10.00 becomes 10, 10.10 becomes 10.1)

**What stays unchanged:**
- All trading calculations use full precision internally
- Database stores full precision values
- Order totals, cost basis, cash calculations remain exact
- No "Est." or "Approx." labels needed (the rounding is purely cosmetic)

## Identified UI Locations

| Location | File | Current Display | Action |
|----------|------|-----------------|--------|
| Holdings table "Shares" column | `HoldingsTable.tsx:61` | `{holding.shares}` (raw) | Apply formatter |
| Trade modal "You own X shares" | `TradeModal.tsx:1107` | `{existingHolding.shares.toFixed(4)}` | Apply formatter |
| Trade modal "Max: X shares" label | `TradeModal.tsx:1246` | `{maxBuyShares}` / `{maxSellShares}` | Apply formatter |
| Trade modal dollar preview | `TradeModal.tsx:1281` | `{effectiveShares.toFixed(4)}` | Apply formatter |
| Trade modal order summary | `TradeModal.tsx:1297` | `{effectiveShares.toFixed(4)}` | Apply formatter |
| Asset detail modal "Shares" | `AssetDetailModal.tsx:128` | `{holding.shares}` (raw) | Apply formatter |
| Recent transactions list | `PortfolioDetail.tsx:327` | `{tx.shares}` (raw) | Apply formatter |

## Implementation

### 1. Create formatShares utility

Add to `src/lib/portfolio.ts`:

```typescript
/**
 * Format shares for display - rounds to 2 decimals for readability
 * while preserving negative sign and trimming unnecessary trailing zeros.
 * 
 * Examples:
 * - 10.123456 -> "10.12"
 * - 10.00 -> "10"
 * - 10.10 -> "10.1"
 * - 0.5 -> "0.5"
 * - null/undefined/NaN -> "0"
 */
export const formatShares = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '0';
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) return '0';
  
  // Round to 2 decimals, then convert to number to trim trailing zeros
  const rounded = Math.round(num * 100) / 100;
  
  // Use toLocaleString to format with proper thousands separators
  // and automatic trailing zero trimming
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};
```

### 2. Update UI components

**HoldingsTable.tsx** (line 61):
```tsx
// Before:
<td className="p-4 text-right font-medium">{holding.shares}</td>

// After:
<td className="p-4 text-right font-medium">{formatShares(holding.shares)}</td>
```

**TradeModal.tsx** - 5 locations:

1. Line 1107 "You own X shares":
```tsx
// Before:
You own {existingHolding.shares.toFixed(4)} shares

// After:
You own {formatShares(existingHolding.shares)} shares
```

2. Line 1246 "Max shares" label:
```tsx
// Before:
Max: {tradeType === 'buy' ? maxBuyShares : maxSellShares} shares

// After:
Max: {formatShares(tradeType === 'buy' ? maxBuyShares : maxSellShares)} shares
```

3. Line 1281 dollar input preview:
```tsx
// Before:
 {effectiveShares.toFixed(4)} shares

// After:
 {formatShares(effectiveShares)} shares
```

4. Line 1297 order summary:
```tsx
// Before:
{effectiveShares.toFixed(4)} shares x {formatCurrency(currentPrice)}

// After:
{formatShares(effectiveShares)} shares x {formatCurrency(currentPrice)}
```

**AssetDetailModal.tsx** (line 128):
```tsx
// Before:
<p className="font-medium">{holding.shares}</p>

// After:
<p className="font-medium">{formatShares(holding.shares)}</p>
```

**PortfolioDetail.tsx** (line 327):
```tsx
// Before:
{tx.shares} shares @ {formatCurrency(tx.price)}

// After:
{formatShares(tx.shares)} shares @ {formatCurrency(tx.price)}
```

## Technical Notes

### Why no "Est." labels?
The rounding is purely cosmetic. The actual trade uses full precision internally. Adding "Est." would create visual noise without adding meaningful information since users already understand they're seeing a rounded display value.

### Calculation integrity preserved
- `effectiveShares` (calculated from dollar input) retains full precision for order total calculation
- Database writes use raw `effectiveShares`, not the formatted string
- All P/L, cost basis, and cash calculations use raw numeric values

### Edge cases handled
- Whole numbers display cleanly: 10.00 becomes "10"
- Single decimal: 10.10 becomes "10.1"  
- Very small fractional: 0.01 displays as "0.01"
- Negative values (if ever applicable): -5.55 displays correctly
- Invalid input (null/undefined/NaN): returns "0"

## Files Modified

| File | Change |
|------|--------|
| `src/lib/portfolio.ts` | Add `formatShares()` utility function |
| `src/components/HoldingsTable.tsx` | Import and use `formatShares()` |
| `src/components/TradeModal.tsx` | Import and use `formatShares()` in 4 locations |
| `src/components/AssetDetailModal.tsx` | Import and use `formatShares()` |
| `src/pages/PortfolioDetail.tsx` | Import and use `formatShares()` |

## Verification Checklist

After implementation, verify:
1. Buy $50 of a stock priced at $247.32 - shows fractional shares rounded to 2 decimals in preview
2. Holdings table displays clean 2-decimal shares (no long decimals)
3. Asset detail modal shows rounded shares
4. Transaction history shows rounded shares
5. Order total still calculates correctly with full precision
6. Cash balance updates correctly after trade
7. P/L calculations remain accurate
