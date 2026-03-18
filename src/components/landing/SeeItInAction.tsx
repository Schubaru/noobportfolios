import teaserImg from '@/assets/teaser.png';

const SeeItInAction = () => (
  <section className="w-full max-w-3xl mb-16">
    <div className="text-center mb-10">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
        See It in Action
      </h2>
      <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
        Real market data, real decisions — clarity you can feel.
      </p>
    </div>

    <div className="relative">
      <div
        className="absolute inset-0 -inset-x-8 -inset-y-8 rounded-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 60%, hsl(190 100% 50% / 0.07) 0%, transparent 70%)',
        }}
      />
      <img
        src={teaserImg}
        alt="N00B Portfolios dashboard showing portfolio performance"
        className="relative w-full rounded-2xl shadow-2xl shadow-black/40"
      />
    </div>
  </section>
);

export default SeeItInAction;
