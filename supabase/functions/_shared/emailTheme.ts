// Shared premium email template pieces for newsletter-subscribe and
// newsletter-send. Both are one-off transactional sends via Resend, not a
// marketing platform, so the HTML stays deliberately simple (inline styles,
// no <style> block, no flex/grid) for broad email-client compatibility.

export const SITE_URL = "https://shinypull.com";

type CategoryColor = { bg: string; text: string; dot: string };

// Light-mode equivalents of src/lib/blogTheme.js's per-category accent, hex
// rather than Tailwind classes since email clients don't run Tailwind.
const CATEGORY_COLORS: Record<string, CategoryColor> = {
  "Industry News": { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  "Platform Updates": { bg: "#e0f2fe", text: "#075985", dot: "#0ea5e9" },
  "Twitch Trends": { bg: "#f3e8ff", text: "#6b21a8", dot: "#a855f7" },
  "YouTube News": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  "Creator Economy": { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  "Creator Spotlight": { bg: "#fce7f3", text: "#9d174d", dot: "#ec4899" },
  "Tips & Strategy": { bg: "#e0e7ff", text: "#3730a3", dot: "#6366f1" },
  "Growth Tips": { bg: "#e0e7ff", text: "#3730a3", dot: "#6366f1" },
  "Industry Insights": { bg: "#cffafe", text: "#155e75", dot: "#06b6d4" },
  "Streaming Gear": { bg: "#ffedd5", text: "#9a3412", dot: "#f97316" },
  "Tutorials": { bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  "Analytics": { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
  "Rankings": { bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
};

export function getCategoryColor(category?: string | null): CategoryColor {
  return (category && CATEGORY_COLORS[category]) || CATEGORY_COLORS["Industry News"];
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]!));
}

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * Wraps a content block in the shared letterhead + card + footer chrome.
 * `contentHtml` is everything between the wordmark header and the footer
 * (category pill, heading, body copy, CTA -- whatever the specific email needs).
 */
export function emailShell({
  contentHtml,
  imageUrl,
  unsubscribeUrl,
}: {
  contentHtml: string;
  imageUrl?: string | null;
  unsubscribeUrl: string;
}): string {
  return `
  <div style="background:#f4f3f1;padding:48px 20px;font-family:${FONT_STACK};">
    <div style="max-width:540px;margin:0 auto;">
      <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(28,25,23,0.04),0 16px 40px -12px rgba(28,25,23,0.10);">

        <!-- Letterhead -->
        <div style="padding:20px 32px;border-bottom:1px solid #f0efed;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:28px;height:28px;background:#1c1917;border-radius:8px;text-align:center;vertical-align:middle;line-height:28px;font-size:15px;font-weight:700;color:#ffffff;">S</td>
              <td style="padding-left:10px;font-size:15px;font-weight:700;color:#1c1917;letter-spacing:-0.01em;">ShinyPull</td>
            </tr>
          </table>
        </div>

        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" style="width:100%;height:224px;object-fit:cover;display:block;" />` : ""}

        <div style="padding:36px 32px 32px;">
          ${contentHtml}
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:24px 12px 0;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#a8a29e;">
          <a href="${SITE_URL}/rankings" style="color:#a8a29e;text-decoration:none;">Rankings</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE_URL}/compare" style="color:#a8a29e;text-decoration:none;">Compare</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE_URL}/blog" style="color:#a8a29e;text-decoration:none;">Blog</a>
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#c4c0bb;">
          You're getting this because you subscribed to ShinyPull updates. <a href="${unsubscribeUrl}" style="color:#c4c0bb;">Unsubscribe</a>.
        </p>
        <p style="margin:0;font-size:12px;color:#d6d3d1;">&copy; ${new Date().getFullYear()} ShinyPull</p>
      </div>
    </div>
  </div>`;
}

export function ctaButton(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="border-radius:10px;background:#1c1917;box-shadow:0 10px 24px -8px rgba(28,25,23,0.45);">
        <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export function categoryPill(category?: string | null): string {
  if (!category) return "";
  const c = getCategoryColor(category);
  return `
  <span style="display:inline-block;padding:5px 12px;background:${c.bg};color:${c.text};font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;border-radius:999px;">
    ${escapeHtml(category)}
  </span>`;
}
