/**
 * Skeleton loading components for better UX
 */

// Row skeleton for creator lists
export function CreatorRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 bg-white border border-neutral-200 rounded-2xl animate-pulse">
      {/* Avatar */}
      <div className="w-16 h-16 bg-neutral-200 rounded-xl flex-shrink-0"></div>

      {/* Content */}
      <div className="flex-1">
        <div className="h-5 bg-neutral-200 rounded w-32 mb-2"></div>
        <div className="h-4 bg-neutral-200 rounded w-24"></div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex flex-col items-end gap-2">
        <div className="h-4 bg-neutral-200 rounded w-20"></div>
        <div className="h-4 bg-neutral-200 rounded w-16"></div>
      </div>
    </div>
  );
}

// Grid skeleton for ranking cards
export function RankingCardSkeleton() {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 animate-pulse">
      <div className="flex items-start gap-4 mb-4">
        {/* Rank */}
        <div className="w-8 h-8 bg-neutral-200 rounded-lg flex-shrink-0"></div>

        {/* Avatar */}
        <div className="w-16 h-16 bg-neutral-200 rounded-xl flex-shrink-0"></div>

        {/* Name */}
        <div className="flex-1">
          <div className="h-5 bg-neutral-200 rounded w-32 mb-2"></div>
          <div className="h-4 bg-neutral-200 rounded w-24"></div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <div className="h-4 bg-neutral-200 rounded w-full"></div>
        <div className="h-4 bg-neutral-200 rounded w-3/4"></div>
      </div>
    </div>
  );
}

// Table skeleton
export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="bg-neutral-100 px-6 py-4 border-b border-neutral-200">
        <div className="flex gap-4">
          <div className="h-4 bg-neutral-200 rounded w-12 animate-pulse"></div>
          <div className="h-4 bg-neutral-200 rounded w-32 animate-pulse"></div>
          <div className="h-4 bg-neutral-200 rounded w-24 ml-auto animate-pulse"></div>
          <div className="h-4 bg-neutral-200 rounded w-24 animate-pulse"></div>
        </div>
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-6 py-4 border-b border-neutral-200 last:border-0">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-neutral-200 rounded animate-pulse"></div>
            <div className="w-12 h-12 bg-neutral-200 rounded-xl animate-pulse"></div>
            <div className="flex-1">
              <div className="h-4 bg-neutral-200 rounded w-32 mb-2 animate-pulse"></div>
              <div className="h-3 bg-neutral-200 rounded w-24 animate-pulse"></div>
            </div>
            <div className="h-4 bg-neutral-200 rounded w-20 animate-pulse"></div>
            <div className="h-4 bg-neutral-200 rounded w-20 animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Creator profile page skeleton — replaces the blank → pop-in flash
export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Banner placeholder */}
      <div className="h-48 sm:h-56 md:h-72 bg-gradient-to-br from-neutral-100 via-neutral-200 to-neutral-100 animate-pulse" />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero card */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-4 sm:p-6 md:p-8 mb-6 relative -mt-32 sm:-mt-36 md:-mt-40">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-neutral-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 w-full">
                <div className="h-8 w-64 bg-neutral-200 rounded animate-pulse mb-3" />
                <div className="h-4 w-40 bg-neutral-200 rounded animate-pulse mb-4" />
                <div className="h-16 w-full bg-neutral-100 rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Stat cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-neutral-200 rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-neutral-200 rounded-lg" />
                  <div className="h-3 w-20 bg-neutral-200 rounded" />
                </div>
                <div className="h-7 w-24 bg-neutral-200 rounded" />
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 h-80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// Dashboard skeleton — sidebar + content grid. `dark` renders gray-900 bones
// for the dark dashboard/account pages.
export function DashboardSkeleton({ dark = false }) {
  const card = dark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-neutral-200';
  const bone = dark ? 'bg-gray-800' : 'bg-neutral-200';
  const boneSoft = dark ? 'bg-gray-800/60' : 'bg-neutral-100';
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      {/* Profile strip */}
      <div className={`${card} rounded-2xl p-5 mb-8 flex items-center gap-4 animate-pulse`}>
        <div className={`w-12 h-12 ${bone} rounded-xl flex-shrink-0`} />
        <div className="flex-1">
          <div className={`h-4 w-40 ${bone} rounded mb-2`} />
          <div className={`h-3 w-32 ${bone} rounded`} />
        </div>
        <div className="hidden sm:flex gap-8">
          <div className={`h-10 w-12 ${bone} rounded`} />
          <div className={`h-10 w-12 ${bone} rounded`} />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${card} rounded-2xl p-5 animate-pulse`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-11 h-11 ${bone} rounded-xl`} />
              <div className="flex-1">
                <div className={`h-4 w-28 ${bone} rounded mb-1.5`} />
                <div className={`h-3 w-20 ${bone} rounded`} />
              </div>
            </div>
            <div className={`h-3 w-full ${boneSoft} rounded mb-2`} />
            <div className={`h-3 w-3/4 ${boneSoft} rounded`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Compare card skeleton
export function CompareCardSkeleton() {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-20 h-20 bg-neutral-200 rounded-xl flex-shrink-0"></div>
        <div className="flex-1">
          <div className="h-6 bg-neutral-200 rounded w-40 mb-2"></div>
          <div className="h-4 bg-neutral-200 rounded w-24"></div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-3 bg-neutral-200 rounded w-20"></div>
          <div className="h-5 bg-neutral-200 rounded w-32"></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-neutral-200 rounded w-20"></div>
          <div className="h-5 bg-neutral-200 rounded w-32"></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-neutral-200 rounded w-24"></div>
          <div className="h-5 bg-neutral-200 rounded w-28"></div>
        </div>
      </div>
    </div>
  );
}
