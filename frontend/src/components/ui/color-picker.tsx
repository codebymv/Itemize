import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// HexColorPicker removed, using presets now.

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#EC4899',
  '#F87171', '#FBBF24', '#4ADE80', '#60A5FA', '#C084FC', '#78716C',
  '#D1D5DB', '#9CA3AF', '#6B7280', '#4B5563', '#374151', '#1F2937'
];

interface ColorPickerProps {
  color: string;
  onChange: (newColor: string) => void;
  onSave?: (newColor: string) => void; // Optional: To trigger save on close or change
  children: React.ReactNode;
  className?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onChange,
  onSave,
  children,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handlePresetSelect = (presetColor: string) => {
    onChange(presetColor); // Update preview
    if (onSave) {
      onSave(presetColor);   // Save the color
    }
    setIsOpen(false);     // Close the popover
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild className={className}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 shadow-xl grid grid-cols-6 gap-1" align="start">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset}
            title={preset}
            onClick={() => handlePresetSelect(preset)}
            className={`w-6 h-6 rounded-full border-2 transition-all
                        ${color === preset ? 'ring-2 ring-offset-1 ring-primary' : 'hover:opacity-80'}
                        focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary`}
            style={{ backgroundColor: preset, borderColor: preset === color ? 'var(--primary)' : preset }}
          >
            {/* Optional: Add a checkmark for the selected color */}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
