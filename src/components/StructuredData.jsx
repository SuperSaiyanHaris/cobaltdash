import { useEffect } from 'react';

/**
 * StructuredData component for adding JSON-LD schema markup
 * This helps search engines understand the content better
 * 
 * @param {Object} schema - JSON-LD schema object
 */
export default function StructuredData({ schema }) {
  useEffect(() => {
    if (!schema) return;

    // Keyed by @type so a page rendering multiple <StructuredData> instances
    // (e.g. BlogPosting + BreadcrumbList on a blog post) gets one script tag
    // each, instead of every instance sharing the first untyped
    // script[type="application/ld+json"] it finds and overwriting it.
    const schemaType = schema['@type'] || 'default';
    const selector = `script[type="application/ld+json"][data-schema-type="${schemaType}"]`;
    let scriptTag = document.querySelector(selector);

    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.type = 'application/ld+json';
      scriptTag.setAttribute('data-schema-type', schemaType);
      document.head.appendChild(scriptTag);
    }

    // Add the schema
    scriptTag.textContent = JSON.stringify(schema);

    // Cleanup
    return () => {
      if (scriptTag && scriptTag.parentNode) {
        scriptTag.parentNode.removeChild(scriptTag);
      }
    };
  }, [schema]);

  return null; // This component doesn't render anything
}

/**
 * Helper functions to generate common schema types
 */

export function createBlogPostingSchema({ title, description, image, datePublished, dateModified, author, category, url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: description,
    image: image,
    datePublished: datePublished,
    dateModified: dateModified || datePublished,
    author: {
      '@type': 'Person',
      name: author || 'ShinyPull',
      url: 'https://shinypull.com/about'
    },
    publisher: {
      '@type': 'Organization',
      name: 'ShinyPull',
      url: 'https://shinypull.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://shinypull.com/logo.png'
      }
    },
    articleSection: category,
    url: url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url
    }
  };
}

export function createProductSchema({ name, description, image, price, brand, url, sku }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: name,
    description: description,
    image: image,
    brand: {
      '@type': 'Brand',
      name: brand || 'Various'
    },
    offers: {
      '@type': 'Offer',
      url: url,
      priceCurrency: 'USD',
      price: price,
      availability: 'https://schema.org/InStock'
    },
    ...(sku && { sku: sku })
  };
}

export function createPersonSchema({ name, description, image, jobTitle, sameAs }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: name,
    description: description,
    image: image,
    jobTitle: jobTitle,
    ...(sameAs && { sameAs: sameAs }) // Array of social media URLs
  };
}

export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ShinyPull',
    url: 'https://shinypull.com',
    logo: 'https://shinypull.com/logo.png',
    description: 'Track and compare social media creator stats across YouTube, Twitch, TikTok and more.',
    sameAs: [
      'https://twitter.com/shinypull',
      'https://facebook.com/shinypull'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      email: 'support@shinypull.com'
    }
  };
}

export function createBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}
