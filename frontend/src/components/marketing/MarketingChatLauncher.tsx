import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import api from '@/lib/api';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type MarketingChatEvent = CustomEvent<{ prompt?: string }>;

const MAX_MESSAGE_LENGTH = 500;
const SUGGESTED_QUESTIONS = [
  'What does Itemize cost?',
  'Can I book a demo?',
  'How does the CRM work?',
  'Does it support automations?',
];

const GREETING =
  "Hi! I'm the Itemize assistant. Ask me about features, pricing, workflows, bookings, CRM, or getting started.";

const FALLBACK_REPLY =
  "Sorry, I couldn't reach the assistant just now. You can email support@itemize.cloud and the Itemize team will follow up.";

const LogoIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <img
    src="/icon.png"
    alt=""
    aria-hidden="true"
    className={`${className} object-contain`}
    draggable={false}
  />
);

const WhiteLogoMask = ({ className = 'h-6 w-6' }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={`${className} block bg-white`}
    style={{
      maskImage: 'url(/icon.png)',
      WebkitMaskImage: 'url(/icon.png)',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
);

const getEnabled = () => {
  const enabledValue = import.meta.env.VITE_MARKETING_CHAT_ENABLED as string | undefined;
  return enabledValue !== 'false';
};

const fetchSessionToken = async (): Promise<string | null> => {
  try {
    const response = await api.get('/api/marketing-chat/token');
    return response.data?.token ?? null;
  } catch {
    return null;
  }
};

const askMarketingChat = async (messages: ChatMessage[], token: string | null): Promise<string> => {
  const response = await api.post(
    '/api/marketing-chat/ask',
    { messages },
    {
      headers: token ? { 'X-Ask-Token': token } : undefined,
    },
  );
  return response.data?.reply ?? '';
};

export function MarketingChatLauncher() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!content || loading) return;

      if (!sessionToken.current) {
        sessionToken.current = await fetchSessionToken();
      }

      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
      setMessages(nextMessages);
      setInput('');
      setLoading(true);

      const askWithRetry = async () => {
        try {
          const reply = await askMarketingChat(nextMessages, sessionToken.current);
          void fetchSessionToken().then((token) => {
            sessionToken.current = token;
          });
          return reply;
        } catch (error: unknown) {
          const status = typeof error === 'object' && error !== null
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;

          if (status === 401) {
            sessionToken.current = await fetchSessionToken();
            if (sessionToken.current) {
              return askMarketingChat(nextMessages, sessionToken.current);
            }
          }

          throw error;
        }
      };

      try {
        const reply = await askWithRetry();
        setMessages((previous) => [
          ...previous,
          { role: 'assistant', content: reply || FALLBACK_REPLY },
        ]);
      } catch {
        setMessages((previous) => [
          ...previous,
          { role: 'assistant', content: FALLBACK_REPLY },
        ]);
      } finally {
        setLoading(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [loading, messages],
  );

  useEffect(() => {
    if (!open) return;
    void fetchSessionToken().then((token) => {
      sessionToken.current = token;
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    if (open) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const prompt = (event as MarketingChatEvent).detail?.prompt || 'Talk to Sales';
      setOpen(true);
      setInput(prompt);
    };

    window.addEventListener('itemize:open-marketing-chat', handleOpen);
    return () => window.removeEventListener('itemize:open-marketing-chat', handleOpen);
  }, []);

  if (!getEnabled()) {
    return null;
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask about Itemize"
          className="fixed bottom-4 right-4 z-[70] inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-500/25 transition-all duration-200 hover:scale-[1.03] hover:from-blue-600 hover:to-indigo-700"
        >
          <WhiteLogoMask className="h-[22px] w-[22px]" />
          <span className="hidden sm:inline">Ask about Itemize</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Ask about Itemize"
          className="fixed inset-x-0 bottom-0 z-[70] flex h-[82vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-400/20 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[520px] sm:w-[380px] sm:rounded-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-3 bg-gradient-to-b from-blue-500 to-indigo-600 px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center">
              <WhiteLogoMask className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Ask about Itemize</p>
              <p className="text-xs leading-tight text-white/80">Features, pricing & setup</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-auto rounded-lg p-1.5 text-white/90 transition-colors hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
            <div className="flex gap-2">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-blue-100">
                <LogoIcon className="h-5 w-5" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                {GREETING}
              </div>
            </div>

            {messages.map((message, index) => (
              message.role === 'user' ? (
                <div key={`${message.role}-${index}`} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-b from-blue-500 to-indigo-600 px-3 py-2 text-sm text-white shadow-sm">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={`${message.role}-${index}`} className="flex gap-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-blue-100">
                    <LogoIcon className="h-5 w-5" />
                  </div>
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                    {message.content}
                  </div>
                </div>
              )
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-blue-100">
                  <LogoIcon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-3 py-3 shadow-sm">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" />
                </div>
              </div>
            )}

            {messages.length === 0 && !loading && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void send(question)}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="Ask about Itemize..."
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={loading}
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 text-white transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default MarketingChatLauncher;
