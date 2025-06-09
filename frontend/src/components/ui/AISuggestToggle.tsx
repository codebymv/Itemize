import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Switch } from './switch';
import { Label } from './label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
import { useAISuggest } from '@/context/AISuggestContext';

interface AISuggestToggleProps {
  onToggle?: (enabled: boolean) => void;
}

export const AISuggestToggle: React.FC<AISuggestToggleProps> = ({ 
  onToggle 
}) => {
  // Use the global AI suggestion context
  const { aiEnabled, setAiEnabled } = useAISuggest();
  
  // Call onToggle callback when aiEnabled changes
  useEffect(() => {
    if (onToggle) {
      onToggle(aiEnabled);
    }
  }, [aiEnabled, onToggle]);

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center space-x-2">
              <Switch
                checked={aiEnabled}
                onCheckedChange={setAiEnabled}
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
