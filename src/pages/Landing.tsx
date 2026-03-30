import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import noobLogo from '@/assets/noobportlogo.png';

const faqData = [
  { q: 'Is this real money trading?', a: 'No. N00B Portfolios is paper trading only, so your money is never at risk while you learn.' },
  { q: 'Who is this for?', a: 'New individual investors, especially people used to app-first trading experiences.' },
  { q: 'Do I need investing experience to start?', a: 'Nope. The app is built so beginners can learn by doing in a low-pressure environment.' },
  { q: 'Can I start now?', a: 'Yes. Hit Start trading and jump right into practice mode.' },
];

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;

    const targets = el.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('landing-in-view');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    );

    targets.forEach((t, i) => {
      t.style.transitionDelay = `${Math.min(i * 28, 260)}ms`;
      observer.observe(t);
    });

    return () => observer.disconnect();
  }, []);

  return ref;
}

const Landing = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const wrapperRef = useScrollReveal();

  const toggleFaq = useCallback((i: number) => {
    setOpenFaq((prev) => (prev === i ? null : i));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 980) setMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="min-h-screen text-foreground"
      style={{
        background: 'radial-gradient(circle at 85% -10%, #003347 0%, transparent 35%), hsl(220 10% 4%)',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/50 backdrop-blur-[10px] bg-[rgb(7_11_18_/_82%)]">
        <div className="mx-auto flex min-h-[72px] w-[min(1120px,calc(100%-2rem))] items-center justify-between gap-4">
          <a
            href="#top"
            className="inline-flex items-center gap-2 font-sans font-bold"
          >
            <img src={noobLogo} alt="" className="h-6 w-6 rounded-md" />
            N00B Portfolios
          </a>

          {/* Mobile toggle */}
          <button
            className="relative z-30 inline-flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card md-land:hidden"
            aria-expanded={menuOpen}
            aria-controls="landing-nav"
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span
              className="block h-0.5 w-[18px] rounded-full bg-foreground transition-transform"
              style={menuOpen ? { transform: 'translateY(4px) rotate(45deg)' } : undefined}
            />
            <span
              className="block h-0.5 w-[18px] rounded-full bg-foreground transition-transform"
              style={menuOpen ? { transform: 'translateY(-4px) rotate(-45deg)' } : undefined}
            />
          </button>

          {/* Desktop nav */}
          <nav
            id="landing-nav"
            className={`
              md-land:static md-land:flex md-land:items-center md-land:gap-5 md-land:bg-transparent md-land:border-0
              md-land:opacity-100 md-land:pointer-events-auto md-land:p-0 md-land:transform-none
              absolute left-4 right-4 top-[calc(100%+0.6rem)] grid gap-0.5
              rounded-xl border border-border bg-[rgb(13_19_32_/_98%)] p-2 origin-top
              text-[0.95rem] text-muted-foreground
              transition-all duration-200
              ${menuOpen ? 'scale-y-100 opacity-100 pointer-events-auto' : 'scale-y-[0.98] opacity-0 pointer-events-none'}
            `}
          >
            {['how-it-works', 'features', 'social-proof', 'faq'].map((id) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 hover:bg-card hover:text-foreground md-land:p-0 md-land:rounded-none md-land:hover:bg-transparent"
              >
                {id === 'how-it-works' ? 'How it works' : id === 'social-proof' ? 'Community' : id.charAt(0).toUpperCase() + id.slice(1)}
              </a>
            ))}
          </nav>

          <Link
            to="/auth"
            className="inline-flex h-[42px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-300 px-4 text-[0.92rem] font-semibold text-[#04121b] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(0,217,255,0.28)] active:translate-y-0 md-land:order-none order-last"
          >
            Start trading
          </Link>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────── */}
      <main id="top">
        {/* Hero */}
        <section className="pt-[4.5rem] pb-10 md-land:pt-[3.3rem]">
          <div className="mx-auto grid w-[min(1120px,calc(100%-2rem))] items-center gap-8 md-land:grid-cols-[1.2fr_1fr]">
            <div data-reveal>
              <p className="mb-3.5 inline-block text-[0.92rem] tracking-wide text-primary">
                Paper trading built for Robinhood beginners
              </p>
              <h1 className="mt-0 mb-4 font-sans text-[clamp(2.05rem,5vw,3.5rem)] font-extrabold leading-[1.08] tracking-tight">
                Learn the market without donating your paycheck&nbsp;to&nbsp;it.
              </h1>
              <p className="m-0 max-w-[60ch] text-[1.02rem] text-muted-foreground">
                N00B Portfolios lets you test ideas, make mistakes, and level up before
                risking real money. Same investing mindset, zero real-world losses.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-300 px-5 font-semibold text-[#04121b] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(0,217,255,0.28)] active:translate-y-0"
                >
                  Start trading
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-border bg-transparent px-5 font-semibold text-foreground transition hover:border-primary"
                >
                  See how it works
                </a>
              </div>
              <ul className="mt-5 pl-4 text-muted-foreground" aria-label="Trust highlights">
                <li className="mb-1.5">No credit card required</li>
                <li className="mb-1.5">Practice with realistic market behavior</li>
                <li className="mb-1.5">Built for first-time individual investors</li>
              </ul>
            </div>

            {/* Preview card */}
            <div
              data-reveal
              className="rounded-[20px] border border-border bg-gradient-to-b from-card to-[#0f1727] p-5 shadow-[inset_0_0_0_1px_rgba(86,232,255,0.1)]"
              aria-label="Sample portfolio preview"
            >
              <p className="m-0 text-[0.78rem] uppercase tracking-[0.08em] text-primary">
                Practice Portfolio
              </p>
              <h2 className="mt-1 mb-4 font-sans text-[1.55rem] font-bold tracking-tight">
                Starter Mode: Active
              </h2>
              <div className="flex items-center justify-between border-t border-border py-3">
                <span>Today</span>
                <strong className="text-lg text-green-400">+$214.27</strong>
              </div>
              <div className="flex items-center justify-between border-t border-border py-3">
                <span>Overall</span>
                <strong className="text-lg text-rose-400">-$38.11</strong>
              </div>
              <p className="mt-3 mb-0 text-[0.95rem] text-muted-foreground">
                Every win and loss is simulated, so you can build skill before going live.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 max-[640px]:grid-cols-1">
                {[
                  ['Trades placed', '143'],
                  ['Win rate', '57%'],
                  ['Risk score', 'Medium'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[14px] border border-border bg-[#131f34] p-3">
                    <p className="m-0 mb-1 text-[0.82rem] text-muted-foreground">{label}</p>
                    <p className="m-0 font-sans font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-[3.9rem]" id="how-it-works">
          <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">
            <h2 data-reveal className="mb-2.5 font-sans text-[clamp(1.7rem,3.2vw,2.4rem)] font-bold tracking-tight">
              How it works
            </h2>
            <p data-reveal className="mb-5 text-muted-foreground">
              Three simple steps from total noob to confident investor.
            </p>
            <div className="grid gap-4 md-land:grid-cols-3">
              {[
                ['01', 'Create your practice account', 'Jump in fast and get a virtual balance to experiment with your strategy.'],
                ['02', 'Trade like you normally would', 'Buy, sell, and track stocks in a realistic flow made for first-time traders.'],
                ['03', 'Review mistakes without the pain', 'See what worked, what flopped, and improve before risking actual money.'],
              ].map(([num, title, desc]) => (
                <article
                  key={num}
                  data-reveal
                  className="rounded-[18px] border border-border bg-gradient-to-b from-card to-[#0f1828] p-5"
                >
                  <p className="m-0 mb-1.5 font-sans text-[1.4rem] text-primary">{num}</p>
                  <h3 className="mb-2 font-sans font-bold tracking-tight">{title}</h3>
                  <p className="mt-0 text-muted-foreground">{desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-[3.9rem]" id="features">
          <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">
            <h2 data-reveal className="mb-2.5 font-sans text-[clamp(1.7rem,3.2vw,2.4rem)] font-bold tracking-tight">
              Features made for beginner confidence
            </h2>
            <div className="grid gap-4 md-land:grid-cols-2">
              {[
                ['Realistic paper trading', 'Practice with market-style movements so your habits carry into real investing.'],
                ['Simple performance insights', 'Track wins, losses, and consistency with metrics you can actually understand.'],
                ['Risk-free learning loop', 'Experiment boldly, take notes, and iterate fast without financial downside.'],
                ['No jargon overload', 'Clear language and helpful guidance designed for people still learning the ropes.'],
              ].map(([title, desc]) => (
                <article
                  key={title}
                  data-reveal
                  className="rounded-[18px] border border-border bg-gradient-to-b from-card to-[#0f1828] p-5"
                >
                  <h3 className="mb-2 font-sans font-bold tracking-tight">{title}</h3>
                  <p className="mt-0 text-muted-foreground">{desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Social proof */}
        <section className="py-[3.9rem]" id="social-proof">
          <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">
            <h2 data-reveal className="mb-2.5 font-sans text-[clamp(1.7rem,3.2vw,2.4rem)] font-bold tracking-tight">
              New investors are practicing smarter
            </h2>
            <div className="grid gap-4 md-land:grid-cols-[1fr_1fr_1.2fr]">
              <article data-reveal className="rounded-[18px] border border-border bg-gradient-to-b from-card to-[#0f1828] p-5">
                <p className="m-0 mb-1.5 font-sans text-[1.95rem] text-primary">10k+</p>
                <p className="mt-0 text-muted-foreground">
                  Practice portfolios created by first-time traders.
                </p>
              </article>
              <article data-reveal className="rounded-[18px] border border-border bg-gradient-to-b from-card to-[#0f1828] p-5">
                <p className="m-0 mb-1.5 font-sans text-[1.95rem] text-primary">4.8/5</p>
                <p className="mt-0 text-muted-foreground">
                  Average rating from users who wanted a safer learning path.
                </p>
              </article>
              <article data-reveal className="rounded-[18px] border border-border bg-gradient-to-b from-card to-[#0f1828] p-5">
                <p className="mt-0 text-muted-foreground">
                  "I stopped panic-buying random tickers and started building a repeatable strategy."
                </p>
                <span className="text-[0.9rem] text-foreground">- Jay, new investor</span>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-[3.9rem]" id="faq">
          <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">
            <h2 data-reveal className="mb-2.5 font-sans text-[clamp(1.7rem,3.2vw,2.4rem)] font-bold tracking-tight">
              FAQ
            </h2>
            <div className="grid gap-3">
              {faqData.map((item, i) => (
                <article
                  key={i}
                  data-reveal
                  className="overflow-hidden rounded-[14px] border border-border bg-card"
                >
                  <button
                    className="flex w-full items-center justify-between border-0 bg-transparent px-4 py-4 text-left font-sans font-semibold text-foreground"
                    aria-expanded={openFaq === i}
                    onClick={() => toggleFaq(i)}
                  >
                    {item.q}
                    <span className="ml-4 text-primary">{openFaq === i ? '−' : '+'}</span>
                  </button>
                  <div
                    className="overflow-hidden transition-[max-height] duration-250"
                    style={{ maxHeight: openFaq === i ? '200px' : '0px' }}
                  >
                    <p className="m-0 px-4 pb-4 text-muted-foreground">{item.a}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border/50 px-4 pb-4 pt-10">
        <div className="mx-auto flex w-[min(1120px,calc(100%-2rem))] flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-lg">Ready to stop guessing and start learning?</p>
          <Link
            to="/auth"
            className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-300 px-5 font-semibold text-[#04121b] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(0,217,255,0.28)] active:translate-y-0 max-[640px]:w-full"
          >
            Start trading
          </Link>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} N00B Portfolios
        </p>
      </footer>
    </div>
  );
};

export default Landing;
