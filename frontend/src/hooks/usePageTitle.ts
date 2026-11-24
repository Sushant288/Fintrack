import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTitle(title: string): void {
  const location = useLocation();

  useEffect(() => {
    document.title = title ? `${title} | FinTrack` : 'FinTrack';

    // Move keyboard focus to the page h1 on navigation for screen readers and accessibility
    const h1 = document.querySelector('h1');
    if (h1) {
      if (!h1.getAttribute('tabindex')) {
        h1.setAttribute('tabindex', '-1');
      }
      h1.focus({ preventScroll: true });
    }
  }, [title, location.pathname]);
}
