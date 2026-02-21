

## Add Dollar P/L with Correctness Safeguards

### What Changes

The P/L column cell (lines 67-76) will be updated to show dollar P/L on the first line and percentage on the second line, with a guard against division-by-zero.

### File: `src/components/HoldingsTable.tsx`

**1. Add costBasis guard (line 41)**

Replace the raw percentage calculation with a safe version:

```
const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : null;
```

**2. Update the P/L cell (lines 67-76)**

Replace the current single-line percentage display with a two-line layout:

- Line 1: Arrow icon + signed dollar amount using `formatCurrency(Math.abs(unrealizedPL))` with `+` or `-` prefix controlled by `isPositive`
- Line 2: Percentage in parentheses, or `--` if `unrealizedPLPercent` is `null`

The cell structure becomes:

```tsx
<td className="p-4 text-right">
  <div className={`flex flex-col items-end ${isPositive ? 'text-success' : 'text-destructive'}`}>
    <div className="flex items-center gap-1">
      {isPositive ? <TrendingUp .../> : <TrendingDown .../>}
      <span className="font-medium">
        {isPositive ? '+' : '-'}{formatCurrency(Math.abs(unrealizedPL))}
      </span>
    </div>
    <span className="text-xs">
      ({unrealizedPLPercent !== null ? formatPercent(unrealizedPLPercent) : '—'})
    </span>
  </div>
</td>
```

### What stays the same

- All existing calculations (`currentPrice`, `positionValue`, `costBasis`, `unrealizedPL`)
- Arrow icons, color classes, table structure, responsive behavior
- No new columns, no layout resizing, no new dependencies

### Summary of safeguards

- Sign controlled in one place via `isPositive` flag
- `formatCurrency` receives only the absolute value
- `costBasis <= 0` renders `--` instead of `NaN%` or `Infinity%`
- Values update on every quote refresh since they derive from `holding.currentPrice`

