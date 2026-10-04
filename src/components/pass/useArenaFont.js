// The ShinyPass faces (Barlow Condensed for numbers and names, Bricolage
// Grotesque for headings, Manrope for text), loaded only on ShinyPass pages
// so the rest of the site doesn't pay for them.
import { useEffect } from 'react';

export default function useArenaFont() {
  useEffect(() => {
    if (document.getElementById('sp-arena-font')) return;
    const l = document.createElement('link');
    l.id = 'sp-arena-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,800;0,900;1,800;1,900&family=Bricolage+Grotesque:wght@700;800&family=Manrope:wght@500;600;700;800&display=swap';
    document.head.appendChild(l);
  }, []);
}
