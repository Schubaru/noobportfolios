
-- 1A) Extend value_history with new columns
ALTER TABLE public.value_history
  ADD COLUMN IF NOT EXISTS cash_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_reference_value numeric,
  ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS quote_coverage numeric,
  ADD COLUMN IF NOT EXISTS quote_time_spread_seconds integer;

-- 1B) Create symbol_last_quotes table
CREATE TABLE IF NOT EXISTS public.symbol_last_quotes (
  symbol text PRIMARY KEY,
  price numeric NOT NULL,
  prev_close numeric,
  quote_time timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Disable RLS on symbol_last_quotes (only edge functions with service role access it)
ALTER TABLE public.symbol_last_quotes DISABLE ROW LEVEL SECURITY;

-- 1C) Add index on value_history for efficient lookups
CREATE INDEX IF NOT EXISTS idx_value_history_portfolio_recorded
  ON public.value_history (portfolio_id, recorded_at DESC);
