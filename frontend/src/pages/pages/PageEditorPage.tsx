import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    ArrowLeft,
    Save,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    GripVertical,
    Settings,
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
    ExternalLink,
    Copy,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import {
    getPage,
    updatePage,
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
    Page,
    PageSection,
    SectionType,
    SECTION_TEMPLATES,
} from '@/services/pagesApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';

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

export function PageEditorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [page, setPage] = useState<Page | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [organizationId, setOrganizationId] = useState<number | null>(null);

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

    // Initialize organization
    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
                navigate('/pages');
            }
        };
        initOrg();
    }, []);

    // Load page data
    const loadPage = useCallback(async () => {
        if (!organizationId || !id) return;
        setLoading(true);
        try {
            const pageData = await getPage(parseInt(id), organizationId);
            setPage(pageData);
            setEditedName(pageData.name);
            setEditedSlug(pageData.slug);
            setEditedDescription(pageData.description || '');
            setEditedSeoTitle(pageData.seo_title || '');
            setEditedSeoDescription(pageData.seo_description || '');
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load page', variant: 'destructive' });
            navigate('/pages');
        } finally {
            setLoading(false);
        }
    }, [organizationId, id]);

    useEffect(() => {
        loadPage();
    }, [loadPage]);

    // Set header content
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/pages')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Layout className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        PAGES & FORMS | {loading ? 'Loading...' : editedName || 'Page Editor'}
                    </h1>
                    {page && (
                        <Badge className={page.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                            {page.status}
                        </Badge>
                    )}
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 mr-4">
                    {page?.status === 'published' && (
                        <Button variant="outline" size="sm" onClick={() => window.open(`/p/${page.slug}`, '_blank')}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Preview
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, loading, editedName, page, saving, setHeaderContent, navigate]);

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
            toast({ title: 'Saved', description: 'Page updated successfully' });
            loadPage();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to save', variant: 'destructive' });
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
    const handleUpdateSectionContent = async (sectionId: number, content: Record<string, any>) => {
        if (!page || !organizationId) return;
        try {
            await updateSection(page.id, sectionId, { content }, organizationId);
            loadPage();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update section', variant: 'destructive' });
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-6 max-w-7xl">
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
            </div>
        );
    }

    if (!page) {
        return (
            <div className="container mx-auto p-6 max-w-7xl">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">Page not found</p>
                        <Button onClick={() => navigate('/pages')} className="mt-4">Back to Pages</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <>
            <MobileControlsBar>
                {page?.status === 'published' && (
                    <Button variant="outline" size="sm" onClick={() => window.open(`/p/${page.slug}`, '_blank')} className="flex-1">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Preview
                    </Button>
                )}
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                    onClick={handleSave}
                    disabled={saving}
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save'}
                </Button>
            </MobileControlsBar>
            <div className="container mx-auto p-6 max-w-7xl">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content - Sections */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">Page Sections</CardTitle>
                                <Button size="sm" onClick={() => setShowAddSection(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Section
                                </Button>
                            </div>
                            <CardDescription>
                                Drag to reorder sections. Click to edit content.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {(!page.sections || page.sections.length === 0) ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                    <Layout className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-muted-foreground mb-4">No sections yet</p>
                                    <Button variant="outline" onClick={() => setShowAddSection(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Your First Section
                                    </Button>
                                </div>
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
                                                    {section.section_type}
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
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
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
                                    <CardTitle className="text-lg flex items-center gap-2">
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
                            <CardTitle className="text-lg">Page Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Name</Label>
                                <Input
                                    value={editedName}
                                    onChange={(e) => setEditedName(e.target.value)}
                                    placeholder="Page name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Slug</Label>
                                <Input
                                    value={editedSlug}
                                    onChange={(e) => setEditedSlug(e.target.value)}
                                    placeholder="page-slug"
                                />
                                <p className="text-xs text-muted-foreground">URL: /p/{editedSlug}</p>
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Description</Label>
                                <Textarea
                                    value={editedDescription}
                                    onChange={(e) => setEditedDescription(e.target.value)}
                                    placeholder="Page description"
                                    rows={2}
                                />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Status</Label>
                                <div className="flex items-center gap-2">
                                    <Badge className={page.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                                        {page.status}
                                    </Badge>
                                    <Button variant="outline" size="sm" onClick={handleTogglePublish}>
                                        {page.status === 'published' ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                                        {page.status === 'published' ? 'Unpublish' : 'Publish'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">SEO Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>SEO Title</Label>
                                <Input
                                    value={editedSeoTitle}
                                    onChange={(e) => setEditedSeoTitle(e.target.value)}
                                    placeholder="Page title for search engines"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>SEO Description</Label>
                                <Textarea
                                    value={editedSeoDescription}
                                    onChange={(e) => setEditedSeoDescription(e.target.value)}
                                    placeholder="Description for search engines"
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Stats</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <p className="text-2xl font-bold">{page.view_count || 0}</p>
                                    <p className="text-xs text-muted-foreground">Views</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{page.unique_visitors || 0}</p>
                                    <p className="text-xs text-muted-foreground">Visitors</p>
                                </div>
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
                            Add Section
                        </DialogTitle>
                        <DialogDescription>
                            Choose a section type to add to your page
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
        </div>
        </>
    );
}

// Section Editor Component
function SectionEditor({ section, onUpdate }: { section: PageSection; onUpdate: (content: Record<string, any>) => void }) {
    const [content, setContent] = useState<Record<string, any>>(section.content || {});
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        setContent(section.content || {});
        setHasChanges(false);
    }, [section.id]);

    const handleChange = (key: string, value: any) => {
        setContent(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
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
                            <Input value={content.heading || ''} onChange={(e) => handleChange('heading', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Subheading</Label>
                            <Textarea value={content.subheading || ''} onChange={(e) => handleChange('subheading', e.target.value)} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>CTA Text</Label>
                                <Input value={content.cta_text || ''} onChange={(e) => handleChange('cta_text', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>CTA URL</Label>
                                <Input value={content.cta_url || ''} onChange={(e) => handleChange('cta_url', e.target.value)} />
                            </div>
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Heading</Label>
                            <Input value={content.heading || ''} onChange={(e) => handleChange('heading', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Body</Label>
                            <Textarea value={content.body || ''} onChange={(e) => handleChange('body', e.target.value)} rows={5} />
                        </div>
                    </>
                );
            case 'cta':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Heading</Label>
                            <Input value={content.heading || ''} onChange={(e) => handleChange('heading', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea value={content.description || ''} onChange={(e) => handleChange('description', e.target.value)} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Button Text</Label>
                                <Input value={content.button_text || ''} onChange={(e) => handleChange('button_text', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Button URL</Label>
                                <Input value={content.button_url || ''} onChange={(e) => handleChange('button_url', e.target.value)} />
                            </div>
                        </div>
                    </>
                );
            case 'image':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Image URL</Label>
                            <Input value={content.image_url || ''} onChange={(e) => handleChange('image_url', e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Alt Text</Label>
                            <Input value={content.alt_text || ''} onChange={(e) => handleChange('alt_text', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Caption</Label>
                            <Input value={content.caption || ''} onChange={(e) => handleChange('caption', e.target.value)} />
                        </div>
                    </>
                );
            case 'video':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Video URL</Label>
                            <Input value={content.video_url || ''} onChange={(e) => handleChange('video_url', e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={content.autoplay || false} onChange={(e) => handleChange('autoplay', e.target.checked)} />
                                Autoplay
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={content.muted !== false} onChange={(e) => handleChange('muted', e.target.checked)} />
                                Muted
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={content.controls !== false} onChange={(e) => handleChange('controls', e.target.checked)} />
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
                            <Textarea value={content.html_content || ''} onChange={(e) => handleChange('html_content', e.target.value)} rows={10} className="font-mono text-sm" />
                        </div>
                        <div className="space-y-2">
                            <Label>CSS (optional)</Label>
                            <Textarea value={content.css_content || ''} onChange={(e) => handleChange('css_content', e.target.value)} rows={5} className="font-mono text-sm" />
                        </div>
                    </>
                );
            case 'divider':
                return (
                    <div className="space-y-2">
                        <Label>Style</Label>
                        <Select value={content.style || 'line'} onValueChange={(v) => handleChange('style', v)}>
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
                        <Input type="number" value={content.height || 50} onChange={(e) => handleChange('height', parseInt(e.target.value))} />
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
                                } catch { }
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
