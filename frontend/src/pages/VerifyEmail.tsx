import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuthActions } from '@/contexts/AuthContext';
import { Mail, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import {
  resendVerificationViaGraphql,
  verifyEmailViaGraphql,
} from '@/services/authGraphql';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const responseData = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return responseData?.error || responseData?.message ||
    (error instanceof Error ? error.message : fallback);
};

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { setCurrentUser } = useAuthActions();
  
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

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
      const response = await verifyEmailViaGraphql(token);
      
      if (response.success) {
        setVerified(true);
        
        // Set user in context if returned
        if (response.user) {
          setCurrentUser({ ...response.user, uid: String(response.user.uid) });
        }
        
        toast({
          title: 'Email verified!',
          description: 'Your account is now active.',
        });

        // Redirect to dashboard after a moment
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Verification failed. The link may be invalid or expired.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendCooldown > 0) return;
    
    setResending(true);

    try {
      await resendVerificationViaGraphql(email);
      toast({
        title: 'Verification email sent',
        description: 'Please check your inbox.',
      });
      setResendCooldown(60); // 60 second cooldown
    } catch (err) {
      toast({
        title: 'Failed to resend',
        description: getApiErrorMessage(err, 'Please try again later.'),
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <BackgroundClouds className="opacity-[0.15] dark:opacity-10" cloudCount={8} />
      
      <Card className="w-full max-w-md relative z-10">
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
          <CardTitle className="text-2xl text-foreground">
            {verified ? 'Email Verified!' : verifying ? 'Verifying...' : 'Verify Your Email'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
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
              <Spinner size="xl" variant="brand" />
              <p className="mt-4 text-muted-foreground">
                Verifying your email...
              </p>
            </div>
          ) : verified ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-muted-foreground">
                Redirecting you to the dashboard...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              {email && (
                <Button
                  onClick={handleResend}
                  disabled={resending || resendCooldown > 0}
                  variant="outline"
                  
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
              <p className="mb-2 text-muted-foreground">
                We sent a verification link to:
              </p>
              <p className="font-medium mb-6 text-foreground">
                {email || 'your email'}
              </p>
              <p className="text-sm mb-4 text-muted-foreground">
                Click the link in the email to verify your account.
              </p>
              {email && (
                <Button
                  onClick={handleResend}
                  disabled={resending || resendCooldown > 0}
                  variant="outline"
                  
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
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">
              Back to login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
