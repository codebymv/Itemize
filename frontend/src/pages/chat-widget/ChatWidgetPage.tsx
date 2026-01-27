import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { MessageCircle, Settings, Code, Eye, Save, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getChatWidget, createChatWidget, updateChatWidget, getEmbedCode } from '@/services/chatWidgetApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';

interface LocalChatWidgetConfig {
    id?: number;
    is_active: boolean;
    welcome_message: string;
    offline_message: string;
    primary_color: string;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    show_branding: boolean;
    require_email: boolean;
    require_name: boolean;
}

export function ChatWidgetPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [config, setConfig] = useState<LocalChatWidgetConfig | null>(null);
    const [embedCode, setEmbedCode] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState('settings');

    useEffect(() => {
        setHeaderContent(
            <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full min-w-0 gap-3 md:gap-2">
                <div className="flex items-center gap-2 ml-2">
                    <MessageCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        COMMUNICATIONS | Chat Widget
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    {/* Desktop Tabs - in header */}
                    <div className="hidden md:flex items-center">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="h-9">
                                <TabsTrigger value="settings" className="text-xs">
                                    <Settings className="h-4 w-4 mr-1" />Settings
                                </TabsTrigger>
                                <TabsTrigger value="appearance" className="text-xs">
                                    <Palette className="h-4 w-4 mr-1" />Appearance
                                </TabsTrigger>
                                <TabsTrigger value="install" className="text-xs">
                                    <Code className="h-4 w-4 mr-1" />Install
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    {/* Desktop save button */}
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light hidden md:flex"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, saving, setHeaderContent, activeTab]);

    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error: any) {
                setInitError('Failed to initialize.');
                setLoading(false);
            }
        };
        initOrg();
    }, []);

    const fetchConfig = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            // First get the widget config
            const configRes = await getChatWidget(organizationId);
            
            if (configRes) {
                setConfig({
                    id: configRes.id,
                    is_active: configRes.is_active,
                    welcome_message: configRes.welcome_message,
                    offline_message: configRes.offline_message,
                    primary_color: configRes.primary_color,
                    position: configRes.position,
                    show_branding: configRes.show_branding,
                    require_email: configRes.require_email,
                    require_name: configRes.require_name,
                });
                
                // Only fetch embed code if widget exists
                try {
                    const embedRes = await getEmbedCode(organizationId);
                    setEmbedCode(embedRes?.embed_code || '');
                } catch {
                    setEmbedCode('');
                }
            } else {
                // No widget exists yet - show defaults
                setConfig({
                    is_active: false,
                    welcome_message: 'Hi! How can we help you today?',
                    offline_message: 'We\'re currently offline. Leave a message and we\'ll get back to you.',
                    primary_color: '#3B82F6',
                    position: 'bottom-right',
                    show_branding: true,
                    require_email: false,
                    require_name: false,
                });
                setEmbedCode('');
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load config', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        if (!organizationId || !config) return;
        setSaving(true);
        try {
            let savedConfig;
            if (config.id) {
                // Update existing widget
                savedConfig = await updateChatWidget(config, organizationId);
            } else {
                // Create new widget
                savedConfig = await createChatWidget(config, organizationId);
                // Update local state with the created widget's ID
                setConfig(prev => prev ? { ...prev, id: savedConfig.id } : null);
            }
            toast({ title: 'Saved', description: 'Settings saved successfully' });
            
            // Fetch embed code now that widget exists
            if (savedConfig?.id && !embedCode) {
                try {
                    const embedRes = await getEmbedCode(organizationId);
                    setEmbedCode(embedRes?.embed_code || '');
                } catch {
                    // Ignore embed code fetch errors
                }
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const copyEmbedCode = () => {
        navigator.clipboard.writeText(embedCode);
        toast({ title: 'Copied', description: 'Embed code copied to clipboard' });
    };

    if (initError) {
        return (
            <div className="container mx-auto p-6 max-w-7xl">
                <Card className="max-w-lg mx-auto mt-12">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">{initError}</p>
                        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container mx-auto p-6 max-w-4xl">
                <Skeleton className="h-96" />
            </div>
        );
    }

    return (
        <>
            <MobileControlsBar className="flex-col items-stretch gap-3">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full">
                        <TabsTrigger value="settings" className="flex-1">
                            <Settings className="h-4 w-4 mr-1" />Settings
                        </TabsTrigger>
                        <TabsTrigger value="appearance" className="flex-1">
                            <Palette className="h-4 w-4 mr-1" />Style
                        </TabsTrigger>
                        <TabsTrigger value="install" className="flex-1">
                            <Code className="h-4 w-4 mr-1" />Install
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                    onClick={handleSave}
                    disabled={saving}
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Changes'}
                </Button>
            </MobileControlsBar>
            <div className="container mx-auto p-6 max-w-4xl">
                <Tabs value={activeTab} onValueChange={setActiveTab}>

                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Widget Settings</CardTitle>
                            <CardDescription>Configure your chat widget behavior</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Enable Chat Widget</Label>
                                    <p className="text-sm text-muted-foreground">Show the chat widget on your website</p>
                                </div>
                                <Switch
                                    checked={config?.is_active}
                                    onCheckedChange={(checked) => setConfig(prev => prev ? { ...prev, is_active: checked } : null)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Welcome Message</Label>
                                <Textarea
                                    value={config?.welcome_message}
                                    onChange={(e) => setConfig(prev => prev ? { ...prev, welcome_message: e.target.value } : null)}
                                    placeholder="Hi! How can we help you today?"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Offline Message</Label>
                                <Textarea
                                    value={config?.offline_message}
                                    onChange={(e) => setConfig(prev => prev ? { ...prev, offline_message: e.target.value } : null)}
                                    placeholder="We're currently offline..."
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Require Email</Label>
                                    <p className="text-sm text-muted-foreground">Ask visitors for their email before chatting</p>
                                </div>
                                <Switch
                                    checked={config?.require_email}
                                    onCheckedChange={(checked) => setConfig(prev => prev ? { ...prev, require_email: checked } : null)}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Require Name</Label>
                                    <p className="text-sm text-muted-foreground">Ask visitors for their name before chatting</p>
                                </div>
                                <Switch
                                    checked={config?.require_name}
                                    onCheckedChange={(checked) => setConfig(prev => prev ? { ...prev, require_name: checked } : null)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="appearance">
                    <Card>
                        <CardHeader>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>Customize how your chat widget looks</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label>Primary Color</Label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={config?.primary_color}
                                        onChange={(e) => setConfig(prev => prev ? { ...prev, primary_color: e.target.value } : null)}
                                        className="w-10 h-10 rounded cursor-pointer"
                                    />
                                    <Input
                                        value={config?.primary_color}
                                        onChange={(e) => setConfig(prev => prev ? { ...prev, primary_color: e.target.value } : null)}
                                        className="w-32"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Show Branding</Label>
                                    <p className="text-sm text-muted-foreground">Display powered-by branding in the widget</p>
                                </div>
                                <Switch
                                    checked={config?.show_branding}
                                    onCheckedChange={(checked) => setConfig(prev => prev ? { ...prev, show_branding: checked } : null)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="install">
                    <Card>
                        <CardHeader>
                            <CardTitle>Install Widget</CardTitle>
                            <CardDescription>Add this code to your website before the closing body tag</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="relative">
                                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                                    <code>{embedCode || '<!-- Widget embed code will appear here -->'}</code>
                                </pre>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="absolute top-2 right-2"
                                    onClick={copyEmbedCode}
                                >
                                    Copy
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
        </>
    );
}

export default ChatWidgetPage;
