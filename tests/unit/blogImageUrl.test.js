// Cover resizing: width only keeps a cover's own shape (the old width plus
// height form cropped on the server and cut off portrait and square covers).
import { describe, it, expect } from 'vitest';
import { resizedBlogImageUrl } from '../../src/lib/blogImageUrl.js';

const SRC = 'https://abc.supabase.co/storage/v1/object/public/blog-images/cover-x.jpg';

describe('resizedBlogImageUrl', () => {
  it('width only: keeps the shape, no server-side crop', () => {
    const u = new URL(resizedBlogImageUrl(SRC, 800));
    expect(u.pathname).toContain('/storage/v1/render/image/public/blog-images/cover-x.jpg');
    expect(u.searchParams.get('width')).toBe('800');
    expect(u.searchParams.get('height')).toBeNull();
    // contain keeps the cover's shape; the default would crop to width x original height
    expect(u.searchParams.get('resize')).toBe('contain');
    expect(u.searchParams.get('quality')).toBe('75');
  });

  it('width and height still crops to that box when asked', () => {
    const u = new URL(resizedBlogImageUrl(SRC, 800, 450));
    expect(u.searchParams.get('height')).toBe('450');
    expect(u.searchParams.get('resize')).toBe('cover');
  });

  it('keeps an existing cache-busting query', () => {
    const u = new URL(resizedBlogImageUrl(SRC + '?v=123', 800));
    expect(u.searchParams.get('v')).toBe('123');
  });

  it('leaves other hosts and missing images alone', () => {
    expect(resizedBlogImageUrl('https://images.unsplash.com/photo-1?w=1200', 800)).toBe('https://images.unsplash.com/photo-1?w=1200');
    expect(resizedBlogImageUrl(null, 800)).toBeNull();
    expect(resizedBlogImageUrl(SRC, 0)).toBe(SRC);
  });
});
