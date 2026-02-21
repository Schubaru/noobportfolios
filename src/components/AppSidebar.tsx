import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Search, TrendingUp, TrendingDown, User, Settings, CreditCard, LogOut } from 'lucide-react';
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

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

  const [profileOpen, setProfileOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const startCloseTimer = () => {
    clearHoverTimeout();
    hoverTimeoutRef.current = setTimeout(() => setProfileOpen(false), 150);
  };

  const handleTriggerEnter = () => {
    if (isMobile) return;
    clearHoverTimeout();
    setProfileOpen(true);
  };

  const handleTriggerLeave = () => {
    if (isMobile) return;
    startCloseTimer();
  };

  const handleContentEnter = () => {
    if (isMobile) return;
    clearHoverTimeout();
  };

  const handleContentLeave = () => {
    if (isMobile) return;
    startCloseTimer();
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    await signOut();
    navigate('/');
  };

  // Close on route change
  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearHoverTimeout();
  }, []);

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="p-4">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-4">
          <img src={noobLogo} alt="N00B Portfolios" className="w-9 h-9 rounded-xl" />
          <div>
            <h1 className="text-base font-bold tracking-tight font-mono leading-tight">
              N00B <span className="text-primary">Portfolios</span>
            </h1>
            <p className="text-[10px] text-muted-foreground">Paper trading</p>
          </div>
        </div>

        {/* New portfolio */}
        <div
          onClick={onCreateClick}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-muted-foreground text-sm cursor-pointer hover:bg-white/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New portfolio
        </div>

        {/* Search placeholder */}
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
                const equityNow = metrics?.totalValue ?? null;
                const baseline = getTodayBaseline(portfolio.id);
                const hasTodayData = equityNow !== null && baseline !== null && baseline > 0;
                const todayDelta = hasTodayData ? equityNow! - baseline! : null;
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
          <SidebarMenuItem>
            <Popover open={profileOpen} onOpenChange={setProfileOpen}>
              <PopoverTrigger asChild>
                <div
                  className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                  onMouseEnter={handleTriggerEnter}
                  onMouseLeave={handleTriggerLeave}
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </div>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="end"
                className="w-56 p-2"
                onMouseEnter={handleContentEnter}
                onMouseLeave={handleContentLeave}
              >
                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate select-none">
                  {user?.email ?? 'Not signed in'}
                </div>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-2 py-1.5 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <CreditCard className="w-4 h-4 mr-2" />
              Membership
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
