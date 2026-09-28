// The Arena display face (Barlow Condensed), loaded only on ShinyPass pages
// so the rest of the site doesn't pay for it.
import { useEffect } from 'react';

export default function useArenaFont() {
  useEffect(() => {
    if (document.getElementById('sp-arena-font')) return;
    const l = document.createElement('link');
    l.id = 'sp-arena-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,800;0,900;1,800;1,900&display=swap';
    document.head.appendChild(l);
  }, []);
}
