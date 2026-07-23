/**
 * Mastodon mascot/logo icon — official "M" mark from joinmastodon.org.
 * Color hardcoded to Mastodon's verified official purple (#6364FF, Pantone
 * 2715 C per their brand toolkit) instead of `currentColor` — the site's
 * previous `violet-500`/`violet-600` Tailwind tints were approximations, not
 * the real brand hex. className/style only control size.
 */
export default function MastodonIcon({ className, style, ...rest }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="#6364FF"
      {...rest}
    >
      <path d="M23.193 7.879c0-5.206-3.411-6.732-3.411-6.732C18.062.357 15.108.025 12.041 0h-.076c-3.068.025-6.02.357-7.74 1.147 0 0-3.412 1.526-3.412 6.732 0 1.192-.023 2.618.015 4.129.124 5.092.934 10.11 5.641 11.355 2.17.574 4.034.695 5.535.612 2.722-.151 4.25-.972 4.25-.972l-.09-1.975s-1.945.613-4.129.539c-2.165-.074-4.449-.233-4.799-2.891a5.499 5.499 0 0 1-.048-.745s2.125.52 4.817.643c1.646.075 3.19-.097 4.758-.283 3.007-.359 5.625-2.212 5.954-3.905.52-2.666.476-6.507.476-6.507zm-4.024 6.709h-2.497V8.469c0-1.29-.543-1.944-1.628-1.944-1.2 0-1.802.776-1.802 2.312v3.349h-2.484v-3.35c0-1.536-.602-2.31-1.802-2.31-1.085 0-1.628.653-1.628 1.943v6.119H4.831V8.285c0-1.29.328-2.314.987-3.07.68-.758 1.569-1.146 2.674-1.146 1.278 0 2.246.491 2.886 1.474L12 6.585l.622-1.043c.64-.982 1.608-1.474 2.886-1.474 1.104 0 1.994.389 2.674 1.146.658.756.986 1.781.986 3.07v6.304z" />
    </svg>
  );
}
