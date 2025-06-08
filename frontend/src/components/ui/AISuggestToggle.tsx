import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AISuggestToggleProps {
  defaultEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

const LOCAL_STORAGE_KEY = 'itemize-ai-suggest-enabled';

export const AISuggestToggle: React.FC<AISuggestToggleProps> = ({ 
  defaultEnabled = true, // Default to enabled for fresh users
  onToggle 
}) => {
  // Initialize from localStorage if available
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const savedValue = localStorage.getItem(LOCAL_STORAGE_KEY);
      return savedValue ? JSON.parse(savedValue) : defaultEnabled;
    } catch (e) {
      return defaultEnabled;
    }
  });

  // Update localStorage when state changes
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(enabled));
    
    if (onToggle) {
      onToggle(enabled);
    }
  }, [enabled, onToggle]);

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center space-x-2">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                id="ai-suggest-toggle"
              />
              <Label htmlFor="ai-suggest-toggle" className="text-sm font-medium cursor-pointer flex items-center">
                <Sparkles size={14} className="mr-1 text-blue-500" />
                AI Suggest
              </Label>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Enable AI suggestions for list items</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default AISuggestToggle;
