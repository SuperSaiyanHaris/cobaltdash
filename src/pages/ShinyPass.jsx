// ShinyPass: your card, the 1-99 track with its packs, ways to earn XP,
// and the locker. Rules in src/lib/shinyPass.js, server in api/progress.js.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Flame, Snowflake, Loader2, Gift, ExternalLink, Eye, EyeOff, Check, X } from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { useProgress, loadProgress, openPack, setPrivate } from '../services/progressService';
import { setHandle } from '../services/commentsService';
import { UserCardSvg, PackSvg, ItemFace } from '../components/pass/PassArt';
import PassTrack from '../components/pass/PassTrack';
import PackOpening from '../components/pass/PackOpening';
import Locker from '../components/pass/Locker';
import { BadgePill } from '../components/pass/BadgeChip';
import { XP_RULES, PACKS, PACK_BY_LEVEL, TOTAL_XP, MAX_LEVEL, streakBonus, voucherChance, SLOT_WEIGHTS, seasonForDate, seasonLastDay } from '../lib/shinyPass';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-2xl sm:text-3xl font-extrabold tabular-nums leading-none">
        {Icon && <Icon className="w-5 h-5 text-white/80" />}{value}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{label}</p>
    </div>
  );
}

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
        <input value={h} onChange={(e) => setH(e.target.value.toLowerCase())} maxLength={20} placeholder="pick a public name"
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
      <div className="w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-[#0a0a0f] text-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 relative" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <p className="text-lg font-extrabold">{pack.name} pack</p>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {items.map((it, i) => <ItemFace key={i} item={it} me={me} />)}
        </div>
      </div>
    </div>
  );
}

function SignedOut() {
  const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to start your ShinyPass' } }));
  const preview = { handle: 'you', level: 12, into: 60, need: 226, xp: 2400, streak: 6, equipped: { badge: 'og2026', title: 'statnerd', frame: 'holo' } };
  return (
    <section className="relative isolate bg-[#0a0a0f] text-white overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid lg:grid-cols-[1.1fr,0.9fr] gap-12 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">ShinyPass · Season {seasonForDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()))}</p>
          <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.02] text-balance">Your own card. 99 levels a season. Ten packs to rip open.</h1>
          <p className="mt-5 text-base sm:text-lg text-white/75 max-w-xl text-pretty">
            Show up, follow creators, comment and save matchups. Your card levels up with you, from Common to Legendary, and every 10 levels you open a pack. A new season starts every October 1, and everything you unlock stays yours.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <BadgePill badge="og2026" dark size="md" />
            <span className="text-sm font-semibold text-white/75 self-center">Everyone who joins in 2026 keeps the OG badge for good.</span>
          </div>
          <button onClick={openAuth} className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold transition-colors">
            Start your ShinyPass
          </button>
        </div>
        <div className="relative h-[380px] sm:h-[420px]">
          <div className="absolute left-1/2 top-2 w-[200px] sm:w-[230px] -translate-x-[95%] rotate-[-7deg]"><PackSvg pack={PACKS[4]} /></div>
          <div className="absolute left-1/2 top-0 w-[230px] sm:w-[260px] -translate-x-[15%] rotate-[5deg] shadow-[0_30px_50px_-20px_rgba(0,0,0,0.9)]"><UserCardSvg me={preview} /></div>
        </div>
      </div>
    </section>
  );
}

export default function ShinyPass() {
  const { user, loading: authLoading } = useAuth();
  const state = useProgress();
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [notice, setNotice] = useState(null);

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
        <SEO title="ShinyPass" description="Level up your own ShinyPull card from 1 to 99, keep your streak alive and open a pack every 10 levels." />
        <SignedOut />
        <OddsAndRules />
      </>
    );
  }

  const p = state.progress;
  const season = state.season || { number: 1, lastDay: seasonLastDay(1), daysLeft: 0 };
  const endLabel = new Date(`${season.lastDay}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const nextPack = PACKS.find((k) => k.level > p.level);
  const toNextPack = nextPack ? TOTAL_XP[nextPack.level] - p.xp : 0;
  const available = state.packs.available;

  function onPack(level, { canOpen, isOpened }) {
    if (canOpen) setOpening(PACK_BY_LEVEL[level]);
    else if (isOpened) {
      const h = state.packs.history.find((x) => x.pack_level === level);
      if (h) setViewing({ pack: PACK_BY_LEVEL[level], items: h.items });
    } else setNotice(`The ${PACK_BY_LEVEL[level].name} pack unlocks at level ${level}.`);
  }

  return (
    <>
      <SEO title="ShinyPass" description="Your ShinyPull card, level, streak and packs." />

      <section className="relative isolate z-20 bg-[#0a0a0f] text-white overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-14 pb-10 grid md:grid-cols-[260px,1fr] lg:grid-cols-[300px,1fr] gap-8 lg:gap-14 items-center">
          <div className="w-[220px] sm:w-[260px] lg:w-[300px] mx-auto md:mx-0 shadow-[0_34px_60px_-24px_rgba(0,0,0,0.95)]">
            <UserCardSvg me={me} />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">ShinyPass · Season {season.number}</p>
            <h1 className="mt-2 text-4xl sm:text-6xl font-extrabold tracking-tight leading-none">Level {p.level}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {state.handle
                ? <Link to={`/u/${state.handle}`} className="inline-flex items-center gap-1 text-[15px] font-semibold text-white/80 hover:text-white">@{state.handle} <ExternalLink className="w-3.5 h-3.5" /></Link>
                : <span className="text-[15px] font-semibold text-white/80">Pick a public name to get your page:</span>}
              {state.badges.slice(0, 3).map((b) => <BadgePill key={b.badge} badge={b.badge} dark />)}
            </div>
            {!state.handle && <div className="mt-3"><HandleForm /></div>}

            {/* XP bar */}
            <div className="mt-6 max-w-xl">
              <div className="flex items-end justify-between text-sm font-semibold">
                <span className="text-white/80 tabular-nums">{p.level >= MAX_LEVEL ? 'Max level' : `${fmt(p.into)} / ${fmt(p.need)} XP`}</span>
                <span className="text-white/70 tabular-nums">{fmt(p.xp)} XP total</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, p.pct * 100)}%`, background: 'linear-gradient(90deg, #5EC8FF, #C084FC 60%, #FFD76A)' }} />
              </div>
              {nextPack && (
                <p className="mt-2.5 text-sm font-medium text-white/75">
                  Next pack: <span className="font-bold text-white">{nextPack.name}</span> at level {nextPack.level}, {fmt(toNextPack)} XP away.
                </p>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 max-w-md">
              <Stat label="Day streak" value={p.streak || 0} icon={Flame} />
              <Stat label="Best streak" value={p.best_streak || 0} />
              <Stat label="Freezes" value={p.streak_freezes || 0} icon={Snowflake} />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {available.length > 0 ? (
                <button onClick={() => setOpening(PACK_BY_LEVEL[available[0]])} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold transition-colors">
                  <Gift className="w-4 h-4" /> Open your {PACK_BY_LEVEL[available[0]].name} pack{available.length > 1 ? ` (+${available.length - 1})` : ''}
                </button>
              ) : (
                <a href="#earn" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors">Ways to earn XP</a>
              )}
              <p className="text-sm font-semibold text-white/75 tabular-nums">+{fmt(state.today.xp)} XP today</p>
            </div>
          </div>
        </div>

        {/* Track */}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold">The track</h2>
              <p className="mt-1 text-sm text-white/75">A pack every 10 levels. Your card levels up at 25, 50 and 75. Season {season.number} ends {endLabel}, {season.daysLeft} days to go.</p>
            </div>
          </div>
          <PassTrack level={p.level} pct={p.pct} opened={state.packs.opened} onPack={onPack} />
          {notice && <p className="mt-2 text-sm font-semibold text-white/80">{notice}</p>}
        </div>
      </section>

      <div className="bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-14">
          <section id="earn" className="scroll-mt-24">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-950">Ways to earn XP</h2>
            <p className="mt-1.5 text-[15px] text-neutral-700">Daily caps reset at midnight Eastern.</p>
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
                <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-950">Your locker</h2>
                <p className="mt-1.5 text-[15px] text-neutral-700">Everything you've unlocked. Equipped items show on your card, your comments and your page.</p>
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
  const names = { xp: 'XP bonus', ring: 'Avatar ring', title: 'Title', freeze: 'Streak Freeze', banner: 'Banner', showcase: 'Showcase slot', shiny: 'Shiny variant' };
  const wrap = light ? '' : 'bg-[#fafaf9]';
  return (
    <section className={wrap}>
      <div className={light ? '' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12'}>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-950">What's in a pack</h2>
        <p className="mt-1.5 text-[15px] text-neutral-700 max-w-2xl">
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
                <PackSvg pack={k} still />
                <p className="mt-1 text-[10.5px] font-bold text-neutral-800 leading-tight">Lv {k.level}</p>
              </div>
            ))}
            <p className="col-span-5 mt-2 text-sm text-neutral-700">
              The level 50 Prism pack and the level 99 Final Pull each have 5 items and always include a free month of a Featured Listing. Reaching level 99 takes about {Math.round(TOTAL_XP[MAX_LEVEL] / 150 / 30)} months of daily visits. Levels and packs reset every October 1; your badges, cosmetics, streak and vouchers stay.
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

