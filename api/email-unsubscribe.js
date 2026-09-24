// One-click unsubscribe for the follow digest / milestone alerts.
// GET  (link in the email footer) -> sets the preference, shows a confirmation page
// POST (RFC 8058 List-Unsubscribe-Post from Gmail/Yahoo) -> same, empty 200
// The link carries an HMAC of the user id + type (api/_email.js), so it can't
// be used to change anyone else's settings.

import { createClient } from '@supabase/supabase-js';
import { PREFS, SITE_URL, escapeHtml, verifyUnsubscribeToken } from './_email.js';

const LABEL = { weekly: 'the weekly creator summary', milestones: 'milestone alerts' };

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} - ShinyPull</title></head>
<body style="margin:0;background:#f4f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917">
<div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border:1px solid #e7e5e4;border-radius:20px">
<h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(title)}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#57534e">${body}</p>
<a href="${SITE_URL}/account" style="font-size:14px;color:#1c1917">Email settings</a> &middot; <a href="${SITE_URL}" style="font-size:14px;color:#1c1917">ShinyPull</a></div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  const { u, type, t } = req.query || {};
  let valid = false;
  try { valid = verifyUnsubscribeToken(u, type, t); } catch { valid = false; }
  res.setHeader('Cache-Control', 'no-store');
  if (!valid) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(page('Link not valid', 'This unsubscribe link is invalid or incomplete. You can change email settings from your account page instead.'));
  }

  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user } = {}, error } = await sb.auth.admin.getUserById(u);
  if (!error && user) {
    await sb.auth.admin.updateUserById(u, { user_metadata: { ...user.user_metadata, [PREFS[type]]: true } });
  }

  if (req.method === 'POST') return res.status(200).end();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(page('Unsubscribed', `You won't get ${LABEL[type]} anymore. You can turn it back on any time in your account's email settings.`));
}
