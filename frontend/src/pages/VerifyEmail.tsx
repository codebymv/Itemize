import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuthActions } from '@/contexts/AuthContext';
import { Mail, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import api from '@/lib/api';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { setCurrentUser } = useAuthActions();
  
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';

  // Auto-verify if token is present
  useEffect(() => {
    if (token && !verified && !verifying) {
      handleVerify();
    }
  }, [token]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async () => {
    if (!token) return;
    
    setVerifying(true);
    setError(null);

    try {
      const response = await api.post('/api/auth/verify-email', { token });
      
      if (response.data.success) {
        setVerified(true);
        
        // Set user in context if returned
        if (response.data.user) {
          setCurrentUser(response.data.user);
        }
        
        toast({
          title: 'Email verified!',
          description: 'Your account is now active.',
        });

        // Redirect to dashboard after a moment
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed. The link may be invalid or expired.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendCooldown > 0) return;
    
    setResending(true);

    try {
      await api.post('/api/auth/resend-verification', { email });
      toast({
        title: 'Verification email sent',
        description: 'Please check your inbox.',
      });
      setResendCooldown(60); // 60 second cooldown
    } catch (err: any) {
      toast({
        title: 'Failed to resend',
        description: err.response?.data?.error || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
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
          <CardTitle className={`text-2xl ${isLight ? 'text-gray-700' : 'text-slate-200'}`}>
            {verified ? 'Email Verified!' : verifying ? 'Verifying...' : 'Verify Your Email'}
          </CardTitle>
          <CardDescription className={isLight ? '' : 'text-slate-400'}>
            {verified 
              ? 'Your account is now active' 
              : token 
                ? 'Please wait while we verify your email'
                : 'Check your inbox for the verification link'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 text-center">
          {verifying ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className={`mt-4 ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                Verifying your email...
              </p>
            </div>
          ) : verified ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <p className={`${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                Redirecting you to the dashboard...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
              <p className={`text-red-600 dark:text-red-400 mb-4`}>{error}</p>
              {email && (
                <Button
                  onClick={handleResend}
                  disabled={resending || resendCooldown > 0}
                  variant="outline"
                  className={isLight ? '' : 'bg-slate-700 border-slate-600'}
                >
                  {resending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    `Resend in ${resendCooldown}s`
                  ) : (
                    'Resend Verification Email'
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <Mail className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <p className={`mb-2 ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                We sent a verification link to:
              </p>
              <p className={`font-medium mb-6 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                {email || 'your email'}
              </p>
              <p className={`text-sm mb-4 ${isLight ? 'text-gray-500' : 'text-slate-500'}`}>
                Click the link in the email to verify your account.
              </p>
              {email && (
                <Button
                  onClick={handleResend}
                  disabled={resending || resendCooldown > 0}
                  variant="outline"
                  className={isLight ? '' : 'bg-slate-700 border-slate-600'}
                >
                  {resending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    `Resend in ${resendCooldown}s`
                  ) : (
                    "Didn't receive it? Resend"
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center">
          <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
            <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">
              Back to login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
