

# N00B Portfolios: Smart Ticker Search Upgrade

## Feature Goal (Restated)

Upgrade the "Search Ticker" flow in the Trade Modal so users can find assets by **both ticker symbol AND company/fund name** (e.g., typing "apple" returns AAPL, typing "vanguard s&p" returns VOO).

**Where it's used:** The Trade Modal, accessed via the "Trade" button on any portfolio detail page, and from the Holdings table "view asset" action.

**Who uses it:** Beginner investors who may not know ticker symbols but recognize company names like "Apple" or "Microsoft."

**Success criteria:**
- Search by ticker (exact and partial): `VOO`, `AA` → shows AAPL, AAL, etc.
- Search by name: `vanguard`, `nvidia`, `apple inc`
- Fast perceived performance (results within 300-500ms)
- Accurate classification (stocks vs ETFs vs REITs vs bonds)
- Mobile-friendly with touch targets and no janky loading states
- Graceful degradation when rate-limited

---

## Current Implementation Analysis

### What Exists Today
1. **TradeModal.tsx** (1,445 lines) - Contains search input with 300ms debounce
2. **market-search Edge Function** - Proxies Finnhub `/search` endpoint with 24-hour cache
3. **Finnhub Search API** (`/api/v1/search`) - Already supports both ticker and name search
4. **Local curated data:**
   - `SUGGESTED_ASSETS` (14 items) - Shown when search is empty
   - `KNOWN_ETF_SYMBOLS`, `KNOWN_BOND_SYMBOLS`, `KNOWN_REIT_SYMBOLS` - Classification overrides
   - `ASSET_DESCRIPTIONS` - Educational content for popular assets
   - Curated dividend data for ~100 symbols

### Current Search Flow
```text
User types → 300ms debounce → searchSymbolsApi() → market-search Edge Function → Finnhub /search → Filter results → Display
```

### What's Already Working
- Finnhub's `/search` endpoint already supports name-based queries (e.g., "apple" returns AAPL)
- Edge function has 24-hour cache to minimize API calls
- Asset classification logic exists for ETFs/REITs/Bonds

### What Needs Improvement
1. **No local-first search** - Every keystroke after debounce hits the API
2. **No prioritization** of user's own holdings or recently searched
3. **No fuzzy matching** for typos ("appl" doesn't match "AAPL")
4. **Missing substring highlighting** in results
5. **No graceful rate-limit handling** - Shows error, doesn't fall back to local
6. **No keyboard navigation** in results list
7. **Generic copy** - Could be more beginner-friendly

---

## Functional Requirements & Constraints

### Supported Asset Types
- Stocks (COMMON STOCK)
- ETFs (ETP, ETF)
- REITs
- Bond ETFs
- ADRs
- *Crypto: Not currently supported (Finnhub free tier doesn't include crypto)*

### "Available to the platform" Definition
- **Finnhub universe**: Any US-listed security that Finnhub returns
- We do not maintain our own internal universe beyond the curated suggestions

### Finnhub Free Tier Constraints
- **60 API calls/minute** across ALL endpoints
- Symbol search is relatively lightweight vs quotes
- 24-hour cache already implemented in edge function
- Must respect rate limits to avoid 429 errors affecting quotes

### Local Data Available for Leverage
| Data Source | Items | Use Case |
|-------------|-------|----------|
| User's holdings | Per portfolio | Prioritize owned assets |
| `SUGGESTED_ASSETS` | 14 | Default suggestions |
| `KNOWN_ETF/BOND/REIT_SYMBOLS` | ~80 total | Classification |
| `ASSET_DESCRIPTIONS` | ~35 | Educational content |
| `KNOWN_*_DIVIDENDS` | ~80 | Dividend data |

---

## Implementation Options

### Option A: Hybrid Search (Recommended)
**Concept:** Local-first for popular/owned assets + Finnhub for long-tail

**How it works:**
1. Build a local catalog of ~200 popular US assets with name + ticker
2. On keystroke, instantly filter local catalog (no debounce needed)
3. After 350ms debounce, also query Finnhub for additional results
4. Merge results: Local matches first, then API results (deduplicated)
5. User's current holdings always appear at top if matched

**Pros:**
- Instant results for common queries (AAPL, VOO, MSFT)
- Reduces API calls significantly
- Still supports long-tail searches via Finnhub
- Works offline for popular assets

**Cons:**
- Need to maintain local catalog (~5KB JSON)
- Catalog needs periodic updates (quarterly is fine)

### Option B: Remote-Only with Aggressive Caching
**Concept:** Keep using Finnhub exclusively but add client-side caching

**How it works:**
1. Increase debounce to 400ms
2. Add client-side search result cache (in-memory)
3. Minimum 2-character query to reduce frivolous calls
4. Show "Recent searches" when empty

**Pros:**
- Simplest implementation
- No catalog to maintain

**Cons:**
- First search for any term is slow
- Still API-dependent for all searches
- Poor offline experience

### Option C: Local-Only with Pre-seeded Catalog
**Concept:** Remove Finnhub search entirely, use comprehensive local catalog

**How it works:**
1. Build catalog of ~2000 US securities
2. Fuzzy match entirely client-side
3. Never call search API

**Pros:**
- No API dependency
- Instant results always

**Cons:**
- Large catalog to maintain (~50KB)
- Missing obscure securities
- Catalog staleness issues

### Recommendation: Option A (Hybrid)
Best balance of speed, reliability, and coverage for a beginner-focused app.

---

## Detailed UI/UX Behavior

### Input States

| State | Visual | Behavior |
|-------|--------|----------|
| Empty | Placeholder text + Suggested Assets grid | Show curated categories |
| Typing (< 1 char) | Show helper text | "Keep typing to search" |
| Typing (debouncing) | Subtle loading indicator | Local results show immediately, spinner in corner |
| Loading API | Spinner in input | Show local results while waiting |
| Has results | Results list | Grouped by type |
| No results | Empty state | Friendly message + suggestions |
| Rate limited | Soft warning | Show local results only |
| Error | Error state | Retry option + local results |

### Debounce Strategy
- **Local search:** Immediate (0ms) - filter local catalog on every keystroke
- **API search:** 350ms debounce - only call Finnhub after user stops typing
- **Minimum query length:** 1 character for local, 2 for API

### Results Grouping
```text
┌─────────────────────────────────────────────┐
│ 🔍 "vanguard"                            ⏳ │
├─────────────────────────────────────────────┤
│ YOUR HOLDINGS                               │
│ ┌─────────────────────────────────────────┐ │
│ │ VOO    Vanguard S&P 500 ETF        ETF │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ INDEX FUNDS                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ VTI    Vanguard Total Stock ETF    ETF │ │
│ │ VIG    Vanguard Dividend Apprec.   ETF │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ MORE RESULTS                                │
│ ┌─────────────────────────────────────────┐ │
│ │ VNQ    Vanguard Real Estate        REIT│ │
│ │ VYM    Vanguard High Dividend      ETF │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Keyboard Navigation
- `↓` / `↑` arrows to navigate results
- `Enter` to select highlighted result
- `Escape` to clear search and close modal

### Substring Highlighting
Match portions of ticker and name will be **bolded**:
- Query: "appl"
- Result: **APPL**E Inc. / **Appl**e Inc.

### Mobile Considerations
- Touch target minimum: 44px height
- Sticky search input at top during scroll
- Virtual keyboard awareness (modal adjusts)
- Swipe to dismiss modal

---

## Data Model & Search Algorithm

### Local Asset Catalog Structure
```typescript
interface LocalAsset {
  symbol: string;           // "VOO"
  name: string;             // "Vanguard S&P 500 ETF"
  normalizedName: string;   // "vanguard s&p 500 etf" (pre-computed)
  normalizedSymbol: string; // "voo" (pre-computed)
  type: string;             // "ETF"
  assetClass: AssetClass;   // "etf"
  category?: string;        // "Index Fund" (for grouping)
  popularity?: number;      // 1-100 (for ranking)
}
```

### Search Algorithm (Ranking Order)

| Priority | Match Type | Example Query | Example Match |
|----------|-----------|---------------|---------------|
| 1 | User holding (exact) | "VOO" | VOO in portfolio |
| 2 | Ticker exact | "AAPL" | AAPL |
| 3 | Ticker prefix | "AA" | AAPL, AAL |
| 4 | Name prefix | "Apple" | Apple Inc. |
| 5 | Name contains | "bank" | JPMorgan Chase & Co. |
| 6 | Fuzzy (1 edit) | "appl" | AAPL |
| 7 | API results | anything | Finnhub results |

### Deduplication Strategy
- Use `symbol` as unique key
- When merging local + API results:
  1. Build Set of local result symbols
  2. Filter API results to exclude duplicates
  3. Preserve local ranking (appears first)

### Fuzzy Matching (Lightweight)
Use simple Levenshtein distance with threshold of 1-2 edits:
- "appl" → "aapl" (1 deletion)
- "micrsoft" → "microsoft" (1 insertion)

Only apply fuzzy to local catalog (too expensive for API).

---

## Finnhub Integration Details

### Endpoints Used
- `/api/v1/search?q={query}` - Symbol/name search (already implemented)

### Rate Limit Mitigation
| Technique | Implementation |
|-----------|----------------|
| Debounce | 350ms before API call |
| Min query length | 2 characters for API |
| Request cancellation | AbortController for stale requests |
| 24h server cache | Already in edge function |
| 5min client cache | New: cache search results in memory |
| Local-first | Reduce API calls by 60-70% |

### Caching Strategy
```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Client Cache    │────▶│ Edge Fn Cache    │────▶│ Finnhub API     │
│ (5 min TTL)     │     │ (24 hour TTL)    │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Rate Limit Fallback Flow
```text
If API returns 429:
  1. Set rateLimitedUntil = now + 60s
  2. Show soft warning: "Showing saved results only"
  3. Continue showing local catalog results
  4. After 60s, re-enable API calls
```

---

## Risk Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limits hit | Poor UX, no results | Local-first search, 60s backoff |
| Slow network | Spinner forever | 5s timeout, show local results |
| Irrelevant API results | User confusion | Ranking algorithm prioritizes exact matches |
| Exchange confusion (AAPL vs AAPL.L) | Wrong asset | Filter non-US in edge function (already done) |
| Missing ETFs in classification | Wrong type shown | Expand `KNOWN_ETF_SYMBOLS` list |
| Duplicate symbols | Double entries | Dedupe by symbol before render |
| Stale local catalog | Missing new IPOs | Quarterly catalog updates |
| Typos not handled | No results | Fuzzy matching on local catalog |

---

## Microcopy & Interaction Tone

### Search Input
- **Placeholder:** `"Search stocks, ETFs, or funds..."`
- **Helper text (subtle):** `"Try 'Apple' or 'VOO'"`

### Empty State (No Query)
- **Header:** "Popular Investments"
- **Subtext:** "Quality picks for long-term portfolios"

### No Results State
- **Primary:** `"No matches for '{query}'"`
- **Secondary:** `"Check the spelling or try a different term. You can also search by company name."`

### Rate Limit Warning
- **Soft banner:** `"Showing saved results. More options available in a moment."`
- *(Not: "Rate limited! Too many requests!")*

### Loading State
- Show spinner inside input (right side)
- Continue showing local results while loading

---

## Technical Implementation Summary

### Files to Create
1. `src/lib/assetCatalog.ts` - Local asset catalog (~200 popular US securities)
2. `src/lib/searchAssets.ts` - Unified search logic (local + API merge)

### Files to Modify
1. `src/components/TradeModal.tsx` - Integrate new search, add keyboard nav, highlight matches
2. `supabase/functions/market-search/index.ts` - Add client-side cache headers, improve error handling

### New Dependencies
None required - all features implementable with existing stack.

### Estimated Effort
- Local catalog data entry: ~2 hours
- Search algorithm implementation: ~2 hours
- UI enhancements (keyboard nav, highlighting): ~2 hours
- Testing & polish: ~2 hours
- **Total:** ~8 hours

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first result | < 100ms (local), < 500ms (API) |
| Search success rate | > 95% of queries return relevant results |
| API calls reduced | 60-70% fewer than current |
| Rate limit errors shown to user | < 1% of sessions |
| Mobile usability score | 100% touch targets > 44px |

