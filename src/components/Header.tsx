import { Link } from 'react-router-dom';
import { TrendingUp, Plus } from 'lucide-react';

interface HeaderProps {
  onCreateClick?: () => void;
  showCreate?: boolean;
}

const Header = ({ onCreateClick, showCreate = true }: HeaderProps) => {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              N00B <span className="text-primary">Portfolios</span>
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">Paper Trading</p>
          </div>
        </Link>
        
        {showCreate && onCreateClick && (
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Portfolio</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
