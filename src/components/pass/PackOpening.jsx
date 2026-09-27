// Full-screen pack opening. Drag across the tear line (or tap "Tear it
// open"), the strip rips off, cards rise out face down, and each tap flips
// the next one. The rarest item is always last, and rarer backs shake before
// they turn. Motion only: no glows, no light bursts (design rules).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import { X, Loader2, Share2, Check } from 'lucide-react';
import { PackSvg, ItemFace, RARITY, CARD_RADIUS } from './PassArt';
import { tearClip } from '../../lib/packArt';
import { RARITY_ORDER } from '../../lib/shinyPass';

const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

// Deterministic scatter (render must stay pure), different for each shred.
const jitter = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

function Shreds({ pack }) {
  const bits = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: (i / 13) * 100,
    dx: (jitter(i, 1) - 0.3) * 260,
    dy: -60 - jitter(i, 2) * 160,
    r: (jitter(i, 3) - 0.5) * 540,
    w: 4 + jitter(i, 4) * 7,
    h: 3 + jitter(i, 5) * 5,
    c: [pack.a, pack.b, pack.c, pack.d][i % 4],
  })), [pack]);
  return bits.map((b, i) => (
    <motion.span
      key={i}
      aria-hidden="true"
      className="absolute top-[11%] block"
      style={{ left: `${b.x}%`, width: b.w, height: b.h, background: b.c }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      animate={{ x: b.dx, y: [0, b.dy, b.dy + 320], rotate: b.r, opacity: [1, 1, 0] }}
      transition={{ duration: 1.3, ease: 'easeOut', times: [0, 0.35, 1] }}
    />
  ));
}

export default function PackOpening({ pack, me, onOpen, onClose }) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState('intro'); // intro | torn | stack | done
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [shared, setShared] = useState(false);
  const request = useRef(null);
  const dragX = useMotionValue(0);
  const stripRotate = useTransform(dragX, [0, 200], [0, 9]);
  const hintOpacity = useTransform(dragX, [0, 60], [1, 0]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && stage !== 'torn') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose, stage]);

  // Ask the server as soon as the tear starts, so the cards are ready by the
  // time the strip is off.
  function begin() {
    if (!request.current) {
      // A hung request must not strand someone behind a locked screen.
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('That took too long. Your pack is safe, try again in a moment.')), 15000));
      request.current = Promise.race([onOpen(), timeout])
        .then((list) => { setItems([...list].sort((x, y) => RARITY_ORDER.indexOf(x.rarity) - RARITY_ORDER.indexOf(y.rarity))); })
        .catch((e) => setError(e.message || "Couldn't open that pack."));
    }
  }

  async function tear() {
    if (stage !== 'intro') return;
    begin();
    buzz(25);
    setStage('torn');
    await animate(dragX, 420, { duration: reduce ? 0 : 0.45, ease: 'easeIn' });
    await request.current;
    setTimeout(() => setStage('stack'), reduce ? 0 : 650);
  }

  function onDragEnd(_, info) {
    if (dragX.get() > 90 || info.velocity.x > 500) tear();
    else animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
  }

  const total = items?.length || 0;
  const next = items?.[revealed];

  async function flipNext() {
    if (stage !== 'stack' || !next || shaking) return;
    const rank = RARITY_ORDER.indexOf(next.rarity);
    if (rank >= 2 && !reduce) {
      setShaking(true);
      buzz(rank >= 4 ? [30, 40, 30, 40, 60] : 20);
      await new Promise((r) => setTimeout(r, rank >= 3 ? 900 : 550));
      setShaking(false);
    }
    const n = revealed + 1;
    setRevealed(n);
    if (rank >= 4) buzz(80);
    if (n >= total) setTimeout(() => setStage('done'), reduce ? 0 : 1100);
  }

  async function share() {
    const url = me?.publicHandle ? `https://shinypull.com/u/${me.publicHandle}` : 'https://shinypull.com/pass';
    const text = `I just opened the ${pack.name} pack on ShinyPull.`;
    try {
      if (navigator.share) await navigator.share({ title: 'ShinyPull', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); }
    } catch { /* dismissed */ }
  }

  // Geometry: revealed cards collect in a fan above, the face-down stack
  // waits below. When everything is out, they fan across the middle.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const isMobile = vw < 640;
  const cardW = isMobile ? 132 : 178;
  // Short screens (landscape phones) shrink the whole stage to fit.
  const squeeze = Math.min(1, Math.max(0.55, (vh - 200) / 540));
  const fanPos = (i, n, final) => {
    const mid = (n - 1) / 2, off = i - mid;
    if (final && isMobile) {
      // Phones: a tidy two-column grid so every item is readable.
      const sc = n > 3 ? 0.78 : 0.86;
      const rows = Math.ceil(n / 2), row = Math.floor(i / 2), col = i % 2;
      const lone = n % 2 === 1 && i === n - 1;
      return { x: lone ? 0 : (col - 0.5) * (cardW * sc + 12), y: (row - (rows - 1) / 2) * (cardW * 1.4 * sc + 12), rotate: 0, scale: sc };
    }
    if (final) {
      // Tablets and small laptops: shrink the fan until all n cards fit.
      const fit = Math.min(1, (vw - 48) / (n * (cardW + 18)));
      return { x: off * (cardW + 18) * fit, y: (Math.abs(off) * 16 - 10) * fit, rotate: off * 3, scale: fit };
    }
    return { x: off * (isMobile ? 46 : 90), y: isMobile ? -150 : -170, rotate: off * 5, scale: 0.58 };
  };

  const body = (
    <motion.div
      className="fixed inset-0 z-[200] bg-[#0a0a0f] text-white flex flex-col overflow-hidden select-none"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={`Open the ${pack.name} pack`}
    >
      <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
      <div className="relative flex items-center justify-between px-4 sm:px-6 pt-[max(16px,env(safe-area-inset-top))]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Level {pack.level} pack</p>
          <p className="text-lg sm:text-xl font-extrabold">{pack.name}</p>
        </div>
        {(stage !== 'torn' || error) && (
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="relative flex-1 flex items-center justify-center" style={{ perspective: 1200, transform: squeeze < 1 ? `scale(${squeeze})` : undefined }}>
        {/* The pack */}
        <AnimatePresence>
          {(stage === 'intro' || stage === 'torn') && (
            <motion.div
              key="pack"
              className="relative"
              style={{ width: isMobile ? 220 : 300 }}
              initial={{ y: 40, opacity: 0, rotateY: -18 }}
              animate={stage === 'intro' && reduce
                ? { y: 0, opacity: 1, rotateY: 0 }
                : stage === 'intro'
                ? { y: [0, -8, 0], opacity: 1, rotateY: [-10, 10, -10], transition: { y: { repeat: Infinity, duration: 3.2, ease: 'easeInOut' }, rotateY: { repeat: Infinity, duration: 6, ease: 'easeInOut' }, opacity: { duration: 0.4 } } }
                : { y: 140, opacity: 0, rotateY: 0, transition: { delay: 0.55, duration: 0.6, ease: 'easeIn' } }}
              exit={{ opacity: 0 }}
            >
              {/* Body, below the tear */}
              <div style={{ clipPath: tearClip('body') }} className="drop-shadow-[0_30px_40px_rgba(0,0,0,0.7)]">
                <PackSvg pack={pack} />
              </div>
              {/* Strip, above the tear: drag it off */}
              <motion.div
                className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
                style={{ clipPath: tearClip('top'), x: dragX, rotate: stripRotate, transformOrigin: '0% 11%' }}
                drag={stage === 'intro' && !reduce ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0, right: 0.9 }}
                dragMomentum={false}
                onDragStart={begin}
                onDragEnd={onDragEnd}
                aria-hidden="true"
              >
                <PackSvg pack={pack} />
              </motion.div>
              {stage === 'intro' && !reduce && (
                <motion.div style={{ opacity: hintOpacity }} className="pointer-events-none absolute left-0 right-0 top-[4%] flex justify-center">
                  <motion.span
                    className="rounded-full bg-white text-neutral-950 text-[11px] font-black px-2.5 py-1 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.8)]"
                    animate={{ x: [-40, 40, -40] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  >
                    Swipe →
                  </motion.span>
                </motion.div>
              )}
              {stage === 'torn' && !reduce && <Shreds pack={pack} />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* The cards */}
        {(stage === 'stack' || stage === 'done') && items && items.map((item, i) => {
          const isOut = i < revealed;
          const final = stage === 'done';
          const r = RARITY[item.rarity] || RARITY.common;
          const pos = isOut || final ? fanPos(i, total, final) : { x: 0, y: isMobile ? 70 : 60, rotate: (total - i) % 2 ? -2 : 2, scale: 1 };
          const isNext = i === revealed && !final;
          const depth = isOut ? i : total + (total - i);
          return (
            <motion.div
              key={i}
              className="absolute"
              style={{ width: cardW, zIndex: depth, perspective: 1000 }}
              initial={{ y: 260, opacity: 0, scale: 0.9 }}
              animate={{
                ...pos,
                opacity: 1,
                y: pos.y + (!isOut && !final ? (total - i) * -3 : 0),
                x: isNext && shaking ? [pos.x, pos.x - 6, pos.x + 6, pos.x - 5, pos.x + 5, pos.x - 3, pos.x + 3, pos.x] : pos.x,
              }}
              transition={isNext && shaking
                ? { x: { duration: 0.5, repeat: 1 }, default: { type: 'spring', stiffness: 170, damping: 22 } }
                : { type: 'spring', stiffness: 170, damping: 22, delay: stage === 'stack' && !isOut && revealed === 0 ? i * 0.12 : 0 }}
            >
              <motion.button
                type="button"
                onClick={isNext ? flipNext : undefined}
                disabled={!isNext}
                aria-label={isOut || final ? undefined : 'Flip the next card'}
                className="relative block w-full aspect-[5/7] [transform-style:preserve-3d]"
                animate={{ rotateY: isOut || final ? 180 : 0 }}
                transition={{ duration: reduce ? 0 : 0.7, ease: [0.3, 1.4, 0.5, 1] }}
              >
                {/* Back: the card back, edge tinted by rarity for rare and up */}
                <span className={`absolute inset-0 ${CARD_RADIUS} overflow-hidden [backface-visibility:hidden] shadow-[0_24px_40px_-16px_rgba(0,0,0,0.9)]`}
                  style={RARITY_ORDER.indexOf(item.rarity) >= 2 ? { boxShadow: `inset 0 0 0 3px ${r.a}, 0 24px 40px -16px rgba(0,0,0,0.9)` } : undefined}>
                  <img src="/card-back.svg" alt="" draggable="false" className="w-full h-full object-cover" />
                </span>
                {/* Face */}
                <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] shadow-[0_24px_40px_-16px_rgba(0,0,0,0.9)]">
                  <ItemFace item={item} me={me} />
                  {RARITY_ORDER.indexOf(item.rarity) >= 3 && (isOut || final) && !reduce && (
                    <motion.span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 ${CARD_RADIUS} overflow-hidden`}
                      initial={{ opacity: 1 }}
                    >
                      <motion.span
                        className="absolute -inset-y-4 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent rotate-12"
                        initial={{ x: '-150%' }} animate={{ x: '400%' }}
                        transition={{ duration: 1.1, delay: 0.5, repeat: item.rarity === 'legendary' ? Infinity : 0, repeatDelay: 1.6 }}
                      />
                    </motion.span>
                  )}
                </span>
              </motion.button>
            </motion.div>
          );
        })}

        {stage === 'torn' && !items && !error && (
          <Loader2 className="absolute w-6 h-6 text-white/70 animate-spin" />
        )}
      </div>

      <div className="relative px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-2 min-h-[112px] flex flex-col items-center justify-end gap-3">
        {error ? (
          <>
            <p className="text-sm font-semibold text-red-300 text-center">{error}</p>
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white text-neutral-950 text-sm font-bold">Close</button>
          </>
        ) : stage === 'intro' ? (
          <>
            <p className="text-sm font-semibold text-white/80 text-center">Swipe across the top to tear it open.</p>
            <button onClick={tear} className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold transition-colors">
              Tear it open
            </button>
          </>
        ) : stage === 'stack' ? (
          <p className="text-sm font-semibold text-white/80 text-center tabular-nums">
            Tap the card to flip it · {Math.min(revealed + 1, total)} of {total}
          </p>
        ) : stage === 'done' ? (
          <div className="flex items-center gap-3">
            <button onClick={share} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/25 hover:border-white/60 text-white text-sm font-bold transition-colors">
              {shared ? <><Check className="w-4 h-4" /> Link copied</> : <><Share2 className="w-4 h-4" /> Share my pull</>}
            </button>
            <button onClick={onClose} className="px-6 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors">
              Done
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );

  return createPortal(body, document.body);
}

