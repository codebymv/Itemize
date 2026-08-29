import { useState } from 'react';
import { Monitor, Smartphone, Tablet, X } from 'lucide-react';

import { FormPreviewCanvas } from '@/components/forms/FormPreviewCanvas';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Form } from '@/types';
import { cn } from '@/lib/utils';

type Device = 'desktop' | 'tablet' | 'mobile';

interface FormPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: Form;
}

export function FormPreviewDialog({ open, onOpenChange, form }: FormPreviewDialogProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const widths: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '375px' };
  const options = [
    { value: 'desktop' as const, label: 'Desktop', icon: Monitor },
    { value: 'tablet' as const, label: 'Tablet', icon: Tablet },
    { value: 'mobile' as const, label: 'Mobile', icon: Smartphone },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="flex h-[90vh] max-w-7xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <DialogTitle className="truncate text-lg font-semibold">{form.name}</DialogTitle>
            <div className="flex min-w-0 w-full items-center gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-muted/50 p-1 sm:flex-none">
                {options.map(({ value, label, icon: Icon }) => (
                  <Button key={value} variant={device === value ? 'default' : 'ghost'} size="sm" onClick={() => setDevice(value)} className="h-8 min-w-0 flex-1 gap-2 px-2 sm:flex-none sm:px-3" aria-label={`${label} preview`}>
                    <Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span>
                  </Button>
                ))}
              </div>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Close form preview"><X className="h-4 w-4" /></Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-gray-100 p-4 dark:bg-gray-950">
          <div className={cn('mx-auto min-h-full overflow-hidden rounded-lg border bg-background shadow-2xl transition-[width] duration-200')} style={{ width: widths[device], maxWidth: '100%' }}>
            <FormPreviewCanvas form={form} idPrefix={`form-preview-dialog-${form.id}`} className="min-h-full" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
