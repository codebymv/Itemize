import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type InvoiceView = 'invoices' | 'recurring';

interface InvoiceViewSelectProps {
    value: InvoiceView;
    onValueChange: (value: InvoiceView) => void;
    compact?: boolean;
}

export function InvoiceViewSelect({
    value,
    onValueChange,
    compact = false,
}: InvoiceViewSelectProps) {
    return (
        <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as InvoiceView)}>
            <SelectTrigger
                aria-label="Select invoice view"
                className={cn(
                    'h-11 bg-muted/20',
                    compact ? 'w-full' : 'w-[11.5rem]',
                )}
            >
                <SelectValue>
                    {compact
                        ? (value === 'recurring' ? 'Schedules' : 'Invoices')
                        : (value === 'recurring' ? 'Recurring schedules' : 'All invoices')}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="invoices">All invoices</SelectItem>
                <SelectItem value="recurring">Recurring schedules</SelectItem>
            </SelectContent>
        </Select>
    );
}
