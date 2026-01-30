

# Restore Missing Trade Modal Features

## Problem Identified

Two previously implemented features are no longer present in `TradeModal.tsx`:

1. **Back Button in Header** - The ChevronLeft icon and back navigation from the Details step to Search step is missing
2. **Search Highlighting** - The `highlightMatch` function from `searchAssets.ts` is not being used to highlight matching text

### What's Missing in the Code

| Feature | Expected | Current |
|---------|----------|---------|
| `ChevronLeft` import | In lucide-react imports (line 2) | Not imported |
| `savedScrollPositionRef` | Ref to save scroll position | Not defined |
| `handleBackToSearch` | Callback function to go back | Not defined |
| Back button in header | ChevronLeft button when `step === 'details'` | Not rendered (lines 1193-1202) |
| `highlightMatch` import | Import from `@/lib/searchAssets` | Not imported |
| Highlighted text in results | Use `highlightMatch()` for symbol/name display | Plain text only (lines 1218-1221) |

---

## Changes Required

### File: `src/components/TradeModal.tsx`

#### 1. Add ChevronLeft to imports (line 2)

Add `ChevronLeft` to the existing lucide-react import.

#### 2. Import highlightMatch from searchAssets (new import)

```typescript
import { highlightMatch } from '@/lib/searchAssets';
```

#### 3. Add savedScrollPositionRef (near other refs, around line 820)

```typescript
const savedScrollPositionRef = useRef<number>(0);
```

#### 4. Add resultsContainerRef for scroll position tracking (if not already present)

```typescript
const resultsContainerRef = useRef<HTMLDivElement>(null);
```

#### 5. Add handleBackToSearch function (after handleSuccessComplete, around line 1163)

```typescript
const handleBackToSearch = useCallback(() => {
  // Clear asset-specific data
  setQuote(null);
  setFundamentals(null);
  setProfile(null);
  setSelectedQuote(null);
  setShares('');
  setDollarAmount('');
  setError('');
  lastFetchedSymbol.current = null;
  
  // Clear quote refresh interval
  if (quoteRefreshRef.current) {
    clearInterval(quoteRefreshRef.current);
    quoteRefreshRef.current = null;
  }
  
  // Go back to search
  setStep('search');
  
  // Restore scroll position after render
  requestAnimationFrame(() => {
    if (resultsContainerRef.current) {
      resultsContainerRef.current.scrollTop = savedScrollPositionRef.current;
    }
  });
}, []);
```

#### 6. Save scroll position in handleSelectSymbol (before setStep('details'))

Add before transitioning to details step:
```typescript
if (resultsContainerRef.current) {
  savedScrollPositionRef.current = resultsContainerRef.current.scrollTop;
}
```

#### 7. Update header to include Back button (lines 1193-1202)

Replace current header with:
```tsx
<div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
  <div className="flex items-center gap-2">
    {step === 'details' && (
      <button
        onClick={handleBackToSearch}
        className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Back to search"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    )}
    <h2 className="text-lg font-bold">
      {step === 'search' && 'Search Asset'}
      {step === 'details' && 'Trade'}
      {step === 'confirm' && 'Confirm Order'}
    </h2>
  </div>
  <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
    <X className="w-5 h-5" />
  </button>
</div>
```

#### 8. Add ref to search results container (line 1215)

Change:
```tsx
<div className="space-y-1 max-h-[300px] overflow-y-auto">
```
To:
```tsx
<div ref={resultsContainerRef} className="space-y-1 max-h-[300px] overflow-y-auto">
```

#### 9. Add highlighting to search results (lines 1218-1221)

Change the symbol display from:
```tsx
<p className="font-semibold text-primary">{result.symbol}</p>
```
To:
```tsx
<p className="font-semibold text-primary">
  {highlightMatch(result.symbol, searchQuery).map((segment, i) => (
    segment.highlighted ? (
      <span key={i} className="bg-primary/20 rounded">{segment.text}</span>
    ) : (
      <span key={i}>{segment.text}</span>
    )
  ))}
</p>
```

Change the name display from:
```tsx
<p className="text-sm text-muted-foreground truncate max-w-[200px]">
  {result.name}
</p>
```
To:
```tsx
<p className="text-sm text-muted-foreground truncate max-w-[200px]">
  {highlightMatch(result.name, searchQuery).map((segment, i) => (
    segment.highlighted ? (
      <span key={i} className="text-foreground font-medium">{segment.text}</span>
    ) : (
      <span key={i}>{segment.text}</span>
    )
  ))}
</p>
```

---

## Summary of Line Changes

| Location | Change |
|----------|--------|
| Line 2 | Add `ChevronLeft` to lucide-react imports |
| After line 10 | Add `import { highlightMatch } from '@/lib/searchAssets';` |
| Around line 820 | Add `savedScrollPositionRef` and `resultsContainerRef` refs |
| Around line 990 | Save scroll position in `handleSelectSymbol` before step change |
| After line 1162 | Add `handleBackToSearch` callback function |
| Lines 1193-1202 | Update header with back button |
| Line 1215 | Add `ref={resultsContainerRef}` to results container |
| Lines 1218-1221 | Use `highlightMatch()` for symbol and name display |

---

## No Other Changes

This plan only restores the two missing features. All other functionality remains unchanged:
- Trade execution flow
- Success animation
- Search filtering logic
- Suggested assets display
- Modal close behavior

