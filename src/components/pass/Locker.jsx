// Everything a user has unlocked in ShinyPass, and where they equip it:
// card frames, avatar rings, titles, banners, the pinned badge, the public
// page showcase, the shiny variant, and Featured Listing vouchers.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Search, X, Ticket, Sparkles, Plus } from 'lucide-react';
import { equipItem, setShowcase, setShiny, redeemVoucher } from '../../services/progressService';
import { searchCreators } from '../../services/creatorService';
import { getFollowedCreators } from '../../services/followService';
import CreatorAvatar from '../CreatorAvatar';
import { UserCardSvg } from './PassArt';
import { BadgeIcon } from './BadgeChip';
import { PACK_BY_KEY, RINGS, TITLES, BADGES } from '../../lib/shinyPass';
import { PLATFORM_DISPLAY_NAMES } from '../../lib/constants';

const TABS = [
  { id: 'frame', label: 'Frames' },
  { id: 'ring', label: 'Rings' },
  { id: 'title', label: 'Titles' },
  { id: 'banner', label: 'Banners' },
  { id: 'badge', label: 'Badges' },
  { id: 'showcase', label: 'Showcase' },
  { id: 'vouchers', label: 'Vouchers' },
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
          className="w-full h-11 pl-9 pr-9 rounded-xl border border-neutral-300 bg-white text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-900"
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

  const p = state.progress;
  const eq = p.equipped || {};
  const owned = useMemo(() => {
    const m = { frame: new Set(), ring: new Set(), title: new Set(), banner: new Set() };
    for (const it of state.items) if (m[it.kind]) m[it.kind].add(it.item_key);
    return m;
  }, [state.items]);
  const earned = new Set(state.badges.map((b) => b.badge));
  const hasShiny = state.items.some((i) => i.kind === 'shiny');

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
    <div>
      <div className="flex gap-6 overflow-x-auto border-b border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative -mb-px pb-3 pt-1 text-[15px] font-bold whitespace-nowrap transition-colors ${tab === t.id ? 'text-neutral-950 border-b-2 border-neutral-950' : 'text-neutral-600 hover:text-neutral-900 border-b-2 border-transparent'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-6">
        {tab === 'frame' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[null, ...packsOwned(owned.frame)].map((key) => (
              <div key={key || 'default'}>
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
                <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
                  <span className="mx-auto block w-16 h-16 rounded-full p-[5px]" style={{ background: `conic-gradient(from 20deg, ${r.a}, ${r.b}, ${r.a})` }}>
                    <span className="block w-full h-full rounded-full bg-neutral-900 text-white text-xl font-black leading-[54px]">{(me?.handle || 'S')[0].toUpperCase()}</span>
                  </span>
                  <p className="mt-2 text-sm font-bold text-neutral-900">{r.name}</p>
                  <EquipButton on={eq.ring === key} busy={busy === `ring:${key}`} onClick={() => equip('ring', key)} />
                </div>
              );
            })}
            {owned.ring.size === 0 && <Empty>Rings come from packs and from level 15.</Empty>}
          </div>
        )}

        {tab === 'title' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...owned.title].map((key) => (
              <div key={key} className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="flex-1 font-extrabold text-neutral-900">“{TITLES[key]?.name}”</p>
                <button onClick={() => equip('title', key)} disabled={busy === `title:${key}`} className={`h-9 px-4 rounded-xl text-sm font-bold ${eq.title === key ? 'bg-neutral-100 border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
                  {eq.title === key ? 'Equipped' : 'Equip'}
                </button>
              </div>
            ))}
            {owned.title.size === 0 && <Empty>Your first title unlocks at level 5.</Empty>}
          </div>
        )}

        {tab === 'banner' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...owned.banner].map((key) => {
              const b = PACK_BY_KEY[key];
              return (
                <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="h-20 rounded-xl p-[2px]" style={{ background: `linear-gradient(120deg, ${b.a}, ${b.b} 35%, ${b.d} 60%, ${b.c})` }}>
                    <div className="w-full h-full rounded-[10px] hero-dot-grid" style={{ background: `linear-gradient(120deg, ${b.base}, #0b0b12)` }} />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="font-bold text-neutral-900">{b.name} banner</p>
                    <button onClick={() => equip('banner', key)} className={`h-9 px-4 rounded-xl text-sm font-bold ${eq.banner === key ? 'bg-neutral-100 border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
                      {eq.banner === key ? 'Equipped' : 'Equip'}
                    </button>
                  </div>
                </div>
              );
            })}
            {owned.banner.size === 0 && <Empty>Banners come from packs and top your public page.</Empty>}
          </div>
        )}

        {tab === 'badge' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(BADGES).map(([key, b]) => {
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
  );
}

// Frames in pack order, not pull order.
function packsOwned(set) {
  return Object.keys(PACK_BY_KEY).filter((k) => set.has(k));
}

