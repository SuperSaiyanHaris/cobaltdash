import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ChartNoAxesColumnIncreasing, Scale, BookOpen, Calculator, TrendingUp, Milestone,
  LayoutDashboard, Settings, ArrowRight, BadgeCheck, Megaphone, Clock, X, Loader2,
} from 'lucide-react';
import MusicIcon from './MusicIcon';
import YouTubeIcon from './YouTubeIcon';
import TwitchIcon from './TwitchIcon';
import KickIcon from './KickIcon';
import TikTokIcon from './TikTokIcon';
import BlueskyIcon from './BlueskyIcon';
import MastodonIcon from './MastodonIcon';
import SubstackIcon from './SubstackIcon';
import { searchCreators, getCreatorRanks, getPlatformCreatorCount } from '../services/creatorService';
import { cardImageUrl } from '../lib/cardUrl';
import { cardTier, TIERS } from '../lib/badgeCard';
import { PLATFORM_IDS, PLATFORM_DISPLAY_NAMES, isActivePlatform } from '../lib/constants';
import { formatNumber } from '../lib/utils';
import { isMac } from '../lib/platform';

// Global search (Cmd/Ctrl+K, "/", or the openCommandPalette event), redesigned
// 2026-09-26 in the site's dark style. Empty state: platform chips into the
// rankings, a grid of the main pages, and recent picks (this browser only).
// Typing: creators as small cards with rarity, the top match featured, plus
// matching pages and a jump to the full search. On phones it's full screen.
// No colored glow (hard rule): neutral black shadow only.

const PLATFORM_ICON = {
  youtube: YouTubeIcon, tiktok: TikTokIcon, twitch: TwitchIcon, kick: KickIcon,
  bluesky: BlueskyIcon, music: MusicIcon, mastodon: MastodonIcon, substack: SubstackIcon,
};

const PAGES = [
  { label: 'Rankings', hint: 'Top creators', to: '/rankings', Icon: ChartNoAxesColumnIncreasing },
  { label: 'Compare', hint: 'Head to head', to: '/compare', Icon: Scale },
  { label: 'Trending', hint: 'Fastest growing', to: '/trending', Icon: TrendingUp },
  { label: 'Dashboard', hint: 'Your collection', to: '/dashboard', Icon: LayoutDashboard },
  { label: 'Creator cards', hint: 'Get your card', to: '/badge', Icon: BadgeCheck },
  { label: 'Get featured', hint: 'Sponsored slots', to: '/promote', Icon: Megaphone },
  { label: 'Milestones', hint: 'Big numbers crossed', to: '/milestones', Icon: Milestone },
  { label: 'YouTube earnings', hint: 'Money calculator', to: '/youtube/money-calculator', Icon: Calculator },
  { label: 'Kick earnings', hint: 'Sub revenue', to: '/kick/earnings', Icon: Calculator },
  { label: 'Blog', hint: 'Stories', to: '/blog', Icon: BookOpen },
  { label: 'Search', hint: 'Full search', to: '/search', Icon: Search },
  { label: 'Account', hint: 'Settings', to: '/account', Icon: Settings },
];
const GRID_PAGES = PAGES.slice(0, 6);

const RECENT_KEY = 'sp-palette-recent';
const loadRecent = () => {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter((c) => isActivePlatform(c.platform)).slice(0, 5); } catch { return []; }
};
const saveRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5))); } catch { /* private mode */ } };

const LABEL = { LEGENDARY: 'Legendary', EPIC: 'Epic', RARE: 'Rare', COMMON: 'Common' };
const ITEM = 'cursor-pointer rounded-xl transition-colors aria-selected:bg-white/10 hover:bg-white/[0.07]';
const GROUP_HEAD = '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-white/60';

function CardThumb({ c, size = 'sm' }) {
  const [failed, setFailed] = useState(false);
  const w = size === 'lg' ? 'w-[72px]' : 'w-[40px]';
  if (failed) {
    const Icon = PLATFORM_ICON[c.platform];
    return (
      <span className={`${w} aspect-[250/350] flex items-center justify-center rounded-[6.4%/4.571%] bg-white/[0.06] border border-white/10 flex-shrink-0`}>
        {Icon && <Icon className="w-4 h-4" />}
      </span>
    );
  }
  return (
    <img
      // Small render: markless, since the logo would fall under its brand minimum size.
      src={cardImageUrl(c.platform, c.username, { mark: false })}
      alt=""
      width="250"
      height="350"
      loading="lazy"
      draggable="false"
      onError={() => setFailed(true)}
      className={`${w} h-auto rounded-[6.4%/4.571%] bg-white/[0.04] flex-shrink-0 select-none`}
    />
  );
}

function RarityTag({ rank, total }) {
  if (!rank || !total) return null;
  const t = cardTier(rank, total);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: TIERS[t.name].a }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TIERS[t.name].a }} />
      {LABEL[t.name]}
    </span>
  );
}

export default function CommandPalette({ startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [ranks, setRanks] = useState({});
  const [totals, setTotals] = useState({});
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const navigate = useNavigate();
  const searchTimer = useRef(null);
  const searchSeq = useRef(0);

  // Cmd/Ctrl+K toggles, "/" opens when not typing, Escape closes.
  useEffect(() => {
    function onKey(e) {
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (modPressed && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName) && !e.target.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('openCommandPalette', handler);
    return () => window.removeEventListener('openCommandPalette', handler);
  }, []);

  // Lock page scroll while open; reset shortly after closing.
  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    const t = setTimeout(() => { setQuery(''); setResults([]); }, 200);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced creator search with a sequence guard so a slow earlier response
  // can never overwrite a newer one. Ranks (for rarity) come in one follow-up
  // query; platform totals are cached by the service.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      searchSeq.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++searchSeq.current;
    searchTimer.current = setTimeout(async () => {
      try {
        const rows = ((await searchCreators(q)) || []).filter((c) => c.username && isActivePlatform(c.platform)).slice(0, 8);
        if (searchSeq.current !== mySeq) return;
        setResults(rows);
        const platforms = [...new Set(rows.map((c) => c.platform))];
        const [r, t] = await Promise.all([
          getCreatorRanks(rows.map((c) => c.id)).catch(() => ({})),
          Promise.all(platforms.map((p) => getPlatformCreatorCount(p).then((n) => [p, n]).catch(() => [p, null]))),
        ]);
        if (searchSeq.current !== mySeq) return;
        setRanks(r || {});
        setTotals((prev) => ({ ...prev, ...Object.fromEntries(t) }));
      } catch {
        if (searchSeq.current === mySeq) setResults([]);
      } finally {
        if (searchSeq.current === mySeq) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  function openCreator(c) {
    const entry = { platform: c.platform, username: c.username, display_name: c.display_name, profile_image: c.profile_image };
    const next = [entry, ...recent.filter((r) => !(r.platform === c.platform && r.username === c.username))].slice(0, 5);
    saveRecent(next);
    go(`/${c.platform}/${c.username}`);
  }

  const q = query.trim();
  const qLower = q.toLowerCase();
  const pageMatches = q.length >= 2 ? PAGES.filter((p) => `${p.label} ${p.hint}`.toLowerCase().includes(qLower)).slice(0, 4) : [];
  const [top, ...rest] = results;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center sm:pt-[10vh] sm:px-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full sm:h-auto sm:max-w-2xl bg-[#101016] text-white sm:border sm:border-white/10 sm:rounded-3xl shadow-[0_40px_90px_-20px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Search ShinyPull" shouldFilter={false} loop className="flex flex-col min-h-0 h-full">
              {/* Search field */}
              <div className="p-3 sm:p-4 border-b border-white/10">
                <div className="flex items-center gap-3 h-14 px-4 rounded-2xl bg-white text-neutral-900">
                  {searching ? <Loader2 className="w-5 h-5 text-neutral-500 animate-spin flex-shrink-0" /> : <Search className="w-5 h-5 text-neutral-500 flex-shrink-0" />}
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search any creator or page"
                    className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-lg font-medium text-neutral-900 placeholder-neutral-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center h-7 px-2 rounded-md border border-neutral-300 text-[11px] font-bold text-neutral-700 hover:border-neutral-900"
                    aria-label="Close search"
                  >
                    <span className="hidden sm:inline">ESC</span>
                    <X className="w-4 h-4 sm:hidden" />
                  </button>
                </div>
              </div>

              <Command.List className="flex-1 sm:flex-none sm:max-h-[60vh] overflow-y-auto px-2 sm:px-3 pb-3">
                {/* ── Empty state ── */}
                {!q && (
                  <>
                    <Command.Group heading="Rankings" className={`${GROUP_HEAD} [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-wrap [&_[cmdk-group-items]]:gap-2 [&_[cmdk-group-items]]:px-1`}>
                      {PLATFORM_IDS.map((p) => {
                        const Icon = PLATFORM_ICON[p];
                        return (
                          <Command.Item
                            key={p}
                            value={`rankings-${p}`}
                            onSelect={() => go(`/rankings/${p}`)}
                            className="cursor-pointer inline-flex items-center gap-2 h-10 px-3.5 rounded-full border border-white/15 text-sm font-semibold transition-colors hover:border-white/50 aria-selected:bg-white aria-selected:text-neutral-950 aria-selected:border-white"
                          >
                            {Icon && <Icon className="w-4 h-4" />}
                            {PLATFORM_DISPLAY_NAMES[p]}
                          </Command.Item>
                        );
                      })}
                    </Command.Group>

                    <Command.Group heading="Go to" className={`${GROUP_HEAD} [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-2 sm:[&_[cmdk-group-items]]:grid-cols-3 [&_[cmdk-group-items]]:gap-2 [&_[cmdk-group-items]]:px-1`}>
                      {GRID_PAGES.map((pg) => (
                        <Command.Item
                          key={pg.to}
                          value={`page-${pg.label}`}
                          onSelect={() => go(pg.to)}
                          className="cursor-pointer flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.04] transition-colors hover:border-white/30 aria-selected:bg-white/10 aria-selected:border-white/40"
                        >
                          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 flex-shrink-0"><pg.Icon className="w-4 h-4" /></span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold truncate">{pg.label}</span>
                            <span className="block text-xs text-white/65 truncate">{pg.hint}</span>
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>

                    {recent.length > 0 && (
                      <Command.Group heading="Recent" className={GROUP_HEAD}>
                        {recent.map((c) => {
                          const Icon = PLATFORM_ICON[c.platform];
                          return (
                            <Command.Item
                              key={`${c.platform}/${c.username}`}
                              value={`recent-${c.platform}-${c.username}`}
                              onSelect={() => openCreator(c)}
                              className={`${ITEM} flex items-center gap-3 px-3 py-2`}
                            >
                              <Clock className="w-4 h-4 text-white/50 flex-shrink-0" />
                              <span className="flex-1 min-w-0 text-sm font-semibold truncate">{c.display_name || c.username}</span>
                              {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    )}
                  </>
                )}

                {/* ── Typing, too short ── */}
                {q && q.length < 2 && (
                  <p className="px-3 py-8 text-center text-sm text-white/65">Keep typing to search creators.</p>
                )}

                {/* ── Results ── */}
                {q.length >= 2 && (
                  <>
                    {top && (
                      <Command.Group heading="Top match" className={GROUP_HEAD}>
                        <Command.Item
                          value={`creator-${top.platform}-${top.username}`}
                          onSelect={() => openCreator(top)}
                          className={`${ITEM} flex items-center gap-4 p-3 border border-white/10`}
                        >
                          <CardThumb c={top} size="lg" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-lg font-extrabold truncate">{top.display_name || top.username}</span>
                            <span className="flex items-center gap-1.5 mt-0.5 text-sm text-white/70">
                              {PLATFORM_ICON[top.platform] && (() => { const I = PLATFORM_ICON[top.platform]; return <I className="w-3.5 h-3.5" />; })()}
                              {PLATFORM_DISPLAY_NAMES[top.platform]} · @{top.username}
                            </span>
                            <span className="flex items-center gap-3 mt-2">
                              {ranks[top.id]?.subscribers ? <span className="text-base font-black tabular-nums">{formatNumber(ranks[top.id].subscribers)}</span> : null}
                              {ranks[top.id]?.rank ? <span className="text-xs font-semibold text-white/70 tabular-nums">#{formatNumber(ranks[top.id].rank)}</span> : null}
                              <RarityTag rank={ranks[top.id]?.rank} total={totals[top.platform]} />
                            </span>
                          </span>
                          <ArrowRight className="w-4 h-4 text-white/60 flex-shrink-0" />
                        </Command.Item>
                      </Command.Group>
                    )}

                    {rest.length > 0 && (
                      <Command.Group heading="Creators" className={GROUP_HEAD}>
                        {rest.map((c) => {
                          const Icon = PLATFORM_ICON[c.platform];
                          return (
                            <Command.Item
                              key={`${c.platform}-${c.id || c.username}`}
                              value={`creator-${c.platform}-${c.username}`}
                              onSelect={() => openCreator(c)}
                              className={`${ITEM} flex items-center gap-3 px-3 py-2`}
                            >
                              <CardThumb c={c} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-bold truncate">{c.display_name || c.username}</span>
                                <span className="flex items-center gap-2 text-xs text-white/65">
                                  {Icon && <Icon className="w-3 h-3" />}
                                  <span className="truncate">@{c.username}</span>
                                  <RarityTag rank={ranks[c.id]?.rank} total={totals[c.platform]} />
                                </span>
                              </span>
                              {ranks[c.id]?.subscribers ? <span className="text-sm font-bold tabular-nums text-white/90">{formatNumber(ranks[c.id].subscribers)}</span> : null}
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    )}

                    {pageMatches.length > 0 && (
                      <Command.Group heading="Pages" className={GROUP_HEAD}>
                        {pageMatches.map((pg) => (
                          <Command.Item key={pg.to} value={`page-${pg.label}`} onSelect={() => go(pg.to)} className={`${ITEM} flex items-center gap-3 px-3 py-2.5`}>
                            <pg.Icon className="w-4 h-4 text-white/80" />
                            <span className="text-sm font-semibold">{pg.label}</span>
                            <span className="text-xs text-white/60">{pg.hint}</span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    <Command.Group heading={!searching && results.length === 0 ? 'No creators found yet' : 'More'} className={GROUP_HEAD}>
                      <Command.Item
                        value={`__search_all__${q}`}
                        onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)}
                        className={`${ITEM} flex items-center gap-3 px-3 py-2.5`}
                      >
                        <Search className="w-4 h-4 text-amber-300 flex-shrink-0" />
                        <span className="flex-1 text-sm truncate">Search every platform for <span className="font-bold">"{q}"</span></span>
                        <ArrowRight className="w-4 h-4 text-white/60 flex-shrink-0" />
                      </Command.Item>
                    </Command.Group>
                  </>
                )}
              </Command.List>

              <div className="hidden sm:flex items-center justify-between px-5 py-3 border-t border-white/10 text-xs text-white/65">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-white/20 text-white/85">↑↓</kbd> move</span>
                  <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-white/20 text-white/85">↵</kbd> open</span>
                  <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-white/20 text-white/85">{isMac ? '⌘' : 'Ctrl'} K</kbd> toggle</span>
                </div>
                <span className="font-semibold text-white/80">ShinyPull</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
