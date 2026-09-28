// A user's public ShinyPass page: /u/:handle. Card, badges, showcase (with
// their shiny variant) and recent comments. Only the public handle is ever
// shown, never display_name or email. noindex for now.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Lock, Flame, MessageCircle, Share2, Check, ArrowUp } from 'lucide-react';
import SEO from '../components/SEO';
import { getPublicProfile } from '../services/progressService';
import { CARD_RADIUS, BannerSvg } from '../components/pass/PassArt';
import FlipCard from '../components/pass/FlipCard';
import { BadgePill } from '../components/pass/BadgeChip';
import { StickerArt, NameEffectText } from '../components/pass/RewardArt';
import useArenaFont from '../components/pass/useArenaFont';
import { cardImageUrl } from '../lib/cardUrl';
import { PACK_BY_KEY, TITLES } from '../lib/shinyPass';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';

function Banner({ banner }) {
  const b = banner && PACK_BY_KEY[banner];
  if (!b) return <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />;
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
      <BannerSvg pack={b} className="absolute inset-x-0 top-0 h-[150px] sm:h-[230px] pointer-events-none" />
    </>
  );
}

function CreatorCard({ c, shiny = false }) {
  return (
    <Link to={`/${c.platform}/${c.username}`} className="block">
      <div className={`relative ${shiny ? `p-[4px] ${CARD_RADIUS} sp-shiny-edge` : ''}`}>
        <img
          src={cardImageUrl(c.platform, c.username)}
          alt={`${c.display_name} card`}
          width="250" height="350" loading="lazy" draggable="false"
          className={`block w-full h-auto ${CARD_RADIUS} bg-[#15151c] select-none shadow-[0_14px_28px_-14px_rgba(0,0,0,0.6)]`}
        />
        {shiny && <span aria-hidden="true" className={`pointer-events-none absolute inset-[4px] ${CARD_RADIUS} sp-shiny-foil`} />}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-neutral-900 truncate">{shiny ? 'Shiny: ' : ''}{c.display_name}</p>
    </Link>
  );
}

export default function PublicProfile() {
  const { handle } = useParams();
  const [data, setData] = useState(undefined);
  const [copied, setCopied] = useState(false);
  useArenaFont();

  useEffect(() => {
    setData(undefined);
    getPublicProfile(handle).then(setData).catch(() => setData(null));
  }, [handle]);

  if (data === undefined) {
    return (
      <div className="min-h-[70vh] bg-[#0a0a0f] flex items-center justify-center">
        <SEO title={`@${handle}`} noindex />
        <Loader2 className="w-6 h-6 text-white/70 animate-spin" />
      </div>
    );
  }

  if (!data || data.private) {
    return (
      <div className="min-h-[70vh] bg-[#0a0a0f] text-white flex flex-col items-center justify-center text-center px-6 relative">
        <SEO title={data ? `@${data.handle}` : 'Not found'} noindex />
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid" />
        <div className="relative">
          {data ? <Lock className="w-8 h-8 mx-auto text-white/70" /> : null}
          <p className="mt-3 text-2xl font-extrabold">{data ? `@${data.handle} keeps their page private.` : "There's no one by that name."}</p>
          <Link to="/pass" className="mt-6 inline-flex px-5 py-2.5 rounded-xl bg-white text-neutral-950 text-sm font-bold">See ShinyPass</Link>
        </div>
      </div>
    );
  }

  const p = data.progress;
  const eq = p.equipped || {};
  const me = { handle: data.handle, avatar: data.avatar, ...p, seasonNumber: data.season };
  const title = eq.title && TITLES[eq.title]?.name;

  async function share() {
    const url = `https://shinypull.com/u/${data.handle}`;
    try {
      if (navigator.share) await navigator.share({ title: `@${data.handle} on ShinyPull`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* dismissed */ }
  }

  return (
    <>
      <SEO title={`@${data.handle}, level ${p.level}`} description={`@${data.handle}'s ShinyPull card: level ${p.level}, ${data.badges.length} badges.`} noindex />

      <section className="relative isolate z-20 bg-[#0a0a0f] text-white overflow-hidden">
        <Banner banner={eq.banner} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 grid sm:grid-cols-[220px,1fr] lg:grid-cols-[280px,1fr] gap-8 sm:gap-12 items-center">
          <FlipCard me={me} className="w-[210px] sm:w-full mx-auto" />
          <div className="min-w-0 text-center sm:text-left">
            <p className="font-arena italic font-extrabold uppercase tracking-[0.14em] text-[15px] text-amber-300">ShinyPass · Season {data.season || 1} · Level {p.level}</p>
            <h1 className="mt-2 font-arena italic font-black uppercase text-[clamp(44px,8vw,84px)] leading-[.9] break-words">
              {eq.name ? <NameEffectText k={eq.name}>@{data.handle}</NameEffectText> : <>@{data.handle}</>}
            </h1>
            {eq.sticker && <div className="mt-3"><StickerArt k={eq.sticker} className="text-xl" /></div>}
            {title && <p className="mt-2 text-lg font-semibold text-white/80">“{title}”</p>}
            <div className="mt-5 flex flex-wrap justify-center sm:justify-start gap-2">
              {data.badges.map((b) => <BadgePill key={b.badge} badge={b.badge} dark size="md" />)}
            </div>
            {data.pastSeasons?.length > 0 && (
              <p className="mt-3 text-sm font-semibold text-white/75">
                {data.pastSeasons.map((s) => `Season ${s.season}: level ${s.level}`).join(' · ')}
              </p>
            )}
            <div className="mt-7 grid grid-cols-3 gap-4 max-w-md mx-auto sm:mx-0 text-left">
              {[
                { label: 'Level', value: p.level },
                { label: 'Best streak', value: p.best_streak, icon: Flame },
                { label: 'Following', value: data.following },
              ].map((s) => (
                <div key={s.label}>
                  <p className="flex items-center gap-1.5 text-2xl sm:text-3xl font-extrabold tabular-nums leading-none">{s.icon && <s.icon className="w-5 h-5 text-white/80" />}{s.value}</p>
                  <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap justify-center sm:justify-start gap-3">
              <button onClick={share} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors">
                {copied ? <><Check className="w-4 h-4" /> Link copied</> : <><Share2 className="w-4 h-4" /> Share</>}
              </button>
              <Link to="/pass" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/25 hover:border-white/60 text-white text-sm font-bold transition-colors">Start your free ShinyPass</Link>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
          {(data.showcase.length > 0 || data.shiny) && (
            <section>
              <h2 className="text-2xl font-extrabold text-neutral-950">Showcase</h2>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
                {data.shiny && <CreatorCard c={data.shiny} shiny />}
                {data.showcase.filter((c) => c.id !== data.shiny?.id).map((c) => <CreatorCard key={c.id} c={c} />)}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-2xl font-extrabold text-neutral-950">Recent comments</h2>
            {data.comments.length === 0 ? (
              <p className="mt-4 text-[15px] text-neutral-700">No comments yet.</p>
            ) : (
              <div className="mt-5 grid md:grid-cols-2 gap-3">
                {data.comments.map((c) => (
                  <Link key={c.id} to={`/${c.creators.platform}/${c.creators.username}#comments`} className="block rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-400 transition-colors">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                      <MessageCircle className="w-3.5 h-3.5" /> on {c.creators.display_name} · {PLATFORM_DISPLAY_NAMES[c.creators.platform]}
                    </p>
                    <p className="mt-2 text-[15px] text-neutral-900 line-clamp-3">{c.body}</p>
                    {c.up_count > 0 && <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-neutral-700 tabular-nums"><ArrowUp className="w-3.5 h-3.5" />{c.up_count}</p>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
