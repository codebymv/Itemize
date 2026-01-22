import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { format, parseISO } from 'date-fns';
import { Search, Inbox, MessageSquare, MoreHorizontal, X, Check, User, Clock, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useHeader } from '@/contexts/HeaderContext';
import { Conversation, Message } from '@/types';
import {
    getConversations,
    getConversation,
    updateConversation,
    sendMessage,
    markConversationRead,
    ConversationsQueryParams,
} from '@/services/conversationsApi';
import { ensureDefaultOrganization } from '@/services/contactsApi';

export function InboxPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [loading, setLoading] = useState(true);
    const [messageLoading, setMessageLoading] = useState(false);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('open');
    const [newMessage, setNewMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <h1
                    className="text-xl font-semibold italic truncate ml-2"
                    style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#374151' }}
                >
                    INBOX
                </h1>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                            <SelectItem value="snoozed">Snoozed</SelectItem>
                            <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error) {
                setLoading(false);
            }
        };
        initOrg();
    }, []);

    const fetchConversations = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const params: ConversationsQueryParams = { organization_id: organizationId };
            if (statusFilter !== 'all') params.status = statusFilter as any;
            const response = await getConversations(params);
            setConversations(response.conversations);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load conversations', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    const handleSelectConversation = async (conv: Conversation) => {
        if (!organizationId) return;
        setMessageLoading(true);
        try {
            const fullConv = await getConversation(conv.id, organizationId);
            setSelectedConversation(fullConv);
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
            const message = await sendMessage(selectedConversation.id, { content: newMessage.trim() }, organizationId);
            setSelectedConversation(prev => prev ? { ...prev, messages: [...(prev.messages || []), message] } : null);
            setNewMessage('');
            fetchConversations();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
        } finally {
            setSendingMessage(false);
        }
    };

    const handleCloseConversation = async () => {
        if (!selectedConversation || !organizationId) return;
        try {
            await updateConversation(selectedConversation.id, { status: 'closed' }, organizationId);
            setSelectedConversation(null);
            fetchConversations();
            toast({ title: 'Conversation closed' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to close conversation', variant: 'destructive' });
        }
    };

    const getContactName = (conv: Conversation) => {
        if (conv.contact_first_name || conv.contact_last_name) {
            return `${conv.contact_first_name || ''} ${conv.contact_last_name || ''}`.trim();
        }
        return conv.contact_email || 'Unknown';
    };

    return (
        <div className="container mx-auto p-6 max-w-7xl h-[calc(100vh-64px)]">
            <Card className="h-full overflow-hidden">
                <div className="flex h-full">
                    {/* Conversations list */}
                    <div className="w-80 border-r flex flex-col">
                        {loading ? (
                            <div className="p-4 space-y-3">
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center p-4 text-center">
                                <div>
                                    <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                                    <p className="text-muted-foreground">No conversations</p>
                                </div>
                            </div>
                        ) : (
                            <ScrollArea className="flex-1">
                                {conversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${selectedConversation?.id === conv.id ? 'bg-muted' : ''
                                            }`}
                                        onClick={() => handleSelectConversation(conv)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                                                <User className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <p className="font-medium truncate">{getContactName(conv)}</p>
                                                    {conv.unread_count > 0 && (
                                                        <Badge className="bg-blue-600 text-white text-xs">{conv.unread_count}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground truncate">{conv.last_message_preview || 'No messages'}</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {conv.last_message_at ? format(parseISO(conv.last_message_at), 'MMM d, h:mm a') : ''}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </ScrollArea>
                        )}
                    </div>

                    {/* Message thread */}
                    <div className="flex-1 flex flex-col">
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
                                <div className="p-4 border-b flex items-center justify-between">
                                    <div>
                                        <h2 className="font-medium">{getContactName(selectedConversation)}</h2>
                                        <p className="text-sm text-muted-foreground">{selectedConversation.contact_email}</p>
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
                                        {(selectedConversation.messages || []).map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[70%] rounded-lg p-3 ${msg.sender_type === 'user'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-muted'
                                                        }`}
                                                >
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                    <p className={`text-xs mt-1 ${msg.sender_type === 'user' ? 'text-blue-100' : 'text-muted-foreground'}`}>
                                                        {format(parseISO(msg.created_at), 'h:mm a')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>

                                {/* Input */}
                                <div className="p-4 border-t">
                                    <div className="flex gap-2">
                                        <Textarea
                                            placeholder="Type your message..."
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
                                            className="bg-blue-600 hover:bg-blue-700"
                                        >
                                            Send
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}

export default InboxPage;
