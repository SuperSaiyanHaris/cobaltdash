// Holographic "Shiny Pull" trading card for a creator, rendered as a
// self-contained SVG (served by middleware.js at /card/:platform/:username).
// Pure: no fetches, so it's unit-tested directly. Everything user-controlled
// is escaped; the avatar must already be an inline data: URI (an SVG shown
// via <img> can't load external images), or null for an initials fallback.
//
// Rarity comes from the creator's real rank on their platform:
//   LEGENDARY top 10 or top 0.1% · EPIC top 1% · RARE top 10% · COMMON rest.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
const NOTE = '<path transform="translate(1 0)" d="M13 1v10.6A3.5 3.5 0 1 0 15 14.8V5.2l4 1.3V3.1L13 1Z"/>';

// glyph: SVG drawn in a ~16x16 box (fill set by the caller).
export const CARD_PLATFORMS = {
  youtube:  { name: 'YouTube', color: '#FF3B30', unit: 'subscribers', glyph: '<path transform="translate(0 2.5) scale(0.56)" d="M27.97 3.12A3.58 3.58 0 0 0 25.45.6C23.22 0 14.29 0 14.29 0S5.35 0 3.12.6A3.58 3.58 0 0 0 .6 3.12C0 5.35 0 10 0 10s0 4.65.6 6.88a3.58 3.58 0 0 0 2.52 2.52c2.23.6 11.17.6 11.17.6s8.93 0 11.16-.6a3.58 3.58 0 0 0 2.52-2.52c.6-2.23.6-6.88.6-6.88s0-4.65-.6-6.88Z"/><path transform="translate(0 2.5) scale(0.56)" fill="#fff" d="M11.43 14.29 18.85 10l-7.42-4.29v8.58Z"/>' },
  twitch:   { name: 'Twitch', color: '#A970FF', unit: 'followers', glyph: '<path transform="scale(0.66)" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>' },
  kick:     { name: 'Kick', color: '#53FC18', unit: 'paid subs', glyph: '<path transform="scale(0.66)" d="M2.87 1.5h6.85v4.57H12V3.78h2.28V1.5h6.85v6.85h-2.28v2.28h-2.28v2.74h2.28v2.28h2.28v6.85h-6.85v-2.28H12v-2.28H9.72v4.57H2.87v-21Z"/>' },
  tiktok:   { name: 'TikTok', color: '#FF2D6F', unit: 'followers', glyph: NOTE },
  bluesky:  { name: 'Bluesky', color: '#1185FE', unit: 'followers', glyph: '<path transform="translate(0 1.5) scale(0.05)" d="M69.364 19.146c36.687 27.806 76.147 84.186 90.636 114.439 14.489-30.253 53.948-86.633 90.636-114.439C277.107-.917 320-16.44 320 32.957c0 9.865-5.603 82.875-8.889 94.729-11.423 41.208-53.045 51.719-90.071 45.357 64.719 11.12 81.182 47.953 45.627 84.785-80 82.874-106.667-44.333-106.667-44.333s-26.667 127.207-106.667 44.333c-35.555-36.832-19.092-73.665 45.627-84.785-37.026 6.362-78.648-4.149-90.071-45.357C5.603 115.832 0 42.822 0 32.957 0-16.44 42.893-.917 69.364 19.147Z"/>' },
  mastodon: { name: 'Mastodon', color: '#8C8DFF', unit: 'followers', glyph: '<path transform="scale(0.66)" d="M23.193 7.879c0-5.206-3.411-6.732-3.411-6.732C18.062.357 15.108.025 12.041 0h-.076c-3.068.025-6.02.357-7.74 1.147 0 0-3.412 1.526-3.412 6.732 0 1.192-.023 2.618.015 4.129.124 5.092.934 10.11 5.641 11.355 2.17.574 4.034.695 5.535.612 2.722-.151 4.25-.972 4.25-.972l-.09-1.975s-1.945.613-4.129.539c-2.165-.074-4.449-.233-4.799-2.891a5.499 5.499 0 0 1-.048-.745s2.125.52 4.817.643c1.646.075 3.19-.097 4.758-.283 3.007-.359 5.625-2.212 5.954-3.905.52-2.666.476-6.507.476-6.507zm-4.024 6.709h-2.497V8.469c0-1.29-.543-1.944-1.628-1.944-1.2 0-1.802.776-1.802 2.312v3.349h-2.484v-3.35c0-1.536-.602-2.31-1.802-2.31-1.085 0-1.628.653-1.628 1.943v6.119H4.831V8.285c0-1.29.328-2.314.987-3.07.68-.758 1.569-1.146 2.674-1.146 1.278 0 2.246.491 2.886 1.474L12 6.585l.622-1.043c.64-.982 1.608-1.474 2.886-1.474 1.104 0 1.994.389 2.674 1.146.658.756.986 1.781.986 3.07v6.304z"/>' },
  music:    { name: 'Music', color: '#F59E0B', unit: 'monthly listeners', glyph: NOTE },
  substack: { name: 'Substack', color: '#FF6719', unit: 'subscribers', glyph: '<path transform="scale(0.66)" d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812H22.54V24l-10.54-5.91L1.46 24V10.812zM22.539 0H1.46v2.836h21.08V0z"/>' },
  rumble:   { name: 'Rumble', color: '#85C742', unit: 'followers', glyph: NOTE },
};

export const TIERS = {
  LEGENDARY: { name: 'LEGENDARY', a: '#FFD76A', b: '#FFF3C4', c: '#E0A526', d: '#FF9F43' },
  EPIC:      { name: 'EPIC',      a: '#C084FC', b: '#F3E8FF', c: '#9333EA', d: '#F472B6' },
  RARE:      { name: 'RARE',      a: '#5EC8FF', b: '#E0F2FE', c: '#0284C7', d: '#34D399' },
  COMMON:    { name: 'COMMON',    a: '#D4D4D8', b: '#FAFAFA', c: '#A1A1AA', d: '#E4E4E7' },
};

/** Rarity for a platform rank (1 = biggest). Unranked creators are COMMON. */
export function cardTier(rank, total) {
  if (!rank || !total) return TIERS.COMMON;
  const pct = rank / total;
  if (rank <= 10 || pct <= 0.001) return TIERS.LEGENDARY;
  if (pct <= 0.01) return TIERS.EPIC;
  if (pct <= 0.1) return TIERS.RARE;
  return TIERS.COMMON;
}

export function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function compactCount(n) {
  const v = Math.abs(Number(n) || 0);
  if (v < 10_000) return Math.round(v).toLocaleString('en-US');
  if (v < 1e6) return (v / 1e3).toFixed(v < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'K';
  if (v < 1e9) return (v / 1e6).toFixed(v < 1e8 ? 2 : 1).replace(/\.?0+$/, '') + 'M';
  return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
}

// Shorten to fit the card width (the name is centered at 18px bold).
function fit(s, max) {
  const str = String(s ?? '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * @param {object} c
 * @param {string} c.platform   key of CARD_PLATFORMS
 * @param {string} c.name       display name
 * @param {string} c.username
 * @param {number|null} c.count latest subscribers/followers
 * @param {number|null} c.delta30 change over ~30 days (null if unknown)
 * @param {number|null} c.rank  platform rank by subscribers
 * @param {number|null} c.total creators tracked on the platform
 * @param {string|null} c.avatar data: URI or null
 * @param {boolean} [c.showMark=true] draw the platform logo (off where the
 *   card is shown rotated/faded, which platform brand rules don't allow)
 */
export function renderCard(c) {
  const p = CARD_PLATFORMS[c.platform] || CARD_PLATFORMS.youtube;
  const t = cardTier(c.rank, c.total);
  const id = 'sp';
  const W = 250, H = 350;
  const name = fit(c.name || c.username, 20);
  const handle = fit(c.username, 22);
  const count = c.count ?? null;
  const hasDelta = typeof c.delta30 === 'number';
  const up = !hasDelta || c.delta30 >= 0;
  const cardNo = c.rank && c.total ? `${String(c.rank).padStart(3, '0')}/${c.total}` : 'UNRANKED';
  const initials = escapeXml((c.name || c.username || '?').trim().slice(0, 1).toUpperCase());
  const art = c.avatar && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(c.avatar)
    ? `<image href="${c.avatar}" x="${W / 2 - 50}" y="76" width="100" height="100" clip-path="url(#${id}av)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${W / 2}" cy="126" r="50" fill="${p.color}" fill-opacity=".25"/><text x="${W / 2}" y="142" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="800" fill="${t.b}">${initials}</text>`;
  const rankChip = c.rank ? `<g transform="translate(${W / 2 + 44} 178)"><rect x="-4" y="-2" width="${String(c.rank).length * 5.5 + 16}" height="15" rx="7.5" fill="#0B0B12" stroke="${t.a}" stroke-opacity=".7"/><text x="${(String(c.rank).length * 5.5 + 16) / 2 - 4}" y="9" text-anchor="middle" font-family="${FONT}" font-size="8" font-weight="800" fill="${t.a}">#${c.rank}</text></g>` : '';
  const label = `${escapeXml(c.name || c.username)}: ${count !== null ? compactCount(count) : 'no data'} ${p.unit} on ${p.name}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} (${t.name} card)">
<title>${label} · ${t.name} · ShinyPull</title>
<defs>
<linearGradient id="${id}foil" x1="0" y1="0" x2="1" y2="1" spreadMethod="reflect"><stop offset="0" stop-color="${t.a}"/><stop offset=".2" stop-color="${t.b}"/><stop offset=".38" stop-color="${t.d}"/><stop offset=".55" stop-color="${t.c}"/><stop offset=".72" stop-color="${t.b}"/><stop offset=".86" stop-color="${p.color}"/><stop offset="1" stop-color="${t.a}"/><animateTransform attributeName="gradientTransform" type="translate" values="-0.5 -0.5;0.5 0.5;-0.5 -0.5" dur="6s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="${id}num" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.b}"/><stop offset="1" stop-color="${t.a}"/></linearGradient>
<radialGradient id="${id}art" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${p.color}" stop-opacity=".55"/><stop offset=".6" stop-color="${t.c}" stop-opacity=".18"/><stop offset="1" stop-color="#0B0B12" stop-opacity="0"/></radialGradient>
<pattern id="${id}holo" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="10" fill="#fff" opacity=".05"/></pattern>
<linearGradient id="${id}shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="${id}clip"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<clipPath id="${id}av"><circle cx="${W / 2}" cy="126" r="50"/></clipPath>
</defs>
<g clip-path="url(#${id}clip)">
<rect width="${W}" height="${H}" fill="url(#${id}foil)"/>
<rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="11" fill="#0B0B12"/>
<rect x="18" y="18" width="${t.name.length * 8.4 + 32}" height="20" rx="10" fill="${t.a}" fill-opacity=".14" stroke="${t.a}" stroke-opacity=".6"/>
<path transform="translate(24 21.5) scale(.5)" d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6 5.6 21.1 7 14l-5.3-5 7.2-.9z" fill="${t.a}"/>
<text x="40" y="32.5" font-family="${FONT}" font-size="9.5" font-weight="800" letter-spacing="1.6" fill="${t.a}">${t.name}</text>
${c.showMark === false ? '' : `<g transform="translate(${W - 36} 20)" fill="${p.color}">${p.glyph}</g>`}
<rect x="18" y="48" width="${W - 36}" height="160" rx="10" fill="#12121A"/>
<rect x="18" y="48" width="${W - 36}" height="160" rx="10" fill="url(#${id}art)"/>
<rect x="18" y="48" width="${W - 36}" height="160" rx="10" fill="url(#${id}holo)"/>
<rect x="18.5" y="48.5" width="${W - 37}" height="159" rx="9.5" fill="none" stroke="url(#${id}foil)" stroke-opacity=".7"/>
<circle cx="${W / 2}" cy="126" r="56" fill="none" stroke="url(#${id}foil)" stroke-width="4"/>
${art}
${rankChip}
<text x="${W / 2}" y="232" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="800" fill="#FAFAFA">${escapeXml(name)}</text>
<text x="${W / 2}" y="247" text-anchor="middle" font-family="${FONT}" font-size="9.5" font-weight="600" letter-spacing=".6" fill="#7C7C88">@${escapeXml(handle)} · ${p.name}</text>
<text x="${W / 2}" y="284" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="900" letter-spacing="-1" fill="url(#${id}num)">${count !== null ? compactCount(count) : '—'}</text>
<text x="${W / 2}" y="298" text-anchor="middle" font-family="${FONT}" font-size="8.5" font-weight="800" letter-spacing="2.2" fill="#8B8B96">${escapeXml(p.unit.toUpperCase())}</text>
<line x1="22" y1="312" x2="${W - 22}" y2="312" stroke="#fff" stroke-opacity=".08"/>
${hasDelta ? `<text x="22" y="329" font-family="${FONT}" font-size="9.5" font-weight="700" fill="${up ? '#34D399' : '#F87171'}">${up ? '▲ +' : '▼ −'}${compactCount(c.delta30)} <tspan fill="#6B6B76" font-weight="600">30d</tspan></text>` : ''}
<text x="${W - 22}" y="329" text-anchor="end" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing="1.2" fill="#6B6B76">${cardNo} · SHINYPULL</text>
<rect x="-220" y="-60" width="90" height="${H + 120}" fill="url(#${id}shine)" transform="rotate(20)"><animate attributeName="x" values="-220;-220;420" keyTimes="0;.55;1" dur="4.5s" repeatCount="indefinite"/></rect>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="#fff" stroke-opacity=".25"/>
</svg>`;
}
