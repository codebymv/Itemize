import { FilterSelect } from '@/components/ui/filter-select';

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
        <FilterSelect<InvoiceView>
            value={value}
            onValueChange={onValueChange}
            aria-label="Select invoice view"
            triggerClassName={compact ? 'w-full' : undefined}
            options={[
                { value: 'invoices', label: 'All invoices', triggerLabel: compact ? 'Invoices' : 'All invoices' },
                { value: 'recurring', label: 'Recurring schedules', triggerLabel: compact ? 'Schedules' : 'Recurring schedules' },
            ]}
        />
    );
}
