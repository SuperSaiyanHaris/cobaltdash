// Home page promo for ShinyPass. The art is a static, build-generated picture
// of the /pass screen (scripts/passPromo.mjs writes public/pass/promo-pass*.svg),
// so this section adds no pass code to the home page.
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, Sparkles, Ticket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const POINTS = [
  { Icon: Layers, text: 'A reward at all 99 levels, a pack every 10' },
  { Icon: Sparkles, text: 'Frames, stickers, titles and name effects for your card' },
  { Icon: Ticket, text: 'Any pack can hold a free month of a Featured Listing', paid: true },
];

export default function HomePassPromo() {
  const { user } = useAuth();
  return (
    <section className="border-t border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-600">ShinyPass · Season 1 · Free</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 text-balance">Start at Common. Finish Legendary.</h2>
          <p className="mt-3 text-[17px] text-neutral-700 max-w-lg text-pretty">
            Earn XP for what you already do here: checking rankings, following creators, joining the comments. Every level pays out, and every tenth opens a pack.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map(({ Icon, text, paid }) => (
              <li key={text} className="flex items-start gap-3 text-[15px] font-semibold text-neutral-800">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${paid ? 'bg-amber-400 text-neutral-950' : 'bg-neutral-900 text-white'}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
          <Link to="/pass" className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-700 text-white font-bold transition-colors">
            {user ? 'Open your ShinyPass' : 'Start your free ShinyPass'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
        <Link to="/pass" aria-label="See ShinyPass" className="block">
          <picture>
            <source media="(prefers-reduced-motion: reduce) and (max-width: 639px)" srcSet="/pass/promo-pass-m-still.svg" width="400" height="560" />
            <source media="(prefers-reduced-motion: reduce)" srcSet="/pass/promo-pass-still.svg" />
            <source media="(max-width: 639px)" srcSet="/pass/promo-pass-m.svg" width="400" height="560" />
            <img
              src="/pass/promo-pass.svg"
              width="760"
              height="540"
              loading="lazy"
              decoding="async"
              alt="A level 76 ShinyPass card with a holo frame, next to the season XP bar and track"
              className="w-full h-auto rounded-[28px] max-w-md mx-auto sm:max-w-none"
            />
          </picture>
        </Link>
      </div>
    </section>
  );
}
