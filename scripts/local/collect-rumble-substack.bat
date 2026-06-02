@echo off
REM Rumble + Substack daily stats collection - Local Automation
REM
REM WHY LOCAL: rumble.com and substack.com hard-block GitHub Actions datacenter
REM IPs (every fetch 403s), so the cloud daily-stats workflow CANNOT collect them.
REM This runs the same collector from a residential IP for just those two
REM platforms. Schedule it once daily via Windows Task Scheduler.
REM
REM COLLECT_ONLY restricts the run to rumble + substack only (everything else is
REM already collected fine in the cloud).

cd /d "d:\Claude\ShinyPull"

echo ========================================
echo Rumble + Substack daily collection
echo Time: %date% %time%
echo ========================================

set COLLECT_ONLY=rumble,substack
node scripts/collectDailyStats.js
set COLLECT_ONLY=

echo.
echo Refreshing rankings cache (fast platforms, includes rumble + substack)...
node scripts/refreshRankingsCache.js

echo.
echo Collection complete!
