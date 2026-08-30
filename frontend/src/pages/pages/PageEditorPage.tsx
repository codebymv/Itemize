import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Save,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    GripVertical,
    Layout,
    Type,
    Image,
    Video,
    FileText,
    MousePointer,
    MessageSquare,
    DollarSign,
    HelpCircle,
    Grid,
    Clock,
    Code,
    Minus,
    Share2,
    Menu,
    MoreHorizontal,
    ChevronUp,
    ChevronDown,
    History as HistoryIcon,
    Settings2,
    Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { HeaderAction, HeaderActionLabel } from '@/components/layout/DesktopHeaderTools';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { useOrganization } from '@/hooks/useOrganization';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
    getPage,
    updatePage,
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
    Page,
    PageSection,
    PageContentRecord,
    SectionType,
    SECTION_TEMPLATES,
} from '@/services/pagesApi';
import { PagePreviewDialog } from '@/components/PagePreviewDialog';
import { PageVersionHistory } from '@/components/PageVersionHistory';
import { formatSectionType } from '@/utils/textUtils';
import { getContentStatusVisual } from '@/pages/contentVisuals';
import { cn } from '@/lib/utils';

// Icon mapping for section types
const SECTION_ICONS: Record<SectionType, React.ReactNode> = {
    hero: <Layout className="h-4 w-4" />,
    text: <Type className="h-4 w-4" />,
    image: <Image className="h-4 w-4" />,
    video: <Video className="h-4 w-4" />,
    form: <FileText className="h-4 w-4" />,
    cta: <MousePointer className="h-4 w-4" />,
    testimonials: <MessageSquare className="h-4 w-4" />,
    pricing: <DollarSign className="h-4 w-4" />,
    faq: <HelpCircle className="h-4 w-4" />,
    features: <Grid className="h-4 w-4" />,
    gallery: <Image className="h-4 w-4" />,
    countdown: <Clock className="h-4 w-4" />,
    html: <Code className="h-4 w-4" />,
    divider: <Minus className="h-4 w-4" />,
    social: <Share2 className="h-4 w-4" />,
    header: <Menu className="h-4 w-4" />,
    footer: <Menu className="h-4 w-4" />,
    columns: <Grid className="h-4 w-4" />,
    spacer: <MoreHorizontal className="h-4 w-4" />,
    button: <MousePointer className="h-4 w-4" />,
    logo_cloud: <Grid className="h-4 w-4" />,
    stats: <Grid className="h-4 w-4" />,
    team: <Grid className="h-4 w-4" />,
    contact: <FileText className="h-4 w-4" />,
    map: <Grid className="h-4 w-4" />,
};

const getErrorMessage = (error: unknown, fallback: string): string => {
    return error instanceof Error ? error.message : fallback;
};

export function PageEditorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [page, setPage] = useState<Page | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const { organizationId, error: organizationError } = useOrganization();

    // Edit states
    const [editedName, setEditedName] = useState('');
    const [editedSlug, setEditedSlug] = useState('');
    const [editedDescription, setEditedDescription] = useState('');
    const [editedSeoTitle, setEditedSeoTitle] = useState('');
    const [editedSeoDescription, setEditedSeoDescription] = useState('');

// UI states
    const [showAddSection, setShowAddSection] = useState(false);
    const [selectedSection, setSelectedSection] = useState<PageSection | null>(null);
    const [activeTab, setActiveTab] = useState('sections');
    const [showPreview, setShowPreview] = useState(false);
    const [previewVersionId, setPreviewVersionId] = useState<number | undefined>();
    const [showVersionHistory, setShowVersionHistory] = useState(false);

    const pageDraft = useMemo(() => ({
        name: editedName,
        slug: editedSlug,
        description: editedDescription,
        seoTitle: editedSeoTitle,
        seoDescription: editedSeoDescription,
    }), [editedDescription, editedName, editedSeoDescription, editedSeoTitle, editedSlug]);
    const { isDirty, markClean } = useDirtyState({
        value: pageDraft,
        ready: !loading && Boolean(page),
        resetKey: id ?? 'page',
    });
    const { confirmLeave } = useUnsavedChangesGuard({
        when: isDirty || saving,
        message: 'This page has unsaved changes. Leave without saving them?',
    });

    useEffect(() => {
        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId]);

    // Load page data
    const loadPage = useCallback(async () => {
        if (!organizationId || !id) return;
        setLoading(true);
        setLoadError(null);
        try {
            const pageData = await getPage(parseInt(id), organizationId);
            setPage(pageData);
            setEditedName(pageData.name);
            setEditedSlug(pageData.slug);
            setEditedDescription(pageData.description || '');
            setEditedSeoTitle(pageData.seo_title || '');
            setEditedSeoDescription(pageData.seo_description || '');
        } catch (error) {
            setLoadError(getErrorMessage(error, 'Unable to load this page.'));
        } finally {
            setLoading(false);
        }
    }, [organizationId, id]);

    useEffect(() => {
        loadPage();
    }, [loadPage]);

    // Save page changes
    const handleSave = async () => {
        if (!page || !organizationId) return;
        setSaving(true);
        try {
            await updatePage(page.id, {
                name: editedName,
                slug: editedSlug,
                description: editedDescription || undefined,
                seo_title: editedSeoTitle || undefined,
                seo_description: editedSeoDescription || undefined,
            }, organizationId);
            markClean();
            toast({ title: 'Saved', description: 'Page updated successfully' });
            loadPage();
        } catch (error: unknown) {
            toast({ title: 'Error', description: getErrorMessage(error, 'Failed to save'), variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Toggle publish status
    const handleTogglePublish = async () => {
        if (!page || !organizationId) return;
        setSaving(true);
        try {
            const newStatus = page.status === 'published' ? 'draft' : 'published';
            await updatePage(page.id, { status: newStatus }, organizationId);
            toast({ title: newStatus === 'published' ? 'Published' : 'Unpublished', description: `Page is now ${newStatus}` });
            loadPage();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Add section
    const handleAddSection = async (sectionType: SectionType) => {
        if (!page || !organizationId) return;
        try {
            const template = SECTION_TEMPLATES[sectionType];
            await addSection(page.id, {
                section_type: sectionType,
                name: template.name,
                content: template.defaultContent,
                settings: { visible: true, animation: 'none', paddingTop: 40, paddingBottom: 40, paddingLeft: 20, paddingRight: 20, maxWidth: '1200px', fullWidth: false },
            }, organizationId);
            toast({ title: 'Section Added', description: 'Section added successfully' });
            setShowAddSection(false);
            loadPage();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to add section', variant: 'destructive' });
        }
    };

    // Delete section
    const handleDeleteSection = async (sectionId: number) => {
        if (!page || !organizationId) return;
        try {
            await deleteSection(page.id, sectionId, organizationId);
            toast({ title: 'Deleted', description: 'Section deleted successfully' });
            setSelectedSection(null);
            loadPage();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete section', variant: 'destructive' });
        }
    };

    // Move section
    const handleMoveSection = async (sectionId: number, direction: 'up' | 'down') => {
        if (!page?.sections || !organizationId) return;
        const sections = [...page.sections];
        const index = sections.findIndex(s => s.id === sectionId);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === sections.length - 1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];
        const sectionIds = sections.map(s => s.id!);

        try {
            await reorderSections(page.id, sectionIds, organizationId);
            loadPage();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to reorder sections', variant: 'destructive' });
        }
    };

    // Update section content
    const handleUpdateSectionContent = async (sectionId: number, content: PageContentRecord) => {
        if (!page || !organizationId) return;
        try {
            await updateSection(page.id, sectionId, { content }, organizationId);
            loadPage();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update section', variant: 'destructive' });
        }
    };

    const backButton = (
        <ShellBackButton
            label="Back to pages"
            onClick={() => {
                if (confirmLeave()) navigate('/pages');
            }}
        />
    );

    if (loading) {
        return (
            <PageLayout
                title="PAGE"
                icon={<Layout className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={backButton}
            >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <Skeleton className="h-48" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                    </div>
                    <div>
                        <Skeleton className="h-96" />
                    </div>
                </div>
            </PageLayout>
        );
    }

    if (!page) {
        return (
            <PageLayout
                title="PAGE EDITOR"
                icon={<Layout className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={backButton}
            >
                {organizationError ? (
                    <OrganizationErrorState title="Unable to load page" icon={Layout} />
                ) : loadError ? (
                    <ErrorState
                        kind="page"
                        title="Page unavailable"
                        description={loadError}
                        onAction={() => void loadPage()}
                    />
                ) : (
                    <ErrorState
                        kind="page"
                        title="Page not found"
                        description="This page is no longer available."
                        actionLabel="Back to pages"
                        onAction={() => {
                            if (confirmLeave()) navigate('/pages');
                        }}
                    />
                )}
            </PageLayout>
        );
    }

    const statusVisual = getContentStatusVisual(page.status);
    const StatusIcon = statusVisual.icon;
    const moreActions = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 min-w-11 gap-2 px-3 font-light" aria-label="Page actions">
                    <MoreHorizontal className="h-4 w-4" />
                    <HeaderActionLabel>More</HeaderActionLabel>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {page.status === 'published' && (
                    <DropdownMenuItem onClick={() => setShowPreview(true)} className="group/menu">
                        <Eye className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
                        Preview page
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowVersionHistory(true)} className="group/menu">
                    <HistoryIcon className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
                    Version history
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
    const publishAction = (
        <Button variant="outline" className="h-11 min-w-11 gap-2 px-3 font-light" onClick={handleTogglePublish} disabled={saving || isDirty} aria-label={page.status === 'published' ? 'Unpublish page' : 'Publish page'}>
            {page.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden xl:inline">{page.status === 'published' ? 'Unpublish' : 'Publish'}</span>
        </Button>
    );

    return (
        <PageLayout
            title="PAGE"
            icon={<Layout className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            leading={backButton}
            headerTools={{
                status: <Badge className={cn('pointer-events-none whitespace-nowrap', statusVisual.badgeClass)}>{statusVisual.label}</Badge>,
                secondaryAction: <>{moreActions}{publishAction}</>,
                primaryAction: <HeaderAction label={saving ? 'Saving...' : 'Save changes'} icon={<Save className="h-4 w-4" />} onClick={handleSave} disabled={saving || !isDirty} />,
            }}
        >
                <EntityDetailHeader
                    icon={<StatusIcon className={cn('h-6 w-6', statusVisual.iconClass)} />}
                    iconClassName={statusVisual.iconBackgroundClass}
                    title={page.name}
                    mobileStatus={<Badge className={statusVisual.badgeClass}>{statusVisual.label}</Badge>}
                    descriptor={<span className="whitespace-nowrap">/p/{page.slug}</span>}
                    metadata={<><span>{page.view_count || 0} views</span><span>{page.unique_visitors || 0} visitors</span></>}
                />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content - Sections */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <SectionCardTitle icon={Layout}>Page sections</SectionCardTitle>
                                <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setShowAddSection(true)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add section
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(!page.sections || page.sections.length === 0) ? (
                                <EmptyState
                                    icon={Layout}
                                    title="No sections yet"
                                    description="Add a section to start building this page."
                                    actionLabel="Add section"
                                    onAction={() => setShowAddSection(true)}
                                />
                            ) : (
                                <div className="space-y-2">
                                    {page.sections.map((section, index) => (
                                        <div
                                            key={section.id}
                                            className={`flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer ${selectedSection?.id === section.id ? 'ring-2 ring-blue-600' : ''}`}
                                            onClick={() => setSelectedSection(section)}
                                        >
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {SECTION_ICONS[section.section_type] || <Layout className="h-4 w-4" />}
                                                <span className="font-medium truncate">
                                                    {section.name || SECTION_TEMPLATES[section.section_type]?.name || section.section_type}
                                                </span>
                                                <Badge variant="outline" className="text-xs">
                                                    {formatSectionType(section.section_type)}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={(e) => { e.stopPropagation(); handleMoveSection(section.id!, 'up'); }}
                                                    disabled={index === 0}
                                                >
                                                    <ChevronUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={(e) => { e.stopPropagation(); handleMoveSection(section.id!, 'down'); }}
                                                    disabled={index === page.sections!.length - 1}
                                                >
                                                    <ChevronDown className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id!); }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Section Editor */}
                    {selectedSection && (
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        {SECTION_ICONS[selectedSection.section_type]}
                                        Edit {SECTION_TEMPLATES[selectedSection.section_type]?.name || selectedSection.section_type}
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedSection(null)}>
                                        Close
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <SectionEditor
                                    section={selectedSection}
                                    onUpdate={(content) => handleUpdateSectionContent(selectedSection.id!, content)}
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar - Settings */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <SectionCardTitle icon={Settings2}>Page settings</SectionCardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input
                                    value={editedName}
                                    onChange={(e) => setEditedName(e.target.value)}
                                    placeholder="Page name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Slug</Label>
                                <Input
                                    value={editedSlug}
                                    onChange={(e) => setEditedSlug(e.target.value)}
                                    placeholder="page-slug"
                                />
                                <p className="text-xs text-muted-foreground">URL: /p/{editedSlug}</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea
                                    value={editedDescription}
                                    onChange={(e) => setEditedDescription(e.target.value)}
                                    placeholder="Page description"
                                    rows={2}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <SectionCardTitle icon={Search}>SEO settings</SectionCardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>SEO title</Label>
                                <Input
                                    value={editedSeoTitle}
                                    onChange={(e) => setEditedSeoTitle(e.target.value)}
                                    placeholder="Page title for search engines"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>SEO description</Label>
                                <Textarea
                                    value={editedSeoDescription}
                                    onChange={(e) => setEditedSeoDescription(e.target.value)}
                                    placeholder="Description for search engines"
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>

{/* Add Section Dialog */}
            <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-blue-600" />
                            Add section
                        </DialogTitle>
                        <DialogDescription>
                            Choose a section type.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
                            {(Object.entries(SECTION_TEMPLATES) as [SectionType, typeof SECTION_TEMPLATES[SectionType]][]).map(([type, template]) => (
                                <button
                                    key={type}
                                    className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 hover:border-blue-300 transition-colors text-left"
                                    onClick={() => handleAddSection(type)}
                                >
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        {SECTION_ICONS[type]}
                                    </div>
                                    <span className="text-sm font-medium">{template.name}</span>
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Page Preview Dialog */}
            {page && (
                <PagePreviewDialog
                    open={showPreview}
                    onOpenChange={() => {
                        setShowPreview(false);
                        setPreviewVersionId(undefined);
                    }}
                    page={page}
                    organizationId={organizationId!}
                    versionId={previewVersionId}
                />
            )}

            {/* Page Version History */}
            {page && (
                <PageVersionHistory
                    open={showVersionHistory}
                    onOpenChange={setShowVersionHistory}
                    pageId={page.id}
                    pageName={page.name}
                    onPreviewVersion={(versionId) => {
                        setPreviewVersionId(versionId);
                        setShowVersionHistory(false);
                        setShowPreview(true);
                    }}
                />
            )}
    </PageLayout>
    );
}

// Section Editor Component
function SectionEditor({ section, onUpdate }: { section: PageSection; onUpdate: (content: PageContentRecord) => void }) {
    const [content, setContent] = useState<PageContentRecord>(section.content || {});
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        setContent(section.content || {});
        setHasChanges(false);
    }, [section.id]);

    const handleChange = (key: string, value: unknown) => {
        setContent(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const getTextValue = (key: string): string => {
        const value = content[key];
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    };

    const getNumberValue = (key: string, fallback: number): number => {
        const value = content[key];
        return typeof value === 'number' ? value : fallback;
    };

    const getBooleanValue = (key: string, fallback: boolean): boolean => {
        const value = content[key];
        return typeof value === 'boolean' ? value : fallback;
    };

    const handleSave = () => {
        onUpdate(content);
        setHasChanges(false);
    };

    // Render fields based on section type
    const renderFields = () => {
        switch (section.section_type) {
            case 'hero':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Heading</Label>
                            <Input value={getTextValue('heading')} onChange={(e) => handleChange('heading', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Subheading</Label>
                            <Textarea value={getTextValue('subheading')} onChange={(e) => handleChange('subheading', e.target.value)} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>CTA Text</Label>
                                <Input value={getTextValue('cta_text')} onChange={(e) => handleChange('cta_text', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>CTA URL</Label>
                                <Input value={getTextValue('cta_url')} onChange={(e) => handleChange('cta_url', e.target.value)} />
                            </div>
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Heading</Label>
                            <Input value={getTextValue('heading')} onChange={(e) => handleChange('heading', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Body</Label>
                            <Textarea value={getTextValue('body')} onChange={(e) => handleChange('body', e.target.value)} rows={5} />
                        </div>
                    </>
                );
            case 'cta':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Heading</Label>
                            <Input value={getTextValue('heading')} onChange={(e) => handleChange('heading', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea value={getTextValue('description')} onChange={(e) => handleChange('description', e.target.value)} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Button Text</Label>
                                <Input value={getTextValue('button_text')} onChange={(e) => handleChange('button_text', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Button URL</Label>
                                <Input value={getTextValue('button_url')} onChange={(e) => handleChange('button_url', e.target.value)} />
                            </div>
                        </div>
                    </>
                );
            case 'image':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Image URL</Label>
                            <Input value={getTextValue('image_url')} onChange={(e) => handleChange('image_url', e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Alt Text</Label>
                            <Input value={getTextValue('alt_text')} onChange={(e) => handleChange('alt_text', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Caption</Label>
                            <Input value={getTextValue('caption')} onChange={(e) => handleChange('caption', e.target.value)} />
                        </div>
                    </>
                );
            case 'video':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Video URL</Label>
                            <Input value={getTextValue('video_url')} onChange={(e) => handleChange('video_url', e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={getBooleanValue('autoplay', false)} onChange={(e) => handleChange('autoplay', e.target.checked)} />
                                Autoplay
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={getBooleanValue('muted', true)} onChange={(e) => handleChange('muted', e.target.checked)} />
                                Muted
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={getBooleanValue('controls', true)} onChange={(e) => handleChange('controls', e.target.checked)} />
                                Controls
                            </label>
                        </div>
                    </>
                );
            case 'html':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>HTML Content</Label>
                            <Textarea value={getTextValue('html_content')} onChange={(e) => handleChange('html_content', e.target.value)} rows={10} className="font-mono text-sm" />
                        </div>
                        <div className="space-y-2">
                            <Label>CSS (optional)</Label>
                            <Textarea value={getTextValue('css_content')} onChange={(e) => handleChange('css_content', e.target.value)} rows={5} className="font-mono text-sm" />
                        </div>
                    </>
                );
            case 'divider':
                return (
                    <div className="space-y-2">
                        <Label>Style</Label>
                        <Select value={getTextValue('style') || 'line'} onValueChange={(v) => handleChange('style', v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="line">Line</SelectItem>
                                <SelectItem value="dotted">Dotted</SelectItem>
                                <SelectItem value="space">Space</SelectItem>
                                <SelectItem value="gradient">Gradient</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case 'spacer':
                return (
                    <div className="space-y-2">
                        <Label>Height (px)</Label>
                        <Input type="number" value={getNumberValue('height', 50)} onChange={(e) => handleChange('height', parseInt(e.target.value))} />
                    </div>
                );
            default:
                return (
                    <div className="space-y-2">
                        <Label>Content (JSON)</Label>
                        <Textarea
                            value={JSON.stringify(content, null, 2)}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    setContent(parsed);
                                    setHasChanges(true);
                                } catch {
                                    return;
                                }
                            }}
                            rows={10}
                            className="font-mono text-sm"
                        />
                    </div>
                );
        }
    };

    return (
        <div className="space-y-4">
            {renderFields()}
            {hasChanges && (
                <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    <Save className="h-4 w-4 mr-2" />
                    Save Section
                </Button>
            )}
        </div>
    );
}

export default PageEditorPage;
