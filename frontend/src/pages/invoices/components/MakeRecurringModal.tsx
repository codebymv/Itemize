import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Repeat, AlertTriangle, Calendar, FileText } from 'lucide-react';

interface MakeRecurringModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (options: RecurringOptions) => void;
    converting: boolean;
    invoiceNumber: string;
    customerName: string;
    total: number;
    currency: string;
    itemCount: number;
    status: string;
}

export interface RecurringOptions {
    template_name: string;
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    start_date: string;
    end_date?: string;
}

const FREQUENCY_OPTIONS = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
];

export function MakeRecurringModal({
    open,
    onOpenChange,
    onConfirm,
    converting,
    invoiceNumber,
    customerName,
    total,
    currency,
    itemCount,
    status,
}: MakeRecurringModalProps) {
    const [templateName, setTemplateName] = useState('');
    const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(amount);
    };

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            // Default template name to customer name or invoice number
            setTemplateName(customerName || `Invoice ${invoiceNumber}`);
            setFrequency('monthly');
            // Default start date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            setStartDate(tomorrow.toISOString().split('T')[0]);
            setEndDate('');
        }
    }, [open, customerName, invoiceNumber]);

    const handleSubmit = () => {
        if (!templateName || !frequency || !startDate) return;

        onConfirm({
            template_name: templateName,
            frequency,
            start_date: startDate,
            end_date: endDate || undefined,
        });
    };

    const isValid = templateName.trim() && frequency && startDate;

    // Determine warning level based on status
    const getWarningMessage = () => {
        if (status === 'paid') {
            return 'This invoice has already been paid. Converting it will remove the payment record.';
        }
        if (['partial', 'overdue'].includes(status)) {
            return 'This invoice has outstanding payment activity. Converting it will remove all payment records.';
        }
        if (['sent', 'viewed'].includes(status)) {
            return 'This invoice has been sent to the customer. The original invoice will be removed.';
        }
        return 'The original invoice will be converted to a recurring template and removed from your invoices.';
    };

    const isHighRiskStatus = ['paid', 'partial', 'overdue'].includes(status);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Repeat className="h-5 w-5 text-blue-600" />
                        Make Invoice Recurring
                    </DialogTitle>
                    <DialogDescription>
                        Convert invoice <span className="font-semibold">{invoiceNumber}</span> into a recurring template.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Warning Alert */}
                    <Alert variant={isHighRiskStatus ? 'destructive' : 'default'} className={isHighRiskStatus ? '' : 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'}>
                        <AlertTriangle className={`h-4 w-4 ${isHighRiskStatus ? '' : 'text-amber-600'}`} />
                        <AlertDescription className={isHighRiskStatus ? '' : 'text-amber-800 dark:text-amber-200'}>
                            {getWarningMessage()}
                        </AlertDescription>
                    </Alert>

                    {/* Invoice Summary */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Summary:</span>
                        </div>
                        <div className="text-sm pl-6">
                            <span className="font-medium">{itemCount} line item{itemCount !== 1 ? 's' : ''}</span>
                            {' totaling '}
                            <span className="font-medium">{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* Template Name */}
                    <div className="space-y-2">
                        <Label htmlFor="templateName">Template Name *</Label>
                        <Input
                            id="templateName"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="e.g., Monthly Service Fee"
                        />
                    </div>

                    {/* Frequency */}
                    <div className="space-y-2">
                        <Label htmlFor="frequency">Frequency *</Label>
                        <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent>
                                {FREQUENCY_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date *</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="startDate"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            First invoice will be generated on this date
                        </p>
                    </div>

                    {/* End Date (Optional) */}
                    <div className="space-y-2">
                        <Label htmlFor="endDate">End Date (Optional)</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="endDate"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-10"
                                min={startDate}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Leave empty for no end date
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={converting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || converting}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {converting ? 'Converting...' : 'Create Recurring Template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
