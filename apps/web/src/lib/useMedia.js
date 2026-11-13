import { useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query. Used to render ONE layout (cards vs table) instead of hiding a duplicate with CSS. */
export function useMedia(query) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMedia('(min-width: 1024px)'); // table-based comparison, sidebar
export const useIsTabletUp = () => useMedia('(min-width: 768px)'); // tables for lists
export const useIsPhone = () => useMedia('(max-width: 639px)');
