import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import SEO from '../components/SEO';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';

// Landing page for the live stats badge (served as SVG by middleware.js at
// /badge/:platform/:username). Every embed links back to the creator's
// ShinyPull profile, so each one is a backlink.
const PLATFORMS = ['youtube', 'twitch', 'kick', 'tiktok', 'bluesky', 'mastodon', 'music', 'substack'];
const EXAMPLES = [['youtube', 'mrbeast'], ['twitch', 'kaicenat'], ['kick', 'xqc']];
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500';

function codesFor(platform, username) {
  const u = encodeURIComponent(username.trim().replace(/^@/, ''));
  const img = `https://shinypull.com/badge/${platform}/${u}`;
  const link = `https://shinypull.com/${platform}/${u}?utm_source=badge`;
  const alt = `${username.trim()} ${PLATFORM_DISPLAY_NAMES[platform] || platform} stats on ShinyPull`;
  return {
    img,
    html: `<a href="${link}"><img src="${img}" width="240" height="64" alt="${alt.replace(/"/g, '&quot;')}"></a>`,
    markdown: `[![${alt}](${img})](${link})`,
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
  const [previewKey, setPreviewKey] = useState(null);
  const codes = previewKey ? codesFor(previewKey.platform, previewKey.username) : null;

  const submit = (e) => {
    e.preventDefault();
    const u = username.trim().replace(/^@/, '');
    if (u) setPreviewKey({ platform, username: u });
  };

  return (
    <>
      <SEO
        title="Free Live Stats Badge for Your Channel or Stream"
        description="Add a free, always-up-to-date follower and subscriber count badge for YouTube, Twitch, Kick, TikTok, Bluesky and more to your website, Linktree, GitHub or stream panels."
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <p className={MICRO}>Stats badge</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mt-3 tracking-tight text-balance">Show your live follower count anywhere</h1>
        <p className="text-[15px] leading-relaxed text-neutral-700 mt-4 text-pretty">
          A free badge that always shows your latest count, for your website, stream panels, Linktree, GitHub README or media kit.
          It updates itself every day. Nothing to install.
        </p>

        <div className="flex flex-wrap gap-3 mt-6">
          {EXAMPLES.map(([p, u]) => (
            <img key={p} src={`/badge/${p}/${u}`} width="240" height="64" alt={`${u} ${PLATFORM_DISPLAY_NAMES[p]} badge example`} loading="lazy" />
          ))}
        </div>

        <form onSubmit={submit} className={`${CARD} p-5 sm:p-6 mt-8`}>
          <p className={MICRO}>Get your badge</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm bg-white">
              {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_DISPLAY_NAMES[p] || p}</option>)}
            </select>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your username or handle"
              aria-label="Username"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <button type="submit" className="rounded-lg bg-neutral-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-neutral-800">Create badge</button>
          </div>

          {codes && (
            <div className="mt-6 space-y-4">
              <div>
                <p className={MICRO}>Preview</p>
                <img key={codes.img} src={codes.img} width="240" height="64" alt="Your badge preview" className="mt-2" />
                <p className="text-xs text-neutral-500 mt-2">
                  Showing &quot;creator stats&quot; instead of a number? We don&apos;t track that account yet.{' '}
                  <Link to={`/${previewKey.platform}/${encodeURIComponent(previewKey.username)}`} className="underline hover:text-neutral-800">Open its profile</Link> to add it, and the badge fills in after the next daily update.
                </p>
              </div>
              <CopyField label="HTML" value={codes.html} />
              <CopyField label="Markdown" value={codes.markdown} />
            </div>
          )}
        </form>

        <h2 className="text-xl font-semibold text-neutral-900 mt-12">Questions</h2>
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900">Is it free?</h3>
            <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">Yes. No account needed, no limits.</p>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900">How often does the number update?</h3>
            <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">Counts are collected daily from each platform&apos;s official data, and the badge always shows the latest one.</p>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900">Where can I use it?</h3>
            <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">Anywhere that shows images: websites, Notion, GitHub READMEs (use the Markdown code), stream panels, email signatures and media kits.</p>
          </div>
        </div>
      </div>
    </>
  );
}
