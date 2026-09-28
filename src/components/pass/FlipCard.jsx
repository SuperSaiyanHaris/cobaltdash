import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { UserCardSvg } from './PassArt';
import { CardBackArt } from './RewardArt';

/**
 * A user card that flips to its equipped card back on tap, with a visible
 * "Flip" control underneath so people know the back exists.
 */
export default function FlipCard({ me, className = '', hintClassName = 'text-white/70 hover:text-white' }) {
  const [flipped, setFlipped] = useState(false);
  const back = me?.equipped?.back || 'carbon';
  const toggle = () => setFlipped((f) => !f);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-label={flipped ? 'Show the front of the card' : 'Flip the card to see its back'}
        className="relative block w-full [perspective:1200px]"
      >
        <span className="relative block [transform-style:preserve-3d] transition-transform duration-700 motion-reduce:transition-none" style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}>
          <span className="block [backface-visibility:hidden] shadow-[0_30px_50px_-20px_rgba(0,0,0,0.95)] rounded-[6.4%/4.571%]"><UserCardSvg me={me} /></span>
          <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"><CardBackArt k={back} className="w-full h-full" /></span>
        </span>
      </button>
      <button
        type="button"
        onClick={toggle}
        className={`mt-3 mx-auto flex items-center gap-1.5 text-xs font-semibold transition-colors ${hintClassName}`}
      >
        <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
        {flipped ? 'Show front' : 'Flip card'}
      </button>
    </div>
  );
}
