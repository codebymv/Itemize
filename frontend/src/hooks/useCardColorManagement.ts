import { useCallback } from 'react';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

interface UseCardColorManagementOptions {
  onSave: (newColor: string) => Promise<void> | void;
  onError?: (error: unknown) => void;
  rethrowOnError?: boolean;
}

export const useCardColorManagement = ({
  onSave,
  onError,
  rethrowOnError = true
}: UseCardColorManagementOptions) => {
  const { pending: isSavingColor, run } = useSingleFlightAction();

  const saveColor = useCallback(async (newColor: string) => {
    await run(async () => {
      try {
        await onSave(newColor);
      } catch (error) {
        onError?.(error);
        if (rethrowOnError) {
          throw error;
        }
      }
    });
  }, [onError, onSave, rethrowOnError, run]);

  return {
    isSavingColor,
    saveColor
  };
};
