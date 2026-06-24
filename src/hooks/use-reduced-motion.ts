import { useEffect, useState } from "react";

/**
 * Reactively tracks the user's prefers-reduced-motion preference. Components
 * that ship custom animations should gate them on this hook so motion stays
 * calm for users who request it. SSR-safe (returns `false` on first paint and
 * subscribes on mount).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mql.matches);
    update();
    mql.addEventListener?.("change", update);
    return () => mql.removeEventListener?.("change", update);
  }, []);
  return reduced;
}
