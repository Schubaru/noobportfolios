import { Search, BarChart3, Lightbulb } from 'lucide-react';

const rows = [
  {
    icon: Search,
    number: '01',
    title: 'Pick a Portfolio',
    desc: "Start with curated portfolios based on strategy or risk level. No need to guess where to begin.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-5 space-y-3">
        {[
          { name: 'Tech Growth', alloc: '60%', color: 'bg-primary' },
          { name: 'Balanced Mix', alloc: '25%', color: 'bg-success' },
          { name: 'Dividend Focus', alloc: '15%', color: 'bg-muted-foreground' },
        ].map((p) => (
          <div key={p.name} className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
            <span className="text-sm text-foreground flex-1">{p.name}</span>
            <span className="text-xs font-mono text-muted-foreground">{p.alloc}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: BarChart3,
    number: '02',
    title: 'Track Performance',
    desc: "See how your portfolio performs over time with real market data and simple insights.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-5">
        <div className="flex items-end justify-between mb-3">
          <span className="text-xs text-muted-foreground">Portfolio Value</span>
          <span className="text-sm font-semibold text-success">+12.4%</span>
        </div>
        <svg viewBox="0 0 200 60" className="w-full h-auto" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(190, 100%, 50%)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(190, 100%, 50%)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,50 Q20,48 40,42 T80,30 T120,25 T160,18 T200,10"
            fill="none"
            stroke="hsl(190, 100%, 50%)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M0,50 Q20,48 40,42 T80,30 T120,25 T160,18 T200,10 L200,60 L0,60 Z"
            fill="url(#chartGrad)"
          />
        </svg>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-muted-foreground/50">Jan</span>
          <span className="text-[10px] text-muted-foreground/50">Jun</span>
          <span className="text-[10px] text-muted-foreground/50">Dec</span>
        </div>
      </div>
    ),
  },
  {
    icon: Lightbulb,
    number: '03',
    title: 'Learn and Adjust',
    desc: "Understand what's working and refine your strategy with confidence.",
    visual: (
      <div className="w-full rounded-xl border border-border/50 bg-card/60 p-5 space-y-3">
        {[
          { label: 'Stocks', pct: 62, change: '+4%' },
          { label: 'ETFs', pct: 25, change: '-2%' },
          { label: 'Bonds', pct: 13, change: '+1%' },
        ].map((item) => (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{item.label}</span>
              <span className="text-xs font-mono text-muted-foreground">{item.pct}% <span className="text-primary">{item.change}</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${item.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

const HowItWorks = () => (
  <section className="w-full max-w-5xl mb-20">
    <div className="text-center mb-14">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
        How N00B Portfolios Works
      </h2>
      <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
        Get started in under 30 seconds. No experience needed.
      </p>
    </div>

    <div className="space-y-24 sm:space-y-32">
      {rows.map(({ icon: Icon, number, title, desc, visual }, i) => {
        const reversed = i % 2 === 1;
        return (
          <div
            key={title}
            className={`flex flex-col ${reversed ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8 md:gap-14`}
          >
            {/* Text */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="font-mono text-xs text-muted-foreground/40">{number}</span>
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

export default HowItWorks;
