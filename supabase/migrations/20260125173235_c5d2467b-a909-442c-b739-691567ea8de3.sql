-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Create portfolios table
CREATE TABLE public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  starting_cash NUMERIC NOT NULL DEFAULT 10000,
  cash NUMERIC NOT NULL DEFAULT 10000,
  is_example BOOLEAN NOT NULL DEFAULT false,
  created_by_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own portfolios"
ON public.portfolios FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own portfolios"
ON public.portfolios FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own portfolios"
ON public.portfolios FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own portfolios"
ON public.portfolios FOR DELETE
USING (auth.uid() = user_id);

-- Create holdings table
CREATE TABLE public.holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  avg_cost NUMERIC NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'stock',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id, symbol)
);

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view holdings of their portfolios"
ON public.holdings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = holdings.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create holdings in their portfolios"
ON public.holdings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = holdings.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update holdings in their portfolios"
ON public.holdings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = holdings.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete holdings from their portfolios"
ON public.holdings FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = holdings.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  shares NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transactions of their portfolios"
ON public.transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = transactions.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create transactions in their portfolios"
ON public.transactions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = transactions.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

-- Create value_history table for portfolio snapshots
CREATE TABLE public.value_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  value NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.value_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view value history of their portfolios"
ON public.value_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = value_history.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create value history for their portfolios"
ON public.value_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = value_history.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

-- Create daily_picks cache table (public read, service role write)
CREATE TABLE public.daily_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_date DATE NOT NULL UNIQUE,
  tickers JSONB NOT NULL,
  scoring_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;

-- Anyone can read daily picks (for the initialization function)
CREATE POLICY "Anyone can read daily picks"
ON public.daily_picks FOR SELECT
USING (true);

-- Create dividend_history table
CREATE TABLE public.dividend_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  dividend_per_share NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  ex_date DATE,
  pay_date DATE,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dividend_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dividend history of their portfolios"
ON public.dividend_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = dividend_history.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create dividend history for their portfolios"
ON public.dividend_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = dividend_history.portfolio_id
    AND portfolios.user_id = auth.uid()
  )
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_portfolios_updated_at
BEFORE UPDATE ON public.portfolios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_holdings_updated_at
BEFORE UPDATE ON public.holdings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();