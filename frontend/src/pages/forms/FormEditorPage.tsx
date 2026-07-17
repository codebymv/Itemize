import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Copy,
    ExternalLink,
    FileText,
    Loader2,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useHeader } from '@/contexts/HeaderContext';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import {
    deleteFormSubmission,
    getForm,
    getFormSubmissions,
    updateForm,
    updateFormFields,
} from '@/services/formsApi';
import type {
    Form,
    FormField,
    FormFieldOption,
    FormFieldType,
    FormSubmission,
} from '@/types';

const FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
    { value: 'text', label: 'Short text' },
    { value: 'textarea', label: 'Long text' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'radio', label: 'Radio group' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'rating', label: 'Rating' },
    { value: 'nps', label: 'NPS' },
];

const CONTACT_FIELDS = [
    { value: 'none', label: 'Do not map' },
    { value: 'first_name', label: 'First name' },
    { value: 'last_name', label: 'Last name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
];

const OPTION_FIELD_TYPES = new Set<FormFieldType>(['select', 'radio', 'checkbox']);

type EditableField = FormField & {
    editor_key: string;
    options_text: string;
};

type SettingsDraft = {
    name: string;
    description: string;
    type: Form['type'];
    submitButtonText: string;
    successMessage: string;
    redirectUrl: string;
    notifyOnSubmit: boolean;
    notificationEmails: string;
    primaryColor: string;
    createContact: boolean;
    contactTags: string;
};

const optionText = (options: FormField['options']): string =>
    (options ?? [])
        .map(option => typeof option === 'string' ? option : option.label)
        .join(', ');

const parseList = (value: string): string[] =>
    [...new Set(
        value
            .split(/[\n,]/)
            .map(item => item.trim())
            .filter(Boolean),
    )];

const parseOptions = (value: string): FormFieldOption[] =>
    parseList(value).map(option => ({ label: option, value: option }));

const editableFields = (fields: FormField[]): EditableField[] =>
    fields.map((field, index) => ({
        ...field,
        editor_key: field.id ? `field-${field.id}` : `field-new-${index}`,
        options_text: optionText(field.options),
    }));

const apiFields = (fields: EditableField[]): FormField[] =>
    fields.map(({ editor_key: _editorKey, options_text: _optionsText, ...field }, index) => ({
        ...field,
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() || undefined,
        help_text: field.help_text?.trim() || undefined,
        map_to_contact_field: field.map_to_contact_field || undefined,
        options: OPTION_FIELD_TYPES.has(field.field_type)
            ? parseOptions(_optionsText)
            : [],
        field_order: index,
    }));

const settingsDraft = (form: Form): SettingsDraft => ({
    name: form.name,
    description: form.description ?? '',
    type: form.type,
    submitButtonText: form.submit_button_text,
    successMessage: form.success_message,
    redirectUrl: form.redirect_url ?? '',
    notifyOnSubmit: form.notify_on_submit,
    notificationEmails: form.notification_emails.join(', '),
    primaryColor: form.theme?.primaryColor || '#3B82F6',
    createContact: form.create_contact,
    contactTags: form.contact_tags.join(', '),
});

const submissionIdentity = (submission: FormSubmission): string => {
    const name = [submission.contact_first_name, submission.contact_last_name]
        .filter(Boolean)
        .join(' ');
    return name || submission.contact_email || `Submission ${submission.id}`;
};

export default function FormEditorPage() {
    const { id } = useParams<{ id: string }>();
    const formId = Number(id);
    const navigate = useNavigate();
    const { setHeaderContent } = useHeader();
    const { toast } = useToast();
    const {
        organizationId,
        isLoading: organizationLoading,
        error: organizationError,
    } = useOrganization({ onError: () => 'Failed to initialize.' });

    const [form, setForm] = useState<Form | null>(null);
    const [settings, setSettings] = useState<SettingsDraft | null>(null);
    const [fields, setFields] = useState<EditableField[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [savingFields, setSavingFields] = useState(false);
    const [changingStatus, setChangingStatus] = useState(false);
    const [activeTab, setActiveTab] = useState('settings');
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [submissionPage, setSubmissionPage] = useState(1);
    const [submissionPages, setSubmissionPages] = useState(1);
    const [submissionTotal, setSubmissionTotal] = useState(0);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [submissionToDelete, setSubmissionToDelete] = useState<FormSubmission | null>(null);
    const [deletingSubmission, setDeletingSubmission] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center gap-3 min-w-0">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to forms"
                    onClick={() => navigate('/forms')}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                <h1 className="text-lg font-semibold truncate">
                    {form?.name || 'Form editor'}
                </h1>
            </div>,
        );
        return () => setHeaderContent(null);
    }, [form?.name, navigate, setHeaderContent]);

    const loadForm = useCallback(async () => {
        if (organizationLoading) return;
        if (!Number.isInteger(formId) || formId < 1) {
            setError('Invalid form ID.');
            setLoading(false);
            return;
        }
        if (!organizationId) {
            setError(organizationError || 'No organization selected.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const loaded = await getForm(formId, organizationId);
            setForm(loaded);
            setSettings(settingsDraft(loaded));
            setFields(editableFields(loaded.fields ?? []));
        } catch {
            setError('Unable to load this form.');
        } finally {
            setLoading(false);
        }
    }, [formId, organizationError, organizationId, organizationLoading]);

    useEffect(() => {
        void loadForm();
    }, [loadForm]);

    const activeFormId = form?.id;

    const loadSubmissions = useCallback(async (page: number) => {
        if (!organizationId || !activeFormId) return;
        setLoadingSubmissions(true);
        try {
            const response = await getFormSubmissions(
                activeFormId,
                { page, limit: 25 },
                organizationId,
            );
            setSubmissions(response.submissions);
            setSubmissionPage(response.pagination.page);
            setSubmissionPages(Math.max(response.pagination.totalPages, 1));
            setSubmissionTotal(response.pagination.total);
            setForm(previous => previous ? {
                ...previous,
                submission_count: response.pagination.total,
            } : previous);
        } catch {
            toast({
                title: 'Error',
                description: 'Failed to load submissions.',
                variant: 'destructive',
            });
        } finally {
            setLoadingSubmissions(false);
        }
    }, [activeFormId, organizationId, toast]);

    useEffect(() => {
        if (activeTab === 'submissions') {
            void loadSubmissions(1);
        }
    }, [activeTab, loadSubmissions]);

    const publicPath = form ? `/form/${form.public_id || form.slug}` : '';
    const publicUrl = form ? `${window.location.origin}${publicPath}` : '';

    const copyPublicLink = async () => {
        if (!publicUrl) return;
        await navigator.clipboard.writeText(publicUrl);
        toast({ title: 'Link copied' });
    };

    const saveSettings = async () => {
        if (!organizationId || !form || !settings) return;
        if (!settings.name.trim()) {
            toast({
                title: 'Name required',
                description: 'Enter a form name before saving.',
                variant: 'destructive',
            });
            return;
        }

        setSavingSettings(true);
        try {
            const updated = await updateForm(
                form.id,
                {
                    name: settings.name.trim(),
                    description: settings.description.trim() || null,
                    type: settings.type,
                    submit_button_text: settings.submitButtonText.trim() || 'Submit',
                    success_message: settings.successMessage.trim() || 'Thank you!',
                    redirect_url: settings.redirectUrl.trim() || null,
                    notify_on_submit: settings.notifyOnSubmit,
                    notification_emails: parseList(settings.notificationEmails),
                    theme: {
                        ...form.theme,
                        primaryColor: settings.primaryColor,
                    },
                    create_contact: settings.createContact,
                    contact_tags: parseList(settings.contactTags),
                },
                organizationId,
            );
            setForm(previous => previous ? { ...previous, ...updated, fields: previous.fields } : updated);
            setSettings(settingsDraft({ ...form, ...updated }));
            toast({ title: 'Settings saved' });
        } catch {
            toast({
                title: 'Error',
                description: 'Failed to save form settings.',
                variant: 'destructive',
            });
        } finally {
            setSavingSettings(false);
        }
    };

    const changeStatus = async () => {
        if (!organizationId || !form) return;
        const status = form.status === 'published' ? 'draft' : 'published';
        setChangingStatus(true);
        try {
            const updated = await updateForm(form.id, { status }, organizationId);
            setForm(previous => previous ? { ...previous, ...updated, fields: previous.fields } : updated);
            toast({ title: status === 'published' ? 'Form published' : 'Form unpublished' });
        } catch {
            toast({
                title: 'Error',
                description: `Failed to ${status === 'published' ? 'publish' : 'unpublish'} form.`,
                variant: 'destructive',
            });
        } finally {
            setChangingStatus(false);
        }
    };

    const updateField = (index: number, patch: Partial<EditableField>) => {
        setFields(current => current.map((field, fieldIndex) =>
            fieldIndex === index ? { ...field, ...patch } : field
        ));
    };

    const addField = () => {
        setFields(current => [
            ...current,
            {
                editor_key: `field-new-${Date.now()}`,
                options_text: '',
                field_type: 'text',
                label: 'Untitled field',
                is_required: false,
                validation: {},
                options: [],
                field_order: current.length,
                width: 'full',
                conditions: [],
            },
        ]);
    };

    const moveField = (index: number, direction: -1 | 1) => {
        setFields(current => {
            const target = index + direction;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const removeField = (index: number) => {
        setFields(current => {
            const removedId = current[index]?.id;
            return current
                .filter((_, fieldIndex) => fieldIndex !== index)
                .map(field => ({
                    ...field,
                    conditions: removedId
                        ? (field.conditions ?? []).filter(condition =>
                            String(condition.field_id ?? condition.fieldId ?? '') !== String(removedId)
                        )
                        : field.conditions,
                }));
        });
    };

    const fieldValidationError = useMemo(() => {
        if (fields.length === 0) return 'Add at least one field.';
        if (fields.some(field => !field.label.trim())) return 'Every field needs a label.';
        if (fields.some(field =>
            ['select', 'radio'].includes(field.field_type) &&
            parseOptions(field.options_text).length === 0
        )) {
            return 'Dropdown and radio fields need at least one option.';
        }
        return null;
    }, [fields]);

    const saveFields = async () => {
        if (!organizationId || !form) return;
        if (fieldValidationError) {
            toast({
                title: 'Check fields',
                description: fieldValidationError,
                variant: 'destructive',
            });
            return;
        }

        setSavingFields(true);
        try {
            const response = await updateFormFields(form.id, apiFields(fields), organizationId);
            setFields(editableFields(response.fields));
            setForm(previous => previous ? {
                ...previous,
                fields: response.fields,
                field_count: response.fields.length,
            } : previous);
            toast({ title: 'Fields saved' });
        } catch {
            toast({
                title: 'Error',
                description: 'Failed to save fields.',
                variant: 'destructive',
            });
        } finally {
            setSavingFields(false);
        }
    };

    const confirmDeleteSubmission = async () => {
        if (!organizationId || !form || !submissionToDelete) return;
        setDeletingSubmission(true);
        try {
            await deleteFormSubmission(form.id, submissionToDelete.id, organizationId);
            setSubmissionToDelete(null);
            const remainingPages = Math.max(1, Math.ceil((submissionTotal - 1) / 25));
            await loadSubmissions(Math.min(submissionPage, remainingPages));
            toast({ title: 'Submission deleted' });
        } catch {
            toast({
                title: 'Error',
                description: 'Failed to delete submission.',
                variant: 'destructive',
            });
        } finally {
            setDeletingSubmission(false);
        }
    };

    if (loading || organizationLoading) {
        return (
            <PageContainer>
                <PageSurface>
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-72 w-full" />
                    </div>
                </PageSurface>
            </PageContainer>
        );
    }

    if (error || !form || !settings) {
        return (
            <PageContainer>
                <PageSurface className="max-w-xl mx-auto" contentClassName="text-center py-12">
                    <h2 className="text-lg font-semibold mb-2">Form unavailable</h2>
                    <p className="text-muted-foreground mb-5">{error || 'Unable to load this form.'}</p>
                    <div className="flex justify-center gap-2">
                        <Button variant="outline" onClick={() => navigate('/forms')}>Back to forms</Button>
                        <Button onClick={() => void loadForm()}>Retry</Button>
                    </div>
                </PageSurface>
            </PageContainer>
        );
    }

    return (
        <>
            <PageContainer>
                <PageSurface>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-2xl font-semibold truncate">{form.name}</h2>
                                <Badge variant={form.status === 'published' ? 'default' : 'secondary'}>
                                    {form.status}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{publicPath}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => void copyPublicLink()}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy link
                            </Button>
                            {form.status === 'published' && (
                                <Button variant="outline" asChild>
                                    <a href={publicPath} target="_blank" rel="noreferrer">
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        Preview
                                    </a>
                                </Button>
                            )}
                            <Button
                                variant={form.status === 'published' ? 'outline' : 'default'}
                                onClick={() => void changeStatus()}
                                disabled={changingStatus}
                            >
                                {changingStatus && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {form.status === 'published' ? 'Unpublish' : 'Publish'}
                            </Button>
                        </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                            <TabsTrigger value="fields">Fields</TabsTrigger>
                            <TabsTrigger value="submissions">
                                Submissions{form.submission_count ? ` (${form.submission_count})` : ''}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="settings" className="pt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Form settings</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-5 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="form-name">Name</Label>
                                            <Input
                                                id="form-name"
                                                value={settings.name}
                                                onChange={event => setSettings({ ...settings, name: event.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="form-type">Type</Label>
                                            <Select
                                                value={settings.type}
                                                onValueChange={(value: Form['type']) =>
                                                    setSettings({ ...settings, type: value })
                                                }
                                            >
                                                <SelectTrigger id="form-type" aria-label="Form type">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="form">Form</SelectItem>
                                                    <SelectItem value="survey">Survey</SelectItem>
                                                    <SelectItem value="quiz">Quiz</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="form-description">Description</Label>
                                        <Textarea
                                            id="form-description"
                                            value={settings.description}
                                            onChange={event => setSettings({ ...settings, description: event.target.value })}
                                        />
                                    </div>

                                    <div className="grid gap-5 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="submit-button-text">Submit button</Label>
                                            <Input
                                                id="submit-button-text"
                                                value={settings.submitButtonText}
                                                onChange={event => setSettings({ ...settings, submitButtonText: event.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="primary-color">Primary color</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="primary-color"
                                                    type="color"
                                                    className="w-14 p-1"
                                                    value={settings.primaryColor}
                                                    onChange={event => setSettings({ ...settings, primaryColor: event.target.value })}
                                                />
                                                <Input
                                                    aria-label="Primary color value"
                                                    value={settings.primaryColor}
                                                    onChange={event => setSettings({ ...settings, primaryColor: event.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="success-message">Success message</Label>
                                        <Input
                                            id="success-message"
                                            value={settings.successMessage}
                                            onChange={event => setSettings({ ...settings, successMessage: event.target.value })}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="redirect-url">Redirect URL</Label>
                                        <Input
                                            id="redirect-url"
                                            type="url"
                                            placeholder="https://example.com/thanks"
                                            value={settings.redirectUrl}
                                            onChange={event => setSettings({ ...settings, redirectUrl: event.target.value })}
                                        />
                                    </div>

                                    <div className="grid gap-5 md:grid-cols-2">
                                        <div className="rounded-lg border p-4 flex items-center justify-between gap-4">
                                            <div>
                                                <Label htmlFor="create-contact">Create contacts</Label>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Create or reuse a contact on submission.
                                                </p>
                                            </div>
                                            <Switch
                                                id="create-contact"
                                                checked={settings.createContact}
                                                onCheckedChange={checked => setSettings({ ...settings, createContact: checked })}
                                            />
                                        </div>
                                        <div className="rounded-lg border p-4 flex items-center justify-between gap-4">
                                            <div>
                                                <Label htmlFor="notify-submit">Submission email</Label>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Notify the listed addresses.
                                                </p>
                                            </div>
                                            <Switch
                                                id="notify-submit"
                                                checked={settings.notifyOnSubmit}
                                                onCheckedChange={checked => setSettings({ ...settings, notifyOnSubmit: checked })}
                                            />
                                        </div>
                                    </div>

                                    {settings.notifyOnSubmit && (
                                        <div className="space-y-2">
                                            <Label htmlFor="notification-emails">Notification emails</Label>
                                            <Input
                                                id="notification-emails"
                                                placeholder="owner@example.com, teammate@example.com"
                                                value={settings.notificationEmails}
                                                onChange={event => setSettings({ ...settings, notificationEmails: event.target.value })}
                                            />
                                        </div>
                                    )}

                                    {settings.createContact && (
                                        <div className="space-y-2">
                                            <Label htmlFor="contact-tags">Contact tags</Label>
                                            <Input
                                                id="contact-tags"
                                                placeholder="lead, website"
                                                value={settings.contactTags}
                                                onChange={event => setSettings({ ...settings, contactTags: event.target.value })}
                                            />
                                        </div>
                                    )}

                                    <div className="flex justify-end">
                                        <Button onClick={() => void saveSettings()} disabled={savingSettings}>
                                            {savingSettings
                                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                : <Save className="h-4 w-4 mr-2" />}
                                            Save settings
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="fields" className="pt-4">
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                    <Card key={field.editor_key}>
                                        <CardContent className="p-5">
                                            <div className="flex items-start justify-between gap-3 mb-5">
                                                <div>
                                                    <p className="font-medium">Field {index + 1}</p>
                                                    <p className="text-sm text-muted-foreground">{field.label}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={`Move ${field.label} up`}
                                                        disabled={index === 0}
                                                        onClick={() => moveField(index, -1)}
                                                    >
                                                        <ArrowUp className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={`Move ${field.label} down`}
                                                        disabled={index === fields.length - 1}
                                                        onClick={() => moveField(index, 1)}
                                                    >
                                                        <ArrowDown className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={`Delete ${field.label}`}
                                                        onClick={() => removeField(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor={`field-label-${field.editor_key}`}>Label</Label>
                                                    <Input
                                                        id={`field-label-${field.editor_key}`}
                                                        value={field.label}
                                                        onChange={event => updateField(index, { label: event.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Type</Label>
                                                    <Select
                                                        value={field.field_type}
                                                        onValueChange={(value: FormFieldType) =>
                                                            updateField(index, { field_type: value })
                                                        }
                                                    >
                                                        <SelectTrigger aria-label={`Type for ${field.label}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {FIELD_TYPES.map(type => (
                                                                <SelectItem key={type.value} value={type.value}>
                                                                    {type.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`field-placeholder-${field.editor_key}`}>Placeholder</Label>
                                                    <Input
                                                        id={`field-placeholder-${field.editor_key}`}
                                                        value={field.placeholder ?? ''}
                                                        onChange={event => updateField(index, { placeholder: event.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Contact field</Label>
                                                    <Select
                                                        value={field.map_to_contact_field || 'none'}
                                                        onValueChange={value => updateField(index, {
                                                            map_to_contact_field: value === 'none' ? undefined : value,
                                                        })}
                                                    >
                                                        <SelectTrigger aria-label={`Contact mapping for ${field.label}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {CONTACT_FIELDS.map(contactField => (
                                                                <SelectItem key={contactField.value} value={contactField.value}>
                                                                    {contactField.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Width</Label>
                                                    <Select
                                                        value={field.width}
                                                        onValueChange={(value: FormField['width']) =>
                                                            updateField(index, { width: value })
                                                        }
                                                    >
                                                        <SelectTrigger aria-label={`Width for ${field.label}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="full">Full width</SelectItem>
                                                            <SelectItem value="half">Half width</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="rounded-lg border px-4 py-3 flex items-center justify-between gap-3">
                                                    <Label htmlFor={`field-required-${field.editor_key}`}>Required</Label>
                                                    <Switch
                                                        id={`field-required-${field.editor_key}`}
                                                        checked={field.is_required}
                                                        onCheckedChange={checked => updateField(index, { is_required: checked })}
                                                    />
                                                </div>
                                            </div>

                                            {OPTION_FIELD_TYPES.has(field.field_type) && (
                                                <div className="space-y-2 mt-4">
                                                    <Label htmlFor={`field-options-${field.editor_key}`}>Options</Label>
                                                    <Input
                                                        id={`field-options-${field.editor_key}`}
                                                        placeholder="Option one, Option two"
                                                        value={field.options_text}
                                                        onChange={event => updateField(index, { options_text: event.target.value })}
                                                    />
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <Button variant="outline" onClick={addField}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add field
                                    </Button>
                                    <div className="flex items-center gap-3">
                                        {fieldValidationError && (
                                            <p className="text-sm text-destructive">{fieldValidationError}</p>
                                        )}
                                        <Button onClick={() => void saveFields()} disabled={savingFields}>
                                            {savingFields
                                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                : <Save className="h-4 w-4 mr-2" />}
                                            Save fields
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="submissions" className="pt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{submissionTotal} submissions</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {loadingSubmissions ? (
                                        <div className="space-y-3">
                                            <Skeleton className="h-16 w-full" />
                                            <Skeleton className="h-16 w-full" />
                                        </div>
                                    ) : submissions.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <p className="font-medium">No submissions yet</p>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Published responses will appear here.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="divide-y">
                                            {submissions.map(submission => (
                                                <div
                                                    key={submission.id}
                                                    className="py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-medium">{submissionIdentity(submission)}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {new Date(submission.created_at).toLocaleString()}
                                                        </p>
                                                        <dl className="grid gap-x-4 gap-y-1 mt-3 text-sm sm:grid-cols-2">
                                                            {Object.entries(submission.data).map(([key, value]) => (
                                                                <div key={key} className="min-w-0">
                                                                    <dt className="font-medium truncate">{key}</dt>
                                                                    <dd className="text-muted-foreground break-words">
                                                                        {typeof value === 'string'
                                                                            ? value
                                                                            : JSON.stringify(value)}
                                                                    </dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSubmissionToDelete(submission)}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {submissionPages > 1 && (
                                        <div className="flex items-center justify-end gap-2 pt-4 border-t">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={submissionPage <= 1 || loadingSubmissions}
                                                onClick={() => void loadSubmissions(submissionPage - 1)}
                                            >
                                                Previous
                                            </Button>
                                            <span className="text-sm text-muted-foreground">
                                                Page {submissionPage} of {submissionPages}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={submissionPage >= submissionPages || loadingSubmissions}
                                                onClick={() => void loadSubmissions(submissionPage + 1)}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </PageSurface>
            </PageContainer>

            <AlertDialog
                open={Boolean(submissionToDelete)}
                onOpenChange={open => {
                    if (!open && !deletingSubmission) setSubmissionToDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the response. It does not delete its contact.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletingSubmission}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deletingSubmission}
                            onClick={event => {
                                event.preventDefault();
                                void confirmDeleteSubmission();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deletingSubmission && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
