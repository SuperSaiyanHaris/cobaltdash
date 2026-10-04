// Full-screen pack opening. The pack hangs in 3D and leans toward your finger;
// drag across the tear line (or tap "Tear it open") and the strip rips off
// with a flash along the seam, the cards burst out face down, and each tap
// flips the next one. The rarest item is always last. Every reveal has its
// own show that grows with rarity: a color wipe, shockwave rings, turning
// rays, falling confetti, a banner, and a push of the whole stage for the top
// tier. Flat shapes and motion only: no glows, no blurs (design rules).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import { X, Loader2, Share2, Check } from 'lucide-react';
import { ItemFace, RARITY, CARD_RADIUS } from './PassArt';
import PackArt from './PackArt';
import { CardBackArt } from './RewardArt';
import { tearClip, PACK_W, PACK_H } from '../../lib/packArt';
import { RARITY_ORDER } from '../../lib/shinyPass';

const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

// Deterministic scatter (render must stay pure), different for each piece.
const jitter = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const rankOf = (r) => RARITY_ORDER.indexOf(r);

function Shreds({ pack }) {
  const bits = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    x: (i / 17) * 100,
    dx: (jitter(i, 1) - 0.3) * 300,
    dy: -80 - jitter(i, 2) * 200,
    r: (jitter(i, 3) - 0.5) * 640,
    w: 4 + jitter(i, 4) * 8,
    h: 3 + jitter(i, 5) * 6,
    c: [pack.a, pack.b, pack.c, pack.d][i % 4],
  })), [pack]);
  return bits.map((b, i) => (
    <motion.span
      key={i}
      aria-hidden="true"
      className="absolute top-[11%] block"
      style={{ left: `${b.x}%`, width: b.w, height: b.h, background: b.c }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      animate={{ x: b.dx, y: [0, b.dy, b.dy + 360], rotate: b.r, opacity: [1, 1, 0] }}
      transition={{ duration: 1.4, ease: 'easeOut', times: [0, 0.35, 1] }}
    />
  ));
}

/** Flat wedges turning slowly behind the stage. */
function Rays({ color, opacity = 0.16, seconds = 70, wedges = 18 }) {
  const d = useMemo(() => Array.from({ length: wedges }, (_, i) => {
    const a0 = (i / wedges) * Math.PI * 2, a1 = a0 + Math.PI / wedges, R = 760;
    return `M0 0L${(Math.cos(a0) * R).toFixed(0)} ${(Math.sin(a0) * R).toFixed(0)}L${(Math.cos(a1) * R).toFixed(0)} ${(Math.sin(a1) * R).toFixed(0)}Z`;
  }).join(''), [wedges]);
  return (
    <motion.svg
      aria-hidden="true"
      viewBox="-760 -760 1520 1520"
      className="pointer-events-none absolute left-1/2 top-1/2 w-[1500px] h-[1500px] -ml-[750px] -mt-[750px]"
      style={{ fill: color, opacity }}
      animate={{ rotate: 360 }}
      transition={{ duration: seconds, ease: 'linear', repeat: Infinity }}
    >
      <path d={d} />
    </motion.svg>
  );
}

/** Expanding outlines, like a shockwave leaving the card. */
function Rings({ color, n = 3, size = 240 }) {
  return Array.from({ length: n }, (_, i) => (
    <motion.span
      key={i}
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, border: `${4 - i}px solid ${color}` }}
      initial={{ scale: 0.25, opacity: 0.95 }}
      animate={{ scale: 3.4, opacity: 0 }}
      transition={{ duration: 1.15, delay: i * 0.15, ease: 'easeOut' }}
    />
  ));
}

/** Flat pieces falling through the stage. */
function Confetti({ colors, count = 30, loop = false }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: jitter(i, 7) * 100,
    drift: (jitter(i, 8) - 0.5) * 160,
    w: 5 + jitter(i, 9) * 6,
    h: 8 + jitter(i, 10) * 9,
    spin: (jitter(i, 11) - 0.5) * 900,
    d: 2.6 + jitter(i, 12) * 2.4,
    delay: jitter(i, 13) * 0.9,
    c: colors[i % colors.length],
    round: i % 5 === 0,
  })), [count, colors]);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute -top-6 block"
          style={{ left: `${p.x}%`, width: p.w, height: p.round ? p.w : p.h, background: p.c, borderRadius: p.round ? '50%' : 2 }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '115vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.9] }}
          transition={{ duration: p.d, delay: p.delay, ease: 'easeIn', repeat: loop ? Infinity : 0, repeatDelay: loop ? 0.4 : 0 }}
        />
      ))}
    </div>
  );
}

function RarityBanner({ rarity, offset }) {
  const r = RARITY[rarity] || RARITY.common;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-0 z-[60] flex justify-center"
      style={{ top: `calc(50% - ${offset}px)`, marginTop: -22 }}
      initial={{ x: -140, opacity: 0 }}
      animate={{ x: [-140, 0, 0, 160], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.9, times: [0, 0.14, 0.78, 1], ease: 'easeOut' }}
    >
      <span className="font-arena italic font-black uppercase text-[26px] sm:text-[36px] leading-none px-5 pt-1.5 pb-1 -skew-x-6" style={{ background: r.a, color: '#0a0a0f' }}>
        {r.label} pull
      </span>
    </motion.div>
  );
}

const hex2 = (c, a) => `${c}${a}`;

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
  // The pack leans toward the pointer while you hold it.
  const tiltY = useMotionValue(0);
  const tiltX = useMotionValue(0);

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
  const last = revealed > 0 ? items?.[revealed - 1] : null;
  const lastRank = last ? rankOf(last.rarity) : -1;
  const lastColor = last ? (RARITY[last.rarity] || RARITY.common).a : '#ffffff';

  async function flipNext() {
    if (stage !== 'stack' || !next || shaking) return;
    const rank = rankOf(next.rarity);
    if (rank >= 2 && !reduce) {
      setShaking(true);
      buzz(rank >= 4 ? [30, 40, 30, 40, 60] : 20);
      await new Promise((r) => setTimeout(r, rank >= 3 ? 900 : 550));
      setShaking(false);
    }
    const n = revealed + 1;
    setRevealed(n);
    if (rank >= 3) buzz(rank >= 4 ? [60, 40, 90] : 50);
    // The last card stays in the spotlight long enough to read before the
    // whole pull fans out.
    if (n >= total) setTimeout(() => setStage('done'), reduce ? 0 : 2100);
  }

  async function share() {
    const url = me?.publicHandle ? `https://shinypull.com/u/${me.publicHandle}` : 'https://shinypull.com/pass';
    const text = `I just opened the ${pack.name} pack on ShinyPull.`;
    try {
      if (navigator.share) await navigator.share({ title: 'ShinyPull', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); }
    } catch { /* dismissed */ }
  }

  // Geometry: the card you just flipped stays big in the spotlight (on top
  // of the face-down stack) until you tap for the next one; earlier cards
  // collect in a small fan above. When everything is out, they fan across
  // the middle. Sizes follow the screen so the text stays readable.
  const [{ vw, vh }, setView] = useState(() => ({ vw: typeof window !== 'undefined' ? window.innerWidth : 1280, vh: typeof window !== 'undefined' ? window.innerHeight : 800 }));
  useEffect(() => {
    const onResize = () => setView({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = vw < 640;
  const cardW = Math.round(Math.max(140, Math.min(isMobile ? vw * 0.6 : 300, (vh - 150) / 2.97)));
  const packW = Math.round(Math.max(200, Math.min(isMobile ? vw - 110 : 340, (vh - 240) / 1.62)));
  const depth = Math.round(packW * 0.075);
  const stackY = cardW * 0.35;
  // Short screens (landscape phones) shrink the pack stage to fit.
  const squeeze = Math.min(1, Math.max(0.55, (vh - 200) / 540));
  const fanPos = (i, n, final) => {
    const mid = (n - 1) / 2, off = i - mid;
    if (final) {
      // Tablets and small laptops: shrink the fan until all n cards fit.
      const fit = Math.min(1, (vw - 48) / (n * (cardW + 18)));
      return { x: off * (cardW + 18) * fit, y: (Math.abs(off) * 16 - 10) * fit, rotate: off * 3, scale: fit };
    }
    return { x: off * cardW * (isMobile ? 0.34 : 0.5), y: -cardW * 1.05, rotate: off * 5, scale: 0.6 };
  };

  // Who's in the spotlight right now, for the show behind it.
  const showRank = stage === 'stack' ? lastRank : -1;
  const confettiColors = useMemo(() => [lastColor, '#ffffff', '#FFD76A', '#C084FC'], [lastColor]);
  const tally = useMemo(() => {
    const t = {};
    for (const it of items || []) t[it.rarity] = (t[it.rarity] || 0) + 1;
    return RARITY_ORDER.filter((k) => t[k]).reverse().map((k) => ({ key: k, n: t[k], ...(RARITY[k] || RARITY.common) }));
  }, [items]);

  const body = (
    <motion.div
      className="fixed inset-0 z-[200] bg-[#0a0a0f] text-white flex flex-col overflow-hidden select-none"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={`Open the ${pack.name} pack`}
    >
      <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
      {/* The pack's own color, turning slowly behind everything */}
      {(stage === 'intro' || stage === 'torn') && <Rays color={pack.c} opacity={0.2} seconds={90} wedges={14} />}
      {/* A flat wash of the last card's rarity */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        animate={{ backgroundColor: showRank >= 2 ? hex2(lastColor, '26') : hex2(lastColor, '00') }}
        transition={{ duration: 0.5 }}
      />
      {showRank >= 3 && <Rays key={`ry${revealed}`} color={lastColor} opacity={showRank >= 4 ? 0.22 : 0.15} seconds={showRank >= 4 ? 30 : 50} />}

      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-[max(16px,env(safe-area-inset-top))]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Level {pack.level} pack</p>
          <p className="font-arena italic font-black uppercase text-[28px] sm:text-[34px] leading-none">{pack.name}</p>
        </div>
        {(stage !== 'torn' || error) && (
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>


      <motion.div
        className="relative flex-1 flex items-center justify-center"
        style={{ perspective: 1200, paddingTop: stage === 'stack' ? 44 : 0 }}
        onClick={stage === 'stack' && !shaking ? flipNext : undefined}
        animate={{ scale: showRank >= 4 && !reduce ? [1, 1.05, 1] : (stage === 'intro' || stage === 'torn') && squeeze < 1 ? squeeze : 1 }}
        transition={{ duration: 0.55, delay: 0.1 }}
      >
        {stage === 'stack' && last && lastRank >= 2 && <RarityBanner key={`bn${revealed}`} rarity={last.rarity} offset={Math.round(cardW * 0.49 - 0)} />}
        {/* Shockwave and confetti, centered on the spotlight card */}
        {stage === 'stack' && showRank >= 2 && !reduce && (
          <div key={`fx${revealed}`} className="absolute left-1/2 top-1/2" style={{ transform: `translateY(${stackY}px)` }}>
            <Rings color={lastColor} n={showRank >= 4 ? 4 : showRank >= 3 ? 3 : 2} size={cardW} />
          </div>
        )}
        {stage === 'stack' && showRank >= 3 && !reduce && <Confetti key={`cf${revealed}`} colors={confettiColors} count={showRank >= 4 ? 44 : 26} loop={showRank >= 4} />}

        {/* The pack: three-dimensional, leaning toward the finger */}
        <AnimatePresence>
          {(stage === 'intro' || stage === 'torn') && (
            <motion.div
              key="pack"
              className="relative"
              style={{ width: packW, height: packW * (PACK_H / PACK_W), transformStyle: 'preserve-3d', '--d': `${depth}px`, '--pk-c': pack.c, rotateX: tiltX }}
              initial={{ y: 60, opacity: 0, rotateY: -30, scale: 0.9 }}
              animate={stage === 'intro' && reduce
                ? { y: 0, opacity: 1, rotateY: -14, scale: 1 }
                : stage === 'intro'
                  ? { y: [0, -10, 0], opacity: 1, scale: 1, rotateY: [-26, -8, -26], transition: { y: { repeat: Infinity, duration: 3.4, ease: 'easeInOut' }, rotateY: { repeat: Infinity, duration: 6.4, ease: 'easeInOut' }, opacity: { duration: 0.4 }, scale: { type: 'spring', stiffness: 200, damping: 14 } } }
                  : { y: 160, opacity: 0, rotateY: -6, transition: { delay: 0.55, duration: 0.6, ease: 'easeIn' } }}
              exit={{ opacity: 0 }}
              onPointerMove={(e) => {
                if (stage !== 'intro' || reduce || e.pointerType === 'touch') return;
                const r = e.currentTarget.getBoundingClientRect();
                tiltX.set(((e.clientY - r.top) / r.height - 0.5) * -14);
              }}
              onPointerLeave={() => tiltX.set(0)}
            >
              <span className="pk3d-floor" aria-hidden="true" style={{ bottom: '-7%' }} />
              <motion.span aria-hidden="true" className="pk3d-back" animate={{ opacity: stage === 'torn' ? 0 : 1 }} />
              <motion.span aria-hidden="true" className="pk3d-side pk3d-side-r" animate={{ opacity: stage === 'torn' ? 0 : 1 }} transition={{ duration: 0.2 }} />
              <motion.span aria-hidden="true" className="pk3d-side pk3d-side-l" animate={{ opacity: stage === 'torn' ? 0 : 1 }} transition={{ duration: 0.2 }} />
              <div className="absolute inset-0" style={{ transform: `translateZ(${depth / 2}px)` }}>
                {/* Body, below the tear */}
                <div style={{ clipPath: tearClip('body') }}>
                  <PackArt packKey={pack.key} season={me?.seasonNumber} shadow={false} />
                </div>
                {/* Strip, above the tear: drag it off */}
                <motion.div
                  className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
                  style={{ clipPath: tearClip('top'), x: dragX, rotate: stripRotate, transformOrigin: '0% 10.8%' }}
                  drag={stage === 'intro' && !reduce ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0, right: 0.9 }}
                  dragMomentum={false}
                  onDragStart={begin}
                  onDragEnd={onDragEnd}
                  aria-hidden="true"
                >
                  <PackArt packKey={pack.key} season={me?.seasonNumber} shadow={false} />
                </motion.div>
                {/* A bright line runs along the seam as it rips */}
                {stage === 'torn' && !reduce && (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 right-0 bg-white"
                    style={{ top: `${(38 / PACK_H) * 100 - 0.5}%`, height: 3, transformOrigin: '0% 50%' }}
                    initial={{ scaleX: 0, opacity: 1 }}
                    animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
                    transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                  />
                )}
                {stage === 'intro' && !reduce && (
                  <motion.div style={{ opacity: hintOpacity }} className="pointer-events-none absolute left-0 right-0 top-[16%] flex justify-center">
                    <motion.span
                      className="rounded-full bg-white text-neutral-950 text-[11px] font-black px-2.5 py-1 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.8)]"
                      animate={{ x: [-44, 44, -44] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    >
                      Swipe →
                    </motion.span>
                  </motion.div>
                )}
                {stage === 'torn' && !reduce && <Shreds pack={pack} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The cards */}
        {/* Phones: the finished pull is a scrollable two-column grid at a
            readable size (a fan of 5-6 cards would shrink every card). */}
        {stage === 'done' && isMobile && items && (
          <div className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {tally.map((t) => (
                <span key={t.key} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold" style={{ background: t.a, color: '#0a0a0f' }}>{t.n} {t.label}</span>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {items.map((item, i) => (
                <motion.div
                  key={i}
                  className="w-[calc(50%-6px)]"
                  initial={reduce ? false : { opacity: 0, y: 40, rotate: i % 2 ? 4 : -4, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  transition={{ delay: reduce ? 0 : i * 0.09, type: 'spring', stiffness: 220, damping: 20 }}
                >
                  <ItemFace item={item} me={me} />
                </motion.div>
              ))}
            </div>
          </div>
        )}
        {stage === 'done' && !isMobile && tally.length > 0 && (
          <div className="absolute left-0 right-0 top-3 z-20 flex flex-wrap justify-center gap-2">
            {tally.map((t, i) => (
              <motion.span
                key={t.key}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-extrabold"
                style={{ background: t.a, color: '#0a0a0f' }}
                initial={reduce ? false : { y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 260, damping: 20 }}
              >
                {t.n} {t.label}
              </motion.span>
            ))}
          </div>
        )}
        {(stage === 'stack' || (stage === 'done' && !isMobile)) && items && items.map((item, i) => {
          const isOut = i < revealed;
          const final = stage === 'done';
          const r = RARITY[item.rarity] || RARITY.common;
          const spot = !final && i === revealed - 1;
          const pos = spot ? { x: 0, y: stackY, rotate: 0, scale: 1 }
            : isOut || final ? fanPos(i, total, final)
              : { x: cardW * 0.05, y: stackY + 8, rotate: (total - i) % 2 ? -2 : 2, scale: 0.97 };
          const isNext = i === revealed && !final;
          const depthZ = spot ? 3 * total : isOut ? i : total + (total - i);
          const big = rankOf(item.rarity) >= 3;
          return (
            <motion.div
              key={i}
              className="absolute"
              style={{ width: cardW, zIndex: depthZ, perspective: 1000 }}
              initial={{ y: 320, opacity: 0, scale: 0.8, rotate: (i - total / 2) * 6 }}
              animate={{
                ...pos,
                opacity: 1,
                y: pos.y + (!isOut && !final ? (total - i) * -3 : 0),
                x: isNext && shaking ? [pos.x, pos.x - 7, pos.x + 7, pos.x - 6, pos.x + 6, pos.x - 3, pos.x + 3, pos.x] : pos.x,
                // The top tier lands with a slam: a little bigger, then home.
                scale: spot && big && !reduce ? [1.14, 1] : pos.scale,
              }}
              transition={isNext && shaking
                ? { x: { duration: 0.5, repeat: 1 }, default: { type: 'spring', stiffness: 170, damping: 22 } }
                : { type: 'spring', stiffness: spot && big ? 260 : 170, damping: spot && big ? 14 : 22, delay: stage === 'stack' && !isOut && revealed === 0 ? i * 0.12 : final ? i * 0.08 : 0 }}
            >
              <motion.button
                type="button"
                onClick={isNext || (spot && revealed < total) ? (e) => { e.stopPropagation(); flipNext(); } : undefined}
                disabled={!isNext && !(spot && revealed < total)}
                aria-label={isNext || spot ? 'Flip the next card' : undefined}
                className="relative block w-full aspect-[5/7] [transform-style:preserve-3d]"
                animate={{ rotateY: isOut || final ? 180 : 0 }}
                transition={{ duration: reduce ? 0 : 0.7, ease: [0.3, 1.4, 0.5, 1] }}
              >
                {/* Back: the card back, edge tinted by rarity for rare and up */}
                <span className={`absolute inset-0 ${CARD_RADIUS} overflow-hidden [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(0deg)] shadow-[0_24px_40px_-16px_rgba(0,0,0,0.9)]`}
                  style={rankOf(item.rarity) >= 2 ? { boxShadow: `inset 0 0 0 3px ${r.a}, 0 24px 40px -16px rgba(0,0,0,0.9)` } : undefined}>
                  {me?.equipped?.back
                    ? <CardBackArt k={me.equipped.back} className="w-full h-full !rounded-none !border-0 !shadow-none" />
                    : <img src="/card-back.svg" alt="" draggable="false" className="w-full h-full object-cover" />}
                </span>
                {/* Face */}
                <span className="absolute inset-0 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)] shadow-[0_24px_40px_-16px_rgba(0,0,0,0.9)]">
                  <ItemFace item={item} me={me} />
                  {rankOf(item.rarity) >= 3 && (isOut || final) && !reduce && (
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
      </motion.div>

      <div className="relative z-10 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-2 min-h-[112px] flex flex-col items-center justify-end gap-3">
        {error ? (
          <>
            <p className="text-sm font-semibold text-red-300 text-center">{error}</p>
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white text-neutral-950 text-sm font-bold">Close</button>
          </>
        ) : stage === 'intro' ? (
          <>
            <p className="text-sm font-semibold text-white/80 text-center">Swipe across the top to tear it open.</p>
            <button onClick={tear} className="min-h-[48px] px-7 rounded-xl bg-brand hover:bg-brand-hover text-white text-[15px] font-bold transition-colors">
              Tear it open
            </button>
          </>
        ) : stage === 'stack' ? (
          <>
            {total > 0 && (
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className="h-1.5 w-7 rounded-full" style={{ background: i < revealed ? (RARITY[items[i].rarity] || RARITY.common).a : 'rgba(255,255,255,.18)' }} />
                ))}
              </div>
            )}
            <p className="text-sm font-semibold text-white/85 text-center tabular-nums">
              {revealed === 0 ? 'Tap anywhere to flip the first card' : revealed < total ? 'Tap for the next card' : 'That\'s the pull'} · {Math.max(1, revealed)} of {total}
            </p>
          </>
        ) : stage === 'done' ? (
          <div className="flex items-center gap-3">
            <button onClick={share} className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl border border-white/25 hover:border-white/60 text-white text-sm font-bold transition-colors">
              {shared ? <><Check className="w-4 h-4" /> Link copied</> : <><Share2 className="w-4 h-4" /> Share my pull</>}
            </button>
            <button onClick={onClose} className="min-h-[48px] px-7 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors">
              Done
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );

  return createPortal(body, document.body);
}
