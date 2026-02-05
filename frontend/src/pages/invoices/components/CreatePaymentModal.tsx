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
import { DollarSign, Calendar, CreditCard, Building, Banknote, FileText, HelpCircle, User } from 'lucide-react';

interface CreatePaymentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (paymentData: PaymentData) => void;
    creating: boolean;
}

export interface PaymentData {
    contact_id?: number;
    invoice_id?: number;
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

export function CreatePaymentModal({
    open,
    onOpenChange,
    onConfirm,
    creating,
}: CreatePaymentModalProps) {
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | 'card' | 'other'>('cash');
    const [paymentDate, setPaymentDate] = useState('');
    const [notes, setNotes] = useState('');

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setAmount('');
            setPaymentMethod('cash');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setNotes('');
        }
    }, [open]);

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
    const isValid = parsedAmount > 0 && paymentDate;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-blue-600" />
                        Record Payment
                    </DialogTitle>
                    <DialogDescription>
                        Record a manual payment received outside of the invoice system.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
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
                            <p className="text-xs text-muted-foreground">
                                Recording {new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD'
                                }).format(parsedAmount)}
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
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || creating}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {creating ? 'Recording...' : 'Record Payment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}