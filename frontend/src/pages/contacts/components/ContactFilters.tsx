import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ContactFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  tagsFilter: string[];
  onTagsChange: (tags: string[]) => void;
  assignedToFilter?: number;
  onAssignedToChange: (userId?: number) => void;
  availableTags: string[];
  teamMembers: Array<{ id: number; name: string }>;
}

export function ContactFilters({
  statusFilter,
  onStatusChange,
  tagsFilter,
  onTagsChange,
  assignedToFilter,
  onAssignedToChange,
  availableTags,
  teamMembers,
}: ContactFiltersProps) {
  const hasActiveFilters = statusFilter !== 'all' || tagsFilter.length > 0 || assignedToFilter;

  const clearFilters = () => {
    onStatusChange('all');
    onTagsChange([]);
    onAssignedToChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center">
                {(statusFilter !== 'all' ? 1 : 0) + (tagsFilter.length > 0 ? 1 : 0) + (assignedToFilter ? 1 : 0)}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} aria-label="Clear all filters">
                  <X className="h-4 w-4 mr-1" />
                  Clear all
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={onStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {teamMembers.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Assigned to</label>
                <Select
                  value={assignedToFilter?.toString() || 'all'}
                  onValueChange={(v) => onAssignedToChange(v === 'all' ? undefined : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Anyone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Anyone</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {availableTags.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Tags</label>
                <div className="flex flex-wrap gap-1">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={tagsFilter.includes(tag) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        if (tagsFilter.includes(tag)) {
                          onTagsChange(tagsFilter.filter((t) => t !== tag));
                        } else {
                          onTagsChange([...tagsFilter, tag]);
                        }
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter badges */}
      {statusFilter !== 'all' && (
        <Badge variant="secondary" className="gap-1">
          Status: {statusFilter}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => onStatusChange('all')}
          />
        </Badge>
      )}
      {tagsFilter.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => onTagsChange(tagsFilter.filter((t) => t !== tag))}
          />
        </Badge>
      ))}
    </div>
  );
}

export default ContactFilters;
