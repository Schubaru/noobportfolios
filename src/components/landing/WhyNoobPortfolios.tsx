import { ShieldCheck, TrendingUp, Layers, Sparkles } from 'lucide-react';

const rows = [
  {
    icon: ShieldCheck,
    title: 'Start Without Risk',
    desc: "Practice investing with real market data without putting your own money on the line.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-6 flex flex-col items-center justify-center text-center">
        <span className="text-3xl sm:text-4xl font-bold text-foreground mb-1">$0</span>
        <span className="text-xs text-muted-foreground">real money at risk</span>
        <div className="mt-3 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
          100% practice money
        </div>
      </div>
    ),
  },
  {
    icon: TrendingUp,
    title: 'Build Real Confidence',
    desc: "Learn how portfolios actually perform so you can make smarter decisions when it counts.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-6 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-muted-foreground mb-2">Simulated Return</span>
        <span className="text-3xl sm:text-4xl font-bold text-success">+18.3%</span>
        <span className="text-xs text-muted-foreground mt-1">over 6 months</span>
      </div>
    ),
  },
  {
    icon: Layers,
    title: 'Stop Guessing',
    desc: "Use structured portfolios instead of random trades to understand how investing really works.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-5 space-y-2.5">
        {[
          { label: 'Tech Growth', pct: 45, color: 'bg-primary' },
          { label: 'Dividend', pct: 30, color: 'bg-success' },
          { label: 'Bonds', pct: 25, color: 'bg-muted-foreground' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-sm text-foreground flex-1">{s.label}</span>
            <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className={`h-full rounded-full ${s.color}/70`} style={{ width: `${s.pct}%` }} />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">{s.pct}%</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: 'Keep It Simple',
    desc: "No noise, no jargon. Just clear signals and performance you can understand.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Total Value</span>
          <span className="text-sm font-semibold text-foreground">$11,240</span>
        </div>
        <div className="h-px bg-border/50" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Today</span>
          <span className="text-sm font-medium text-success">+$84.20</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">All Time</span>
          <span className="text-sm font-medium text-success">+$1,240</span>
        </div>
      </div>
    ),
  },
];

const WhyNoobPortfolios = () => (
  <section className="w-full max-w-5xl mb-20">
    <div className="text-center mb-14">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
        Why N00B Portfolios
      </h2>
    </div>

    <div className="space-y-16 sm:space-y-20">
      {rows.map(({ icon: Icon, title, desc, visual }, i) => {
        const reversed = i % 2 === 1;
        return (
          <div
            key={title}
            className={`flex flex-col ${reversed ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8 md:gap-14`}
          >
            {/* Text */}
            <div className="flex-1 text-center md:text-left">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-sm mx-auto md:mx-0">
                {desc}
              </p>
            </div>

            {/* Visual */}
            <div className="flex-1 w-full max-w-xs sm:max-w-sm">
              {visual}
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

export default WhyNoobPortfolios;
