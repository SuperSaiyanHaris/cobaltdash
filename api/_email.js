// Email helpers for the follow digest / milestone alerts (api/cron/digest.js).
// The chrome mirrors supabase/functions/_shared/emailTheme.ts (the newsletter
// template) so every ShinyPull email looks the same; that file is Deno-only,
// hence the port. Inline styles only, no flex/grid, for email clients.

import crypto from 'crypto';

export const SITE_URL = 'https://shinypull.com';
export const FROM_EMAIL = 'ShinyPull <newsletter@shinypull.com>';
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// Preference keys in the user's auth user_metadata (user-editable from the
// Account page). Absent = subscribed.
export const PREFS = {
  weekly: 'digest_opt_out',
  milestones: 'milestone_alerts_opt_out',
};

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function unsubSecret() {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error('CRON_SECRET not configured');
  return s;
}

/** HMAC so an unsubscribe link only works for the user it was sent to. */
export function unsubscribeToken(userId, type) {
  return crypto.createHmac('sha256', unsubSecret()).update(`email-unsub:${type}:${userId}`).digest('base64url');
}

export function verifyUnsubscribeToken(userId, type, token) {
  if (!userId || !token || !PREFS[type]) return false;
  const expected = Buffer.from(unsubscribeToken(userId, type));
  const got = Buffer.from(String(token));
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

export function unsubscribeUrl(userId, type) {
  return `${SITE_URL}/api/email-unsubscribe?u=${encodeURIComponent(userId)}&type=${type}&t=${unsubscribeToken(userId, type)}`;
}

export function emailShell({ contentHtml, unsubUrl, reason }) {
  return `
  <div style="background:#f4f3f1;padding:48px 20px;font-family:${FONT_STACK};">
    <div style="max-width:540px;margin:0 auto;">
      <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(28,25,23,0.04),0 16px 40px -12px rgba(28,25,23,0.10);">
        <div style="padding:20px 32px;border-bottom:1px solid #f0efed;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="width:28px;height:28px;background:#1c1917;border-radius:8px;text-align:center;vertical-align:middle;line-height:28px;font-size:15px;font-weight:700;color:#ffffff;">S</td>
            <td style="padding-left:10px;font-size:15px;font-weight:700;color:#1c1917;letter-spacing:-0.01em;">ShinyPull</td>
          </tr></table>
        </div>
        <div style="padding:32px 32px 28px;">${contentHtml}</div>
      </div>
      <div style="padding:24px 12px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#a8a29e;">${escapeHtml(reason)} <a href="${unsubUrl}" style="color:#a8a29e;">Unsubscribe</a> &middot; <a href="${SITE_URL}/account" style="color:#a8a29e;">Email settings</a></p>
        <p style="margin:0;font-size:12px;color:#d6d3d1;">&copy; ${new Date().getFullYear()} ShinyPull</p>
      </div>
    </div>
  </div>`;
}

export function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="border-radius:10px;background:#1c1917;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a></td>
  </tr></table>`;
}

/** Send one email through Resend with one-click unsubscribe headers (RFC 8058). */
export async function sendEmail({ to, subject, html, unsubUrl }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
