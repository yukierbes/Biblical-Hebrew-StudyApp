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
│       ├── get-data.js              # Identity-protected dataset server; loads only the file asked for
│       ├── merge-logic.js             # shared per-key "newest wins" merge, used by sync.js
│       ├── report.js                    # "Report a mistake": students add flags; only the owner reads them
│       ├── report-logic.js                # report checks: cleaning, who is the owner, per-student limits
│       └── data/                        # the actual datasets — NEVER publicly reachable;
│           ├── verbs.json                 # bundled into get-data.js's function package only
│           ├── vocabulary.json
│           ├── accents.json
│           ├── consonants.json
│           └── vowels.json
├── public/                     # <- the ONLY folder Netlify serves publicly
│   ├── index.html                # shell page — auth gate, manifest link, theme/zoom/Hebrew-size init
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
progress syncs in the background, **only when something has changed** (see
*Update 22* at the end of this file for exactly when), and there is a manual
*Sync Now* button in the sidebar's Account section. Signing in on a second
device pulls that account's data down and merges it — per saved item, not
all-or-nothing, so studying on a phone right before opening a laptop won't
cause either device to lose its most recent work.

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

## Mistake reports, personal lists and notes, and personal touches

### Report a mistake (and the owner's review page)

Every study item has a small row of three faint buttons: **☆** (star), **✎** (note) and
**⚑** (report a mistake). They appear on flashcards, typing, games, parsing, construction and in
the review tables, and stay quiet until the student hovers or focuses them. **⚑** opens a short
dialog (what looks wrong, plus optional details) and sends the report with the item's name.
If the student is offline, the report waits on their device and is sent later.

**Reports are stored** in their own Netlify Blobs store (`hebrew-verb-app-reports`), one record per
report, separate from anyone's progress. Students can only *add* reports.

**Limits** (so no one can flood you): each student can send **10 reports a day and 100 in total**,
and can't report the same item twice in a day. You (the owner) are not limited. Change the two
numbers at the top of `netlify/functions/report-logic.js` (`MAX_REPORTS_PER_DAY`, `MAX_REPORTS_TOTAL`).

**The owner page** ("Mistake Reports", just under Word Lookup in the sidebar) is visible only to you:

1. In Netlify: *Site configuration → Environment variables → Add a variable*:
   `OWNER_EMAIL` = the email you sign in with. (Several owners: separate the emails with commas.
   The name may be typed in any capitalisation.) Then *Deploys → Trigger deploy*, because
   environment variable changes only apply to a new deploy.
2. Sign in with that email. The "Mistake Reports" link appears. (Alternatively give a user the
   Netlify Identity role `admin`.) Anyone else who opens `#reports` is told it is for the owner,
   and the server refuses to return any reports to them.

On the page, reports are grouped by item, so a word reported by three students appears once with a
count. It shows which source file to edit (for example `data-source/vocabulary.csv`). For each report you can
**Mark fixed**, **Dismiss**, **Reopen** or **Delete**, and **Copy open reports (CSV)** for a spreadsheet.
Fix the data the usual way (see *Updating the data*), then mark the reports fixed.

### Personal lists and notes

A student can **star** anything (a word, consonant, vowel, accent, or a whole **verb root**) and
write a **note** (a memory trick). The note appears under the item on flashcards (once flipped) and in Typing and Parsing practice (once the answer is checked); it stays hidden in quizzes, games and Construction so it can't give an answer away.
The sidebar of each Review, Flashcards, Typing and Games page has a **My list** filter
(*Everything / Starred / With my note*), so a student can study only their own list. In the Review tables the
★ column and a "My note" column let them star and annotate straight from the table.
The stars, notes and the My list choice are saved under the `hebrewVerbApp:` prefix, so they sync
across devices like the rest of the student's progress (each area, such as Vocabulary, syncs as one unit,
newest save wins).

### Personal touches

- **Display name**: set on Home when first asked, or in *My Progress → Settings*. Home then says
  "Shalom, Dana."
- **Encouragement**: the line under the greeting on Home, and the line on results screens, match how the
  student is doing (new, back after a break, goal met, a streak at risk, struggling, doing very well). The wording
  lives in `public/js/encourage.js`, which has no dependencies, so it is easy to edit.
- **Celebration style** (*My Progress → Settings*, with a Preview): *Soft sparkle* (default), *Confetti*,
  *Sound chime* or *Quiet*. It plays when the daily goal is reached, on a streak milestone (3, 7, 14, 30, 50, 100,
  200, 365 days), when an achievement unlocks, and after a strong quiz, Daily Challenge or flashcard round, or a
  new game high score. At most one every few seconds, and with "reduce motion" on a device the animations become
  a brief still glow.


## Feature overview

### Bible in Context — the practice pages (Definite Article, Dagesh, Pronominal Suffixes, Prefixed Prepositions, Qameṣ vs Qameṣ-ḥaṭuf, Shevas, Syllables & Stress, Nouns, Independent Personal Pronouns, Demonstratives, Adjectives, Verbs, Interrogative ה, Prefixed Vav, Prefixed מִן)

*Pages: `public/js/pages/bible-article.js`, `bible-dagesh.js` and `bible-suffix.js`, all built on the shared engine
`public/js/bible-practice.js` (so they look and behave the same). Data: `data-source/bible/`. Rules:
`scripts/lib/article-rules.mjs`, `dagesh-rules.mjs`, `suffix-rules.mjs`, `hebrew-word.mjs` (the vowel / sheva analyzer), `qames-rules.mjs`, `sheva-rules.mjs`, `prefix-rules.mjs` and `syllables.mjs` (with `syllable-patterns.mjs`). Build: `scripts/build-bible.mjs` (runs on every
deploy after the CSV build; `npm run check-bible` checks without writing). Page titles are just the topic (Definite Article,
Dagesh, Pronominal Suffixes); keep that pattern for new pages.*

Real verses from Genesis, in four tabs on each page: **Guided passage** (steps through every example in a short passage;
the answer buttons show only the pattern names, and the description appears *after* an answer, so the learner recalls
first), **Pattern quiz** (10 questions, all patterns included, then a score and a review of the missed questions, with a
way to practise just those), **Find the …** (tap what has it; a dotted green border marks one that was missed) and
**Pattern guide**. A sidebar switch hides accent marks (only accents; vowels and dagesh are never altered).

* **Definite Article.** The Open Scriptures Hebrew Bible (OSHB) tags the article as its own piece of each word; the app only
  *finds* it there and *sorts* it itself, from what is written. Answer choices: Standard Form, Compensatory Lengthening,
  Implicit Doubling, Exceptional Forms (הָ before an accented qameṣ-ה, as in הָהָרָה; and הֶ before an unaccented הָ, חָ, or עָ,
  vowel dissimilation, as in הֶהָרִים), SQNMLVY (vocal sheva, or short vowel before a doubled letter) and Pausal Lengthening
  (a qameṣ article in a word carrying a pause accent). Owner decisions that the spelling rules cannot make are in
  `ARTICLE_OVERRIDES`: Gen 40:3 is Standard Form (with a note) and Gen 41:24 הָשִׁבֳּלִים is SQNMLVY. Nothing in Genesis is held back now.
* **Dagesh.** Answer choices: Dagesh Lene, Dagesh Forte, Mappiq. The order of questions is the owner's: BeGaD KeFaT? preceded
  by silence? A dot in a final ה is a mappiq. The dot in a vav with no vowel of its own is the šureq vowel, never counted as
  a dagesh; the guide compares a vav with a dagesh forte against šureq vavs. **Find the dagesh** asks for a type (lene, forte
  or mappiq) and the learner taps *consonants*, not words. Cases the spelling cannot settle (a sheva after a long vowel, a dot
  in a guttural) are held back and never used as examples (33 in Genesis).
* **Pronominal Suffixes.** Type 1 (singular nouns) and Type 2 (plural nouns) suffixes, from the owner's table (סוּס / סוּסִים,
  ten person/gender/number rows). OSHB tags the suffix and its person/gender/number; the app checks that the written ending
  is that row's ending in the table and takes Type 1 or Type 2 from the column that matched. Nouns and prepositions only (verbs
  have their own object suffixes). Endings not in the table (for example לָךְ, or the connecting vowels in -ֵהוּ) are held back.
  **Find the pronominal suffix** asks for Type 1 or Type 2.
* **Pronominal Suffixes — two answer boxes.** The guided passage and the quiz ask for the type (Type 1 / Type 2) AND the
  person-gender-number (PGN); a question is judged when both boxes have an answer (the engine supports any number of boxes
  through `config.extraPart`).
* **Qameṣ vs Qameṣ-ḥaṭuf and Shevas.** Both read from one word analysis (`hebrew-word.mjs`): each letter's vowel, dagesh, meteg
  and accent marks; which letters are vowels and which are vowel letters; which syllable is accented (from the accent mark; a
  word with none that stands before a maqqef is unaccented; any other word without a usable accent has an UNKNOWN stress); then
  the owner's rules for vocal/silent sheva and for qameṣ/qameṣ-ḥaṭuf. When a rule cannot be applied with confidence the case is
  held back and never shown: for example an unaccented qameṣ before a sheva with no meteg (שָׁמְרוּ vs חָכְמָה look the same on
  the page), a qameṣ before a י or ו with no vowel, or a word whose stress is unknown. The qameṣ-ḥaṭuf "before another
  qameṣ-ḥaṭuf" rule is implemented but Genesis has no clear example of it.
* **Find the dagesh / qameṣ / sheva** ask for a type and the learner taps consonants (each letter keeps its own vowel marks).
* **Pattern guides** for Qameṣ and Shevas share one layout: "A vowel is a qameṣ if:" / "A simple sheva is vocal if:" and then bullets that start
  with a capital "It" (each pattern has a `reason` for the bullet and an `explain` for after an answer).
* **Definite Article** now calls the standard form "Lexical Form".
* **Prefixed Prepositions** (ל, בּ, כּ). Answer boxes are the owner's inputs: Lexical Form, Simple Sheva, Compound Sheva, יְ, Tone Syllable,
  Definite Article, יהוה, אֱ. The guide table (forms for ל, ב and כ with the dagesh lene, and the rules) has no answer column. A dropped
  article is recognised from the Open Scriptures tag "Rd" (preposition with the article); a qameṣ or pataḥ on the preposition is never taken as proof of
  the article by itself. Cases the table does not cover (for example לֵאמֹר, or SQNMLVY cases after a preposition) are held back.
  **Find the prefixed preposition** asks for ל, בּ or כּ.
* **Syllables & Stress.** Three answer boxes per syllable (open or closed; tonic, pretonic, propretonic, post-tonic, propost-tonic; short, long or
  vocal sheva). A vocal sheva or ḥāṭef is its own syllable; a dagesh forte closes one syllable and opens the next. The third tab, **Divide the word**,
  is an interactive: the learner clicks between letters to add dividing lines (a doubled letter is shown twice so the line can go between its halves) and
  checks them. The guide lists CAPL, OPRL, CURS, OAPS and OOPPS with real examples, and notes meteg versus silluq. Only words whose stress is known and
  whose shevas and qameṣes could all be sorted are used (a word before a maqqef has no tone syllable and is left out).
* **The grammar pages (update 15).** Nouns, Independent Personal Pronouns, Demonstratives, Adjectives, Interrogative ה, Prefixed Vav, Prefixed מִן and
  Verbs are all configured in one file, `public/js/pages/grammar-pages.js`, on the shared engine; their rules are in `scripts/lib/grammar-rules.mjs` and
  `verb-rules.mjs`, and `scripts/lib/dataset-builder.mjs` turns a classifier into a dataset. Almost everything is READ from the Open Scriptures tagging
  (noun state and gender-number, personal pronouns, demonstratives, the "Rd" and "Ti" prefix tags, the "w" and "q" sequential verb forms, binyan and mode);
  the app adds only the spelling checks against the owner's tables and, for adjectives, a cautious reading of the neighbouring words:
  attributive (a definite noun and a definite adjective that agree), predicate (a definite noun with an adjective without the article, in either order),
  substantive (a definite adjective with no noun it modifies). When both the noun and the adjective are indefinite, the case is held back.
* **Verb types** (Find the verb) come from the ROOT: the verb's dictionary number is looked up in the Open Scriptures Hebrew lexicon
  (`data-source/bible/HebrewStrong.xml`, CC BY 4.0, the same credit line) and the consonants decide the type (strong, or one or more of the ten weak types:
  I-Guttural, I-Aleph, I-Nun, I-Vav/I-Yod, II-Guttural, II-Vav/II-Yod, II-Geminate, III-Guttural, III-Aleph, III-He). A root can have two types (הָיָה is I-Guttural and III-He).
* **Demonstratives.** A far demonstrative pronoun looks exactly like a third-person personal pronoun, so only far demonstrative ADJECTIVES (with the
  article) are used; a plural near pronoun אֵלֶּה could be masculine or feminine and is held back unless it follows a noun.
* **Passages** are `data-source/bible/passages.csv` (article), `passages-dagesh.csv`, `passages-suffix.csv`, `passages-qames.csv`, `passages-sheva.csv`, `passages-prefix.csv`, `passages-syllable.csv` and one `passages-<page>.csv` per grammar page: Title, Start, End, Note. Start and End are `chapter:verse` for Genesis, or a book code, a space and `chapter:verse` for Ruth or Jonah (for example `Ruth 1:16`).
* **Spacing and hidden controls.** `.btn` sets `display`, which silently beat the `hidden` attribute, so the Next button showed
  under the answers; `.bible-body [hidden]` now wins, and the Next buttons have their own space above them.
* **Vowel names** in the app use the spelling on the Vowels page (qameṣ, pataḥ, segol, ṣere, ḥireq, šureq …).
* **Adding more** (other books, prefixed prepositions, syllables) follows the same shape: a rules module, a build step that
  writes a small dataset, and a page config for the shared engine. Only the verses a page needs are shipped.
* **Credits and licensing.** The OSHB tagging is CC BY 4.0 and its credit line is on **Sources & Credits** and in `NOTICE.md`;
  the Hebrew text (Westminster Leningrad Codex) is public domain. `data-source/bible/Gen.xml` is the unchanged OSHB file.
  No English translation is included yet.

### Appearance: themes, background patterns and Hebrew size

*Sidebar footer. Code: `public/js/appearance.js`, the palettes at the end of `css/style.css`.*

- **Six themes** — Classic (the original look), Parchment, Sky, Olive, Terracotta and Midnight. Each has a
  light and a dark version, so the Dark Mode button works with every theme. The colors are checked for
  contrast (body text 7:1 or better, secondary text 4.5:1 or better, also over the strongest pattern).
  There is deliberately no free color picker.
- **Background pattern** — None, Dots, Graph paper, Diagonal lines or Weave, each Subtle or Bold, usable with
  any theme. Patterns are drawn only on the page background and sidebar, never behind cards or tables.
- **Hebrew size** (80%–160%, five steps) scales all Hebrew on screen separately from the page text size.
  Printouts always use the normal size (`--hebrew-scale` is forced to 1 in `#print-area` and `@media print`),
  so printed flashcards and tables keep their layout. Hebrew typed into answer boxes is not scaled.
- All of these are saved in this browser only (keys `themePalette`, `themePattern`, `themePatternStrength`,
  `hebrewZoom`), applied by an inline script in `index.html` before first paint. Printing ignores themes.

### Filters on Consonants, Vowels, Vocabulary and Accents

*Code: `public/js/filter-state.js`, `widgets.js` (`renderCheckboxList`).*

Every filter starts with all its boxes ticked (stored as `null`). Ticking everything is the same as no
restriction (words with no category still show). **Clearing a filter completely shows nothing**, and the page
says what to tick (e.g. "Select at least one Lesson in the sidebar filters to begin studying."), on Review,
Flashcards, Typing and Games alike — the same idea as "Select at least one dataset" on the Verbs pages.
Saved filter presets from before this change (which used an empty list to mean "all") are converted when
loaded. The Verbs pages are unchanged (they default to the first Strong Verb dataset).


- **Daily Challenge** — a short round, personal to the learner, built to be
  quick, easy and worth coming back to (`pages/daily-challenge.js`; the
  question building and grading are in `daily-data.js`, the calendar/history/
  settings in `daily-history.js`):
  - *Setup*: **5, 10 or 15 questions**; tick which areas to pull from
    (Consonants, Vowels, Vocabulary, Verbs, Accents); optional **Hard mode**
    (type the answers) and **Sound**. Choices are remembered.
  - *Personal*: due, weak and never-seen items come first. Once you have mastered
    items, about a quarter of the questions are mastered ones, kept fresh for
    review. Every answer feeds each item's own spaced-repetition schedule.
  - *Question types*: **tap the answer** among four choices (press 1–4); **verbs**
    by tapping Binyan, Mode, Person, Gender and Number, as on the Parsing page
    (a form that fits several parsings accepts any of them, and shows the usual
    hint); and, in 10- and 15-question rounds, **match to category** (items to
    their consonant category, vowel class, part of speech or accent type).
  - *Instant feedback* after every question (✓/✗ with words and icons, not
    colour alone), then **Next** (or Enter). Leave with **Save & exit** and the
    round is waiting, at the next question, for the rest of that day.
  - *Finish*: 1–3 stars (finishing, 70%, 90%), your best run of correct answers, how
    today compares with yesterday, and **a list of every question with what you
    chose and the correct answer**.
  - *Calendar*: each day you finish a round is filled in with its stars; the
    Achievements page has Daily Challenge badges (first challenge, 7 / 30 days,
    3 and 7 days in a row, a perfect round, Star Collector, Hard Mode).
  - Home's "Drill these" uses the same screens for your weak items.

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
  - *Vocabulary of the day*: one word, the same all day, shown in Hebrew;
    "Show definition" reveals the English, lesson and frequency.
  - *Verb of the day*: one verb form, the same all day; "Show parsing" reveals it.
  - *Closest achievements*: the (up to four) achievements you are furthest
    along on, with progress bars, and a link to all of them in My Progress.
  - These four boxes (Vocabulary of the day, Verb of the day, Weak spots,
    Closest achievements) sit in a 2×2 grid and are always the same size.
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
    Daily Challenge and Word Lookup.
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
  Binyan for portrait).
  - **Compare with Strong Verb (קטל)** (By Verb Root only; a switch above the
    tables, off each visit): puts Strong Verb (קטל)'s column beside every other
    verb's own, binyan by binyan — *Qal קטל | Qal שחט | Niphal קטל | Niphal שחט …*
    — under a two-row heading (binyan over root letters), with the Strong Verb
    columns shaded. It applies to every verb except קטל itself, including the
    other strong verbs (פקד, כתב). A verb with only some binyanim is compared
    only in those; Polel, Polal and Hitpolel (קום, סבב) have no Strong Verb
    partner and just show the verb's own column. The Strong Verb (קטל) is used
    even if it isn't ticked in Verbal Roots, and follows the Binyan / Mode /
    Person / Gender / Number filters so its columns line up with the verb's. A
    row the verb lacks but the Strong Verb has is still listed.
    Printing and Excel follow it: a table too wide for a page (more than 8
    columns) prints as **two halves** between binyanim, each repeating Mode and
    PGN (e.g. Qal – Pual, then Hitpael – Hophal), the first half in full before
    the second; the shading prints grey (`print-color-adjust: exact`). On a
    **blank worksheet** the Strong Verb columns stay filled in as a model unless
    "leave the Strong Verb columns empty too" is ticked; the answer key always
    shows everything. The Excel sheet keeps the interleaved columns, each headed
    like "Qal (קטל)" / "Qal (שחט)" (saved as `verbs_by_root_with_strong_verb.xlsx`).
    The model is `buildRootTable(name, rows, strongRows)` in `verb-tables.js`
    (`columns`, `compared`), and `splitRootColumns` decides the halves.
  - The List view has the CSV, Excel, and
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
  well-known forms. A small streak chip at the bottom of the sidebar shows the daily
  streak and today's goal on every page (it links to My Progress), and a
  small New/Learning/Mastered readout appears on each Practice page for
  whatever's currently filtered in. The daily-goal setting and **Reset
  progress** are on My Progress (Overview → Settings).
- **Sidebar** — collapsible (hamburger toggle, safe from being clipped
  when collapsed), independently scrollable from the page, and
  resizable: drag its right edge (or focus the edge and use the arrow
  keys; double-click resets) and the width is remembered. Top to bottom:
  - **Go to…** page finder (`page-finder.js`): type a few letters ("vow typ")
    and pick Vowels Typing; Up/Down and Enter work, Esc clears, and `/`
    jumps to it from anywhere you aren't typing. It reads the page list from
    the navigation buttons (plus a few hidden alias words such as "parse" or
    "lookup", and Achievements), so it can't drift out of step.
  - **Navigation**, then the current page's own sections (Verbal Roots,
    Filters, Columns …), each with its "Select all" / "Clear all" and a
    "Reset Filters" button.
  - A **footer pinned to the bottom** (it stays on screen while the rest
    scrolls): the streak chip, **Accessibility** in one row of small buttons
    (theme, A−, 100%, A+, `?` shortcuts — also reachable by pressing `?`
    anywhere), and **Account** (collapsed, its header showing "Synced ✓").
  - **Collapsible headers** (`sidebar-collapse.js`): every sidebar section
    header folds down to just its title, and each filter box (Lesson, POS,
    Binyan …) folds to one line with a summary — "all" or "3 of 12" (`widgets.js`
    `renderCheckboxList`). The module *watches* the sidebar and upgrades any
    `.sidebar-section` with a `.sidebar-title`, so pages need no changes (and
    their redraws keep the state). What is open is remembered by title/label.
    Defaults: Navigation open, Account closed, filter boxes closed, a page's
    sections open on a computer and **closed on a phone** (a phone and a
    computer remember separately).
  - **Filters · N active · Reset**: the Filters header counts the boxes that
    are really restricting something (some but not all options ticked) and, when
    there are any, shows a Reset link that presses the page's own "Reset
    Filters" button, so it works even with Filters folded.
- **Keyboard support** — visible focus rings throughout; arrow keys move
  along a row of buttons or jump to the row above/below (including into
  the sidebar); `Enter` advances a quiz question / reveals an answer;
  digits `1`–`9` pick a Selection-mode answer; `Esc` closes dialogs
- **Mobile** — the sidebar becomes a full-height overlay with a
  tap-to-dismiss backdrop below 720px, rather than squeezing the page; there
  Navigation comes first and the page's filters start folded. On a very short
  screen the footer stops being pinned.
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



## Update 17: badges, Bible items in review, and the Reading page

* **Badges** (`public/js/pages/achievements.js`): most badges now have Bronze, Silver and Gold levels; mastery and passing are
  rewarded over volume; a four-chapter path (Letters, Vowels, Words, Reading); Bible badges per page, per group and for all 15;
  comeback badges; four secret badges. Home shows the next three, each with a button to the page that earns it.
* **Bible items** are now part of Home's weak spots and "Drill these", the Today card's due count, and the 7-day forecast.
* **Explain my mistake**: after the same wrong answer three times on a Bible page, the app says what is being confused and links to the guide.
* **Reading page** (`public/js/pages/bible-reading.js`; *the passages, data files and marking described here were replaced by Update 24*): passages from Genesis, Ruth, Deuteronomy 6 and Psalms; tap any word for its parts; your own
  translation; tap-to-reveal English (World English Bible, public domain); mark-as-read streak; Mixed review. Data is built by
  `scripts/build-reading.mjs` and `scripts/build-mixed.mjs` from `data-source/bible/reading-passages.csv`.


## Update 21: more Reading passages, and Ruth and Jonah on the practice pages

* **Reading** (*the chosen passages below, the per-book data files and `reading-passages.csv` were replaced by Update 24: every chapter of the eleven books is now read*) now covers eleven books: Genesis 1, 2, 3 and 22; Exodus 1, 2, 3 and 20:1–17; Numbers 6:22–26; Deuteronomy 6:1–15;
  Joshua 24; Ruth 1–4; 1 Samuel 1; Psalms 1, 19, 23, 25, 37, 51, 117, 121 and 150; Proverbs 1–3; Isaiah 6; Jonah 1–4. The page asks for
  a **Book**, then a **Chapter** (only when the book has more than one), then a section. Next and Previous run on through the
  chapters of a book.
* **One data file per book.** `scripts/build-reading.mjs` writes a small index, `bible-reading.json` (books, chapters, sections: no
  Hebrew), and one file per book, `bible-reading-<book>.json` (for example `bible-reading-gen.json`, `bible-reading-1sam.json`). The
  page loads a book's file only when the book is opened. Each file is listed in `netlify/functions/get-data.js`. A new book needs
  its OSHB file in `data-source/bible`, its World English Bible file in `data-source/bible/english`, an entry in `BOOKS` in
  `build-reading.mjs`, one line in the `LOADERS` table in `get-data.js`, and rows in `reading-passages.csv`.
* **reading-passages.csv**: `Work` is now the chapter (or stretch of a chapter) inside the book named in `Book`. Keep each book's rows
  together and each chapter's rows together. Sections stay about 3–9 verses. A section's id is its first verse (for example `Ruth.1.1`).
* **Hebrew numbering.** Psalms and Jonah follow the Hebrew verse numbers, so a psalm's heading counts as verse 1 (or 1–2 in Psalm 51)
  and Jonah 2:1 is 1:17 in English. The build matches each Hebrew verse to its English, and gives a psalm heading the World English
  Bible's heading text. Sections whose numbers differ from English carry a note.
* **Proverbs** uses the poetic accents (`isPoetryBook` in `reading-accents.js` now lists Ps, Prov and Job).
* **Practice pages** (all 15) and **Mixed review** now draw on Genesis, Ruth and Jonah. `build-bible.mjs` reads the three books together.
  Each page also gains one guided passage from Ruth and one from Jonah where the book has a clean example. Genesis content is
  unchanged. `build-mixed.mjs` gives each book its own share, so Ruth and Jonah are not drowned out by Genesis.
* **New case, now covered:** Jonah 3:8 הֶחָמָס (a segol article before ח). The Exceptional Forms rule (vowel dissimilation) now reads
  “הֶ before an unaccented הָ, חָ, or עָ”, and the guide says so. Only the article page changed; the prefix page (preposition + article)
  still covers ה and ע only.
* **Pattern guides** no longer show how many times a pattern occurs (the "(n in Genesis)" captions on the Article, Dagesh, Qameṣ and
  Sheva guides are gone).
* Test 54 covers the three-book practice data, Mixed review and the removed counts. Tests 33, 34, 43 and 48 were updated.


## Update 22: lighter syncing, and saved data reused until the next release

**Why:** the app used to send a person's whole saved progress to Netlify every 20 seconds for as long as a tab was open, even
with nothing changed and even in a hidden tab, and every time a page opened it asked the function for its dataset again. Both
cost Netlify credits and both grow with the number of users and the amount of content. This update changes how the app talks to
the server; nothing a learner sees changes, except one new line in the Account section.

* **When the app contacts the sync function now** (all in `public/js/cloud-sync.js`, rules in `public/js/sync-delta.js`):
  * Every 5 seconds the app *looks* at its saved items on this device. Looking sends nothing.
  * When something changed, it sends after 20 seconds of quiet, or at most every 90 seconds during constant changes.
  * When the tab is hidden, or closed (`pagehide`), anything waiting is sent at once (marked `keepalive` so the browser finishes it).
  * When you return to the tab (if the last contact was over a minute ago, or something is waiting), and when the connection comes back.
  * While the tab is open and visible with nothing changed, once every 5 minutes, to pick up changes from your other devices.
  * Sync Now always contacts the server.
  * **A hidden tab never contacts the server on its own.** After a failure the app waits 15 seconds, then 30, then 60, up to 5 minutes.
* **What is sent:** only the saved items that changed (and the times of any that were deleted), plus a short list of the times
  of everything this device knows. **What comes back:** only the items this device is missing or has older. The rule per item is
  unchanged: the newer change wins. The merge rules are in `netlify/functions/merge-logic.js` (`processSyncPost`).
* **The server only rewrites the stored copy when something changed**, so an idle sync costs one read and no write.
* **Self-repair:** if the server's copy is ever lost or older, the response lists those items (`need`) and the device sends them in
  the same sync.
* **Older copies of the app still work.** A request without `"v": 2` gets the old whole-notebook answer; a newer app talking to an
  older server falls back the same way.
* **Closing a tab:** the send when a tab is hidden or closed is the one most easily lost, because the browser may stop the page
  mid-request. In a real browser, a request that had to pass through the service worker was lost about 1 time in 4; the worker now
  tells browsers that support it (`addRoutes`, Chrome and Edge) to send the sync request straight to the network, which brought it
  to about 1 in 24 in testing. Nothing is lost when a send fails: the change stays on the device and goes out the next time the app
  is open. The same applies if the sign-in token has expired at that moment, or if a sync was already in progress when the tab closed.
* **Saved datasets** (`public/sw.js`): a dataset saved by the *current* release is used with no request at all. Every deploy gets a
  new `CACHE_VERSION` (see `stamp-sw.mjs`), so each dataset is downloaded about once per release. A copy from an older release is
  fetched again but kept as the offline fallback. If you serve the site some other way than Netlify (so the version is not stamped),
  change `CACHE_VERSION` by hand when the data changes.
* **Account section** now shows "Saved progress: n KB", and turns red at 3 MB (browsers hold about 5 MB per site) with a pointer to
  the backup on My Progress. Saved progress is bounded by the amount of content (each item has one small record, and history lists
  are capped at 20 entries), not by how long someone studies, so nothing is deleted automatically. Adding many more practice
  passages makes the number grow; this readout is how you will see it.
* **Tests:** 55 (the server rules, the device rules, and whole conversations between two devices and the server, run with the same
  loop the app uses), 56 (the sync module in a pretend browser, the storage readout, and the service worker reusing saved
  datasets). `tests/helpers.mjs` now answers sync calls with the real merge rules and keeps a copy in memory; tests 48 and 51 were
  adjusted (headers in the service-worker harness; a brand-new person now has nothing saved on the fake server either).


## Update 23: the data function loads one file at a time

* `netlify/functions/get-data.js` used to import all 33 data files (about 7 MB) every time the function woke up, though a request
  needs one. It now has a table of one-line loaders (`LOADERS`) and loads a file the first time it is asked for, then keeps its
  text for as long as the function stays awake. The answers, headers and sign-in check are unchanged.
* **To add a dataset**: the build writes its file in `netlify/functions/data`, then add one line to
  `LOADERS`. (Reading's chapters are the exception: see Update 24.) Test 57 fails if a file in that folder has no line, or a line points at a missing file.
* Test 57 also checks that every dataset is served exactly as built, that signed-out requests get 401, and that odd names
  (`../sync`, `__proto__`) are refused.
* **Deploying this one:** it is the only change that depends on how Netlify bundles the function, so deploy it on a branch first
  (branch deploys are free), open the app there, and check that Vocabulary, Verbs, a Bible page and Reading all load.
  Rolling back means restoring the previous `get-data.js` from GitHub Desktop.


## Update 24: every chapter of Reading, by book and chapter; ketiv/qere; the vocabulary in the tap panel; a lighter reading log

**What changed for a learner**
* **Every chapter of the eleven books** (470 chapters, 11,329 verses) can be read. Choose a **Book**, then a **Chapter**; the chapter is read in
  **sections of about 8 to 12 verses**, named by plain references ("Genesis 1:1–8"). A chapter of up to 12 verses is one section. A section ends at
  a petuhah or setumah (פ, ס) when one is within two verses of the even split. Previous and Next run on through sections, chapters and books.
  The hand-written section titles and the chosen passages (and `data-source/bible/reading-passages.csv`, now unused and safe to delete) are gone.
* **A whole passage is marked as read at once** ("Mark this passage as read (8 verses)", then "Unmark this passage"). The button on each verse is gone.
* **Ketiv/qere.** A written word whose reading differs shows as bare **consonants** (what is written: no vowels, no accents, no mark). The qere is not
  shown beside it. Tapping it says **Ketiv/Qere** and shows what is written and what is read, with the qere parsed. A qere with no ketiv (Ruth 3:5)
  shows a small dashed gap that can be tapped; a ketiv with no qere (Ruth 3:12) says it is written but not read; a qere of two words (Gen 30:11)
  lists both; a written phrase of two words (1 Sam 20:2) is one item. A pair counts once in "words you know" and in the self-check, as the word that is read.
  Accent divisions read the accent from the qere. 367 such items in the eleven books. The BHS-style form (ketiv consonants carrying the qere's vowels)
  is **not** built: the source does not have it, and it needs a reviewed list.
* **Aramaic** words are flagged (Genesis 31:47 has two). The tap panel says "Aramaic" and does not match them to the Hebrew vocabulary list.
* **The tap panel starts with your vocabulary**: the English from the vocabulary list, its lesson, how often it occurs, its part of speech and category,
  and whether it is started; the Strong's meaning follows beneath it as "Other meaning", then the parts. A word the list does not have says so.
  When several entries share a spelling (אֵל and אֶל) the one of the word's own kind is used (the data now records noun, verb, preposition ...).
  Final and regular letters are one letter (the list's אֶרֶצ now matches the dictionary's אֶרֶץ). "Words you know" uses the same matching, so it is a little more exact.
* **Save for offline reading** is now a **book** at a time, with its size beside it ("Genesis (1.4 MB)"), and shows which books are saved and which need updating.
* Psalms whose heading counts as verse 1 or 1–2 carry a note that the Hebrew verse numbers are higher than the English.

**The data (`scripts/build-reading.mjs`)**
* It builds **one small file per chapter** (`netlify/functions/data/reading/rd-gen-1.json` ...), about 10 MB in all (0.94 KB a verse, a third of the old size), a small
  index `bible-reading.json` (books, verses per chapter, a **data version**, and each book's size), and `reading-loaders.js`. The chapter files are **not kept in
  git** (see `.gitignore`): the build makes them on every deploy and `npm test` (`tests/run-all.mjs`) runs it first. `npm run build-reading` does it by hand;
  a single test file needs it done first. The index and `reading-loaders.js` are kept in git (small).
* In a chapter file each word is a short array, and the repeated labels and dictionary entries are stored once per chapter (`L` and `X`);
  `public/js/reading-data.js` turns it back into the word objects the page uses. Its header explains the format.
* `scripts/lib/osis-reading.mjs` reads the source for Reading (ketiv/qere, Aramaic, paragraph marks). It is separate from `parseOsis` on purpose: the practice
  pages are built from that one and remember words by position, so it was **not changed**. `scripts/lib/sections.mjs` is the section rule.
* *(Update 25 moved this: chapters are served by `get-reading.js`, from `netlify/functions/reading-chapters/`.)* `get-data.js` served a chapter by name (`rd-gen-1`) through the table in `reading-loaders.js`, one file at a time. **A new book** needs its OSHB and World
  English Bible files, an entry in `BOOKS` in `build-reading.mjs`, and its name in `BOOK_NAMES` in `bible-text.js` and in `bible-areas.js` (the names shown with a verse reference). Run the build;
  nothing else (no CSV rows, no loader lines).
* **Saved chapters are kept by data version, not by release.** The page asks for `…dataset=rd-gen-1&v=<version>`; the version changes only when the Reading data does,
  so `sw.js` keeps a saved chapter until then (it survives ordinary deploys) and drops the older copy of a chapter when a newer one arrives. Other datasets are still
  kept by release (Update 22).
* The page loads the index, then **one chapter at a time**, and quietly fetches the chapter after the one being read.

**The reading log (`public/js/bible-insights.js`)**
* One item per **book** (`hebrewVerbApp:bibleRead:Gen`) holding runs of verses per chapter with the day read (`{"1": [[1, 8, "2026-11-08"]]}`), and one item for the days
  (`hebrewVerbApp:bibleReadDays`). All of Genesis fits in about 2 KB (the old way: about 40 times more), and reading a passage changes only that book's item, so only that syncs.
  Two devices marking the same book while both are offline overwrite each other (the later wins); the app syncs when a tab is shown, so this is rare.
* The old single log (`bibleReadLog`) is **read once and folded in**, never written. A fingerprint of it is kept on that device only; if a device that still has the old version
  adds to it, the additions are folded in later. A verse unmarked after the move stays unmarked.
* `getReadLog()`, `getReadingStats()`, `markVerseRead()` and `unmarkVerseRead()` work as before (badges, Home and My Progress are unchanged); `markVersesRead`, `unmarkVersesRead`,
  `getChapterRead` and `getBookReadCounts` are new.

**Deleting files.** A zip cannot delete, so delete these by hand in GitHub Desktop: `netlify/functions/data/bible-reading-*.json` (11 files: Gen, Exod, Num, Deut, Josh, Ruth, 1sam, Ps, Prov, Isa, Jonah) and,
optionally, `data-source/bible/reading-passages.csv`. If left, they are ignored (test 57 notes them).

**Tests:** 43 (the page, rewritten), 48 (the data, vocabulary matching, accents, offline; rewritten), 57 (data served), 58 (the reading log and the move from the old one),
59 (the Reading build and its reader), 60 (what the page asks the server for, and saving a book). 42, 55 and 56 are unchanged.


## Update 25: the whole Hebrew Bible in Reading; Reading stands alone; Mixed Review is its own page; a new way to choose what to read

**The whole Hebrew Bible.** All 39 books (929 chapters, 23,213 verses, as the Hebrew numbers them: Joel has 4 chapters, Malachi 3) in the order of the Hebrew Bible (as in the BHS):
Torah; Former Prophets (Joshua to 2 Kings); Latter Prophets (Isaiah, Jeremiah, Ezekiel); **The Twelve** (Hosea to Malachi, each its own book); Writings (Psalms, Job, Proverbs, Ruth, Song of Songs, Ecclesiastes,
Lamentations, Esther, Daniel, Ezra, Nehemiah, 1 and 2 Chronicles). The verse totals match the standard Masoretic counts for every book (tested).
* **Sources added once** (not downloaded on deploy): `data-source/bible/<Book>.xml` for the 28 new books (Open Scriptures Hebrew Bible, 15.8 MB, same credit line) and
  `data-source/bible/english/web-<book>.json` (World English Bible, 4.2 MB), fetched from the same places as the first eleven. A new book is an entry in `BOOKS` in `scripts/build-reading.mjs`
  (with its `division`) and its name in `public/js/bible-books.js`; run the build.
* **Verse numbering.** Hebrew and English number many verses differently (Joel 3:1 is English 2:28, Malachi 3:19 is 4:1, Jonah 2:1 is 1:17, and so on). The English shown is for the Hebrew verse; the build reads the
  source's own mapping, and the one place a Hebrew verse is the *second half* of an English verse (1 Kings 22:44, which the source marks `!b`) says so instead of repeating it. Every verse has English (tested).
* **Aramaic** is flagged from the source (Daniel 2:4b–7:28, Ezra 4:8–6:18 and 7:12–26, Jeremiah 10:11, Genesis 31:47: about 4,800 words) and labelled in the tap panel. **Ketiv/qere**: 1,260 items in all
  (nine words read but not written, six written but not read, 24 with a qere of several words, 15 written phrases of two words), handled as in Update 24.
* **Poetic accents.** Psalms, Job and Proverbs use the other accent system; the accent-divisions overlay already treats them as poetry. (Practice pages are still Genesis, Ruth and Jonah.)

**Two functions, so vocabulary and the practice pages stay light.** `get-data.js` (the vocabulary, verbs, accents, practice data and the Reading *index*) is 8 MB and starts in about 60 ms;
`get-reading.js` serves the chapters (`rd-gen-1` ...), each from a small module that holds the chapter's JSON as one string (`netlify/functions/reading-chapters/rd-*.js`, made by the build, not kept in git;
`loaders.js` in that folder is kept). Measured with esbuild: 54 MB / 8.8 MB gzipped, about 330 ms to start, 1 ms a chapter; one function with everything in it was 65 MB and 460 ms for every request.
`datasetUrl()` in `bible-data.js` sends `rd-…` names to get-reading; `sw.js` keeps both by the same rules. `reading-loaders.js` (Update 24) is gone: delete `netlify/functions/data/reading-loaders.js`.

**Navigation.** **Reading** is a button of its own directly under *Bible in Context* (it is not in the group). **Mixed Review** is a page of its own at the top of *Bible in Context*, where Reading used to be
(`public/js/pages/bible-mixed.js`; the questions, answers and review scheduling are unchanged). The Reading page has no tabs now. An old "continue" point for Reading's Mixed review tab opens Reading.

**Choosing what to read (`public/js/reading-navigator.js`).** One compact panel above the verses:
* **Book**: a button naming the book; it opens a panel of all 39 books grouped as above, a thin bar under each showing how much is read, a tick on a finished book. Choosing one opens it at the first chapter not yet read.
* **Chapter**: ‹ and › arrows (which run on across the edge of a book) around a button that opens a grid of the chapter numbers: finished chapters ticked, part-read ones shaded, the current one dark.
  In the Psalms the step is called **Psalm**.
* **Passages**: a row of verse ranges ("1–8", "9–16" ...) each with the share of its vocabulary you know and a tick when read; "Easiest first" re-orders them. The passage being read is named above the verses by a plain reference ("Genesis 1:1–8").
* A panel closes on Escape, on a click elsewhere, or when a choice is made, and focus returns to its button; only one is open at a time. Everything is labelled for a screen reader (finished, % read, current). It uses the app's own colours and fonts, so every theme and dark mode follow.

**Tests:** 61 (get-reading serves all 929 chapters exactly as built), 62 (the Mixed Review page), 63 (the navigator: panels, grouping, progress marks, arrows across books, Psalms, passages, keyboard).
43, 48, 57, 59, 60 and 19 were updated; 58 (the reading log) is unchanged.
**Deleting files** (a zip cannot): `netlify/functions/data/reading-loaders.js`. (`bible-reading-*.json` and `reading-passages.csv`, from Update 24, if still there.)


## Fix: Reading chapters answered 502 once deployed

* **What went wrong:** `get-reading.js` sent a chapter's text as `(await loader()).default`. Run as written that is a string, but when
  Netlify packages the function it converts the chapter modules to CommonJS and `.default` becomes `{ default: "<json>" }`. A response
  body must be a string, so Netlify answered 502 ("cannot unmarshal object into … body of type string") and Reading showed "Could not
  load this chapter". `get-data.js` was not affected.
* **The fix:** `chapterText()` in `get-reading.js` unwraps the text either way, and refuses (with a readable 500) anything that is not text.
* **Test 64** checks the unwrapping and, if Netlify's packager is available (`ZIP_IT_DIR=<folder holding @netlify/zip-it-and-ship-it>`),
  packages the function as a deploy does and asks the packaged copy for chapters. Without the packager that part is skipped; the packager is
  not a dependency of the app. Running the code unpackaged cannot show this kind of fault.
