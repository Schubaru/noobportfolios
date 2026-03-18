import { ShieldCheck, GraduationCap, Layers, Eye, Target, Rocket } from 'lucide-react';

const props = [
  { icon: ShieldCheck, title: 'Start Without Risk', desc: 'Practice strategies without losing real money.' },
  { icon: GraduationCap, title: 'Learn by Doing', desc: 'Understand markets through real portfolio performance.' },
  { icon: Layers, title: 'Curated Strategies', desc: "Built portfolios so you don't start from scratch." },
  { icon: Eye, title: 'Simple, Not Overwhelming', desc: 'No jargon, just clear insights.' },
  { icon: Target, title: 'Track What Matters', desc: 'Focus on returns, trends, and decisions.' },
  { icon: Rocket, title: 'Built for Beginners and Beyond', desc: "Useful whether you're new or leveling up." },
];

const WhyNoobPortfolios = () => (
  <section className="w-full max-w-3xl mb-16">
    <div className="text-center mb-10">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
        Why N00B Portfolios
      </h2>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {props.map(({ icon: Icon, title, desc }) => (
        <div
          key={title}
          className="flex flex-col items-center text-center px-6 py-8 rounded-2xl border border-border/50 bg-card/60 hover-lift"
        >
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

export default WhyNoobPortfolios;
