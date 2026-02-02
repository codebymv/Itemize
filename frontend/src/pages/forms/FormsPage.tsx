import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, FileText, MoreHorizontal, Trash2, Copy, ExternalLink, Eye, EyeOff, BarChart3, Pencil } from 'lucide-react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { useHeader } from '@/contexts/HeaderContext';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Form } from '@/types';
import { getForms, updateForm, deleteForm, duplicateForm, createForm } from '@/services/formsApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { useOrganization } from '@/hooks/useOrganization';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';

export function FormsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    // Route-aware onboarding (will show 'pages' onboarding for Pages & Forms group)
    const {
        showModal: showOnboarding,
        handleComplete: completeOnboarding,
        handleDismiss: dismissOnboarding,
        handleClose: closeOnboarding,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [forms, setForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className={`text-xl font-semibold italic truncate font-raleway ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                    >
                        PAGES & FORMS | Forms
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search forms..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleCreateForm}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Form
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        if (orgLoading) {
            setLoading(true);
            return;
        }

        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId, initError, orgLoading]);

    const fetchForms = useCallback(async () => {
        if (!organizationId) {
            if (!orgLoading) {
                setForms([]);
                setLoading(false);
            }
            return;
        }
        setLoading(true);
        try {
            const response = await getForms(organizationId, statusFilter !== 'all' ? statusFilter : undefined);
            setForms(response.forms);
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToLoad('forms'), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, orgLoading, statusFilter, toast]);

    useEffect(() => {
        fetchForms();
    }, [fetchForms]);

    const handleCreateForm = async () => {
        if (!organizationId) return;
        try {
            const newForm = await createForm({ name: 'New Form', organization_id: organizationId });
            navigate(`/forms/${newForm.id}`);
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToCreate('form'), variant: 'destructive' });
        }
    };

    const handleToggleStatus = async (form: Form, newStatus: 'published' | 'draft') => {
        if (!organizationId) return;
        try {
            await updateForm(form.id, { status: newStatus }, organizationId);
            setForms(prev => prev.map(f => f.id === form.id ? { ...f, status: newStatus } : f));
            toast({ title: newStatus === 'published' ? 'Form published' : 'Form unpublished' });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToUpdate('form'), variant: 'destructive' });
        }
    };

    const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            const copy = await duplicateForm(id, organizationId);
            setForms(prev => [copy, ...prev]);
            toast({ title: 'Duplicated', description: toastMessages.duplicated('form') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDuplicate('form'), variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteForm(id, organizationId);
            setForms(prev => prev.filter(f => f.id !== id));
            toast({ title: 'Deleted', description: toastMessages.deleted('form') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDelete('form'), variant: 'destructive' });
        }
    };

    const copyFormLink = (slug: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/form/${slug}`);
        toast({ title: 'Link Copied', description: toastMessages.copiedToClipboard('form link') });
    };

    const filteredForms = forms.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'published': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'archived': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            default: return '';
        }
    };

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

            {/* Mobile Controls Bar */}
            <MobileControlsBar>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search forms..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                        aria-label="Search forms"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[100px] h-9">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                    onClick={handleCreateForm}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </MobileControlsBar>

            <PageContainer>
                <PageSurface>
                    {/* Forms content */}
                    <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
                            </div>
                        ) : filteredForms.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-medium mb-2">No forms yet</h3>
                                <p className="text-muted-foreground mb-4">Create a form to start collecting leads</p>
                                <Button onClick={handleCreateForm} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    <Plus className="h-4 w-4 mr-2" />Create Form
                                </Button>
                            </div>
                        ) : (
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredForms.map((form) => (
                                    <Card key={form.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/forms/${form.id}`)}>
                                        <div className="h-2" style={{ backgroundColor: form.theme?.primaryColor || '#3B82F6' }} />
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <CardTitle className="text-lg truncate">{form.name}</CardTitle>
                                                    {form.description && <CardDescription className="line-clamp-1">{form.description}</CardDescription>}
                                                </div>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                        <DropdownMenuItem onClick={() => navigate(`/forms/${form.id}`)} className="group/menu">
                                                            <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                        </DropdownMenuItem>
                                                        {form.status === 'published' ? (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(form, 'draft')} className="group/menu">
                                                                <EyeOff className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Unpublish
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(form, 'published')} className="group/menu">
                                                                <Eye className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Publish
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => copyFormLink(form.slug)} className="group/menu">
                                                            <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Copy Link
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDuplicate(form.id)} className="group/menu">
                                                            <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Duplicate
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => handleDelete(form.id)} className="text-destructive">
                                                            <Trash2 className="h-4 w-4 mr-2" />Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <Badge className={`text-xs ${getStatusBadge(form.status)}`}>{form.status}</Badge>
                                                <Badge variant="outline" className="text-xs">{form.type}</Badge>
                                                <Badge variant="outline" className="text-xs">{form.field_count || 0} fields</Badge>
                                            </div>
                                            <div className="flex items-center justify-between pt-3 border-t text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <BarChart3 className="h-3 w-3" />
                                                    {form.submission_count || 0} submissions
                                                </span>
                                                <span className="truncate max-w-[100px]">/form/{form.slug}</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </CardContent>
                    </Card>
                </PageSurface>
            </PageContainer>
        </>
    );
}

export default FormsPage;
