# Biblical Hebrew Study App — Static Web App

This is a full rewrite of the original Streamlit app (`home.py` + `review.py` +
`identification.py` + `construction.py`) as a **static, framework-free
HTML/CSS/JS single-page app** — installable as an offline-capable PWA, now
also covering Consonants, Vowels, Vocabulary and Accents, with optional cloud sync via Netlify.

There is no traditional backend runtime — almost everything runs client-side
in plain JavaScript. The one exception is content privacy: the verb,
vocabulary, and accent datasets are served only through Identity-protected
Netlify Functions rather than as plain static files, so this app now
requires deployment to **Netlify with Identity enabled** — it's no longer
usable on an arbitrary static file host the way earlier versions were (see
"Sign-in is required" below for why).

## Project structure

```
├── netlify.toml                # publish = "public"; only that folder is served publicly
├── package.json                 # dev-only — jsdom (npm test), @netlify/blobs (sync function)
├── netlify/
│   └── functions/
│       ├── sync.js                # Identity-protected progress sync (reads/writes Netlify Blobs)
│       ├── get-data.js              # Identity-protected dataset server (verbs/vocabulary/accents/consonants/vowels)
│       ├── merge-logic.js             # shared per-key "newest wins" merge, used by sync.js
│       └── data/                        # the actual datasets — NEVER publicly reachable;
│           ├── verbs.json                 # bundled into get-data.js's function package only
│           ├── vocabulary.json
│           ├── accents.json
│           ├── consonants.json
│           └── vowels.json
├── public/                     # <- the ONLY folder Netlify serves publicly
│   ├── index.html                # shell page — auth gate, manifest link, theme/zoom init
│   ├── manifest.webmanifest        # PWA manifest (installable, standalone display)
│   ├── sw.js                         # service worker — caches the app shell for offline use
│   ├── icons/                          # app icons (192/512px + apple-touch-icon)
│   ├── css/style.css                     # all styling, incl. dark theme + print stylesheet
│   └── js/
│       ├── main.js                         # hash router, sign-in gate, global keyboard shortcuts
│       ├── auth-fetch.js                     # shared "fetch with the signed-in user's JWT" helper
│       ├── cloud-sync.js                       # Account sidebar UI + background progress sync
│       ├── data.js / vocab-data.js / accent-data.js   # load/cache each dataset via get-data.js
│       ├── srs.js                                       # streaks, daily goal, spaced repetition
│       └── pages/                                         # one file per page (see the app's own
│                                                             sidebar for the full list)
└── tests/                      # automated test suite (dev-only, see below)
```

## Sign-in is required

Every dataset is served only to a signed-in, invited Netlify Identity user —
opening the site shows a sign-in screen before anything else loads, and
there's no static URL that serves the raw data. See the **Cloud sync**
section below for exactly how to set this up on Netlify (Identity +
environment variables) — that setup is no longer optional, since sign-in
now gates the whole app, not just cross-device sync.

One trade-off worth knowing: this also means the app **can't fully work
offline** the way earlier versions could. The app shell (HTML/CSS/JS) still
installs and caches via the service worker, but the datasets themselves
require a live, authenticated network request each time — they're
deliberately never cached, since caching them would mean storing the
content somewhere retrievable without going through the sign-in check.

## Running it locally

Since the datasets now load through Netlify Functions (not a plain static
`fetch()`), a plain static server (`python3 -m http.server`, `npx serve`,
etc.) is no longer enough on its own — there's nothing to answer
`/.netlify/functions/get-data`. Use the
[Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)
instead, which runs the Functions layer locally too:

```bash
npm install -g netlify-cli
netlify login
netlify link          # connect this folder to your deployed site
netlify dev
```

This opens a local URL (typically **http://localhost:8888**) that behaves
like the real deployed site, including Identity sign-in and the sync/
get-data functions.

## Running the test suite

A small automated test suite lives in `tests/`, covering page navigation,
both quiz flows end-to-end (including the "retry missed questions" and
history features), keyboard shortcuts, dark mode/zoom, search, flashcard
printing, and the core sampling/ambiguity-hint logic. It uses
[jsdom](https://github.com/jsdom/jsdom) to simulate a browser in Node — no
real browser or server needed.

```bash
npm install   # one-time, installs jsdom as a dev dependency
npm test
```

Each test file runs as its own process (the app's modules are singletons,
the same way they'd behave in a real browser tab, so each test gets a truly
fresh instance rather than leftover state from a previous test). The runner
prints a per-file summary and exits non-zero if anything fails, so it's
CI-friendly if you ever wire this into a pipeline.

This `tests/` folder and `package.json` are dev-only — they're not needed to
run or deploy the app itself, only to verify changes to it.

## Deploying to a domain

This app now **requires Netlify** (not any static host) — the datasets are
served through Identity-protected Netlify Functions, which isn't something
Vercel, Cloudflare Pages, GitHub Pages, a plain nginx server, or S3 can do
without equivalent rework. If you don't need the sign-in gate at all (an
older, fully-public version of this app), you'd need to revert to serving
`data/*.json` as plain static files instead — this README describes the
current, sign-in-gated version.

1. **Deploy the repo to Netlify as a git-connected site** — Site
   configuration is already set for you in `netlify.toml` (`publish =
   "public"`, functions in `netlify/functions/`). Drag-and-drop deploys
   don't run `npm install` or include the functions folder, so a
   connected repo is required, not optional, for this version.
2. Follow the **Cloud sync** section below — Identity setup is no longer
   optional, since it now gates the whole app.

Once deployed, visiting the site over **HTTPS** (automatic on Netlify) lets
people "Install" it from their browser as a standalone app. The app shell
(HTML/CSS/JS) is cached for offline use after the first visit, but the
datasets themselves always require a live, signed-in connection — see
"Sign-in is required" above for why.

## Cloud sync — and the sign-in gate (Netlify Identity)

Progress (streaks, spaced-repetition schedules, root groups, filter
presets, everything) lives in `localStorage`, one copy per browser, synced
across devices via the same Identity account that gates the app's content.
Setup:

1. **Enable Identity**: in the Netlify dashboard, go to your site →
   *Site configuration → Identity* → *Enable Identity*. Set Registration
   to **Invite only** — since Identity now gates all the content, this is
   how you control who can see it. You invite people from the same
   Identity tab (*Invite users*).
2. **Set two environment variables** so the sync function can reach
   Netlify Blobs. This step is necessary because Netlify's automatic
   Blobs setup isn't reliable for the function format Identity requires
   (see the comment at the top of `netlify/functions/sync.js` for why) —
   supplying credentials explicitly sidesteps that entirely:
   - **Site ID**: *Site configuration → General → Site details* → copy
     the **Site ID** (labeled **Project ID** in newer Netlify UI).
   - **Personal Access Token**: click your avatar (top right) →
     *User settings → Applications → Personal access tokens* → *New
     access token*. Give it any name, no expiry needed unless you want
     one. Copy the token immediately — Netlify only shows it once.
   - Back in your site: *Site configuration → Environment variables* →
     *Add a variable* → add both:
     - `BLOBS_SITE_ID` = the Site ID you copied
     - `BLOBS_TOKEN` = the Personal Access Token you copied
   - **Redeploy** the site (env var changes don't apply to already-built
     deploys) — *Deploys* tab → *Trigger deploy → Deploy site*.

   A Personal Access Token grants broad account API access, not just
   Blobs — treat it like a password. It only ever lives in Netlify's
   environment variable store (never in the repo), and you can revoke
   and replace it any time from the same Applications page.

With that done: opening the site shows a sign-in screen first. Only people
you've invited can create an account and get past it. Once signed in,
progress syncs automatically every ~20 seconds and whenever the tab becomes
visible again (plus a manual *Sync Now* button in the sidebar's Account
section). Signing in on a second device pulls that account's data down and
merges it — per data category, not all-or-nothing, so studying on a phone
right before opening a laptop won't cause either device to lose its most
recent work.

If Identity isn't enabled, or the environment variables aren't set, the
app shows a clear message on the sign-in screen (or the sync function
returns a clear error) rather than silently failing or exposing content.

## Updating the data (verbs, vocabulary, accents, consonants, vowels)

The app's data lives in plain CSV files under `data-source/`. **To change
anything, upload the changed CSV to GitHub — that's all.** Netlify rebuilds the
app's data from the CSVs on every deploy and gives the app a fresh cache
version by itself, so there is nothing to run and nothing to bump.

### The steps (no Terminal needed)

1. Edit the CSV in Excel, Numbers or Google Sheets, and **save it as CSV
   UTF-8** (see "Hebrew" below — this is the one thing that matters).
2. On github.com, open your repository and go into the folder the file
   belongs in: `data-source/` for `vocabulary.csv`, `accents.csv`, `consonants.csv` and
   `vowels.csv`, or
   `data-source/verbs/` for a verb file.
3. Click **Add file → Upload files**, drag the CSV in, and click **Commit
   changes**. A file with the **same name** replaces the old one.
   (GitHub Desktop works too: replace the file in your local folder, then
   commit and push.)
4. Netlify starts a deploy by itself. Open the site's **Deploys** tab in
   Netlify: after a minute or two it says **Published**. Reload the app
   (once, or twice if it was open) and the change is there.

### If something is wrong with a file

The build checks the CSVs before it publishes anything. If it finds a problem it
**stops, changes nothing, and the site keeps running its previous version**.
The deploy shows as **Failed** in Netlify, and opening it shows a plain-language
list of everything that needs fixing, for example:

> `data-source/vocabulary.csv: the "Hebrew" column should contain Hebrew, but
> row 17 "???" has none. This almost always means the file was saved in the
> wrong format…`

Fix the file and upload it again. Smaller things (an unknown binyan or mode that
is probably a typo, a stray file named `vocabulary (1).csv`, a lesson split into
two places) are listed as **warnings**: the build still goes ahead, but they're
worth a look in the same deploy log.

To check a file on your own computer before uploading it, run
`npm run check-data` — it reads everything, reports problems, and writes nothing.

### Hebrew

Hebrew (with its vowel points) is fully supported — the files just have to be
saved as **UTF-8**, which is a setting in the "Save as" step:

- **Excel (Mac or Windows):** File → Save As → choose **CSV UTF-8 (Comma
  delimited)**. Do **not** choose the plain "CSV (Comma delimited)" — it
  silently turns Hebrew into `?` marks. (The build catches this and refuses the
  file, but it's better to avoid it.)
- **Google Sheets:** File → Download → **Comma-separated values (.csv)**. This is
  always UTF-8.
- **Numbers:** File → Export To → CSV, and under "Advanced Options" pick
  **Unicode (UTF-8)**.

### What's in each file

- **`data-source/vocabulary.csv`** — one row per word. Columns: `Lesson,
  Frequency, Hebrew, English, POS, Category`. Blank `Category` is fine and
  kept blank on purpose. `Lesson` order in the app follows the order rows
  first appear in the file (not alphabetical — that's what makes `5A`...
  `5Z`, `5AA`, `5BB` come out in the right sequence), so keep each lesson's
  words together.

- **`data-source/accents.csv`** — one row per accent mark. Columns: `Type,
  Group, Hebrew Name, English Name, Symbol, Placement, Keyboard Key` (headings
  may be written with or without spaces). Same first-appearance-order rule
  applies to `Type` and `Group`.

- **`data-source/consonants.csv`** — one row per consonant *form*. Columns:
  `Name, Form, Transliteration, Category, Keyboard Key`. A letter that changes
  with a dagesh (bet, gimel, dalet, kaf, pe', tav) is **two rows**, e.g. `bet`
  and `bet (dagesh)`, so each form is its own card. `Category` can list several
  values separated by commas (`Guttural, Matres Lectionis`) and is blank on
  purpose for letters without one. Aleph's transliteration is `ʾ` and ayin's
  is `ʿ` (the two half-ring marks that curve like `)` and `(`).

- **`data-source/vowels.csv`** — one row per vowel. Columns: `Class, Name,
  Length, Form, Pronunciation, Keyboard Key`. `Form` begins with the dotted
  circle `◌` that shows where the vowel attaches. qameṣ and qameṣ-ḥaṭuf are
  written with the very same mark; the app handles that with a class hint
  (see "Consonants and Vowels" below). Filter-list order for `Class` and
  `Length` follows the order they first appear in the file.

- **`data-source/verbs/*.csv`** — one file per verb paradigm. Each filename
  starts with a number purely to control the order verbs appear in the app,
  e.g. `01 Strong Verb (קטל).csv`. To reorder verbs, renumber the files. To add
  a new verb, upload a new numbered CSV with the same columns: `Binyan, Mode,
  Person, Gender, Number, Conjugation, Gloss Translation`. The part of the
  filename after the number (and before `.csv`) becomes that verb's display
  name in the app. (A verb that uses Polel/Polal/Hitpolel also needs adding to
  `POLEL_DATASETS` in `public/js/constants.js`; the build warns if it's missing.)

### How it works (for the curious)

`netlify.toml` tells Netlify to run `node scripts/build-data.mjs &&
node scripts/stamp-sw.mjs` on every deploy. The first rebuilds
`netlify/functions/data/*.json` from the CSVs (and does all the checking above);
the second writes the deploy's commit id into `CACHE_VERSION` in
`public/sw.js`, so every deploy is a new version and browsers drop their old
cached copy. The CSVs are the source of truth: the JSON files in the repository
are regenerated from them on every deploy. `npm run build-data` writes the JSON
on your own computer, if you ever want to run the app locally against changed data.

A deliberate large reduction (the check refuses to publish a file that has less
than half the rows of the current data, because that is nearly always a cut-off
or wrong file) can be allowed by setting the environment variable
`ALLOW_DATA_SHRINK` to `1` in Netlify's site settings and deploying again.

## Feature overview

- **Home page** — what to do next, from your own practice data (the numbers
  come from `public/js/home-data.js`; the page is `pages/home.js`):
  - *Today*: items due for review, your **streak** (and a nudge such as "One
    answer today keeps it going"), the daily-goal bar, and a **Study now**
    button that opens the right page, already set to the right mode, for the
    area with the most items due ("3 due in Vowels · Typing"). With nothing
    due it points at an area you haven't started, or the Daily Challenge.
  - *Pick up where you left off*: the last page you used (remembered on this
    device) plus when you last practised and your last quiz score.
  - *One tile per area* (Consonants, Vowels, Vocabulary, Verbs, Accents) with
    percent mastered, how many are due, and quick buttons for Review,
    Flashcards, Typing and Games (Verbs: Review, Flashcards, Parsing,
    Construction). An area you haven't touched says **Start here**.
  - *Weak spots*: the (up to five) items missed most — at least two misses and
    right less than 80% of the time — with **Drill these**, a short quiz on
    exactly those items (it opens the Daily Challenge page as a "Weak-Spot
    Drill"). Verb forms aren't included, because the drill has no verb questions.
  - *Verb of the day*: one verb form, the same all day; "Show parsing" reveals it.
  - Feedback is a single quiet line at the bottom. (My Progress, Achievements
    and Word Lookup are reached from the sidebar; the Weak spots card links to
    the full list in My Progress.)
- **My Progress** — how you're doing over time (Home is "what to do now"; this
  is "how am I doing"). The numbers come from `public/js/progress-data.js`, the
  charts are plain inline SVG from `progress-charts.js`, and the page is
  `pages/progress.js`. Five tabs (which tab was open is remembered while the app
  stays open, and a fresh load starts on Overview):
  - *Overview*: streak (with best), today's goal, items mastered, active days;
    **mastery by area** (a bar of mastered / learning / new per area, with a
    Details link); **reviews coming up** (how many reviews fall due each day
    this week); and the **activity calendar** (one square per day for 26
    weeks, darker the closer to your daily goal).
  - *Mastery*: one area at a time. Per-mode counts, then for Consonants, Vowels
    and Accents a **map of every item** (mastered ✓, learning, not practised,
    often missed !; click one for its answer counts) and for Vocabulary and
    Verbs mastery **by lesson / part of speech** and **by binyan / verb form /
    person / verb**.
  - *Strengths*: the full **weak-spots list** (filter by area, **Drill the worst
    15**), and **accuracy by category** (class, length, lesson, binyan, accent
    type, …). A category with fewer than 5 answers is greyed out rather than
    judged.
  - *Quizzes*: score-over-time charts for each quiz with best / average / latest,
    an Improving / Steady / Slipping tag once there are four attempts, and the
    recent-attempts list. The app keeps the last 20 attempts of each quiz.
  - *Achievements*: the badges and goals (this used to be its own page; the old
    `#achievements` address still works and opens this tab).
  - The calendar needs a per-day tally that earlier versions didn't keep, so it
    is recorded from the update that added it (`hebrewVerbApp:activityLog`,
    last 400 days; like all progress it syncs per key, so the most recently
    synced device's calendar wins if you practise on two devices).
- **Where the app opens.** Opening the app, opening it in a new tab, or signing
  in always lands on **Home**. Refreshing while you're using it (or when the
  app reloads itself after an update) keeps you on the current page. "Using it"
  is remembered per browser tab (so closing the tab or opening a new one starts
  fresh), and a tab left untouched for 30 minutes also starts on Home next
  time (`public/js/session.js`).

- **Review pages share one layout** (Consonants, Vowels, Vocabulary, Verbs,
  Accents). Above the table, because the lists can be long, come two
  sections: **Print Table**, then **Download & Print** (CSV, Excel,
  flashcards where the page offers them). Both are **collapsible**: click the
  heading to expand or collapse. They start collapsed each time the app is
  opened, and stay as you left them while you change filters or move between
  Review pages (the state lives in memory in `review-tools.js`, not in storage).
  The sidebar has a **Columns** list on
  every page: tick to show or hide a column, use the arrows to reorder; the
  choice is remembered per page, and the table, the downloads and the printed
  table all follow it (*Reset Columns* restores the default).
  - *Print Table* prints the filtered table as an **answer key** or a **blank
    practice worksheet**. You choose which of the shown columns to print (the
    **Keyboard Key** column is unticked by default on Consonants, Vowels and
    Accents), which column is filled in on the worksheet (or none), and
    optionally a **random sample of up to 100 rows** drawn from whatever the
    filters leave — a different sample each time you print, handy for quizzes.
    Tables with more than six columns print landscape, the rest portrait; rows are
    measured and packed so none is split across pages, and the column headings
    repeat on every page.
  - Verbs: the **List** view prints like the others. **By Binyan** and
    **By Verb Root** keep their own layouts (their tables are the printout), so
    their Print Table section is just *Print Blank Table* / *Print Table
    (Answer Key)* for the verbs and filters selected. On screen they are now
    styled like the other Review tables.
  - Dotted circles: a vowel or accent form such as `◌ָ` is a dotted circle
    (U+25CC) followed by a combining mark. `wrapHebrewSpans()` in `helpers.js`
    keeps the circle in the same text run as the mark; if they are split into two
    spans the browser shapes them separately and the printed mark drifts off the
    circle.
  - Code: `review-columns.js` (the Columns list), `review-tools.js` (the two
    sections), `print-data-table.js` (the printing). `print-letter-table.js` is
    obsolete and can be deleted.

- **Consonants and Vowels** — two study sets that work like Accents, each with
  a sidebar section (Review, Flashcards, Typing, Games). They are listed first
  everywhere navigation appears (sidebar, Home page), in the order
  Consonants, Vowels, Vocabulary, Verbs, Accents.
  - *Review*: a filterable table (Consonants by Category; Vowels by Class and
    Length), CSV/Excel download, printable flashcards, **Print Table (Answer
    Key)** and **Print Blank Table**. The blank table is a practice worksheet
    where you choose what is filled in: the Hebrew form, the name, or nothing.
    Portrait, 18 rows per page, same margin approach as the Verb tables.
  - *Flashcards*: Hebrew on the front; the back shows the name and
    transliteration (consonants) or the class, name and length (vowels).
  - *Typing*: Practice and Quiz, in two directions — Name → type the
    letter/vowel (on-screen Hebrew Keyboard, or a Vowel Keyboard whose keys
    include the `◌` placeholder), or letter/vowel → **type its name**.
    "Get Hint" reveals the Category, or the Class and then the Length.
    Names are checked leniently (`name-matching.js`) because the transliteration
    marks are awkward to type: capitals, spaces, hyphens, apostrophes and every
    mark are ignored (*sere* for ṣere, *sureq* for šureq, *hatef patah* for
    ḥāṭef-pataḥ), š may also be written *sh*, *vav (waw)* takes either name, and
    "(dagesh)" stays part of the name (*bet* is not *bet (dagesh)*). *sin* is
    accepted for both šin and śin, but typing the marked *śin* for šin is wrong.
    When two forms look identical (qameṣ / qameṣ-ḥaṭuf) either name is right,
    and Show Answer lists both. Accents work the same way: Name → type the
    accent, or accent → type its English name (any accents written with the same
    mark, such as revia / revia gadol / revia qaton, are all accepted).
    Progress records the new direction as `…-typing-form`; the old
    keyboard-shortcut option is gone from the Typing pages (the games still have
    a keyboard-shortcut mode).
  - *Games*: Survival Sprint, Beat the Clock, Memory Match, Lightning Round,
    and a Sort game (Category Sort / Class Sort).
  - *Shared mark*: qameṣ and qameṣ-ḥaṭuf look identical, so wherever the mark
    alone is shown (flashcard front, Lightning Round, Memory Match) the app
    offers the vowel's class as a hint — a button on flashcards, shown
    automatically in the timed games. Typing the mark is right for both.
  - They also feed spaced repetition, streaks, Progress, Achievements, the
    Daily Challenge (a few of each, "name → type it") and Word Lookup.
  - The code is shared: `letter-sets.js` describes what differs between the
    two sets, and `pages/letter-*.js` hold one Review/Flashcards/Typing/Games
    implementation used by both (`pages/consonant-*.js` and `vowel-*.js` are
    thin wrappers).

- **Review** — the verbs in three views, chosen with the buttons above
  the table (the choice is remembered): **List** (every form as a row),
  **By Binyan** (for each selected verb and binyan, one small table per
  mode — PGN | Conjugation), and **By Verb Root** (one table per verb:
  Mode | PGN | a column for each binyan the verb has). Forms that share the
  same PGN sit in one cell separated by "/". The sidebar's verb selection
  and filters apply to all three. In the two table views, "Download Excel"
  saves a workbook with one sheet per verb, laid out like the tables;
  "Print Tables" prints them (an answer key) and "Print Blank Tables" prints
  the same tables with the answers left empty for practice, with a diagonal
  line through any cell the verb doesn't use. Printouts carry only the tables
  (no browser date, title, address or page numbers — the page margin is zero and
  the app supplies its own), each verb starts on a new page, and a whole mode is
  never split across two pages (By Verb Root asks for a landscape page, By
  Binyan for portrait). The List view has the CSV, Excel, and
  double-sided printable-flashcard (PDF, via the browser's print dialog)
  export — Hebrew on the front, gloss + parsing on the back, laid out so
  printing double-sided and flipping the sheet lines each answer up
  behind its question. Each sheet holds 15 cards (5 rows of 3) per side
  and the printed pages contain only the cards — no titles, labels, or
  headers. Print in **portrait** orientation (five rows are too tall for
  a landscape page). The browser's own date/URL/page-number text is
  suppressed by the page's `@page { margin: 0 }` rule; if a browser still
  shows it, untick "Headers and footers" in the print dialog
- **Vocabulary Review** — a separate, filterable vocabulary table
  (Lesson, Part of Speech, Category, and a minimum-Frequency filter),
  with the same CSV/Excel export and visible-columns picker as Review.
  Lesson filtering respects the real textbook sequence, not alphabetical
  order. This is the first piece of a larger vocabulary-study project —
  practice/quiz modes for vocabulary aren't built yet.
- **Word Lookup** — quick search by Hebrew substring or English gloss,
  independent of any practice/quiz session, with its own flashcard export
  and an on-screen Hebrew keyboard next to the search box
- **Parsing** — practice mode plus a multi-step scored quiz, with:
  - Dropdown / Typing / Selection answer modes (Selection renders full
    clickable buttons, not small radios)
  - Ambiguity hints — many written forms are genuinely ambiguous (e.g.
    Imperfect and Jussive often share a written form for 3fs/2ms); an
    optional, progressively-revealed hint helps narrow down the intended
    parsing without just handing over the answer
- **Construction** — practice mode plus a multi-step scored quiz, with:
  - Two typing boxes (Hebrew conjugation + English gloss). Practice mode
    has Check Answer / Show Answer for immediate feedback; Quiz mode is
    graded all together at the end (no per-question reveal), so it's a
    genuine test rather than a check-as-you-go drill
  - Gloss matching ignores case/whitespace; Hebrew matching is exact
    (Unicode-normalized) since niqqud accuracy is the point of the drill
  - An on-screen Hebrew keyboard (all consonants, final forms, and the
    full niqqud set) with a live preview box at the top, so you can see
    what you've typed without needing to click out of the popup first
- **Both quiz modes** get "Retry Missed Questions" after a quiz, and a
  persisted history of past attempts (localStorage) so progress is
  visible over time
- **Streaks & spaced repetition** — Practice mode (both Parsing and
  Construction) uses a Leitner-box system: every checked answer updates
  that specific form's box (advances on correct, resets to box 1 on
  incorrect), and "Generate" prioritizes forms that are due for review,
  then never-seen forms, then recently-mastered ones last — so practice
  time naturally goes where it's needed instead of drilling the same
  well-known forms. A "Progress" section in the sidebar tracks a daily
  streak (visible on every page) and a small New/Learning/Mastered
  readout appears on each Practice page for whatever's currently
  filtered in. All of this is per-browser (localStorage) and resettable
  from the sidebar.
- **Sidebar** — collapsible (hamburger toggle, safe from being clipped
  when collapsed), independently scrollable from the page, and
  resizable: drag its right edge (or focus the edge and use the arrow
  keys; double-click resets) and the width is remembered. Dataset +
  filter selection, each filter box with its own "Select all" and
  "Clear all" (the "Reset Filters" button clears every filter at once),
  and an Accessibility section
  (dark mode, adjustable text size 80–160%, keyboard shortcuts reference
  — also reachable by pressing `?` anywhere)
- **Keyboard support** — visible focus rings throughout; arrow keys move
  along a row of buttons or jump to the row above/below (including into
  the sidebar); `Enter` advances a quiz question / reveals an answer;
  digits `1`–`9` pick a Selection-mode answer; `Esc` closes dialogs
- **Mobile** — the sidebar becomes a full-height overlay with a
  tap-to-dismiss backdrop below 720px, rather than squeezing the page.
  On the Verb, Vocabulary, and Accents flashcards, flip a card and then
  swipe it right for "I Know It" or left for "Review Later"
- **Installable / offline** — add-to-home-screen support via the web app
  manifest, with a service worker caching the app shell so Review,
  Parsing, Construction, and Word Lookup all keep working with no
  connection after the first visit

## What's different from the original Streamlit app

- No server-side session state — each page keeps its own in-memory state
  while you're on it.
- Excel export uses the SheetJS library loaded from a CDN
  (`cdnjs.cloudflare.com`) instead of `openpyxl`/`pandas`. If you'd rather
  not depend on a CDN, you can download the SheetJS bundle and host it
  alongside your other static files instead.
- PDF/flashcard export uses the browser's native print dialog ("Save as
  PDF") rather than a JavaScript PDF-generation library — simpler and more
  reliable for pagination, at the cost of a little less layout control.

