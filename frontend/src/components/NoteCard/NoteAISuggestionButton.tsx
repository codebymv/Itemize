import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface NoteAISuggestionButtonProps {
  onSuggest: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export const NoteAISuggestionButton: React.FC<NoteAISuggestionButtonProps> = ({
  onSuggest,
  isLoading = false,
  disabled = false
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onSuggest}
      disabled={disabled || isLoading}
      className="h-6 text-xs gap-1"
    >
      <Sparkles className={`h-3 w-3 ${isLoading ? 'animate-pulse' : ''}`} />
      {isLoading ? 'Suggesting...' : 'AI Suggest'}
    </Button>
  );
}; 