-- Add invested_value column to track holdings-only value
ALTER TABLE value_history
ADD COLUMN IF NOT EXISTS invested_value numeric;

-- Add source column to track snapshot origin
ALTER TABLE value_history
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Add index for efficient time-range queries
CREATE INDEX IF NOT EXISTS idx_value_history_portfolio_recorded 
ON value_history (portfolio_id, recorded_at DESC);