import { RefreshCw, WifiOff, SearchX, ServerCrash, CloudOff, Loader2 } from 'lucide-react';

/**
 * Fun error state component for service outages and failures
 * Shows clean illustrations and friendly messages
 *
 * @param {string} type - Error type: 'loading', 'network', 'server', 'notfound'
 * @param {string} message - Optional custom error message
 * @param {function} onRetry - Optional retry callback function
 * @param {string} retryText - Optional custom retry button text
 */
export default function FunErrorState({
  type = 'server',
  message,
  onRetry,
  retryText = 'Try Again'
}) {
  const errorTypes = {
    server: {
      title: "Something went wrong",
      message: message || "Our servers are taking a coffee break. They'll be back shortly!",
      icon: ServerCrash,
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-950/30',
      borderColor: 'border-orange-100',
    },
    network: {
      title: "Connection lost",
      message: message || "Can't reach our servers. Check your internet connection.",
      icon: CloudOff,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-100',
    },
    loading: {
      title: "Taking longer than usual",
      message: message || "Still working on it. Hang tight.",
      icon: Loader2,
      iconColor: 'text-indigo-500',
      bgColor: 'bg-indigo-950/50',
      borderColor: 'border-indigo-100',
      animateIcon: true,
    },
    notfound: {
      title: "Not found",
      message: message || "We couldn't find what you're looking for.",
      icon: SearchX,
      iconColor: 'text-neutral-700',
      bgColor: 'bg-neutral-50',
      borderColor: 'border-neutral-200',
    }
  };

  const config = errorTypes[type] || errorTypes.server;
  const IconComponent = config.icon;

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="text-center max-w-md animate-fade-in">
        {/* Icon */}
        <div className={`w-20 h-20 ${config.bgColor} ${config.borderColor} border rounded-2xl flex items-center justify-center mx-auto mb-6`}>
          <IconComponent className={`w-10 h-10 ${config.iconColor} ${config.animateIcon ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">
          {config.title}
        </h2>

        {/* Message */}
        <p className="text-neutral-700 text-base mb-8 leading-relaxed">
          {config.message}
        </p>

        {/* Retry button */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-lg transition-colors group"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
            {retryText}
          </button>
        )}

        {/* Connection status indicator */}
        {type === 'network' && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-neutral-700">
            <WifiOff className="w-4 h-4 text-red-500 animate-pulse" />
            <span>Waiting for connection...</span>
          </div>
        )}

        {/* Server status indicator */}
        {type === 'server' && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-neutral-700">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '75ms' }}></div>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            </div>
            <span>Service temporarily unavailable</span>
          </div>
        )}

        {/* Loading indicator */}
        {type === 'loading' && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-neutral-700">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Still loading...</span>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
