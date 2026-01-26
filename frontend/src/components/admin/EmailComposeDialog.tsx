'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Mail, CheckCircle2, FileText, Save, X, Eye, EyeOff } from 'lucide-react';
import { EmailPreview } from './EmailPreview';
import { RichTextEditor } from './RichTextEditor';
import { sendEmail } from '@/services/adminEmailApi';
import { useToast } from '@/hooks/use-toast';
import { EmailTemplate } from './TemplateSelectorDialog';

interface Recipient {
    id?: number | string;
    email: string;
    name?: string;
}

interface EmailComposeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recipients: Recipient[];
    onSent?: () => void;
    initialTemplate?: EmailTemplate | null;
    onBrowseTemplates?: () => void;
}

export function EmailComposeDialog({
    open,
    onOpenChange,
    recipients,
    onSent,
    initialTemplate,
    onBrowseTemplates,
}: EmailComposeDialogProps) {
    const { toast } = useToast();

    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Preview visibility
    const [showPreview, setShowPreview] = useState(false);

    // Additional recipients (manually added email addresses)
    const [additionalRecipients, setAdditionalRecipients] = useState<Recipient[]>([]);
    const [emailInput, setEmailInput] = useState('');

    // Track original template for change detection
    const [originalTemplate, setOriginalTemplate] = useState<{
        subject: string;
        body: string;
    } | null>(null);

    // Initialize from template when dialog opens
    useEffect(() => {
        if (open && initialTemplate) {
            setSubject(initialTemplate.subject);
            setBody(initialTemplate.bodyHtml);
            setOriginalTemplate({
                subject: initialTemplate.subject,
                body: initialTemplate.bodyHtml,
            });
        } else if (open && !initialTemplate) {
            setOriginalTemplate(null);
        }
    }, [open, initialTemplate]);

    // Check if template has been modified
    const templateIsDirty = originalTemplate && (
        subject !== originalTemplate.subject ||
        body !== originalTemplate.body
    );

    // Combine flow recipients and additional recipients
    const allRecipients = [...recipients, ...additionalRecipients];

    // Validate email format
    const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    };

    // Add external email address
    const handleAddEmail = () => {
        const email = emailInput.trim();
        
        if (!email) return;
        
        if (!isValidEmail(email)) {
            toast({ title: 'Invalid email', description: 'Please enter a valid email address', variant: 'destructive' });
            return;
        }

        // Check if email already exists
        const emailExists = allRecipients.some(r => r.email === email);
        if (emailExists) {
            toast({ title: 'Duplicate', description: 'This email address is already in the recipient list', variant: 'destructive' });
            setEmailInput('');
            return;
        }

        const newRecipient: Recipient = {
            id: `manual-${Date.now()}`,
            email,
            name: email,
        };

        setAdditionalRecipients([...additionalRecipients, newRecipient]);
        setEmailInput('');
    };

    // Remove a manually added recipient
    const handleRemoveRecipient = (recipientId: string | number | undefined) => {
        if (!recipientId) return;
        setAdditionalRecipients(additionalRecipients.filter(r => r.id !== recipientId));
    };

    // Handle input key press
    const handleEmailInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddEmail();
        } else if (e.key === ',' || e.key === ' ') {
            e.preventDefault();
            handleAddEmail();
        }
    };

    const handleSend = async () => {
        if (!subject.trim() || !body.trim()) {
            toast({ title: 'Missing fields', description: 'Subject and message are required', variant: 'destructive' });
            return;
        }

        if (allRecipients.length === 0) {
            toast({ title: 'No recipients', description: 'No valid recipients found', variant: 'destructive' });
            return;
        }

        setSending(true);
        try {
            const result = await sendEmail({
                recipients: allRecipients.map(r => ({
                    id: typeof r.id === 'number' ? r.id : undefined,
                    email: r.email,
                    name: r.name,
                })),
                subject,
                bodyHtml: body,
            });

            setSuccess(true);

            setTimeout(() => {
                resetForm();
                onSent?.();
            }, 1500);
        } catch (error: any) {
            const message = error.message || 'Failed to send email';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setSending(false);
        }
    };

    const resetForm = () => {
        setSubject('');
        setBody('');
        setSuccess(false);
        setSaveSuccess(false);
        setOriginalTemplate(null);
        setShowPreview(false);
        setAdditionalRecipients([]);
        setEmailInput('');
        onOpenChange(false);
    };

    const handleClose = () => {
        if (!sending && !saving) {
            resetForm();
        }
    };

    const isValid = subject.trim().length > 0 && body.trim().length > 0 && allRecipients.length > 0;

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
                <div className={`relative bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full mx-4 max-h-[90vh] overflow-hidden transition-all ${showPreview ? 'max-w-7xl' : 'max-w-3xl'}`}>
                    {/* Header */}
                    <div className="flex items-start justify-between p-4 border-b dark:border-slate-700">
                        <div className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-blue-600" />
                            <div>
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Compose Email</h3>
                                <p className="text-sm text-muted-foreground">
                                    Send to {allRecipients.length} recipient{allRecipients.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {onBrowseTemplates && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onBrowseTemplates}
                                    className="text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200"
                                >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Browse Templates
                                </Button>
                            )}
                            <button
                                onClick={handleClose}
                                disabled={sending || saving}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {success ? (
                        <div className="py-12 text-center">
                            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                            <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Email sent successfully!</p>
                            <p className="text-sm text-muted-foreground">
                                Sent to {allRecipients.length} recipient{allRecipients.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    ) : (
                        <div className={`p-4 overflow-y-auto ${showPreview ? 'grid grid-cols-2 gap-6 max-h-[75vh]' : 'space-y-4 max-h-[65vh]'}`}>
                            {/* Left Column: Form */}
                            <div className="space-y-4">
                                {/* Save success notification */}
                                {saveSuccess && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span className="text-sm">Template saved successfully!</span>
                                    </div>
                                )}

                                {/* Recipients */}
                                <div className="space-y-2">
                                    <Label className="text-slate-700 dark:text-slate-200">To</Label>
                                    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border dark:border-slate-700 min-h-[42px] max-h-32 overflow-y-auto">
                                        {/* Flow recipients (from user selection) */}
                                        {recipients.slice(0, 20).map((recipient) => (
                                            <span
                                                key={recipient.id || recipient.email}
                                                className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                            >
                                                {recipient.name || recipient.email}
                                            </span>
                                        ))}
                                        {recipients.length > 20 && (
                                            <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                +{recipients.length - 20} more
                                            </span>
                                        )}

                                        {/* Additional recipients (manually added) */}
                                        {additionalRecipients.map((recipient) => (
                                            <span
                                                key={recipient.id}
                                                className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                            >
                                                {recipient.email}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveRecipient(recipient.id)}
                                                    className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                                                    disabled={sending}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}

                                        {/* Email input */}
                                        <input
                                            type="text"
                                            value={emailInput}
                                            onChange={(e) => setEmailInput(e.target.value)}
                                            onKeyDown={handleEmailInputKeyDown}
                                            onBlur={handleAddEmail}
                                            placeholder={allRecipients.length === 0 ? "Add email addresses..." : "Add more..."}
                                            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                                            disabled={sending}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Press Enter, Space, or Comma to add email addresses
                                    </p>
                                </div>

                                {/* Subject */}
                                <div className="space-y-2">
                                    <Label className="text-slate-700 dark:text-slate-200">Subject</Label>
                                    <Input
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder="Email subject..."
                                        disabled={sending}
                                    />
                                </div>

                                {/* Body */}
                                <div className="space-y-2">
                                    <Label className="text-slate-700 dark:text-slate-200">Message</Label>
                                    <RichTextEditor
                                        value={body}
                                        onChange={setBody}
                                        placeholder="Write your message..."
                                        minHeight="200px"
                                        disabled={sending}
                                    />
                                </div>
                            </div>

                            {/* Right Column: Preview */}
                            {showPreview && (
                                <div className="space-y-2">
                                    <Label className="text-slate-700 dark:text-slate-200">Preview</Label>
                                    <EmailPreview
                                        subject={subject}
                                        bodyHtml={body}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    {!success && (
                        <div className="flex items-center justify-between p-4 border-t dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                {/* Preview Toggle Button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowPreview(!showPreview)}
                                    className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                >
                                    {showPreview ? (
                                        <>
                                            <EyeOff className="h-4 w-4 mr-1" />
                                            Hide Preview
                                        </>
                                    ) : (
                                        <>
                                            <Eye className="h-4 w-4 mr-1" />
                                            Show Preview
                                        </>
                                    )}
                                </Button>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleClose}
                                    disabled={sending || saving}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSend}
                                    disabled={!isValid || sending}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {sending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Send to {allRecipients.length}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
