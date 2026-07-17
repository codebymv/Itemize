import React, { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getPublicForm, PublicFormData, submitPublicForm } from '@/services/formsApi';
import type { FormField, JsonRecord, JsonValue } from '@/types';
import { publicFormFieldState, safePublicFormRedirect } from './publicFormBehavior';

const fieldKey = (field: FormField) => String(field.id);

function FieldControl({
    field,
    value,
    required,
    onChange,
}: {
    field: FormField;
    value: JsonValue | undefined;
    required: boolean;
    onChange: (value: JsonValue) => void;
}) {
    const commonClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm';
    const options = (field.options || []).map(option => (
        typeof option === 'string'
            ? { label: option, value: option }
            : option
    ));

    if (field.field_type === 'textarea') {
        return (
            <textarea
                className={`${commonClass} min-h-28`}
                placeholder={field.placeholder}
                required={required}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(event.target.value)}
            />
        );
    }

    if (field.field_type === 'select') {
        return (
            <select
                className={commonClass}
                required={required}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="">Select an option</option>
                {options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        );
    }

    if (field.field_type === 'radio') {
        return (
            <div className="space-y-2">
                {options.map(option => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                        <input
                            type="radio"
                            name={`field-${field.id}`}
                            required={required}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        );
    }

    if (field.field_type === 'checkbox') {
        if (options.length === 0) {
            return (
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        required={required}
                        checked={value === true}
                        onChange={(event) => onChange(event.target.checked)}
                    />
                    {field.placeholder || 'Yes'}
                </label>
            );
        }
        const selected = Array.isArray(value) ? value.map(String) : [];
        return (
            <div className="space-y-2">
                {options.map(option => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={selected.includes(option.value)}
                            onChange={(event) => {
                                const next = event.target.checked
                                    ? [...selected, option.value]
                                    : selected.filter(item => item !== option.value);
                                onChange(next);
                            }}
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        );
    }

    if (field.field_type === 'rating' || field.field_type === 'nps') {
        const min = field.field_type === 'rating' ? 1 : 0;
        const max = field.field_type === 'rating' ? 5 : 10;
        return (
            <input
                className={commonClass}
                type="number"
                min={min}
                max={max}
                step={1}
                required={required}
                value={typeof value === 'number' ? value : ''}
                onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
            />
        );
    }

    const inputType = {
        email: 'email',
        phone: 'tel',
        date: 'date',
        number: 'number',
    }[field.field_type] || 'text';
    return (
        <input
            className={commonClass}
            type={inputType}
            placeholder={field.placeholder}
            required={required}
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            onChange={(event) => {
                if (field.field_type === 'number' && event.target.value !== '') {
                    onChange(Number(event.target.value));
                } else {
                    onChange(event.target.value);
                }
            }}
        />
    );
}

export default function PublicFormPage() {
    const { identifier } = useParams<{ identifier: string }>();
    const [form, setForm] = useState<PublicFormData | null>(null);
    const [values, setValues] = useState<JsonRecord>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        let active = true;
        if (!identifier) {
            setError('Form not found');
            setLoading(false);
            return;
        }
        getPublicForm(identifier)
            .then(result => {
                if (active) setForm(result);
            })
            .catch(() => {
                if (active) setError('This form is unavailable.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [identifier]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!identifier || submitting) return;
        setSubmitting(true);
        setError('');
        try {
            const result = await submitPublicForm(identifier, values);
            setSuccessMessage(result.message || 'Thank you for your submission.');
            const redirect = safePublicFormRedirect(result.redirect_url);
            if (redirect) window.location.assign(redirect);
        } catch {
            setError('Please review your answers and try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen grid place-items-center bg-muted/20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading form" />
            </main>
        );
    }

    if (!form) {
        return (
            <main className="min-h-screen grid place-items-center bg-muted/20 px-4">
                <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
                    <h1 className="text-xl font-semibold">Form unavailable</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{error || 'This form is unavailable.'}</p>
                </div>
            </main>
        );
    }

    if (successMessage) {
        return (
            <main className="min-h-screen grid place-items-center bg-muted/20 px-4">
                <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
                    <h1 className="text-xl font-semibold">Submitted</h1>
                    <p className="mt-2 text-muted-foreground">{successMessage}</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-muted/20 px-4 py-10">
            <form
                onSubmit={submit}
                className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm"
            >
                <div
                    className="h-2"
                    style={{ backgroundColor: form.theme?.primaryColor || '#3B82F6' }}
                />
                <div className="space-y-6 p-6 sm:p-8">
                    <header>
                        <h1 className="text-2xl font-semibold">{form.name}</h1>
                        {form.description && (
                            <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">{form.organization_name}</p>
                    </header>

                    {form.fields.map(field => {
                        const state = publicFormFieldState(field, values);
                        if (!state.active) return null;
                        return (
                            <div key={fieldKey(field)} className="space-y-2">
                                <label className="block text-sm font-medium">
                                    {field.label}
                                    {state.required && <span className="ml-1 text-destructive">*</span>}
                                </label>
                                <FieldControl
                                    field={field}
                                    value={values[fieldKey(field)]}
                                    required={state.required}
                                    onChange={(value) => setValues(current => ({
                                        ...current,
                                        [fieldKey(field)]: value,
                                    }))}
                                />
                                {field.help_text && (
                                    <p className="text-xs text-muted-foreground">{field.help_text}</p>
                                )}
                            </div>
                        );
                    })}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: form.theme?.primaryColor || '#3B82F6' }}
                    >
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {form.submit_button_text || 'Submit'}
                    </button>
                </div>
            </form>
        </main>
    );
}
