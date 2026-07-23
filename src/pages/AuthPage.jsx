import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Music } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthForm from '../components/AuthForm';
import CreatorAvatar from '../components/CreatorAvatar';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import RumbleIcon from '../components/RumbleIcon';
import SEO from '../components/SEO';
import { getShowcaseCreators } from '../services/creatorService';
import { formatNumber } from '../lib/utils';

const PLATFORM_ICONS = {
  youtube: YouTubeIcon, twitch: TwitchIcon, kick: KickIcon, tiktok: TikTokIcon,
  bluesky: BlueskyIcon, rumble: RumbleIcon, music: Music,
};
const PLATFORM_TINT = {
  youtube: '', twitch: '', kick: 'text-green-600',
  tiktok: 'text-pink-500', bluesky: 'text-sky-500', rumble: 'text-lime-600', music: 'text-amber-500',
};
const METRIC = {
  youtube: 'subscribers', twitch: 'followers', kick: 'paid subs', tiktok: 'followers',
  bluesky: 'followers', rumble: 'followers', music: 'monthly listeners',
};

function ShowcaseCard({ c }) {
  const Icon = PLATFORM_ICONS[c.platform] || YouTubeIcon;
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3 flex items-center gap-3 w-full">
      <CreatorAvatar
        src={c.profile_image}
        name={c.display_name}
        rounded="rounded-lg"
        className="!w-11 !h-11 flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${PLATFORM_TINT[c.platform] || 'text-neutral-400'}`} />
          <p className="text-sm font-semibold text-white truncate">{c.display_name}</p>
        </div>
        <p className="text-xs text-neutral-400 tabular-nums mt-0.5">
          {c.subscribers != null ? `${formatNumber(c.subscribers)} ${METRIC[c.platform] || 'followers'}` : c.platform}
        </p>
      </div>
    </div>
  );
}

// One vertically-drifting column. Cards are duplicated so the -50% loop is seamless.
function ShowcaseColumn({ creators, direction, className }) {
  if (!creators.length) return null;
  return (
    <div className={`flex flex-col gap-3 ${direction === 'down' ? 'auth-col-down' : 'auth-col-up'} ${className}`}>
      {[...creators, ...creators].map((c, i) => (
        <ShowcaseCard key={`${c.id}-${i}`} c={c} />
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
      if (data?.length) setCreators([...data].sort(() => Math.random() - 0.5));
    }).catch(() => {});
  }, []);

  // Split the shuffled creators into 3 columns.
  const columns = useMemo(() => {
    const cols = [[], [], []];
    creators.forEach((c, i) => cols[i % 3].push(c));
    return cols;
  }, [creators]);

  return (
    <>
      <SEO
        title={mode === 'signup' ? 'Sign Up' : 'Sign In'}
        description="Sign in to ShinyPull to follow creators, build a personal dashboard, and save comparisons across nine platforms."
        noindex
      />

      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#fafaf9]">
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

        {/* Right — live creator showcase (desktop only) */}
        <div className="relative hidden lg:block overflow-hidden bg-[#0a0a0f]">
          {/* soft brand glow, no blur on the cards themselves */}
          <div aria-hidden="true" className="absolute inset-0 opacity-60"
               style={{ background: 'radial-gradient(60% 50% at 80% 15%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(50% 50% at 15% 85%, rgba(217,70,239,0.15), transparent 60%)' }} />

          <div className="absolute top-10 left-10 right-10 z-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Live across 9 platforms</p>
            <p className="mt-2 text-2xl font-bold text-white leading-snug max-w-sm">The creators everyone is watching, updated every day.</p>
          </div>

          {/* three drifting columns, edge-faded top and bottom */}
          <div aria-hidden="true" className="absolute inset-0 flex gap-3 px-6 pt-2"
               style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)', maskImage: 'linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)' }}>
            <ShowcaseColumn creators={columns[0]} direction="up"   className="flex-1" />
            <ShowcaseColumn creators={columns[1]} direction="down" className="flex-1 mt-[-3rem]" />
            <ShowcaseColumn creators={columns[2]} direction="up"   className="flex-1 mt-[-6rem]" />
          </div>
        </div>
      </div>
    </>
  );
}
