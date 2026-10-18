// Sources & Credits — who the Bible text and the study references come from.
// (The Open Scriptures credit line below is the exact wording its license asks for.)

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function mount({ content, sidebarExtra }) {
  sidebarExtra.innerHTML = "";
  content.innerHTML = "";
  content.appendChild(el("h1", "page-title", "Sources & Credits"));
  content.appendChild(
    el("p", "", "This is a personal study tool, built for private learning. It is not for sale and not for redistribution. Thanks to the authors and projects below.")
  );

  content.appendChild(el("h2", "", "Bible text and grammatical tagging"));
  const bible = el("div", "bible-guide-card");
  bible.appendChild(el("p", "", "Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb"));
  const link = el("a", "", "Open Scriptures Hebrew Bible on GitHub");
  link.href = "https://github.com/openscriptures/morphhb";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  bible.appendChild(link);
  bible.appendChild(
    el(
      "p",
      "caption",
      "The Hebrew text is the Westminster Leningrad Codex (public domain). The word-by-word grammatical tagging is licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0). The grouping of articles into patterns is this app’s own, and is not endorsed by Open Scriptures."
    )
  );
  content.appendChild(bible);

  content.appendChild(el("h2", "", "Study references"));
  const refs = [
    ["Larry A. Mitchel, A Student’s Vocabulary for Biblical Hebrew and Aramaic (Updated Edition)", "Vocabulary categories, frequencies and definitions."],
    ["Page H. Kelley, Biblical Hebrew: An Introductory Grammar (2nd ed.)", "Used to check and build verb forms and parsing."],
    ["Karl V. Kutz and Rebekah L. Josberger, Learning Biblical Hebrew", "Used to check and build verb forms and parsing."],
    ["Russell T. Fuller and Kyoungwon Choi, Invitation to Biblical Hebrew: A Beginning Grammar", "Used to check and build verb forms and parsing."],
    ["Mark D. Futato Sr., Basics of Hebrew Accents", "Accent marks."],
    ["The author’s own class notes", "Dagesh, guttural and definite-article rules used in the Bible in Context practice pages (Definite Article, Dagesh, Pronominal Suffixes)."],
  ];
  const list = el("ul", "bible-credit-list");
  for (const [book, use] of refs) {
    const li = el("li");
    li.appendChild(el("strong", "", book));
    li.appendChild(document.createTextNode(" — " + use));
    list.appendChild(li);
  }
  content.appendChild(list);
}

export function unmount() {}
