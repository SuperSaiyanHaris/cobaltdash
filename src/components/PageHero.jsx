// Shared dark hero band for content pages: the same flat dark base + dot
// grid as the home, rankings and profile heroes (no glow, no colored wash).
// Sits above the content that follows (z-20) so dropdowns and panels opened
// from inside it are never covered by the next section.
//
//   <PageHero eyebrow="Trending" title="Who's growing fastest" subtitle="…" aside={<Cards/>}>
//     {actions or a search box}
//   </PageHero>

export default function PageHero({ eyebrow, title, subtitle, children, aside, center = false, compact = false, className = '' }) {
  return (
    <section className={`relative isolate z-20 bg-[#0a0a0f] text-white ${className}`}>
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />
      <div
        className={`relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 ${compact ? 'pt-10 pb-10 sm:pt-12 sm:pb-12' : 'pt-12 pb-12 sm:pt-16 sm:pb-16'} ${
          aside ? 'grid lg:grid-cols-[1.1fr,0.9fr] gap-10 lg:gap-12 items-center' : ''
        }`}
      >
        <div className={center ? 'text-center max-w-3xl mx-auto' : 'max-w-3xl'}>
          {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">{eyebrow}</p>}
          <h1 className={`mt-3 font-extrabold tracking-tight leading-[1.05] text-balance ${compact ? 'text-3xl sm:text-5xl' : 'text-4xl sm:text-5xl md:text-6xl'}`}>
            {title}
          </h1>
          {subtitle && (
            <p className={`mt-4 text-base sm:text-lg text-white/75 leading-relaxed text-pretty ${center ? 'mx-auto max-w-2xl' : 'max-w-2xl'}`}>{subtitle}</p>
          )}
          {children && <div className="mt-7">{children}</div>}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>
    </section>
  );
}
