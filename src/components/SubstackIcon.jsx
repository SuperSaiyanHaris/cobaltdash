/**
 * Substack logo — the three stacked horizontal bars mark.
 * Forwards style + props so callers can set color via inline style.
 * Same pattern as KickIcon, BlueskyIcon, TikTokIcon, MastodonIcon, RumbleIcon.
 */
export default function SubstackIcon({ className, style, ...rest }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...rest}
    >
      <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812H22.54V24l-10.54-5.91L1.46 24V10.812zM22.539 0H1.46v2.836h21.08V0z" />
    </svg>
  );
}
