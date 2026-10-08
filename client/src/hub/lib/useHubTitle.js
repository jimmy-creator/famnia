import { useEffect } from 'react';

/** Sets the tab title for a hub screen (the hub is staff-only, so no SEO meta). */
export function useHubTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
