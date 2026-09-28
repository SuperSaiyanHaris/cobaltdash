// Home page promo for ShinyPass. The pack art is a static, build-generated
// SVG (scripts/generateOgImages.mjs writes public/pass/promo-packs.svg), so
// this section adds no pack code to the home page.
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, Gem, Ticket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const POINTS = [
  { Icon: Layers, text: '99 levels with a reward at every one, and a pack every 10' },
  { Icon: Gem, text: 'The OG 2026 badge, only for accounts made this year' },
  { Icon: Ticket, text: 'Every pack has a chance at a free month of a Featured Listing', paid: true },
];

export default function HomePassPromo() {
  const { user } = useAuth();
  return (
    <section className="border-t border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-600">ShinyPass · Season 1 · Free</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 text-balance">Level up your own card.</h2>
          <p className="mt-3 text-[17px] text-neutral-700 max-w-lg text-pretty">
            Visit, follow creators and join the comments to earn XP. Your card climbs from Common to Legendary while you collect packs, sets and badges.
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
        <Link to="/pass" aria-label="See the ShinyPass packs" className="block">
          <img src="/pass/promo-packs.svg" alt="Three ShinyPass packs: Chrome, The Final Pull and Obsidian" width="720" height="520" loading="lazy" decoding="async" className="w-full max-w-lg mx-auto h-auto" />
        </Link>
      </div>
    </section>
  );
}
