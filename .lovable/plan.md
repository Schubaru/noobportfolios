
# Add Back Button with Preserved Search Context

## Current Behavior
The Trade modal transitions from **Search** → **Details** when a user selects an asset. There's already a "Back" button at the bottom of the Details view, but it doesn't preserve the scroll position of the search results when returning to search.

**Good news:** The current implementation already preserves `searchQuery` and `searchResults` when going back - they are not cleared by the existing Back button. The search state is retained.

## What's Missing

1. **Header-level Back Button**: Users expect a back control in the modal header (top-left), not just at the bottom of the form
2. **Scroll Position Restoration**: When returning to search, the results list should scroll back to where the user was

## Minimal Changes Required

### 1. Add a "Back" button to the header (visible only in details step)

Add a chevron-left icon button in the modal header that appears when `step === 'details'`:

```
┌──────────────────────────────────────────────┐
│  ← Back      Trade                        ✕  │
├──────────────────────────────────────────────┤
│  [Asset details view...]                     │
└──────────────────────────────────────────────┘
```

- Icon: `ChevronLeft` from lucide-react (already imported pattern in the app)
- Styling: Matches existing ghost button pattern (`p-2 rounded-lg hover:bg-muted`)
- Accessibility: `aria-label="Back to search"`

### 2. Preserve scroll position

- Before transitioning to details: Save `resultsContainerRef.current.scrollTop` to a ref
- When back is clicked: Restore scroll position after step changes to 'search'

### 3. Refactor the back logic into a reusable function

Extract the back click handler into a `handleBackToSearch` function that:
- Clears only asset-specific data (quote, fundamentals, profile, trade inputs)
- Does NOT clear searchQuery or searchResults (already works this way)
- Restores scroll position
- Sets step to 'search'

## State Flow

```
USER FLOW:
┌─────────────┐   select asset   ┌─────────────┐
│   SEARCH    │ ───────────────▶ │   DETAILS   │
│  (query,    │                  │  (asset     │
│   results,  │ ◀─────────────── │   data,     │
│   scroll)   │   click "Back"   │   trade)    │
└─────────────┘   PRESERVE:      └─────────────┘
                  - query
                  - results
                  - scroll position
                  
                  RESET:
                  - quote/fundamentals/profile
                  - shares/dollarAmount
                  - error
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/TradeModal.tsx` | Add header back button, add scroll position ref, refactor back handler |

## Implementation Details

### New imports
Add `ChevronLeft` to the existing lucide-react imports (line 2).

### New ref for scroll position
```typescript
const savedScrollPositionRef = useRef<number>(0);
```

### Save scroll position when selecting asset
In `handleSelectSymbol`, before transitioning to details:
```typescript
if (resultsContainerRef.current) {
  savedScrollPositionRef.current = resultsContainerRef.current.scrollTop;
}
```

### Back handler function
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

### Updated header (lines 827-840)
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
      {step === 'search' && 'Search Ticker'}
      {step === 'details' && 'Trade'}
      {step === 'confirm' && 'Confirm Order'}
    </h2>
  </div>
  <button
    onClick={onClose}
    className="p-2 rounded-lg hover:bg-muted transition-colors"
  >
    <X className="w-5 h-5" />
  </button>
</div>
```

### Keep bottom "Back" button but use same handler
Update the existing bottom Back button (line 1324) to use `handleBackToSearch` instead of inline logic.

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| No prior search (direct asset open via `initialSymbol`) | Back returns to empty search state safely (searchQuery and searchResults remain empty) |
| Search results were empty | Back shows empty search state with suggestions visible |
| User entered trade values | Trade inputs (shares/dollars) are reset on back - simplest consistent behavior |
| Keyboard | Back button is focusable; Escape still closes the modal (existing behavior unchanged) |

## What Stays Unchanged

- Modal close (X button) works the same
- Escape key closes modal
- Trade calculations and execution
- Full state reset on modal close
- Search query preservation (already working)
- Search results preservation (already working)

## No New Dependencies

Uses only existing packages and patterns from the codebase.
