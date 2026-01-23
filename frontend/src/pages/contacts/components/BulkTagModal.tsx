import React, { useState } from 'react';
import { Tag, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { bulkUpdateContacts } from '@/services/contactsApi';
import { useToast } from '@/hooks/use-toast';

interface BulkTagModalProps {
    selectedContactIds: number[];
    organizationId: number;
    onClose: () => void;
    onCompleted: () => void;
}

export function BulkTagModal({
    selectedContactIds,
    organizationId,
    onClose,
    onCompleted
}: BulkTagModalProps) {
    const { toast } = useToast();
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [mode, setMode] = useState<'add' | 'remove'>('add');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAddTag = () => {
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    };

    const handleSubmit = async () => {
        if (tags.length === 0) {
            toast({
                title: 'No tags',
                description: 'Please add at least one tag',
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await bulkUpdateContacts({
                contact_ids: selectedContactIds,
                updates: {
                    tags,
                    tags_mode: mode,
                },
                organization_id: organizationId,
            });

            toast({
                title: 'Success',
                description: `${mode === 'add' ? 'Added' : 'Removed'} ${tags.length} tag${tags.length > 1 ? 's' : ''} ${mode === 'add' ? 'to' : 'from'} ${selectedContactIds.length} contact${selectedContactIds.length > 1 ? 's' : ''}`,
            });

            onCompleted();
            onClose();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.response?.data?.error || 'Failed to update tags',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Manage Tags
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'add' ? 'Add' : 'Remove'} tags for {selectedContactIds.length} selected contact{selectedContactIds.length > 1 ? 's' : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Mode selection */}
                    <div className="space-y-2">
                        <Label>Action</Label>
                        <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'add' | 'remove')} className="flex gap-4">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="add" id="add" />
                                <Label htmlFor="add" className="flex items-center gap-1 cursor-pointer">
                                    <Plus className="h-3 w-3" /> Add Tags
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="remove" id="remove" />
                                <Label htmlFor="remove" className="flex items-center gap-1 cursor-pointer">
                                    <Minus className="h-3 w-3" /> Remove Tags
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Tag input */}
                    <div className="space-y-2">
                        <Label>Tags</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter tag name..."
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleAddTag}
                                disabled={!tagInput.trim()}
                            >
                                Add
                            </Button>
                        </div>
                    </div>

                    {/* Tag list */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                                <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="px-2 py-1 cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                    onClick={() => handleRemoveTag(tag)}
                                >
                                    {tag}
                                    <span className="ml-1 text-xs">×</span>
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={tags.length === 0 || isSubmitting}
                        className={mode === 'add' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}
                    >
                        {isSubmitting ? 'Updating...' : `${mode === 'add' ? 'Add' : 'Remove'} Tags`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default BulkTagModal;
