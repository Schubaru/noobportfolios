import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Search, TrendingUp, TrendingDown, Settings, LogOut, Trash2, Loader2 } from 'lucide-react';
import noobLogo from '@/assets/noobportlogo.png';
import { Portfolio, PortfolioMetrics } from '@/lib/types';
import { formatCurrency } from '@/lib/portfolio';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { computeTodayChange } from '@/lib/todayChange';

interface AppSidebarProps {
  portfolios: Portfolio[];
  getMetrics: (portfolioId: string) => PortfolioMetrics | undefined;
  getTodayBaseline: (portfolioId: string) => number | null;
  onCreateClick: () => void;
  onSearchClick: () => void;
}

const AppSidebar = ({ portfolios, getMetrics, getTodayBaseline, onCreateClick, onSearchClick }: AppSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: activeId } = useParams<{ id: string }>();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const settingsHoverRef = useRef<NodeJS.Timeout | null>(null);

  // --- Settings hover helpers ---
  const clearSettingsHover = () => {
    if (settingsHoverRef.current) {
      clearTimeout(settingsHoverRef.current);
      settingsHoverRef.current = null;
    }
  };
  const startSettingsClose = () => {
    clearSettingsHover();
    settingsHoverRef.current = setTimeout(() => setSettingsOpen(false), 150);
  };
  const handleSettingsTriggerEnter = () => { if (isMobile) return; clearSettingsHover(); setSettingsOpen(true); };
  const handleSettingsTriggerLeave = () => { if (isMobile) return; startSettingsClose(); };
  const handleSettingsContentEnter = () => { if (isMobile) return; clearSettingsHover(); };
  const handleSettingsContentLeave = () => { if (isMobile) return; startSettingsClose(); };

  const handleLogout = async () => {
    setSettingsOpen(false);
    await signOut();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      setDeleteDialogOpen(false);
      setSettingsOpen(false);
      await signOut();
      navigate('/');
    } catch (err: any) {
      console.error('Delete account error:', err);
      toast.error('Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Close popover on route change
  useEffect(() => {
    setSettingsOpen(false);
  }, [location.pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { clearSettingsHover(); };
  }, []);
  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <img src={noobLogo} alt="N00B Portfolios" className="w-9 h-9 rounded-xl" />
          <div>
            <h1 className="text-base font-bold tracking-tight font-mono leading-tight">
              N00B <span className="text-primary">Portfolios</span>
            </h1>
            <p className="text-[10px] text-muted-foreground">Paper trading</p>
          </div>
        </div>

        <div
          onClick={onCreateClick}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-muted-foreground text-sm cursor-pointer hover:bg-white/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New portfolio
        </div>

        <div
          onClick={onSearchClick}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-muted-foreground text-sm cursor-pointer hover:bg-white/5 transition-colors"
        >
          <Search className="w-4 h-4" />
          Search assets
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground px-4">
            Your portfolios
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {portfolios.map((portfolio) => {
                const metrics = getMetrics(portfolio.id);
                const today = computeTodayChange(metrics?.totalValue ?? null, getTodayBaseline(portfolio.id));
                console.log('[Sidebar]', portfolio.name, 'equityNow:', metrics?.totalValue ?? null, 'todayBaseline:', getTodayBaseline(portfolio.id), 'delta:', today.delta);
                const todayDelta = today.delta;
                const hasTodayData = todayDelta !== null;
                const isActive = activeId === portfolio.id;
                const isPositive = todayDelta !== null ? todayDelta >= 0 : true;

                return (
                  <SidebarMenuItem key={portfolio.id}>
                    <div
                      onClick={() => navigate(`/portfolio/${portfolio.id}`)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors cursor-pointer",
                        isActive
                          ? "bg-secondary text-secondary-foreground font-semibold"
                          : "hover:bg-white/5"
                      )}
                    >
                      <span className="truncate text-sm font-medium">{portfolio.name}</span>
                      {hasTodayData && todayDelta !== null ? (
                        <span className={cn(
                          "text-xs font-medium flex items-center gap-0.5 shrink-0 ml-2",
                          isPositive ? "text-success" : "text-destructive"
                        )}>
                          {isPositive
                            ? <TrendingUp className="w-3 h-3" />
                            : <TrendingDown className="w-3 h-3" />
                          }
                          {isPositive ? '+' : ''}{formatCurrency(todayDelta)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">—</span>
                      )}
                    </div>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarSeparator />
        <SidebarMenu>
          {/* Settings popover */}
          <SidebarMenuItem>
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <div
                  className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                  onMouseEnter={handleSettingsTriggerEnter}
                  onMouseLeave={handleSettingsTriggerLeave}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </div>
              </PopoverTrigger>
              <PopoverContent
                side={isMobile ? "top" : "right"}
                align="end"
                className="w-56 p-2"
                onMouseEnter={handleSettingsContentEnter}
                onMouseLeave={handleSettingsContentLeave}
              >
                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate select-none">
                  {user?.email ?? 'Not signed in'}
                </div>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent/10 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </button>
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setDeleteDialogOpen(true);
                  }}
                  className="flex items-center w-full px-2 py-1.5 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete account
                </button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure you want to delete your account?</DialogTitle>
            <DialogDescription>
              Deleting your account will erase all of your portfolio history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
};

export default AppSidebar;
