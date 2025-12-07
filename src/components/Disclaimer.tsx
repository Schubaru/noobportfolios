import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const DISCLAIMER_KEY = 'noob_disclaimer_dismissed';

const Disclaimer = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(DISCLAIMER_KEY);
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(DISCLAIMER_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-secondary/95 backdrop-blur-lg border-t border-border">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-medium">N00B Portfolios</span> uses virtual money only. 
          This is a practice platform and does not execute real trades or provide financial advice.
        </p>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Disclaimer;
