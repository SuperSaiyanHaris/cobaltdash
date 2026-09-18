import { useId } from 'react';

// Renders a 1.0-5.0 rating (half-star steps) as 5 SVG stars. Half-fills use
// a linear gradient split at 50%, not a clipped half-icon, so the star
// outline stays crisp at any size. Each star pops in staggered on mount; a
// perfect 5.0 gets one extra light-sweep pass across the row (same visual
// language as Header.jsx's .sp-hint-sweep, not a new effect).
const STAR_PATH = 'M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.9-6.2 3.9 1.6-7L1.9 9.8l7.1-.7L12 2.5z';

function Star({ fill, size, delay, gradientId }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-star-pop"
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden="true"
    >
      {fill === 0.5 && (
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#e5e5e0" />
          </linearGradient>
        </defs>
      )}
      <path
        d={STAR_PATH}
        fill={fill === 1 ? '#f59e0b' : fill === 0.5 ? `url(#${gradientId})` : '#e5e5e0'}
        stroke={fill > 0 ? '#d97706' : '#d4d4d4'}
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * stars: 1.0-5.0 in 0.5 steps, from creator_grades.stars. Renders nothing
 * for null/undefined — a creator with no grade yet gets no stars shown,
 * never a fabricated rating.
 */
export default function StarRating({ stars, size = 18, showValue = true, className = '' }) {
  const uid = useId();
  if (stars === null || stars === undefined) return null;

  const isPerfect = stars === 5;

  return (
    <span
      title={`${stars.toFixed(1)} of 5 growth stars: how this creator's recent momentum and standing compare to peers. Recomputed weekly. See Methodology for the formula.`}
      className={`relative inline-flex items-center gap-1 ${className}`}
    >
      <span className="relative inline-flex items-center overflow-hidden">
        <span className="inline-flex items-center gap-[1px]">
          {[0, 1, 2, 3, 4].map((i) => {
            const remaining = stars - i;
            const fill = remaining >= 1 ? 1 : remaining >= 0.5 ? 0.5 : 0;
            return (
              <Star key={i} fill={fill} size={size} delay={i * 70} gradientId={`${uid}-star-${i}`} />
            );
          })}
        </span>
        {isPerfect && (
          <span
            aria-hidden="true"
            className="star-sweep pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-transparent via-white/80 to-transparent"
          />
        )}
      </span>
      {showValue && (
        <span className="text-xs sm:text-sm font-semibold text-neutral-700 tabular-nums ml-0.5">
          {stars.toFixed(1)}
        </span>
      )}
    </span>
  );
}
