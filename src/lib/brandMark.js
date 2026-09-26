// The ShinyPull mark: three rising bars inside a foil-edged card, drawn in a
// 100x100 box. Pure string, no imports, so the share-image renderer, the
// brand-asset script and anything else can share one definition.
// `id` keeps gradient ids unique when the mark appears twice in a document.
export function markSvgInner(id = 'spm') {
  return `<defs><linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD76A"/><stop offset=".35" stop-color="#FFF3C4"/><stop offset=".6" stop-color="#C084FC"/><stop offset="1" stop-color="#5EC8FF"/></linearGradient></defs>
<rect x="20.5" y="6.5" width="59" height="87" rx="10" fill="#0a0a0f" stroke="url(#${id}f)" stroke-width="7"/>
<rect x="32" y="53" width="9" height="28" rx="3" fill="url(#${id}f)"/>
<rect x="45.5" y="39" width="9" height="42" rx="3" fill="url(#${id}f)"/>
<rect x="59" y="23" width="9" height="58" rx="3" fill="url(#${id}f)"/>`;
}
