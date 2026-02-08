import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import logo from '@/assets/noobportlogo.png';

const Auth = () => {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  
  // Form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(loginEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    if (loginPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Invalid email or password');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Welcome back!');
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(signupEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    if (signupPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    if (signupPassword !== signupConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword);
    setIsLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('This email is already registered. Try logging in.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Account created! Welcome to N00B Portfolios!');
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[350px] flex flex-col items-center">
        {/* Logo container */}
        <div className="w-20 h-20 rounded-2xl bg-card flex items-center justify-center mb-6">
          <img src={logo} alt="N00B Portfolios" className="h-12 w-auto" />
        </div>
        
        {/* Title + tagline */}
        <h1 className="text-2xl font-bold text-center mb-2">N00B Portfolios™</h1>
        <p className="text-muted-foreground text-center mb-6">
          Practice trading with virtual money. No risk, real learning.
        </p>
        
        {/* Section header */}
        <h2 className="font-semibold text-center mb-6">
          {isLogin ? 'Sign in' : 'Create account'}
        </h2>
        
        {/* Form */}
        {isLogin ? (
          <form onSubmit={handleSignIn} className="w-full space-y-4">
            <Input
              id="login-email"
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
            />
            
            <Input
              id="login-password"
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="w-full space-y-4">
            <Input
              id="signup-email"
              type="email"
              placeholder="Email address"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
            />
            
            <Input
              id="signup-password"
              type="password"
              placeholder="Create password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={isLoading}
            />
            
            <Input
              id="signup-confirm-password"
              type="password"
              placeholder="Confirm password"
              value={signupConfirmPassword}
              onChange={(e) => setSignupConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={isLoading}
            />
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create an account'
              )}
            </Button>
          </form>
        )}
        
        {/* Secondary link */}
        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="text-primary mt-4 hover:underline"
          disabled={isLoading}
        >
          {isLogin ? 'Create new account' : 'Sign in'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
