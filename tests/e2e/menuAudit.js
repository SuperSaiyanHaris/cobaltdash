// Opens every dropdown, filter and menu button on the current page and checks
// the panel it opens is really usable: on screen, not clipped by a parent's
// overflow, not covered by another element, and its first option can be hit.
// Runs inside the page (page.evaluate), so it only uses browser APIs.
// Added after the Rankings platform filter opened an invisible list on phones
// (2026-10-04): the dark band around it had overflow-hidden.
export async function auditMenus() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.id || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const TRIGGERS = '[aria-haspopup],[aria-expanded],button:has(svg.lucide-chevron-down),button:has(svg.lucide-chevrons-up-down)';
  const POPUPS = '[role=menu],[role=listbox],[role=dialog]';
  const triggers = [...document.querySelectorAll(TRIGGERS)].filter(vis);
  const seen = new Set();
  const out = [];
  for (const t of triggers) {
    const key = `${label(t)}|${Math.round(t.getBoundingClientRect().top + scrollY)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (t.getAttribute('aria-expanded') === 'true' || t.closest('details')) continue;
    t.scrollIntoView({ block: 'center' });
    await wait(150);
    const before = new Set([...document.querySelectorAll('body *')].filter(vis));
    t.click();
    await wait(400);
    let pops = [...document.querySelectorAll(POPUPS)].filter(vis);
    if (!pops.length) {
      pops = [...document.querySelectorAll('body *')].filter((e) => vis(e) && !before.has(e)
        && ['absolute', 'fixed'].includes(getComputedStyle(e).position) && e.querySelectorAll('button,a,[role=option]').length >= 2);
      pops = pops.filter((p) => !pops.some((q) => q !== p && q.contains(p)));
    }
    if (!pops.length) {
      // A chevron that opened nothing visible (a plain toggle) is fine; only a
      // trigger that says it opens a popup must show one.
      if (t.hasAttribute('aria-haspopup')) out.push({ trigger: label(t), problems: ['aria-haspopup but nothing opened'] });
      continue;
    }
    for (const p of pops.slice(0, 2)) {
      const r = p.getBoundingClientRect();
      const vw = innerWidth; const vh = innerHeight;
      const inView = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      let hit = 0; let tot = 0;
      for (let fx = 0.1; fx <= 0.9; fx += 0.4) {
        for (let fy = 0.08; fy <= 0.92; fy += 0.28) {
          const x = r.left + r.width * fx; const y = r.top + r.height * fy;
          if (x < 0 || y < 0 || x > vw || y > vh) continue;
          tot++;
          const el = document.elementFromPoint(x, y);
          if (el && (p.contains(el) || el.contains(p))) hit++;
        }
      }
      const items = [...p.querySelectorAll('button,a,[role=option],[role=menuitem]')].filter(vis);
      let itemOk = true;
      if (items[0]) { const ir = items[0].getBoundingClientRect(); const el = document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2); itemOk = !!el && p.contains(el); }
      const problems = [];
      if (inView / (r.width * r.height || 1) < 0.9 && r.height < vh * 0.95) problems.push(`off screen (${Math.round((inView / (r.width * r.height || 1)) * 100)}% visible)`);
      if (tot && hit / tot < 0.85) problems.push(`clipped or covered (${hit}/${tot} points)`);
      if (!itemOk) problems.push('first option is not clickable');
      if (problems.length) out.push({ trigger: label(t), items: items.length, problems });
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (t.getAttribute('aria-expanded') === 'true') t.click();
    await wait(200);
  }
  return { checked: seen.size, failures: out };
}
