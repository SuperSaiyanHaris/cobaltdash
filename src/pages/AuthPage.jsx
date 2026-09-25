import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthForm from '../components/AuthForm';
import SEO from '../components/SEO';
import { getCardsByRarity } from '../services/creatorService';
import { PLATFORM_COUNT } from '../lib/constants';
import { cardImageUrl } from '../lib/cardUrl';
import { CARD_PLATFORMS } from '../lib/badgeCard';

// Page backdrop (desktop): a slanted wall of real holographic creator cards
// drifting in columns. The wall is rotated in 3D, so it uses the markless
// card render (brand rules forbid rotating platform logos).
const WALL_PLATFORMS = ['youtube', 'twitch', 'kick', 'tiktok', 'bluesky', 'music'];
const WALL_COLUMNS = 10;
const PER_COLUMN = 5;
const COLUMN_SPEEDS = ['75s', '62s', '84s', '68s', '79s', '64s', '88s', '70s', '81s', '66s'];
// Staggered start heights, repeating every three columns, so the wall reads
// as an even pattern rather than a straight grid.
const COLUMN_OFFSETS = [0, -150, -70];

function WallColumn({ creators, index }) {
  if (!creators.length) return null;
  const down = index % 2 === 1;
  return (
    <div
      className={`flex flex-col gap-6 w-[190px] flex-shrink-0 ${down ? 'auth-col-down' : 'auth-col-up'}`}
      style={{ animationDuration: COLUMN_SPEEDS[index % COLUMN_SPEEDS.length] }}
    >
      {[...creators, ...creators].map((c, i) => (
        <img
          key={`${c.id}-${i}`}
          src={cardImageUrl(c.platform, c.username, { mark: false })}
          alt=""
          width="250"
          height="350"
          loading={i < 3 ? 'eager' : 'lazy'}
          draggable="false"
          className="w-full h-auto select-none rounded-2xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]"
        />
      ))}
    </div>
  );
}

export default function AuthPage({ initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode);
  const [creators, setCreators] = useState([]);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  // Already signed in? Bounce to where they were headed.
  useEffect(() => {
    if (isAuthenticated) navigate(returnTo || '/dashboard', { replace: true });
  }, [isAuthenticated, returnTo, navigate]);

  useEffect(() => {
    // Every rarity gets love here: per platform, 2 Legendary, 2 Epic,
    // 2 Rare and 3 Common cards, shuffled into the wall.
    getCardsByRarity(WALL_PLATFORMS, { legendary: 2, epic: 2, rare: 2, common: 3 }).then((data) => {
      const usable = (data || []).filter((c) => c.username && CARD_PLATFORMS[c.platform]);
      for (let i = usable.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [usable[i], usable[j]] = [usable[j], usable[i]];
      }
      if (usable.length) setCreators(usable);
    }).catch(() => {});
  }, []);

  const columns = useMemo(() => {
    const cols = Array.from({ length: WALL_COLUMNS }, () => []);
    creators.slice(0, WALL_COLUMNS * PER_COLUMN).forEach((c, i) => cols[i % WALL_COLUMNS].push(c));
    return cols;
  }, [creators]);

  return (
    <>
      <SEO
        title={mode === 'signup' ? 'Sign Up' : 'Sign In'}
        description="Sign in to ShinyPull to follow creators, build a personal dashboard, and save comparisons across eight platforms."
        noindex
      />

      {/* One continuous stage on desktop: an evenly spaced card wall runs
          full width behind everything, and the headline and form sit
          centered on top of it, with a soft dark pool behind them. Phones
          get the plain white form. */}
      <div className="relative isolate overflow-hidden min-h-[calc(100vh-4rem)] bg-white lg:bg-[#0a0a0f]">
        <div aria-hidden="true" className="hidden lg:block absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 hero-dot-grid" />

          {/* The slanted, drifting card wall, centered and symmetric. */}
          <div className="absolute inset-0 [perspective:1800px]">
            <div
              className="absolute left-1/2 top-1/2 flex gap-7 opacity-60"
              style={{ transform: 'translate(-50%, -50%) rotateX(18deg) rotateZ(-8deg) scale(1.12)', transformStyle: 'preserve-3d' }}
            >
              {columns.map((col, i) => (
                <div key={i} style={{ marginTop: `${COLUMN_OFFSETS[i % COLUMN_OFFSETS.length]}px` }}>
                  <WallColumn creators={col} index={i} />
                </div>
              ))}
            </div>
          </div>

          {/* Scrims, all gradients: a dark pool behind the centered content,
              a vignette at the edges, and soft top and bottom fades. */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 32% 72% at 50% 48%, rgba(10,10,15,0.96) 0%, rgba(10,10,15,0.8) 45%, rgba(10,10,15,0.35) 75%, rgba(10,10,15,0) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgba(10,10,15,0.85) 100%)' }} />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0a0a0f]/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0a0f] to-transparent" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] rounded-full bg-violet-600/15 blur-[140px]" />
        </div>

        <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-6 py-10 sm:px-10 lg:py-12 [@media(max-height:820px)]:lg:py-6">
          {/* Headline above the form (desktop only; phones go straight to the form). */}
          <div className="hidden lg:block text-center mb-8 [@media(max-height:820px)]:mb-5 max-w-xl [text-shadow:0_2px_24px_rgba(0,0,0,0.85)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300">Live across {PLATFORM_COUNT} platforms</p>
            <p className="mt-3 text-4xl [@media(max-height:820px)]:text-3xl [@media(max-height:820px)]:mt-2 font-extrabold text-white leading-[1.08] tracking-tight text-balance">
              Every creator has a card.
            </p>
            <p className="mt-2 text-base text-white/65 [@media(max-height:820px)]:hidden">
              Follow the ones you care about.
            </p>
          </div>

          {/* The form: plain on phones, a floating white card on desktop. */}
          <div className="w-full max-w-sm lg:max-w-md lg:bg-white lg:rounded-3xl lg:p-10 [@media(max-height:820px)]:lg:p-7 lg:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)]">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-1">
              {mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Sign in'}
            </h1>
            <p className="text-sm text-neutral-500 mb-8">
              {mode === 'signup'
                ? <>Already have an account? <button onClick={() => setMode('signin')} className="text-indigo-600 font-medium hover:text-indigo-700">Sign in</button></>
                : mode === 'reset'
                ? <>Remembered it? <button onClick={() => setMode('signin')} className="text-indigo-600 font-medium hover:text-indigo-700">Back to sign in</button></>
                : <>Don't have an account? <button onClick={() => setMode('signup')} className="text-indigo-600 font-medium hover:text-indigo-700">Sign up</button></>}
            </p>

            <AuthForm
              mode={mode}
              setMode={setMode}
              onSuccess={() => navigate(returnTo || '/dashboard', { replace: true })}
              showBenefits={false}
            />
          </div>
        </div>
      </div>
    </>
  );
}
