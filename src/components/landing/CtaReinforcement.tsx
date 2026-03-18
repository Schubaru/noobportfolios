interface CtaReinforcementProps {
  onCtaClick: () => void;
}

const CtaReinforcement = ({ onCtaClick }: CtaReinforcementProps) => (
  <section className="w-full max-w-3xl mb-16 text-center">
    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
      Start Building Smarter Portfolios Today
    </h2>
    <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto mb-6">
      Pick a strategy, track your progress, and learn how the market really works.
    </p>
    <button
      onClick={onCtaClick}
      className="h-11 px-8 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
    >
      Get Started — It's Free
    </button>
    <p className="text-muted-foreground/60 text-xs mt-3">
      No risk. No pressure.
    </p>
  </section>
);

export default CtaReinforcement;
