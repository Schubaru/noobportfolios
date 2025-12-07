import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, TrendingUp } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl bg-secondary mx-auto mb-6 flex items-center justify-center">
          <TrendingUp className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-6xl font-bold text-gradient mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">
          This page doesn't exist in your portfolio
        </p>
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105"
        >
          <Home className="w-5 h-5" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
