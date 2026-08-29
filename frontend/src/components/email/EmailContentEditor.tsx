import { useState, type ReactNode } from 'react';
import { Braces, ChevronDown, Info } from 'lucide-react';
import { RichTextEditor } from '@/components/email/RichTextEditor';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  header?: ReactNode;
}

const variables = [
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'full_name', label: 'Full name' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job title' },
];

export function EmailContentEditor({ value, onChange, disabled = false, header }: EmailContentEditorProps) {
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
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        {header && <div className="min-w-0">{header}</div>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={disabled} className="h-9 gap-2">
                <Braces className="h-4 w-4" />Insert variable<ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {variables.map(variable => <DropdownMenuItem key={variable.value} onSelect={() => insertVariable(variable.value)} className="flex items-center justify-between gap-4"><span>{variable.label}</span><span className="font-mono text-xs text-muted-foreground">{`{{${variable.value}}}`}</span></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip><TooltipTrigger asChild><button type="button" aria-label="About recipient variables" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Info className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>Inserts into the field you last selected.</TooltipContent></Tooltip>
        </div>
      </div>

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
