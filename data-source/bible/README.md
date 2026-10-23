# Bible text (Open Scriptures Hebrew Bible)

`Gen.xml` is the Book of Genesis from the **Open Scriptures Hebrew Bible (OSHB)**,
downloaded unchanged from https://github.com/openscriptures/morphhb (folder `wlc/`,
downloaded 17 October 2026; the file's own history says "Release of full morphology", 2018.12.14).

* The Hebrew text is the Westminster Leningrad Codex (public domain).
* The word-by-word grammatical tagging is CC BY 4.0. Required credit:
  "Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb".
  The full license text is in `OSHB-LICENSE.md`. The credit is also shown inside the app (Sources & Credits).
* Do not edit `Gen.xml`. To add a book, download its file from the same folder and put it here unchanged,
  then add it in `scripts/build-bible.mjs`.
* `passages.csv` is yours to edit: the guided passages on the Definite Article in Context page.
  Columns: Title, Start, End, Note. Start and End are `chapter:verse` in Genesis, e.g. `1:1` and `1:5`.

## The Hebrew lexicon (`HebrewStrong.xml`)

`HebrewStrong.xml` is the Open Scriptures Hebrew Lexicon's Strong's file, downloaded unchanged from
https://github.com/openscriptures/HebrewLexicon (file `HebrewStrong.xml`, downloaded 21 October 2026). It is used only at build time, to work out the root of
each verb so the **Verbs** page can sort verbs into the strong verb and the weak verb types. The lexicon is licensed CC BY 4.0, with the same credit line as the
Bible text ("Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb"), which is shown on Sources & Credits.
No lexicon text is shown in the app. Please re-check the license in that repository before sharing this project beyond the invited group.
