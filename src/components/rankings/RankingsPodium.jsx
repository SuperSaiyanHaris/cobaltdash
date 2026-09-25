import { Link } from 'react-router-dom';
import { cardImageUrl } from '../../lib/cardUrl';

// Top 3 of a rankings page as upright holographic cards on a podium:
// #2 left, #1 raised in the middle with a glow, #3 right. The cards stand
// upright and unfaded, so they carry their platform logo (brand rules only
// forbid rotated or faded logos).
const ORDER = [1, 0, 2]; // render #2, #1, #3
const PLINTH = ['h-14 sm:h-20', 'h-9 sm:h-12', 'h-6 sm:h-8'];

export default function RankingsPodium({ creators }) {
  const top = (creators || []).slice(0, 3);
  if (top.length < 3) return null;

  return (
    <div className="mt-8 sm:mt-10 grid grid-cols-3 items-end gap-3 sm:gap-6 max-w-3xl mx-auto">
      {ORDER.map((i) => {
        const c = top[i];
        const first = i === 0;
        return (
          <Link
            key={c.id || c.username}
            to={`/${c.platform}/${c.username}`}
            className="group flex flex-col items-center"
            aria-label={`#${i + 1} ${c.display_name}`}
          >
            <div className="relative">
              <img
                src={cardImageUrl(c.platform, c.username)}
                alt=""
                width="250"
                height="350"
                draggable="false"
                className={`relative h-auto select-none rounded-[6.4%/4.571%] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:-translate-y-1.5 ${first ? 'w-[118px] sm:w-[230px]' : 'w-[96px] sm:w-[190px]'}`}
              />
            </div>
            <div className={`mt-3 sm:mt-4 w-full ${PLINTH[i]} rounded-t-xl bg-gradient-to-b from-white/[0.09] to-transparent border-t border-x border-white/10 flex items-start justify-center pt-1.5 sm:pt-2 text-xs sm:text-sm font-black tabular-nums ${first ? 'text-amber-300' : 'text-white/55'}`}>
              #{i + 1}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
