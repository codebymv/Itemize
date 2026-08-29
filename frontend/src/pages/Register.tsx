import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AuthError, useAuthActions } from '@/contexts/AuthContext';
import { GoogleOAuthGate } from '@/components/auth/GoogleOAuthGate';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';

function RegisterForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { register } = useAuthActions();
  const googleSignIn = useGoogleSignIn();
  const invitationToken = searchParams.get('invitation') || undefined;
  const invitedEmail = searchParams.get('email') || '';
  const redirectTo = invitationToken ? `/invite/${invitationToken}` : '/';
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const signupMode = searchParams.get('mode') === 'trial' ? 'TRIAL' : 'FREE';
  const isTrial = signupMode === 'TRIAL';

  const passwordsMatch = !password || !confirmPassword || password === confirmPassword;
  const passwordValid = password.length >= 8 && 
    /[A-Z]/.test(password) && 
    /[a-z]/.test(password) && 
    /[0-9]/.test(password);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure your passwords match.',
        variant: 'destructive',
      });
      return;
    }

    if (!passwordValid) {
      toast({
        title: 'Weak password',
        description: 'Use 8+ characters with uppercase, lowercase, and a number.',
        variant: 'destructive',
      });
      return;
    }

    if (!acceptedTerms) {
      toast({
        title: 'Terms required',
        description: 'Please accept the Terms of Service and Privacy Policy.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      await register(email, password, name, signupMode, invitationToken);
      toast({
        title: 'Account created!',
        description: 'Please check your email to verify your account.',
      });
      const invitation = invitationToken
        ? `&invitation=${encodeURIComponent(invitationToken)}`
        : '';
      navigate(`/verify-email?email=${encodeURIComponent(email)}${invitation}`);
    } catch (error) {
      if (error instanceof AuthError && error.code === 'GOOGLE_ACCOUNT_EXISTS') {
        toast({
          title: 'Google account exists',
          description: 'Use Google to sign in to this account.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Registration failed',
        description: error instanceof Error ? error.message : 'An error occurred during registration.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (!acceptedTerms) {
      toast({
        title: 'Terms required',
        description: 'Please accept the Terms of Service and Privacy Policy.',
        variant: 'destructive',
      });
      return;
    }
    setGoogleLoading(true);
    googleSignIn(redirectTo, signupMode);
    setTimeout(() => setGoogleLoading(false), 1000);
  };

  return (
    <div className="min-h-[100svh] flex items-start justify-center bg-background px-4 pt-4 pb-6 sm:items-center sm:pt-6 sm:pb-6 relative overflow-hidden">
      <BackgroundClouds className="opacity-[0.15] dark:opacity-10" cloudCount={8} />
      
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="text-center pb-2">
          <Link to="/home">
            <div className="mb-3 flex justify-center items-center bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-lg py-4 hover:from-blue-700 hover:to-indigo-700 transition-colors -mx-6 -mt-6">
              <img
                src={"/textwhite.png"}
                alt="Itemize"
                className="h-10 w-auto"
              />
            </div>
          </Link>
          <h1 className="text-2xl font-semibold leading-none tracking-tight text-foreground">
            {invitationToken
              ? 'Create your Itemize account'
              : isTrial
                ? 'Start your 14-day Solo trial'
                : 'Create your free account'}
          </h1>
          <CardDescription className="text-muted-foreground">
            {invitationToken
              ? 'Use the invited email address to join your team workspace.'
              : isTrial
                ? 'Explore the complete Solo toolkit. No credit card required.'
                : 'Workspace tools, free for as long as you need.'}
          </CardDescription>
          {!invitationToken && (
            <p className="text-xs text-muted-foreground">
              {isTrial ? (
                <>Only need workspace tools? <Link className="text-blue-600 underline" to="/register?mode=free">Choose Free</Link></>
              ) : (
                <>Need CRM, invoicing, and signatures? <Link className="text-blue-600 underline" to="/register?mode=trial">Try Solo</Link></>
              )}
            </p>
          )}
        </CardHeader>

        <form onSubmit={handleRegister}>
          <CardContent className="space-y-3 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">
                Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={Boolean(invitationToken && invitedEmail)}
                  required
                  className={`pl-10 ${invitationToken && invitedEmail ? 'bg-muted/50' : ''}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                At least 8 characters with uppercase, lowercase, and number
              </p>
            </div>

            <div className="space-y-2">
              <Label 
                htmlFor="confirmPassword" 
                className={!passwordsMatch ? 'text-red-500' : 'text-foreground'}
              >
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`pl-10 ${!passwordsMatch ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                />
              </div>
              {!passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms"
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                className="mt-1 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
              />
              <label 
                htmlFor="terms" 
                className="text-sm leading-relaxed cursor-pointer text-muted-foreground"
              >
                I agree to the{' '}
                <Link to="/legal/terms" className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300" target="_blank">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/legal/privacy" className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300" target="_blank">
                  Privacy Policy
                </Link>
              </label>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white" 
              disabled={loading || !acceptedTerms}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                invitationToken
                  ? 'Create account and continue'
                  : isTrial
                    ? 'Start Solo Trial'
                    : 'Create free account'
              )}
            </Button>

            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-2 bg-card text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleLogin}
              disabled={googleLoading || !acceptedTerms}
            >
              {googleLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link to={invitationToken ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'} className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function Register() {
  return (
    <GoogleOAuthGate>
      <RegisterForm />
    </GoogleOAuthGate>
  );
}
