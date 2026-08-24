import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page anyway?';

interface UnsavedChangesGuardOptions {
  when: boolean;
  message?: string;
}

export function useUnsavedChangesGuard({
  when,
  message = DEFAULT_MESSAGE,
}: UnsavedChangesGuardOptions) {
  const whenRef = useRef(when);
  const messageRef = useRef(message);
  whenRef.current = when;
  messageRef.current = message;

  const confirmLeave = useCallback(() => (
    !whenRef.current || window.confirm(messageRef.current)
  ), []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!whenRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!whenRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin
        && destination.pathname === current.pathname
        && destination.search === current.search
        && destination.hash === current.hash
      ) return;

      if (window.confirm(messageRef.current)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, []);

  return { confirmLeave };
}
