# Biblical Hebrew Verb Practice — Static Web App

This is a full rewrite of the original Streamlit app (`home.py` + `review.py` +
`identification.py` + `construction.py`) as a **static, framework-free
HTML/CSS/JS single-page app** — installable as an offline-capable PWA, now
also covering Vocabulary and Accents, with optional cloud sync via Netlify.

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
│       ├── get-data.js              # Identity-protected dataset server (verbs/vocabulary/accents)
│       ├── merge-logic.js             # shared per-key "newest wins" merge, used by sync.js
│       └── data/                        # the actual datasets — NEVER publicly reachable;
│           ├── verbs.json                 # bundled into get-data.js's function package only
│           ├── vocabulary.json
│           └── accents.json
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

## Updating the verb data

If you edit `Answers.xlsx` in the future, regenerate `data/verbs.json` with
a short script like this (needs `pandas` + `openpyxl`):

```python
import pandas as pd, json

xl = pd.ExcelFile("Answers.xlsx")
out = {}
for sheet in xl.sheet_names:
    df = pd.read_excel("Answers.xlsx", sheet_name=sheet)
    df = df.loc[:, ~df.columns.str.contains("^Unnamed")]
    if "Status" in df.columns:
        df = df.drop(columns=["Status"])
    df = df.fillna("")
    out[sheet] = df.to_dict("records")

with open("data/verbs.json", "w", encoding="utf-8") as f:
    json.dump({"datasets": xl.sheet_names, "data": out}, f, ensure_ascii=False)
```

Then replace `netlify/functions/data/verbs.json` in the repo with the
regenerated file (that's the datasets' one and only location now — see
"Project structure" above) and redeploy. Bump `CACHE_VERSION` in
`public/sw.js` too, so people who already installed the app pick up the
new data properly.

## Updating the vocabulary data

`netlify/functions/data/vocabulary.json` (the datasets' one and only
location now — see "Project structure" above) is converted from a CSV with
columns `Lesson, Frequency, Hebrew, English, POS, Category`. Blank
`Category` values are kept blank on purpose (no placeholder), and
`lessonOrder` preserves the sequence lessons actually appear in the file —
that matters because the real progression (`5A`...`5Z`, `5AA`, `5BB`) isn't
alphabetical. If you edit the source spreadsheet, regenerate the JSON with:

```python
import csv, json

def clean(s):
    return " ".join((s or "").split())  # trims + collapses stray whitespace

with open("Hebrew_Vocabulary.csv", encoding="utf-8") as f:
    raw_rows = list(csv.DictReader(f))

rows, lesson_order, seen_lessons = [], [], set()
pos_set, category_set = set(), set()

for r in raw_rows:
    lesson, hebrew, english = clean(r["Lesson"]), clean(r["Hebrew"]), clean(r["English"])
    pos, category = clean(r["POS"]), clean(r["Category"])
    if lesson not in seen_lessons:
        seen_lessons.add(lesson)
        lesson_order.append(lesson)
    pos_set.add(pos)
    if category:
        category_set.add(category)
    rows.append({
        "Lesson": lesson, "Frequency": int(clean(r["Frequency"])),
        "Hebrew": hebrew, "English": english, "POS": pos, "Category": category,
    })

out = {
    "rows": rows,
    "lessonOrder": lesson_order,
    "posOrder": sorted(pos_set),
    "categoryOrder": sorted(category_set),
}
with open("data/vocabulary.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
```

Same deployment note applies — replace
`netlify/functions/data/vocabulary.json`, bump `CACHE_VERSION` in
`public/sw.js`.

## Feature overview

- **Review** — browsable/filterable verb table with CSV, Excel, and
  double-sided printable-flashcard (PDF, via the browser's print dialog)
  export — Hebrew on the front, gloss + parsing on the back, laid out so
  printing double-sided and flipping the sheet lines each answer up
  behind its question
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
  when collapsed) and independently scrollable from the page, dataset +
  filter selection with "Select all", and an Accessibility section
  (dark mode, adjustable text size 80–160%, keyboard shortcuts reference
  — also reachable by pressing `?` anywhere)
- **Keyboard support** — visible focus rings throughout; arrow keys move
  along a row of buttons or jump to the row above/below (including into
  the sidebar); `Enter` advances a quiz question / reveals an answer;
  digits `1`–`9` pick a Selection-mode answer; `Esc` closes dialogs
- **Mobile** — the sidebar becomes a full-height overlay with a
  tap-to-dismiss backdrop below 720px, rather than squeezing the page
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

