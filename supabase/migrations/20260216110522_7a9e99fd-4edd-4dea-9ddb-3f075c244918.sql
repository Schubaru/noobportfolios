
-- 1. holdings_history: tracks every change to every holding over time
CREATE TABLE public.holdings_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  avg_cost NUMERIC NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ
);

CREATE INDEX idx_holdings_history_lookup ON public.holdings_history (portfolio_id, effective_from, effective_to);
CREATE INDEX idx_holdings_history_symbol ON public.holdings_history (portfolio_id, symbol, effective_from);

ALTER TABLE public.holdings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their holdings history"
  ON public.holdings_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings_history.portfolio_id AND portfolios.user_id = auth.uid()));

CREATE POLICY "Users can insert their holdings history"
  ON public.holdings_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings_history.portfolio_id AND portfolios.user_id = auth.uid()));

CREATE POLICY "Users can update their holdings history"
  ON public.holdings_history FOR UPDATE
  USING (EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings_history.portfolio_id AND portfolios.user_id = auth.uid()));

-- 2. cash_history: tracks every change to cash balance over time
CREATE TABLE public.cash_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ
);

CREATE INDEX idx_cash_history_lookup ON public.cash_history (portfolio_id, effective_from, effective_to);

ALTER TABLE public.cash_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their cash history"
  ON public.cash_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = cash_history.portfolio_id AND portfolios.user_id = auth.uid()));

CREATE POLICY "Users can insert their cash history"
  ON public.cash_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = cash_history.portfolio_id AND portfolios.user_id = auth.uid()));

CREATE POLICY "Users can update their cash history"
  ON public.cash_history FOR UPDATE
  USING (EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = cash_history.portfolio_id AND portfolios.user_id = auth.uid()));

-- 3. symbol_daily_prices: persistent daily close cache
CREATE TABLE public.symbol_daily_prices (
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  close_price NUMERIC NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, date)
);

-- No RLS - public read, service-role write
ALTER TABLE public.symbol_daily_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read daily prices"
  ON public.symbol_daily_prices FOR SELECT
  USING (true);

-- 4. Backfill holdings_history from transactions (reconstruct historical states)
-- For each portfolio, replay transactions in order to build holdings_history and cash_history

-- First, seed cash_history from current portfolios (initial state)
INSERT INTO public.cash_history (portfolio_id, amount, effective_from)
SELECT id, starting_cash, created_at
FROM public.portfolios;

-- Seed current holdings as the latest state (effective_from = created_at of holding)
INSERT INTO public.holdings_history (portfolio_id, symbol, shares, avg_cost, effective_from)
SELECT portfolio_id, symbol, shares, avg_cost, created_at
FROM public.holdings;
