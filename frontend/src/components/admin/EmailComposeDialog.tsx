'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Send, X } from 'lucide-react';
import { EmailStudioDialog } from '@/components/email/EmailStudioDialog';
import { RichTextEditor } from '@/components/email/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendEmail } from '@/services/adminEmailApi';
import { useToast } from '@/hooks/use-toast';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';
import { EmailPreview } from './EmailPreview';
import type { EmailTemplate } from './TemplateSelectorDialog';

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

type StudioMode = 'edit' | 'preview';

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
    const [mode, setMode] = useState<StudioMode>('edit');
    const [additionalRecipients, setAdditionalRecipients] = useState<Recipient[]>([]);
    const [emailInput, setEmailInput] = useState('');
    const {
        begin: beginSend,
        release: releaseSend,
        reset: resetSend,
    } = useStableMutationKey('admin-email');

    useEffect(() => {
        if (!open) return;
        setSubject(initialTemplate?.subject ?? '');
        setBody(initialTemplate?.bodyHtml ?? '');
        setMode('edit');
    }, [open, initialTemplate]);

    const allRecipients = [...recipients, ...additionalRecipients];

    const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    const handleAddEmail = () => {
        const email = emailInput.trim();
        if (!email) return;
        if (!isValidEmail(email)) {
            toast({ title: 'Invalid email', description: 'Please enter a valid email address', variant: 'destructive' });
            return;
        }
        if (allRecipients.some(recipient => recipient.email === email)) {
            toast({ title: 'Duplicate', description: 'This email address is already in the recipient list', variant: 'destructive' });
            setEmailInput('');
            return;
        }
        setAdditionalRecipients(current => [...current, {
            id: `manual-${Date.now()}`,
            email,
            name: email,
        }]);
        setEmailInput('');
    };

    const handleEmailInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
            event.preventDefault();
            handleAddEmail();
        }
    };

    const resetForm = () => {
        resetSend();
        setSubject('');
        setBody('');
        setMode('edit');
        setAdditionalRecipients([]);
        setEmailInput('');
        onOpenChange(false);
    };

    const handleClose = () => {
        if (!sending) resetForm();
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

        const payload = {
            recipients: allRecipients.map(recipient => ({
                id: typeof recipient.id === 'number' ? recipient.id : undefined,
                email: recipient.email.trim().toLowerCase(),
                name: recipient.name?.trim() || undefined,
            })),
            subject: subject.trim(),
            bodyHtml: body.trim(),
        };
        const idempotencyKey = beginSend(JSON.stringify(payload));
        if (!idempotencyKey) return;

        setSending(true);
        let result: Awaited<ReturnType<typeof sendEmail>>;
        try {
            result = await sendEmail({
                ...payload,
                idempotencyKey,
            });
        } catch (error: unknown) {
            releaseSend();
            toast({
                title: 'Unable to send email',
                description: error instanceof Error ? error.message : 'Failed to send email',
                variant: 'destructive',
            });
            setSending(false);
            return;
        }

        const queued = result.queued ?? 0;
        resetSend();
        toast({
            title: result.replayed
                ? 'Email already queued'
                : queued > 0 ? 'Email queued' : 'Email sent',
            description: result.replayed
                ? `Recovered the existing request for ${allRecipients.length} recipient${allRecipients.length === 1 ? '' : 's'}.`
                : `${queued > 0 ? 'Queued for' : 'Sent to'} ${allRecipients.length} recipient${allRecipients.length === 1 ? '' : 's'}.`,
        });
        try {
            resetForm();
            onSent?.();
        } catch (error) {
            console.error('Admin email queued, but follow-up UI work failed:', error);
        } finally {
            setSending(false);
        }
    };

    if (!open) return null;

    const editor = (
        <div className="mx-auto max-w-4xl space-y-5">
            <div className="flex min-h-0 flex-col space-y-2">
                <Label>To</Label>
                <div className="flex min-h-[44px] max-h-32 flex-wrap items-center gap-1.5 overflow-y-auto rounded-lg border bg-muted/40 p-2">
                    {recipients.slice(0, 20).map(recipient => (
                        <span key={recipient.id || recipient.email} className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs">
                            {recipient.name || recipient.email}
                        </span>
                    ))}
                    {recipients.length > 20 && <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">+{recipients.length - 20} more</span>}
                    {additionalRecipients.map(recipient => (
                        <span key={recipient.id} className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {recipient.email}
                            <button
                                type="button"
                                aria-label={`Remove ${recipient.email}`}
                                onClick={() => setAdditionalRecipients(current => current.filter(item => item.id !== recipient.id))}
                                className="ml-1 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
                                disabled={sending}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                    <input
                        type="email"
                        value={emailInput}
                        onChange={event => setEmailInput(event.target.value)}
                        onKeyDown={handleEmailInputKeyDown}
                        onBlur={handleAddEmail}
                        placeholder={allRecipients.length === 0 ? 'Add email addresses…' : 'Add more…'}
                        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        disabled={sending}
                        aria-label="Add recipient email"
                    />
                </div>
                <p className="text-xs text-muted-foreground">Press Enter, Space, or Comma to add an address.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="admin-email-subject">Subject</Label>
                <Input
                    id="admin-email-subject"
                    value={subject}
                    onChange={event => setSubject(event.target.value)}
                    placeholder="Email subject…"
                    disabled={sending}
                />
            </div>

            <div className="space-y-2">
                <Label>Message</Label>
                <RichTextEditor
                    value={body}
                    onChange={setBody}
                    placeholder="Write your message…"
                    minHeight="280px"
                    disabled={sending}
                />
            </div>
        </div>
    );

    return (
        <EmailStudioDialog
            open={open}
            onOpenChange={nextOpen => {
                if (!nextOpen) handleClose();
            }}
            title="Compose email"
            subtitle={`${allRecipients.length} recipient${allRecipients.length === 1 ? '' : 's'}`}
            editor={editor}
            preview={<EmailPreview subject={subject} bodyHtml={body} className="h-full" />}
            headerActions={onBrowseTemplates ? (
                <Button type="button" variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={onBrowseTemplates} disabled={sending}>
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">Browse templates</span>
                    <span className="sr-only sm:hidden">Browse templates</span>
                </Button>
            ) : undefined}
            mode={mode}
            onModeChange={setMode}
            publishing={sending}
            footer={(
                <>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={sending}>Cancel</Button>
                    <Button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || !subject.trim() || !body.trim() || allRecipients.length === 0}
                        aria-busy={sending}
                        className="bg-blue-600 text-white interaction-button--primary"
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        <span className="hidden sm:inline">Send to {allRecipients.length}</span>
                        <span className="sm:hidden">Send</span>
                    </Button>
                </>
            )}
        />
    );
}
