import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, UserRound, ArrowLeftRight, TrendingUp } from 'lucide-react';
import logo from '@/assets/noobportlogo.png';
import teaserImg from '@/assets/teaser.png';

const Auth = () => {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(loginEmail)) {toast.error('Please enter a valid email address');return;}
    if (loginPassword.length < 6) {toast.error('Password must be at least 6 characters');return;}
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);
    if (error) {
      toast.error(error.message.includes('Invalid login credentials') ? 'Invalid email or password' : error.message);
    } else {
      toast.success('Welcome back!');
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(signupEmail)) {toast.error('Please enter a valid email address');return;}
    if (signupPassword.length < 6) {toast.error('Password must be at least 6 characters');return;}
    if (signupPassword !== signupConfirmPassword) {toast.error('Passwords do not match');return;}
    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword);
    setIsLoading(false);
    if (error) {
      toast.error(error.message.includes('already registered') ? 'This email is already registered. Try logging in.' : error.message);
    } else {
      toast.success('Account created! Welcome to N00B Portfolios!');
      navigate('/');
    }
  };

  const features = [
  { icon: UserRound, title: 'Sign up', desc: 'Create an account with your email.' },
  { icon: ArrowLeftRight, title: 'Start trading', desc: 'Add holdings to your portfolio.' },
  { icon: TrendingUp, title: 'Watch your portfolio grow', desc: "Track your portfolio's performance with real-time market data" }];


  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Vignette background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 30%, hsl(220 10% 8%) 0%, hsl(220 10% 4%) 60%, hsl(220 10% 2%) 100%)'
      }} />

      {/* Ambient glow blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Blob 1 — cyan, top-right drift */}
        <div className="absolute w-[600px] h-[600px] md:w-[900px] md:h-[900px] rounded-full opacity-[0.04] blur-[120px] md:blur-[160px] animate-[ambientDrift1_30s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{ background: 'hsl(190 100% 50%)', top: '-10%', right: '-10%' }} />

        {/* Blob 2 — teal, bottom-left drift */}
        <div className="absolute w-[500px] h-[500px] md:w-[800px] md:h-[800px] rounded-full opacity-[0.035] blur-[120px] md:blur-[160px] animate-[ambientDrift2_35s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{ background: 'hsl(170 80% 45%)', bottom: '-5%', left: '-15%' }} />

        {/* Blob 3 — green accent, center drift (hidden on mobile) */}
        <div className="hidden md:block absolute w-[700px] h-[700px] rounded-full opacity-[0.025] blur-[180px] animate-[ambientDrift3_40s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{ background: 'hsl(160 70% 40%)', top: '40%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      </div>

      <div className="relative z-10 flex flex-col items-center px-4 pt-16 sm:pt-24 pb-12">
        {/* Brand row */}
        <div className="flex items-center gap-2 mb-6">
          <img src={logo} alt="N00B Portfolios" className="w-6 h-6 rounded-md" />
          <span className="font-mono text-sm tracking-tight">
            N00B <span className="text-primary">Portfolios™</span>
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center leading-tight mb-4 tracking-tight">
          What would you do with{' '}
          <span className="text-primary">$10,000</span>?
        </h1>

        {/* Subhead */}
        <p className="text-muted-foreground text-center text-base sm:text-lg leading-relaxed mb-8 max-w-md">
          Build a portfolio with real market prices using $10,000 in practice money.{' '}
          Learn by doing, not by losing.
        </p>

        {/* Segmented toggle */}
        <div className="flex items-center bg-secondary rounded-full p-0.5 mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${
            isLogin ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`
            }>

            Login
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${
            !isLogin ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`
            }>

            Sign up
          </button>
        </div>

        {/* Auth form */}
        <div className="w-full max-w-[340px]">
          {isLogin ?
          <form onSubmit={handleSignIn} className="space-y-3">
              <Input
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
              className="bg-secondary border-border/50 h-11 rounded-lg placeholder:text-muted-foreground/60" />

              <Input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
              className="bg-secondary border-border/50 h-11 rounded-lg placeholder:text-muted-foreground/60" />

              <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">

                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Logging in...</> : 'Login'}
              </button>
            </form> :

          <form onSubmit={handleSignUp} className="space-y-3">
              <Input
              type="email"
              placeholder="Email address"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
              className="bg-secondary border-border/50 h-11 rounded-lg placeholder:text-muted-foreground/60" />

              <Input
              type="password"
              placeholder="Password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={isLoading}
              className="bg-secondary border-border/50 h-11 rounded-lg placeholder:text-muted-foreground/60" />

              <Input
              type="password"
              placeholder="Confirm password"
              value={signupConfirmPassword}
              onChange={(e) => setSignupConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={isLoading}
              className="bg-secondary border-border/50 h-11 rounded-lg placeholder:text-muted-foreground/60" />

              <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">

                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</> : 'Sign up'}
              </button>
            </form>
          }
        </div>

        {/* Teaser app screenshot */}
        <div className="relative mt-16 mb-20 w-full max-w-2xl">
          {/* Glow behind */}
          <div className="absolute inset-0 -inset-x-8 -inset-y-8 rounded-3xl pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 60%, hsl(190 100% 50% / 0.07) 0%, transparent 70%)'
          }} />
          <img
            src={teaserImg}
            alt="N00B Portfolios app preview"
            className="relative w-full rounded-2xl shadow-2xl shadow-black/40" />

        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-16">
          {features.map(({ icon: Icon, title, desc }) =>
          <div
            key={title}
            className="flex flex-col items-center text-center px-6 py-8 rounded-2xl border border-border/50 bg-card/60">

              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="w-full max-w-3xl border-t border-border/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} N00B Labs</span>
          <div className="flex gap-5">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </footer>
      </div>
    </div>);

};

export default Auth;