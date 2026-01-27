import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { register, login } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';

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
        description: 'Password must be at least 8 characters with uppercase, lowercase, and number.',
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
      await register(email, password, name);
      toast({
        title: 'Account created!',
        description: 'Please check your email to verify your account.',
      });
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (error: any) {
      if (error.code === 'GOOGLE_ACCOUNT_EXISTS') {
        toast({
          title: 'Google account exists',
          description: 'This email is registered with Google. Please sign in with Google.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Registration failed',
        description: error.message || 'An error occurred during registration.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    // Note: login() triggers the OAuth flow but doesn't return a promise
    // Navigation happens in AuthContext after successful auth
    login('/dashboard');
    // Reset loading state after a short delay if popup was closed without completing
    setTimeout(() => setGoogleLoading(false), 1000);
  };

  return (
    <div className={`min-h-screen flex items-center justify-center ${bgGradient} px-4 py-8 relative overflow-hidden`}>
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
          <CardTitle className={`text-2xl ${isLight ? 'text-gray-700' : 'text-slate-200'}`}>
            Create your account
          </CardTitle>
          <CardDescription className={isLight ? '' : 'text-slate-400'}>
            Start organizing your business today
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="name" className={isLight ? 'text-gray-700' : 'text-slate-300'}>
                Name
              </Label>
              <div className="relative">
                <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`pl-10 ${isLight ? '' : 'bg-slate-700 border-slate-600'}`}
                />
              </div>
            </div>

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
              <Label htmlFor="password" className={isLight ? 'text-gray-700' : 'text-slate-300'}>
                Password
              </Label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className={`pl-10 ${isLight ? '' : 'bg-slate-700 border-slate-600'}`}
                />
              </div>
              <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
                At least 8 characters with uppercase, lowercase, and number
              </p>
            </div>

            <div className="space-y-2">
              <Label 
                htmlFor="confirmPassword" 
                className={!passwordsMatch ? 'text-red-500' : isLight ? 'text-gray-700' : 'text-slate-300'}
              >
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`pl-10 ${!passwordsMatch ? 'border-red-500 focus-visible:ring-red-500' : ''} ${isLight ? '' : 'bg-slate-700 border-slate-600'}`}
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
                className={`text-sm leading-relaxed cursor-pointer ${isLight ? 'text-gray-600' : 'text-slate-400'}`}
              >
                I agree to the{' '}
                <Link to="/legal/terms" className="text-blue-600 hover:underline dark:text-blue-400" target="_blank">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/legal/privacy" className="text-blue-600 hover:underline dark:text-blue-400" target="_blank">
                  Privacy Policy
                </Link>
              </label>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
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
                'Create Account'
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
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
