import { type ReactNode } from 'react';
import { Eye, Loader2, Mail, MonitorCog, Save, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { EmailContentValue } from './EmailContentEditor';
import { EmailPreviewPane } from './EmailPreviewPane';

type StudioMode = 'edit' | 'preview';

interface EmailStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  status?: { label: string; className?: string };
  organizationId?: number;
  content?: EmailContentValue;
  editor: ReactNode;
  preview?: ReactNode;
  headerActions?: ReactNode;
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  saving?: boolean;
  testing?: boolean;
  publishing?: boolean;
  saveDisabled?: boolean;
  testDisabled?: boolean;
  publishDisabled?: boolean;
  onSave?: () => void;
  onTest?: () => void;
  onPublish?: () => void;
  footer?: ReactNode;
}

export function EmailStudioDialog({
  open, onOpenChange, title, subtitle, status, organizationId, content, editor, preview, headerActions,
  mode, onModeChange,
  saving = false, testing = false, publishing = false,
  saveDisabled = false, testDisabled = false, publishDisabled = false,
  onSave, onTest, onPublish, footer,
}: EmailStudioDialogProps) {
  const busy = saving || testing || publishing;
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideCloseButton className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 p-0 sm:h-[94dvh] sm:w-[96vw] sm:max-w-[1500px] sm:rounded-xl sm:border">
          <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogTitle className="truncate text-base sm:text-lg">{title}</DialogTitle>
                    {status && <Badge variant="outline" className={cn('hidden shrink-0 sm:inline-flex', status.className)}>{status.label}</Badge>}
                  </div>
                  {subtitle && <DialogDescription className="truncate text-left text-xs sm:text-sm">{subtitle}</DialogDescription>}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {headerActions}
                <div className="flex items-center rounded-lg bg-muted/60 p-1 xl:hidden">
                  <Button type="button" variant="toggle" size="compact" className="px-2 sm:px-3" aria-pressed={mode === 'edit'} onClick={() => onModeChange('edit')} disabled={busy}>
                    <MonitorCog className="h-4 w-4" /><span className="hidden sm:inline">Edit</span><span className="sr-only sm:hidden">Edit email</span>
                  </Button>
                  <Button type="button" variant="toggle" size="compact" className="px-2 sm:px-3" aria-pressed={mode === 'preview'} onClick={() => onModeChange('preview')} disabled={busy}>
                    <Eye className="h-4 w-4" /><span className="hidden sm:inline">Preview</span><span className="sr-only sm:hidden">Preview email</span>
                  </Button>
                </div>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Close email studio" disabled={busy}>
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
            {!subtitle && <DialogDescription className="sr-only">Edit and preview this email.</DialogDescription>}
          </DialogHeader>

          <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
            <section className={cn('min-h-0 overflow-y-auto p-4 sm:p-5 xl:block xl:border-r', mode !== 'edit' && 'hidden')} aria-label="Email editor">
              <div className="mx-auto max-w-4xl">{editor}</div>
            </section>
            <section className={cn('min-h-0 overflow-hidden p-4 sm:p-5 xl:block', mode !== 'preview' && 'hidden')} aria-label="Email preview">
              {preview ?? (organizationId !== undefined && content
                ? <EmailPreviewPane organizationId={organizationId} content={content} className="h-full" />
                : null)}
            </section>
          </div>

          {footer !== null && (
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3 sm:px-5">
              {footer !== undefined ? footer : (
                <>
                  <Button type="button" variant="outline" disabled={busy || saveDisabled} onClick={onSave}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="hidden sm:inline">Save draft</span><span className="sm:hidden">Save</span>
                  </Button>
                  <Button type="button" variant="outline" disabled={busy || testDisabled} onClick={onTest}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">Send test</span><span className="sm:hidden">Test</span>
                  </Button>
                  <Button type="button" disabled={busy || publishDisabled} onClick={onPublish}>
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publish
                  </Button>
                </>
              )}
            </footer>
          )}
        </DialogContent>
      </Dialog>
  );
}
