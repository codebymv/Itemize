import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Plus, Search, Share2, MoreHorizontal, Trash2, MessageCircle, Facebook, Instagram, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { getChannels, disconnectChannel, getConversations, getFacebookConnectUrl } from '@/services/socialApi';
import { cn } from '@/lib/utils';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';

interface SocialChannel {
    id: number;
    platform: 'facebook' | 'instagram';
    name: string;
    page_id: string;
    is_active: boolean;
    unread_count: number;
    connected_at: string;
}

interface SocialConversation {
    id: number;
    channel_id: number;
    platform: string;
    participant_name: string;
    participant_id: string;
    last_message: string;
    last_message_at: string;
    unread_count: number;
    status: 'open' | 'closed';
}

export function SocialPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    // Route-aware onboarding (will show 'inbox' onboarding for Communications group)
    const {
        showModal: showOnboarding,
        handleComplete: completeOnboarding,
        handleDismiss: dismissOnboarding,
        handleClose: closeOnboarding,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [channels, setChannels] = useState<SocialChannel[]>([]);
    const [conversations, setConversations] = useState<SocialConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('conversations');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Share2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SOCIAL
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search conversations..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleConnectFacebook}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Connect Account
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent]);

    useEffect(() => {
        if (!initError) return;
        setLoading(false);
    }, [initError]);

    const fetchData = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const [channelsRes, conversationsRes] = await Promise.all([
                getChannels({}, organizationId),
                getConversations({}, organizationId)
            ]);
            // getChannels returns array directly, getConversations returns { conversations, pagination }
            setChannels((Array.isArray(channelsRes) ? channelsRes : []).map(ch => ({
                id: ch.id,
                platform: ch.channel_type as 'facebook' | 'instagram',
                name: ch.name,
                page_id: ch.page_id || '',
                is_active: ch.is_active,
                unread_count: 0,
                connected_at: ch.created_at,
            })));
            setConversations((conversationsRes.conversations || []).map(conv => ({
                id: conv.id,
                channel_id: conv.channel_id,
                platform: conv.channel_type || 'facebook',
                participant_name: conv.participant_name || 'Unknown',
                participant_id: conv.participant_id,
                last_message: conv.last_message_text || '',
                last_message_at: conv.last_message_at || conv.created_at,
                unread_count: conv.unread_count,
                status: conv.status === 'open' || conv.status === 'closed' ? conv.status : 'open',
            })));
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleConnectFacebook = async () => {
        if (!organizationId) return;
        try {
            const { auth_url } = await getFacebookConnectUrl(organizationId);
            window.location.href = auth_url;
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to initiate connection', variant: 'destructive' });
        }
    };

    const handleDisconnect = async (id: number) => {
        if (!organizationId) return;
        try {
            await disconnectChannel(id, organizationId);
            setChannels(prev => prev.filter(c => c.id !== id));
            toast({ title: 'Disconnected', description: 'Channel disconnected successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
        }
    };

    const getPlatformIcon = (platform: string) => {
        switch (platform) {
            case 'facebook': return <Facebook className="h-4 w-4 text-blue-600" />;
            case 'instagram': return <Instagram className="h-4 w-4 text-pink-500" />;
            default: return <Share2 className="h-4 w-4" />;
        }
    };

    const filteredConversations = conversations.filter(c =>
        c.participant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.last_message.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (initError) {
        return (
            <PageContainer>
                <PageSurface className="max-w-lg mx-auto mt-12" contentClassName="pt-6 text-center">
                    <p className="text-muted-foreground">{initError}</p>
                    <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                </PageSurface>
            </PageContainer>
        );
    }

    return (
        <>
            {/* Route-aware onboarding modal */}
            {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
                <OnboardingModal
                    isOpen={showOnboarding}
                    onClose={closeOnboarding}
                    onComplete={completeOnboarding}
                    onDismiss={dismissOnboarding}
                    content={ONBOARDING_CONTENT[onboardingFeatureKey]}
                />
            )}

            <MobileControlsBar>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9 bg-muted/20 border-border/50"
                    />
                </div>
                <Button
                    size="icon"
                    className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9"
                    onClick={handleConnectFacebook}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </MobileControlsBar>
            <PageContainer>
                <PageSurface>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6">
                    <TabsTrigger value="conversations">
                        <MessageCircle className={cn("h-4 w-4 mr-2", activeTab === 'conversations' && "text-blue-600")} />Conversations
                    </TabsTrigger>
                    <TabsTrigger value="channels">
                        <Share2 className={cn("h-4 w-4 mr-2", activeTab === 'channels' && "text-blue-600")} />Connected Accounts
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="conversations">
                    <Card>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-6 space-y-4">
                                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                                </div>
                            ) : filteredConversations.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                        <MessageCircle className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-medium mb-2">No conversations yet</h3>
                                    <p className="text-muted-foreground mb-4">Connect your social accounts to start receiving messages</p>
                                    <Button onClick={handleConnectFacebook} className="bg-blue-600 hover:bg-blue-700 text-white">
                                        <Plus className="h-4 w-4 mr-2" />Connect Facebook
                                    </Button>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {filteredConversations.map((conversation) => (
                                        <div key={conversation.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                        {getPlatformIcon(conversation.platform)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-medium">{conversation.participant_name}</p>
                                                            {conversation.unread_count > 0 && (
                                                                <Badge variant="destructive" className="text-xs">
                                                                    {conversation.unread_count}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-muted-foreground line-clamp-1">{conversation.last_message}</p>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {new Date(conversation.last_message_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="channels">
                    <Card>
                        <CardHeader>
                            <CardTitle>Connected Accounts</CardTitle>
                            <CardDescription>Manage your connected social media accounts</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="space-y-4">
                                    {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                                </div>
                            ) : channels.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                        <Share2 className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-medium mb-2">No accounts connected yet</h3>
                                    <p className="text-muted-foreground mb-4">Connect your social accounts to manage conversations</p>
                                    <Button onClick={handleConnectFacebook} className="bg-blue-600 hover:bg-blue-700 text-white">
                                        <Facebook className="h-4 w-4 mr-2" />Connect Facebook
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {channels.map((channel) => (
                                        <div key={channel.id} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                    {getPlatformIcon(channel.platform)}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{channel.name}</p>
                                                    <p className="text-sm text-muted-foreground capitalize">{channel.platform}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <Badge variant={channel.is_active ? 'default' : 'secondary'}>
                                                    {channel.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleDisconnect(channel.id)} className="text-destructive dark:text-red-400 focus:text-destructive focus:dark:text-red-300">
                                                            <Trash2 className="h-4 w-4 mr-2" />Disconnect
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
            </PageSurface>
        </PageContainer>
        </>
    );
}

export default SocialPage;
