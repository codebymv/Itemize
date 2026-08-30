import { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { LiveServicePreview, ServicePreviewBrowser } from '@/components/preview/LiveServicePreview';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface ChatWidgetPreviewConfig {
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
    <LiveServicePreview
      controls={(
        <Tabs
          value={availability}
          onValueChange={(value) => {
            if (value === 'online' || value === 'offline') setAvailability(value);
          }}
        >
          <TabsList className="h-8 shrink-0" aria-label="Preview availability">
            <TabsTrigger value="online" className="h-6 px-2.5 py-1 text-xs">Online</TabsTrigger>
            <TabsTrigger value="offline" className="h-6 px-2.5 py-1 text-xs">Offline</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    >
        <ServicePreviewBrowser>
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
              isTop ? 'top-3 flex-col' : 'bottom-3 flex-col',
              isRight ? 'right-3' : 'left-3',
            )}
          >
            {isTop ? launcher : chatWindow}
            {isTop ? chatWindow : launcher}
          </div>
        </ServicePreviewBrowser>
    </LiveServicePreview>
  );
}
