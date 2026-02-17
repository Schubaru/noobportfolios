import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Sparkles, Briefcase } from 'lucide-react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import CreatePortfolioModal from '@/components/CreatePortfolioModal';
import Disclaimer from '@/components/Disclaimer';
import { usePortfolios } from '@/hooks/usePortfolios';
import { usePortfolioQuotes } from '@/hooks/usePortfolioQuotes';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { toast } from 'sonner';

const AppLayout = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    portfolios,
    isLoading,
    isInitializing,
    createPortfolio: createNewPortfolio,
  } = usePortfolios();
  const { getMetrics: getLiveMetrics } = usePortfolioQuotes(portfolios);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  // Redirect to first portfolio if on bare /portfolio route or no id
  useEffect(() => {
    if (!isLoading && !isInitializing && portfolios.length > 0 && !id && !hasRedirected) {
      navigate(`/portfolio/${portfolios[0].id}`, { replace: true });
      setHasRedirected(true);
    }
  }, [isLoading, isInitializing, portfolios, id, navigate, hasRedirected]);

  const getMetrics = (portfolioId: string) => {
    const live = getLiveMetrics(portfolioId);
    if (live) return live;
    const p = portfolios.find(p => p.id === portfolioId);
    if (p) return calculatePortfolioMetrics(p);
    return undefined;
  };

  const handlePortfolioCreated = async (name: string) => {
    const portfolio = await createNewPortfolio(name);
    if (portfolio) {
      toast.success(`Portfolio "${name}" created!`);
      navigate(`/portfolio/${portfolio.id}`);
    } else {
      toast.error('Failed to create portfolio');
    }
    setIsCreateModalOpen(false);
  };

  // Loading state
  if (isLoading || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {isInitializing ? "Creating your example portfolio with today's top picks..." : 'Loading portfolios...'}
          </p>
        </div>
      </div>
    );
  }

  // Empty state — no portfolios
  if (portfolios.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <div className="w-20 h-20 rounded-3xl bg-secondary mx-auto mb-6 flex items-center justify-center">
            <Briefcase className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">No portfolios yet</h2>
          <p className="text-muted-foreground mb-6">
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
          <CreatePortfolioModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreated={handlePortfolioCreated}
          />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar
          portfolios={portfolios}
          getMetrics={getMetrics}
          onCreateClick={() => setIsCreateModalOpen(true)}
        />
        <main className="flex-1 overflow-auto">
          {/* Mobile trigger */}
          <div className="md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border p-2">
            <SidebarTrigger />
          </div>
          <Outlet />
        </main>
      </div>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handlePortfolioCreated}
      />
      <Disclaimer />
    </SidebarProvider>
  );
};

export default AppLayout;
