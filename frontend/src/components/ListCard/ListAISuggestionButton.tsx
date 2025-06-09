import React from 'react';
import { Sparkles, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ListAISuggestionButtonProps {
  suggestions: string[];
  isLoadingSuggestions: boolean;
  handleGetSuggestion: () => void;
  handleAcceptSuggestion: (suggestion: string) => void;
  currentSuggestion: string | null;
  aiEnabled: boolean;
}

export const ListAISuggestionButton: React.FC<ListAISuggestionButtonProps> = ({
  suggestions,
  isLoadingSuggestions,
  handleGetSuggestion,
  handleAcceptSuggestion,
  currentSuggestion,
  aiEnabled
}) => {
  return (
    <div className="px-6 pb-2">
      <div className="relative">
        <Button
          variant={aiEnabled ? "outline" : "ghost"}
          size="sm"
          onClick={handleGetSuggestion}
          disabled={isLoadingSuggestions}
          className={cn(
            "w-full flex items-center justify-center",
            suggestions.length > 0 && "mb-2",
            !aiEnabled && "text-gray-500 hover:text-blue-600",
            aiEnabled && "border-blue-600"
          )}
        >
          <Sparkles className={cn("h-4 w-4 mr-1", aiEnabled ? "text-blue-600" : "text-gray-400")} />
          {isLoadingSuggestions ? "Thinking..." : 
            aiEnabled 
              ? (currentSuggestion ? "Add Suggestion" : "Get AI Suggestions")
              : "Enable AI Suggestions"
          }
        </Button>
        
        {suggestions.length > 0 && (
          <div className="bg-gray-50 rounded-md p-2 space-y-1">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleAcceptSuggestion(suggestion)}
                  className="h-6 w-6 p-0"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
