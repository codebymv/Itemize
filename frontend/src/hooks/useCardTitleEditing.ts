import { useCallback, useEffect, useRef, useState } from 'react';

interface UseCardTitleEditingOptions {
  title: string;
  compareTitle?: string | null;
  onSave: (nextTitle: string) => Promise<void> | void;
  validateTitle?: (nextTitle: string) => boolean;
  onInvalidTitle?: () => void;
  onError?: (error: unknown) => void;
}

export const useCardTitleEditing = ({
  title,
  compareTitle,
  onSave,
  validateTitle,
  onInvalidTitle,
  onError
}: UseCardTitleEditingOptions) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const titleEditRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  const handleEditTitle = useCallback(async () => {
    const nextTitle = editTitle.trim();
    const currentTitle = (compareTitle ?? title).trim();

    if (validateTitle && !validateTitle(nextTitle)) {
      onInvalidTitle?.();
      return;
    }

    if (nextTitle !== currentTitle) {
      try {
        await onSave(nextTitle);
      } catch (error) {
        onError?.(error);
        return;
      }
    }

    setIsEditing(false);
  }, [compareTitle, editTitle, onError, onInvalidTitle, onSave, title, validateTitle]);

  return {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef
  };
};
