import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import { avatarImageUrl } from '@/lib/avatars';
import { cn } from '@/lib/utils';
import { getAvatarCatalogViaGraphql, updateViewerAvatarViaGraphql } from '@/services/authGraphql';

export function AvatarSelector() {
  const { currentUser } = useAuthState();
  const { updateCurrentUser } = useAuthActions();
  const userRef = useRef(currentUser);
  useEffect(() => { userRef.current = currentUser; }, [currentUser]);
  const { pending, run } = useSingleFlightAction();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const catalog = useQuery({ queryKey: ['avatar-catalog'], queryFn: getAvatarCatalogViaGraphql, staleTime: Infinity, retry: false });
  const selected = currentUser?.avatarKey ?? null;
  const choose = (key: string | null) => run(async () => {
    if (!currentUser || key === selected) return;
    const userId = currentUser.uid;
    setError(''); setMessage('');
    try {
      const user = await updateViewerAvatarViaGraphql(key);
      if (userRef.current?.uid !== userId) return;
      updateCurrentUser({ avatarKey: user.avatarKey ?? null, photoURL: avatarImageUrl(user.avatarKey) });
      setMessage('Saved');
    } catch {
      if (userRef.current?.uid === userId) setError('Avatar not saved. Check your connection and try again.');
    }
  });
  const options = [{ key: null, name: 'Initials' }, ...(catalog.data ?? [])];
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Avatar</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose how you appear to teammates across your organizations.</p>
      </div>
      <div role="group" aria-label="Avatar" aria-busy={pending} className="flex flex-wrap gap-2">
        {options.map(option => (
          <button key={option.key ?? 'initials'} type="button" aria-pressed={selected === option.key}
            aria-label={option.name} disabled={pending || !currentUser}
            onClick={() => void choose(option.key)}
            className={cn('interaction-control relative flex w-24 flex-col items-center gap-2 rounded-lg border p-3 text-xs disabled:opacity-60',
              selected === option.key ? 'border-primary bg-accent' : 'border-border bg-background')}>
            <UserAvatar avatarKey={option.key} name={currentUser?.name} email={currentUser?.email} className="h-12 w-12" />
            <span>{option.name}</span>
            {selected === option.key && <Check aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5 text-icon-accent" />}
          </button>
        ))}
      </div>
      {catalog.isPending && <p role="status" className="text-sm text-muted-foreground">Loading avatars...</p>}
      {catalog.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Avatars could not be loaded. <Button size="sm" variant="outline" disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>Retry</Button>
      </div>}
      <p role={error ? 'alert' : 'status'} className="min-h-5 text-sm text-muted-foreground">{pending ? 'Saving avatar...' : error || message}</p>
    </div>
  );
}
