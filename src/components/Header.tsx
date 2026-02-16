import { Link } from 'react-router-dom';
import { Plus, LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from
'@/components/ui/dropdown-menu';
import noobLogo from '@/assets/noobportlogo.png';

interface HeaderProps {
  onCreateClick?: () => void;
  showCreate?: boolean;
}

const Header = ({ onCreateClick, showCreate = true }: HeaderProps) => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <img src={noobLogo} alt="N00B Portfolios" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="text-lg font-bold tracking-tight font-mono">
              N00B <span className="text-primary">Portfolios</span>
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">Paper Trading</p>
          </div>
        </Link>
        
        <div className="flex items-center gap-3">
          {showCreate && onCreateClick &&
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all hover:scale-105 active:scale-95">

              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Portfolio</span>
            </button>
          }

          {user &&
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        </div>
      </div>
    </header>);

};

export default Header;