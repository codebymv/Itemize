'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Monitor, Smartphone, ExternalLink, AlertCircle } from 'lucide-react';
import { getPreview } from '@/services/adminEmailApi';
import { cn } from '@/lib/utils';

interface EmailPreviewProps {
    subject: string;
    bodyHtml: string;
    className?: string;
}

type ViewMode = 'desktop' | 'mobile';

export function EmailPreview({
    subject,
    bodyHtml,
    className,
}: EmailPreviewProps) {
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('desktop');

    useEffect(() => {
        // Debounce preview generation
        const timeoutId = setTimeout(() => {
            generatePreview();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [subject, bodyHtml]);

    const generatePreview = async () => {
        // Skip if no content
        if (!bodyHtml.trim()) {
            setPreviewHtml(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await getPreview({
                subject,
                bodyHtml,
            });

            setPreviewHtml(response.html || null);
        } catch (err: any) {
            console.error('Error generating preview:', err);
            setError(err.message || 'Failed to generate preview');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenInNewWindow = () => {
        if (!previewHtml) return;

        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(previewHtml);
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
                            ? 'bg-blue-600 hover:bg-blue-700'
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
                            ? 'bg-blue-600 hover:bg-blue-700'
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
                        className="text-blue-600 hover:text-blue-700"
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
                    <div className="p-4">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    </div>
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
                            title="Email Preview"
                        />
                    </div>
                )}

                {!loading && !error && !previewHtml && (
                    <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">
                        Enter message content to see preview
                    </div>
                )}
            </div>
        </div>
    );
}
