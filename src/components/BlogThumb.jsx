// A blog cover thumbnail that never cuts a cover off.
//
// New covers are 16:9 and fill the frame. Older posts carry photos in every
// shape (3:2 landscapes, square avatars, 2:3 portraits), and a fixed 16:9
// frame with object-cover sliced those down to a strip, worst on phones. So:
//  - the image is requested at its own shape (width only, no server crop),
//  - landscape and 16:9 covers fill the frame, nudged to keep the upper part,
//  - portrait and square covers are shown whole, centered on a neutral ground,
//  - an image that fails to load shows a flat branded block, not a gap.
// The caller sets the frame's size (for example `aspect-[16/9]`).
import { useState } from 'react';
import { resizedBlogImageUrl } from '../lib/blogImageUrl';

// Below this width-to-height ratio (a 4:3 photo is 1.33) the cover is shown whole.
const WHOLE_BELOW = 1.3;

export default function BlogThumb({ src, alt = '', width = 800, className = '', imgClassName = '', priority = false }) {
  const [ratio, setRatio] = useState(null);
  const [failed, setFailed] = useState(false);
  const showWhole = ratio !== null && ratio < WHOLE_BELOW;

  return (
    <div className={`relative overflow-hidden bg-neutral-100 ${className}`}>
      {src && !failed ? (
        <img
          src={resizedBlogImageUrl(src, width)}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) setRatio(w / h);
          }}
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full ${showWhole ? 'object-contain' : 'object-cover object-[50%_30%]'} ${imgClassName}`}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[#0a0a0f]">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">ShinyPull</span>
        </div>
      )}
    </div>
  );
}
