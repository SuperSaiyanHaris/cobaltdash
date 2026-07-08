import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Server, Code, Zap, Coffee, Megaphone, MessageSquare, ArrowRight, Check, Link2 } from 'lucide-react';
import { PLATFORM_COUNT } from '../lib/constants';
import SEO from '../components/SEO';

const BUYMEACOFFEE_URL = 'https://buymeacoffee.com/shinypull';

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

const BMCButton = ({ label = 'Buy Me a Coffee', size = 'lg' }) => (
  <a
    href={BUYMEACOFFEE_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-2.5 bg-[#FFDD00] text-gray-900 rounded-lg font-semibold transition-colors hover:bg-yellow-300 ${
      size === 'lg' ? 'px-6 py-3 text-base' : 'px-5 py-2.5 text-sm'
    }`}
  >
    <Coffee className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
    {label}
  </a>
);

const supportReasons = [
  {
    icon: Server,
    title: 'Hosting',
    description: 'Servers that stay up 24/7. Fast response times. No downtime during traffic spikes.',
    tint: 'text-indigo-500',
  },
  {
    icon: Code,
    title: 'New Features',
    description: 'More platforms, better charts, new tools. Every feature starts with funded dev time.',
    tint: 'text-violet-500',
  },
  {
    icon: Zap,
    title: 'Data Costs',
    description: `Collecting and storing daily statistics across ${PLATFORM_COUNT} platforms takes real infrastructure, and that costs money to keep running.`,
    tint: 'text-amber-500',
  },
];

export default function Support() {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText('https://shinypull.com');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SEO
        title="Support"
        description="Help support ShinyPull and fund new features. Buy the developer a coffee!"
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Header — white block, hairline rule, typographic */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16 text-center">
            <p className={`${MICRO} mb-3`}>Support</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
              Support ShinyPull
            </h1>
            <p className="mt-2 text-sm sm:text-base text-neutral-500 max-w-xl mx-auto mb-7">
              We pull live data from five platforms so you don't have to argue from memory. Turns out APIs aren't free. If ShinyPull has ever settled a Discord argument, you know what to do.
            </p>

            <BMCButton size="lg" />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">

          {/* Where support goes */}
          <div>
            <p className={`${MICRO} text-center mb-5`}>Where your support goes</p>
            <div className="grid md:grid-cols-3 gap-4">
              {supportReasons.map((reason) => (
                <div key={reason.title} className={`${CARD} p-6 hover:border-neutral-300 transition-colors`}>
                  <reason.icon className={`w-5 h-5 ${reason.tint} mb-4`} />
                  <h3 className="font-medium text-neutral-900 mb-1.5">{reason.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{reason.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Other ways */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Share — copies site link, no social platform dependency */}
            <button
              onClick={handleCopyLink}
              className={`group flex items-start gap-3.5 ${CARD} p-6 hover:border-neutral-300 transition-colors text-left w-full`}
            >
              <Megaphone className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 mb-1">Spread the Word</h3>
                <p className="text-sm text-neutral-500">Tell a creator, a manager, or anyone who obsesses over stats. Word of mouth is how this thing grows.</p>
                <span className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-neutral-900 group-hover:gap-2 transition-all duration-200">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copied ? 'Link copied!' : 'Copy link'}
                </span>
              </div>
            </button>

            <Link
              to="/contact"
              className={`group flex items-start gap-3.5 ${CARD} p-6 hover:border-neutral-300 transition-colors`}
            >
              <MessageSquare className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 mb-1">Send Feedback</h3>
                <p className="text-sm text-neutral-500">Bug report, feature idea, creator request. Good feedback shapes what gets built next.</p>
                <span className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-neutral-900 group-hover:gap-2 transition-all duration-200">
                  Contact us <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </div>

          {/* Closing CTA */}
          <div className={`${CARD} p-8 sm:p-10 text-center`}>
            <p className={`${MICRO} mb-3`}>Still thinking about it?</p>
            <p className="text-sm text-neutral-500 mb-7 max-w-md mx-auto">
              One coffee funds a week of data collection. The data never stops. Your support makes sure neither do we.
            </p>
            <BMCButton label="ok fine, here's a coffee" size="lg" />
          </div>

        </div>
      </div>
    </>
  );
}
