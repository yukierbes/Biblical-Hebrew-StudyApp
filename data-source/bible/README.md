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
