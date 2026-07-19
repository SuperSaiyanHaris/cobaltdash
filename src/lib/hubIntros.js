/**
 * Hand-written intro copy for each hub page (/best/:slug), keyed by slug.
 *
 * hubs.js is a curation layer (which raw category values map to which page);
 * this file is the editorial layer (what to actually say about the category).
 * Kept separate so hubs.js stays a clean data table. Same dependency-free
 * requirement as hubs.js applies here: imported by both the React app and
 * the edge middleware.
 *
 * Not a data source. These are general, defensible observations about how
 * each category tends to behave, not per-creator claims — nothing here
 * needs updating when the underlying rankings change.
 */
export const HUB_INTROS = {
  // --- YouTube categories -------------------------------------------------
  'gaming-youtubers': "Gaming is the biggest vertical on YouTube by creator count and by watch time. Channels here range from competitive esports commentary to full playthroughs to short highlight reels, and the audience tends toward long, repeat viewing sessions rather than one-off clicks. Subscriber counts can move fast when a creator catches a breakout game early.",
  'music-youtubers': "This category covers official artist channels, cover musicians, and music-focused commentary, not just uploaded songs. A single video going viral can move a channel's subscriber count more in a week than most other categories see in a year, since music discovery on YouTube leans heavily on recommendations and search rather than an existing following.",
  'film-tv-youtubers': "Trailer reactions, reviews, and recap channels live here alongside creators who cover the entertainment industry itself. Viewership tends to spike around release weekends and awards season, then settle back down, so growth for these channels often comes in bursts tied to the film calendar rather than a steady climb.",
  'food-youtubers': "Recipe channels, restaurant reviews, and eating content all fall under Food, one of the more evergreen categories on this list. A well-made recipe video keeps pulling in views years after it was posted, which is why total view counts here often outpace what subscriber counts alone would suggest.",
  'sports-youtubers': "Highlights, analysis, and athlete-run channels make up this category, and it tracks closely with the sports calendar. Growth here tends to cluster around major tournaments and seasons, with quieter stretches in between. Channels that post fast after a game also tend to outgrow ones that wait.",
  'lifestyle-youtubers': "Vlogging, daily life content, and family channels sit in Lifestyle, one of the broadest categories on YouTube. Growth here tends to be slower and steadier than in trend-driven categories, built more on audience loyalty than any single viral moment.",
  'tech-youtubers': "Reviews, unboxings, and tutorials define this category, and product release cycles drive a lot of the traffic. Early access to a major launch can produce a short, sharp subscriber spike, while the rest of the year tends to be a steadier grind of comparisons and how-to content.",
  'education-youtubers': "Explainers, tutorials, and edutainment channels make up Education. These channels tend to have unusually high view-to-subscriber ratios, since a lot of their traffic comes from search rather than a returning audience, and one well-ranked video can keep drawing views long after it was made.",
  'fitness-youtubers': "Workout programs, nutrition advice, and training vlogs live here. January and the weeks after major holidays are reliably the biggest growth windows for this category, as new-year fitness searches spike across the platform.",
  'travel-youtubers': "Destination guides and travel vlogs make up this category. Production quality varies more here than almost anywhere else on YouTube, since a trip is expensive to film properly, and that gap tends to separate the channels that break out from the ones that stay small.",
  'pet-youtubers': "Animal-focused channels, from dog training to exotic pet care, sit in this category. It's smaller than Gaming or Music, but it has some of the most loyal, consistent audiences on the platform, since pet owners tend to watch and rewatch content about their specific animal.",
  'health-youtubers': "Wellness and medical explainer channels make up Health. Search traffic drives a large share of the views here, since people tend to look up a symptom or condition directly rather than subscribe and wait for new content, so total views can look large relative to a channel's subscriber count.",
  'beauty-youtubers': "Makeup tutorials, skincare routines, and product reviews define Beauty. New product launches and viral trends move fast through this category, and creators who cover a trend early tend to see the biggest short-term subscriber bumps.",
  'car-youtubers': "Reviews, builds, and automotive news channels make up this category. It skews toward longer average watch times than most YouTube verticals, since a lot of the audience is genuinely researching a purchase rather than browsing for entertainment.",
  'politics-youtubers': "Commentary and news analysis channels sit in Politics, one of the more volatile categories for subscriber growth. Viewership tracks closely with the news cycle, so a single major story can move a channel's numbers more in a week than months of normal output.",
  'religion-youtubers': "Sermons, faith-based discussion, and ministry channels make up Religion. Growth here tends to be slow and steady rather than viral, built on a consistent weekly upload schedule and a loyal, returning audience.",

  // --- Music genres --------------------------------------------------------
  'pop-artists': "Pop is the largest, most competitive genre tracked here, with the biggest artists in the world pulling enormous monthly listener counts. Because pop absorbs trends from nearly every other genre, this list can shift quickly whenever a new sound breaks through elsewhere.",
  'hip-hop-artists': "Hip-hop and rap are combined into one list here since they largely compete for the same audience and the same searches. It's one of the most singles-driven genres tracked, where a single breakout track can move an artist's listener count more than years of a steady catalog.",
  'electronic-artists': "Electronic covers a wide range of producers and DJs whose audiences often follow specific festivals and labels as much as individual artists. Listener counts here tend to spike around major festival lineup announcements.",
  'k-pop-artists': "K-pop has some of the most engaged, coordinated fanbases in music, and that shows up directly in listener numbers. Comeback releases, scheduled months in advance by labels, produce some of the sharpest short-term listener spikes tracked on this site.",
  'country-artists': "Country listeners tend to be some of the most loyal and consistent tracked here, with less volatility than trend-driven genres. Growth tends to come from steady touring and radio play rather than a single viral moment.",
  'classical-artists': "Classical listener counts skew smaller than most genres on this list, but they're also some of the steadiest, since the audience returns to the same recordings and composers for years rather than chasing new releases.",
  'jazz-artists': "Jazz has a smaller but dedicated listener base, and catalog depth matters more here than almost any other genre. Older recordings by legacy artists often out-listen newer releases, which is unusual compared to most genres tracked on this site.",
  'rnb-artists': "R&B listener counts tend to build gradually around an artist's full body of work rather than any single song, more so than in faster-moving genres like pop or hip-hop.",
  'indie-artists': "Indie covers independent artists across a wide range of sounds who don't fit neatly into one genre. Playlist placement matters enormously here. A well-timed spot on a major curated playlist can move an indie artist's listener count more than a year of normal growth.",
  'house-artists': "House tracks closely with electronic music's festival and club circuit, and listener numbers for artists here often move in step with touring season rather than release dates alone.",
  'reggae-artists': "Reggae has one of the most geographically concentrated listener bases tracked here, with strong regional pockets outside the usual US and UK streaming centers, alongside a steady global following built over decades.",
  'ambient-artists': "Ambient is one of the fastest-growing corners of music streaming, driven heavily by focus and sleep playlists rather than active listening. Monthly listener counts here can look large relative to an artist's public profile, since a lot of the audience finds the music through a playlist, not the artist's name.",
  'folk-artists': "Folk listener counts tend to grow slowly and steadily, built on songwriting and live performance reputation more than viral moments, with less volatility than most genres on this list.",
  'soul-artists': "Soul draws a listener base that leans heavily on classic and legacy recordings, similar to jazz, where decades-old catalogs often hold their own against newer releases in monthly listener counts.",
  'rock-artists': "Rock remains one of the largest genres tracked here by total listener volume, spanning everything from legacy stadium acts to newer bands, with catalog depth giving older artists a real advantage over ones with fewer recordings.",
  'techno-artists': "Techno listener counts are closely tied to the club and festival circuit, and artists here often see sharper regional spikes than genres with a more evenly distributed global audience.",
  'lo-fi-artists': "Lo-fi is built almost entirely on background and study-playlist listening, which means monthly listener counts here can run high relative to how well-known an individual artist actually is outside the genre.",
  'indie-rock-artists': "Indie rock sits between Indie and Rock, and playlist placement plays a bigger role in listener growth here than in most guitar-driven genres, since a lot of discovery happens through curated lists rather than radio.",
  'classic-rock-artists': "Classic rock listener counts lean almost entirely on catalog strength from artists with decades of recordings behind them, making it one of the steadiest, least volatile genres tracked on this site.",
  'indie-pop-artists': "Indie pop blends pop's accessibility with indie's independent release model, and artists here often see listener growth driven by sync placements in shows, ads, and playlists rather than radio.",
  'alternative-rock-artists': "Alternative rock spans several decades of sound, and listener counts here reflect a mix of legacy 90s and 2000s acts alongside newer bands, giving the genre more spread between old and new than most rock subgenres.",
  'dance-artists': "Dance overlaps heavily with pop and electronic, and listener counts here often track closely with which tracks are getting picked up by workout and party playlists at any given moment.",
  'trap-artists': "Trap listener counts move fast and are heavily driven by individual tracks going viral on short-form video, often well before the listener numbers here catch up.",
  'punk-artists': "Punk has a smaller, tightly loyal listener base tracked here, with less mainstream crossover than most genres on this list. Growth tends to come from touring and scene reputation rather than playlist algorithms.",
  'latin-artists': "Latin is one of the fastest-growing genres in global streaming, and listener counts here reflect strength across multiple regional markets at once rather than a single dominant one.",
  'dream-pop-artists': "Dream pop is a smaller, atmosphere-driven genre where playlist curation plays an outsized role in an artist's monthly listener count, similar to ambient and lo-fi.",
  'reggaeton-artists': "Reggaeton has grown into one of the biggest genres in global streaming over the past decade, and listener counts here reflect a young, highly engaged, Latin American and US Latino audience.",
  'experimental-artists': "Experimental covers artists working outside conventional genre lines. It has the smallest average listener counts on this list, but also some of the most dedicated audiences, following an artist across wildly different releases.",
};
