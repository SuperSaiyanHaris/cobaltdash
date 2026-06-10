import { useState, useMemo } from 'react';

/**
 * CreatorAvatar — robust avatar with fallback chain:
 *   1. Try the provided image URL
 *   2. On error, try the Supabase image proxy (sometimes YouTube blocks hotlinks)
 *   3. Final fallback: render colored initials based on the display name
 *
 * Fixes the "gray circle" problem on rankings where YouTube thumbnails fail to load
 * for big channels (MrBeast, Cocomelon, etc.) due to referrer-based blocking.
 */

const GRADIENTS = [
  'from-indigo-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-cyan-600',
  'from-violet-500 to-fuchsia-600',
  'from-red-500 to-pink-600',
  'from-blue-500 to-indigo-600',
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
  xs: { box: 'w-7 h-7', text: 'text-[10px]' },
  sm: { box: 'w-8 h-8', text: 'text-xs' },
  md: { box: 'w-10 h-10', text: 'text-sm' },
  lg: { box: 'w-12 h-12', text: 'text-base' },
  xl: { box: 'w-16 h-16', text: 'text-lg' },
  '2xl': { box: 'w-24 h-24', text: 'text-2xl' },
  '3xl': { box: 'w-32 h-32', text: 'text-3xl' },
};

// CDN hosts that sometimes block hotlinks based on referer. We retry these through our proxy.
const PROXY_HOSTS = new Set([
  'yt3.googleusercontent.com',
  'yt3.ggpht.com',
  'lh3.googleusercontent.com',
  'i.ytimg.com',
  'p16-sign-va.tiktokcdn.com',
  'p16-sign-sg.tiktokcdn.com',
  'p77-sign-va.tiktokcdn.com',
  'p77-sign-sg.tiktokcdn.com',
]);

function shouldRetryViaProxy(src) {
  if (!src) return false;
  try { return PROXY_HOSTS.has(new URL(src).hostname); }
  catch { return false; }
}

export default function CreatorAvatar({
  src,
  alt,
  name,
  size = 'md',
  rounded = 'rounded-full',
  className = '',
  loading = 'lazy',
}) {
  // 0 = original src, 1 = proxied src, 2 = give up and show initials
  const [errorStage, setErrorStage] = useState(0);
  const sizeClasses = SIZES[size] || SIZES.md;

  const gradient = useMemo(() => {
    const idx = hashString(name || alt || '') % GRADIENTS.length;
    return GRADIENTS[idx];
  }, [name, alt]);

  const initials = useMemo(() => getInitials(name || alt), [name, alt]);

  // Pick which URL to render based on current stage
  let currentSrc = null;
  if (src && errorStage === 0) {
    currentSrc = src;
  } else if (src && errorStage === 1 && shouldRetryViaProxy(src)) {
    currentSrc = `/api/image-proxy?url=${encodeURIComponent(src)}`;
  }

  // No src, gave up, or initial src wasn't proxyable
  if (!currentSrc) {
    return (
      <div
        role="img"
        className={`${sizeClasses.box} ${rounded} bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 ${className}`}
        aria-label={alt || name}
      >
        <span className={`${sizeClasses.text} font-bold text-white`}>{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt || name || ''}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setErrorStage((s) => s + 1)}
      className={`${sizeClasses.box} ${rounded} object-cover bg-gray-800 flex-shrink-0 ${className}`}
    />
  );
}
