import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Plus, Search, MessageSquare, MoreHorizontal, Trash2, Copy, Send } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useOrganization } from '@/hooks/useOrganization';
import { getSmsTemplates as getSMSTemplates, deleteSmsTemplate as deleteSMSTemplate, duplicateSmsTemplate as duplicateSMSTemplate, sendTestSms as sendTestSMS } from '@/services/smsApi';
import { CreateSMSTemplateModal } from './CreateSMSTemplateModal';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';

interface SMSTemplate {
    id: number;
    name: string;
    content: string;
    category?: string;
    is_active: boolean;
    variables: string[];
    character_count: number;
    segment_count: number;
    created_at: string;
}

export function SMSTemplatesPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    // Route-aware onboarding (will show 'campaigns' onboarding for all Marketing routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [templates, setTemplates] = useState<SMSTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SMS TEMPLATES
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Template
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

    const fetchTemplates = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await getSMSTemplates(organizationId);
            setTemplates(response.templates || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            const copy = await duplicateSMSTemplate(id, organizationId);
            setTemplates(prev => [copy, ...prev]);
            toast({ title: 'Duplicated', description: 'Template duplicated successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to duplicate', variant: 'destructive' });
        }
    };

    const handleSendTest = async (id: number) => {
        if (!organizationId) return;
        try {
            await sendTestSMS(id, organizationId);
            toast({ title: 'Test Sent', description: 'Test SMS sent successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send test', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteSMSTemplate(id, organizationId);
            setTemplates(prev => prev.filter(t => t.id !== id));
            toast({ title: 'Deleted', description: 'Template deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const filteredTemplates = templates.filter(t => 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.content.toLowerCase().includes(searchQuery.toLowerCase())
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
            {/* Mobile Controls Bar */}
            <MobileControlsBar>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                    />
                </div>
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </MobileControlsBar>

            <PageContainer>
                <PageSurface>
                <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <MessageSquare className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No SMS templates yet</h3>
                            <p className="text-muted-foreground mb-4">Create reusable SMS templates for your campaigns</p>
                            <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Create Template
                            </Button>
                        </div>
                    ) : (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredTemplates.map((template) => (
                                <Card key={template.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                                                <CardDescription className="line-clamp-2 mt-1">{template.content}</CardDescription>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleSendTest(template.id)}>
                                                        <Send className="h-4 w-4 mr-2" />Send Test
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDuplicate(template.id)}>
                                                        <Copy className="h-4 w-4 mr-2" />Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(template.id)} className="text-destructive focus:text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            <Badge variant={template.is_active ? 'default' : 'secondary'}>
                                                {template.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                            {template.category && (
                                                <Badge variant="outline">{template.category}</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span>{template.character_count} chars</span>
                                            <span>{template.segment_count} segment{template.segment_count !== 1 ? 's' : ''}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            </PageSurface>

            {showCreateModal && organizationId && (
                <CreateSMSTemplateModal
                    organizationId={organizationId}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(template) => {
                        setTemplates(prev => [template, ...prev]);
                        setShowCreateModal(false);
                    }}
                />
            )}
            </PageContainer>

            {/* Route-aware onboarding modal */}
            {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
                <OnboardingModal
                    isOpen={showOnboarding}
                    onClose={handleOnboardingClose}
                    onComplete={handleOnboardingComplete}
                    onDismiss={handleOnboardingDismiss}
                    content={ONBOARDING_CONTENT[onboardingFeatureKey]}
                />
            )}
        </>
    );
}

export default SMSTemplatesPage;
