

# Fix Inflated Timeframe Deltas via Seed Prices

## Problem
Early data points in the chart have `holdingsValue = 0` because the forward-fill loop starts with `lastPrice = null`. Until bars arrive for a symbol, equity = cash only, creating a false performance jump when prices finally appear.

## Solution
Fetch "seed prices" (most recent prior close per symbol from `symbol_daily_prices`) before range start, and initialize the forward-fill with those values. This ensures holdings are valued from the first timestamp.

## Changes (single file)

**File: `supabase/functions/portfolio-performance/index.ts`**

### 1. Add `toEasternDate()` helper
Converts a UTC ms timestamp to US/Eastern `YYYY-MM-DD` string. Used to compute `startDate` for the seed query so `date < startDate` selects the correct prior close regardless of weekends/holidays.

```typescript
function toEasternDate(ms: number): string {
  return new Date(ms).toLocaleString('en-CA', { timeZone: 'America/New_York' }).split(',')[0];
}
```

### 2. Add `fetchSeedPrices()` function
Queries `symbol_daily_prices` for the most recent `close_price` per symbol where `date < startDate` (Eastern). Limited to `symbols.length * 5` rows, deduped in JS (first row per symbol = most recent).

```typescript
async function fetchSeedPrices(
  serviceClient, symbols, rangeStartMs
): Promise<Map<string, number>> {
  const startDate = toEasternDate(rangeStartMs);
  const { data } = await serviceClient
    .from('symbol_daily_prices')
    .select('symbol, close_price, date')
    .in('symbol', symbols)
    .lt('date', startDate)
    .order('date', { ascending: false })
    .limit(symbols.length * 5);
  // Dedupe: first row per symbol = most recent
  ...
}
```

### 3. Create service client in handler
Add a service-role client (alongside existing user client) to read `symbol_daily_prices`:

```typescript
const serviceClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
```

### 4. Call `fetchSeedPrices()` after determining `allSymbols` and `start`

```typescript
const seedPrices = await fetchSeedPrices(serviceClient, allSymbols, start);
```

### 5. Initialize forward-fill with seed price (line 298)

```text
Before:  let lastPrice: number | null = null;
After:   let lastPrice: number | null = seedPrices.get(sym) ?? null;
```

### 6. Track unpriced symbols correctly
A symbol is "unpriced" only when it has no seed AND no bars (not warned when seed exists):

```typescript
const unpricedSymbols: string[] = [];
for (const sym of allSymbols) {
  const bars = barsBySymbol.get(sym) || [];
  if (!seedPrices.has(sym) && bars.length === 0) {
    unpricedSymbols.push(sym);
  }
}
```

Include `unpricedSymbols` in the JSON response (only when non-empty).

### 7. Filter `shares > 0` in `getActiveHoldings`
Add `&& Number(h.shares) > 0` to the condition so zero-share rows don't contribute to hv or cb.

### 8. Fix live point fallback chain
After checking live quotes and last bar, also fall back to seed price:

```typescript
} else {
  const seed = seedPrices.get(h.symbol);
  if (seed) liveHV += h.shares * seed;
}
```

## What stays the same
- All other edge functions (unchanged)
- Frontend chart components (unchanged -- they already read `v` = equity)
- Range config, canonical timestamp logic, cash history logic
- Alpaca bar fetching logic
- Response caching logic

## Acceptance
- After a BUY, equity line stays flat (cash down, holdings up by same amount at seed price)
- 1W/1M deltas reflect actual price movement, not holdings appearing from zero
- Switching timeframes produces consistent deltas
- `unpricedSymbols` array in response lets frontend show a warning for truly unpriced symbols

