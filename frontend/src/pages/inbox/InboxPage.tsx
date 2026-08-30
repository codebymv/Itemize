import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArrowLeft, Inbox, MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Conversation } from '@/types';
import {
    getConversations,
    getConversation,
    updateConversation,
    sendMessage,
    markConversationRead,
    ConversationsQueryParams,
} from '@/services/conversationsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    HeaderAction,
    HeaderCombinedQuery,
    HeaderFilters,
    HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { cn } from '@/lib/utils';
import { sendEmailToContact } from '@/services/emailApi';
import { sendSmsToContact } from '@/services/smsApi';
import { NewMessageDialog } from './NewMessageDialog';
import { plainTextToEmailHtml } from './messageContent';
import { sendMessage as sendSocialMessage } from '@/services/socialApi';
import { sendAgentMessage as sendAgentChatMessage } from '@/services/chatWidgetApi';
import { CommunicationChannelMark } from '@/components/communications/CommunicationChannelMark';

const CONVERSATION_STATUSES: Array<NonNullable<ConversationsQueryParams['status']>> = ['open', 'closed', 'snoozed', 'all'];

const isConversationStatus = (value: string): value is NonNullable<ConversationsQueryParams['status']> =>
    CONVERSATION_STATUSES.includes(value as NonNullable<ConversationsQueryParams['status']>);

const safeAttachmentUrl = (value: unknown): string | null =>
    typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;

export function InboxPage() {
    const { toast } = useToast();
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('inbox');

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [loading, setLoading] = useState(true);
    const [messageLoading, setMessageLoading] = useState(false);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [statusFilter, setStatusFilter] = useState<string>('open');
    const [channelFilter, setChannelFilter] = useState<NonNullable<ConversationsQueryParams['channel']>>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [composerOpen, setComposerOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const linkedConversationId = /^[1-9]\d*$/.test(searchParams.get('conversation') ?? '')
        ? Number(searchParams.get('conversation'))
        : null;

    const setConversationRoute = useCallback((conversationId: number | null) => {
        const next = new URLSearchParams(searchParams);
        if (conversationId) next.set('conversation', String(conversationId));
        else next.delete('conversation');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!initError) return;
        setLoading(false);
    }, [initError]);

    const fetchConversations = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError('');
        try {
            const params: ConversationsQueryParams = { organization_id: organizationId };
            if (statusFilter !== 'all' && isConversationStatus(statusFilter)) params.status = statusFilter;
            if (channelFilter !== 'all') params.channel = channelFilter;
            const response = await getConversations(params);
            setConversations(response.conversations);
        } catch {
            setLoadError('We could not load your conversations. Try again without leaving the inbox.');
        } finally {
            setLoading(false);
        }
    }, [channelFilter, organizationId, statusFilter]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    useEffect(() => {
        if (!organizationId || !linkedConversationId) return;
        let active = true;
        setMessageLoading(true);
        void (async () => {
            try {
                const conversation = await getConversation(linkedConversationId, organizationId);
                if (conversation.unread_count > 0) {
                    await markConversationRead(linkedConversationId, organizationId);
                }
                if (!active) return;
                setSelectedConversation(conversation);
                if (conversation.unread_count > 0) {
                    setConversations(previous => previous.map(item => (
                        item.id === linkedConversationId ? { ...item, unread_count: 0 } : item
                    )));
                }
            } catch {
                if (!active) return;
                toast({
                    title: 'Conversation unavailable',
                    description: 'It may have been removed or you may no longer have access.',
                    variant: 'destructive',
                });
                setConversationRoute(null);
            } finally {
                if (active) setMessageLoading(false);
            }
        })();
        return () => { active = false; };
    }, [linkedConversationId, organizationId, setConversationRoute, toast]);

    const handleSelectConversation = async (conv: Conversation) => {
        if (!organizationId) return;
        setMessageLoading(true);
        try {
            const fullConv = await getConversation(conv.id, organizationId);
            setSelectedConversation(fullConv);
            setConversationRoute(conv.id);
            if (conv.unread_count > 0) {
                await markConversationRead(conv.id, organizationId);
                setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load conversation', variant: 'destructive' });
        } finally {
            setMessageLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!selectedConversation || !organizationId || !newMessage.trim()) return;
        setSendingMessage(true);
        try {
            const content = newMessage.trim();
            if ((selectedConversation.channel === 'email' || selectedConversation.channel === 'sms') && !selectedConversation.contact_id) {
                throw new Error('This conversation is not linked to a contact.');
            }

            if (selectedConversation.channel === 'email') {
                const currentSubject = selectedConversation.subject?.trim() || 'Message from Itemize';
                const result = await sendEmailToContact({
                    contact_id: selectedConversation.contact_id!,
                    subject: /^re:/i.test(currentSubject) ? currentSubject : `Re: ${currentSubject}`,
                    body_text: content,
                    body_html: plainTextToEmailHtml(content),
                }, organizationId);
                if (!result.success) throw new Error(result.error || 'The email could not be queued.');
            } else if (selectedConversation.channel === 'sms') {
                const result = await sendSmsToContact({
                    contact_id: selectedConversation.contact_id!,
                    message: content,
                    organization_id: organizationId,
                });
                if (!result.success) throw new Error(result.error || 'The SMS could not be queued.');
            } else if (selectedConversation.channel === 'facebook' || selectedConversation.channel === 'instagram') {
                if (!selectedConversation.social_conversation_id) {
                    throw new Error('This provider conversation is not available for replies.');
                }
                await sendSocialMessage(
                    selectedConversation.social_conversation_id,
                    content,
                    organizationId,
                );
            } else if (selectedConversation.channel === 'chat') {
                if (!selectedConversation.chat_session_id || selectedConversation.chat_session_status !== 'active') {
                    throw new Error('This website chat has ended and can no longer receive replies.');
                }
                await sendAgentChatMessage(
                    selectedConversation.chat_session_id,
                    content,
                    organizationId,
                );
            } else {
                const message = await sendMessage(
                    selectedConversation.id,
                    { content, channel: selectedConversation.channel || 'internal' },
                    organizationId,
                );
                setSelectedConversation(prev => prev ? { ...prev, messages: [...(prev.messages || []), message] } : null);
            }
            setNewMessage('');
            if (['email', 'sms', 'facebook', 'instagram', 'chat'].includes(selectedConversation.channel)) {
                const refreshed = await getConversation(selectedConversation.id, organizationId);
                setSelectedConversation(refreshed);
                toast({ title: 'Message queued' });
            }
            void fetchConversations();
        } catch (error) {
            toast({
                title: 'Message not sent',
                description: error instanceof Error ? error.message : 'Try again.',
                variant: 'destructive',
            });
        } finally {
            setSendingMessage(false);
        }
    };

    const handleNewMessageQueued = async (conversationId?: number) => {
        await fetchConversations();
        if (!conversationId || !organizationId) return;
        try {
            const conversation = await getConversation(conversationId, organizationId);
            setSelectedConversation(conversation);
            setConversationRoute(conversationId);
        } catch {
            // The refreshed list remains usable if opening the new thread races replication.
        }
    };

    const handleCloseConversation = async () => {
        if (!selectedConversation || !organizationId) return;
        try {
            await updateConversation(selectedConversation.id, { status: 'closed' }, organizationId);
            setSelectedConversation(null);
            setConversationRoute(null);
            fetchConversations();
            toast({ title: 'Closed', description: 'Conversation closed successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to close conversation', variant: 'destructive' });
        }
    };

    const getContactName = (conv: Conversation) => {
        if (conv.contact_first_name || conv.contact_last_name) {
            return `${conv.contact_first_name || ''} ${conv.contact_last_name || ''}`.trim();
        }
        return conv.provider_participant_name
            || conv.provider_participant_username
            || conv.chat_visitor_name
            || conv.chat_visitor_email
            || conv.chat_visitor_phone
            || conv.subject
            || conv.contact_email
            || conv.contact_phone
            || 'Unknown';
    };

    const getChannelInfo = (channel?: string): {
        label: string;
        color: string;
        bgColor: string;
    } => {
        switch (channel) {
            case 'sms':
                return {
                    label: 'SMS',
                    color: 'text-green-600 dark:text-green-400',
                    bgColor: 'bg-green-100 dark:bg-green-900',
                };
            case 'email':
                return {
                    label: 'Email',
                    color: 'text-blue-600 dark:text-blue-400',
                    bgColor: 'bg-blue-100 dark:bg-blue-900',
                };
            case 'chat':
                return {
                    label: 'Website chat',
                    color: 'text-blue-600 dark:text-blue-400',
                    bgColor: 'bg-blue-100 dark:bg-blue-950',
                };
            case 'facebook':
                return {
                    label: 'Messenger',
                    color: 'text-blue-600 dark:text-blue-400',
                    bgColor: 'bg-blue-100 dark:bg-blue-950',
                };
            case 'instagram':
                return {
                    label: 'Instagram',
                    color: 'text-fuchsia-600 dark:text-fuchsia-400',
                    bgColor: 'bg-fuchsia-100 dark:bg-fuchsia-950',
                };
            default:
                return {
                    label: 'Internal',
                    color: 'text-muted-foreground',
                    bgColor: 'bg-muted',
                };
        }
    };

    const channelMark = (channel?: string, className = 'h-5 w-5') => {
        const channelInfo = getChannelInfo(channel);
        return (
            <CommunicationChannelMark
                channel={channel}
                className={cn(className, channelInfo.color)}
            />
        );
    };

    const statusSelect = (compact = false) => (
        <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
                aria-label="Conversation status"
                className={cn('h-11', compact ? 'w-full' : 'w-36')}
            >
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="snoozed">Snoozed</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
        </Select>
    );

    const channelSelect = (compact = false) => (
        <Select
            value={channelFilter}
            onValueChange={(value) => setChannelFilter(value as NonNullable<ConversationsQueryParams['channel']>)}
        >
            <SelectTrigger
                aria-label="Conversation channel"
                className={cn('h-11', compact ? 'w-full' : 'w-40')}
            >
                <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="facebook">Messenger</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
            </SelectContent>
        </Select>
    );

    const filterCount = Number(statusFilter !== 'open') + Number(channelFilter !== 'all');
    const queryCount = filterCount + Number(Boolean(searchQuery.trim()));
    const pageError = initError || loadError;

    return (
        <PageLayout
            title="INBOX"
            icon={<MessageSquare className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            frame="split"
            className="h-[calc(100dvh-12.25rem)] md:h-[calc(100dvh-57px)]"
            headerTools={{
                search: (
                    <HeaderSearch
                        label="Search conversations"
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        width="wide"
                    />
                ),
                filters: (
                    <HeaderFilters
                        label="Filter conversations"
                        activeCount={filterCount}
                        compactChildren={(
                            <div className="space-y-3">
                                {statusSelect(true)}
                                {channelSelect(true)}
                            </div>
                        )}
                        preferExpanded
                    >
                        <div className="flex gap-2">
                            {statusSelect()}
                            {channelSelect()}
                        </div>
                    </HeaderFilters>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter conversations"
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        activeCount={queryCount}
                    >
                        <div className="space-y-3">
                            {statusSelect(true)}
                            {channelSelect(true)}
                        </div>
                    </HeaderCombinedQuery>
                ),
                primaryAction: (
                    <HeaderAction
                        label="New message"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => setComposerOpen(true)}
                    />
                ),
            }}
        >
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.inbox}
            />
            {organizationId ? (
                <NewMessageDialog
                    open={composerOpen}
                    organizationId={organizationId}
                    onOpenChange={setComposerOpen}
                    onQueued={handleNewMessageQueued}
                />
            ) : null}

                {pageError ? (
                    <div className="flex h-full items-center justify-center p-6">
                        {initError ? (
                            <OrganizationErrorState title="Unable to load inbox" icon={Inbox} />
                        ) : (
                            <ErrorState
                                kind="section"
                                icon={Inbox}
                                title="Unable to load inbox"
                                description={pageError}
                                onAction={() => void fetchConversations()}
                            />
                        )}
                    </div>
                ) : <div className="flex h-full min-h-0">
                    {/* Conversations list */}
                    <div className={cn(
                        'min-w-0 flex-col border-r md:flex md:w-80 lg:w-96',
                        selectedConversation ? 'hidden' : 'flex w-full',
                    )}>
                        {loading ? (
                            <div className="p-4 space-y-3">
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                            </div>
                        ) : (() => {
                            const filteredConversations = conversations.filter(conv => {
                                if (!searchQuery) return true;
                                const query = searchQuery.toLowerCase();
                                const contactName = `${conv.contact_first_name || ''} ${conv.contact_last_name || ''}`.toLowerCase();
                                const email = (conv.contact_email || '').toLowerCase();
                                const providerName = `${conv.provider_participant_name || ''} ${conv.provider_participant_username || ''} ${conv.provider_account_name || ''}`.toLowerCase();
                                const chatName = `${conv.chat_visitor_name || ''} ${conv.chat_visitor_email || ''} ${conv.chat_visitor_phone || ''} ${conv.chat_widget_name || ''}`.toLowerCase();
                                const preview = (conv.last_message_preview || '').toLowerCase();
                                return contactName.includes(query) || email.includes(query) || providerName.includes(query) || chatName.includes(query) || preview.includes(query);
                            });
                            return filteredConversations.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <EmptyState
                                        icon={Inbox}
                                        kind={queryCount > 0 ? 'results' : 'passive'}
                                        title={searchQuery ? 'No matches' : 'No conversations'}
                                        description={queryCount > 0 ? undefined : 'Customer conversations appear here.'}
                                        actionLabel={queryCount > 0 ? 'Clear filters' : undefined}
                                        onAction={queryCount > 0 ? () => {
                                            setSearchQuery('');
                                            setStatusFilter('open');
                                            setChannelFilter('all');
                                        } : undefined}
                                    />
                                </div>
                            ) : (
                                <ScrollArea className="flex-1">
                                    <div className="w-px min-w-full">
                                    {filteredConversations.map((conv) => (
                                    <button
                                        type="button"
                                        key={conv.id}
                                        className={`w-full border-b p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedConversation?.id === conv.id ? 'bg-muted' : ''
                                            }`}
                                        onClick={() => void handleSelectConversation(conv)}
                                    >
                                        <div className="flex items-start gap-3">
                                            {(() => {
                                                const channelInfo = getChannelInfo(conv.channel);
                                                return (
                                                    <div className={`w-10 h-10 rounded-full ${channelInfo.bgColor} flex items-center justify-center flex-shrink-0`}>
                                                        {channelMark(conv.channel)}
                                                    </div>
                                                );
                                            })()}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <p className="font-medium truncate">{getContactName(conv)}</p>
                                                        <Badge variant="outline" className="shrink-0 text-xs">
                                                            {getChannelInfo(conv.channel).label}
                                                        </Badge>
                                                    </div>
                                                    {conv.unread_count > 0 && (
                                        <Badge className="flex-shrink-0 text-xs">{conv.unread_count}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground truncate">{conv.last_message_preview || 'No messages'}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-xs text-muted-foreground">
                                                        {conv.last_message_at ? format(parseISO(conv.last_message_at), 'MMM d, h:mm a') : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                                    </div>
                            </ScrollArea>
                            );
                        })()}
                    </div>

                    {/* Message thread */}
                    <div className={cn(
                        'min-w-0 flex-1 flex-col',
                        selectedConversation ? 'flex' : 'hidden md:flex',
                    )}>
                        {!selectedConversation ? (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                                    <p>Select a conversation to view messages</p>
                                </div>
                            </div>
                        ) : messageLoading ? (
                            <div className="flex-1 p-6">
                                <Skeleton className="h-12 w-1/3 mb-4" />
                                <Skeleton className="h-24 w-full mb-2" />
                                <Skeleton className="h-24 w-3/4" />
                            </div>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="flex items-center justify-between gap-3 border-b p-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11 shrink-0 md:hidden"
                                            aria-label="Back to conversations"
                                            onClick={() => {
                                                setSelectedConversation(null);
                                                setConversationRoute(null);
                                            }}
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                        {(() => {
                                            const channelInfo = getChannelInfo(selectedConversation.channel);
                                            return (
                                                <div className={`w-10 h-10 rounded-full ${channelInfo.bgColor} flex items-center justify-center`}>
                                                    {channelMark(selectedConversation.channel)}
                                                </div>
                                            );
                                        })()}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h2 className="truncate font-medium">{getContactName(selectedConversation)}</h2>
                                                <Badge variant="outline" className="shrink-0 text-xs">
                                                    {getChannelInfo(selectedConversation.channel).label}
                                                </Badge>
                                            </div>
                                            <p className="truncate text-sm text-muted-foreground">
                                                {selectedConversation.channel === 'sms'
                                                    ? selectedConversation.contact_phone || selectedConversation.contact_email
                                                    : selectedConversation.channel === 'facebook' || selectedConversation.channel === 'instagram'
                                                        ? selectedConversation.provider_account_name
                                                        : selectedConversation.channel === 'chat'
                                                            ? `${selectedConversation.chat_widget_name || 'Website chat'} · ${selectedConversation.chat_session_status === 'active' ? 'Live' : 'Ended'}`
                                                            : selectedConversation.contact_email}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={handleCloseConversation}>
                                            <Archive className="h-4 w-4 mr-2" />Close
                                        </Button>
                                    </div>
                                </div>

                                {/* Messages */}
                                <ScrollArea className="flex-1 p-4">
                                    <div className="space-y-4">
                                                        {(selectedConversation.messages || []).map((msg) => {
                                                            const isSms = msg.channel === 'sms' || selectedConversation.channel === 'sms';
                                                            const isOutbound = msg.sender_type === 'user';
                                                            const attachmentUrl = safeAttachmentUrl(msg.metadata?.media_url)
                                                                || safeAttachmentUrl(msg.metadata?.attachment_url);
                                                            const attachmentType = typeof msg.metadata?.media_type === 'string'
                                                                ? msg.metadata.media_type
                                                                : typeof msg.metadata?.content_type === 'string'
                                                                    ? msg.metadata.content_type
                                                                    : '';
                                                            const attachmentName = typeof msg.metadata?.media_filename === 'string'
                                                                ? msg.metadata.media_filename
                                                                : typeof msg.metadata?.attachment_name === 'string'
                                                                    ? msg.metadata.attachment_name
                                                                    : 'Open attachment';
                                                            return (
                                                                <div
                                                                    key={msg.id}
                                                                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                                                                >
                                                                    <div
                                                                        className={`max-w-[70%] rounded-lg p-3 ${isOutbound
                                                                            ? isSms ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                                                                            : 'bg-muted'
                                                                            }`}
                                                                    >
                                                                        {isSms && !isOutbound && (
                                                                            <div className="flex items-center gap-1 mb-1">
                                                                                <CommunicationChannelMark channel="sms" className="h-3 w-3" />
                                                                                <span className="text-xs text-green-600 font-medium">SMS</span>
                                                                            </div>
                                                                        )}
                                                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                                        {attachmentUrl ? (
                                                                            attachmentType.toLowerCase().includes('image') ? (
                                                                                <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                                                                                    <img
                                                                                        src={attachmentUrl}
                                                                                        alt={attachmentName}
                                                                                        className="max-h-64 max-w-full rounded-md object-contain"
                                                                                    />
                                                                                </a>
                                                                            ) : (
                                                                                <a
                                                                                    href={attachmentUrl}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="mt-2 block text-sm underline underline-offset-2"
                                                                                >
                                                                                    {attachmentName}
                                                                                </a>
                                                                            )
                                                                        ) : null}
                                                                        <div className={`flex items-center gap-2 mt-1 ${isOutbound ? (isSms ? 'text-green-100' : 'text-blue-100') : 'text-muted-foreground'}`}>
                                                                            <p className="text-xs">
                                                                                {format(parseISO(msg.created_at), 'h:mm a')}
                                                                            </p>
                                                                            {isSms && isOutbound && (
                                                                                <CommunicationChannelMark channel="sms" className="h-3 w-3 text-current" />
                                                                            )}
                                                                            {isOutbound && typeof msg.metadata?.delivery_status === 'string' ? (
                                                                                <span className="text-xs capitalize">
                                                                                    {msg.metadata.delivery_status.replace('_', ' ')}
                                                                                </span>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                    </div>
                                </ScrollArea>

                                {/* Input */}
                                <div className="border-t p-4">
                                    {selectedConversation.channel === 'chat' && selectedConversation.chat_session_status !== 'active' ? (
                                        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                                            This website chat has ended. Start a new email or SMS conversation to follow up.
                                        </div>
                                    ) : <>
                                    {selectedConversation.channel === 'sms' && (
                                        <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <CommunicationChannelMark channel="sms" className="h-3 w-3" />
                                                <span>SMS Message</span>
                                            </div>
                                            <span className={newMessage.length > 160 ? 'text-orange-500' : ''}>
                                                {newMessage.length}/160 {newMessage.length > 160 && `(${Math.ceil(newMessage.length / 153)} segments)`}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex min-w-0 gap-2">
                                        <Textarea
                                            placeholder={selectedConversation.channel === 'sms'
                                                ? 'Type your SMS message...'
                                                : `Reply via ${getChannelInfo(selectedConversation.channel).label}...`}
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            className="resize-none"
                                            rows={2}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                        />
                                        <Button
                                            onClick={handleSendMessage}
                                            disabled={sendingMessage || !newMessage.trim()}
                                            className={selectedConversation.channel === 'sms' ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}
                                        >
                                            Send
                                        </Button>
                                    </div>
                                    </>}
                                </div>
                            </>
                        )}
                    </div>
                </div>}
        </PageLayout>
    );
}

export default InboxPage;
