import { useState } from 'react';
import { CheckCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { recoverViewerAccountViaGraphql } from '@/services/authGraphql';

export default function RecoverAccount() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [recovering, setRecovering] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recover = async () => {
    if (!token) return;
    setRecovering(true);
    setError(null);
    try {
      await recoverViewerAccountViaGraphql(token);
      setRecovered(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'This recovery link is invalid or expired.',
      );
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <BackgroundClouds className="opacity-[0.15] dark:opacity-10" cloudCount={8} />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
            {recovered ? (
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            ) : (
              <ShieldCheck className="h-7 w-7 text-blue-600" />
            )}
          </div>
          <CardTitle>{recovered ? 'Account recovered' : 'Keep your Itemize account'}</CardTitle>
          <CardDescription>
            {recovered
              ? 'Your deletion request was canceled and your data remains available.'
              : 'Cancel the scheduled deletion before the recovery window closes.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {!token ? (
            <p className="text-sm text-destructive">
              This recovery link is incomplete. Use the link from your deletion email.
            </p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : recovered ? (
            <p className="text-sm text-muted-foreground">
              You can sign in normally with your existing credentials.
            </p>
          ) : (
            <Button className="w-full" onClick={() => void recover()} disabled={recovering}>
              {recovering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {recovering ? 'Recovering account...' : 'Keep my account'}
            </Button>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link className="text-sm text-blue-600 hover:underline" to="/login">
            {recovered ? 'Sign in to Itemize' : 'Back to sign in'}
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
