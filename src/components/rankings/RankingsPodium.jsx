import { Link } from 'react-router-dom';
import CardImage from '../CardImage';

// Top 3 of a rankings page as upright holographic cards on a podium: #2 left,
// #1 raised in the middle, #3 right, each on a plinth. Desktop only. On a phone
// three cards across are ~100px wide and unreadable, and a stacked version
// pushed the real list down, so phones go straight to the list.
// The cards stand upright and unfaded, so they carry their platform logo
// (brand rules only forbid rotated or faded logos).
const ORDER = [1, 0, 2]; // render #2, #1, #3
const PLINTH = ['h-20', 'h-12', 'h-8'];

export default function RankingsPodium({ creators }) {
  const top = (creators || []).slice(0, 3);
  if (top.length < 3) return null;

  return (
    <div className="hidden sm:grid mt-10 grid-cols-3 items-end gap-6 max-w-3xl mx-auto">
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
            <CardImage
              platform={c.platform}
              username={c.username}
              tier="legendary"
              loading="eager"
              fetchPriority={first ? 'high' : undefined}
              className={`shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] ${first ? 'w-[230px]' : 'w-[190px]'}`}
            />
            <div className={`mt-4 w-full ${PLINTH[i]} rounded-t-xl bg-gradient-to-b from-white/[0.09] to-transparent border-t border-x border-white/10 flex items-start justify-center pt-2 text-sm font-black tabular-nums ${first ? 'text-amber-300' : 'text-white/55'}`}>
              #{i + 1}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
