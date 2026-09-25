import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { cardImageUrl } from '../lib/cardUrl';
import { CARD_PLATFORMS, renderMarkOverlay } from '../lib/badgeCard';

// Home hero centerpiece: a hand of real holographic creator cards
// (/card/..., rendered by middleware.js). The front card tilts toward the
// pointer with a moving glare, and every few seconds (or on "Pull a card")
// flips to the ShinyPull card back and turns over on the next creator.
//
// Brand rules: the 3D-moving cards are all the markless render (mark=0).
// The platform logo is a separate flat layer (renderMarkOverlay) sitting
// over the front card, outside the tilt and flip transforms, so no logo is
// ever rotated or skewed. It fades out during a flip and back in once the
// card is face up and still.
//
// Reduced motion: no auto-pull, no tilt, no burst; the button just swaps
// the card.

const PULL_EVERY_MS = 5500;
const FLIP_MS = 450;
const MAX_TILT = 9;

const markUri = (platform) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderMarkOverlay(platform))}`;

function preload(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    setTimeout(done, 1500);
    img.src = src;
  });
}

export default function HeroCardStage({ creators }) {
  const reduceMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const tiltRef = useRef(null);
  const busyRef = useRef(false);
  const timerRef = useRef(null);

  const n = creators.length;
  const current = n ? creators[idx % n] : null;
  const marks = useMemo(() => {
    const m = {};
    for (const c of creators) if (!m[c.platform]) m[c.platform] = markUri(c.platform);
    return m;
  }, [creators]);

  // First reveal: the card starts face down and turns over once the first
  // creator's card has loaded.
  useEffect(() => {
    if (!current || faceUp) return;
    let cancelled = false;
    preload(cardImageUrl(current.platform, current.username, { mark: false })).then(() => {
      if (cancelled) return;
      setFaceUp(true);
      if (!reduceMotion) setBurstKey((k) => k + 1);
    });
    return () => { cancelled = true; };
    // Only for the very first card; later pulls run through pull().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.platform, current?.username]);

  const pull = useCallback(async () => {
    if (!n || busyRef.current) return;
    const next = (idx + 1) % n;
    const nextSrc = cardImageUrl(creators[next].platform, creators[next].username, { mark: false });
    if (reduceMotion) {
      await preload(nextSrc);
      setIdx(next);
      return;
    }
    busyRef.current = true;
    setFaceUp(false);
    await Promise.all([preload(nextSrc), new Promise((r) => setTimeout(r, FLIP_MS))]);
    setIdx(next);
    setFaceUp(true);
    setBurstKey((k) => k + 1);
    setTimeout(() => { busyRef.current = false; }, FLIP_MS);
  }, [creators, idx, n, reduceMotion]);

  // Auto-pull, restarted after a manual pull; skipped while the tab is hidden.
  useEffect(() => {
    if (reduceMotion || n < 2 || !faceUp) return;
    timerRef.current = setTimeout(() => { if (!document.hidden) pull(); }, PULL_EVERY_MS);
    return () => clearTimeout(timerRef.current);
  }, [reduceMotion, n, faceUp, idx, pull]);

  const onPointerMove = (e) => {
    if (reduceMotion || e.pointerType !== 'mouse' || !tiltRef.current) return;
    const r = tiltRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    tiltRef.current.style.transform = `rotateY(${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg) rotateX(${((0.5 - y) * 2 * MAX_TILT * 0.8).toFixed(2)}deg)`;
    tiltRef.current.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    tiltRef.current.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  };
  const onPointerLeave = () => {
    if (tiltRef.current) tiltRef.current.style.transform = '';
  };

  const accent = current ? (CARD_PLATFORMS[current.platform]?.color || '#a855f7') : '#a855f7';
  const left = n >= 3 ? creators[(idx - 1 + n) % n] : null;
  const right = n >= 3 ? creators[(idx + 1) % n] : null;
  const platformName = current ? (CARD_PLATFORMS[current.platform]?.name || current.platform) : '';

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="hero-stage relative w-full h-[330px] sm:h-[440px] flex items-center justify-center"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {/* Platform-tinted aura; background-color transitions smoothly. */}
        <div
          aria-hidden="true"
          className="absolute w-[280px] h-[280px] sm:w-[380px] sm:h-[380px] rounded-full opacity-30 blur-[70px] transition-colors duration-1000 pointer-events-none"
          style={{ backgroundColor: accent }}
        />

        {left && (
          <img
            src={cardImageUrl(left.platform, left.username, { mark: false })}
            alt=""
            aria-hidden="true"
            width="250"
            height="350"
            loading="lazy"
            draggable="false"
            className="hero-fan hero-fan-left absolute w-[176px] sm:w-[220px] h-auto select-none pointer-events-none"
          />
        )}
        {right && (
          <img
            src={cardImageUrl(right.platform, right.username, { mark: false })}
            alt=""
            aria-hidden="true"
            width="250"
            height="350"
            loading="lazy"
            draggable="false"
            className="hero-fan hero-fan-right absolute w-[176px] sm:w-[220px] h-auto select-none pointer-events-none"
          />
        )}

        {!reduceMotion && burstKey > 0 && <span key={burstKey} aria-hidden="true" className="hero-burst" />}

        <Link
          to={current ? `/${current.platform}/${current.username}` : '/badge'}
          aria-label={current ? `${current.display_name}'s ${platformName} stats` : 'Creator cards'}
          className="relative z-10 block w-[200px] h-[280px] sm:w-[250px] sm:h-[350px] rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <span ref={tiltRef} className="hero-tilt block w-full h-full">
            <span className={`hero-flip block w-full h-full ${faceUp ? 'is-up' : ''}`}>
              <span className="hero-face hero-face-back">
                <img src="/card-back.svg" alt="" width="250" height="350" draggable="false" className="w-full h-full select-none" />
              </span>
              <span className="hero-face hero-face-front">
                {current && (
                  <img
                    src={cardImageUrl(current.platform, current.username, { mark: false })}
                    alt={`${current.display_name} ${platformName} creator card`}
                    width="250"
                    height="350"
                    draggable="false"
                    className="w-full h-full select-none"
                  />
                )}
              </span>
            </span>
            <span aria-hidden="true" className="hero-glare" />
          </span>
          {/* Flat logo layer: never inside the tilt/flip transforms. */}
          {current && (
            <img
              src={marks[current.platform]}
              alt=""
              aria-hidden="true"
              width="250"
              height="350"
              draggable="false"
              className={`absolute inset-0 w-full h-full select-none pointer-events-none transition-opacity ${faceUp ? 'opacity-100 duration-300 delay-500' : 'opacity-0 duration-100'}`}
            />
          )}
        </Link>
      </div>

      <div className="relative z-10 mt-2 sm:mt-0 flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={() => { clearTimeout(timerRef.current); pull(); }}
          className="hero-pull-btn inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-neutral-900"
        >
          <span aria-hidden="true">✦</span> Pull a card
        </button>
        <Link to="/badge" className="group inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors">
          Every creator has one. Get yours
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
