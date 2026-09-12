import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { avatarImageUrl, userInitials } from '@/lib/avatars';
import { cn } from '@/lib/utils';

/** Decorative identity beside a name or inside an explicitly labeled control. */
export function UserAvatar({ avatarKey, name, email, className }: {
  avatarKey?: string | null;
  name?: string | null;
  email?: string | null;
  className?: string;
}) {
  const src = avatarImageUrl(avatarKey);
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  return (
    <Avatar aria-hidden="true" className={cn('border border-border text-sm font-medium', className)}>
      {src && src !== failedSrc ? (
        <img src={src} alt="" className="h-full w-full object-cover" decoding="async"
          onError={() => setFailedSrc(src)} />
      ) : (
        <AvatarFallback className="bg-muted text-foreground">{userInitials(name, email)}</AvatarFallback>
      )}
    </Avatar>
  );
}
