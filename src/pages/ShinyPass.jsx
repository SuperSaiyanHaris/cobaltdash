// ShinyPass: the Arena track (HUD, featured reward, pages of levels, packs),
// ways to earn XP, and the locker. Rules in src/lib/shinyPass.js, server in
// api/progress.js.
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Loader2, Eye, EyeOff, Check, X, ChevronRight, Ticket } from 'lucide-react';
import { PASS_FAQ } from '../lib/passFaq';
import '../components/pass/arena.css';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { useProgress, loadProgress, openPack, setPrivate } from '../services/progressService';
import { setHandle } from '../services/commentsService';
import { ItemFace } from '../components/pass/PassArt';
import ArenaTrack from '../components/pass/ArenaTrack';
import PackOpening from '../components/pass/PackOpening';
import Locker from '../components/pass/Locker';
import PackGuide from '../components/pass/PackGuide';
import { BadgePill } from '../components/pass/BadgeChip';
import useArenaFont from '../components/pass/useArenaFont';
import {
  XP_RULES, PACK_BY_LEVEL, TOTAL_XP, streakBonus,
  seasonForDate, seasonLastDay, seasonDaysLeft, levelFromXp,
} from '../lib/shinyPass';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const todayNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

function HandleForm({ onDone }) {
  const [h, setH] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await setHandle(h); await loadProgress({ force: false }); onDone?.(); } catch (x) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <span className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 font-semibold">@</span>
        <input value={h} onChange={(e) => setH(e.target.value.toLowerCase())} maxLength={20} placeholder="pick a public name" aria-label="Public name"
          className="h-10 w-56 pl-7 pr-3 rounded-xl text-base bg-white/[0.08] border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/60" />
      </span>
      <button disabled={busy || h.length < 3} className="h-10 px-4 rounded-xl bg-white text-neutral-950 text-sm font-bold disabled:opacity-50">{busy ? 'Saving' : 'Save'}</button>
      {err && <span className="w-full text-sm font-semibold text-red-300">{err}</span>}
    </form>
  );
}

// Where each XP action happens, so the Earn list can send you there.
const EARN_LINK = { comment: '/rankings', follow: '/rankings', compare: '/compare', explore: '/trending' };

/** Ways to earn XP. `state` is optional (signed out: no progress bars). */
function EarnList({ state }) {
  const p = state?.progress;
  const row = (key, r) => {
    const earned = state?.today.byAction[key] || 0;
    const cap = !state ? null : key === 'streak' ? streakBonus(p.streak) : r.perDay ? r.xp * r.perDay : null;
    const done = cap !== null && cap > 0 && earned >= cap;
    const xp = key === 'streak' && p ? streakBonus(p.streak) : key === 'streak' ? `${r.xp}+` : r.xp;
    return { earned, cap, done, xp };
  };
  const Pill = ({ done, xp }) => (
    <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black tabular-nums ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-800'}`}>
      {done && <Check className="w-3 h-3" />}+{xp}
    </span>
  );
  return (
    <>
      {/* Phones: one compact list, rows link to where you earn it */}
      <div className="sm:hidden rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
        {Object.entries(XP_RULES).map(([key, r]) => {
          const { earned, cap, done, xp } = row(key, r);
          const body = (
            <>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-neutral-900 leading-tight">{r.label}</p>
                  <p className="text-xs text-neutral-600">{r.note}</p>
                </div>
                <Pill done={done} xp={xp} />
                {EARN_LINK[key] && <ChevronRight className="w-4 h-4 text-neutral-500 flex-shrink-0" />}
              </div>
              {cap ? (
                <div className="mt-2 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                  <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.min(100, (earned / cap) * 100)}%` }} />
                </div>
              ) : null}
            </>
          );
          return EARN_LINK[key]
            ? <Link key={key} to={EARN_LINK[key]} className="sp-tap block px-4 py-3">{body}</Link>
            : <div key={key} className="px-4 py-3">{body}</div>;
        })}
      </div>
      {/* Larger screens: cards */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(XP_RULES).map(([key, r]) => {
          const { earned, cap, done, xp } = row(key, r);
          return (
            <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-extrabold text-neutral-900">{r.label}</p>
                <Pill done={done} xp={xp} />
              </div>
              <p className="mt-1 text-sm text-neutral-700">{r.note}</p>
              {cap ? (
                <div className="mt-3 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                  <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.min(100, (earned / cap) * 100)}%` }} />
                </div>
              ) : null}
              {cap ? <p className="mt-1.5 text-xs font-semibold text-neutral-600 tabular-nums">{fmt(earned)} / {fmt(cap)} XP today</p> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PassFaq() {
  return (
    <section className="bg-[#fafaf9]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
        <h2 className="font-arena italic font-black uppercase text-[30px] sm:text-[34px] leading-none text-neutral-950">ShinyPass questions</h2>
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
          {PASS_FAQ.map(([q, a]) => (
            <details key={q} className="group px-4 sm:px-5">
              <summary className="sp-tap flex items-center justify-between gap-3 py-4 cursor-pointer list-none font-bold text-neutral-900 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronRight className="w-4 h-4 text-neutral-600 flex-shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
              </summary>
              <p className="pb-4 -mt-1 text-[15px] text-neutral-700 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const SECTIONS = [
  { id: 'track', label: 'Track' },
  { id: 'locker', label: 'Locker' },
  { id: 'packs', label: 'Packs' },
  { id: 'earn', label: 'Earn' },
];

function PackContents({ pack, items, me, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  // Portaled to <body>: inside the page, a transformed ancestor would make
  // "fixed" relative to it, clipping the sheet (it cut off on iPhones).
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${pack.name} pack`}>
      <div className="w-full sm:w-auto sm:max-w-5xl sheet-90 overflow-y-auto overscroll-contain bg-[#0a0a0f] text-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-8 relative" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <p className="font-arena italic font-black uppercase text-2xl">{pack.name} pack</p>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="relative mt-5 flex flex-wrap justify-center gap-3 sm:gap-4">
          {items.map((it, i) => (
            <div key={i} className={`w-[calc(50%-6px)] ${items.length > 3 ? 'sm:w-[180px] lg:w-[190px]' : 'sm:w-[220px] lg:w-[250px]'}`}>
              <ItemFace item={it} me={me} />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A sample season for signed-out visitors, so they can see what they'd earn.
function demoState() {
  const today = todayNY();
  const n = seasonForDate(today);
  const xp = TOTAL_XP[23] + 186;
  return {
    progress: { xp, ...levelFromXp(xp), streak: 8, best_streak: 12, streak_freezes: 1, equipped: { badge: 'og2026', title: 'statnerd', ring: 'mint', sticker: 'pog', frame: 'chrome' } },
    season: { number: n, lastDay: seasonLastDay(n), daysLeft: seasonDaysLeft(n, today) },
    badges: [{ badge: 'og2026' }, { badge: 'streak7' }],
    packs: { opened: [10], available: [20], history: [] },
    today: { xp: 65, byAction: {} },
    handle: null,
  };
}

function SignedOut() {
  const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to start your ShinyPass' } }));
  const demo = useMemo(() => demoState(), []);
  const me = { handle: 'you', seasonNumber: demo.season.number, ...demo.progress };
  return (
    <section className="relative isolate bg-[#0a0a0f] text-white overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-12">
        <h1 className="font-arena italic font-black uppercase">
          <span className="block font-extrabold tracking-[0.14em] text-[15px] text-amber-300">ShinyPass · Season {demo.season.number} · Free</span>
          <span className="mt-2 block text-[clamp(44px,8vw,88px)] leading-[.86] text-balance max-w-[16ch]">99 levels. A reward at every one.</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-white/80 max-w-2xl text-pretty">
          Earn XP just by using ShinyPull. Every level unlocks something, and every 10 levels you open a pack.
          <span className="hidden sm:inline"> Your card levels up from Common to Legendary, a new season starts every January 1, and everything you unlock stays yours.</span>
        </p>
        <p className="mt-3 flex items-start gap-2 text-[15px] font-semibold text-white/90 max-w-2xl">
          <Ticket className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
          Every pack has a chance at a free month of a Featured Listing for any creator you pick.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={openAuth} className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-[15px] font-bold transition-colors">Start your free ShinyPass</button>
          <BadgePill badge="og2026" dark size="md" />
          <span className="text-sm font-semibold text-white/75">Join in 2026 and keep the OG badge for good.</span>
        </div>
        <p className="mt-10 mb-3 font-arena italic font-extrabold uppercase tracking-[0.12em] text-[14px] text-white/60">Preview · a sample season</p>
        <ArenaTrack me={me} state={demo} onOpenPack={openAuth} onViewPack={openAuth} demo />
      </div>
    </section>
  );
}

export default function ShinyPass() {
  useArenaFont();
  const { user, loading: authLoading } = useAuth();
  const state = useProgress();
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  const [viewing, setViewing] = useState(null);
  // Phones show one section at a time (desktop shows them all).
  const [section, setSection] = useState(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    return SECTIONS.some((s) => s.id === h) ? h : 'track';
  });
  const switcher = useRef(null);
  const goSection = useCallback((id, target) => {
    setSection(id);
    try { window.history.replaceState(null, '', id === 'track' ? window.location.pathname : `#${id}`); } catch { /* ignore */ }
    requestAnimationFrame(() => {
      const el = (target && document.getElementById(target)) || switcher.current;
      if (!el) return;
      const small = window.innerWidth < 1024;
      const top = el.getBoundingClientRect().top + window.scrollY - (small && !target ? 64 : 120);
      if (small ? window.scrollY > top || target : true) window.scrollTo({ top, behavior: 'auto' });
    });
  }, []);
  useEffect(() => {
    const toLocker = () => goSection('locker', 'locker');
    const toGuide = () => goSection('packs', 'pack-guide');
    window.addEventListener('shinypass:locker', toLocker);
    window.addEventListener('shinypass:guide', toGuide);
    return () => { window.removeEventListener('shinypass:locker', toLocker); window.removeEventListener('shinypass:guide', toGuide); };
  }, [goSection]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadProgress().catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const me = useMemo(() => state && {
    handle: state.handle || 'you',
    publicHandle: state.handle || null,
    seasonNumber: state.season?.number,
    avatar: state.avatar || user?.user_metadata?.avatar_url || null,
    ...state.progress,
  }, [state, user]);

  if (authLoading || (user && loading && !state)) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <SEO title="ShinyPass" />
        <Loader2 className="w-6 h-6 text-white/70 animate-spin" />
      </div>
    );
  }

  if (!user || !state) {
    return (
      <>
        <SEO title="ShinyPass: Free Season Pass, 99 Levels and Packs" description="Level your own holographic card from 1 to 99 this season. A reward at every level, a pack every 10, and a chance at a free Featured Listing. Free to join." />
        <SignedOut />
        <section className="bg-[#fafaf9]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14">
            <h2 className="font-arena italic font-black uppercase text-[30px] sm:text-[34px] leading-none text-neutral-950">Ways to earn XP</h2>
            <p className="mt-2 text-[15px] text-neutral-700">Things you'd do on ShinyPull anyway, now worth XP.</p>
            <div className="mt-5"><EarnList /></div>
          </div>
        </section>
        <OddsAndRules />
        <PassFaq />
        <section className="relative isolate bg-[#0a0a0f] text-white overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="font-arena italic font-black uppercase text-[34px] sm:text-[44px] leading-[.9]">Season 1 is live.</p>
              <p className="mt-2 text-white/80 max-w-xl">Start today and your first pack is about two days away. Free, with the OG 2026 badge for every account made this year.</p>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to start your ShinyPass' } }))}
              className="self-start sm:self-auto px-6 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-[15px] font-bold transition-colors"
            >
              Start your free ShinyPass
            </button>
          </div>
        </section>
      </>
    );
  }

  const p = state.progress;
  function viewPack(level) {
    const h = state.packs.history.find((x) => x.pack_level === level);
    if (h) setViewing({ pack: PACK_BY_LEVEL[level], items: h.items });
  }

  return (
    <>
      <SEO title="ShinyPass" description="Your ShinyPull card, level, streak and packs." />

      {/* Phones: one section at a time */}
      <div ref={switcher} className="lg:hidden sticky top-16 z-30 bg-[#0a0a0f] px-4 py-2 border-b border-white/10">
        <div role="tablist" aria-label="ShinyPass sections" className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.07]">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={section === s.id}
              onClick={() => goSection(s.id)}
              className={`sp-tap relative h-10 rounded-lg text-[13px] font-bold transition-colors ${section === s.id ? 'bg-white text-neutral-950' : 'text-white/80'}`}
            >
              {s.label}
              {s.id === 'packs' && state.packs.available.length > 0 && <span aria-label="A pack is ready" className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-emerald-400" />}
            </button>
          ))}
        </div>
      </div>

      <section className="relative isolate z-20 bg-[#0a0a0f] text-white overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-10 sm:pb-14">
          <ArenaTrack
            me={me}
            state={state}
            onOpenPack={(l) => setOpening(PACK_BY_LEVEL[l])}
            onViewPack={viewPack}
            bodyHidden={section !== 'track'}
            handleForm={!state.handle && (
              <div className="rounded-2xl border border-white/15 bg-white/[0.05] p-4">
                <p className="text-[15px] font-bold text-white">Get your own public page</p>
                <p className="mt-0.5 mb-3 text-[13.5px] text-white/75">Pick a public name. Your card, level and unlocks show up at shinypull.com/u/yourname.</p>
                <HandleForm />
              </div>
            )}
          />
        </div>
      </section>

      <div className={`bg-[#fafaf9] ${section === 'track' ? 'max-lg:hidden' : ''}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 space-y-14 max-lg:space-y-0">
          <section id="earn" className={`scroll-mt-24 ${section !== 'earn' ? 'max-lg:hidden' : ''}`}>
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-arena italic font-black uppercase text-[30px] sm:text-[34px] leading-none text-neutral-950">Ways to earn XP</h2>
              <span className="text-sm font-bold text-neutral-800 tabular-nums">+{fmt(state.today.xp)} today</span>
            </div>
            <div className="mt-5"><EarnList state={state} /></div>
            <p className="mt-3 text-xs text-neutral-600">Daily caps reset at midnight Eastern. An XP Boost adds 25% to everything here.</p>
          </section>

          <section id="locker" className={`scroll-mt-20 ${section !== 'locker' ? 'max-lg:hidden' : ''}`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-arena italic font-black uppercase text-[30px] sm:text-[34px] leading-none text-neutral-950">Your locker</h2>
                <p className="hidden sm:block mt-2 text-[15px] text-neutral-700">Everything you've unlocked. Equipped items show on your card, your comments and your page.</p>
              </div>
              {state.handle && (
                <button
                  onClick={() => setPrivate(!p.is_private).catch(() => {})}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-neutral-300 bg-white text-sm font-bold text-neutral-900 hover:border-neutral-900"
                >
                  {p.is_private ? <><EyeOff className="w-4 h-4" /> Page is private</> : <><Eye className="w-4 h-4" /> Page is public</>}
                </button>
              )}
            </div>
            <div className="mt-6"><Locker state={state} me={me} /></div>
          </section>

          <div className={section !== 'packs' ? 'max-lg:hidden' : ''}>
            <OddsAndRules light me={me} state={state} onOpenPack={(l) => setOpening(PACK_BY_LEVEL[l])} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {opening && (
          <PackOpening
            key={opening.level}
            pack={opening}
            me={me}
            onOpen={() => openPack(opening.level).then((r) => r.pulled)}
            onClose={() => setOpening(null)}
          />
        )}
      </AnimatePresence>
      {viewing && <PackContents pack={viewing.pack} items={viewing.items} me={me} onClose={() => setViewing(null)} />}
    </>
  );
}

function OddsAndRules({ light = false, me, state, onOpenPack }) {
  const season = seasonForDate(todayNY());
  return (
    <section className={light ? '' : 'bg-[#fafaf9]'}>
      <div className={light ? '' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12'}>
        <h2 className="font-arena italic font-black uppercase text-[34px] leading-none text-neutral-950">What's in a pack</h2>
        <p className="mt-2 text-[15px] text-neutral-700 max-w-2xl">
          Packs are earned, never sold, and nothing inside is on the level track. Pick a pack to see everything it can hold. Levels and packs reset every January 1; everything you collect stays yours.
        </p>
        <div id="pack-guide" className="mt-6 scroll-mt-20"><PackGuide me={me} season={season} state={state} onOpenPack={onOpenPack} /></div>
      </div>
    </section>
  );
}
