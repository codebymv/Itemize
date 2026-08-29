import { useCallback } from 'react';
import { useNavigate, type To } from 'react-router-dom';

/** Browser-history Back with an in-app destination for direct entries and new tabs. */
export function useSafeShellBack(fallbackTo: To) {
  const navigate = useNavigate();

  return useCallback(() => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate(fallbackTo);
  }, [fallbackTo, navigate]);
}
