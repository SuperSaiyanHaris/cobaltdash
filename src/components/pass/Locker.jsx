// Everything a user has unlocked in ShinyPass, and where they equip it:
// card frames, avatar rings, titles, banners, stickers, name effects, card
// backs, card effects, comment flair, pack sets, the pinned badge, the
// public page showcase, the shiny variant, and Featured Listing vouchers.
// A live preview (your card, its back and a comment) follows what you equip,
// and on hover shows an item before you equip it.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Search, X, Ticket, Sparkles, Plus } from 'lucide-react';
import { equipItem, setShowcase, setShiny, redeemVoucher } from '../../services/progressService';
import { searchCreators } from '../../services/creatorService';
import { getFollowedCreators } from '../../services/followService';
import CreatorAvatar from '../CreatorAvatar';
import { UserCardSvg, BannerSvg } from './PassArt';
import FlipCard from './FlipCard';
import { StickerArt, NameEffectText, CardBackArt, RewardGlyph, RARITY_COLORS } from './RewardArt';
import Nameplate from './Nameplate';
import { BadgeIcon } from './BadgeChip';
import { PACKS, PACK_BY_KEY, RINGS, TITLES, STICKERS, NAME_EFFECTS, CARD_BACKS, CARD_EFFECTS, FLAIRS, BADGES, TRACK, badgeMeta, seasonMaxBadge, setPieces, itemName } from '../../lib/shinyPass';
import { PLATFORM_DISPLAY_NAMES } from '../../lib/constants';

// Grouped by what they change, and wrapped (never a sideways scroll).
const TAB_GROUPS = [
  { label: 'Card', tabs: [{ id: 'frame', label: 'Frames' }, { id: 'effect', label: 'Effects' }, { id: 'sticker', label: 'Stickers' }, { id: 'back', label: 'Card backs' }] },
  { label: 'Name', tabs: [{ id: 'name', label: 'Names' }, { id: 'flair', label: 'Flair' }, { id: 'title', label: 'Titles' }, { id: 'ring', label: 'Rings' }] },
  { label: 'Page', tabs: [{ id: 'banner', label: 'Banners' }, { id: 'badge', label: 'Badges' }, { id: 'showcase', label: 'Showcase' }] },
  { label: 'Collection', tabs: [{ id: 'sets', label: 'Sets' }, { id: 'vouchers', label: 'Vouchers' }] },
];

function EquipButton({ on, busy, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl text-sm font-bold transition-colors ${on ? 'bg-neutral-100 text-neutral-900 border border-neutral-300' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? <><Check className="w-4 h-4" /> Equipped</> : 'Equip'}
    </button>
  );
}

const firstLevel = (kind) => TRACK.find((r) => r && r.kind === kind)?.level;

/** Your card as it looks right now, with its back and a comment sample. */
function PeekBar({ peek, onReset, dark = true }) {
  if (!peek) return null;
  return (
    <button type="button" onClick={onReset} className={`sp-tap hidden lg:flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-semibold ${dark ? 'bg-white/10 text-white' : 'bg-neutral-900 text-white'}`}>
      <span className="truncate">Previewing {peek.label}</span>
      <span className="flex-shrink-0 underline">Show equipped</span>
    </button>
  );
}

/** Compact preview that stays in view while scrolling the items (phones). */
function MiniPreview({ me, eq, peek, onReset }) {
  return (
    <div className="lg:hidden sticky top-16 z-10 -mx-4 px-4 py-2 bg-[#fafaf9]/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="flex items-center gap-3">
        <div className="w-11 flex-shrink-0"><UserCardSvg me={me} equippedOverride={eq} still /></div>
        <div className="min-w-0 flex-1 flex flex-col items-start gap-1">
          <Nameplate name={me?.handle || 'you'} nameKey={eq.name} flairKey={eq.flair} />
          {peek
            ? <button type="button" onClick={onReset} className="sp-tap self-start text-[12px] font-semibold text-neutral-800 underline">Previewing {peek.label} · show equipped</button>
            : <span className="text-[12px] text-neutral-600">Tap an item's picture to try it on</span>}
        </div>
      </div>
    </div>
  );
}

function Preview({ me, eq, peek, onReset }) {
  const banner = eq.banner && PACK_BY_KEY[eq.banner];
  return (
    <div className="rounded-3xl bg-[#0a0a0f] text-white relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 hero-dot-grid pointer-events-none" />
      {banner && <BannerSvg pack={banner} className="absolute inset-x-0 top-0 h-[120px] pointer-events-none" />}
      <div className="relative p-4 sm:p-5">
      <p className="font-arena italic font-extrabold uppercase tracking-[0.12em] text-[13px] text-white/80">Live preview</p>
      <div className="mt-3 flex lg:flex-col items-start gap-4">
        <div className="w-[128px] sm:w-[170px] lg:w-full flex-shrink-0">
          <FlipCard me={me} equipped={eq} />
        </div>
        <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
          <PeekBar peek={peek} onReset={onReset} />
          {banner && <p className="text-[13px] text-white/75 leading-snug"><b className="text-white">{banner.name} banner</b> tops your public page.</p>}
          <div className="rounded-xl bg-white p-3 text-neutral-900">
            <div className="flex flex-wrap items-center gap-2">
              <Nameplate name={me?.handle || 'you'} nameKey={eq.name} flairKey={eq.flair} />
              <span className="text-xs text-neutral-600">2m</span>
            </div>
            <p className="mt-1 text-sm text-neutral-800">How your name looks in comments.</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <p className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-8 text-center text-[15px] font-medium text-neutral-700">{children}</p>;
}

export function CreatorPicker({ onPick, placeholder = 'Search any creator', exclude = [] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { setResults((await searchCreators(q)) || []); } catch { setResults([]); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 pl-9 pr-9 rounded-xl border border-neutral-300 bg-white text-base text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-900"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 animate-spin" />}
      </label>
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
          {results.filter((c) => !exclude.includes(c.id)).slice(0, 8).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onPick(c); setQ(''); setResults([]); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50">
                <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" rounded="rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-neutral-900 truncate">{c.display_name}</span>
                  <span className="block text-xs text-neutral-600 truncate">@{c.username} · {PLATFORM_DISPLAY_NAMES[c.platform]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Locker({ state, me }) {
  const [tab, setTab] = useState('frame');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [pendingShowcase, setPendingShowcase] = useState(null);
  const [follows, setFollows] = useState(null);
  const [redeeming, setRedeeming] = useState(null);
  const [redeemTarget, setRedeemTarget] = useState(null);
  const [now] = useState(() => Date.now());
  const [peek, setPeek] = useState(null);

  const p = state.progress;
  const eq = p.equipped || {};
  // Hovering a tile (data-peek="slot:key") previews it on the card.
  const shown = peek ? { ...eq, [peek.slot]: peek.key } : eq;
  const onPeek = (e) => {
    const el = e.target.closest?.('[data-peek]');
    if (!el) return;
    const [slot, key] = el.dataset.peek.split(':');
    if (peek && peek.slot === slot && peek.key === (key || undefined)) return;
    const label = slot === 'frame' && !key ? 'rarity foil' : itemName({ kind: slot, key });
    setPeek({ slot, key: key || undefined, label });
  };
  // Touch has no hover (and iOS never sends the leave), so previews there
  // come from a tap on the item itself, never from the equip button.
  const onTilePointer = (e) => { if (e.pointerType === 'mouse') onPeek(e); };
  const onTileClick = (e) => { if (!e.target.closest('button, a, input')) onPeek(e); };
  const resetPeek = () => setPeek(null);
  const owned = useMemo(() => {
    const m = { frame: new Set(), ring: new Set(), title: new Set(), banner: new Set(), sticker: new Set(), name: new Set(), back: new Set(), effect: new Set(), flair: new Set() };
    for (const it of state.items) if (m[it.kind]) m[it.kind].add(it.item_key);
    return m;
  }, [state.items]);
  const earned = new Set(state.badges.map((b) => b.badge));
  const counts = {
    ...Object.fromEntries(Object.entries(owned).map(([k, v]) => [k, v.size])),
    badge: earned.size,
    sets: owned.effect.size,
    vouchers: state.vouchers.filter((v) => v.status === 'unused').length,
  };
  const hasShiny = state.items.some((i) => i.kind === 'shiny');

  useEffect(() => {
    const open = (e) => { if (e.detail) setTab(e.detail); };
    window.addEventListener('shinypass:locker', open);
    return () => window.removeEventListener('shinypass:locker', open);
  }, []);

  useEffect(() => {
    if (tab !== 'showcase' || follows) return;
    getFollowedCreators(p.user_id).then((list) => setFollows(list || [])).catch(() => setFollows([]));
  }, [tab, follows, p.user_id]);

  async function run(key, fn) {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e.message); }
    setBusy(null);
  }
  const equip = (slot, key) => run(`${slot}:${key}`, () => equipItem(slot, eq[slot] === key ? null : key));

  // The server returns the showcase creators whole; a local copy only covers
  // the moment between a change and the server's answer.
  const showcaseCreators = pendingShowcase || state.showcaseCreators || [];
  const saveShowcase = async (list) => {
    setPendingShowcase(list);
    await run('showcase', () => setShowcase(list.map((c) => c.id)));
    setPendingShowcase(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
      <div className="min-w-0 lg:sticky lg:top-24"><Preview me={me} eq={shown} peek={peek} onReset={resetPeek} /></div>
    <div className="min-w-0" onPointerOver={onTilePointer} onPointerLeave={(e) => { if (e.pointerType === 'mouse') resetPeek(); }} onClick={onTileClick}>
      <div className="flex flex-col gap-2.5 pb-5 border-b border-neutral-200" role="tablist" aria-label="Locker">
        {TAB_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-1.5">
            <span className="w-full sm:w-[92px] flex-shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-600">{g.label}</span>
            {g.tabs.map((t) => {
              const n = counts[t.id] || 0;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.id)}
                  className={`sp-tap h-10 sm:h-8 px-3.5 sm:px-3 rounded-full text-[13.5px] font-bold whitespace-nowrap border transition-colors ${on ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400'}`}
                >
                  {t.label}{n > 0 && <span className={`ml-1.5 tabular-nums ${on ? 'text-white/70' : 'text-neutral-600'}`}>{n}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <MiniPreview me={me} eq={shown} peek={peek} onReset={resetPeek} />
      {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-6">
        {tab === 'frame' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[null, ...packsOwned(owned.frame)].map((key) => (
              <div key={key || 'default'} data-peek={`frame:${key || ''}`}>
                <UserCardSvg me={me} equippedOverride={{ ...eq, frame: key || undefined }} still className="shadow-[0_14px_28px_-14px_rgba(0,0,0,0.55)]" />
                <p className="mt-2.5 text-sm font-bold text-neutral-900 text-center">{key ? PACK_BY_KEY[key].name : 'Rarity foil'}</p>
                <EquipButton on={(eq.frame || null) === key} busy={busy === `frame:${key}`} onClick={() => (key ? equip('frame', key) : run('frame:null', () => equipItem('frame', null)))} />
              </div>
            ))}
            {owned.frame.size === 0 && <p className="col-span-full sm:col-span-2 self-center text-[15px] font-medium text-neutral-700">Every pack comes with its own frame. Your first pack unlocks at level 10.</p>}
          </div>
        )}

        {tab === 'ring' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...owned.ring].map((key) => {
              const r = RINGS[key];
              return (
                <div key={key} data-peek={`ring:${key}`} className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
                  <span className="mx-auto block w-16 h-16 rounded-full p-[5px]" style={{ background: `conic-gradient(from 20deg, ${r.a}, ${r.b}, ${r.a})` }}>
                    <span className="block w-full h-full rounded-full bg-neutral-900 text-white text-xl font-black leading-[54px]">{(me?.handle || 'S')[0].toUpperCase()}</span>
                  </span>
                  <p className="mt-2 text-sm font-bold text-neutral-900">{r.name}</p>
                  <EquipButton on={eq.ring === key} busy={busy === `ring:${key}`} onClick={() => equip('ring', key)} />
                </div>
              );
            })}
            {owned.ring.size === 0 && <Empty>Your first ring unlocks at level {firstLevel('ring')}. Packs have their own.</Empty>}
          </div>
        )}

        {tab === 'title' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...owned.title].map((key) => (
              <div key={key} data-peek={`title:${key}`} className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="flex-1 font-extrabold text-neutral-900">“{TITLES[key]?.name}”</p>
                <button onClick={() => equip('title', key)} disabled={busy === `title:${key}`} className={`h-9 px-4 rounded-xl text-sm font-bold ${eq.title === key ? 'bg-neutral-100 border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
                  {eq.title === key ? 'Equipped' : 'Equip'}
                </button>
              </div>
            ))}
            {owned.title.size === 0 && <Empty>Your first title unlocks at level {firstLevel('title')}.</Empty>}
          </div>
        )}

        {tab === 'banner' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...owned.banner].map((key) => {
              const b = PACK_BY_KEY[key];
              return (
                <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="h-24 rounded-xl overflow-hidden border-2" style={{ borderColor: b.a }}><BannerSvg pack={b} still className="w-full h-full" /></div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="font-bold text-neutral-900">{b.name} banner</p>
                    <button onClick={() => equip('banner', key)} disabled={busy === `banner:${key}`} className={`h-9 px-4 rounded-xl text-sm font-bold ${eq.banner === key ? 'bg-neutral-100 border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
                      {eq.banner === key ? 'Equipped' : 'Equip'}
                    </button>
                  </div>
                </div>
              );
            })}
            {owned.banner.size === 0 && <Empty>Your first banner unlocks at level {firstLevel('banner')}. Banners run across the top of your public page.</Empty>}
            {owned.banner.size > 0 && state.handle && <p className="col-span-full text-sm text-neutral-700">Banners run across the top of <Link to={`/u/${state.handle}`} className="font-semibold text-neutral-900 underline">your public page</Link>.</p>}
          </div>
        )}

        {(tab === 'sticker' || tab === 'name' || tab === 'back') && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.keys(tab === 'sticker' ? STICKERS : tab === 'name' ? NAME_EFFECTS : CARD_BACKS).filter((k) => owned[tab].has(k)).map((key) => {
              const cat = tab === 'sticker' ? STICKERS : tab === 'name' ? NAME_EFFECTS : CARD_BACKS;
              return (
                <div key={key} data-peek={`${tab}:${key}`} className="rounded-2xl border border-neutral-200 bg-[#0a0a0f] p-3 flex flex-col">
                  <div className="h-28 flex items-center justify-center overflow-hidden">
                    {tab === 'sticker' && <StickerArt k={key} className="text-2xl" />}
                    {tab === 'name' && <NameEffectText k={key} className="font-arena italic font-black text-3xl truncate max-w-full">@{me?.handle || 'you'}</NameEffectText>}
                    {tab === 'back' && <CardBackArt k={key} className="h-full" />}
                  </div>
                  <p className="mt-2 text-sm font-bold text-white text-center truncate">{cat[key].name}</p>
                  <button onClick={() => equip(tab, key)} disabled={busy === `${tab}:${key}`} className={`mt-2 h-9 rounded-xl text-sm font-bold ${eq[tab] === key ? 'bg-white/15 text-white border border-white/25' : 'bg-white text-neutral-950 hover:bg-neutral-100'}`}>
                    {eq[tab] === key ? 'Equipped' : 'Equip'}
                  </button>
                </div>
              );
            })}
            {owned[tab].size === 0 && <Empty>{tab === 'sticker' ? `Your first sticker unlocks at level ${firstLevel('sticker')}.` : tab === 'name' ? `Your first name effect unlocks at level ${firstLevel('name')}.` : `Your first card back unlocks at level ${firstLevel('back')}.`}</Empty>}
          </div>
        )}

        {tab === 'effect' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.keys(CARD_EFFECTS).filter((k) => owned.effect.has(k)).map((key) => (
              <div key={key} data-peek={`effect:${key}`}>
                <UserCardSvg me={me} equippedOverride={{ ...eq, effect: key }} still className="shadow-[0_14px_28px_-14px_rgba(0,0,0,0.55)]" />
                <p className="mt-2.5 text-sm font-bold text-neutral-900 text-center">{CARD_EFFECTS[key].name}</p>
                <EquipButton on={eq.effect === key} busy={busy === `effect:${key}`} onClick={() => equip('effect', key)} />
              </div>
            ))}
            {owned.effect.size === 0 && <Empty>Card effects animate your card. Complete a pack set (its frame, ring, name effect and card back) to unlock that set's effect. Tap or hover a set in the Sets tab to try its effect on.</Empty>}
          </div>
        )}

        {tab === 'flair' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.keys(FLAIRS).filter((k) => owned.flair.has(k)).map((key) => (
              <div key={key} data-peek={`flair:${key}`} className="rounded-2xl border border-neutral-200 bg-white p-4 flex flex-col items-center">
                <div className="h-12 flex items-center"><Nameplate name={me?.handle || 'you'} flairKey={key} /></div>
                <p className="mt-2 text-sm font-bold text-neutral-900">{FLAIRS[key].name}</p>
                <EquipButton on={eq.flair === key} busy={busy === `flair:${key}`} onClick={() => equip('flair', key)} />
              </div>
            ))}
            {owned.flair.size === 0 && <Empty>Flair is the plate behind your name in comments. It only comes from packs.</Empty>}
          </div>
        )}

        {tab === 'sets' && (
          <div className="space-y-3">
            <p className="text-[15px] text-neutral-700">Every pack has its own set. Collect its card frame, ring, name effect and card back to unlock the set's animated card effect and badge. Pieces only come from packs, and later packs can carry pieces you missed.</p>
            {PACKS.map((pk) => {
              const pieces = setPieces(pk.key);
              const got = pieces.filter((x) => owned[x.kind]?.has(x.key)).length;
              const done = owned.effect.has(pk.key);
              return (
                <div key={pk.key} data-peek={`effect:${pk.key}`} className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${done ? 'border-emerald-300 bg-emerald-50/60' : 'border-neutral-200 bg-white'}`}>
                  <div className="sm:w-44 flex-shrink-0">
                    <p className="font-arena italic font-black uppercase text-[20px] leading-none text-neutral-950">{pk.name} set</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-700 tabular-nums">{got}/{pieces.length} pieces · Lv {pk.level} pack</p>
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    {pieces.map((x) => {
                      const has = owned[x.kind]?.has(x.key);
                      const rc = RARITY_COLORS[x.rarity || 'rare'];
                      return (
                        <div key={`${x.kind}:${x.key}`} title={itemName(x)} className={`rounded-xl p-2 flex flex-col items-center gap-1 ${has ? 'bg-neutral-900' : 'bg-neutral-100 border border-dashed border-neutral-300'}`}>
                          <RewardGlyph kind={x.kind} color={has ? rc.text : '#A3A3A3'} className="w-7 h-7" />
                          <span className={`text-[11px] font-semibold text-center leading-tight line-clamp-2 ${has ? 'text-white' : 'text-neutral-600'}`}>{itemName(x).replace(/ card frame$/, ' frame')}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sm:w-40 flex-shrink-0 text-sm">
                    <p className="font-bold text-neutral-900">{CARD_EFFECTS[pk.key].name}</p>
                    {done
                      ? <button onClick={() => equip('effect', pk.key)} className={`mt-1.5 h-8 px-3 rounded-lg text-xs font-bold ${eq.effect === pk.key ? 'bg-neutral-100 border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>{eq.effect === pk.key ? 'Equipped' : 'Equip effect'}</button>
                      : <p className="mt-0.5 text-neutral-600">Set bonus. Tap or hover to try it on.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'badge' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...new Set([...Object.keys(BADGES), seasonMaxBadge(p.season || 1), ...earned])].filter((k) => badgeMeta(k)).map((key) => {
              const b = badgeMeta(key);
              const has = earned.has(key);
              return (
                <div key={key} className={`flex items-start gap-3 rounded-2xl border p-4 ${has ? 'border-neutral-200 bg-white' : 'border-dashed border-neutral-300 bg-neutral-50'}`}>
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${has ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
                    <BadgeIcon badge={key} className={`w-5 h-5 ${has ? '' : 'opacity-40'}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-neutral-900">{b.name}</p>
                    <p className="mt-0.5 text-sm text-neutral-700">{b.desc}</p>
                  </div>
                  {has && (
                    <button onClick={() => equip('badge', key)} className={`h-8 px-3 rounded-lg text-xs font-bold flex-shrink-0 ${eq.badge === key ? 'bg-neutral-100 border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
                      {eq.badge === key ? 'Pinned' : 'Pin'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'showcase' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <p className="text-[15px] font-bold text-neutral-900">Showcase <span className="font-semibold text-neutral-600 tabular-nums">{showcaseCreators.length}/{state.showcaseSlots}</span></p>
              <p className="mt-1 text-sm text-neutral-700">The creators you want people to see on your public page.</p>
              <div className="mt-4 space-y-2">
                {showcaseCreators.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                    <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" rounded="rounded-lg" />
                    <span className="flex-1 min-w-0 font-semibold text-neutral-900 truncate">{c.display_name}</span>
                    <button onClick={() => saveShowcase(showcaseCreators.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.display_name}`} className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              {showcaseCreators.length < state.showcaseSlots && (
                <div className="mt-3">
                  <CreatorPicker exclude={showcaseCreators.map((c) => c.id)} onPick={(c) => saveShowcase([...showcaseCreators, c])} placeholder="Add a creator to your showcase" />
                </div>
              )}
            </div>
            <div>
              <p className="text-[15px] font-bold text-neutral-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Shiny variant</p>
              {hasShiny ? (
                <>
                  <p className="mt-1 text-sm text-neutral-700">Pick a creator you follow. Their card gets your own foil on your page.</p>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                    {(follows || []).map((c) => (
                      <button key={c.id} onClick={() => run('shiny', () => setShiny(p.shiny_creator_id === c.id ? null : c.id))}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left ${p.shiny_creator_id === c.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400'}`}>
                        <CreatorAvatar src={c.profile_image} name={c.display_name} size="xs" rounded="rounded-md" />
                        <span className="text-sm font-semibold truncate">{c.display_name}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-neutral-700">Pull a Shiny variant from any pack to unlock this.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'vouchers' && (
          <div className="space-y-4">
            {state.vouchers.length === 0 && <Empty>Every pack has a chance at a free month of a Featured Listing (5%, 10% from level 60), and the level 50 and 99 packs always have one.</Empty>}
            {state.vouchers.map((raw) => ({ ...raw, status: raw.status === 'unused' && new Date(raw.expires_at).getTime() < now ? 'expired' : raw.status })).map((v) => (
              <div key={v.id} className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  <span className="w-12 h-12 rounded-xl bg-amber-400 text-neutral-950 flex items-center justify-center flex-shrink-0"><Ticket className="w-6 h-6" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-neutral-900">1 free month: Basic Featured Listing</p>
                    {v.status === 'unused' && <p className="mt-0.5 text-sm text-neutral-700">From your level {v.source_level} pack. Use it by {new Date(v.expires_at).toLocaleDateString()}. It runs 30 days, then ends on its own.</p>}
                    {v.status === 'redeemed' && (
                      <p className="mt-0.5 text-sm text-neutral-700">
                        Featuring <Link className="font-semibold text-neutral-900 underline" to={`/${v.creators?.platform}/${v.creators?.username}`}>{v.creators?.display_name}</Link> on {PLATFORM_DISPLAY_NAMES[v.creators?.platform]} since {new Date(v.redeemed_at).toLocaleDateString()}.{' '}
                        <Link to="/promote" className="font-semibold text-neutral-900 underline">Keep it running</Link>
                      </p>
                    )}
                    {v.status === 'expired' && <p className="mt-0.5 text-sm text-neutral-700">Expired.</p>}
                  </div>
                </div>
                {v.status === 'unused' && (
                  redeeming === v.id ? (
                    <div className="mt-4">
                      {redeemTarget ? (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-neutral-50 border border-neutral-200 p-3">
                          <CreatorAvatar src={redeemTarget.profile_image} name={redeemTarget.display_name} size="sm" rounded="rounded-lg" />
                          <p className="flex-1 min-w-0 text-sm font-semibold text-neutral-900">Feature {redeemTarget.display_name} on {PLATFORM_DISPLAY_NAMES[redeemTarget.platform]} for 30 days?</p>
                          <button onClick={() => setRedeemTarget(null)} className="h-9 px-3 rounded-xl text-sm font-bold text-neutral-800 border border-neutral-300">Back</button>
                          <button
                            onClick={() => run(`redeem:${v.id}`, async () => { await redeemVoucher(v.id, redeemTarget.id); setRedeeming(null); setRedeemTarget(null); })}
                            className="h-9 px-4 rounded-xl text-sm font-bold bg-amber-400 hover:bg-amber-300 text-neutral-950"
                          >
                            {busy === `redeem:${v.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start listing'}
                          </button>
                        </div>
                      ) : (
                        <CreatorPicker onPick={setRedeemTarget} placeholder="Who should get the spot? Any creator works." />
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setRedeeming(v.id)} className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold bg-amber-400 hover:bg-amber-300 text-neutral-950">
                      <Plus className="w-4 h-4" /> Pick a creator
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// Frames in pack order, not pull order.
function packsOwned(set) {
  return Object.keys(PACK_BY_KEY).filter((k) => set.has(k));
}

