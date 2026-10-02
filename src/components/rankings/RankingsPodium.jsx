import { Link } from 'react-router-dom';
import CardImage from '../CardImage';

// Top 3 of a rankings page as upright holographic cards. The cards stand
// upright and unfaded, so they carry their platform logo (brand rules only
// forbid rotated or faded logos).
//
// From `sm` up: a podium, #2 left, #1 raised in the middle, #3 right, each on
// a plinth. On phones three cards across would be ~100px wide, with the name
// and count too small to read, so #1 gets the whole top row at a readable size
// and #2 and #3 share the row below.
const ORDER = [1, 0, 2]; // render #2, #1, #3
const PLINTH = ['h-14 sm:h-20', 'h-9 sm:h-12', 'h-6 sm:h-8'];

export default function RankingsPodium({ creators }) {
  const top = (creators || []).slice(0, 3);
  if (top.length < 3) return null;

  return (
    <div className="mt-6 sm:mt-10 grid grid-cols-2 sm:grid-cols-3 items-end gap-x-3 gap-y-5 sm:gap-6 max-w-3xl mx-auto">
      {ORDER.map((i) => {
        const c = top[i];
        const first = i === 0;
        return (
          <Link
            key={c.id || c.username}
            to={`/${c.platform}/${c.username}`}
            className={`group flex flex-col items-center ${first ? 'col-span-2 sm:col-span-1 order-first sm:order-none' : ''}`}
            aria-label={`#${i + 1} ${c.display_name}`}
          >
            <span className={`sm:hidden mb-2 text-sm font-black tabular-nums ${first ? 'text-amber-300' : 'text-white/60'}`}>#{i + 1}</span>
            <CardImage
              platform={c.platform}
              username={c.username}
              tier="legendary"
              loading="eager"
              fetchPriority={first ? 'high' : undefined}
              className={`shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] ${first ? 'w-[210px] sm:w-[230px]' : 'w-full max-w-[168px] sm:w-[190px] sm:max-w-none'}`}
            />
            <div className={`hidden sm:flex mt-4 w-full ${PLINTH[i]} rounded-t-xl bg-gradient-to-b from-white/[0.09] to-transparent border-t border-x border-white/10 items-start justify-center pt-2 text-sm font-black tabular-nums ${first ? 'text-amber-300' : 'text-white/55'}`}>
              #{i + 1}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
