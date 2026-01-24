import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import api from '@/lib/api';

export default function ForgotPassword() {
  const { toast } = useToast();
  const { theme } = useTheme();
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
      toast({
        title: 'Reset link sent',
        description: 'If an account exists with this email, you will receive a password reset link.',
      });
    } catch (error: any) {
      // Always show success to prevent email enumeration
      setSent(true);
    } finally {
      setLoading(false);
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
            {sent ? 'Check your email' : 'Forgot password?'}
          </CardTitle>
          <CardDescription className={isLight ? '' : 'text-slate-400'}>
            {sent 
              ? 'We sent you a password reset link'
              : "No worries, we'll send you reset instructions"
            }
          </CardDescription>
        </CardHeader>

        {sent ? (
          <CardContent className="pt-6 text-center">
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <p className={`mb-2 ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                If an account exists for:
              </p>
              <p className={`font-medium mb-6 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                {email}
              </p>
              <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-slate-500'}`}>
                You'll receive an email with a link to reset your password.
                The link will expire in 1 hour.
              </p>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
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
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </CardFooter>
          </form>
        )}

        <CardFooter className="flex justify-center pt-0">
          <Link 
            to="/login" 
            className={`text-sm flex items-center gap-2 ${isLight ? 'text-gray-500' : 'text-slate-400'} hover:underline`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
