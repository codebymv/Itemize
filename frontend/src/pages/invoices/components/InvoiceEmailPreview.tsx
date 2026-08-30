'use client';

import { useCallback, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Monitor, Smartphone, ExternalLink } from 'lucide-react';
import { getInvoiceEmailPreview } from '@/services/invoicesApi';
import { sandboxedEmailPreviewDocument } from '@/lib/emailPreviewWindow';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/components/ErrorState';
import { PreviewPlaceholder } from '@/components/preview/PreviewPlaceholder';

interface InvoiceEmailPreviewProps {
    subject: string;
    message: string;
    includePaymentLink?: boolean;
    className?: string;
}

type ViewMode = 'desktop' | 'mobile';

const getErrorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error ? error.message : fallback;

export function InvoiceEmailPreview({
    subject,
    message,
    includePaymentLink = false,
    className,
}: InvoiceEmailPreviewProps) {
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('desktop');

    const generatePreview = useCallback(async () => {
        if (!message.trim()) {
            setPreviewHtml(null);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await getInvoiceEmailPreview({ subject, message, includePaymentLink });
            setPreviewHtml(response.html || null);
        } catch (err) {
            console.error('Error generating preview:', err);
            setError(getErrorMessage(err, 'Unable to generate the email preview.'));
        } finally {
            setLoading(false);
        }
    }, [includePaymentLink, message, subject]);

    useEffect(() => {
        // Debounce preview generation
        const timeoutId = setTimeout(() => {
            void generatePreview();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [generatePreview]);

    const handleOpenInNewWindow = () => {
        if (!previewHtml) return;

        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.opener = null;
            newWindow.document.write(sandboxedEmailPreviewDocument(previewHtml));
            newWindow.document.close();
        }
    };

    return (
        <div className={cn('space-y-3', className)}>
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button
                        variant={viewMode === 'desktop' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('desktop')}
                        className={viewMode === 'desktop' 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : ''
                        }
                    >
                        <Monitor className="h-4 w-4 mr-1" />
                        Desktop
                    </Button>
                    <Button
                        variant={viewMode === 'mobile' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('mobile')}
                        className={viewMode === 'mobile' 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : ''
                        }
                    >
                        <Smartphone className="h-4 w-4 mr-1" />
                        Mobile
                    </Button>
                </div>
                {previewHtml && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenInNewWindow}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open in New Window
                    </Button>
                )}
            </div>

            {/* Preview Container */}
            <div className="border rounded-lg bg-slate-50 dark:bg-slate-900 overflow-hidden">
                {loading && (
                    <div className="flex items-center justify-center h-[400px]">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                )}

                {error && (
                    <ErrorState
                        kind="inline"
                        title="Unable to load email preview"
                        description={error}
                        icon={Mail}
                        onAction={() => void generatePreview()}
                    />
                )}

                {!loading && !error && previewHtml && (
                    <div className={cn(
                        'mx-auto transition-all duration-200',
                        viewMode === 'desktop' ? 'w-full' : 'w-[375px]'
                    )}>
                        <iframe
                            srcDoc={previewHtml}
                            sandbox="allow-same-origin"
                            className="w-full h-[500px] border-0"
                            title="Invoice Email Preview"
                        />
                    </div>
                )}

                {!loading && !error && !previewHtml && (
                    <PreviewPlaceholder icon={Mail} title="Add message content to preview the email" />
                )}
            </div>
        </div>
    );
}

export default InvoiceEmailPreview;
