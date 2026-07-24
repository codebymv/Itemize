import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPublicPage, type PublicPage } from '@/services/pagesApi';
import { buildLandingPageDocument } from '@/lib/landingPageDocument';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'password'; message?: string }
  | { kind: 'missing'; message: string }
  | { kind: 'ready'; page: PublicPage };

export default function PublicLandingPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [password, setPassword] = useState('');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async (candidatePassword?: string) => {
    setState({ kind: 'loading' });
    try {
      const page = await getPublicPage(slug, candidatePassword);
      setState({ kind: 'ready', page });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setState({
          kind: 'password',
          message: candidatePassword ? 'That password was not accepted.' : undefined,
        });
        return;
      }
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setState({
        kind: 'missing',
        message:
          status === 410
            ? 'This page has expired.'
            : status === 404
              ? 'This page is not available.'
              : 'This page could not be loaded.',
      });
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const previousTitle = document.title;
    document.title = state.page.seo_title || state.page.name;
    return () => {
      document.title = previousTitle;
    };
  }, [state]);

  const documentHtml = useMemo(
    () =>
      state.kind === 'ready'
        ? buildLandingPageDocument(state.page, window.location.origin)
        : '',
    [state],
  );

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (password) void load(password);
  };

  if (state.kind === 'loading') {
    return (
      <main className="min-h-screen grid place-items-center bg-background">
        <p className="text-muted-foreground">Loading page…</p>
      </main>
    );
  }

  if (state.kind === 'password') {
    return (
      <main className="min-h-screen grid place-items-center bg-muted/30 px-4">
        <form
          className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm space-y-4"
          onSubmit={submitPassword}
        >
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Password required</h1>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="current-password"
            aria-label="Page password"
          />
          {state.message && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          <Button className="w-full" type="submit" disabled={!password}>
            View page
          </Button>
        </form>
      </main>
    );
  }

  if (state.kind === 'missing') {
    return (
      <main className="min-h-screen grid place-items-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Page unavailable</h1>
          <p className="mt-2 text-muted-foreground">{state.message}</p>
        </div>
      </main>
    );
  }

  return (
    <iframe
      srcDoc={documentHtml}
      title={state.page.name}
      className="fixed inset-0 h-full w-full border-0 bg-white"
      sandbox="allow-forms allow-popups allow-scripts"
      referrerPolicy="no-referrer"
    />
  );
}
