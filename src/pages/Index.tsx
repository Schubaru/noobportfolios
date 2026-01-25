import { useState } from 'react';
import { Briefcase, Sparkles, Loader2, Info } from 'lucide-react';
import Header from '@/components/Header';
import Disclaimer from '@/components/Disclaimer';
import PortfolioCard from '@/components/PortfolioCard';
import CreatePortfolioModal from '@/components/CreatePortfolioModal';
import RegeneratePortfolioModal from '@/components/RegeneratePortfolioModal';
import { usePortfolios } from '@/hooks/usePortfolios';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { Portfolio, PortfolioMetrics } from '@/lib/types';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Index = () => {
  const { 
    portfolios, 
    isLoading, 
    isInitializing, 
    createPortfolio: createNewPortfolio, 
    regenerateExamplePortfolio,
    fetchPortfolios,
  } = usePortfolios();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [regeneratePortfolio, setRegeneratePortfolio] = useState<Portfolio | null>(null);

  const handlePortfolioCreated = async (name: string) => {
    const portfolio = await createNewPortfolio(name);
    if (portfolio) {
      toast.success(`Portfolio "${name}" created!`);
    } else {
      toast.error('Failed to create portfolio');
    }
    setIsCreateModalOpen(false);
  };

  const handleRegenerate = async () => {
    if (!regeneratePortfolio) return;
    
    const success = await regenerateExamplePortfolio(regeneratePortfolio.id);
    if (success) {
      toast.success('Portfolio regenerated with today\'s top picks!');
    } else {
      toast.error('Failed to regenerate portfolio');
    }
  };

  const getMetrics = (portfolio: Portfolio): PortfolioMetrics => {
    return calculatePortfolioMetrics(portfolio);
  };

  const totalValue = portfolios.reduce((sum, p) => {
    const metrics = getMetrics(p);
    return sum + metrics.totalValue;
  }, 0);

  const examplePortfolio = portfolios.find(p => p.isExample);

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateClick={() => setIsCreateModalOpen(true)} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              My portfolios
            </h1>
            <p className="text-muted-foreground">
              Practice trading with $10,000 virtual cash per portfolio
            </p>
          </div>
        </div>

        {/* Loading / Initializing State */}
        {(isLoading || isInitializing) && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {isInitializing ? 'Creating your example portfolio with today\'s top picks...' : 'Loading portfolios...'}
            </p>
          </div>
        )}

        {/* Stats Overview */}
        {!isLoading && !isInitializing && portfolios.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Portfolios</p>
              <p className="text-2xl font-bold text-foreground">{portfolios.length}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Value</p>
              <p className="text-2xl font-bold">
                ${totalValue.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </p>
            </div>
          </div>
        )}

        {/* Example Portfolio Note */}
        {!isLoading && !isInitializing && examplePortfolio && (
          <Alert className="mb-6 bg-muted/50 border-muted">
            <Info className="h-4 w-4" />
            <AlertDescription>
              We auto-built your example portfolio using today's market leaders. You can edit or delete it anytime, or click the refresh icon to regenerate with fresh picks.
            </AlertDescription>
          </Alert>
        )}

        {/* Portfolios Grid */}
        {!isLoading && !isInitializing && portfolios.length > 0 && (
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
                  onRegenerate={portfolio.isExample ? () => setRegeneratePortfolio(portfolio) : undefined}
                />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isInitializing && portfolios.length === 0 && (
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
      </main>

      <CreatePortfolioModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onCreated={handlePortfolioCreated} 
      />

      <RegeneratePortfolioModal
        isOpen={!!regeneratePortfolio}
        onClose={() => setRegeneratePortfolio(null)}
        onConfirm={handleRegenerate}
        portfolioName={regeneratePortfolio?.name || ''}
      />
      
      <Disclaimer />
    </div>
  );
};

export default Index;
