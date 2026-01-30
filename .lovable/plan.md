
# Fix Trade Modal Search: More Relevant Results for Common Queries

## Problem Analysis

### Current Behavior
When typing "jpm", the search returns only 1-2 results directly from Finnhub API. The client shows whatever Finnhub returns without:
- Merging with local catalog (which has JPM, JEPI, JEPQ - all JPMorgan-related)
- Re-filtering for spelling matches
- Proper ranking based on match quality

### Root Cause
**TradeModal bypasses the hybrid search system entirely.** Lines 943-972 in `TradeModal.tsx` call `searchSymbolsApi()` directly instead of using `hybridSearch()` from `searchAssets.ts`, which was designed to:
1. Search local catalog instantly (includes 200+ popular assets)
2. Fetch from Finnhub API
3. Merge and deduplicate
4. Apply strict spelling-based filtering
5. Rank by match quality

### Search Universe
```text
┌─────────────────────────────────────────────────────────────┐
│                    Current Flow (Broken)                    │
├─────────────────────────────────────────────────────────────┤
│  User types "jpm"                                           │
│       ↓                                                     │
│  TradeModal calls searchSymbolsApi() directly               │
│       ↓                                                     │
│  Edge function calls Finnhub → returns ~2 results           │
│       ↓                                                     │
│  Results shown as-is (misses JEPI, JEPQ from local catalog) │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Fixed Flow (Proposed)                    │
├─────────────────────────────────────────────────────────────┤
│  User types "jpm"                                           │
│       ↓                                                     │
│  hybridSearch() → Instant local results (JPM, JEPI, JEPQ)   │
│       ↓ (parallel, debounced)                               │
│  hybridSearch() → Finnhub API (more JPM-related assets)     │
│       ↓                                                     │
│  Merge + Dedupe + Filter (strict substring) + Rank          │
│       ↓                                                     │
│  Show 5-15 relevant results, all containing "jpm"           │
└─────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

| Test Case | Expected Result |
|-----------|-----------------|
| Type "j" | Local results only (instant), includes JPM, JEPI, JEPQ, JNJ |
| Type "jp" | Local + API, shows all "jp" matches (JPM, JEPI, JEPQ) |
| Type "jpm" | Multiple JPM-related results (JPM, JEPI, JEPQ + any API matches) |
| Type "jpmo" | Subset of above (narrows to "jpmo" substring matches) |
| Type "jpmorgan" | Only assets with "jpmorgan" in name (JPM, JEPI, JEPQ) |
| No results for | CSCO, MS, or any ticker without the query substring |

---

## Implementation Plan

### File: `src/components/TradeModal.tsx`

#### 1. Import hybridSearch and SearchAssetResult

Add to existing imports:
```typescript
import { hybridSearch, SearchAssetResult } from '@/lib/searchAssets';
```

#### 2. Update searchResults State Type

Change from:
```typescript
const [searchResults, setSearchResults] = useState<FinnhubSearchResult[]>([]);
```
To:
```typescript
const [searchResults, setSearchResults] = useState<SearchAssetResult[]>([]);
```

#### 3. Replace Direct API Call with hybridSearch

Replace lines 943-972 (the search useEffect) with:

```typescript
// Search with debounce - hybrid local + API
useEffect(() => {
  // AbortController for cleanup
  const abortController = new AbortController();
  
  const performSearch = async () => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const { results, isRateLimited, hasError } = await hybridSearch(
        searchQuery,
        portfolio.holdings,
        {
          includeApi: searchQuery.length >= 2, // API only for 2+ chars
          limit: 20, // Allow more results for better coverage
          abortSignal: abortController.signal,
        }
      );
      
      if (!abortController.signal.aborted) {
        setSearchResults(results);
        
        // Optional: Show toast if rate limited
        if (isRateLimited && results.length === 0) {
          console.warn('Search rate limited, showing local results only');
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        console.error('Search error:', err);
        setSearchResults([]);
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsSearching(false);
      }
    }
  };
  
  // Debounce: 100ms for local-only, 350ms when API involved
  const debounceMs = searchQuery.length < 2 ? 100 : 350;
  const debounce = setTimeout(performSearch, debounceMs);
  
  return () => {
    clearTimeout(debounce);
    abortController.abort();
  };
}, [searchQuery, portfolio.holdings]);
```

#### 4. Update handleSelectSymbol to Work with SearchAssetResult

The current code accesses `result.type` which exists in both types. Update to also use `result.source` for OWNED badge:

In the results display section (around line 1267), add an "OWNED" badge:

```tsx
{searchResults.map(result => (
  <button 
    key={result.symbol} 
    onClick={() => handleSelectSymbol(result.symbol)} 
    className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left"
  >
    <div className="flex items-center gap-2">
      {/* OWNED badge for holdings */}
      {result.source === 'holding' && (
        <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
          OWNED
        </span>
      )}
      <div>
        <p className="font-semibold text-primary">
          {highlightMatch(result.symbol, searchQuery).map((segment, i) => (
            segment.highlighted ? (
              <span key={i} className="bg-primary/20 rounded">{segment.text}</span>
            ) : (
              <span key={i}>{segment.text}</span>
            )
          ))}
        </p>
        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
          {highlightMatch(result.name, searchQuery).map((segment, i) => (
            segment.highlighted ? (
              <span key={i} className="text-foreground font-medium">{segment.text}</span>
            ) : (
              <span key={i}>{segment.text}</span>
            )
          ))}
        </p>
      </div>
    </div>
    <span className="px-2 py-1 rounded-md bg-muted text-xs">
      {result.type}
    </span>
  </button>
))}
```

#### 5. Update handleConfirmTrade Asset Class Detection

Around line 1071, update to use SearchAssetResult:

```typescript
const searchResult = searchResults.find(r => r.symbol === symbolToUse);
const assetClass = searchResult?.assetClass || detectAssetClass(searchResult?.type || 'stock', symbolToUse);
```

This already works because `SearchAssetResult` has the same `assetClass` field.

---

### File: `src/lib/searchAssets.ts`

#### 6. Improve Normalization for Better Matching

Update `normalizeForSearch` to also remove slashes and commas:

```typescript
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.&'\-,/]/g, '')  // Remove common punctuation including , and /
    .replace(/\s+/g, ' ')       // Collapse spaces
    .trim();
}
```

#### 7. Increase API Result Limit

In `hybridSearch`, change the final slice limit to allow more results when available:

```typescript
// Line 341: Change from .slice(0, limit) to allow more results
const finalResults = mergedResults
  .sort((a, b) => b.matchScore - a.matchScore)
  .slice(0, Math.max(limit, 15)); // At least 15 results
```

Actually, keep it as `limit` but ensure the caller passes a higher limit.

---

### File: `supabase/functions/market-search/index.ts`

#### 8. Increase Edge Function Result Limit

Change line 163 from `.slice(0, 15)` to `.slice(0, 25)`:

```typescript
.slice(0, 25) // Increased limit for better client-side filtering
```

This allows more raw results to reach the client, where the strict filtering will remove non-matching items.

---

## UX States

| Query Length | Behavior |
|--------------|----------|
| 0 chars | Show "Suggested Assets" sections |
| 1 char | Show local results instantly (no API call) |
| 2+ chars | Show local results instantly, then merge API results after 350ms |
| Rate limited | Show local results only, no error message unless empty |

**Loading indicator**: Already present (`isSearching` shows spinner)

**No results**: Already has message "No results found for '{query}'"

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/TradeModal.tsx` | Import `hybridSearch`, update state type, replace search useEffect, add OWNED badge |
| `src/lib/searchAssets.ts` | Improve normalization (add `,` and `/`) |
| `supabase/functions/market-search/index.ts` | Increase result limit from 15 to 25 |

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| **Owned asset matches** | Ranked first with +10000 score bonus, shows "OWNED" badge |
| **Rapid typing** | Debounce + AbortController cancels stale requests |
| **API rate limit (429)** | Falls back to local-only results gracefully |
| **Duplicate symbols** | Deduplicated by symbol (local takes precedence) |
| **Spaces in query** | Normalized ("jp morgan" matches "jpmorgan") |
| **Punctuation in query** | Stripped ("j.p.morgan" matches "jpmorgan") |

---

## Validation Test Cases

After implementation, verify:

1. **Type "jpm"** → Should see:
   - JPM (JPMorgan Chase & Co.) - ticker exact match
   - JEPI (JPMorgan Equity Premium Income ETF) - name contains "JPMorgan"
   - JEPQ (JPMorgan Nasdaq Equity Premium Income ETF) - name contains "JPMorgan"
   - Any additional API results that contain "jpm" in ticker or name

2. **Type "jpmo"** → Should see subset of above (only those with "jpmo" substring)

3. **Type "voo"** → VOO should appear at top (exact ticker match)

4. **Type "apple"** → AAPL should appear (name contains "Apple")

5. **Type "csco" after typing "jpm"** → CSCO should NOT appear in "jpm" results (strict filter)

6. **Own JPM, then search "jpm"** → JPM shows first with "OWNED" badge
