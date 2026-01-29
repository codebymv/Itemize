import { useCallback, useState } from 'react';

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
  const [isSavingColor, setIsSavingColor] = useState(false);

  const saveColor = useCallback(async (newColor: string) => {
    setIsSavingColor(true);
    try {
      await onSave(newColor);
    } catch (error) {
      onError?.(error);
      if (rethrowOnError) {
        throw error;
      }
    } finally {
      setIsSavingColor(false);
    }
  }, [onError, onSave, rethrowOnError]);

  return {
    isSavingColor,
    saveColor
  };
};
