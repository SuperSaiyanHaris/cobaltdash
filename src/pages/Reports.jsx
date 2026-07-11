import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, X, Download, Copy, Check, ChevronDown,
  Calendar, Filter, Table2, Save, Trash2, Clock,
  Loader2, Lock, FileSpreadsheet, ArrowRight, Zap,
  Crown, Plus, RotateCcw,
} from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatNumber } from '../lib/utils';

/* ───────────── constants ───────────── */

const PLATFORMS = ['all', 'youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'];
const PLATFORM_LABELS = { all: 'All Platforms', youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music', mastodon: 'Mastodon', rumble: 'Rumble', substack: 'Substack' };
const PLATFORM_COLORS = {
  youtube:  'bg-red-500',
  tiktok:   'bg-pink-500',
  twitch:   'bg-purple-500',
  kick:     'bg-green-500',
  bluesky:  'bg-sky-500',
  music:    'bg-amber-500',
  mastodon: 'bg-violet-500',
  rumble:   'bg-lime-500',
  substack: 'bg-orange-500',
};

const DATE_RANGES = [
  { id: '7d',     label: 'Last 7 days',   days: 7 },
  { id: '30d',    label: 'Last 30 days',  days: 30 },
  { id: '90d',    label: 'Last 90 days',  days: 90 },
  { id: '365d',   label: 'Last year',     days: 365 },
  { id: 'all',    label: 'Full history',  days: null },
];

const METRIC_OPTIONS = [
  { id: 'subscribers',        label: 'Subscribers / Followers / Listeners',  platforms: ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'] },
  { id: 'total_views',        label: 'Total Views / Likes / Plays',          platforms: ['youtube', 'tiktok', 'music'] },
  { id: 'total_posts',        label: 'Videos / Posts',                       platforms: ['youtube', 'tiktok', 'bluesky', 'mastodon', 'rumble'] },
  { id: 'hours_watched_day',  label: 'Hours Watched (Daily)',                platforms: ['twitch', 'kick'] },
  { id: 'peak_viewers_day',   label: 'Peak Viewers (Daily)',                 platforms: ['twitch', 'kick'] },
  { id: 'avg_viewers_day',    label: 'Avg Viewers (Daily)',                  platforms: ['twitch', 'kick'] },
];

const DEFAULT_METRICS = ['subscribers', 'total_views', 'total_posts'];

/* ───────────── helpers ───────────── */

function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function escCsv(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows, filename) {
  const csvStr = '\uFEFF' + rows.map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDelta(n) {
  if (n == null) return '';
  return n >= 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

/* ───────────── main component ───────────── */

export default function Reports() {
  const { user, loading: authLoading } = useAuth();
  // Reports open to all signed-in users now (was Mod-only). Featured Listings is the only paid product.
  const isMod = true;

  /* ---------- creator search / picker ---------- */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCreators, setSelectedCreators] = useState([]);
  const searchTimeout = useRef(null);

  /* ---------- report config ---------- */
  const [platformFilter, setPlatformFilter] = useState('all');
  const [dateRange, setDateRange] = useState('30d');
  const [selectedMetrics, setSelectedMetrics] = useState(new Set(DEFAULT_METRICS));

  /* ---------- report data ---------- */
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  /* ---------- saved reports ---------- */
  const [savedReports, setSavedReports] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  /* ---------- UI ---------- */
  const [copied, setCopied] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);
  const [reportError, setReportError] = useState(null);

  /* ─── auth gate ─── */
  useEffect(() => {
    if (!authLoading && !user) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to build custom reports and export data.' },
      }));
    }
  }, [user, authLoading]);

  /* ─── load saved reports ─── */
  useEffect(() => {
    if (user && isMod) loadSavedReports();
  }, [user, isMod]);

  async function loadSavedReports() {
    setLoadingSaved(true);
    try {
      const { data } = await supabase
        .from('saved_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setSavedReports(data || []);
    } catch {
      // silent
    } finally {
      setLoadingSaved(false);
    }
  }

  /* ─── creator search (debounced) ─── */
  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const platform = platformFilter === 'all' ? null : platformFilter;
        const { data } = await supabase.rpc('search_creators_fuzzy', {
          p_query: q.trim(),
          p_platform: platform,
          p_limit: 15,
        });
        // Filter out already-selected creators
        const selectedIds = new Set(selectedCreators.map(c => c.id));
        setSearchResults((data || []).filter(c => !selectedIds.has(c.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [platformFilter, selectedCreators]);

  function addCreator(creator) {
    if (selectedCreators.some(c => c.id === creator.id)) return;
    setSelectedCreators(prev => [...prev, creator]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeCreator(id) {
    setSelectedCreators(prev => prev.filter(c => c.id !== id));
    // Clear report data if we removed a creator that was in it
    if (reportData) setReportData(null);
  }

  /* ─── toggle metric ─── */
  function toggleMetric(id) {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  }

  /* ─── generate report ─── */
  async function generateReport() {
    if (selectedCreators.length === 0) return;
    setLoadingReport(true);
    setReportData(null);
    setReportError(null);

    try {
      const creatorIds = selectedCreators.map(c => c.id);
      const rangeObj = DATE_RANGES.find(r => r.id === dateRange);

      let query = supabase
        .from('creator_stats')
        .select('creator_id, recorded_at, subscribers, followers, total_views, total_posts, hours_watched_day, peak_viewers_day, avg_viewers_day')
        .in('creator_id', creatorIds)
        .order('recorded_at', { ascending: false });

      if (rangeObj.days) {
        query = query.gte('recorded_at', getDateNDaysAgo(rangeObj.days));
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by creator
      const grouped = {};
      for (const row of (data || [])) {
        if (!grouped[row.creator_id]) grouped[row.creator_id] = [];
        grouped[row.creator_id].push(row);
      }

      // Build summary for each creator
      const summary = selectedCreators.map(creator => {
        const rows = grouped[creator.id] || [];
        const latest = rows[0] || {};
        const oldest = rows[rows.length - 1] || {};

        const subs = latest.subscribers || latest.followers || 0;
        const oldSubs = oldest.subscribers || oldest.followers || 0;
        const subsGrowth = rows.length > 1 ? subs - oldSubs : null;

        const views = latest.total_views || 0;
        const oldViews = oldest.total_views || 0;
        const viewsGrowth = rows.length > 1 ? views - oldViews : null;

        const posts = latest.total_posts || 0;
        const oldPosts = oldest.total_posts || 0;
        const postsGrowth = rows.length > 1 ? posts - oldPosts : null;

        // Latest streaming stats
        const hwDay = latest.hours_watched_day || null;
        const pvDay = latest.peak_viewers_day || null;
        const avDay = latest.avg_viewers_day || null;

        return {
          creator,
          latest,
          dataPoints: rows.length,
          subscribers: subs,
          subscribersGrowth: subsGrowth,
          total_views: views,
          viewsGrowth,
          total_posts: posts,
          postsGrowth,
          hours_watched_day: hwDay,
          peak_viewers_day: pvDay,
          avg_viewers_day: avDay,
          rawRows: rows,
        };
      });

      setReportData({ summary, generated: new Date().toISOString() });
    } catch (err) {
      console.error('Report generation failed:', err);
      setReportError('Something went wrong generating the report. Please try again.');
    } finally {
      setLoadingReport(false);
    }
  }

  /* ─── sort ─── */
  function handleSort(col) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
  }

  function getSortedSummary() {
    if (!reportData?.summary) return [];
    if (!sortCol) return reportData.summary;
    return [...reportData.summary].sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      return sortAsc ? av - bv : bv - av;
    });
  }

  /* ─── CSV export ─── */
  function exportCsv() {
    if (!reportData) return;
    const rangeLabel = DATE_RANGES.find(r => r.id === dateRange)?.label || dateRange;
    const metrics = [...selectedMetrics];
    const now = new Date().toISOString().split('T')[0];

    const header = ['Creator', 'Platform', 'Username'];
    const metricLabels = {};
    for (const m of metrics) {
      const opt = METRIC_OPTIONS.find(o => o.id === m);
      if (opt) {
        header.push(opt.label);
        header.push(`${opt.label} Growth`);
        metricLabels[m] = opt.label;
      }
    }
    header.push('Profile URL');

    const rows = [
      ['ShinyPull Report'],
      ['Generated', now],
      ['Date Range', rangeLabel],
      ['Creators', reportData.summary.length.toString()],
      [],
      header,
    ];

    for (const s of getSortedSummary()) {
      const row = [s.creator.display_name || s.creator.username, s.creator.platform, s.creator.username];
      for (const m of metrics) {
        if (m === 'subscribers') {
          row.push(s.subscribers || '');
          row.push(s.subscribersGrowth != null ? s.subscribersGrowth : '');
        } else if (m === 'total_views') {
          row.push(s.total_views || '');
          row.push(s.viewsGrowth != null ? s.viewsGrowth : '');
        } else if (m === 'total_posts') {
          row.push(s.total_posts || '');
          row.push(s.postsGrowth != null ? s.postsGrowth : '');
        } else if (m === 'hours_watched_day') {
          row.push(s.hours_watched_day || '');
          row.push('');
        } else if (m === 'peak_viewers_day') {
          row.push(s.peak_viewers_day || '');
          row.push('');
        } else if (m === 'avg_viewers_day') {
          row.push(s.avg_viewers_day || '');
          row.push('');
        }
      }
      row.push(`https://shinypull.com/${s.creator.platform}/${s.creator.username}`);
      rows.push(row);
    }

    downloadCsv(rows, `shinypull-report-${now}.csv`);
  }

  /* ─── detailed CSV (all data points per creator, platform-aware columns) ─── */
  const PLATFORM_DETAIL_COLS = {
    youtube:  ['Date', 'Subscribers', 'Total Views', 'Videos'],
    tiktok:   ['Date', 'Followers', 'Likes', 'Videos'],
    twitch:   ['Date', 'Followers', 'Hours Watched', 'Peak Viewers', 'Avg Viewers'],
    kick:     ['Date', 'Followers', 'Hours Watched', 'Peak Viewers', 'Avg Viewers'],
    bluesky:  ['Date', 'Followers', 'Posts'],
    mastodon: ['Date', 'Followers', 'Posts'],
    rumble:   ['Date', 'Followers', 'Videos'],
    substack: ['Date', 'Subscribers'],
  };

  function getDetailRow(platform, row) {
    switch (platform) {
      case 'youtube':  return [row.recorded_at, row.subscribers || '', row.total_views || '', row.total_posts || ''];
      case 'tiktok':   return [row.recorded_at, row.subscribers || '', row.total_views || '', row.total_posts || ''];
      case 'twitch':   return [row.recorded_at, row.subscribers || '', row.hours_watched_day || '', row.peak_viewers_day || '', row.avg_viewers_day || ''];
      case 'kick':     return [row.recorded_at, row.subscribers || '', row.hours_watched_day || '', row.peak_viewers_day || '', row.avg_viewers_day || ''];
      case 'bluesky':  return [row.recorded_at, row.subscribers || '', row.total_posts || ''];
      case 'mastodon': return [row.recorded_at, row.subscribers || '', row.total_posts || ''];
      case 'rumble':   return [row.recorded_at, row.subscribers || '', row.total_posts || ''];
      case 'substack': return [row.recorded_at, row.subscribers || ''];
      default:         return [row.recorded_at, row.subscribers || '', row.total_views || '', row.total_posts || '', row.hours_watched_day || '', row.peak_viewers_day || '', row.avg_viewers_day || ''];
    }
  }

  function exportDetailedCsv() {
    if (!reportData) return;
    const rangeLabel = DATE_RANGES.find(r => r.id === dateRange)?.label || dateRange;
    const now = new Date().toISOString().split('T')[0];

    const rows = [
      ['ShinyPull Detailed Report'],
      ['Generated', now],
      ['Date Range', rangeLabel],
      [],
    ];

    for (const s of getSortedSummary()) {
      const platform = s.creator.platform;
      rows.push([`--- ${s.creator.display_name || s.creator.username} (${PLATFORM_LABELS[platform]}) ---`]);
      rows.push(PLATFORM_DETAIL_COLS[platform] || ['Date', 'Subscribers', 'Views', 'Posts', 'Hours Watched', 'Peak Viewers', 'Avg Viewers']);

      const sorted = [...s.rawRows].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
      for (const row of sorted) {
        rows.push(getDetailRow(platform, row));
      }
      rows.push([]);
    }

    downloadCsv(rows, `shinypull-detailed-report-${now}.csv`);
  }

  /* ─── copy to clipboard ─── */
  function copyToClipboard() {
    if (!reportData) return;
    const lines = getSortedSummary().map(s => {
      const parts = [`${s.creator.display_name || s.creator.username} (${PLATFORM_LABELS[s.creator.platform]})`];
      if (selectedMetrics.has('subscribers')) parts.push(`Subs: ${formatNumber(s.subscribers)}${s.subscribersGrowth != null ? ` (${fmtDelta(s.subscribersGrowth)})` : ''}`);
      if (selectedMetrics.has('total_views')) parts.push(`Views: ${formatNumber(s.total_views)}${s.viewsGrowth != null ? ` (${fmtDelta(s.viewsGrowth)})` : ''}`);
      if (selectedMetrics.has('total_posts')) parts.push(`Posts: ${formatNumber(s.total_posts)}`);
      if (selectedMetrics.has('hours_watched_day') && s.hours_watched_day) parts.push(`Hours: ${formatNumber(s.hours_watched_day)}`);
      return parts.join(' · ');
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ─── save report config ─── */
  async function saveReport() {
    if (!saveName.trim() || selectedCreators.length === 0) return;
    try {
      const config = {
        creator_ids: selectedCreators.map(c => c.id),
        creator_names: selectedCreators.map(c => ({ id: c.id, name: c.display_name || c.username, platform: c.platform, username: c.username })),
        platform_filter: platformFilter,
        date_range: dateRange,
        metrics: [...selectedMetrics],
      };
      const { data, error } = await supabase
        .from('saved_reports')
        .insert({ user_id: user.id, name: saveName.trim(), config })
        .select()
        .single();
      if (error) throw error;
      setSavedReports(prev => [data, ...prev]);
      setSaveName('');
      setShowSaveInput(false);
    } catch (err) {
      console.error('Failed to save report:', err);
    }
  }

  /* ─── load saved report config ─── */
  function loadReport(report) {
    const cfg = report.config;
    setPlatformFilter(cfg.platform_filter || 'all');
    setDateRange(cfg.date_range || '30d');
    setSelectedMetrics(new Set(cfg.metrics || DEFAULT_METRICS));
    // Restore creators from saved names
    const creators = (cfg.creator_names || []).map(c => ({
      id: c.id,
      display_name: c.name,
      platform: c.platform,
      username: c.username,
    }));
    setSelectedCreators(creators);
    setReportData(null);
  }

  /* ─── delete saved report ─── */
  async function deleteReport(id) {
    try {
      await supabase.from('saved_reports').delete().eq('id', id).eq('user_id', user.id);
      setSavedReports(prev => prev.filter(r => r.id !== id));
    } catch {
      // silent
    }
  }

  /* ─── relevant metrics for current selection ─── */
  const relevantMetrics = METRIC_OPTIONS.filter(m => {
    if (platformFilter !== 'all') return m.platforms.includes(platformFilter);
    const platforms = selectedCreators.map(c => c.platform);
    if (platforms.length === 0) return true;
    return m.platforms.some(p => platforms.includes(p));
  });

  /* ─── auth loading ─── */
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // Mod gate removed — Reports is open to all signed-in users.

  /* ──────────────────────────────────────────
     MOD VIEW — The actual reports interface
  ────────────────────────────────────────── */
  return (
    <>
      <SEO title="Reports - ShinyPull" description="Build custom reports and export creator stats across platforms." />
      <div className="min-h-screen bg-[#fafafa]">

        {/* Page header */}
        <div className="border-b border-neutral-200/80 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-3">Reports</p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">Reports</h1>
                <p className="mt-2 text-sm sm:text-base text-neutral-600 max-w-xl">
                  Pick creators, choose a date range and metrics, then export the data as CSV. Save report templates to re-run them with one click.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Saved reports row */}
          <div className="flex justify-end mb-6">

            {/* Saved reports dropdown */}
            {savedReports.length > 0 && (
              <div className="relative">
                {showSavedDropdown && (
                  <div className="fixed inset-0 z-30" onClick={() => setShowSavedDropdown(false)} />
                )}
                <button
                  onClick={() => setShowSavedDropdown(v => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-xl text-sm text-neutral-700 transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  Saved reports ({savedReports.length})
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showSavedDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showSavedDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-neutral-300 rounded-xl shadow-2xl py-2 z-40">
                    {savedReports.map(r => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-100 transition-colors">
                        <button
                          onClick={() => { loadReport(r); setShowSavedDropdown(false); }}
                          className="flex-1 text-left text-sm text-neutral-700 truncate"
                          title={r.name}
                        >
                          {r.name}
                        </button>
                        <span className="text-xs text-neutral-400">
                          {(r.config?.creator_names?.length || 0)} creators
                        </span>
                        <button
                          onClick={() => deleteReport(r.id)}
                          className="p-1 text-neutral-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ──── Config panel ──── */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6">

            {/* Platform filter pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => { setPlatformFilter(p); setSearchQuery(''); setSearchResults([]); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    platformFilter === p
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Creator search */}
            <div className="relative mb-5">
              <div className="flex items-center bg-white border border-neutral-200 rounded-xl px-4 h-11 focus-within:border-neutral-400 focus-within:shadow-sm transition-all">
                <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search creators to add to report..."
                  className="flex-1 bg-transparent text-[16px] sm:text-sm text-neutral-800 placeholder-neutral-400 ml-3 outline-none"
                />
                {searching && <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />}
              </div>

              {/* Search dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-300 rounded-xl shadow-2xl z-30 max-h-64 overflow-y-auto">
                  {searchResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addCreator(c)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-100 transition-colors text-left"
                    >
                      {c.profile_image ? (
                        <img src={c.profile_image} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-neutral-200" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-800 truncate">{c.display_name || c.username}</p>
                        <p className="text-xs text-neutral-400">@{c.username}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${PLATFORM_COLORS[c.platform] || 'bg-neutral-500'}`}>
                        {PLATFORM_LABELS[c.platform] || c.platform}
                      </span>
                      <Plus className="w-4 h-4 text-neutral-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected creators chips */}
            {selectedCreators.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {selectedCreators.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 pl-3 pr-1.5 py-1 bg-neutral-100 border border-neutral-300 rounded-full text-sm"
                  >
                    <span className={`w-2 h-2 rounded-full ${PLATFORM_COLORS[c.platform] || 'bg-neutral-400'}`} />
                    <span className="text-neutral-700">{c.display_name || c.username}</span>
                    <button onClick={() => removeCreator(c.id)} className="p-0.5 hover:bg-neutral-200 rounded-full transition-colors">
                      <X className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setSelectedCreators([]); setReportData(null); }}
                  className="px-3 py-1 text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Date range + metrics row */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Date range */}
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  Date Range
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DATE_RANGES.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setDateRange(r.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        dateRange === r.id
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  <Filter className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  Metrics
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {relevantMetrics.map(m => (
                    <button
                      key={m.id}
                      onClick={() => toggleMetric(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        selectedMetrics.has(m.id)
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={generateReport}
                disabled={selectedCreators.length === 0 || loadingReport}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table2 className="w-4 h-4" />}
                {loadingReport ? 'Generating...' : 'Generate Report'}
              </button>

              {selectedCreators.length === 0 && (
                <span className="text-xs text-neutral-400">Add at least one creator to generate a report.</span>
              )}
              {reportError && (
                <span className="text-xs text-red-600">{reportError}</span>
              )}
            </div>
          </div>

          {/* ──── Results ──── */}
          {reportData && (
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">

              {/* Results toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-neutral-200">
                <p className="text-sm text-neutral-500">
                  {reportData.summary.length} creator{reportData.summary.length !== 1 ? 's' : ''} · {DATE_RANGES.find(r => r.id === dateRange)?.label}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Save */}
                  {showSaveInput ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveReport()}
                        placeholder="Report name..."
                        className="w-44 px-3 py-1.5 bg-neutral-100 border border-neutral-300 rounded-lg text-[16px] sm:text-sm text-neutral-800 placeholder-neutral-400 outline-none focus:border-indigo-500"
                        autoFocus
                      />
                      <button
                        onClick={saveReport}
                        disabled={!saveName.trim()}
                        className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg disabled:opacity-40 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setShowSaveInput(false); setSaveName(''); }} className="p-1.5 text-neutral-400 hover:text-neutral-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSaveInput(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg text-xs text-neutral-700 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save template
                    </button>
                  )}

                  {/* Copy */}
                  <button
                    onClick={copyToClipboard}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg text-xs text-neutral-700 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>

                  {/* Summary CSV */}
                  <button
                    onClick={exportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg text-xs text-neutral-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Summary CSV
                  </button>

                  {/* Detailed CSV */}
                  <button
                    onClick={exportDetailedCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs text-white font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Detailed CSV
                  </button>
                </div>
              </div>

              {/* Data table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-white/60">
                      <th className="text-left py-3 px-4 text-neutral-500 font-semibold">Creator</th>
                      <th className="text-left py-3 px-3 text-neutral-500 font-semibold">Platform</th>
                      {selectedMetrics.has('subscribers') && (
                        <th
                          className="text-right py-3 px-3 text-neutral-500 font-semibold cursor-pointer hover:text-neutral-800 transition-colors select-none"
                          onClick={() => handleSort('subscribers')}
                        >
                          Subs / Followers {sortCol === 'subscribers' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      )}
                      {selectedMetrics.has('subscribers') && (
                        <th className="text-right py-3 px-3 text-neutral-500 font-semibold">Growth</th>
                      )}
                      {selectedMetrics.has('total_views') && (
                        <th
                          className="text-right py-3 px-3 text-neutral-500 font-semibold cursor-pointer hover:text-neutral-800 transition-colors select-none"
                          onClick={() => handleSort('total_views')}
                        >
                          Views / Likes {sortCol === 'total_views' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      )}
                      {selectedMetrics.has('total_views') && (
                        <th className="text-right py-3 px-3 text-neutral-500 font-semibold">Growth</th>
                      )}
                      {selectedMetrics.has('total_posts') && (
                        <th
                          className="text-right py-3 px-3 text-neutral-500 font-semibold cursor-pointer hover:text-neutral-800 transition-colors select-none"
                          onClick={() => handleSort('total_posts')}
                        >
                          Posts {sortCol === 'total_posts' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      )}
                      {selectedMetrics.has('hours_watched_day') && (
                        <th
                          className="text-right py-3 px-3 text-neutral-500 font-semibold cursor-pointer hover:text-neutral-800 transition-colors select-none"
                          onClick={() => handleSort('hours_watched_day')}
                        >
                          Hrs Watched {sortCol === 'hours_watched_day' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      )}
                      {selectedMetrics.has('peak_viewers_day') && (
                        <th
                          className="text-right py-3 px-3 text-neutral-500 font-semibold cursor-pointer hover:text-neutral-800 transition-colors select-none"
                          onClick={() => handleSort('peak_viewers_day')}
                        >
                          Peak {sortCol === 'peak_viewers_day' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      )}
                      {selectedMetrics.has('avg_viewers_day') && (
                        <th
                          className="text-right py-3 px-3 text-neutral-500 font-semibold cursor-pointer hover:text-neutral-800 transition-colors select-none"
                          onClick={() => handleSort('avg_viewers_day')}
                        >
                          Avg Viewers {sortCol === 'avg_viewers_day' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedSummary().map((s, i) => (
                      <tr key={s.creator.id} className={`border-b border-neutral-200/40 hover:bg-neutral-50 transition-colors ${i % 2 === 0 ? '' : 'bg-white/30'}`}>
                        <td className="py-3 px-4">
                          <Link to={`/${s.creator.platform}/${s.creator.username}`} className="flex items-center gap-2.5 group/link">
                            {s.creator.profile_image ? (
                              <img src={s.creator.profile_image} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-neutral-200" />
                            )}
                            <span className="text-neutral-800 group-hover/link:text-indigo-400 transition-colors truncate max-w-[180px]">
                              {s.creator.display_name || s.creator.username}
                            </span>
                          </Link>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${PLATFORM_COLORS[s.creator.platform] || 'bg-neutral-500'}`}>
                            {PLATFORM_LABELS[s.creator.platform] || s.creator.platform}
                          </span>
                        </td>
                        {selectedMetrics.has('subscribers') && (
                          <td className="py-3 px-3 text-right text-neutral-800 font-medium tabular-nums">
                            {formatNumber(s.subscribers)}
                          </td>
                        )}
                        {selectedMetrics.has('subscribers') && (
                          <td className={`py-3 px-3 text-right text-xs tabular-nums ${
                            s.subscribersGrowth > 0 ? 'text-emerald-400' : s.subscribersGrowth < 0 ? 'text-red-400' : 'text-neutral-400'
                          }`}>
                            {fmtDelta(s.subscribersGrowth)}
                          </td>
                        )}
                        {selectedMetrics.has('total_views') && (
                          <td className="py-3 px-3 text-right text-neutral-800 tabular-nums">
                            {formatNumber(s.total_views)}
                          </td>
                        )}
                        {selectedMetrics.has('total_views') && (
                          <td className={`py-3 px-3 text-right text-xs tabular-nums ${
                            s.viewsGrowth > 0 ? 'text-emerald-400' : s.viewsGrowth < 0 ? 'text-red-400' : 'text-neutral-400'
                          }`}>
                            {fmtDelta(s.viewsGrowth)}
                          </td>
                        )}
                        {selectedMetrics.has('total_posts') && (
                          <td className="py-3 px-3 text-right text-neutral-800 tabular-nums">
                            {formatNumber(s.total_posts)}
                          </td>
                        )}
                        {selectedMetrics.has('hours_watched_day') && (
                          <td className="py-3 px-3 text-right text-neutral-800 tabular-nums">
                            {s.hours_watched_day ? formatNumber(s.hours_watched_day) : '—'}
                          </td>
                        )}
                        {selectedMetrics.has('peak_viewers_day') && (
                          <td className="py-3 px-3 text-right text-neutral-800 tabular-nums">
                            {s.peak_viewers_day ? formatNumber(s.peak_viewers_day) : '—'}
                          </td>
                        )}
                        {selectedMetrics.has('avg_viewers_day') && (
                          <td className="py-3 px-3 text-right text-neutral-800 tabular-nums">
                            {s.avg_viewers_day ? formatNumber(s.avg_viewers_day) : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Empty state */}
              {reportData.summary.length === 0 && (
                <div className="py-16 text-center text-neutral-400 text-sm">
                  No data found for the selected creators and date range.
                </div>
              )}
            </div>
          )}

          {/* Empty state when no report yet */}
          {!reportData && !loadingReport && selectedCreators.length === 0 && (
            <div className="text-center py-20 text-neutral-400">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-neutral-400" />
              <p className="text-lg font-semibold text-neutral-500 mb-2">No report yet</p>
              <p className="text-sm">Search for creators above, configure your filters, and hit Generate.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
