import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop - Scrolls window to top on route change, or to the #hash
 * target when the URL carries one (e.g. a blog byline linking to
 * /about#editorial-team). The target's route is usually still loading its
 * lazy chunk at the moment this effect first runs, so a plain
 * document.getElementById would find nothing — poll via rAF for it to
 * mount instead of giving up immediately. scroll-mt-* on the target
 * element (see About.jsx) keeps it clear of the sticky header.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return undefined;
    }

    const id = hash.slice(1);
    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        requestAnimationFrame(tryScroll);
      } else {
        window.scrollTo(0, 0); // target never appeared — don't strand the scroll position from the previous page
      }
    };

    tryScroll();
    return () => {
      cancelled = true;
    };
  }, [pathname, hash]);

  return null;
}
