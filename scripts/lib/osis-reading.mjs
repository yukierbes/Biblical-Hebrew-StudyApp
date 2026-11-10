// Reads the Open Scriptures Hebrew Bible (OSHB) files for the Reading page.
//
// This is separate from parseOsis() in article-rules.mjs on purpose: the practice pages are built from that parser
// and remember words by their position, so it must not change. The Reading page needs more:
//
//   Ketiv/Qere. In the source the ketiv (what is WRITTEN) is a word of bare consonants, followed by a note holding
//   the qere (what is READ) as a separate, fully pointed word. Left alone they would show as two words in a row.
//   Here each pair becomes ONE item: the ketiv's consonants (no vowels, no accents, as in the manuscript's
//   consonantal text), with the qere kept inside it for the tap panel. Three less common shapes are kept too:
//     - the qere is two or more words (Gen 30:11)        -> one item, the panel lists all the qere words
//     - a ketiv with no qere (written, not read)           -> one item, the panel says so
//     - a qere with no ketiv (read, not written; Ruth 3:5) -> a "gap" item with only the qere
//   When the note's catchWord shows the ketiv spans several words (1 Sam 20:2), those written words are joined.
//
//   Aramaic. Each word's morphology code starts with H (Hebrew) or A (Aramaic); the flag is kept on the word.
//   Paragraph marks. A petuhah (פ) or setumah (ס) at the end of a verse is noted, so chapters can be split there.

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const LETTERS = /[^\u05d0-\u05ea]/g;
const consonantsOf = (s) => s.replace(LETTERS, "");

const TOKEN = /<note\b[^>]*>[\s\S]*?<\/note>|<w ([^>]*)>([^<]*)<\/w>|<seg type="([^"]+)">([^<]*)<\/seg>/g;

function readItems(xml) {
  const items = [];
  const re = new RegExp(TOKEN.source, "g");
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      const attrs = m[1];
      const morph = (/morph="([^"]*)"/.exec(attrs) || [])[1] || "";
      items.push({
        k: "w",
        text: decode(m[2]),
        morph,
        lemma: (/lemma="([^"]*)"/.exec(attrs) || [])[1] || "",
        lang: morph[0] === "A" ? "A" : "H",
        ketiv: /type="x-ketiv"/.test(attrs),
      });
    } else if (m[3] !== undefined) {
      items.push({ k: "seg", type: m[3], text: decode(m[4]) });
    } else {
      items.push({ k: "note", raw: m[0] });
    }
  }
  return items;
}

/** Splits a catchWord such as "ל/ו־עשה" into its words. */
const catchWords = (cw) => decode(cw).split(/[\u05be\s]+/).map(consonantsOf).filter(Boolean);

/**
 * Parses an OSHB book into verses: [{ ref, para, items }]. An item is
 *   { k: "w", text, morph, lemma, lang }                     a word (text has "/" between its pieces)
 *   { k: "seg", type, text }                                 maqqef, sof pasuq, paseq, pe/samekh, ...
 *   { k: "kq", written, qere: [items], gap, wordCount }      a ketiv/qere unit (see the top of this file)
 */
export function parseReadingBook(xml) {
  const verses = [];
  const verseRe = /<verse osisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/g;
  let vm;
  while ((vm = verseRe.exec(xml))) {
    const raw = readItems(vm[2]);
    const items = [];
    for (const it of raw) {
      if (it.k !== "note") {
        items.push(it);
        continue;
      }
      const rdg = /<rdg\b[^>]*x-qere[^>]*?(?:\/>|>([\s\S]*?)<\/rdg>)/.exec(it.raw);
      if (!rdg) continue; // an editorial note or an accent variant: not shown
      const qere = rdg[1] ? readItems(rdg[1]).filter((x) => x.k === "w" || x.k === "seg") : [];
      const last = items[items.length - 1];
      if (!last || last.k !== "w" || !last.ketiv) {
        // read but not written: the qere stands in a gap of the written text
        if (qere.some((x) => x.k === "w")) items.push({ k: "kq", written: "", qere, gap: true, lang: qere.find((x) => x.k === "w").lang });
        continue;
      }
      // the written words: the ketiv alone, or (when the catchWord is longer) the words before it as well
      const cw = /<catchWord>([^<]*)<\/catchWord>/.exec(it.raw);
      const want = cw ? catchWords(cw[1]) : [];
      let take = 1;
      if (want.length > 1) {
        let n = 1;
        let i = items.length - 2;
        const got = [consonantsOf(last.text)];
        while (n < want.length && i >= 0) {
          if (items[i].k === "seg" && items[i].type === "x-maqqef") { i--; continue; }
          if (items[i].k !== "w") break;
          got.unshift(consonantsOf(items[i].text));
          n++;
          i--;
        }
        if (n === want.length && got.join("") === want.join("")) take = items.length - 1 - i;
      }
      const writtenItems = items.splice(items.length - take, take);
      let written = "";
      let afterWord = false;
      for (const x of writtenItems) {
        if (x.k === "seg") {
          if (x.type === "x-maqqef") { written += "\u05be"; afterWord = false; }
          continue;
        }
        if (afterWord) written += " ";
        written += consonantsOf(x.text);
        afterWord = true;
      }
      items.push({ k: "kq", written, qere, gap: false, ketivWord: writtenItems.length === 1 ? last : null, lang: last.lang });
    }
    verses.push({ ref: vm[1], para: items.some((x) => x.k === "seg" && (x.type === "x-pe" || x.type === "x-samekh")), items });
  }
  return verses;
}
