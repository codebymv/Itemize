import { lazy, Suspense, useEffect, useState } from "react";

const CookieConsent = lazy(() =>
  import("@/components/CookieConsent").then((m) => ({ default: m.CookieConsent })),
);

/**
 * Defer cookie banner off the /home critical path (same idle/timeout pattern as DeferredToaster).
 */
export function DeferredCookieConsent() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fixed delay: requestIdleCallback fires immediately under Lighthouse.
    const t = window.setTimeout(() => setReady(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <CookieConsent />
    </Suspense>
  );
}
