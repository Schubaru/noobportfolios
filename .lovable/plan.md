

# Fix Portfolio Growth Chart Refresh (No Flicker)

## Root Causes

1. `setIsLoading(true)` fires on every re-fetch, showing skeleton loader and unmounting the chart
2. `snapshotKey` increments every 8 seconds (on each auto-snapshot), triggering a full re-fetch each time
3. No data comparison -- state is always replaced even when snapshots haven't changed
4. No interaction-awareness -- data swaps while user is hovering the chart

## Changes

### 1. Modify: `src/components/PortfolioGrowthChart.tsx`

**Remove skeleton flicker (stale-while-revalidate)**
- Only show skeleton on the very first load (`isLoading && allSnapshots.length === 0`)
- Background re-fetches keep the old data visible; swap in new data silently when ready

**Deduplicate updates**
- Before calling `setAllSnapshots`, compare the last snapshot's `id` and count with current state
- If identical, skip the state update entirely

**Interaction-aware pausing**
- Add `isHovering` ref, set via `onMouseEnter`/`onMouseLeave` on the chart container
- When new data arrives during hover, stash it in a `pendingData` ref
- Apply pending data 2 seconds after `onMouseLeave`

**Throttle re-fetches to ~60s for passive updates**
- Replace `snapshotKey` dependency with an internal timer (60s interval)
- Add a `triggerRefresh()` callback exposed via a new prop or by accepting a `refreshSignal` number that only increments on trades/manual refresh (not every 8s auto-snapshot)

**Recharts animation**
- Add `isAnimationActive={true}` and `animationDuration={300}` to the `Area` component for smooth line transitions when data changes

### 2. Modify: `src/pages/PortfolioDetail.tsx`

**Stop bumping snapshotKey on every auto-snapshot**
- Remove `setSnapshotKey(k => k + 1)` from the auto-snapshot `.then()` callback (line 105)
- Keep it only in `handleTradeComplete` (line 208) so trade events still trigger an immediate chart refresh

**Rename prop for clarity**
- Pass `snapshotKey` only for trade/manual triggers (already the case after removing the auto-snapshot bump)

## Technical Details

### PortfolioGrowthChart internal refresh logic

```text
On mount:
  1. Fetch snapshots, show skeleton
  2. Set allSnapshots, hide skeleton

Every 60s (internal timer):
  1. Fetch snapshots in background (no loading state)
  2. Compare: if last snapshot id/count unchanged, skip
  3. If user is hovering, stash in pendingData ref
  4. Otherwise, set allSnapshots (Recharts animates the transition)

On snapshotKey change (trade/manual only):
  1. Fetch snapshots immediately (no loading state)
  2. Apply data even if hovering (trade is high priority)
```

### Data comparison function

```typescript
const hasNewData = (current: SnapshotRow[], incoming: SnapshotRow[]): boolean => {
  if (current.length !== incoming.length) return true;
  if (current.length === 0) return false;
  const lastCurrent = current[current.length - 1];
  const lastIncoming = incoming[incoming.length - 1];
  return lastCurrent.id !== lastIncoming.id;
};
```

### Hover pause

```typescript
const isHoveringRef = useRef(false);
const pendingDataRef = useRef<SnapshotRow[] | null>(null);
const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// On mouse leave, apply pending data after 2s
const handleMouseLeave = () => {
  isHoveringRef.current = false;
  if (pendingDataRef.current) {
    hoverTimeoutRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        setAllSnapshots(pendingDataRef.current);
        pendingDataRef.current = null;
      }
    }, 2000);
  }
};
```

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/PortfolioGrowthChart.tsx` | Modify | Stale-while-revalidate, 60s internal timer, hover pause, data dedup, animation |
| `src/pages/PortfolioDetail.tsx` | Modify | Stop bumping snapshotKey on auto-snapshots (only trade/manual) |
