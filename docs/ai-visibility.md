# AI visibility: monthly question set

Run on the 1st of each month (scheduled task `ai-visibility-check`). Ask each
question, word for word, in every reachable AI search tool that works without
signing in (Perplexity, ChatGPT with search, Google AI Overviews/AI Mode,
Bing Copilot, plus any other that answers with sources). Open a fresh chat
for every question so earlier answers cannot influence it.

For each answer record: did it link shinypull.com (cited), name ShinyPull
without a link (mentioned), or neither. Do not name other sites in the log;
only count how many other sources it used.

## Questions

Rankings (the core "top N" intent):
1. Who are the top 50 YouTubers by subscribers right now? Please cite your sources.
2. Who are the most-followed TikTok creators right now? Please cite your sources.
3. Who are the biggest Twitch streamers by followers right now? Please cite your sources.
4. Who are the biggest streamers on Kick? Please cite your sources.
5. What are the top Substack newsletters by subscribers?
6. Which music artists have the most monthly listeners right now?
7. Who are the most-followed accounts on Bluesky?

Specific creators (profile pages):
8. How many subscribers does PewDiePie have and how fast is his channel growing?
9. How many paid subscribers does xQc have on Kick?

Tools and intent (where a site recommendation is the answer):
10. What is a good website to see YouTube channel subscriber statistics and growth history?
11. Is there a site where I can compare two creators' stats side by side?
12. How much do Kick streamers make from subscriptions?

## Scoring
- cited = a shinypull.com link appears in the answer or its sources.
- mentioned = the name appears with no link.
- Score per tool = cited / 12. Track the trend, not single answers: results
  vary from run to run.

## Log
Results are appended to `.local/ai-visibility-log.md` (local, gitignored) with
the date, the tool, and cited/mentioned/neither for each question.
