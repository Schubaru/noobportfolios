import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Portfolio, Holding, Transaction, ValueSnapshot, DividendPaymentRecord } from '@/lib/types';

export interface DbPortfolio {
  id: string;
  user_id: string;
  name: string;
  starting_cash: number;
  cash: number;
  is_example: boolean;
  created_by_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbHolding {
  id: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  shares: number;
  avg_cost: number;
  asset_class: string;
}

export interface DbTransaction {
  id: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  type: string;
  shares: number;
  price: number;
  total: number;
  executed_at: string;
}

export interface DbValueHistory {
  id: string;
  portfolio_id: string;
  value: number;
  recorded_at: string;
}

export interface DbDividendHistory {
  id: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  shares: number;
  dividend_per_share: number;
  total_amount: number;
  ex_date: string | null;
  pay_date: string | null;
  paid_at: string;
}

export const usePortfolios = () => {
  const { user, session } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  const transformPortfolio = (
    dbPortfolio: DbPortfolio,
    holdings: DbHolding[],
    transactions: DbTransaction[],
    valueHistory: DbValueHistory[],
    dividendHistory: DbDividendHistory[]
  ): Portfolio => {
    return {
      id: dbPortfolio.id,
      name: dbPortfolio.name,
      startingCash: Number(dbPortfolio.starting_cash),
      cash: Number(dbPortfolio.cash),
      isExample: dbPortfolio.is_example,
      holdings: holdings.map((h): Holding => ({
        symbol: h.symbol,
        name: h.name,
        shares: Number(h.shares),
        avgCost: Number(h.avg_cost),
        assetClass: h.asset_class as Holding['assetClass'],
      })),
      transactions: transactions.map((t): Transaction => ({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        type: t.type as 'buy' | 'sell',
        shares: Number(t.shares),
        price: Number(t.price),
        total: Number(t.total),
        timestamp: new Date(t.executed_at).getTime(),
      })),
      valueHistory: valueHistory.map((v): ValueSnapshot => ({
        timestamp: new Date(v.recorded_at).getTime(),
        value: Number(v.value),
      })),
      dividendHistory: dividendHistory.map((d): DividendPaymentRecord => ({
        id: d.id,
        symbol: d.symbol,
        name: d.name,
        shares: Number(d.shares),
        dividendPerShare: Number(d.dividend_per_share),
        totalAmount: Number(d.total_amount),
        exDate: d.ex_date || '',
        payDate: d.pay_date || '',
        paidAt: new Date(d.paid_at).getTime(),
      })),
      totalDividendsEarned: dividendHistory.reduce((sum, d) => sum + Number(d.total_amount), 0),
      createdAt: new Date(dbPortfolio.created_at).getTime(),
    };
  };

  const fetchPortfolios = useCallback(async () => {
    if (!user) {
      setPortfolios([]);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch portfolios
      const { data: dbPortfolios, error: portfoliosError } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (portfoliosError) throw portfoliosError;
      if (!dbPortfolios || dbPortfolios.length === 0) {
        setPortfolios([]);
        setIsLoading(false);
        return;
      }

      const portfolioIds = dbPortfolios.map(p => p.id);

      // Fetch all related data in parallel
      const [holdingsRes, transactionsRes, valueHistoryRes, dividendHistoryRes] = await Promise.all([
        supabase.from('holdings').select('*').in('portfolio_id', portfolioIds),
        supabase.from('transactions').select('*').in('portfolio_id', portfolioIds).order('executed_at', { ascending: false }),
        supabase.from('value_history').select('*').in('portfolio_id', portfolioIds).order('recorded_at', { ascending: true }),
        supabase.from('dividend_history').select('*').in('portfolio_id', portfolioIds).order('paid_at', { ascending: false }),
      ]);

      const holdings = (holdingsRes.data || []) as DbHolding[];
      const transactions = (transactionsRes.data || []) as DbTransaction[];
      const valueHistory = (valueHistoryRes.data || []) as DbValueHistory[];
      const dividendHistory = (dividendHistoryRes.data || []) as DbDividendHistory[];

      // Transform to Portfolio type
      const transformed = dbPortfolios.map(p => {
        const pHoldings = holdings.filter(h => h.portfolio_id === p.id);
        const pTransactions = transactions.filter(t => t.portfolio_id === p.id);
        const pValueHistory = valueHistory.filter(v => v.portfolio_id === p.id);
        const pDividendHistory = dividendHistory.filter(d => d.portfolio_id === p.id);
        return transformPortfolio(p, pHoldings, pTransactions, pValueHistory, pDividendHistory);
      });

      // Sort so example portfolio is first
      transformed.sort((a, b) => {
        if (a.isExample && !b.isExample) return -1;
        if (!a.isExample && b.isExample) return 1;
        return b.createdAt - a.createdAt;
      });

      setPortfolios(transformed);
    } catch (error) {
      console.error('Error fetching portfolios:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const initializeExamplePortfolio = useCallback(async () => {
    if (!session || isInitializing) return;
    
    setIsInitializing(true);
    
    try {
      const response = await supabase.functions.invoke('initialize-portfolio', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        console.error('Error initializing portfolio:', response.error);
      } else if (response.data?.initialized) {
        console.log('Portfolio initialized:', response.data);
        await fetchPortfolios();
      }
    } catch (error) {
      console.error('Error calling initialize-portfolio:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [session, isInitializing, fetchPortfolios]);

  const createPortfolio = async (name: string): Promise<Portfolio | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          name,
          starting_cash: 10000,
          cash: 10000,
        })
        .select()
        .single();

      if (error) throw error;

      // Create initial value history
      await supabase.from('value_history').insert({
        portfolio_id: data.id,
        value: 10000,
      });

      await fetchPortfolios();
      return portfolios.find(p => p.id === data.id) || null;
    } catch (error) {
      console.error('Error creating portfolio:', error);
      return null;
    }
  };

  const deletePortfolio = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchPortfolios();
      return true;
    } catch (error) {
      console.error('Error deleting portfolio:', error);
      return false;
    }
  };

  const regenerateExamplePortfolio = async (portfolioId: string): Promise<boolean> => {
    if (!session) return false;

    try {
      const response = await supabase.functions.invoke('regenerate-portfolio', {
        body: { portfolioId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        console.error('Error regenerating portfolio:', response.error);
        return false;
      }

      await fetchPortfolios();
      return true;
    } catch (error) {
      console.error('Error calling regenerate-portfolio:', error);
      return false;
    }
  };

  const getPortfolio = (id: string): Portfolio | undefined => {
    return portfolios.find(p => p.id === id);
  };

  useEffect(() => {
    if (user) {
      fetchPortfolios();
    } else {
      setPortfolios([]);
      setIsLoading(false);
    }
  }, [user, fetchPortfolios]);

  // Initialize example portfolio for new users
  useEffect(() => {
    if (!isLoading && user && portfolios.length === 0 && !isInitializing) {
      initializeExamplePortfolio();
    }
  }, [isLoading, user, portfolios.length, isInitializing, initializeExamplePortfolio]);

  return {
    portfolios,
    isLoading,
    isInitializing,
    fetchPortfolios,
    createPortfolio,
    deletePortfolio,
    getPortfolio,
    regenerateExamplePortfolio,
  };
};
