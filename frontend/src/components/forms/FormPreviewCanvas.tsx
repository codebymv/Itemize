import { useState } from 'react';

import type { Form, FormField, JsonRecord, JsonValue } from '@/types';
import { publicFormFieldState } from '@/pages/forms/publicFormBehavior';
import { cn } from '@/lib/utils';

const fieldKey = (field: FormField) => String(field.id ?? field.field_order);

function FieldControl({
  field,
  value,
  required,
  controlId,
  labelId,
  onChange,
}: {
  field: FormField;
  value: JsonValue | undefined;
  required: boolean;
  controlId: string;
  labelId: string;
  onChange: (value: JsonValue) => void;
}) {
  const commonClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm';
  const options = (field.options || []).map(option => (
    typeof option === 'string' ? { label: option, value: option } : option
  ));

  if (field.field_type === 'textarea') {
    return <textarea id={controlId} aria-labelledby={labelId} className={`${commonClass} min-h-28`} placeholder={field.placeholder} required={required} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />;
  }
  if (field.field_type === 'select') {
    return (
      <select id={controlId} aria-labelledby={labelId} className={commonClass} required={required} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}>
        <option value="">Select an option</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field.field_type === 'radio') {
    return (
      <div id={controlId} role="radiogroup" aria-labelledby={labelId} className="space-y-2">
        {options.map(option => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`preview-field-${fieldKey(field)}`} required={required} checked={value === option.value} onChange={() => onChange(option.value)} />
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
          <input id={controlId} aria-labelledby={labelId} type="checkbox" required={required} checked={value === true} onChange={event => onChange(event.target.checked)} />
          {field.placeholder || 'Yes'}
        </label>
      );
    }
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div id={controlId} role="group" aria-labelledby={labelId} className="space-y-2">
        {options.map(option => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={event => onChange(event.target.checked ? [...selected, option.value] : selected.filter(item => item !== option.value))}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  if (field.field_type === 'rating' || field.field_type === 'nps') {
    return <input id={controlId} aria-labelledby={labelId} className={commonClass} type="number" min={field.field_type === 'rating' ? 1 : 0} max={field.field_type === 'rating' ? 5 : 10} step={1} required={required} value={typeof value === 'number' ? value : ''} onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))} />;
  }

  const inputType = { email: 'email', phone: 'tel', date: 'date', number: 'number' }[field.field_type] || 'text';
  return (
    <input
      className={commonClass}
      id={controlId}
      aria-labelledby={labelId}
      type={inputType}
      placeholder={field.placeholder}
      required={required}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      onChange={event => onChange(field.field_type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
    />
  );
}

type PreviewForm = Pick<Form, 'name' | 'description' | 'submit_button_text' | 'theme' | 'fields'>;

interface FormPreviewCanvasProps {
  form: PreviewForm;
  className?: string;
  idPrefix?: string;
}

export function FormPreviewCanvas({ form, className, idPrefix = 'form-preview' }: FormPreviewCanvasProps) {
  const [values, setValues] = useState<JsonRecord>({});
  const fields = [...(form.fields || [])].sort((a, b) => a.field_order - b.field_order);

  return (
    <div className={cn('bg-muted/20 p-4 sm:p-8', className)}>
      <form className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm" onSubmit={event => event.preventDefault()}>
        <div className="h-2" style={{ backgroundColor: form.theme?.primaryColor || '#3B82F6' }} />
        <div className="space-y-6 p-6 sm:p-8">
          <header>
            <h2 className="text-2xl font-semibold">{form.name}</h2>
            {form.description && <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>}
          </header>
          {fields.map(field => {
            const state = publicFormFieldState(field, values);
            if (!state.active) return null;
            const key = fieldKey(field);
            const controlId = `${idPrefix}-field-${key}`;
            const labelId = `${controlId}-label`;
            return (
              <div key={key} className="space-y-2">
                <label id={labelId} htmlFor={controlId} className="block text-sm font-medium">
                  {field.label}{state.required && <span className="ml-1 text-destructive">*</span>}
                </label>
                <FieldControl field={field} value={values[key]} required={state.required} controlId={controlId} labelId={labelId} onChange={value => setValues(current => ({ ...current, [key]: value }))} />
                {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
              </div>
            );
          })}
          {fields.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No fields have been added yet.</p>}
          <button
            type="button"
            aria-disabled="true"
            className="inline-flex w-full cursor-default items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium text-white opacity-70"
            style={{ backgroundColor: form.theme?.primaryColor || '#3B82F6' }}
          >
            {form.submit_button_text || 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}
