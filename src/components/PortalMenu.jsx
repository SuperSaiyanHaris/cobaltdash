// A dropdown panel that can never be clipped or covered by the page around it.
// It renders in <body> (so no ancestor's overflow-hidden, transform or
// stacking context can cut it off) and sits fixed under its trigger. It flips
// above the trigger when there is more room there, scrolls inside itself when
// the list is long, and closes on scroll, resize, Escape or an outside tap.
// Use this for every menu that opens from a button inside a dark band or any
// other clipped container (the Rankings platform filter bug, 2026-10-04).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const MARGIN = 12;

export default function PortalMenu({ anchorRef, open, onClose, children, className = '', role = 'menu', minWidth = 0, align = 'left' }) {
  const [box, setBox] = useState(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setBox(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, minWidth);
    const left = Math.max(MARGIN, Math.min(align === 'right' ? r.right - width : r.left, window.innerWidth - width - MARGIN));
    setBox(up
      ? { left, width, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.max(160, above) }
      : { left, width, top: r.bottom + GAP, maxHeight: Math.max(160, below) });
  }, [open, anchorRef, minWidth, align]);

  useEffect(() => {
    if (!open) return undefined;
    // Scrolling the list itself must not close it; scrolling the page does.
    const close = (e) => { if (e?.target && menuRef.current?.contains(e.target)) return; onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', key);
    };
  }, [open, onClose]);

  if (!open || !box || typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden="true" />
      <div ref={menuRef} role={role} style={box} className={`fixed z-[71] overflow-y-auto overscroll-contain ${className}`}>
        {children}
      </div>
    </>,
    document.body,
  );
}
