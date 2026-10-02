import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp } from 'lucide-react';
import CreatorAvatar from './CreatorAvatar';
import { getRankedCreators, excludeCatalogRestores } from '../services/creatorService';
import { getRecentlyViewed } from '../lib/recentlyViewed';
import CardImage from './CardImage';
import { isActivePlatform, PLATFORM_DISPLAY_NAMES } from '../lib/constants';
import { formatNumber } from '../lib/utils';

// What the Search page shows before anyone searches: your recently viewed
// creators, the platform's top 6 as cards, and this month's biggest risers.
// Follows the platform tab, all from the cached rankings.

// growth_30d means a different thing per platform (see rankings_cache).
const GROWTH_UNIT = {
  youtube: 'views', tiktok: 'followers', twitch: 'hours watched', kick: 'paid subs',
  bluesky: 'followers', music: 'listeners', mastodon: 'followers', substack: 'subscribers',
};

const EYEBROW = 'text-xs font-bold uppercase tracking-[0.2em] text-amber-700';
const H2 = 'mt-1.5 text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900';

export default function SearchDiscover({ platform }) {
  const name = PLATFORM_DISPLAY_NAMES[platform] || platform;
  const [top, setTop] = useState(null);
  const [rising, setRising] = useState(null);
  const [recent] = useState(() => getRecentlyViewed().filter((c) => isActivePlatform(c.platform)).slice(0, 8));

  useEffect(() => {
    let live = true;
    getRankedCreators(platform, 'subscribers', 6).then((d) => live && setTop(d || [])).catch(() => live && setTop([]));
    getRankedCreators(platform, 'growth', 10).then((d) => excludeCatalogRestores(platform, d)).then((d) => live && setRising((d || []).filter((c) => c.growth_30d > 0).slice(0, 5))).catch(() => live && setRising([]));
    return () => { live = false; };
  }, [platform]);

  return (
    <div className="space-y-12">
      {recent.length > 0 && (
        <section>
          <p className={EYEBROW}>Pick up where you left off</p>
          <h2 className={H2}>Recently viewed</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {recent.map((c) => (
              <Link
                key={`${c.platform}/${c.username}`}
                to={`/${c.platform}/${c.username}`}
                className="inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white border border-neutral-200 hover:border-neutral-300 transition-colors"
              >
                <CreatorAvatar src={c.profileImage} name={c.displayName || c.username} size="xs" />
                <span className="text-sm font-semibold text-neutral-900 max-w-[160px] truncate">{c.displayName || c.username}</span>
                <span className="text-xs text-neutral-600">{PLATFORM_DISPLAY_NAMES[c.platform]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <p className={EYEBROW}>The biggest right now</p>
            <h2 className={H2}>Top on {name}</h2>
          </div>
          <Link to={`/rankings/${platform}`} className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900 hover:underline underline-offset-4 flex-shrink-0">
            Full rankings <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4">
          {(top || Array.from({ length: 6 }, () => null)).map((c, i) => (
            c ? (
              <Link key={c.creator_id || c.username} to={`/${platform}/${c.username}`} className="block" title={c.display_name}>
                <CardImage
                  platform={platform}
                  username={c.username}
                  tier={c.rank_position <= 10 ? 'legendary' : 'common'}
                  loading="lazy"
                  alt={`${c.display_name}, #${c.rank_position} on ${name}`}
                  className="shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]"
                />
              </Link>
            ) : (
              <div key={i} className="aspect-[250/350] rounded-[6.4%/4.571%] bg-neutral-200/70 animate-pulse" />
            )
          ))}
        </div>
      </section>

      {(rising === null || rising.length > 0) && (
        <section>
          <p className={EYEBROW}>Last 30 days</p>
          <h2 className={H2}>Rising on {name}</h2>
          <div className="mt-4 bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] divide-y divide-neutral-100">
            {(rising || Array.from({ length: 5 }, () => null)).map((c, i) => (
              c ? (
                <Link key={c.creator_id || c.username} to={`/${platform}/${c.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors first:rounded-t-xl last:rounded-b-xl">
                  <span className="w-5 text-sm font-bold text-neutral-600 tabular-nums">{i + 1}</span>
                  <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-neutral-900 truncate">{c.display_name}</span>
                    <span className="block text-xs text-neutral-600 truncate">@{c.username}</span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 tabular-nums">
                      <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />+{formatNumber(c.growth_30d)}
                    </span>
                    <span className="block text-[11px] text-neutral-600">{GROWTH_UNIT[platform]}</span>
                  </span>
                </Link>
              ) : (
                <div key={i} className="h-[60px] px-4 flex items-center"><div className="h-4 w-1/2 rounded bg-neutral-100 animate-pulse" /></div>
              )
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
