import { Link } from 'react-router-dom';
import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import {
  Twitch, Newspaper, Sparkles, TrendingUp, Star, Lightbulb,
  Rocket, Eye, Mic, BookOpen, BarChart3, Trophy, Quote, Zap, Info,
  AlertTriangle, ArrowRight,
} from 'lucide-react';
import YouTubeIcon from './YouTubeIcon';
import KickIcon from './KickIcon';
import TikTokIcon from './TikTokIcon';
import BlueskyIcon from './BlueskyIcon';
import MastodonIcon from './MastodonIcon';
import RumbleIcon from './RumbleIcon';
import SubstackIcon from './SubstackIcon';
import { getCategoryTheme } from '../lib/blogTheme';

// Map category iconName -> lucide component
const ICON_MAP = {
  Newspaper, Sparkles, Twitch, Youtube: YouTubeIcon, TrendingUp, Star, Lightbulb,
  Rocket, Eye, Mic, BookOpen, BarChart3, Trophy,
};

const PLATFORM_META = {
  youtube: { Icon: YouTubeIcon, color: '',                bg: 'bg-red-50',    border: 'border-red-200'    },
  twitch:  { Icon: Twitch,     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  tiktok:  { Icon: TikTokIcon, color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200'   },
  kick:    { Icon: KickIcon,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  },
  bluesky: { Icon: BlueskyIcon,color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200'    },
  mastodon:{ Icon: MastodonIcon, color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  rumble:  { Icon: RumbleIcon,   color: 'text-lime-700',   bg: 'bg-lime-50',   border: 'border-lime-200'   },
  substack:{ Icon: SubstackIcon, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
};

function CreatorMentions({ creators }) {
  if (!creators.length) return null;
  return (
    <div className="mt-12 pt-8 border-t border-neutral-200">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-4">Creators in this post</p>
      <div className="flex flex-wrap gap-2">
        {creators.map(({ platform, username, displayName }) => {
          const meta = PLATFORM_META[platform];
          if (!meta) return null;
          const { Icon, color, bg, border } = meta;
          return (
            <Link
              key={`${platform}/${username}`}
              to={`/${platform}/${username}`}
              className={`group inline-flex items-center gap-1.5 px-3 py-1.5 ${bg} border ${border} rounded-full hover:opacity-80 transition-opacity text-sm font-medium ${color}`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {displayName || username}
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Light-theme callout boxes. Five flavors, each with its own icon + accent color.
const CALLOUT_STYLES = {
  stat:    { bg: 'bg-purple-50',  border: 'border-purple-300',  bar: 'bg-purple-500',  label: 'By the Numbers',  Icon: BarChart3, color: 'text-purple-700'  },
  insight: { bg: 'bg-indigo-50',  border: 'border-indigo-300',  bar: 'bg-indigo-500',  label: 'Key Insight',     Icon: Lightbulb, color: 'text-indigo-700'  },
  tip:     { bg: 'bg-emerald-50', border: 'border-emerald-300', bar: 'bg-emerald-500', label: 'Pro Tip',         Icon: Zap,       color: 'text-emerald-700' },
  update:  { bg: 'bg-amber-50',   border: 'border-amber-300',   bar: 'bg-amber-500',   label: 'Platform Update', Icon: Info,      color: 'text-amber-700'   },
  warning: { bg: 'bg-red-50',     border: 'border-red-300',     bar: 'bg-red-500',     label: 'Watch Out',       Icon: AlertTriangle, color: 'text-red-700' },
};

function CalloutBox({ type, children }) {
  const s = CALLOUT_STYLES[type] || CALLOUT_STYLES.insight;
  const { Icon } = s;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`relative ${s.bg} border ${s.border} rounded-xl pl-6 pr-6 py-5 my-8 overflow-hidden`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
      <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] ${s.color} mb-3`}>
        <Icon className="w-4 h-4" />
        {s.label}
      </div>
      <div className="text-neutral-800 leading-relaxed">{children}</div>
    </motion.div>
  );
}

// "The Quick Read" TLDR box — gradient card with custom arrow bullets.
function TldrBox({ children, theme }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`my-10 rounded-xl ${theme.accentBg} border ${theme.accentBorder}`}
    >
      <div className="px-6 py-5 sm:px-8 sm:py-6">
        <div className={`inline-flex items-center gap-1.5 mb-4 text-[10px] font-medium uppercase tracking-[0.14em] ${theme.accentText}`}>
          <Sparkles className="w-3 h-3" />
          The Quick Read
        </div>
        <div className={`text-neutral-800 ${`[&_ul]:list-none [&_ul]:ml-0 [&_li]:relative [&_li]:pl-6 [&_li]:mb-2 [&_li:before]:content-['→'] [&_li:before]:absolute [&_li:before]:left-0 [&_li:before]:font-bold [&_p]:leading-relaxed`} [&_li:before]:${theme.accentText}`}>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

// Stats strip — 2/3/4 columns of value+label cards with gradient numbers.
function StatsStrip({ raw, theme }) {
  const items = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split('|');
      return { value: (value || '').trim(), label: rest.join('|').trim() };
    })
    .filter((s) => s.value);

  if (items.length === 0) return null;
  const cols = items.length === 4 ? 'sm:grid-cols-4' : items.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  const gradientStops = theme.h2Bar.replace('bg-gradient-to-r ', '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`grid grid-cols-1 ${cols} gap-3 sm:gap-4 my-10`}
    >
      {items.map((item, i) => (
        <div key={i} className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6">
          <div className="text-3xl sm:text-4xl font-semibold text-neutral-900 tabular-nums leading-none">
            {item.value}
          </div>
          <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 leading-snug">
            {item.label}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// Build the ReactMarkdown component map. Closure counter `getH2Index` numbers
// each H2 so we can render ghost watermarks (01, 02, 03) per section.
function buildMarkdownComponents(theme, getH2Index) {
  const CategoryIcon = ICON_MAP[theme.iconName] || Newspaper;

  return {
    h1: ({ children }) => (
      <h1 className="text-3xl font-extrabold text-neutral-900 mt-8 mb-6 tracking-tight">{children}</h1>
    ),

    // H2 = main section header. Numbered ghost watermark + colored bar + small category icon.
    h2: ({ children }) => {
      const idx = getH2Index();
      const num = String(idx).padStart(2, '0');
      return (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-14 sm:mt-20 mb-6 sm:mb-8 first:mt-0"
        >
          <div className="flex items-start gap-3">
            <div className="mt-1 flex-shrink-0 w-9 h-9 rounded-lg bg-neutral-50 border border-neutral-200/80 flex items-center justify-center">
              <CategoryIcon className={`w-5 h-5 ${theme.accentText}`} />
            </div>
            <div className="min-w-0">
              <div className={`h-0.5 w-10 sm:w-12 ${theme.accentBg} border ${theme.accentBorder} rounded-full mb-2.5`} />
              <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight leading-tight">{children}</h2>
            </div>
          </div>
        </motion.div>
      );
    },

    h3: ({ children }) => (
      <h3 className={`relative pl-4 text-lg sm:text-xl font-bold text-neutral-900 mt-10 mb-3 border-l-4 ${theme.accentBorder}`}>
        {children}
      </h3>
    ),

    // Paragraph — first one is the intro/hook box, rest are normal body.
    p: ({ children, node }) => {
      const isFirst = node?.position?.start?.line === 1;
      if (isFirst) {
        return (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10 sm:mb-14"
          >
            <div className={`p-6 sm:p-8 ${theme.accentBg} border ${theme.accentBorder} rounded-xl`}>
              <Quote className={`w-5 h-5 ${theme.accentText} mb-3 opacity-70`} />
              <p className="text-base sm:text-lg text-neutral-800 leading-relaxed font-medium">
                {children}
              </p>
            </div>
          </motion.div>
        );
      }
      return <p className="text-neutral-700 leading-[1.75] mb-5 text-[15px] sm:text-base">{children}</p>;
    },

    a: ({ href, children }) => {
      const isExternal = href?.startsWith('http');
      if (isExternal) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 underline-offset-2 font-medium transition-colors">
            {children}
          </a>
        );
      }
      return (
        <Link to={href} className="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 underline-offset-2 font-medium transition-colors">
          {children}
        </Link>
      );
    },

    strong: ({ children }) => <strong className="font-bold text-neutral-900">{children}</strong>,
    em: ({ children }) => <em className="italic text-neutral-700">{children}</em>,

    // Lists with category-colored bullets via [&_li]:marker:color
    ul: ({ children }) => (
      <ul className={`my-5 space-y-2 list-none pl-0 [&>li]:relative [&>li]:pl-6 [&>li:before]:content-['•'] [&>li:before]:absolute [&>li:before]:left-0 [&>li:before]:font-extrabold [&>li:before]:${theme.accentText}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-5 text-neutral-700 list-decimal ml-5 md:ml-6 space-y-2 marker:font-bold marker:text-neutral-400">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="text-neutral-700 leading-relaxed">{children}</li>,

    // Decorative section break — three dots with thin lines (no gradient fades anywhere)
    hr: () => (
      <div className="my-12 flex items-center justify-center gap-3" aria-hidden="true">
        <span className="block h-px w-16 bg-neutral-200" />
        <span className={`block w-2 h-2 rounded-full ${theme.accentBg} border ${theme.accentBorder}`} />
        <span className={`block w-1.5 h-1.5 rounded-full ${theme.accentBg} border ${theme.accentBorder}`} />
        <span className={`block w-2 h-2 rounded-full ${theme.accentBg} border ${theme.accentBorder}`} />
        <span className="block h-px w-16 bg-neutral-200" />
      </div>
    ),

    table: ({ children }) => (
      <div className="overflow-x-auto my-8 rounded-xl border border-neutral-200 shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-neutral-50">{children}</thead>,
    tbody: ({ children }) => <tbody className="bg-white divide-y divide-neutral-100">{children}</tbody>,
    tr: ({ children, isHeader }) => (
      <tr className={isHeader ? '' : 'even:bg-neutral-50/50 hover:bg-neutral-50 transition-colors'}>{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-3 text-left text-xs font-bold text-neutral-600 uppercase tracking-wider">{children}</th>
    ),
    td: ({ children }) => <td className="px-4 py-3 text-sm text-neutral-700">{children}</td>,

    code: ({ inline, children }) => {
      if (inline) {
        return <code className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 rounded text-[0.9em] font-mono text-indigo-700">{children}</code>;
      }
      return (
        <pre className="bg-neutral-900 text-neutral-100 rounded-xl p-4 overflow-x-auto my-6 border border-neutral-800 shadow-md">
          <code className="text-sm font-mono">{children}</code>
        </pre>
      );
    },

    // Pull quote — big serif quote mark + thick colored bar + italic.
    blockquote: ({ children }) => (
      <motion.blockquote
        initial={{ opacity: 0, x: -12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative my-12 px-6 py-6 sm:px-10 sm:py-8 bg-neutral-50 border border-neutral-200/80 rounded-xl"
      >
        <Quote className={`absolute top-4 left-4 w-8 h-8 ${theme.accentText} opacity-30`} />
        <div className={`absolute left-0 top-4 bottom-4 w-1.5 ${theme.h2Bar} rounded-full`} />
        <div className="relative pl-6 text-lg sm:text-xl text-neutral-800 italic font-medium leading-relaxed">{children}</div>
      </motion.blockquote>
    ),

    img: ({ src, alt }) => (
      <motion.figure
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.5 }}
        className="my-10"
      >
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          className="w-full rounded-xl object-cover max-h-[480px] border border-neutral-200/80"
        />
        {alt && <figcaption className="mt-3 text-center text-xs text-neutral-500 italic">{alt}</figcaption>}
      </motion.figure>
    ),
  };
}

// Inline variant for callout/tldr boxes (smaller paragraphs, simpler list styling).
function buildInlineMarkdownComponents(base) {
  return {
    ...base,
    p: ({ children }) => <p className="text-neutral-800 leading-relaxed mb-2 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-bold text-neutral-900">{children}</strong>,
    ul: ({ children }) => <ul className="my-2 space-y-1.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal ml-5">{children}</ol>,
    li: ({ children }) => <li className="text-neutral-800 leading-relaxed">{children}</li>,
  };
}

export default function BlogContent({ content, category }) {
  // H2 counter — increments once per H2 mount, reset on each BlogContent render
  const h2Counter = useRef(0);
  h2Counter.current = 0;
  const getH2Index = () => ++h2Counter.current;

  if (!content) return null;
  const theme = getCategoryTheme(category);
  const markdownComponents = buildMarkdownComponents(theme, getH2Index);
  const inlineComponents = buildInlineMarkdownComponents(markdownComponents);

  const creatorsTagMatch = content.match(/\{\{creators:([^}]+)\}\}/);
  const mentionedCreators = creatorsTagMatch
    ? creatorsTagMatch[1]
        .split(',')
        .map((entry) => {
          const [platformUser, displayName] = entry.trim().split(':');
          const [platform, username] = (platformUser || '').split('/');
          return { platform, username, displayName: displayName || username };
        })
        .filter((c) => c.platform && c.username)
    : [];
  let cleanedContent = content.replace(/\{\{creators:[^}]+\}\}\n?/g, '');

  cleanedContent = cleanedContent
    .replace(/\{\{product(?:-mini)?:[^}]+\}\}\n?/g, '')
    .replace(/\{\{product-grid\}\}\n?/g, '')
    .replace(/\{\{\/product-grid\}\}\n?/g, '');

  // Raw HTML blocks — extracted FIRST so their inner markup never touches the
  // markdown pipeline. Lets individual posts ship their own bespoke layout and
  // scoped <style>. Safe because blog content is service-role/admin-authored
  // only (RLS blocks anon/authenticated writes to blog_posts).
  const htmlBlocks = [];
  cleanedContent = cleanedContent.replace(/\{\{html\}\}([\s\S]*?)\{\{\/html\}\}/g, (_, raw) => {
    const idx = htmlBlocks.length;
    htmlBlocks.push(raw.trim());
    return `\n{{__html_${idx}__}}\n`;
  });

  const statsBlocks = [];
  cleanedContent = cleanedContent.replace(/\{\{stats\}\}([\s\S]*?)\{\{\/stats\}\}/g, (_, raw) => {
    const idx = statsBlocks.length;
    statsBlocks.push(raw.trim());
    return `\n{{__stats_${idx}__}}\n`;
  });

  const parts = cleanedContent.split(
    /(\{\{callout:[^}]+\}\}|\{\{\/callout\}\}|\{\{tldr\}\}|\{\{\/tldr\}\}|\{\{__stats_\d+__\}\}|\{\{__html_\d+__\}\})/g
  );

  let inCallout = false;
  let calloutType = 'insight';
  let inTldr = false;
  let tldrContent = '';
  const elements = [];

  parts.forEach((part, index) => {
    if (part === '{{tldr}}') {
      inTldr = true;
      tldrContent = '';
      return;
    }
    if (part === '{{/tldr}}') {
      elements.push(
        <TldrBox key={`tldr-${index}`} theme={theme}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={inlineComponents}>
            {tldrContent.trim()}
          </ReactMarkdown>
        </TldrBox>
      );
      inTldr = false;
      tldrContent = '';
      return;
    }

    const statsToken = part.match(/^\{\{__stats_(\d+)__\}\}$/);
    if (statsToken) {
      const raw = statsBlocks[Number(statsToken[1])];
      if (raw) {
        elements.push(<StatsStrip key={`stats-${index}`} raw={raw} theme={theme} />);
      }
      return;
    }

    const htmlToken = part.match(/^\{\{__html_(\d+)__\}\}$/);
    if (htmlToken) {
      const raw = htmlBlocks[Number(htmlToken[1])];
      if (raw) {
        elements.push(
          <div
            key={`html-${index}`}
            className="blog-raw-html"
            dangerouslySetInnerHTML={{ __html: raw }}
          />
        );
      }
      return;
    }

    const calloutOpenMatch = part.match(/\{\{callout:([^}]+)\}\}/);
    if (calloutOpenMatch) {
      inCallout = true;
      calloutType = calloutOpenMatch[1];
      return;
    }
    if (part === '{{/callout}}') {
      inCallout = false;
      return;
    }

    if (inTldr) {
      tldrContent += part;
      return;
    }

    if (part.trim()) {
      const mdContent = (
        <ReactMarkdown
          key={`content-${index}`}
          remarkPlugins={[remarkGfm]}
          components={inCallout ? inlineComponents : markdownComponents}
        >
          {part}
        </ReactMarkdown>
      );
      if (inCallout) {
        elements.push(
          <CalloutBox key={`callout-${index}`} type={calloutType}>
            {mdContent}
          </CalloutBox>
        );
      } else {
        elements.push(mdContent);
      }
    }
  });

  return (
    <div className="max-w-none">
      {elements}
      <CreatorMentions creators={mentionedCreators} />
    </div>
  );
}
