import { useState, useEffect, useCallback } from 'react';
import { Briefcase, TrendingUp, Sparkles } from 'lucide-react';
import Header from '@/components/Header';
import Disclaimer from '@/components/Disclaimer';
import PortfolioCard from '@/components/PortfolioCard';
import CreatePortfolioModal from '@/components/CreatePortfolioModal';
import { loadPortfolios } from '@/lib/storage';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { Portfolio, PortfolioMetrics } from '@/lib/types';

const Index = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    const data = loadPortfolios();
    setPortfolios(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePortfolioCreated = () => {
    loadData();
  };

  const getMetrics = (portfolio: Portfolio): PortfolioMetrics => {
    return calculatePortfolioMetrics(portfolio);
  };

  const totalValue = portfolios.reduce((sum, p) => {
    const metrics = getMetrics(p);
    return sum + metrics.totalValue;
  }, 0);

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateClick={() => setIsCreateModalOpen(true)} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-foreground" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                N00B Portfolios™
              </h1>
              <p className="text-muted-foreground">
                Practice trading with $10,000 virtual cash per portfolio
              </p>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        {portfolios.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Portfolios</p>
              <p className="text-2xl font-bold text-foreground">{portfolios.length}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Combined Value</p>
              <p className="text-2xl font-bold">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Starting Capital</p>
              <p className="text-2xl font-bold text-muted-foreground">
                ${(portfolios.length * 10000).toLocaleString()}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Combined P/L</p>
              <p className={`text-2xl font-bold ${totalValue >= portfolios.length * 10000 ? 'text-success' : 'text-destructive'}`}>
                {totalValue >= portfolios.length * 10000 ? '+' : ''}
                ${(totalValue - portfolios.length * 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Portfolios Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-5 animate-pulse">
                <div className="h-6 bg-muted rounded w-1/2 mb-4" />
                <div className="h-8 bg-muted rounded w-3/4 mb-4" />
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-12 bg-muted rounded" />
                  <div className="h-12 bg-muted rounded" />
                  <div className="h-12 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : portfolios.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {portfolios.map((portfolio, index) => (
              <div 
                key={portfolio.id} 
                className="fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <PortfolioCard 
                  portfolio={portfolio} 
                  metrics={getMetrics(portfolio)} 
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-secondary mx-auto mb-6 flex items-center justify-center">
              <Briefcase className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No portfolios yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first portfolio to start practicing with virtual money. 
              Each portfolio comes with $10,000 to invest.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105"
            >
              <Sparkles className="w-5 h-5" />
              Create Your First Portfolio
            </button>
          </div>
        )}

        {/* Example Portfolio Hint */}
        {portfolios.length === 1 && portfolios[0].isExample && (
          <div className="mt-8 p-6 glass-card">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Explore the Example Portfolio</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  We've created an example portfolio to show you how everything works. 
                  Click on it to see holdings, performance charts, and try making trades!
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-sm text-foreground hover:underline font-medium"
                >
                  Or create your own portfolio →
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handlePortfolioCreated}
      />
      
      <Disclaimer />
    </div>
  );
};

export default Index;
