-- Add realized_pl column to transactions table for tracking profit/loss on sell transactions
ALTER TABLE transactions 
ADD COLUMN realized_pl numeric DEFAULT NULL;

COMMENT ON COLUMN transactions.realized_pl IS 
'Profit/loss realized on SELL transactions: (sell_price - avg_cost_at_time) * shares';

-- Create income table for tracking dividends, interest, and fees (future-proofing)
CREATE TABLE income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol text,
  type text NOT NULL CHECK (type IN ('DIVIDEND', 'INTEREST', 'FEE')),
  amount numeric NOT NULL,
  posted_at timestamp with time zone DEFAULT now(),
  description text
);

-- Enable Row Level Security
ALTER TABLE income ENABLE ROW LEVEL SECURITY;

-- RLS policies for income table
CREATE POLICY "Users can view income of their portfolios" ON income
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = income.portfolio_id AND portfolios.user_id = auth.uid())
  );

CREATE POLICY "Users can insert income for their portfolios" ON income
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = income.portfolio_id AND portfolios.user_id = auth.uid())
  );