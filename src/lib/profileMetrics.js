// Profile growth metrics derived from a creator's daily readings. Pure (pass
// `now` for tests); CreatorProfile.jsx and the tests both use this, so the
// stat cards, verdict sentence and milestone projection all come from one
// place. Returns null with fewer than two readings.
export function computeProfileMetrics(statsHistory, now = new Date()) {
  if (statsHistory.length < 2) return null;

  const sortedStats = [...statsHistory].sort((a, b) =>
    new Date(b.recorded_at) - new Date(a.recorded_at)
  );

  const latest = sortedStats[0];

  const dailyStats = sortedStats.map((stat, index) => {
    const prevStat = sortedStats[index + 1];
    return {
      ...stat,
      subsChange: prevStat ? (stat.subscribers || stat.followers) - (prevStat.subscribers || prevStat.followers) : 0,
      viewsChange: prevStat ? stat.total_views - prevStat.total_views : 0,
      videosChange: prevStat ? (stat.total_posts || 0) - (prevStat.total_posts || 0) : 0,
    };
  });

  // "Last 30 days" baseline = the oldest reading dated within the last 30
  // calendar days, the exact rule the chart's 30D view uses (see
  // buildYouTubeSeries), so the stat cards and the chart's "net" can never
  // disagree. It used to be the 30th row back, which lands a day or two
  // earlier whenever a day's reading is missing (-5.6K card vs -5.4K chart).
  // Falls back to that row-based pick only when collection has stalled and
  // fewer than two readings fall inside the window.
  const cutoff30 = new Date(now);
  cutoff30.setDate(cutoff30.getDate() - 30);
  const inWindow = sortedStats.filter((s) => new Date(s.recorded_at) >= cutoff30);
  const last30Stat = inWindow.length >= 2
    ? inWindow[inWindow.length - 1]
    : sortedStats[Math.min(29, sortedStats.length - 1)];

  const subsGrowth = (latest.subscribers || latest.followers) - (last30Stat.subscribers || last30Stat.followers);
  const viewsGrowth = latest.total_views - last30Stat.total_views;
  const videosGrowth = (latest.total_posts || 0) - (last30Stat.total_posts || 0);

  // Use actual calendar days between the 30-day lookback point and today, not row count.
  // Rows can have gaps (e.g. 28 rows spanning 30 calendar days), so dividing by
  // row count overstates daily/weekly averages and skews milestone predictions.
  const calendarDays = Math.max(1, Math.round(
    (new Date(latest.recorded_at) - new Date(last30Stat.recorded_at)) / (1000 * 60 * 60 * 24)
  ));
  const dailyAvgSubs = Math.round(subsGrowth / calendarDays);
  const dailyAvgViews = Math.round(viewsGrowth / calendarDays);
  const weeklyAvgSubs = Math.round(subsGrowth / (calendarDays / 7));
  const weeklyAvgViews = Math.round(viewsGrowth / (calendarDays / 7));

  const last14Days = sortedStats.slice(0, Math.min(14, sortedStats.length));
  const last14First = last14Days[last14Days.length - 1];
  const last14Subs = last14Days.length > 1 ? (latest.subscribers || latest.followers) - (last14First.subscribers || last14First.followers) : 0;
  const last14Views = last14Days.length > 1 ? latest.total_views - last14First.total_views : 0;

  // Calculate 7-day and 30-day growth percentages
  const last7Days = sortedStats.slice(0, Math.min(7, sortedStats.length));
  const last7First = last7Days[last7Days.length - 1];
  const growth7DayPercent = last7Days.length > 1 && last7First.subscribers
    ? ((latest.subscribers || latest.followers) - (last7First.subscribers || last7First.followers)) / (last7First.subscribers || last7First.followers) * 100
    : 0;

  const growth30DayPercent = last30Stat.subscribers || last30Stat.followers
    ? subsGrowth / (last30Stat.subscribers || last30Stat.followers) * 100
    : 0;

  // dailyAvgSubs above is a real, correctly-measured average, but it's
  // measured across whatever the last 30 available ROWS span, not the
  // last 30 calendar days from today. For a creator whose collection has
  // stalled (an outage, a dead scraper) those rows can end weeks in the
  // past, so the average describes a window that's no longer current even
  // though the arithmetic is right. daysSinceLastUpdate lets the verdict
  // sentence below tell the difference between "here's today's trend" and
  // "here's what the trend was, last time we had data."
  const daysSinceLastUpdate = Math.floor((now - new Date(latest.recorded_at)) / (1000 * 60 * 60 * 24));

  return {
    dailyStats: dailyStats.slice(0, 14),
    last30Days: { subs: subsGrowth, views: viewsGrowth, videos: videosGrowth },
    last14Days: { subs: last14Subs, views: last14Views },
    growthRates: { sevenDay: growth7DayPercent, thirtyDay: growth30DayPercent },
    dailyAverage: { subs: dailyAvgSubs, views: dailyAvgViews },
    daysSinceLastUpdate,
    weeklyAverage: { subs: weeklyAvgSubs, views: weeklyAvgViews },
  };
}
