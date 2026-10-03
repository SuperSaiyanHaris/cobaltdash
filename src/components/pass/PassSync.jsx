// Loads ShinyPass state once the app is idle for a signed-in user (the first
// load of the day also records the visit and streak), and turns XP gains
// into toasts. Renders nothing. It's in the entry bundle, so the rules and
// the toast library are imported only when a gain actually happens.
import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { loadProgress, refreshProgress, clearProgress, hydrateProgress } from '../../services/progressService';

// While the tab is open, check for XP that arrives without an action here
// (upvotes on your comments) and pay any level reached.
const CHECK_EVERY = 60000;

const ACTION_LABEL = { visit: 'Daily visit', upvote: 'Upvotes on your comments', follow: 'Followed a creator', compare: 'Saved a matchup', explore: 'Explored a creator' };

function describe(gained, { PACK_BY_LEVEL, itemName, RARITY_ORDER }) {
  const xp = gained.filter((g) => g.kind === 'xp');
  const out = [];
  if (xp.length) {
    const total = xp.reduce((s, g) => s + (g.xp || 0), 0);
    const streak = xp.find((g) => g.action === 'streak');
    const parts = xp.filter((g) => g.action !== 'streak').map((g) => g.label || ACTION_LABEL[g.action]).filter(Boolean);
    if (streak) parts.push(`${streak.streak}-day streak`);
    out.push({ title: total ? `+${total} XP` : 'XP earned', body: parts.join(' · ') });
  }
  // Many level rewards at once (a first visit, a big jump): one toast that
  // names the best two, not one toast each.
  const drops = gained.filter((g) => g.kind === 'drop');
  if (drops.length > 2) {
    const best = [...drops].sort((x, y) => RARITY_ORDER.indexOf(y.item.rarity) - RARITY_ORDER.indexOf(x.item.rarity)).slice(0, 2);
    out.push({ title: `${drops.length} rewards unlocked`, body: `Including ${best.map((g) => itemName(g.item)).join(' and ')}.`, link: true });
  }
  for (const g of gained) {
    if (g.kind === 'freeze-used') out.push({ title: 'Streak saved', body: `A Streak Freeze kept your ${g.streak}-day streak alive.` });
    if (g.kind === 'drop' && drops.length <= 2) out.push({ title: `Level ${g.level} unlocked`, body: itemName(g.item), link: true });
    if (g.kind === 'level') {
      const pack = PACK_BY_LEVEL[g.level];
      out.push(pack
        ? { title: `Level ${g.level}! Your ${pack.name} pack is ready`, body: 'Open it on ShinyPass.', link: true }
        : { title: `Level ${g.level}`, body: 'Your card leveled up.', link: true });
    }
  }
  return out;
}

export default function PassSync() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) { clearProgress(); return undefined; }
    hydrateProgress(userId);
    const t = setTimeout(() => { loadProgress().catch(() => {}); }, 400);
    const check = () => { if (document.visibilityState === 'visible') refreshProgress().catch(() => {}); };
    const every = setInterval(check, CHECK_EVERY);
    document.addEventListener('visibilitychange', check);
    return () => { clearTimeout(t); clearInterval(every); document.removeEventListener('visibilitychange', check); };
  }, [userId]);

  // Unmounted on sign-out (App only mounts this for a signed-in user).
  useEffect(() => () => clearProgress(), []);

  useEffect(() => {
    const onGain = (e) => {
      const gained = e.detail || [];
      if (!gained.length) return;
      Promise.all([import('sonner'), import('../../lib/shinyPass')]).then(([{ toast }, rules]) => {
        for (const m of describe(gained, rules)) {
          toast(m.title, {
            description: m.body,
            action: m.link ? { label: 'ShinyPass', onClick: () => { window.location.assign('/pass'); } } : undefined,
          });
        }
      }).catch(() => {});
    };
    window.addEventListener('shinypass:gain', onGain);
    return () => window.removeEventListener('shinypass:gain', onGain);
  }, []);

  return null;
}
