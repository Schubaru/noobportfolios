import { useState } from 'react';
import { X, Briefcase } from 'lucide-react';
import { createPortfolio } from '@/lib/storage';
import { Portfolio } from '@/lib/types';

interface CreatePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (portfolio: Portfolio) => void;
}

const CreatePortfolioModal = ({ isOpen, onClose, onCreated }: CreatePortfolioModalProps) => {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    
    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const portfolio = createPortfolio(name.trim());
    setName('');
    setIsCreating(false);
    onCreated(portfolio);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md glass-card p-6 slide-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Create Portfolio</h2>
            <p className="text-sm text-muted-foreground">Start with $10,000 virtual cash</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Portfolio Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tech Growth, Dividend Income"
              className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              autoFocus
            />
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Starting Cash</span>
              <span className="font-bold text-primary">$10,000.00</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this virtual money to build and test your investment strategies.
            </p>
          </div>

          <button
            type="submit"
            disabled={!name.trim() || isCreating}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Portfolio'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreatePortfolioModal;
