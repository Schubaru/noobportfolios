import { BarChart3, Search, Lightbulb } from 'lucide-react';

const steps = [
  {
    icon: Search,
    number: '01',
    title: 'Pick a Portfolio',
    desc: 'Browse curated portfolios based on risk level or strategy.',
  },
  {
    icon: BarChart3,
    number: '02',
    title: 'Track Performance',
    desc: 'See real-time performance and historical trends.',
  },
  {
    icon: Lightbulb,
    number: '03',
    title: 'Learn and Adjust',
    desc: 'Understand why portfolios perform and refine your strategy.',
  },
];

const HowItWorks = () => (
  <section className="w-full max-w-3xl mb-16">
    <div className="text-center mb-10">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
        How N00B Portfolios Works
      </h2>
      <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
        Get started in under 30 seconds — no experience required.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {steps.map(({ icon: Icon, number, title, desc }) => (
        <div
          key={title}
          className="relative flex flex-col items-center text-center px-6 py-8 rounded-2xl border border-border/50 bg-card/60 hover-lift"
        >
          <span className="absolute top-4 right-4 font-mono text-xs text-muted-foreground/40">
            {number}
          </span>
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
        </div>
      ))}
    </div>
  </section>
);

export default HowItWorks;
