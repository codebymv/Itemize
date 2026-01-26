'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FileText, Search, Trash2, Mail, X, ShieldCheck, Bell, Megaphone, Pencil, Eye } from 'lucide-react';
import { EmailPreview } from './EmailPreview';
import { getEmailTemplates } from '@/services/adminEmailApi';
import { useToast } from '@/hooks/use-toast';

export interface EmailTemplate {
    id: number;
    name: string;
    category: string;
    subject: string;
    bodyHtml: string;
    createdAt: string;
}

interface TemplateSelectorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectTemplate: (template: EmailTemplate | null) => void;
    onComposeEmail: () => void;
    onEditTemplate?: (template: EmailTemplate) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
    system: 'System',
    notification: 'Notifications',
    broadcast: 'Broadcasts',
    marketing: 'Marketing',
    transactional: 'Transactional',
    general: 'General',
    custom: 'Custom',
};

const CATEGORY_ICONS: Record<string, typeof ShieldCheck> = {
    system: ShieldCheck,
    notification: Bell,
    broadcast: Megaphone,
    marketing: Megaphone,
    transactional: FileText,
    general: FileText,
    custom: FileText,
};

const CATEGORY_ORDER = ['broadcast', 'marketing', 'notification', 'transactional', 'system', 'general', 'custom'];

export function TemplateSelectorDialog({
    open,
    onOpenChange,
    onSelectTemplate,
    onComposeEmail,
    onEditTemplate,
}: TemplateSelectorDialogProps) {
    const { toast } = useToast();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

    useEffect(() => {
        if (open) {
            fetchTemplates();
        }
    }, [open]);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const response = await getEmailTemplates({ search: searchQuery || undefined });
            setTemplates(response.templates || []);
        } catch (error) {
            console.error('Error fetching templates:', error);
            toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (template: EmailTemplate) => {
        onSelectTemplate(template);
        onOpenChange(false);
    };

    const handleEdit = (template: EmailTemplate, e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEditTemplate) {
            onEditTemplate(template);
            onOpenChange(false);
        }
    };

    const filteredTemplates = templates
        .filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.subject.toLowerCase().includes(searchQuery.toLowerCase());
            const category = t.category?.toLowerCase() || 'general';
            const matchesCategory = selectedCategory === 'ALL' || category === selectedCategory.toLowerCase();
            return matchesSearch && matchesCategory;
        })
        .sort((a, b) => {
            const aCat = a.category?.toLowerCase() || 'general';
            const bCat = b.category?.toLowerCase() || 'general';
            const aIndex = CATEGORY_ORDER.indexOf(aCat) >= 0 ? CATEGORY_ORDER.indexOf(aCat) : CATEGORY_ORDER.length;
            const bIndex = CATEGORY_ORDER.indexOf(bCat) >= 0 ? CATEGORY_ORDER.indexOf(bCat) : CATEGORY_ORDER.length;
            if (aIndex !== bIndex) return aIndex - bIndex;
            return a.name.localeCompare(b.name);
        });

    // Calculate category counts
    const categoryCounts = CATEGORY_ORDER.reduce((acc, category) => {
        acc[category] = templates.filter(t => (t.category?.toLowerCase() || 'general') === category).length;
        return acc;
    }, {} as Record<string, number>);

    const availableCategories = CATEGORY_ORDER.filter(cat => categoryCounts[cat] > 0);

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
                <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-start justify-between p-4 border-b dark:border-slate-700">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <div>
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Choose a Template</h3>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onComposeEmail}
                                className="text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200"
                            >
                                <Mail className="h-4 w-4 mr-2" />
                                Compose Email
                            </Button>
                            <button
                                onClick={() => onOpenChange(false)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Search and Filters */}
                    <div className="p-4 border-b dark:border-slate-700 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search templates..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setSelectedCategory('ALL')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                    selectedCategory === 'ALL'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                All ({templates.length})
                            </button>
                            {availableCategories.map(category => {
                                const Icon = CATEGORY_ICONS[category] || FileText;
                                return (
                                    <button
                                        key={category}
                                        onClick={() => setSelectedCategory(category)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                            selectedCategory.toLowerCase() === category
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <Icon className="h-3 w-3" />
                                        {CATEGORY_LABELS[category] || category} ({categoryCounts[category]})
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Template List */}
                    <div className="p-4 max-h-[50vh] overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                            </div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="text-center py-8">
                                <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                <p className="text-slate-600 dark:text-slate-400 font-medium">
                                    {searchQuery ? 'No templates match your search' : 
                                     selectedCategory !== 'ALL' ? `No ${CATEGORY_LABELS[selectedCategory.toLowerCase()]?.toLowerCase() || 'templates'} templates` : 
                                     'No templates yet'}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">Click "Compose Email" to create from scratch</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredTemplates.map((template) => {
                                    const category = template.category?.toLowerCase() || 'general';
                                    const isSystem = category === 'system';
                                    const BadgeIcon = CATEGORY_ICONS[category] || FileText;
                                    return (
                                        <div
                                            key={template.id}
                                            className="group flex items-center justify-between p-3 rounded-lg border transition-colors bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                        >
                                            <button
                                                onClick={() => handleSelect(template)}
                                                className="flex-1 text-left min-w-0"
                                            >
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                                    {template.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {template.subject}
                                                </p>
                                            </button>
                                            <div className="flex items-center gap-2 ml-2">
                                                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                                    <BadgeIcon className="h-3 w-3" />
                                                    {CATEGORY_LABELS[category] || category}
                                                </span>
                                                <div className="flex items-center gap-1 w-[60px] justify-end">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPreviewTemplate(template);
                                                        }}
                                                        className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-all"
                                                        title="Preview template"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                    {onEditTemplate && (
                                                        <button
                                                            onClick={(e) => handleEdit(template, e)}
                                                            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                                                            title="Edit template"
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-2 p-4 border-t dark:border-slate-700">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                onSelectTemplate(null);
                                onOpenChange(false);
                            }}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            Compose from Scratch
                        </Button>
                    </div>
                </div>
            </div>

            {/* Preview Modal */}
            {previewTemplate && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setPreviewTemplate(null)} />
                    <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">{previewTemplate.name}</h3>
                                <p className="text-sm text-muted-foreground">{previewTemplate.subject}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => {
                                        handleSelect(previewTemplate);
                                        setPreviewTemplate(null);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    Use Template
                                </Button>
                                <button
                                    onClick={() => setPreviewTemplate(null)}
                                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-4">
                            <EmailPreview
                                subject={previewTemplate.subject}
                                bodyHtml={previewTemplate.bodyHtml}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
