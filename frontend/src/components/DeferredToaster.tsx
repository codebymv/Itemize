import { lazy, Suspense, useEffect, useState } from "react";

const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })),
);

/**
 * GleamAI/FlashCore chrome deferral - toaster stays off the landing critical path.
 */
export function DeferredToaster() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fixed delay: requestIdleCallback fires immediately under Lighthouse.
    const t = window.setTimeout(() => setReady(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
