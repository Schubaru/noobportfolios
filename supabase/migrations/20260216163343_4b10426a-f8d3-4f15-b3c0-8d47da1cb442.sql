
-- Shared server-side quote cache for Alpaca snapshots
CREATE TABLE public.symbol_quote_cache (
  symbol TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  prev_close NUMERIC,
  day_high NUMERIC,
  day_low NUMERIC,
  day_open NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS - public market data accessed only by edge functions via service role
ALTER TABLE public.symbol_quote_cache ENABLE ROW LEVEL SECURITY;

-- Allow edge functions (service role) full access, no anon access needed
-- Service role bypasses RLS, so no policies needed
