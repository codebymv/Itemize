import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuthActions } from '@/contexts/AuthContext';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { login, loginWithEmail } = useAuthActions();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';

  // Get redirect path from location state
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  // Check if redirected due to session expiration
  const sessionExpired = searchParams.get('session') === 'expired';

  // Show session expired message
  useEffect(() => {
    if (sessionExpired) {
      toast({
        title: 'Session has expired',
        description: 'Please sign in again to continue.',
        variant: 'destructive',
      });
    }
  }, [sessionExpired, toast]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await loginWithEmail(email, password);
      toast({
        title: 'Welcome back!',
        description: 'You have been logged in successfully.',
      });
      navigate(from, { replace: true });
    } catch (error: any) {
      // Handle email not verified
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        toast({
          title: 'Email not verified',
          description: 'Please check your email and verify your account.',
          variant: 'destructive',
        });
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      
      // Handle Google account
      if (error.code === 'GOOGLE_ACCOUNT') {
        toast({
          title: 'Google account',
          description: 'This account uses Google sign-in. Please use the Google button below.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Login failed',
        description: error.message || 'Invalid email or password.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    // Note: login() triggers the OAuth flow but doesn't return a promise
    // Navigation happens in AuthContext after successful auth via onAuthSuccess callback
    login(from);
    // Reset loading state after a short delay if popup was closed without completing
    setTimeout(() => setGoogleLoading(false), 1000);
  };

  return (
    <div className={`min-h-screen flex items-center justify-center ${bgGradient} px-4 relative overflow-hidden`}>
      <BackgroundClouds opacity={isLight ? 0.15 : 0.1} cloudCount={8} isLight={isLight} />
      
      <Card className={`w-full max-w-md relative z-10 ${isLight ? 'bg-white' : 'bg-slate-800 border-slate-700'}`}>
        <CardHeader className="text-center p-0">
          <Link to="/home">
            <div className="mb-4 flex justify-center items-center bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-lg py-6 hover:from-blue-700 hover:to-indigo-700 transition-colors">
              <img
                src={"/textwhite.png"}
                alt="Itemize"
                className="h-10 w-auto"
              />
            </div>
          </Link>
          {sessionExpired && (
            <Alert variant="destructive" className="mx-0 mb-4 border-l-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Session has expired
              </AlertDescription>
            </Alert>
          )}
          <CardTitle className={`text-2xl ${isLight ? 'text-gray-700' : 'text-slate-200'}`}>
            Welcome back
          </CardTitle>
          <CardDescription className={isLight ? '' : 'text-slate-400'}>
            Sign in to your Itemize account
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleEmailLogin}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="email" className={isLight ? 'text-gray-700' : 'text-slate-300'}>
                Email
              </Label>
              <div className="relative">
                <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`pl-10 ${isLight ? '' : 'bg-slate-700 border-slate-600'}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className={isLight ? 'text-gray-700' : 'text-slate-300'}>
                  Password
                </Label>
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`pl-10 ${isLight ? '' : 'bg-slate-700 border-slate-600'}`}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>

            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className={`w-full border-t ${isLight ? 'border-gray-200' : 'border-slate-600'}`} />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className={`px-2 ${isLight ? 'bg-white text-gray-500' : 'bg-slate-800 text-slate-400'}`}>
                  Or continue with
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className={`w-full ${isLight ? '' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`}
              onClick={handleGoogleLogin}
              disabled={googleLoading}
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

            <p className={`text-sm text-center ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:underline dark:text-blue-400">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
