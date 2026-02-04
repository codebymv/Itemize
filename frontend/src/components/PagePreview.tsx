import React, { useState } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Device = 'desktop' | 'tablet' | 'mobile';

interface DevicePreviewSelectorProps {
    selected: Device;
    onChange: (device: Device) => void;
}

export function DevicePreviewSelector({ selected, onChange }: DevicePreviewSelectorProps) {
    const devices: Array<{ key: Device; icon: typeof Monitor; label: string; width: string }> = [
        { key: 'desktop', icon: Monitor, label: 'Desktop', width: '100%' },
        { key: 'tablet', icon: Tablet, label: 'Tablet', width: '768px' },
        { key: 'mobile', icon: Smartphone, label: 'Mobile', width: '375px' },
    ];

    return (
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {devices.map((device) => (
                <Button
                    key={device.key}
                    variant={selected === device.key ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => onChange(device.key)}
                    className="gap-2 h-8 px-3"
                >
                    <device.icon className="h-4 w-4" />
                    <span className="hidden md:inline">{device.label}</span>
                </Button>
            ))}
        </div>
    );
}

interface PagePreviewProps {
    pageId: string;
    slug: string;
    content?: React.ReactNode;
    device?: Device;
}

export function PagePreview({ pageId, slug, content, device = 'desktop' }: PagePreviewProps) {
    const deviceWidths: Record<Device, string> = {
        desktop: '100%',
        tablet: '768px',
        mobile: '375px',
    };

    return (
        <div className="w-full min-h-[600px] border rounded-lg bg-background overflow-hidden">
            <div 
                className="mx-auto transition-all duration-300"
                style={{ width: device === 'mobile' || device === 'tablet' ? deviceWidths[device] : '100%' }}
            >
                <div className="bg-muted border-b px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Preview</span>
                    <Badge variant="outline" className="text-xs">{device}</Badge>
                </div>
                {content || (
                    <iframe
                        src={`/api/pages/public/page/${slug}`}
                        className="w-full h-[600px] border-0"
                        title="Page Preview"
                    />
                )}
            </div>
        </div>
    );
}