import { useState, useEffect } from 'react';

export function useCanvasContextMenu() {
  const [showButtonContextMenu, setShowButtonContextMenu] = useState(false);
  const [buttonMenuPosition, setButtonMenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showButtonContextMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('#new-canvas-button') && !target.closest('#mobile-new-canvas-button') && !target.closest('.context-menu')) {
          setShowButtonContextMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showButtonContextMenu]);

  const handleOpenMenu = (buttonId: string) => {
    const buttonElement = document.getElementById(buttonId);
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      setButtonMenuPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 5
      });
      setShowButtonContextMenu(true);
    }
  };

  const handleCloseMenu = () => {
    setShowButtonContextMenu(false);
  };

  return {
    showButtonContextMenu,
    buttonMenuPosition,
    handleOpenMenu,
    handleCloseMenu,
    setShowButtonContextMenu,
  };
}