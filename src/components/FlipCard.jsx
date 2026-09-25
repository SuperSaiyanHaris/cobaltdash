import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cardImageUrl } from '../lib/cardUrl';
import { renderMarkOverlay, CARD_PLATFORMS } from '../lib/badgeCard';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';
import CreatorAvatar from './CreatorAvatar';

// One upright holographic card that starts face down and flips over to
// `creator`, and flips again whenever `creator` changes. `creator` needs
// { platform, username, name?, avatar? }; null keeps the card face down.
//
// Brand rule (same as the home hero): the turning card is the markless
// render, and the platform logo is a flat layer on top that only shows once
// the flip has fully stopped (transitionend), never while it turns.
//
// If the card image can't be rendered (a creator we don't track yet), the
// front falls back to a plain dark card with their avatar and name.

const FLIP_MS = 450;
const markUris = {};
const markUri = (platform) => {
  if (!markUris[platform]) {
    markUris[platform] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderMarkOverlay(platform))}`;
  }
  return markUris[platform];
};

function preload(src) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    setTimeout(() => finish(true), 2500);
    img.src = src;
  });
}

export default function FlipCard({ creator, className = 'w-[200px] h-[280px] sm:w-[240px] sm:h-[336px]', delay = 0 }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(null);
  const [failed, setFailed] = useState(false);
  const [faceUp, setFaceUp] = useState(false);
  const [settled, setSettled] = useState(false);
  const shownKey = useRef(null);

  const key = creator ? `${creator.platform}/${creator.username}` : null;

  useEffect(() => {
    if (key === shownKey.current) return;
    const first = shownKey.current === null;
    shownKey.current = key;
    let cancelled = false;
    (async () => {
      if (!first && !reduceMotion) {
        setSettled(false);
        setFaceUp(false);
        await new Promise((r) => setTimeout(r, FLIP_MS));
      }
      if (!creator) {
        if (!cancelled) { setShown(null); setFaceUp(false); }
        return;
      }
      const [ok] = await Promise.all([
        preload(cardImageUrl(creator.platform, creator.username, { mark: false })),
        new Promise((r) => setTimeout(r, first ? delay : 0)),
      ]);
      if (cancelled) return;
      setFailed(!ok);
      setShown(creator);
      setSettled(false);
      setFaceUp(true);
    })();
    return () => { cancelled = true; };
    // `creator` is read through `key`; a new object for the same creator
    // must not re-flip the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduceMotion, delay]);

  const label = shown ? (PLATFORM_DISPLAY_NAMES[shown.platform] || CARD_PLATFORMS[shown.platform]?.name || shown.platform) : '';

  return (
    <div className={`hero-stage relative ${className}`}>
      <span
        className={`hero-flip block w-full h-full ${faceUp ? 'is-up' : ''}`}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && faceUp) setSettled(true); }}
      >
        <span className="hero-face hero-face-back">
          <img src="/card-back.svg" alt="" width="250" height="350" draggable="false" className="w-full h-full select-none" />
        </span>
        <span className="hero-face hero-face-front">
          {shown && !failed && (
            <img
              src={cardImageUrl(shown.platform, shown.username, { mark: false })}
              alt={`${shown.name || shown.username} ${label} creator card`}
              width="250"
              height="350"
              draggable="false"
              className="w-full h-full select-none"
            />
          )}
          {shown && failed && (
            <span className="flex flex-col items-center justify-center gap-3 w-full h-full bg-[#15151c] border border-white/10 px-4 text-center">
              <CreatorAvatar src={shown.avatar} name={shown.name || shown.username} size="xl" rounded="rounded-full" />
              <span className="text-sm font-bold text-white truncate max-w-full">{shown.name || shown.username}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</span>
            </span>
          )}
        </span>
      </span>
      {shown && !failed && (
        <img
          src={markUri(shown.platform)}
          alt=""
          aria-hidden="true"
          width="250"
          height="350"
          draggable="false"
          className={`absolute inset-0 w-full h-full select-none pointer-events-none transition-opacity ${faceUp && (settled || reduceMotion) ? 'opacity-100 duration-150' : 'opacity-0 duration-100'}`}
        />
      )}
    </div>
  );
}
