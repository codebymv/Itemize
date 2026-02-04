/**
 * Enhanced Page Preview Component with Device Selection
 */
import React, { useState } from 'react';
import { Monitor, Smartphone, Tablet, QrCode, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Device = 'desktop' | 'tablet' | 'mobile';

interface PageVersion {
    id: number;
    version_number: number;
}

interface PagePreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pageSlug: string;
    pageName: string;
    versionId?: number;
}

export function PagePreviewDialog({ open, onOpenChange, pageSlug, pageName, versionId }: PagePreviewDialogProps) {
    const [device, setDevice] = useState<Device>('desktop');
    
    const deviceWidths: Record<Device, number> = {
        desktop: 1920,
        tablet: 768,
        mobile: 375,
    };

    const previewUrl = versionId
        ? `/api/preview/version/${versionId}`
        : `/p/${pageSlug}`;

    const publicUrl = `${window.location.origin}/p/${pageSlug}`;

    const copyLink = () => {
        navigator.clipboard.writeText(publicUrl);
    };

    const generateQRCode = () => {
        window.open(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}`, '_blank');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl h-[90vh] p-0 flex flex-col">
                <DialogHeader className="px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
<div className="flex items-center gap-3">
                        <DialogTitle className="text-lg font-semibold">{pageName}</DialogTitle>
                        <Badge variant="outline" className="text-xs">
                            {versionId ? 'Version Preview' : 'Live Preview'}
                        </Badge>
                    </div>
                        <div className="flex items-center gap-2">
                            <DeviceSelector device={device} onChange={setDevice} />
                            <Button variant="outline" size="icon" onClick={copyLink} title="Copy Link">
                                <Share2 className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={generateQRCode} title="QR Code">
                                <QrCode className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex-1 bg-gray-100 dark:bg-gray-950 p-4 overflow-auto">
                    <div 
                        className="mx-auto bg-white dark:bg-gray-900 shadow-2xl rounded-lg overflow-hidden border"
                        style={{ 
                            maxWidth: deviceWidths[device],
                            height: '100%'
                        }}
                    >
                        {device === 'desktop' ? (
                            <iframe
                                src={previewUrl}
                                className="w-full h-full border-0"
                                title="Desktop Preview"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center p-8">
                                <div className="text-center text-muted-foreground">
                                    <p className="font-medium mb-2">Device Preview Coming Soon</p>
                                    <p className="text-sm">Use desktop preview for now</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function DeviceSelector({ device, onChange }: { device: Device; onChange: (d: Device) => void }) {
    return (
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            <Button
                variant={device === 'desktop' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onChange('desktop')}
                className="gap-2 h-8 px-3"
            >
                <Monitor className="h-4 w-4" />
                <span className="hidden sm:inline">Desktop</span>
            </Button>
            <Button
                variant={device === 'tablet' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onChange('tablet')}
                className="gap-2 h-8 px-3"
            >
                <Tablet className="h-4 w-4" />
                <span className="hidden sm:inline">Tablet</span>
            </Button>
            <Button
                variant={device === 'mobile' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onChange('mobile')}
                className="gap-2 h-8 px-3"
            >
                <Smartphone className="h-4 w-4" />
                <span className="hidden sm:inline">Mobile</span>
            </Button>
        </div>
    );
}