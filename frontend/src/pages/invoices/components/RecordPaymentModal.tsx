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
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, Calendar, CreditCard, Building, Banknote, FileText, HelpCircle } from 'lucide-react';

interface RecordPaymentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (paymentData: PaymentData) => void;
    recording: boolean;
    invoiceNumber: string;
    customerName: string;
    amountDue: number;
    total: number;
    amountPaid: number;
    currency: string;
}

export interface PaymentData {
    amount: number;
    payment_method: 'cash' | 'check' | 'bank_transfer' | 'card' | 'other';
    payment_date: string;
    notes?: string;
}

const PAYMENT_METHOD_OPTIONS = [
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'check', label: 'Check', icon: FileText },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: Building },
    { value: 'card', label: 'Card', icon: CreditCard },
    { value: 'other', label: 'Other', icon: HelpCircle },
];

export function RecordPaymentModal({
    open,
    onOpenChange,
    onConfirm,
    recording,
    invoiceNumber,
    customerName,
    amountDue,
    total,
    amountPaid,
    currency,
}: RecordPaymentModalProps) {
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | 'card' | 'other'>('cash');
    const [paymentDate, setPaymentDate] = useState('');
    const [notes, setNotes] = useState('');

    const formatCurrency = (amt: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(amt);
    };

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            // Pre-fill with amount due (ensure it's a number)
            const numericAmountDue = Number(amountDue) || 0;
            setAmount(numericAmountDue.toFixed(2));
            setPaymentMethod('cash');
            // Default to today
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setNotes('');
        }
    }, [open, amountDue]);

    const handleSubmit = () => {
        const parsedAmount = parseFloat(amount);
        if (!parsedAmount || parsedAmount <= 0) return;

        onConfirm({
            amount: parsedAmount,
            payment_method: paymentMethod,
            payment_date: paymentDate,
            notes: notes.trim() || undefined,
        });
    };

    const parsedAmount = parseFloat(amount) || 0;
    const numericAmountDue = Number(amountDue) || 0;
    const numericTotal = Number(total) || 0;
    const numericAmountPaid = Number(amountPaid) || 0;
    const isValid = parsedAmount > 0 && paymentDate;
    const isFullPayment = parsedAmount >= numericAmountDue;
    const remainingAfterPayment = Math.max(0, numericAmountDue - parsedAmount);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-blue-600" />
                        Record Payment
                    </DialogTitle>
                    <DialogDescription>
                        Record a payment for invoice <span className="font-semibold">{invoiceNumber}</span>
                        {customerName && <> from <span className="font-semibold">{customerName}</span></>}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Invoice Summary */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Invoice Total</span>
                            <span className="font-medium">{formatCurrency(numericTotal)}</span>
                        </div>
                        {numericAmountPaid > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Already Paid</span>
                                <span className="font-medium text-green-600">-{formatCurrency(numericAmountPaid)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm pt-2 border-t">
                            <span className="font-medium">Amount Due</span>
                            <span className="font-bold text-lg">{formatCurrency(numericAmountDue)}</span>
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label htmlFor="amount">Payment Amount *</Label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="pl-10"
                                placeholder="0.00"
                            />
                        </div>
                        {parsedAmount > 0 && (
                            <p className={`text-xs ${isFullPayment ? 'text-green-600' : 'text-amber-600'}`}>
                                {isFullPayment 
                                    ? 'This will mark the invoice as fully paid'
                                    : `Partial payment - ${formatCurrency(remainingAfterPayment)} will remain due`
                                }
                            </p>
                        )}
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                        <Label htmlFor="paymentMethod">Payment Method *</Label>
                        <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select payment method" />
                            </SelectTrigger>
                            <SelectContent>
                                {PAYMENT_METHOD_OPTIONS.map((opt) => {
                                    const Icon = opt.icon;
                                    return (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                {opt.label}
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Payment Date */}
                    <div className="space-y-2">
                        <Label htmlFor="paymentDate">Payment Date *</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="paymentDate"
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Reference / Notes (Optional)</Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Check number, transaction ID, or any notes..."
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={recording}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || recording}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {recording ? 'Recording...' : `Record ${formatCurrency(parsedAmount)}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
