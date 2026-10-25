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
      "The Hebrew text is the Westminster Leningrad Codex (public domain). The word-by-word grammatical tagging is licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0). The Hebrew lexicon (Strong’s numbers, dictionary forms and the rough meanings shown on the Reading page) is also from the Open Scriptures project (CC BY 4.0). The practice pages use Genesis; the Reading page also uses Ruth, Deuteronomy and Psalms. The grouping into patterns is this app’s own, and is not endorsed by Open Scriptures."
    )
  );
  content.appendChild(bible);

  content.appendChild(el("h2", "", "English text"));
  const english = el("div", "bible-guide-card");
  english.appendChild(
    el("p", "", "The English shown on the Reading page is the World English Bible (WEB), which is in the public domain. It is used only when you tap “Show English”, and is not part of the Hebrew text or its tagging.")
  );
  content.appendChild(english);

  // Study references, in APA 7 format: alphabetical by author, hanging indent, titles in italics
  // (sentence case).
  content.appendChild(el("h2", "", "Study references"));
  const refs = [
    {
      apa: [
        "Fuller, R. T., & Choi, K. (2006). ",
        ["Invitation to biblical Hebrew: A beginning grammar"],
        ". Kregel Academic.",
      ],
    },
    {
      apa: ["Futato, M. D., Sr. (2020). ", ["Basics of Hebrew accents"], ". Zondervan Academic."],
    },
    {
      apa: [
        "Kelley, P. H., & Crawford, T. G. (2018). ",
        ["Biblical Hebrew: An introductory grammar"],
        " (2nd ed.). Eerdmans.",
      ],
    },
    {
      apa: [
        "Kutz, K. V., & Josberger, R. L. (2018). ",
        ["Learning biblical Hebrew: Reading for comprehension: An introductory grammar"],
        ". Lexham Press.",
      ],
    },
    {
      apa: [
        "Mitchel, L. A. (2017). ",
        ["A student’s vocabulary for biblical Hebrew and Aramaic"],
        " (Updated ed.). Zondervan Academic.",
      ],
    },
  ];
  const list = el("ul", "bible-credit-list apa-list");
  for (const { apa } of refs) {
    const li = el("li", "apa-ref");
    for (const part of apa) {
      if (Array.isArray(part)) li.appendChild(el("em", "", part[0])); // the title is italic
      else li.appendChild(document.createTextNode(part));
    }
    list.appendChild(li);
  }
  content.appendChild(list);
}

export function unmount() {}
