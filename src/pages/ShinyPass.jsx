// ShinyPass: the Arena track (HUD, featured reward, pages of levels, packs),
// ways to earn XP, and the locker. Rules in src/lib/shinyPass.js, server in
// api/progress.js.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Loader2, Eye, EyeOff, Check, X } from 'lucide-react';
import '../components/pass/arena.css';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { useProgress, loadProgress, openPack, setPrivate } from '../services/progressService';
import { setHandle } from '../services/commentsService';
import { PackSvg, ItemFace } from '../components/pass/PassArt';
import ArenaTrack from '../components/pass/ArenaTrack';
import PackOpening from '../components/pass/PackOpening';
import Locker from '../components/pass/Locker';
import { BadgePill } from '../components/pass/BadgeChip';
import useArenaFont from '../components/pass/useArenaFont';
import {
  XP_RULES, PACKS, PACK_BY_LEVEL, TOTAL_XP, MAX_LEVEL, streakBonus, voucherChance, SLOT_WEIGHTS,
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
          className="h-10 w-56 pl-7 pr-3 rounded-xl bg-white/[0.08] border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/60" />
      </span>
      <button disabled={busy || h.length < 3} className="h-10 px-4 rounded-xl bg-white text-neutral-950 text-sm font-bold disabled:opacity-50">{busy ? 'Saving' : 'Save'}</button>
      {err && <span className="w-full text-sm font-semibold text-red-300">{err}</span>}
    </form>
  );
}

function PackContents({ pack, items, me, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-3xl sheet-90 overflow-y-auto bg-[#0a0a0f] text-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-8 relative" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <p className="font-arena italic font-black uppercase text-2xl">{pack.name} pack</p>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {items.map((it, i) => <ItemFace key={i} item={it} me={me} />)}
        </div>
      </div>
    </div>
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
        <p className="font-arena italic font-extrabold uppercase tracking-[0.14em] text-[15px] text-amber-300">ShinyPass · Season {demo.season.number}</p>
        <h1 className="mt-2 font-arena italic font-black uppercase text-[clamp(44px,8vw,88px)] leading-[.86] text-balance max-w-[16ch]">99 levels. A reward at every one.</h1>
        <p className="mt-4 text-base sm:text-lg text-white/80 max-w-2xl text-pretty">
          Show up, follow creators, comment and save matchups. Your card levels up from Common to Legendary, every level unlocks something, and every 10 levels you rip open a pack. A new season starts every January 1, and everything you unlock stays yours.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={openAuth} className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-[15px] font-bold transition-colors">Start your ShinyPass</button>
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
        <SEO title="ShinyPass" description="Level up your own ShinyPull card from 1 to 99 each season, with a reward at every level and a pack every 10." />
        <SignedOut />
        <OddsAndRules />
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

      <section className="relative isolate z-20 bg-[#0a0a0f] text-white overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-10 sm:pb-14">
          {!state.handle && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="text-[14px] font-semibold text-white/85">Pick a public name to get your own page:</span>
              <HandleForm />
            </div>
          )}
          <ArenaTrack me={me} state={state} onOpenPack={(l) => setOpening(PACK_BY_LEVEL[l])} onViewPack={viewPack} />
        </div>
      </section>

      <div className="bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-14">
          <section id="earn" className="scroll-mt-24">
            <h2 className="font-arena italic font-black uppercase text-[34px] leading-none text-neutral-950">Ways to earn XP</h2>
            <p className="mt-2 text-[15px] text-neutral-700">Daily caps reset at midnight Eastern. An XP Boost adds 25% to everything here.</p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(XP_RULES).map(([key, r]) => {
                const earned = state.today.byAction[key] || 0;
                const cap = key === 'streak' ? streakBonus(p.streak) : r.perDay ? r.xp * r.perDay : null;
                const done = cap !== null && cap > 0 && earned >= cap;
                return (
                  <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-extrabold text-neutral-900">{r.label}</p>
                      <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black tabular-nums ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-800'}`}>
                        {done && <Check className="w-3 h-3" />}+{key === 'streak' ? streakBonus(p.streak) : r.xp}
                      </span>
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
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-arena italic font-black uppercase text-[34px] leading-none text-neutral-950">Your locker</h2>
                <p className="mt-2 text-[15px] text-neutral-700">Everything you've unlocked. Equipped items show on your card, your comments and your page.</p>
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

          <OddsAndRules light />
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

function OddsAndRules({ light = false }) {
  const total = SLOT_WEIGHTS.reduce((s, e) => s + e.w, 0);
  const names = { xp: 'XP bonus', ring: 'Avatar ring', title: 'Title', sticker: 'Sticker', name: 'Name effect', back: 'Card back', freeze: 'Streak Freeze', banner: 'Banner', showcase: 'Showcase slot', shiny: 'Shiny variant' };
  const season = seasonForDate(todayNY());
  return (
    <section className={light ? '' : 'bg-[#fafaf9]'}>
      <div className={light ? '' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12'}>
        <h2 className="font-arena italic font-black uppercase text-[34px] leading-none text-neutral-950">What's in a pack</h2>
        <p className="mt-2 text-[15px] text-neutral-700 max-w-2xl">
          Packs are earned, never sold. Each one has its own card frame, then random items at the odds below. The last slot is always an uncommon or better item. Duplicates turn into XP.
        </p>
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-neutral-50 text-left text-neutral-700"><th className="px-4 py-2.5 font-bold">Item</th><th className="px-4 py-2.5 font-bold text-right">Chance per slot</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {SLOT_WEIGHTS.map((e) => (
                  <tr key={e.kind}><td className="px-4 py-2.5 font-semibold text-neutral-900">{names[e.kind]}</td><td className="px-4 py-2.5 text-right tabular-nums text-neutral-800">{((e.w / total) * 100).toFixed(1)}%</td></tr>
                ))}
                <tr className="bg-amber-50/60"><td className="px-4 py-2.5 font-semibold text-neutral-900">Free month of a Featured Listing</td><td className="px-4 py-2.5 text-right tabular-nums text-neutral-800">{voucherChance(10) * 100}% per pack, {voucherChance(60) * 100}% from level 60</td></tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-5 gap-2 content-start">
            {PACKS.map((k) => (
              <div key={k.key} className="text-center">
                <PackSvg pack={k} still season={season} />
                <p className="mt-1 text-[10.5px] font-bold text-neutral-800 leading-tight">Lv {k.level}</p>
              </div>
            ))}
            <p className="col-span-5 mt-2 text-sm text-neutral-700">
              The level 50 Prism pack and the level 99 Final Pull each have 5 items and always include a free month of a Featured Listing. Reaching level 99 takes about {Math.round(TOTAL_XP[MAX_LEVEL] / 150 / 30)} months of daily visits. Levels and packs reset every January 1; your badges, cosmetics, streak and vouchers stay. Season 1 is a short launch season, so its levels need less XP.
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-neutral-700">
          Featured Listing months are Basic placements for any creator you pick, and run 30 days. They end on their own unless someone starts a paid listing on <Link to="/promote" className="font-semibold text-neutral-900 underline">Promote</Link>.
        </p>
      </div>
    </section>
  );
}
