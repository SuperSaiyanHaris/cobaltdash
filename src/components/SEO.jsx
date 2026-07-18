import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_OG_IMAGE, getSiteUrl } from '../lib/config';

export default function SEO({
  title,
  description,
  keywords,
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  article = null, // { publishedTime, modifiedTime, author, section }
  noindex = false,
}) {
  const location = useLocation();
  const url = getSiteUrl(location.pathname);
  
  const fullTitle = title ? `${title} | ShinyPull` : 'ShinyPull - Social Media Analytics & Statistics';
  const defaultDescription = 'Track YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, and Music creator statistics. View subscriber counts, follower growth, rankings, and analytics updated daily.';
  const metaDescription = description || defaultDescription;
  
  // useLayoutEffect (not useEffect) so document.title updates in the same
  // paint cycle as the new page's content, instead of one tick later. That
  // gap is exactly what let a previous page's title flash/stick in the
  // browser tab during client-side navigation before this fix.
  useLayoutEffect(() => {
    // Update title
    document.title = fullTitle;
    
    // Update or create meta tags
    const updateMetaTag = (property, content, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let element = document.querySelector(`meta[${attribute}="${property}"]`);
      
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, property);
        document.head.appendChild(element);
      }
      
      element.setAttribute('content', content);
    };
    
    // Standard meta tags
    updateMetaTag('description', metaDescription);
    if (keywords) updateMetaTag('keywords', keywords);
    
    // Open Graph tags
    updateMetaTag('og:title', fullTitle, true);
    updateMetaTag('og:description', metaDescription, true);
    updateMetaTag('og:url', url, true);
    updateMetaTag('og:type', type, true);
    updateMetaTag('og:image', image, true);
    updateMetaTag('og:site_name', 'ShinyPull', true);
    
    // Twitter Card tags
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:title', fullTitle);
    updateMetaTag('twitter:description', metaDescription);
    updateMetaTag('twitter:image', image);
    
    // Article-specific tags (for blog posts)
    if (article) {
      updateMetaTag('article:published_time', article.publishedTime, true);
      if (article.modifiedTime) {
        updateMetaTag('article:modified_time', article.modifiedTime, true);
      }
      if (article.author) {
        updateMetaTag('article:author', article.author, true);
      }
      if (article.section) {
        updateMetaTag('article:section', article.section, true);
      }
    }
    
    // Additional SEO tags
    updateMetaTag('robots', noindex ? 'noindex, follow' : 'index, follow');
    updateMetaTag('author', 'ShinyPull');
    
    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
    
  }, [fullTitle, metaDescription, keywords, url, image, type, article, noindex]);
  
  return null;
}
