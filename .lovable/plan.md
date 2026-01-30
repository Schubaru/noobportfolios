
# Strict Spelling-Based Search for Trade Modal

## Problem Statement

When users type specific queries like "jpmorgan", the search returns loosely related assets (e.g., "MS" Morgan Stanley, "CSCO" Cisco) that don't contain the typed substring. This happens because the current algorithm uses fuzzy matching (Levenshtein distance) that matches partial/similar words, creating unpredictable "mystery matches."

**Current behavior:** Typing "jpmorgan" shows MS, CSCO, and other unrelated tickers
**Expected behavior:** Only show assets where ticker OR name contains "jpmorgan" as a substring

---

## Acceptance Criteria

### Matching Rules

1. **Normalization**: Lowercase both query and asset fields; trim whitespace; collapse multiple spaces to single space; remove punctuation (`.`, `&`, `'`) for matching but preserve original display text

2. **Strict Substring Filtering**: Only include results where:
   - `normalizedTicker.includes(normalizedQuery)` OR
   - `normalizedName.includes(normalizedQuery)`
   - No fuzzy/Levenshtein matching for filtering

3. **Minimum Query Length**: 
   - 1 character: Show local results only (no API call)
   - 2+ characters: Include API search
   - 0 characters: Show "Suggested Assets" section

4. **No False Positives**: If query substring is not found in ticker or name, the asset must NOT appear in results

### Ranking (Deterministic, Spelling-Based)

| Tier | Match Type | Score |
|------|------------|-------|
| 1 | Ticker exact match | 5000 |
| 2 | Ticker starts with query | 3000 |
| 3 | Name starts with query | 2000 |
| 4 | Ticker contains query | 1500 |
| 5 | Name contains query (word boundary) | 1000 |
| 6 | Name contains query (anywhere) | 800 |

**Within tiers:**
- Owned assets get +10000 bonus (always sort first)
- Then by popularity score (for local catalog items)
- Then alphabetically by symbol

---

## Implementation Changes

### File: `src/lib/searchAssets.ts`

#### 1. Add Normalization Utility

```typescript
/**
 * Normalize text for search matching
 * - Lowercase
 * - Remove punctuation (., &, ', -)
 * - Collapse multiple spaces to single space
 * - Trim whitespace
 */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.&'\-]/g, '')     // Remove common punctuation
    .replace(/\s+/g, ' ')        // Collapse spaces
    .trim();
}
```

#### 2. Rewrite `calculateMatchScore` - Remove Fuzzy Matching

```typescript
function calculateMatchScore(
  asset: LocalAsset | FinnhubSearchResult,
  normalizedQuery: string,
  isHolding: boolean
): number {
  const symbol = asset.symbol.toLowerCase();
  const normalizedName = normalizeForSearch(asset.name);
  const q = normalizedQuery;
  
  let score = 0;
  
  // Ownership bonus (highest priority)
  if (isHolding) score += 10000;
  
  // Tier 1: Ticker exact match
  if (symbol === q) {
    score += 5000;
  }
  // Tier 2: Ticker starts with query
  else if (symbol.startsWith(q)) {
    score += 3000;
  }
  // Tier 3: Name starts with query
  else if (normalizedName.startsWith(q)) {
    score += 2000;
  }
  // Tier 4: Ticker contains query
  else if (symbol.includes(q)) {
    score += 1500;
  }
  // Tier 5: Name contains query at word boundary
  else if (normalizedName.split(' ').some(word => word.startsWith(q))) {
    score += 1000;
  }
  // Tier 6: Name contains query anywhere
  else if (normalizedName.includes(q)) {
    score += 800;
  }
  // NO MATCH - return 0 (will be filtered out)
  else {
    return 0;
  }
  
  // Add popularity bonus for local assets (0-100 range)
  if ('popularity' in asset) {
    score += (asset as LocalAsset).popularity;
  }
  
  return score;
}
```

**Key change:** The `else` block at the end now returns `0` instead of doing fuzzy matching. This means assets that don't contain the query substring get score=0 and are filtered out.

#### 3. Update `searchLocalCatalog` - Pre-normalize Query

```typescript
export function searchLocalCatalog(
  query: string,
  holdings: Holding[] = [],
  limit: number = 15
): SearchAssetResult[] {
  if (!query || query.length < 1) return [];
  
  // Normalize query once for all comparisons
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return [];
  
  const holdingSymbols = new Set(holdings.map(h => h.symbol.toUpperCase()));
  const results: SearchAssetResult[] = [];
  const seen = new Set<string>();
  
  // Check user holdings first (STRICT substring match)
  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    const symbolLower = symbol.toLowerCase();
    const normalizedName = normalizeForSearch(holding.name);
    
    // STRICT: Must contain query as substring
    if (symbolLower.includes(normalizedQuery) || normalizedName.includes(normalizedQuery)) {
      // ... rest of holding processing (unchanged)
    }
  }
  
  // Search catalog (STRICT substring match via score > 0)
  for (const asset of ASSET_CATALOG) {
    if (seen.has(asset.symbol)) continue;
    
    const score = calculateMatchScore(asset, normalizedQuery, holdingSymbols.has(asset.symbol));
    
    // Only include if there's a real match (score > 0 means substring found)
    if (score > 0) {
      // ... add to results (unchanged)
    }
  }
  
  // Sort and return (unchanged)
}
```

#### 4. Update `hybridSearch` - Apply Same Rules to API Results

When merging API results, also apply strict substring filtering:

```typescript
for (const apiResult of apiResults) {
  if (seenSymbols.has(apiResult.symbol)) continue;
  
  const score = calculateMatchScore(apiResult, normalizedQuery, false);
  
  // STRICT: Only include if substring match found
  if (score === 0) continue;
  
  // ... add to merged results
}
```

#### 5. Update `highlightMatch` - Handle Normalized Matching

The current `highlightMatch` works with simple substring indexOf, which is correct. However, we should ensure it uses the same normalization logic when finding matches:

```typescript
export function highlightMatch(
  text: string,
  query: string
): { text: string; highlighted: boolean }[] {
  if (!query || query.length < 1) {
    return [{ text, highlighted: false }];
  }
  
  // Normalize both for matching, but preserve original text for display
  const normalizedQuery = normalizeForSearch(query);
  const normalizedText = normalizeForSearch(text);
  
  // Find match position in normalized text
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  
  if (matchIndex === -1) {
    return [{ text, highlighted: false }];
  }
  
  // Map normalized position back to original text
  // ... highlight the corresponding portion in original text
}
```

*Note: This requires a more sophisticated approach to map positions between normalized and original text. For simplicity, we can keep the current implementation since it already does case-insensitive matching, and the strict filter ensures only real matches appear.*

---

## Test Cases

| Query | Expected Results | Not Expected |
|-------|-----------------|--------------|
| `jpmorgan` | JPM, JEPI, JEPQ (contain "jpmorgan" in name) | MS, CSCO, BAC |
| `jp` | JPM, JEPI, JEPQ (ticker or name starts with/contains "jp") | Only if query ≥2 chars for API |
| `voo` | VOO at top (exact ticker match) | Any asset without "voo" in ticker/name |
| `apple` | AAPL (name contains "apple") | MSFT, other tech stocks |
| `microsoft` | MSFT (name contains "microsoft") | Other tech without "microsoft" |
| `s&p` | Assets with "S&P" in name (normalized to "sp") | Unrelated tickers |
| `etf` | ETFs with "etf" in name | Stocks without "etf" in name |

---

## UI Behavior (Unchanged)

- **Debounce**: Keep 350ms for API, instant for local
- **Scroll**: Reset to top when query changes
- **Highlighting**: Keep current substring highlighting (only visible for real matches now)
- **OWNED badge**: Keep for user holdings
- **Type chips**: Keep (ETF/Stock/REIT/Bond)
- **Empty state**: Keep "No matches for '{query}'" message
- **Suggested assets**: Keep showing when query is empty

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/searchAssets.ts` | Add `normalizeForSearch()`, rewrite `calculateMatchScore()` to remove fuzzy matching, update `searchLocalCatalog()` and `hybridSearch()` to use normalized query |

No changes needed to:
- `TradeModal.tsx` (uses same search functions, UI stays identical)
- `assetCatalog.ts` (data unchanged)
- `market-search/index.ts` (API filtering happens on client)

---

## Technical Notes

### Why Remove Fuzzy Matching Entirely?

The original intent was to handle typos (e.g., "appl" → "AAPL"), but:
1. Users expect search to filter precisely as they type
2. Fuzzy matches create confusing "mystery results"
3. For a 200-item local catalog, substring matching is sufficient
4. API results from Finnhub already handle fuzzy matching server-side

### Performance

- Normalization is O(n) string operations, negligible for ~200 items
- No change to debounce timing or caching strategy
- Levenshtein distance calculation (O(n²)) is removed, so performance actually improves

### Edge Cases

- **Empty query after normalization** (e.g., user types only punctuation): Return empty results
- **Spaces in query**: "jp morgan" normalized to "jp morgan" can match "jpmorgan chase" normalized to "jpmorgan chase" (spaces collapsed)
- **Special characters**: Safely stripped during normalization
