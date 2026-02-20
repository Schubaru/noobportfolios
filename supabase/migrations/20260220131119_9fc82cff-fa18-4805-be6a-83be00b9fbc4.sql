
DO $$
DECLARE
  tx RECORD;
  prev_cash NUMERIC;
  cur_portfolio UUID := NULL;
  row_to_close UUID;
BEGIN
  FOR tx IN
    SELECT t.portfolio_id, t.type, t.total, t.executed_at
    FROM transactions t
    WHERE t.portfolio_id IN (
      SELECT portfolio_id FROM cash_history
      GROUP BY portfolio_id HAVING COUNT(*) = 1
    )
    AND t.type IN ('buy', 'sell')
    ORDER BY t.portfolio_id, t.executed_at ASC
  LOOP
    IF cur_portfolio IS DISTINCT FROM tx.portfolio_id THEN
      cur_portfolio := tx.portfolio_id;
      SELECT amount INTO prev_cash
        FROM cash_history
        WHERE portfolio_id = cur_portfolio
          AND effective_to IS NULL
        ORDER BY effective_from DESC LIMIT 1;
      IF prev_cash IS NULL THEN
        SELECT starting_cash INTO prev_cash FROM portfolios WHERE id = cur_portfolio;
      END IF;
    END IF;

    IF tx.type = 'buy' THEN
      prev_cash := prev_cash - tx.total;
    ELSE
      prev_cash := prev_cash + tx.total;
    END IF;

    -- Close latest open row by id
    SELECT id INTO row_to_close
      FROM cash_history
      WHERE portfolio_id = cur_portfolio AND effective_to IS NULL
      ORDER BY effective_from DESC LIMIT 1;

    IF row_to_close IS NOT NULL THEN
      UPDATE cash_history SET effective_to = tx.executed_at
        WHERE id = row_to_close;
    END IF;

    INSERT INTO cash_history (portfolio_id, amount, effective_from)
      VALUES (cur_portfolio, prev_cash, tx.executed_at);
  END LOOP;
END $$;
