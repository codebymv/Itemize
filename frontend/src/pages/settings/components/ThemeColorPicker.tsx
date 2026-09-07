import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  THEME_COLORS,
  THEME_COLOR_LABELS,
  THEME_PALETTE,
  applyThemeColor,
  type ThemeColor,
} from '@/lib/themeColor';
import { updateViewerPreferencesViaGraphql } from '@/services/authGraphql';

/**
 * Settings › Appearance: the theme colour swatches. Applying is optimistic so
 * the page recolours as the swatch is pressed; a failed save reverts and
 * explains. The server value is the record: the auth context re-applies it on
 * every load, and the localStorage mirror only covers the first paint.
 */
export function ThemeColorPicker() {
  const { toast } = useToast();
  const { currentUser } = useAuthState();
  const { updateCurrentUser } = useAuthActions();
  const applied = useThemeColor();
  const [saving, setSaving] = useState<ThemeColor | null>(null);

  const choose = async (next: ThemeColor) => {
    if (next === applied || saving) return;
    const previous = applied;
    applyThemeColor(next);
    setSaving(next);
    try {
      const user = await updateViewerPreferencesViaGraphql(next);
      if (currentUser) updateCurrentUser({ themeColor: user.themeColor });
    } catch {
      applyThemeColor(previous);
      toast({
        title: 'Theme color not saved',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div role="radiogroup" aria-label="Theme color" className="flex shrink-0 items-center gap-2">
      {THEME_COLORS.map(color => {
        const selected = color === applied;
        const swatch = THEME_PALETTE[color];
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={THEME_COLOR_LABELS[color]}
            disabled={saving !== null}
            onClick={() => void choose(color)}
            title={THEME_COLOR_LABELS[color]}
            className={cn(
              'interaction-control grid h-11 w-11 place-items-center rounded-full border',
              selected ? 'border-foreground/40 bg-accent' : 'border-transparent',
            )}
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-full"
              style={{ backgroundColor: swatch[600], color: '#ffffff' }}
            >
              {selected ? <Check className="h-4 w-4" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
