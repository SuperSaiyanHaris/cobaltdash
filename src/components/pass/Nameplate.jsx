// A commenter's name as it appears in comments: plain, colored by a name
// effect, set on a flair plate, or both (a name effect keeps its dark plate
// so the foil text stays readable, and the flair becomes the plate's edge).
import { Link } from 'react-router-dom';
import { NAME_EFFECTS, FLAIRS } from '../../lib/shinyPass';

export default function Nameplate({ name, nameKey, flairKey, to, className = 'text-sm' }) {
  const n = nameKey && NAME_EFFECTS[nameKey];
  const f = flairKey && FLAIRS[flairKey];
  if (!n && !f) {
    return to
      ? <Link to={to} className={`${className} font-semibold text-neutral-900 hover:underline`}>{name}</Link>
      : <span className={`${className} font-semibold text-neutral-900`}>{name}</span>;
  }
  const plate = n
    ? { background: '#0a0a0f', border: f ? `2px solid ${f.edge}` : '1px solid transparent' }
    : { background: f.bg, color: f.fg, border: `1px solid ${f.edge}` };
  const inner = n
    ? <span className={`sp-name-fx ${className} font-bold`} style={{ backgroundImage: `linear-gradient(100deg, ${n.stops[0]}, ${n.stops[1]} 50%, ${n.stops[2]})` }}>{name}</span>
    : <span className={`${className} font-bold`}>{name}</span>;
  const cls = `inline-flex items-center rounded-md px-1.5 py-[1px] ${!n && f?.anim ? 'sp-flair-anim' : ''}`;
  return to
    ? <Link to={to} className={`${cls} hover:opacity-90`} style={plate}>{inner}</Link>
    : <span className={cls} style={plate}>{inner}</span>;
}
