import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import SEO from '../components/SEO';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';

// Creator card maker. The card itself is an SVG rendered at the edge
// (middleware.js -> src/lib/badgeCard.js) at /card/:platform/:username; the
// compact /badge/... image still works for older embeds. Every embed links
// back to the creator's ShinyPull profile, so each one is a backlink.
const PLATFORMS = ['youtube', 'twitch', 'kick', 'tiktok', 'bluesky', 'mastodon', 'music', 'substack'];
const EXAMPLES = [['youtube', 'mrbeast'], ['twitch', 'caedrel'], ['kick', 'xqc']];
const RARITIES = [
  ['Legendary', 'Top 10 on the platform, or the top 0.1%', 'from-amber-300 via-yellow-100 to-orange-400'],
  ['Epic', 'Top 1%', 'from-fuchsia-400 via-purple-200 to-violet-500'],
  ['Rare', 'Top 10%', 'from-sky-400 via-cyan-100 to-emerald-400'],
  ['Common', 'Everyone else, for now', 'from-zinc-300 via-white to-zinc-400'],
];
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500';

function codesFor(platform, username) {
  const u = encodeURIComponent(username.trim().replace(/^@/, ''));
  const img = `https://shinypull.com/card/${platform}/${u}`;
  const link = `https://shinypull.com/${platform}/${u}?utm_source=card`;
  const alt = `${username.trim()} ${PLATFORM_DISPLAY_NAMES[platform] || platform} card on ShinyPull`;
  return {
    img,
    html: `<a href="${link}"><img src="${img}" width="250" height="350" alt="${alt.replace(/"/g, '&quot;')}"></a>`,
    markdown: `[![${alt}](${img})](${link})`,
    compact: `<a href="${link}"><img src="https://shinypull.com/badge/${platform}/${u}" width="240" height="64" alt="${alt.replace(/"/g, '&quot;')}"></a>`,
  };
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className={MICRO}>{label}</p>
      <div className="flex gap-2 mt-1.5">
        <input readOnly value={value} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-mono text-neutral-700" />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); toast.success(`${label} copied`); setTimeout(() => setCopied(false), 2000); })}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function BadgePage() {
  const [platform, setPlatform] = useState('youtube');
  const [username, setUsername] = useState('');
  const [pulled, setPulled] = useState(null);
  const codes = pulled ? codesFor(pulled.platform, pulled.username) : null;

  const submit = (e) => {
    e.preventDefault();
    const u = username.trim().replace(/^@/, '');
    if (u) setPulled({ platform, username: u });
  };

  return (
    <>
      <SEO
        title="Get Your Holographic Creator Card: Live Stats Card for Creators"
        description="Pull your free holographic ShinyPull card: your live follower count, 30-day growth and platform rank, with Legendary, Epic, Rare or Common rarity. Embed it on your site, stream panels or GitHub."
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <p className={MICRO}>Creator cards</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mt-3 tracking-tight text-balance">Pull your creator card</h1>
        <p className="text-[15px] leading-relaxed text-neutral-700 mt-4 max-w-2xl text-pretty">
          Every creator we track has a holographic card with their live count, 30-day growth and rank. Its rarity comes from
          where they really stand on their platform. Grab yours for your website, stream panels, Linktree, GitHub or media kit.
          It updates itself every day.
        </p>

        <div className="rounded-2xl bg-[#111117] p-5 sm:p-8 mt-8 flex flex-wrap justify-center gap-5">
          {EXAMPLES.map(([p, u]) => (
            <Link key={p} to={`/${p}/${u}`} className="transition-transform hover:-translate-y-1">
              <img src={`/card/${p}/${u}`} width="250" height="350" alt={`${u} ${PLATFORM_DISPLAY_NAMES[p]} creator card`} loading="lazy" />
            </Link>
          ))}
        </div>

        <div className="grid sm:grid-cols-4 gap-3 mt-6">
          {RARITIES.map(([name, rule, grad]) => (
            <div key={name} className={`${CARD} p-3.5`}>
              <div className={`h-1.5 w-12 rounded-full bg-gradient-to-r ${grad}`} />
              <p className="text-sm font-semibold text-neutral-900 mt-2.5">{name}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{rule}</p>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className={`${CARD} p-5 sm:p-6 mt-8`}>
          <p className={MICRO}>Pull a card</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform" className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm bg-white">
              {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_DISPLAY_NAMES[p] || p}</option>)}
            </select>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your username or handle"
              aria-label="Username"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <button type="submit" className="rounded-lg bg-neutral-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-neutral-800">Pull my card</button>
          </div>

          {codes && (
            <div className="mt-6 grid md:grid-cols-[250px,1fr] gap-6 items-start">
              <div className="rounded-xl bg-[#111117] p-3 w-fit">
                <img key={codes.img} src={codes.img} width="250" height="350" alt="Your card preview" />
              </div>
              <div className="space-y-4 min-w-0">
                <CopyField label="HTML" value={codes.html} />
                <CopyField label="Markdown (GitHub, Notion)" value={codes.markdown} />
                <CopyField label="Image link" value={codes.img} />
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Not showing your card? We don&apos;t track that account yet.{' '}
                  <Link to={`/${pulled.platform}/${encodeURIComponent(pulled.username)}`} className="underline hover:text-neutral-800">Open its profile</Link> to add it, and the card fills in after the next daily update.
                </p>
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer hover:text-neutral-800">Need something smaller? Compact badge</summary>
                  <div className="mt-3"><CopyField label="Compact badge HTML" value={codes.compact} /></div>
                </details>
              </div>
            </div>
          )}
        </form>

        <h2 className="text-xl font-semibold text-neutral-900 mt-12">Questions</h2>
        <div className="mt-4 space-y-5 max-w-2xl">
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900">How is rarity decided?</h3>
            <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">By your real rank among the creators we track on your platform, recomputed daily. Grow past a threshold and your card levels up on its own, everywhere it&apos;s embedded.</p>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900">Is it free?</h3>
            <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">Yes. No account needed, no limits.</p>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900">Where can I use it?</h3>
            <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">Anywhere that shows images: websites, Notion, GitHub READMEs (use the Markdown code), stream panels, media kits. The foil and shine animate in browsers; places that only show still images get a clean still card.</p>
          </div>
        </div>
      </div>
    </>
  );
}
