import React, { useState, useEffect, useCallback } from 'react';
import { Filter, Plus, Trash2, Users, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  createSegment, 
  previewSegment, 
  getFilterOptions,
  SegmentFilter,
  FilterOptions,
  FilterField,
  SegmentPreview
} from '@/services/segmentsApi';
import { debounce } from 'lodash';

interface CreateSegmentModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (segment: any) => void;
}

// Operator display names
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

// Filter row component
interface FilterRowProps {
  filter: SegmentFilter;
  index: number;
  fields: FilterField[];
  filterOptions: FilterOptions;
  onChange: (index: number, filter: SegmentFilter) => void;
  onRemove: (index: number) => void;
}

function FilterRow({ filter, index, fields, filterOptions, onChange, onRemove }: FilterRowProps) {
  const field = fields.find(f => f.id === filter.field);
  const operators = field?.operators || [];
  
  const handleFieldChange = (fieldId: string) => {
    const newField = fields.find(f => f.id === fieldId);
    onChange(index, {
      field: fieldId,
      operator: newField?.operators[0] || 'equals',
      value: '',
    });
  };

  const handleOperatorChange = (operator: string) => {
    onChange(index, { ...filter, operator, value: operator === 'is_empty' || operator === 'is_not_empty' ? true : filter.value });
  };

  const handleValueChange = (value: any) => {
    onChange(index, { ...filter, value });
  };

  // Render value input based on field type
  const renderValueInput = () => {
    if (!field) return null;
    
    // No value input needed for empty checks
    if (filter.operator === 'is_empty' || filter.operator === 'is_not_empty') {
      return null;
    }

    switch (field.type) {
      case 'select':
        return (
          <Select value={filter.value || ''} onValueChange={handleValueChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'tags':
        return (
          <Select value={filter.value?.toString() || ''} onValueChange={(v) => handleValueChange([parseInt(v)])}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select tag..." />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'user':
        return (
          <Select value={filter.value?.toString() || ''} onValueChange={(v) => handleValueChange(parseInt(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select user..." />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.users.map((user) => (
                <SelectItem key={user.id} value={user.id.toString()}>{user.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'stage':
        return (
          <Select value={filter.value || ''} onValueChange={handleValueChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select stage..." />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.pipelines.flatMap((pipeline) => 
                pipeline.stages.map((stage) => (
                  <SelectItem key={`${pipeline.id}-${stage.id}`} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: stage.color }}
                      />
                      {pipeline.name}: {stage.name}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );

      case 'number':
        return (
          <Input
            type="number"
            value={filter.value || ''}
            onChange={(e) => handleValueChange(parseInt(e.target.value) || 0)}
            className="w-[100px]"
            placeholder="0"
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={filter.value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-[160px]"
          />
        );

      case 'boolean':
        return (
          <Select value={filter.value?.toString() || 'true'} onValueChange={(v) => handleValueChange(v === 'true')}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        );

      case 'text':
      default:
        return (
          <Input
            value={filter.value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-[160px]"
            placeholder="Enter value..."
          />
        );
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
      <Select value={filter.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Field..." />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filter.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Operator..." />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>{OPERATOR_LABELS[op] || op}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderValueInput()}

      <Button 
        type="button" 
        variant="ghost" 
        size="icon"
        onClick={() => onRemove(index)}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function CreateSegmentModal({
  organizationId,
  onClose,
  onCreated,
}: CreateSegmentModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    filter_type: 'and' as 'and' | 'or',
    is_active: true,
  });

  const [filters, setFilters] = useState<SegmentFilter[]>([]);

  // Fetch filter options on mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const options = await getFilterOptions(organizationId);
        setFilterOptions(options);
      } catch (error) {
        console.error('Error fetching filter options:', error);
        toast({
          title: 'Error',
          description: 'Failed to load filter options',
          variant: 'destructive',
        });
      } finally {
        setLoadingOptions(false);
      }
    };
    fetchOptions();
  }, [organizationId]);

  // Debounced preview function
  const fetchPreview = useCallback(
    debounce(async (currentFilters: SegmentFilter[], filterType: 'and' | 'or') => {
      if (currentFilters.length === 0) {
        setPreview(null);
        return;
      }

      // Validate all filters have values
      const validFilters = currentFilters.filter(f => 
        f.field && f.operator && 
        (f.operator === 'is_empty' || f.operator === 'is_not_empty' || f.value !== undefined && f.value !== '')
      );

      if (validFilters.length === 0) {
        setPreview(null);
        return;
      }

      setPreviewLoading(true);
      try {
        const result = await previewSegment(validFilters, filterType, organizationId);
        setPreview(result);
      } catch (error) {
        console.error('Error previewing segment:', error);
      } finally {
        setPreviewLoading(false);
      }
    }, 500),
    [organizationId]
  );

  // Update preview when filters change
  useEffect(() => {
    fetchPreview(filters, formData.filter_type);
  }, [filters, formData.filter_type, fetchPreview]);

  const handleAddFilter = () => {
    if (!filterOptions || filterOptions.fields.length === 0) return;
    
    const firstField = filterOptions.fields[0];
    setFilters(prev => [...prev, {
      field: firstField.id,
      operator: firstField.operators[0] || 'equals',
      value: '',
    }]);
  };

  const handleFilterChange = (index: number, filter: SegmentFilter) => {
    setFilters(prev => {
      const updated = [...prev];
      updated[index] = filter;
      return updated;
    });
  };

  const handleFilterRemove = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a segment name',
        variant: 'destructive',
      });
      return;
    }

    if (filters.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one filter condition',
        variant: 'destructive',
      });
      return;
    }

    // Validate all filters
    const invalidFilter = filters.find(f => 
      !f.field || !f.operator || 
      (f.operator !== 'is_empty' && f.operator !== 'is_not_empty' && (f.value === undefined || f.value === ''))
    );

    if (invalidFilter) {
      toast({
        title: 'Error',
        description: 'Please complete all filter conditions',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const segment = await createSegment({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        filter_type: formData.filter_type,
        filters: filters,
        segment_type: 'dynamic',
        is_active: formData.is_active,
      }, organizationId);
      
      toast({ title: 'Segment created', description: 'Your segment has been created successfully' });
      onCreated(segment);
    } catch (error: any) {
      console.error('Error creating segment:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create segment',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-blue-500" />
            Create Segment
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create a dynamic segment to group contacts based on specific criteria
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto space-y-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Segment Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Active Customers"
                />
              </div>
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Match Conditions</Label>
                <RadioGroup
                  value={formData.filter_type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, filter_type: v as 'and' | 'or' }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="and" id="filter-and" />
                    <Label htmlFor="filter-and" className="cursor-pointer">Match ALL</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="or" id="filter-or" />
                    <Label htmlFor="filter-or" className="cursor-pointer">Match ANY</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe this segment..."
                className="min-h-[60px]"
              />
            </div>

            {/* Filter Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Filter Conditions <span className="text-red-500">*</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFilter}
                  disabled={loadingOptions || !filterOptions}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Condition
                </Button>
              </div>

              {loadingOptions ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Loading filter options...
                  </CardContent>
                </Card>
              ) : filters.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No conditions added yet</p>
                    <p className="text-sm text-muted-foreground">Click "Add Condition" to define segment criteria</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filters.map((filter, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && (
                        <div className="flex items-center justify-center">
                          <Badge variant="secondary" className="text-xs">
                            {formData.filter_type === 'and' ? 'AND' : 'OR'}
                          </Badge>
                        </div>
                      )}
                      <FilterRow
                        filter={filter}
                        index={index}
                        fields={filterOptions?.fields || []}
                        filterOptions={filterOptions!}
                        onChange={handleFilterChange}
                        onRemove={handleFilterRemove}
                      />
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            {filters.length > 0 && (
              <Card className="bg-muted/30">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Preview
                      </span>
                    </div>
                    {previewLoading ? (
                      <span className="text-sm text-muted-foreground">Calculating...</span>
                    ) : preview ? (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-600">{preview.count} contacts</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Complete filters to see preview</span>
                    )}
                  </div>
                  
                  {preview && preview.sample.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Sample contacts:</p>
                      <div className="flex flex-wrap gap-2">
                        {preview.sample.slice(0, 5).map((contact) => (
                          <Badge key={contact.id} variant="outline" className="text-xs">
                            {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unknown'}
                          </Badge>
                        ))}
                        {preview.sample.length > 5 && (
                          <Badge variant="secondary" className="text-xs">
                            +{preview.count - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Active checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked as boolean }))}
              />
              <Label
                htmlFor="is_active"
                className="text-sm font-normal cursor-pointer"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Active (segment can be used in campaigns and automations)
              </Label>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || filters.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {loading ? 'Creating...' : 'Create Segment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateSegmentModal;
