
-- Drop existing FKs (if any) and re-add with ON DELETE CASCADE
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_portfolio_id_fkey;
ALTER TABLE holdings ADD CONSTRAINT holdings_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE holdings_history DROP CONSTRAINT IF EXISTS holdings_history_portfolio_id_fkey;
ALTER TABLE holdings_history ADD CONSTRAINT holdings_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE cash_history DROP CONSTRAINT IF EXISTS cash_history_portfolio_id_fkey;
ALTER TABLE cash_history ADD CONSTRAINT cash_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_portfolio_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE value_history DROP CONSTRAINT IF EXISTS value_history_portfolio_id_fkey;
ALTER TABLE value_history ADD CONSTRAINT value_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE income DROP CONSTRAINT IF EXISTS income_portfolio_id_fkey;
ALTER TABLE income ADD CONSTRAINT income_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE dividend_history DROP CONSTRAINT IF EXISTS dividend_history_portfolio_id_fkey;
ALTER TABLE dividend_history ADD CONSTRAINT dividend_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;
