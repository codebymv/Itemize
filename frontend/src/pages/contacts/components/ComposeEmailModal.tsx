/**
 * Compose Email Modal
 * Allows users to send emails to contacts using templates or custom content
 */
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
    Dialog,
} from '@/components/ui/dialog';
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Contact } from '@/types';
import { getEmailTemplates, sendEmailToContact, type EmailTemplate } from '@/services/emailApi';
import { Loader2, Send, FileText, PenLine, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

interface ComposeEmailModalProps {
    contact: Contact;
    organizationId: number;
    onClose: () => void;
    onSent?: () => void;
}

export function ComposeEmailModal({
    contact,
    organizationId,
    onClose,
    onSent,
}: ComposeEmailModalProps) {
    const { toast } = useToast();
    const [mode, setMode] = useState<'template' | 'custom'>('custom');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Fetch templates
    const { data: templatesData, isLoading: templatesLoading } = useQuery({
        queryKey: ['emailTemplates', organizationId],
        queryFn: () => getEmailTemplates(organizationId, { is_active: true }),
        staleTime: 1000 * 60 * 5,
    });

    const templates = templatesData?.templates || [];

    // Get selected template
    const selectedTemplate = templates.find(t => t.id === parseInt(selectedTemplateId));

    // Send email mutation
    const sendMutation = useMutation({
        mutationFn: async () => {
            if (mode === 'template') {
                if (!selectedTemplateId) {
                    throw new Error('Please select a template');
                }
                return sendEmailToContact(
                    { contact_id: contact.id, template_id: parseInt(selectedTemplateId) },
                    organizationId
                );
            } else {
                if (!subject.trim() || !body.trim()) {
                    throw new Error('Subject and content are required');
                }
                return sendEmailToContact(
                    {
                        contact_id: contact.id,
                        subject: subject.trim(),
                        body_html: body.replace(/\n/g, '<br/>'),
                    },
                    organizationId
                );
            }
        },
        onSuccess: (result) => {
            if (result.success) {
                toast({
                    title: 'Email queued',
                    description: result.message,
                });
                onSent?.();
                onClose();
            } else {
                toast({
                    title: 'Failed to Send',
                    description: result.error || 'Unknown error',
                    variant: 'destructive',
                });
            }
        },
        onError: (error: Error) => {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    const handleSend = async () => {
        setIsSending(true);
        try {
            await sendMutation.mutateAsync();
        } finally {
            setIsSending(false);
        }
    };

    const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Contact';

    // Variable hints for custom mode
    const variableHints = [
        { var: '{{first_name}}', value: contact.first_name || '' },
        { var: '{{last_name}}', value: contact.last_name || '' },
        { var: '{{company}}', value: contact.company || '' },
        { var: '{{email}}', value: contact.email || '' },
    ];

    return (
        <Dialog open onOpenChange={() => onClose()}>
            <ModalContent size="lg">
                <ModalHeader
                    icon={Send}
                    title={`Send email to ${contactName}`}
                    description={`Send to ${contact.email}`}
                />

                <ModalBody>
                <Tabs value={mode} onValueChange={(v) => setMode(v as 'template' | 'custom')}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="custom" className="gap-2">
                            <PenLine className="h-4 w-4" />
                            Custom Email
                        </TabsTrigger>
                        <TabsTrigger value="template" className="gap-2">
                            <FileText className="h-4 w-4" />
                            Use Template
                        </TabsTrigger>
                    </TabsList>

                    {/* Custom email content */}
                    <TabsContent value="custom" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="subject" style={{ fontFamily: '"Raleway", sans-serif' }}>Subject</Label>
                            <Input
                                id="subject"
                                placeholder="Email subject..."
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="body">Message</Label>
                            <Textarea
                                id="body"
                                placeholder="Type your message here..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={10}
                                className="resize-none font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Use variables: {variableHints.map(h => h.var).join(', ')}
                            </p>
                        </div>

                        {/* Variable preview */}
                        {(subject.includes('{{') || body.includes('{{')) && (
                            <div className="p-3 rounded-lg bg-muted/30 border">
                                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                                    <Sparkles className="h-4 w-4" />
                                    Variable Preview
                                </div>
                                <div className="space-y-1 text-sm">
                                    {variableHints.filter(h => subject.includes(h.var) || body.includes(h.var)).map(h => (
                                        <div key={h.var} className="flex gap-2">
                                            <code className="text-xs bg-muted px-1 rounded">{h.var}</code>
                                            <span className="text-muted-foreground">→</span>
                                            <span>{h.value || <em className="text-muted-foreground">(empty)</em>}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* Template selection */}
                    <TabsContent value="template" className="space-y-4 mt-4">
                        {templatesLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : templates.length === 0 ? (
                            <EmptyState icon={FileText} kind="inline" title="No email templates available" />
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Select Template</Label>
                                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a template..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {templates.map((template) => (
                                                <SelectItem key={template.id} value={template.id.toString()}>
                                                    {template.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Template preview */}
                                {selectedTemplate && (
                                    <div className="p-4 rounded-lg border bg-muted/20">
                                        <div className="text-sm font-medium mb-2">Preview</div>
                                        <div className="space-y-2">
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">Subject: </span>
                                                <span className="font-medium">{selectedTemplate.subject}</span>
                                            </div>
                                            <div className="text-sm border-t pt-2 mt-2">
                                                <div
                                                    className="prose prose-sm dark:prose-invert max-w-none"
                                                    dangerouslySetInnerHTML={{ __html: selectedTemplate.body_html }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
                </ModalBody>

                <ModalFooter>
                    <Button variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={
                            isSending ||
                            (mode === 'template' && !selectedTemplateId) ||
                            (mode === 'custom' && (!subject.trim() || !body.trim()))
                        }
                        className="gap-2 bg-blue-600 interaction-button--primary text-white"
                        style={{ fontFamily: '"Raleway", sans-serif' }}
                        aria-label={isSending ? 'Sending email...' : 'Send email'}
                    >
                        {isSending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                Send Email
                            </>
                        )}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Dialog>
    );
}

export default ComposeEmailModal;
