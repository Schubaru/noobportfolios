import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, TrendingUp, TrendingDown, User, Settings, CreditCard } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  portfolios: Portfolio[];
  getMetrics: (portfolioId: string) => PortfolioMetrics | undefined;
  onCreateClick: () => void;
}

const AppSidebar = ({ portfolios, getMetrics, onCreateClick }: AppSidebarProps) => {
  const navigate = useNavigate();
  const { id: activeId } = useParams<{ id: string }>();

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border">
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

        {/* New portfolio button */}
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New portfolio
        </button>

        {/* Search placeholder */}
        <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground text-sm mt-2 hover:bg-secondary transition-colors">
          <Search className="w-4 h-4" />
          Search assets
        </button>
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
                const unrealizedPL = metrics?.unrealizedPL ?? 0;
                const isActive = activeId === portfolio.id;
                const isPositive = unrealizedPL >= 0;

                return (
                  <SidebarMenuItem key={portfolio.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => navigate(`/portfolio/${portfolio.id}`)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors cursor-pointer",
                        isActive && "bg-secondary border border-border/80"
                      )}
                    >
                      <span className="truncate text-sm font-medium">{portfolio.name}</span>
                      <span className={cn(
                        "text-xs font-medium flex items-center gap-0.5 shrink-0 ml-2",
                        isPositive ? "text-success" : "text-destructive"
                      )}>
                        {isPositive
                          ? <TrendingUp className="w-3 h-3" />
                          : <TrendingDown className="w-3 h-3" />
                        }
                        {isPositive ? '+' : ''}{formatCurrency(unrealizedPL)}
                      </span>
                    </SidebarMenuButton>
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
            <SidebarMenuButton className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <User className="w-4 h-4 mr-2" />
              Profile
            </SidebarMenuButton>
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
