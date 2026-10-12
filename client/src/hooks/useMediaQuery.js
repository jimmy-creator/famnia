import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query from JS.
 *
 * Needed where a breakpoint changes *what is rendered*, not just how it looks —
 * Tailwind's `lg:` prefixes can only restyle a tree, and on the home page the
 * mobile and desktop hero hold genuinely different sets of slides.
 *
 * useSyncExternalStore keeps it correct through concurrent renders and gives a
 * stable server snapshot (false), so a hydrated page starts desktop-shaped and
 * corrects on the first client tick rather than flickering both ways.
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      // Safari < 14 has no addEventListener on MediaQueryList.
      if (mql.addEventListener) {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false),
    () => false,
  );
}

export default useMediaQuery;
