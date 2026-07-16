import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Trophy, Scale, BarChart3, BookOpen, Calculator, TrendingUp,
  LayoutDashboard, FileSpreadsheet, Settings, Youtube, Twitch, Music,
} from 'lucide-react';
import KickIcon from './KickIcon';
import TikTokIcon from './TikTokIcon';
import BlueskyIcon from './BlueskyIcon';
import MastodonIcon from './MastodonIcon';
import RumbleIcon from './RumbleIcon';
import SubstackIcon from './SubstackIcon';
import CreatorAvatar from './CreatorAvatar';
import { searchCreators } from '../services/creatorService';
import { isMac } from '../lib/platform';

const PLATFORM_ICONS = {
  youtube: { Icon: Youtube, color: 'text-red-400' },
  tiktok: { Icon: TikTokIcon, color: 'text-pink-400' },
  twitch: { Icon: Twitch, color: 'text-purple-400' },
  kick: { Icon: KickIcon, color: 'text-green-400' },
  bluesky: { Icon: BlueskyIcon, color: 'text-sky-400' },
  music: { Icon: Music, color: 'text-amber-400' },
  mastodon: { Icon: MastodonIcon, color: 'text-violet-500' },
  rumble: { Icon: RumbleIcon, color: 'text-lime-600' },
  substack: { Icon: SubstackIcon, color: 'text-orange-600' },
};

const QUICK_LINKS = [
  { label: 'Top Rankings',     to: '/rankings',                  Icon: Trophy,          color: 'text-amber-400'   },
  { label: 'Trending Creators',to: '/trending',                  Icon: TrendingUp,      color: 'text-emerald-400' },
  { label: 'Compare Creators', to: '/compare',                   Icon: Scale,           color: 'text-violet-400'  },
  { label: 'YouTube Earnings', to: '/youtube/money-calculator',  Icon: Calculator,      color: 'text-emerald-400' },
  { label: 'Reports',          to: '/reports',                   Icon: FileSpreadsheet, color: 'text-amber-400'   },
  { label: 'Blog',             to: '/blog',                      Icon: BookOpen,        color: 'text-sky-400'     },
  { label: 'Dashboard',        to: '/dashboard',                 Icon: LayoutDashboard, color: 'text-indigo-400'  },
  { label: 'Account',          to: '/account',                   Icon: Settings,        color: 'text-neutral-500'    },
];

const PLATFORM_LINKS = [
  { label: 'YouTube rankings',  to: '/rankings/youtube',  Icon: Youtube,     color: 'text-red-400'    },
  { label: 'TikTok rankings',   to: '/rankings/tiktok',   Icon: TikTokIcon,  color: 'text-pink-400'   },
  { label: 'Twitch rankings',   to: '/rankings/twitch',   Icon: Twitch,      color: 'text-purple-400' },
  { label: 'Kick rankings',     to: '/rankings/kick',     Icon: KickIcon,    color: 'text-green-400'  },
  { label: 'Bluesky rankings',  to: '/rankings/bluesky',  Icon: BlueskyIcon, color: 'text-sky-400'    },
  { label: 'Music rankings',    to: '/rankings/music',    Icon: Music,        color: 'text-amber-400'  },
  { label: 'Mastodon rankings', to: '/rankings/mastodon', Icon: MastodonIcon, color: 'text-violet-500' },
  { label: 'Rumble rankings',   to: '/rankings/rumble',   Icon: RumbleIcon,    color: 'text-lime-600' },
  { label: 'Substack rankings', to: '/rankings/substack', Icon: SubstackIcon,  color: 'text-orange-600' },
];

/**
 * CommandPalette — global Cmd+K (or Ctrl+K) search and navigation.
 * Mount once near the app root.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const searchTimer = useRef(null);

  // Global keyboard listener — Cmd/Ctrl+K to open, / to open (when not typing),
  // Escape to close. Escape is a plain setOpen(false) rather than a toggle, so
  // it's a harmless no-op when the palette is already closed — no need to read
  // `open` here and risk a stale closure.
  useEffect(() => {
    function onKey(e) {
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (modPressed && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Slash to open, but only when no input is focused
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName) && !e.target.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Listen for the custom event so other components can trigger us programmatically
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('openCommandPalette', handler);
    return () => window.removeEventListener('openCommandPalette', handler);
  }, []);

  // Reset query when palette closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setQuery(''); setResults([]); }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced creator search as the user types
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await searchCreators(query.trim());
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl bg-white border border-neutral-200 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Command Menu" shouldFilter={false} className="text-neutral-900">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-200">
                <Search className="w-5 h-5 text-neutral-400 flex-shrink-0" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search creators, jump anywhere... (try MrBeast, rankings, compare)"
                  className="flex-1 bg-transparent text-base text-neutral-900 placeholder-neutral-400 focus:outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-neutral-100 border border-neutral-300 rounded text-neutral-500">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-8 text-center text-sm text-neutral-400">
                  {searching ? 'Searching…' : query.trim().length >= 2 ? 'No creators found.' : 'Type at least 2 characters to search creators.'}
                </Command.Empty>

                {/* Creator results — only when user is searching */}
                {results.length > 0 && (
                  <Command.Group heading="Creators" className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    {results.map((c) => {
                      const platformMeta = PLATFORM_ICONS[c.platform] || PLATFORM_ICONS.youtube;
                      const PIcon = platformMeta.Icon;
                      return (
                        <Command.Item
                          key={`${c.platform}-${c.id || c.username}`}
                          value={`${c.platform}-${c.username}-${c.display_name}`}
                          onSelect={() => go(`/${c.platform}/${c.username}`)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-neutral-100 hover:bg-neutral-100 transition-colors"
                        >
                          <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-neutral-900 truncate">{c.display_name}</p>
                            <p className="text-xs text-neutral-400 truncate">@{c.username}</p>
                          </div>
                          <PIcon className={`w-3.5 h-3.5 ${platformMeta.color} flex-shrink-0`} />
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* Quick links — shown when no search query */}
                {!query.trim() && (
                  <>
                    <Command.Group heading="Jump to" className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      {QUICK_LINKS.map((link) => (
                        <Command.Item
                          key={link.to}
                          value={link.label}
                          onSelect={() => go(link.to)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-neutral-100 hover:bg-neutral-100 transition-colors"
                        >
                          <link.Icon className={`w-4 h-4 ${link.color}`} />
                          <span className="text-sm text-neutral-800">{link.label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>

                    <Command.Group heading="Rankings" className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      {PLATFORM_LINKS.map((link) => (
                        <Command.Item
                          key={link.to}
                          value={link.label}
                          onSelect={() => go(link.to)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-neutral-100 hover:bg-neutral-100 transition-colors"
                        >
                          <link.Icon className={`w-4 h-4 ${link.color}`} />
                          <span className="text-sm text-neutral-800">{link.label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                )}
              </Command.List>

              <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 text-[11px] text-neutral-400 bg-white/60">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 rounded text-neutral-500">↑↓</kbd>
                    <span>navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 rounded text-neutral-500">↵</kbd>
                    <span>open</span>
                  </span>
                </div>
                <span>ShinyPull</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
