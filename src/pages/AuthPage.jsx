import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthForm from '../components/AuthForm';
import SEO from '../components/SEO';
import { getShowcaseCreators } from '../services/creatorService';
import { PLATFORM_COUNT } from '../lib/constants';
import { cardImageUrl } from '../lib/cardUrl';
import { CARD_PLATFORMS } from '../lib/badgeCard';

// Right-hand showcase: a slanted wall of real holographic creator cards
// drifting in columns, with one upright "focal" card floating in front.
// The wall is rotated in 3D, so it uses the markless card render (brand
// rules forbid rotating platform logos); the focal card stays upright and
// only bobs vertically, so it keeps its logo.
const WALL_COLUMNS = 4;
const PER_COLUMN = 6;
const COLUMN_SPEEDS = ['75s', '60s', '85s', '68s'];

function WallColumn({ creators, index }) {
  if (!creators.length) return null;
  const down = index % 2 === 1;
  return (
    <div
      className={`flex flex-col gap-5 w-[200px] flex-shrink-0 ${down ? 'auth-col-down' : 'auth-col-up'}`}
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
    getShowcaseCreators(8).then((data) => {
      const usable = (data || []).filter((c) => c.username && CARD_PLATFORMS[c.platform]);
      for (let i = usable.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [usable[i], usable[j]] = [usable[j], usable[i]];
      }
      if (usable.length) setCreators(usable);
    }).catch(() => {});
  }, []);

  // The first creator is the focal card; the next ones fill the wall.
  const focal = creators[0];
  const columns = useMemo(() => {
    const cols = Array.from({ length: WALL_COLUMNS }, () => []);
    creators.slice(1, 1 + WALL_COLUMNS * PER_COLUMN).forEach((c, i) => cols[i % WALL_COLUMNS].push(c));
    return cols;
  }, [creators]);

  return (
    <>
      <SEO
        title={mode === 'signup' ? 'Sign Up' : 'Sign In'}
        description="Sign in to ShinyPull to follow creators, build a personal dashboard, and save comparisons across eight platforms."
        noindex
      />

      <div className="min-h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-2 bg-white">
        {/* Left — the form */}
        <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
          <div className="w-full max-w-sm mx-auto">
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

        {/* Right — holographic card showcase (desktop only) */}
        <div className="relative hidden lg:block overflow-hidden bg-[#0a0a0f] isolate">
          <div aria-hidden="true" className="absolute inset-0 hero-dot-grid pointer-events-none" />

          {/* The slanted, drifting card wall. */}
          <div aria-hidden="true" className="absolute inset-0 [perspective:1600px] pointer-events-none">
            <div
              className="absolute left-1/2 top-1/2 flex gap-5 opacity-70"
              style={{ transform: 'translate(-50%, -50%) rotateX(22deg) rotateY(-16deg) rotateZ(-10deg)', transformStyle: 'preserve-3d' }}
            >
              {columns.map((col, i) => (
                <div key={i} style={{ marginTop: `${(i % 2) * -140}px` }}>
                  <WallColumn creators={col} index={i} />
                </div>
              ))}
            </div>
          </div>

          {/* Scrims: dark edges so the wall melts into the panel and the copy stays legible. */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 60% at 60% 55%, transparent 0%, rgba(10,10,15,0.55) 70%, #0a0a0f 100%)' }} />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-72 pointer-events-none bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/85 to-transparent" />

          {/* Focal card: upright, floating, with its platform logo. */}
          {focal && (
            <div className="absolute right-[12%] top-[14%] [@media(max-height:760px)]:top-[8%] auth-float" aria-hidden="true">
              <div className="absolute -inset-10 rounded-full blur-3xl opacity-50 pointer-events-none" style={{ backgroundColor: CARD_PLATFORMS[focal.platform]?.color || '#a855f7' }} />
              <img
                src={cardImageUrl(focal.platform, focal.username)}
                alt=""
                width="250"
                height="350"
                draggable="false"
                className="relative w-[230px] xl:w-[250px] [@media(max-height:760px)]:w-[180px] h-auto select-none rounded-2xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]"
              />
            </div>
          )}

          <div className="absolute left-10 right-10 bottom-10 z-10 xl:left-14 xl:bottom-14">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">Live across {PLATFORM_COUNT} platforms</p>
            <p className="mt-3 text-3xl xl:text-4xl font-extrabold text-white leading-[1.1] tracking-tight max-w-md text-balance">
              Every creator has a card. Follow the ones you care about.
            </p>
            <p className="mt-3 text-sm text-white/55 max-w-sm">
              Live counts, growth and rank for 50,000+ creators, updated every day.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
