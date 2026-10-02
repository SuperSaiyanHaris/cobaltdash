import { useEffect, useRef, useState } from 'react';

// The sweep of light across a holographic card, drawn in CSS on top of a
// still card image. It only animates `transform` and `opacity`, so the browser
// moves it on the GPU without repainting the card (the SVG's own motion
// repainted the whole image every frame and stuttered on phones). It runs only
// while the card is on screen: one shared observer flips `is-live`.
//
// Put it inside a `relative` box with the card's rounded corners and
// overflow hidden. `tier` sets how often and how bright the sweep is; it is
// the same escalation the card art used (Common slow, Legendary frequent).

let observer;
const listeners = new WeakMap();
function observe(el, cb) {
  if (typeof IntersectionObserver === 'undefined') { cb(true); return () => {}; }
  observer ||= new IntersectionObserver((entries) => {
    for (const e of entries) listeners.get(e.target)?.(e.isIntersecting);
  }, { rootMargin: '80px' });
  listeners.set(el, cb);
  observer.observe(el);
  return () => { listeners.delete(el); observer.unobserve(el); };
}

export default function CardShine({ tier = 'common', live = true }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  // Stagger cards so a grid doesn't flash in unison.
  const [delay] = useState(() => `-${(Math.random() * 8).toFixed(2)}s`);

  useEffect(() => (ref.current ? observe(ref.current, setVisible) : undefined), []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-tier={tier}
      className={`card-shine${visible && live ? ' is-live' : ''}`}
      style={{ '--glint-delay': delay }}
    />
  );
}
