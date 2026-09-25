# Working with the site owner

- Whenever you need the owner to do something (create a token, change a
  setting in GitHub, Vercel or Supabase, run a workflow, etc.), give detailed,
  numbered, click-by-click steps: which site, which menu, what to type or
  pick in each field, what to copy, and what to tell you when done. Never
  just name the thing ("add a token", "set an env var") and assume they know
  how.
- Deploy by pushing straight to `main` in small batches (Vercel deploys it);
  no pull requests unless asked.

# Design rules (hard rules)

- NEVER use glowing orbs or colored glow blobs: no blurred colored circles
  (`rounded-full ... blur-[…]`, `blur-3xl` backgrounds), no colored radial
  "aura"/"mesh" washes, no light-burst flashes, and no colored glow
  shadows (e.g. `shadow-[0_0_40px_rgba(amber…)]`, box-shadow in a brand
  color). The owner considers them sloppy "AI slop". Dark sections are a
  flat dark base plus the faint `hero-dot-grid` texture only; shadows are
  neutral black/gray for depth, never colored light.
