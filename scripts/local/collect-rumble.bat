@echo off
REM Rumble daily stats collection - Local Automation
REM
REM WHY LOCAL: rumble.com hard-blocks datacenter IPs (GitHub Actions, Vercel, AND
REM Supabase Edge all get Cloudflare-challenged), so it can only be collected from
REM a residential IP. Schedule this once daily via Windows Task Scheduler.
REM
REM NOTE: Substack is NOT here anymore — it's collected in the cloud by the
REM Supabase Edge Function `collect-substack` on a daily pg_cron schedule (Substack
REM does NOT block Supabase's IPs). Only Rumble still needs this local task.

cd /d "d:\Claude\ShinyPull"

echo ========================================
echo Rumble daily collection (local residential IP)
echo Time: %date% %time%
echo ========================================

set COLLECT_ONLY=rumble
node scripts/collectDailyStats.js
set COLLECT_ONLY=

echo.
echo Refreshing rankings cache (fast platforms, includes rumble + substack)...
node scripts/refreshRankingsCache.js

echo.
echo Processing any pending Rumble creator requests...
node scripts/processCreatorRequests.js 50 rumble

echo.
echo Discovering new Rumble creators...
node scripts/discoverRumbleCreators.js

echo.
echo Collection complete!
