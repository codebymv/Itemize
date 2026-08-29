import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FilterField, FilterOptions, SegmentFilter } from '@/services/segmentsApi';

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  greater_than: 'greater than',
  less_than: 'less than',
  between: 'is between',
  in: 'is one of',
  not_in: 'is not one of',
  has_any: 'has any of',
  has_all: 'has all of',
  has_none: 'has none of',
  after: 'is after',
  before: 'is before',
  last_n_days: 'in last N days',
  no_activity_days: 'no activity for N days',
  opened_campaign: 'opened campaign',
  never_opened: 'never opened',
  clicked_link: 'clicked link',
  in_stage: 'is in stage',
  has_open_deal: 'has open deal',
  won_deal: 'has won deal',
  lost_deal: 'has lost deal',
  has_upcoming: 'has upcoming',
  completed: 'completed',
  no_show: 'no show',
};

const humanizeLabel = (value: string): string => {
  const label = value.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

interface SegmentFilterRowProps {
  filter: SegmentFilter;
  index: number;
  fields: FilterField[];
  filterOptions: FilterOptions;
  onChange: (index: number, filter: SegmentFilter) => void;
  onRemove: (index: number) => void;
}

export function SegmentFilterRow({ filter, index, fields, filterOptions, onChange, onRemove }: SegmentFilterRowProps) {
  const field = fields.find(item => item.id === filter.field);
  const valueAsString = typeof filter.value === 'string' || typeof filter.value === 'number' ? String(filter.value) : '';
  const setValue = (value: SegmentFilter['value']) => onChange(index, { ...filter, value });

  const valueControl = () => {
    if (!field || filter.operator === 'is_empty' || filter.operator === 'is_not_empty') {
      return <div className="flex h-11 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">No value needed</div>;
    }
    if (field.type === 'select') return (
      <Select value={valueAsString} onValueChange={setValue}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select value" /></SelectTrigger><SelectContent>{field.options?.map(option => <SelectItem key={option} value={option}>{humanizeLabel(option)}</SelectItem>)}</SelectContent></Select>
    );
    if (field.type === 'tags') return (
      <Select value={Array.isArray(filter.value) ? String(filter.value[0] ?? '') : ''} onValueChange={value => setValue([Number(value)])}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select tag" /></SelectTrigger><SelectContent>{filterOptions.tags.map(tag => <SelectItem key={tag.id} value={String(tag.id)}>{tag.name}</SelectItem>)}</SelectContent></Select>
    );
    if (field.type === 'user') return (
      <Select value={valueAsString} onValueChange={value => setValue(Number(value))}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent>{filterOptions.users.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}</SelectContent></Select>
    );
    if (field.type === 'stage') return (
      <Select value={valueAsString} onValueChange={setValue}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select stage" /></SelectTrigger><SelectContent>{filterOptions.pipelines.flatMap(pipeline => pipeline.stages.map(stage => <SelectItem key={`${pipeline.id}-${stage.id}`} value={stage.id}>{pipeline.name}: {stage.name}</SelectItem>))}</SelectContent></Select>
    );
    if (field.type === 'boolean') return (
      <Select value={String(filter.value ?? true)} onValueChange={value => setValue(value === 'true')}><SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select>
    );
    return <Input className="h-11 w-full" type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={valueAsString} placeholder={field.type === 'number' ? '0' : 'Enter value'} onChange={event => setValue(field.type === 'number' ? Number(event.target.value) : event.target.value)} />;
  };

  return (
    <div className="grid items-end gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.75rem]">
      <div className="space-y-2"><Label>Field</Label><Select value={filter.field} onValueChange={fieldId => { const next = fields.find(item => item.id === fieldId); onChange(index, { field: fieldId, operator: next?.operators[0] || 'equals', value: '' }); }}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select field" /></SelectTrigger><SelectContent>{fields.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Rule</Label><Select value={filter.operator} onValueChange={operator => onChange(index, { ...filter, operator, value: operator === 'is_empty' || operator === 'is_not_empty' ? true : filter.value })}><SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select rule" /></SelectTrigger><SelectContent>{field?.operators.map(operator => <SelectItem key={operator} value={operator}>{humanizeLabel(OPERATOR_LABELS[operator] || operator)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Value</Label>{valueControl()}</div>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive sm:justify-self-end" onClick={() => onRemove(index)} aria-label={`Remove condition ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
