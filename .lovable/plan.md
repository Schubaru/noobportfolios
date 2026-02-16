

# Update Range Button Hover State

## Change

In `src/components/PerformanceSummary.tsx`, add custom Tailwind classes to the inactive (ghost) range buttons so hover shows:
- Text: electric blue (`hover:text-primary`)
- Background: low-opacity electric blue (`hover:bg-primary/10`)

The active button (variant `default`) keeps its current solid primary styling unchanged.

## Technical Detail

On line 68-76, for the ghost-variant buttons, override the default ghost hover with custom classes:

```tsx
<Button
  key={range}
  variant={selectedRange === range ? 'default' : 'ghost'}
  size="sm"
  className={cn(
    "h-7 px-2 text-xs",
    selectedRange !== range && "hover:bg-primary/10 hover:text-primary"
  )}
  onClick={() => onRangeChange(range)}
>
  {range}
</Button>
```

## Files Modified

1. `src/components/PerformanceSummary.tsx` -- add conditional hover classes to inactive range buttons

