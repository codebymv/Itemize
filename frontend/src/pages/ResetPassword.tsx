import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Lock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import api from '@/lib/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { theme } = useTheme();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token');

  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';

  const passwordsMatch = !password || !confirmPassword || password === confirmPassword;
  const passwordValid = password.length >= 8 && 
    /[A-Z]/.test(password) && 
    /[a-z]/.test(password) && 
    /[0-9]/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

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

    setLoading(true);
    setError(null);

    try {
      await api.post('/api/auth/reset-password', { token, password });
      setSuccess(true);
      toast({
        title: 'Password reset!',
        description: 'Your password has been reset successfully.',
      });
      
      // Redirect to login after a moment
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  // No token - show error
  if (!token) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgGradient} px-4 relative overflow-hidden`}>
        <BackgroundClouds opacity={isLight ? 0.15 : 0.1} cloudCount={8} isLight={isLight} />
        
        <Card className={`w-full max-w-md relative z-10 ${isLight ? 'bg-white' : 'bg-slate-800 border-slate-700'}`}>
          <CardHeader className="text-center p-0">
            <Link to="/home">
              <div className="mb-4 flex justify-center items-center bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-lg py-6">
                <img src={"/textwhite.png"} alt="Itemize" className="h-10 w-auto" />
              </div>
            </Link>
            <CardTitle className={`text-2xl ${isLight ? 'text-gray-700' : 'text-slate-200'}`}>
              Invalid Link
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-center">
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
              <p className={`mb-4 ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                This password reset link is invalid or has expired.
              </p>
              <Link to="/forgot-password">
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white">
                  Request New Link
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <CardTitle className={`text-2xl ${isLight ? 'text-gray-700' : 'text-slate-200'}`}>
            {success ? 'Password Reset!' : 'Set new password'}
          </CardTitle>
          <CardDescription className={isLight ? '' : 'text-slate-400'}>
            {success 
              ? 'You can now log in with your new password'
              : 'Your new password must be different from previous ones'
            }
          </CardDescription>
        </CardHeader>

        {success ? (
          <CardContent className="pt-6 text-center">
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <p className={`${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                Redirecting you to login...
              </p>
            </div>
          </CardContent>
        ) : error ? (
          <CardContent className="pt-6 text-center">
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
              <p className={`text-red-600 dark:text-red-400 mb-4`}>{error}</p>
              <Link to="/forgot-password">
                <Button variant="outline" className={isLight ? '' : 'bg-slate-700 border-slate-600'}>
                  Request New Link
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="password" className={isLight ? 'text-gray-700' : 'text-slate-300'}>
                  New Password
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
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white" 
                disabled={loading || !passwordsMatch}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </CardFooter>
          </form>
        )}

        <CardFooter className="flex justify-center pt-0">
          <Link 
            to="/login" 
            className={`text-sm ${isLight ? 'text-gray-500' : 'text-slate-400'} hover:underline`}
          >
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
