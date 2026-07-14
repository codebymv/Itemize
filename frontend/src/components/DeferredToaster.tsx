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
    const enable = () => setReady(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(enable, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(enable, 3500);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
