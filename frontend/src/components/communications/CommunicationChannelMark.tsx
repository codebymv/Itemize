import { Mail, MessageSquareText, MessagesSquare } from 'lucide-react';
import {
  IntegrationProviderMark,
  type IntegrationProviderMarkName,
} from '@/components/brand/IntegrationProviderMark';
import { cn } from '@/lib/utils';

interface CommunicationChannelMarkProps {
  channel?: string;
  className?: string;
}

const providerForChannel = (channel?: string): IntegrationProviderMarkName | null => {
  if (channel === 'facebook') return 'messenger';
  if (channel === 'instagram') return 'instagram';
  return null;
};

export function WebsiteChatMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-5 w-5 shrink-0', className)}
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="19" height="16" rx="2.5" />
      <path d="M2.5 7.5h19" />
      <path d="M9 11.25h7.25a2 2 0 0 1 2 2v.75a2 2 0 0 1-2 2H13l-2.5 2v-2H9a2 2 0 0 1-2-2v-.75a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function CommunicationChannelMark({ channel, className }: CommunicationChannelMarkProps) {
  const provider = providerForChannel(channel);
  if (provider) {
    return <IntegrationProviderMark provider={provider} className={className} />;
  }

  if (channel === 'sms') {
    return (
      <MessageSquareText
        className={cn('shrink-0 text-green-600 dark:text-green-400', className)}
        aria-hidden="true"
      />
    );
  }

  if (channel === 'email') {
    return (
      <Mail
        className={cn('shrink-0 text-blue-600 dark:text-blue-400', className)}
        aria-hidden="true"
      />
    );
  }

  if (channel === 'chat') {
    return <WebsiteChatMark className={cn('text-blue-600 dark:text-blue-400', className)} />;
  }

  return (
    <MessagesSquare
      className={cn('shrink-0 text-muted-foreground', className)}
      aria-hidden="true"
    />
  );
}
