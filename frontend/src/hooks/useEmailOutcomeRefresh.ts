import { useEffect } from 'react';
import { hasPendingEmailOutcome } from '@/lib/emailDelivery';

type EmailRecord = Parameters<typeof hasPendingEmailOutcome>[0];

/** Refresh visible pages without replacing their current content with a loading state. */
export function useEmailOutcomeRefresh(records: EmailRecord[], refresh: (quiet?: boolean) => Promise<void>) {
    useEffect(() => {
        const update = () => { if (document.visibilityState === 'visible') void refresh(true); };
        window.addEventListener('focus', update);
        const interval = records.some(hasPendingEmailOutcome) ? window.setInterval(() => {
            if (records.some(hasPendingEmailOutcome)) update();
            else window.clearInterval(interval);
        }, 15_000) : undefined;
        return () => { window.removeEventListener('focus', update); window.clearInterval(interval); };
    }, [records, refresh]);
}
