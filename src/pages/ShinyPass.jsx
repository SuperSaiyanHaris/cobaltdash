// ShinyPass: four tabs (Track, Packs, Earn XP, Locker) on a warm paper ground
// with white cards. Only the open tab is mounted. Rules live in
// src/lib/shinyPass.js, the server in api/progress.js.
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Loader2, Eye, EyeOff, Check, X, ChevronRight, Ticket, ArrowRight } from 'lucide-react';
import { PASS_FAQ } from '../lib/passFaq';
import '../components/pass/pass-light.css';
import '../components/pass/arena.css';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { useProgress, loadProgress, openPack, setPrivate } from '../services/progressService';
import { setHandle } from '../services/commentsService';
import { ItemFace } from '../components/pass/PassArt';
import TrackView from '../components/pass/TrackView';
import PacksView from '../components/pass/PacksView';
import PackOpening from '../components/pass/PackOpening';
import Locker from '../components/pass/Locker';
import { BadgePill } from '../components/pass/BadgeChip';
import useArenaFont from '../components/pass/useArenaFont';
import {
  XP_RULES, PACK_BY_LEVEL, TOTAL_XP, streakBonus,
  seasonForDate, seasonLastDay, seasonDaysLeft, levelFromXp,
} from '../lib/shinyPass';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const todayNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const WRAP = 'max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10';

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
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--soft)] font-semibold">@</span>
        <input value={h} onChange={(e) => setH(e.target.value.toLowerCase())} maxLength={20} placeholder="pick a public name" aria-label="Public name"
          className="h-11 w-56 pl-7 pr-3 rounded-xl text-base bg-[var(--cream)] border border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none focus:border-[var(--ink)]" />
      </span>
      <button disabled={busy || h.length < 3} className="spx-btn disabled:opacity-50">{busy ? 'Saving' : 'Save'}</button>
      {err && <span className="w-full text-sm font-semibold text-red-600">{err}</span>}
    </form>
  );
}

function HandleCard() {
  return (
    <div className="spx-card !rounded-[22px] p-4 sm:p-5">
      <p className="text-[15px] font-extrabold text-[var(--ink)]">Get your own public page</p>
      <p className="mt-0.5 mb-3 text-[13.5px] font-medium text-[var(--mute)]">Pick a public name. Your card, level and unlocks show up at shinypull.com/u/yourname.</p>
      <HandleForm />
    </div>
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
    <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-[var(--cream)] text-[var(--ink)]'}`}>
      {done && <Check className="w-3 h-3" />}+{xp}
    </span>
  );
  const bar = (earned, cap) => (cap ? (
    <div className="mt-2.5 h-1.5 rounded-full bg-[var(--trough)] overflow-hidden"><div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${Math.min(100, (earned / cap) * 100)}%` }} /></div>
  ) : null);
  return (
    <>
      {/* Phones: one compact list, rows link to where you earn it */}
      <div className="sm:hidden spx-card !rounded-[22px] divide-y divide-[var(--line)] overflow-hidden">
        {Object.entries(XP_RULES).map(([key, r]) => {
          const { earned, cap, done, xp } = row(key, r);
          const body = (
            <>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-[var(--ink)] leading-tight">{r.label}</p>
                  <p className="text-xs font-medium text-[var(--mute)]">{r.note}</p>
                </div>
                <Pill done={done} xp={xp} />
                {EARN_LINK[key] && <ChevronRight className="w-4 h-4 text-[var(--soft)] flex-shrink-0" />}
              </div>
              {bar(earned, cap)}
            </>
          );
          return EARN_LINK[key]
            ? <Link key={key} to={EARN_LINK[key]} className="block px-4 py-3.5">{body}</Link>
            : <div key={key} className="px-4 py-3.5">{body}</div>;
        })}
      </div>
      {/* Larger screens: cards */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5">
        {Object.entries(XP_RULES).map(([key, r]) => {
          const { earned, cap, done, xp } = row(key, r);
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-bric font-extrabold text-[17px] text-[var(--ink)] leading-snug">{r.label}</p>
                <Pill done={done} xp={xp} />
              </div>
              <p className="mt-1 text-sm font-medium text-[var(--mute)]">{r.note}</p>
              {bar(earned, cap)}
              {cap ? <p className="mt-1.5 text-xs font-bold text-[var(--soft)] tabular-nums">{fmt(earned)} / {fmt(cap)} XP today</p> : null}
            </>
          );
          return EARN_LINK[key]
            ? <Link key={key} to={EARN_LINK[key]} className="spx-card !rounded-[22px] p-5 block hover:border-[rgba(20,18,30,.2)] transition-colors">{inner}</Link>
            : <div key={key} className="spx-card !rounded-[22px] p-5">{inner}</div>;
        })}
      </div>
    </>
  );
}

function PassFaq() {
  return (
    <section>
      <div className="max-w-3xl mx-auto pb-14">
        <h2 className="font-bric font-extrabold text-[28px] sm:text-[32px] leading-none text-[var(--ink)]">ShinyPass questions</h2>
        <div className="mt-5 spx-card !rounded-[22px] divide-y divide-[var(--line)]">
          {PASS_FAQ.map(([q, a]) => (
            <details key={q} className="group px-4 sm:px-5">
              <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer list-none font-extrabold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronRight className="w-4 h-4 text-[var(--soft)] flex-shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
              </summary>
              <p className="pb-4 -mt-1 text-[15px] font-medium text-[var(--mute)] leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const SECTIONS = [
  { id: 'track', label: 'Track' },
  { id: 'packs', label: 'Packs' },
  { id: 'earn', label: 'Earn XP', short: 'Earn' },
  { id: 'locker', label: 'Locker' },
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

const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to start your ShinyPass' } }));

function SignedOut() {
  const demo = useMemo(() => demoState(), []);
  const me = { handle: 'you', seasonNumber: demo.season.number, ...demo.progress };
  return (
    <div className="spx">
      <div className={`${WRAP} pt-6 sm:pt-8 pb-12`}>
        <section className="spx-card p-6 sm:p-10">
          <p className="text-[11px] font-bold tracking-[.14em] text-[var(--accent)] uppercase">ShinyPass · Season {demo.season.number} · Free</p>
          <h1 className="mt-3 font-bric font-extrabold text-[clamp(38px,6.2vw,76px)] leading-[.95] tracking-[-.02em] text-[var(--ink)] text-balance max-w-[16ch]">99 levels. A reward at every one.</h1>
          <p className="mt-4 text-base sm:text-lg font-medium text-[var(--mute)] max-w-2xl text-pretty">
            Earn XP just by using ShinyPull. Every level unlocks something, and every 10 levels you open a pack.
            <span className="hidden sm:inline"> Your card levels up from Common to Legendary, a new season starts every January 1, and everything you unlock stays yours.</span>
          </p>
          <p className="mt-3 flex items-start gap-2 text-[15px] font-bold text-[var(--ink)] max-w-2xl">
            <Ticket className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            Every pack has a chance at a free month of a Featured Listing for any creator you pick.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={openAuth} className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-[15px] font-bold transition-colors">Start your free ShinyPass</button>
            <BadgePill badge="og2026" size="md" />
            <span className="text-sm font-semibold text-[var(--mute)]">Join in 2026 and keep the OG badge for good.</span>
          </div>
        </section>

        <p className="mt-10 mb-3 text-[11px] font-extrabold tracking-[.14em] uppercase text-[var(--soft)]">Preview · a sample season</p>
        <TrackView me={me} state={demo} onOpenPack={openAuth} onViewPack={openAuth} onEquip={openAuth} demo />

        <section className="mt-14">
          <h2 className="font-bric font-extrabold text-[28px] sm:text-[32px] leading-none text-[var(--ink)]">Ways to earn XP</h2>
          <p className="mt-2 text-[15px] font-medium text-[var(--mute)]">Things you'd do on ShinyPull anyway, now worth XP.</p>
          <div className="mt-5"><EarnList /></div>
        </section>

        <section className="mt-14">
          <PacksView me={me} season={demo.season.number} />
        </section>

        <section className="mt-14"><PassFaq /></section>
      </div>
      <section className="relative isolate bg-[#0a0a0f] text-white overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
        <div className={`relative ${WRAP} py-12 sm:py-16 flex flex-col sm:flex-row sm:items-center justify-between gap-6`}>
          <div>
            <p className="font-bric font-extrabold text-[34px] sm:text-[44px] leading-[.95]">Season {demo.season.number} is live.</p>
            <p className="mt-2 text-white/80 max-w-xl">Start today and your first pack is about two days away. Free, with the OG 2026 badge for every account made this year.</p>
          </div>
          <button onClick={openAuth} className="self-start sm:self-auto px-6 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-[15px] font-bold transition-colors">Start your free ShinyPass</button>
        </div>
      </section>
    </div>
  );
}

const readHash = () => {
  const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
  return SECTIONS.some((s) => s.id === h) ? h : 'track';
};

/** The signed-in ShinyPass: the four tabs, plus the pack opening and pull sheets. */
export function PassApp({ state, user }) {
  const [opening, setOpening] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [view, setView] = useState(readHash);
  const [lockerTab, setLockerTab] = useState(null);

  const goView = useCallback((id, detail) => {
    setView(id);
    if (detail) setLockerTab(detail);
    try { window.history.replaceState(null, '', id === 'track' ? window.location.pathname : `#${id}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const me = useMemo(() => ({
    handle: state.handle || 'you',
    publicHandle: state.handle || null,
    seasonNumber: state.season?.number,
    avatar: state.avatar || user?.user_metadata?.avatar_url || null,
    ...state.progress,
  }), [state, user]);

  const p = state.progress;
  const season = state.season || { number: 1, daysLeft: 0 };
  const packReady = state.packs.available.length > 0;
  function viewPack(level) {
    const h = state.packs.history.find((x) => x.pack_level === level);
    if (h) setViewing({ pack: PACK_BY_LEVEL[level], items: h.items });
  }
  const openLevel = (l) => setOpening(PACK_BY_LEVEL[l]);

  return (
    <div className="spx min-h-screen">
      <SEO title="ShinyPass" description="Your ShinyPull card, level, streak and packs." />

      {/* Phones: one tab at a time, pinned under the header */}
      <div className="lg:hidden sticky top-16 z-30 bg-[var(--paper)] px-4 pt-3 pb-2">
        <div role="tablist" aria-label="ShinyPass sections" className="spx-seg">
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={view === s.id} onClick={() => goView(s.id)}>
              {s.short || s.label}
              {s.id === 'packs' && packReady && <span className="dot" aria-label="A pack is ready" />}
            </button>
          ))}
        </div>
      </div>

      <div className={`${WRAP} pt-3 lg:pt-7 pb-14`}>
        <div className="hidden lg:flex items-center justify-between gap-4 mb-4">
          <div role="tablist" aria-label="ShinyPass sections" className="spx-tabs">
            {SECTIONS.map((s) => (
              <button key={s.id} role="tab" aria-selected={view === s.id} onClick={() => goView(s.id)} className="spx-tab">
                {s.label}
                {s.id === 'packs' && packReady && <span className="dot" aria-label="A pack is ready" />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-[var(--soft)]">
            {state.handle && <Link to={`/u/${state.handle}`} className="inline-flex items-center gap-1 text-[var(--ink)] hover:underline">My profile <ArrowRight className="w-3.5 h-3.5" /></Link>}
            <span>Season {season.number} · {season.daysLeft} days left</span>
          </div>
        </div>
        <p className="lg:hidden mb-3 mt-1 text-xs font-bold text-[var(--soft)] flex justify-between"><span>Season {season.number} · {season.daysLeft} days left</span>{state.handle && <Link to={`/u/${state.handle}`} className="text-[var(--ink)]">My profile</Link>}</p>

        {view === 'track' && (
          <TrackView
            me={me}
            state={state}
            onOpenPack={openLevel}
            onViewPack={viewPack}
            onEquip={(tab) => goView('locker', tab)}
            handleForm={!state.handle && <HandleCard />}
          />
        )}

        {view === 'packs' && <PacksView me={me} season={season.number} state={state} onOpenPack={openLevel} onViewPack={viewPack} />}

        {view === 'earn' && (
          <section>
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-bric font-extrabold text-[28px] sm:text-[32px] leading-none text-[var(--ink)]">Ways to earn XP</h2>
              <span className="text-sm font-extrabold text-[var(--ink)] tabular-nums">+{fmt(state.today.xp)} today</span>
            </div>
            <div className="mt-5"><EarnList state={state} /></div>
            <p className="mt-3 text-xs font-semibold text-[var(--soft)]">Daily caps reset at midnight Eastern. An XP Boost adds 25% to everything here.</p>
          </section>
        )}

        {view === 'locker' && (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-bric font-extrabold text-[28px] sm:text-[32px] leading-none text-[var(--ink)]">Your locker</h2>
                <p className="hidden sm:block mt-2 text-[15px] font-medium text-[var(--mute)]">Everything you've unlocked. Equipped items show on your card, your comments and your page.</p>
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
            <div className="mt-5 spx-card p-4 sm:p-7"><Locker state={state} me={me} initialTab={lockerTab} /></div>
          </section>
        )}
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
    </div>
  );
}

export default function ShinyPass() {
  useArenaFont();
  const { user, loading: authLoading } = useAuth();
  const state = useProgress();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadProgress().catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  if (authLoading || (user && loading && !state)) {
    return (
      <div className="spx min-h-[70vh] flex items-center justify-center">
        <SEO title="ShinyPass" />
        <Loader2 className="w-6 h-6 text-[var(--soft)] animate-spin" />
      </div>
    );
  }

  if (!user || !state) {
    return (
      <>
        <SEO title="ShinyPass: Free Season Pass, 99 Levels and Packs" description="Level your own holographic card from 1 to 99 this season. A reward at every level, a pack every 10, and a chance at a free Featured Listing. Free to join." />
        <SignedOut />
      </>
    );
  }

  return <PassApp state={state} user={user} />;
}
