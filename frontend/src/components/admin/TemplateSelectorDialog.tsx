'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { EmailTemplateBrowserDialog } from '@/components/email/EmailTemplateBrowserDialog';
import { toBadgeStatus } from '@/lib/statusVisuals';
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getEmailTemplates, type EmailTemplate as AdminEmailTemplate } from '@/services/adminEmailApi';
import { EmailPreview } from './EmailPreview';

export type EmailTemplate = AdminEmailTemplate;

interface TemplateSelectorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectTemplate: (template: EmailTemplate | null) => void;
    onComposeEmail: () => void;
    onEditTemplate?: (template: EmailTemplate) => void;
}

type BrowserTemplate = EmailTemplate & {
    status: { label: string; className: string };
};

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

    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        getEmailTemplates()
            .then(response => {
                if (!active) return;
                // Itemize-owned operational templates are intentionally kept
                // separate from organization campaign and automation content.
                setTemplates((response.templates || []).filter(template => template.organizationId == null));
            })
            .catch(error => {
                console.error('Error fetching templates:', error);
                toast({ title: 'Unable to load templates', description: 'The operational template library is temporarily unavailable.', variant: 'destructive' });
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [open, toast]);

    const browserTemplates: BrowserTemplate[] = templates.map(template => ({
        ...template,
        status: toBadgeStatus(getCatalogStatusVisual(template.isActive)),
    }));

    return (
        <EmailTemplateBrowserDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Choose an operational template"
            description="Itemize communications and system email templates."
            items={browserTemplates}
            loading={loading}
            onSelect={template => onSelectTemplate(template)}
            onEdit={onEditTemplate}
            renderPreview={template => <EmailPreview subject={template.subject} bodyHtml={template.bodyHtml} className="h-full" />}
            footerAction={(
                <Button type="button" className="bg-blue-600 text-white interaction-button--primary" onClick={onComposeEmail}>
                    <Mail className="h-4 w-4" />
                    Compose from scratch
                </Button>
            )}
            emptyTitle="No operational templates yet"
            emptyDescription="Compose this email from scratch."
        />
    );
}
