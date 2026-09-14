import React, { useCallback, useEffect, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { GoogleOAuthGate } from '@/components/auth/GoogleOAuthGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { LoadingState } from '@/components/LoadingState';
import { useAuthState } from '@/contexts/AuthContext';
import {
  adminMfaStatus,
  beginAdminMfaSetup,
  confirmAdminMfaSetup,
  lockAdminMfa,
  reauthenticateAdmin,
  recoverAdminMfa,
  verifyAdminMfa,
  type AdminMfaSetup,
  type AdminMfaStatus,
} from '@/services/adminMfaGraphql';

function GoogleConfirmation({
  onToken,
  onError,
  disabled,
}: {
  onToken: (token: string) => void;
  onError: () => void;
  disabled: boolean;
}) {
  const login = useGoogleLogin({
    onSuccess: (result) => onToken(result.access_token),
    onError,
    onNonOAuthError: onError,
    prompt: 'consent',
  });
  return (
    <Button disabled={disabled} onClick={() => login()}>
      Confirm with Google
    </Button>
  );
}

export function AdminMfaGate({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuthState();
  const [status, setStatus] = useState<AdminMfaStatus>();
  const [setup, setSetup] = useState<AdminMfaSetup>();
  const [codes, setCodes] = useState<string[]>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setStatus(await adminMfaStatus());
    } catch {
      setStatus(undefined);
      setError('Could not verify administrator access. Try again.');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!setup) return;
    const timer = setTimeout(
      () => {
        setSetup(undefined);
        setCode('');
        setError('Setup expired. Start again.');
      },
      Math.max(0, Date.parse(setup.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [setup]);
  useEffect(() => {
    if (!status?.expiresAt) return;
    const timer = setTimeout(
      () =>
        setStatus((current) =>
          current ? { ...current, verified: false } : current,
        ),
      Math.max(0, Date.parse(status.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [status?.expiresAt]);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setCode('');
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to complete verification.',
      );
    } finally {
      setBusy(false);
      setPassword('');
    }
  };
  if (!status)
    return error ? (
      <div role="alert" className="space-y-3">
        <p>{error}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </div>
    ) : (
      <LoadingState kind="section" message="Checking administrator access" />
    );
  if (status.verified && !manage && !codes && !setup)
    return (
      <>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void act(() => lockAdminMfa())}
          >
            Lock admin access
          </Button>
          <Button variant="ghost" onClick={() => setManage(true)}>
            Authenticator settings
          </Button>
        </div>
        {children}
      </>
    );
  const needsReauth =
    (!status.enrolled || recovery || manage || status.recovery) &&
    !status.reauthenticated;
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>
          {codes
            ? 'Save your recovery codes'
            : setup
              ? 'Connect your authenticator'
              : 'Secure administrator access'}
        </CardTitle>
        <CardDescription>
          {codes
            ? 'Store these somewhere safe. Each code works once and will not be shown again.'
            : setup
              ? 'Scan this QR code with your authenticator app, then enter its six-digit code.'
              : 'Use your authenticator to access Itemize administration. Your workspace remains available.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {status.sessionRequired ? (
          <p>
            Sign out and sign in again to secure this session, then return here.
          </p>
        ) : codes ? (
          <>
            <div
              className="rounded-md border bg-muted p-3 font-mono text-xs"
              aria-label="Recovery codes"
            >
              {codes.map((value) => (
                <p className="break-all py-1" key={value}>
                  {value}
                </p>
              ))}
            </div>
            <Button
              onClick={() => {
                setCodes(undefined);
                setManage(false);
                setRecovery(false);
              }}
            >
              I have saved my recovery codes
            </Button>
            <p className="text-sm text-muted-foreground">
              You will enter a new authenticator code to unlock admin access.
            </p>
          </>
        ) : needsReauth ? (
          <>
            <p className="text-sm">
              Confirm your sign-in before changing administrator security.
            </p>
            {currentUser?.provider === 'google' ? (
              <GoogleOAuthGate>
                <GoogleConfirmation
                  disabled={busy}
                  onToken={(token) =>
                    void act(() => reauthenticateAdmin(undefined, token))
                  }
                  onError={() =>
                    setError('Google confirmation was not completed.')
                  }
                />
              </GoogleOAuthGate>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(() => reauthenticateAdmin(password));
                }}
              >
                <Label htmlFor="mfa-password">Current password</Label>
                <Input
                  id="mfa-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button disabled={busy || !password} type="submit">
                  {busy ? 'Confirming…' : 'Confirm sign-in'}
                </Button>
              </form>
            )}
          </>
        ) : setup ? (
          <>
            <img
              src={setup.qrDataUrl}
              width={240}
              height={240}
              className="mx-auto max-w-full"
              alt="Authenticator setup QR code"
            />
            <details>
              <summary className="cursor-pointer text-sm">
                Enter a setup key manually
              </summary>
              <p className="break-all rounded-md bg-muted p-3 font-mono text-sm">
                {setup.secret}
              </p>
            </details>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  const values = await confirmAdminMfaSetup(code);
                  setSetup(undefined);
                  setCodes(values);
                });
              }}
            >
              <Label htmlFor="mfa-code">Authenticator code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Confirm authenticator'}
              </Button>
            </form>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSetup(undefined);
                setCode('');
              }}
            >
              Cancel setup
            </Button>
          </>
        ) : !status.enrolled || status.recovery || manage ? (
          <>
            {manage && !status.verified && !status.recovery ? (
              <p>
                Return to verification and enter your current authenticator code
                before replacing it.
              </p>
            ) : (
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => setSetup(await beginAdminMfaSetup()))
                }
              >
                {busy
                  ? 'Preparing…'
                  : status.enrolled
                    ? 'Replace authenticator'
                    : 'Set up authenticator'}
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              Replacing your authenticator invalidates old recovery codes and
              signs out other sessions.
            </p>
            {manage && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await lockAdminMfa();
                    setManage(false);
                  })
                }
              >
                Verify authenticator again
              </Button>
            )}
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                if (recovery) {
                  await recoverAdminMfa(code.trim());
                  setRecovery(false);
                } else {
                  await verifyAdminMfa(code.trim());
                }
              });
            }}
          >
            <Label htmlFor="mfa-challenge">
              {recovery ? 'Recovery code' : 'Authenticator code'}
            </Label>
            <Input
              id="mfa-challenge"
              autoComplete={recovery ? 'off' : 'one-time-code'}
              inputMode={recovery ? 'text' : 'numeric'}
              maxLength={recovery ? 32 : 6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" disabled={busy || !code}>
              {busy
                ? 'Verifying…'
                : recovery
                  ? 'Recover authenticator'
                  : 'Unlock admin access'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setRecovery(!recovery);
                setCode('');
                setError('');
              }}
            >
              {recovery ? 'Use authenticator instead' : 'Use a recovery code'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
