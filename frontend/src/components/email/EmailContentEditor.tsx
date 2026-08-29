import { useState } from 'react';
import { Braces } from 'lucide-react';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface EmailContentValue {
  subject: string;
  preheader: string;
  bodyHtml: string;
  bodyText: string;
}

interface EmailContentEditorProps {
  value: EmailContentValue;
  onChange: (value: EmailContentValue) => void;
  disabled?: boolean;
}

const variables = ['first_name', 'last_name', 'full_name', 'email', 'company', 'job_title'];

export function EmailContentEditor({ value, onChange, disabled = false }: EmailContentEditorProps) {
  const [variableTarget, setVariableTarget] = useState<'subject' | 'preheader' | 'bodyText' | 'bodyHtml'>('bodyHtml');
  const [insertText, setInsertText] = useState('');
  const [insertTextNonce, setInsertTextNonce] = useState(0);
  const update = (patch: Partial<EmailContentValue>) => onChange({ ...value, ...patch });

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    if (variableTarget === 'bodyHtml') {
      setInsertText(token);
      setInsertTextNonce(current => current + 1);
      return;
    }
    update({ [variableTarget]: `${value[variableTarget]}${token}` });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email-subject">Subject</Label>
          <Input
            id="email-subject"
            value={value.subject}
            maxLength={160}
            disabled={disabled}
            placeholder="A clear reason to open this email"
            onFocus={() => setVariableTarget('subject')}
            onChange={event => update({ subject: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-preheader">Preview text</Label>
          <Input
            id="email-preheader"
            value={value.preheader}
            maxLength={200}
            disabled={disabled}
            placeholder="The short text shown after the subject"
            onFocus={() => setVariableTarget('preheader')}
            onChange={event => update({ preheader: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Braces className="h-3.5 w-3.5" /> Insert for this recipient
          </span>
          {variables.map(variable => (
            <Button
              key={variable}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-7 px-2 font-mono text-[11px]"
              onClick={() => insertVariable(variable)}
            >
              {variable}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Click the subject, preview text, message, or fallback first to choose where a variable is inserted.</p>
      </div>

      <div className="space-y-2" onFocus={() => setVariableTarget('bodyHtml')}>
        <Label>Message</Label>
        <RichTextEditor
          value={value.bodyHtml}
          onChange={bodyHtml => update({ bodyHtml })}
          placeholder="Write the email your customer will receive..."
          minHeight="280px"
          disabled={disabled}
          insertText={insertText}
          insertTextNonce={insertTextNonce}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email-fallback">Plain-text fallback <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea
          id="email-fallback"
          value={value.bodyText}
          disabled={disabled}
          rows={5}
          placeholder="A text-only version for mail clients that cannot display HTML"
          onFocus={() => setVariableTarget('bodyText')}
          onChange={event => update({ bodyText: event.target.value })}
        />
      </div>
    </div>
  );
}
