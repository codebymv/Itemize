import { useState } from 'react';
import { Eye, MessageCircle, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { cn } from '@/lib/utils';

export interface ChatWidgetPreviewConfig {
  is_active: boolean;
  name: string;
  welcome_title: string;
  welcome_message: string;
  offline_message: string;
  placeholder_text: string;
  primary_color: string;
  text_color: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  show_branding: boolean;
  require_email: boolean;
  require_name: boolean;
  require_phone: boolean;
}

const safeHexColor = (value: string, fallback: string) =>
  /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function ChatWidgetPreview({ config }: { config: ChatWidgetPreviewConfig }) {
  const [availability, setAvailability] = useState<'online' | 'offline'>('online');
  const primaryColor = safeHexColor(config.primary_color, '#2563EB');
  const textColor = safeHexColor(config.text_color, '#FFFFFF');
  const isTop = config.position.startsWith('top');
  const isRight = config.position.endsWith('right');

  const launcher = (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg',
        isRight ? 'self-end' : 'self-start',
      )}
      style={{ backgroundColor: primaryColor, color: textColor }}
      aria-hidden="true"
    >
      <MessageCircle className="h-5 w-5" />
    </div>
  );

  const chatWindow = (
    <div className="flex h-[25rem] w-full flex-col overflow-hidden rounded-2xl border bg-white text-slate-950 shadow-xl">
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{config.name || 'Chat'}</p>
          <p className="text-xs text-white/85">{availability === 'online' ? 'Online' : 'Offline'}</p>
        </div>
        <X className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="border-b px-4 py-4 text-center">
        <p className="font-semibold">{config.welcome_title || 'Hi there!'}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {config.welcome_message || 'How can we help you today?'}
        </p>
      </div>

      {availability === 'offline' ? (
        <div className="border-b bg-slate-50 px-4 py-3 text-center text-xs leading-relaxed text-slate-600">
          {config.offline_message || 'We are currently offline. Please leave a message.'}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {config.require_name ? (
          <div className="rounded-lg border px-3 py-2 text-xs text-slate-400">Your name</div>
        ) : null}
        {config.require_email ? (
          <div className="rounded-lg border px-3 py-2 text-xs text-slate-400">Your email</div>
        ) : null}
        {config.require_phone ? (
          <div className="rounded-lg border px-3 py-2 text-xs text-slate-400">Your phone</div>
        ) : null}
        <div className="rounded-lg border px-3 py-2 text-xs text-slate-400">
          {config.placeholder_text || 'Type your message...'}
        </div>
        <div
          className="mt-auto flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold"
          style={{ backgroundColor: primaryColor, color: textColor }}
        >
          Start chat
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </div>

      {config.show_branding ? (
        <div className="border-t px-3 py-2 text-center text-[10px] text-slate-400">
          Powered by <span className="font-semibold text-slate-600">Itemize</span>
        </div>
      ) : null}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-center gap-2">
          <SectionCardTitle icon={Eye}>Live Preview</SectionCardTitle>
          {!config.is_active ? <Badge variant="secondary">Disabled</Badge> : null}
        </div>
        <div className="flex rounded-md bg-muted p-1" aria-label="Preview availability">
          <Button
            type="button"
            size="sm"
            variant={availability === 'online' ? 'secondary' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setAvailability('online')}
          >
            Online
          </Button>
          <Button
            type="button"
            size="sm"
            variant={availability === 'offline' ? 'secondary' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setAvailability('offline')}
          >
            Offline
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-[34rem] overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-950/35">
          <div className="flex h-9 items-center gap-1.5 border-b bg-white px-3 dark:bg-slate-900">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="ml-3 h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="space-y-3 p-5 opacity-55" aria-hidden="true">
            <div className="h-5 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="h-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>

          <div
            className={cn(
              'absolute flex w-[calc(100%-1.5rem)] max-w-[20rem] gap-3',
              isTop ? 'top-12 flex-col' : 'bottom-3 flex-col',
              isRight ? 'right-3' : 'left-3',
            )}
          >
            {isTop ? launcher : chatWindow}
            {isTop ? chatWindow : launcher}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
