@echo off
REM ShinyPull - Rumble auto-collector (self-scheduling, NO Task Scheduler needed)
REM
REM Rumble blocks every cloud datacenter IP, so it can only be collected from this
REM residential connection. This window stays open and re-runs the Rumble
REM collection once every 24 hours. Just leave it running (minimized is fine).
REM
REM SET IT TO START ON LOGIN (one time, no Task Scheduler):
REM   1. Press Win+R, type:  shell:startup   and press Enter.
REM   2. Right-drag THIS file into that folder, release, choose
REM      "Create shortcuts here".
REM   Done. It now launches automatically each time you log in.
REM
REM Keep Proton VPN OFF (or split-tunnel rumble.com) so it uses your home IP.

cd /d "d:\Claude\ShinyPull"
title ShinyPull Rumble Collector

:loop
echo ========================================
echo Rumble collection run - %date% %time%
echo ========================================
set COLLECT_ONLY=rumble
node scripts/collectDailyStats.js
set COLLECT_ONLY=
node scripts/refreshRankingsCache.js
echo.
echo Processing any pending Rumble creator requests (site "Track this channel" submissions)...
node scripts/processCreatorRequests.js 50 rumble
echo.
echo Discovering new Rumble creators...
node scripts/discoverRumbleCreators.js
echo.
echo Done. Next run in 24 hours. (Leave this window open. Ctrl+C to stop.)
timeout /t 86400 /nobreak
goto loop
