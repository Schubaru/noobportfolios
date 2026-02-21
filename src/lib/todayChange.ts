export interface TodayChangeResult {
  delta: number | null;
  percent: number | null;
  baseline: number | null;
}

function validPositive(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Compute "Today" change using a strict baseline priority:
 *   1. dayReferenceValue (from value_history.day_reference_value)
 *   2. earliestTodaySnapshot (earliest value_history.value recorded today)
 *   3. null (show "—")
 *
 * No previousClose fallback. No cost-basis derivation.
 */
export function computeTodayChange(
  currentValue: number | null | undefined,
  dayReferenceValue: number | null | undefined,
  earliestTodaySnapshot?: number | null
): TodayChangeResult {
  const baseline =
    validPositive(dayReferenceValue) ??
    validPositive(earliestTodaySnapshot) ??
    null;

  const cv = validPositive(currentValue);

  if (baseline === null || cv === null) {
    return { delta: null, percent: null, baseline };
  }

  const delta = cv - baseline;
  const percent = baseline > 0 ? (delta / baseline) * 100 : null;
  return { delta, percent, baseline };
}
