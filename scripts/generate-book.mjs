// Generates a full print-ready A4 PDF book from all articles in
// src/content/articles, grouped into a curated thematic structure (Teile)
// instead of the raw blog categories. Two-pass render: pass 1 renders with
// blank TOC page numbers and is used only to measure where each part/
// article actually lands (via pdfjs-dist text extraction); pass 2 renders
// the final PDF with the real page numbers filled in.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { marked } from "marked";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const contentDir = path.resolve("src/content/articles");
const tmpDir = path.resolve(".book-tmp");
const outPath = path.resolve("psycast-buch.pdf");

mkdirSync(tmpDir, { recursive: true });

const PART_ORDER = [
  "Fallgeschichten aus der Praxis",
  "Lebensberatung & Ausbildung",
  "Selbstmitgefühl & innere Arbeit",
  "Gesellschaft, Philosophie & Sonstiges",
  "Unternehmensberatung, Marketing & KI",
  "Mentaltraining, NLP & Coaching",
  "Psychische Gesundheit & Krisen",
  "Grundlagen & Menschenbild",
  "Beziehung, Bindung & Familie",
  "Methoden, Übungen & Tools",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const CAT_PART = {
  Fallgeschichten: "Fallgeschichten aus der Praxis",
  "Selbstmitgefühl": "Selbstmitgefühl & innere Arbeit",
  "Mentaltraining & NLP": "Mentaltraining, NLP & Coaching",
  "LSB Praxis": "Lebensberatung & Ausbildung",
  Unternehmensberatung: "Unternehmensberatung, Marketing & KI",
  "Z-Diagnosen": "Psychische Gesundheit & Krisen",
  KI: "Unternehmensberatung, Marketing & KI",
  "Marketing mit KI": "Unternehmensberatung, Marketing & KI",
  Supervision: "Lebensberatung & Ausbildung",
  Privat: "Gesellschaft, Philosophie & Sonstiges",
  Ausbildungen: "Lebensberatung & Ausbildung",
  Wissenswert: "Gesellschaft, Philosophie & Sonstiges",
  "Positive Psychologie": "Mentaltraining, NLP & Coaching",
  Psychosoziales: "Gesellschaft, Philosophie & Sonstiges",
  "Paartherapie & Beziehung": "Beziehung, Bindung & Familie",
  Biografiearbeit: "Lebensberatung & Ausbildung",
  Mediation: "Lebensberatung & Ausbildung",
};

// Keyword rules applied to articles whose blog category was "Sonstiges" (or
// missing). First matching rule wins; unmatched titles fall back to the
// closing "Gesellschaft, Philosophie & Sonstiges" part.
const RULES = [
  ["Grundlagen & Menschenbild", ["personzentriert", "rogers", "menschenbild", "aktualisierungstendenz",
    "watzlawick", "individualpsychologie", "adler", "sachse", "diagnostik im personzentrierten",
    "bio-psycho-soziale", "systemtheorie", "therapeutische beziehung"]],
  ["Psychische Gesundheit & Krisen", ["burnout", "angst", "trauma", "krise", "depression", "sucht",
    "zittern", "forensische psychiatrie", "demenz", "panik", "realitätsverlust", "psychotraumat"]],
  ["Beziehung, Bindung & Familie", ["bindung", "bowlby", "trennung", "scheidung", "co-abhängigkeit",
    "elternarbeit", "polyamor", "misstrauen", "zwei nicht mehr", "parentifizierung"]],
  ["Selbstmitgefühl & innere Arbeit", ["kränkung", "selbstmitgefühl", "selbstwert", "resilien",
    "mitleid oder mitgefühl", "achtsam", "ego depletion", "zuckersucht", "perfektion"]],
  ["Methoden, Übungen & Tools", ["johari", "motto-ziel", "genogramm", "stuhlübung", "zwischen ich und du",
    "meditation", "einsprech-skript", "plananalyse", "nägel auf einem nagelkopf", "team-fallblatt",
    "reflexionshilfen", "gruppenprozess", "zielprozess"]],
  ["Gesellschaft, Philosophie & Sonstiges", ["höhlengleichnis", "politisierung", "niedergang des westens",
    "philosophie", "eudaimonia", "unterrichtsprinzipien", "fürsorgepflicht der schule", "nudging",
    "nlp-techniken"]],
  ["Lebensberatung & Ausbildung", ["lebensberater", "lehrgang", "präsenztage", "wko beratungsförderung",
    "supervision", "psychodynamisch verstehen", "inhalte vom"]],
];
const FALLBACK = "Gesellschaft, Philosophie & Sonstiges";

function parseArticle(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = {};
  if (!match) return { data, body: raw };
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    value = value.trim().replace(/^"(.*)"$/, "$1");
    data[key] = value;
  }
  const body = raw.slice(match[0].length);
  return { data, body };
}

function classify(cat, title) {
  if (CAT_PART[cat]) return CAT_PART[cat];
  const t = title.toLowerCase();
  for (const [part, kws] of RULES) {
    if (kws.some((kw) => t.includes(kw))) return part;
  }
  return FALLBACK;
}

function esc(s) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const files = readdirSync(contentDir).filter((f) => f.endsWith(".md")).sort();

const entries = files.map((file) => {
  const slug = file.replace(/\.md$/, "");
  const raw = readFileSync(path.join(contentDir, file), "utf8");
  const { data, body } = parseArticle(raw);
  const part = classify(data.category ?? "", data.title ?? slug);
  return { slug, data, body, part };
});

const LIMIT = process.env.BOOK_LIMIT ? Number(process.env.BOOK_LIMIT) : null;
const usedEntries = LIMIT ? entries.slice(0, LIMIT) : entries;

const byPart = new Map(PART_ORDER.map((p) => [p, []]));
for (const e of usedEntries) byPart.get(e.part).push(e);
for (const list of byPart.values()) {
  list.sort((a, b) => (a.data.title ?? "").localeCompare(b.data.title ?? "", "de"));
}

// Parts without any article would otherwise emit a divider page plus an empty
// column flow, i.e. one or two completely blank pages. Drop them and renumber
// the roman numerals so the sequence stays gapless.
const orderedParts = PART_ORDER.map((name) => ({ name, articles: byPart.get(name) }))
  .filter((part) => part.articles.length > 0)
  .map((part, i) => ({
    name: part.name,
    roman: ROMAN[i],
    anchor: `part-${i}`,
    articles: part.articles,
  }));

console.log(`${usedEntries.length} Artikel in ${orderedParts.length} Teilen geladen.`);

const today = new Date().toLocaleDateString("de-AT", { year: "numeric", month: "long", day: "numeric" });

function tocHtml(pageNo) {
  return orderedParts
    .map((part) => {
      const partPage = pageNo.get(`part:${part.anchor}`) ?? "";
      const rows = part.articles
        .map((a) => {
          const p = pageNo.get(`art:${a.slug}`) ?? "";
          return `<li><span class="toc-title">${esc(a.data.title ?? a.slug)}</span><span class="toc-dots"></span><span class="toc-page-no">${p}</span></li>`;
        })
        .join("\n");
      return `
        <div class="toc-part">
          <h3 class="toc-part-h"><span class="toc-part-name"><span class="toc-roman">Teil ${part.roman}</span> ${esc(part.name)}</span><span class="toc-page-no toc-part-page">${partPage}</span></h3>
          <ul class="toc-list">${rows}</ul>
        </div>`;
    })
    .join("\n");
}

function articleHtml(a) {
  const meta = [a.data.category, a.data.readingTime].filter(Boolean).join(" · ");
  const bodyHtml = marked.parse(a.body || "");
  // Jeder Artikel bekommt seinen EIGENEN zweispaltigen Block. Ein einziger
  // mehrspaltiger Fluss über alle Artikel eines Teils (also über bis zu ~100
  // Seiten) lässt Chrome stillschweigend Inhalte auslassen - damit fehlten
  // zuvor 31 Artikel im PDF. Kleine, artikelweise Container sind zuverlässig.
  // Kein page-break davor: der Artikel beginnt direkt unter dem vorherigen,
  // dadurch bleibt keine Seite halb leer.
  return `
    <section class="article" id="art-${a.slug}">
      <header class="art-head">
        <span class="marker">§ART:${a.slug}§</span>
        <p class="art-eyebrow">${esc(a.part)}</p>
        <h1>${esc(a.data.title ?? a.slug)}</h1>
        ${meta ? `<p class="art-meta">${esc(meta)}</p>` : ""}
      </header>
      <div class="art-body">${bodyHtml}</div>
    </section>`;
}

function partDividerHtml(part) {
  return `
    <section class="part-divider" id="part-${part.anchor}">
      <span class="marker">§PART:${part.anchor}§</span>
      <div class="pd-rule"></div>
      <div class="pd-roman">Teil ${part.roman}</div>
      <h2>${esc(part.name)}</h2>
      <p class="pd-count">${part.articles.length} Beiträge</p>
    </section>`;
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    color: #17211f; margin: 0; font-size: 10.8pt; line-height: 1.55;
    -webkit-font-feature-settings: "liga" 1, "kern" 1; font-kerning: normal; }

  /* ---- Titelseite ---- */
  .cover { page-break-after: always; text-align: center; padding-top: 58mm; }
  .cover-rule { width: 30mm; height: 0.6mm; background: #b87a5b; margin: 0 auto; }
  .cover h1 { font-size: 46pt; color: #2f6f68; margin: 10mm 0 3mm; font-weight: normal; letter-spacing: -1pt; }
  .cover .cover-sub { font-size: 15pt; color: #17211f; margin: 0 0 14mm; font-style: italic; }
  .cover p { font-size: 10.5pt; color: #53615d; margin: 2mm auto; max-width: 110mm; line-height: 1.6; }
  .cover .cover-imprint { margin-top: 22mm; font-size: 9.5pt; color: #445049; }

  /* ---- Impressum / Über dieses Buch ---- */
  .frontmatter { page-break-after: always; padding-top: 24mm; font-size: 9.8pt; color: #445049;
    max-width: 128mm; margin: 0 auto; line-height: 1.62; }
  .frontmatter h2 { font-size: 15pt; color: #2f6f68; margin: 0 0 5mm; font-weight: normal; }
  .frontmatter p { margin: 0 0 3.5mm; text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
  .frontmatter .fm-note { margin-top: 8mm; padding-top: 3mm; border-top: 0.15mm solid #cbd3d0;
    font-size: 8.8pt; font-style: italic; }

  /* ---- Inhaltsverzeichnis: zweispaltig, damit es kompakt bleibt ---- */
  .toc-header { page-break-before: always; font-size: 22pt; color: #2f6f68; margin: 0 0 2mm;
    font-weight: normal; }
  .toc-intro { font-size: 9pt; color: #53615d; font-style: italic; margin: 0 0 6mm;
    padding-bottom: 3mm; border-bottom: 0.15mm solid #cbd3d0; }
  .toc-wrap { column-count: 2; column-gap: 9mm; }
  .toc-part { margin-bottom: 4mm; break-inside: avoid-page; }
  .toc-part-h { font-size: 9.5pt; color: #b87a5b; text-transform: uppercase; letter-spacing: 0.3pt;
    margin: 3mm 0 1.5mm; display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 0.15mm solid #e2e7e4; padding-bottom: 1mm; }
  .toc-part-name { flex: 1 1 auto; padding-right: 2mm; }
  .toc-roman { color: #2f6f68; margin-right: 1.5mm; white-space: nowrap; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li { display: flex; align-items: baseline; gap: 1.5mm; font-size: 8.2pt; padding: 0.45mm 0; }
  .toc-title { flex: 0 1 auto; }
  .toc-dots { flex: 1 1 auto; border-bottom: 0.15mm dotted #cbd3d0; margin-bottom: 0.9mm; min-width: 3mm; }
  .toc-page-no { color: #53615d; flex: 0 0 auto; font-variant-numeric: tabular-nums; }
  /* Unsichtbare Messmarken.
     - white-space: nowrap, damit der Marker nicht über eine Spalten- oder
       Seitengrenze umbricht.
     - Ligaturen ABGESCHALTET und Monospace-Schrift: die Serifenschrift setzt
       "fi"/"fl" als eine Ligaturglyphe, die bei der PDF-Textextraktion nicht
       auf die Einzelbuchstaben zurückgemappt wird. Dadurch waren zuvor genau
       jene 31 Marker unauffindbar, deren Slug "fi" oder "fl" enthält. */
  .marker { font-size: 1px; color: #fffffe; line-height: 0; white-space: nowrap;
    font-family: "Courier New", monospace;
    font-variant-ligatures: none; -webkit-font-variant-ligatures: none;
    font-feature-settings: "liga" 0, "clig" 0, "dlig" 0; }
`;

const CSS2 = `
  /* ---- Teil-Trennseiten: bewusst großzügig, das ist der einzige Weißraum ---- */
  .part-divider { page-break-before: always; text-align: center; padding-top: 82mm; break-after: page; }
  .pd-rule { width: 22mm; height: 0.5mm; background: #b87a5b; margin: 0 auto 8mm; }
  .pd-roman { font-size: 15pt; color: #b87a5b; letter-spacing: 3pt; text-transform: uppercase; }
  .part-divider h2 { font-size: 26pt; color: #2f6f68; margin: 6mm auto; font-weight: normal;
    line-height: 1.2; max-width: 120mm; }
  .pd-count { font-size: 9.5pt; color: #53615d; font-style: italic; }

  /* ---- Artikel laufen fortlaufend weiter, kein Seitenumbruch davor ---- */
  .article { margin: 0; }
  .article + .article { margin-top: 6.5mm; }

  /* Artikelkopf über der voller Breite; Spalten stecken im Artikelkörper. */
  .art-head {
    break-after: avoid-page;
    page-break-after: avoid;
    break-inside: avoid;
    border-top: 0.4mm solid #2f6f68;
    padding-top: 2.5mm;
    margin-bottom: 3.5mm;
    text-align: left;
  }
  .part-divider + .article > .art-head { border-top: none; padding-top: 0; }
  .art-eyebrow { font-size: 7.5pt; color: #b87a5b; text-transform: uppercase; letter-spacing: 0.6pt; margin: 0 0 1mm; }
  .art-head h1 { font-size: 15pt; color: #17211f; margin: 0 0 1.5mm; line-height: 1.25; font-weight: normal; }
  .art-meta { font-size: 8pt; color: #53615d; margin: 0; font-style: italic; }

  /* ---- Zweispaltiger Satz: füllt jede Seite vollständig ---- */
  .art-body {
    column-count: ${process.env.BOOK_COLUMNS ?? 2};
    column-gap: 9mm;
    column-rule: 0.15mm solid #e2e7e4;
    font-size: 9.6pt;
    line-height: 1.5;
    text-align: justify;
    hyphens: auto;
    -webkit-hyphens: auto;
    orphans: 3;
    widows: 3;
  }
  .art-body > :first-child { margin-top: 0; }
  /* Initial im ersten Absatz jedes Artikels */
  .art-body > p:first-of-type::first-letter {
    float: left; font-size: 26pt; line-height: 0.86; color: #2f6f68;
    padding: 0.6mm 1.2mm 0 0; font-weight: normal;
  }
  /* Zwischentitel niemals im Blocksatz - sonst reißen die Wortabstände auf. */
  .art-body h2, .art-body h3, .art-body h4, .art-body h5, .art-body h6 {
    text-align: left; hyphens: none; -webkit-hyphens: none;
    break-after: avoid-page; page-break-after: avoid; }
  .art-body h2 { font-size: 11pt; color: #2f6f68; margin: 4.5mm 0 1.5mm; font-weight: bold; }
  .art-body h3 { font-size: 10pt; color: #2f6f68; margin: 4mm 0 1.5mm; font-weight: bold; }
  .art-body h4 { font-size: 9.6pt; color: #445049; margin: 3.5mm 0 1mm; font-weight: bold; }
  .art-body h5, .art-body h6 { font-size: 9.4pt; color: #445049; margin: 3mm 0 1mm; font-weight: bold; }
  .art-body p { margin: 0 0 2.4mm; }
  .art-body ul, .art-body ol { margin: 0 0 2.4mm; padding-left: 5mm; text-align: left; }
  .art-body li { margin-bottom: 0.8mm; }
  .art-body strong { color: #17211f; }
  .art-body a { color: #2f6f68; text-decoration: none; }
  .art-body blockquote { border-left: 0.5mm solid #b87a5b; margin: 2.4mm 0; padding: 0.5mm 0 0.5mm 3mm;
    color: #445049; font-style: italic; text-align: left; break-inside: avoid; }
  .art-body table { width: 100%; border-collapse: collapse; margin: 2.4mm 0; font-size: 8pt;
    text-align: left; break-inside: avoid; }
  .art-body th, .art-body td { border: 0.15mm solid #cbd3d0; padding: 1mm 1.4mm; text-align: left; vertical-align: top; }
  .art-body th { background: #f2f5f3; }
  .art-body img { max-width: 100%; }
  .art-body hr { border: none; border-top: 0.15mm solid #cbd3d0; margin: 3mm 0; }
  .art-body pre { white-space: pre-wrap; word-wrap: break-word; font-size: 8pt; text-align: left; }
`;

function buildHtml(pageNo) {
  const contentHtml = orderedParts
    .map(
      (part) =>
        partDividerHtml(part) + "\n" + part.articles.map(articleHtml).join("\n"),
    )
    .join("\n");

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" /><style>${CSS}${CSS2}</style></head>
<body>
  <div class="cover">
    <div class="cover-rule"></div>
    <h1>psycast</h1>
    <p class="cover-sub">Das Archiv-Buch</p>
    <p>${usedEntries.length} Beiträge aus dem Blog der Counselorakademie,
    gegliedert in ${orderedParts.length} thematische Teile</p>
    <p class="cover-imprint">Thomas Laggner · Counselorakademie</p>
  </div>
  <div class="frontmatter">
    <h2>Über dieses Buch</h2>
    <p>Dieses Buch fasst alle ${usedEntries.length} Artikel des psycast-Archivs zusammen, das seinerseits
    den Blog der Counselorakademie (counselorakademie.com/blog) dauerhaft sichert. Die Artikel wurden
    aus den ursprünglichen Blog-Kategorien in eine neue, thematische Gliederung überführt, um sie als
    zusammenhängendes Nachschlagewerk lesbar zu machen.</p>
    <p>Der Satz folgt einem klassischen zweispaltigen Buchlayout: Die Beiträge laufen fortlaufend
    weiter, statt jeweils eine neue Seite zu beginnen. Jede Seite ist dadurch vollständig mit Inhalt
    gefüllt; nur die Teil-Trennseiten setzen bewusst eine Pause.</p>
    <p>Herausgegeben von Thomas Laggner · Counselorakademie. Stand: ${today}.</p>
    <p class="fm-note">Dieses Buch ersetzt keine Psychotherapie, medizinische Behandlung oder Krisenhilfe.</p>
  </div>
  <div class="toc-header">Inhaltsverzeichnis</div>
  <p class="toc-intro">${orderedParts.length} Teile · ${usedEntries.length} Beiträge</p>
  <div class="toc-wrap">
  ${tocHtml(pageNo)}
  </div>
  ${contentHtml}
</body></html>`;
}

async function renderPdf(html, htmlPath, pdfPath) {
  writeFileSync(htmlPath, html, "utf8");
  // Der zweispaltige Satz über alle Artikel ist rechenintensiv: Chrome braucht
  // dafür deutlich länger als die 30-Sekunden-Standardtimeouts von Puppeteer.
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 0,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 0 });
  await page.pdf({
    path: pdfPath,
    timeout: 0,
    format: "a4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: "18mm", bottom: "16mm", left: "17mm", right: "17mm" },
    headerTemplate: `<span></span>`,
    footerTemplate: `<div style="font-size:8.5px;width:100%;text-align:center;color:#7d8a85;font-family:Georgia,serif;letter-spacing:0.5px;"><span class="pageNumber"></span></div>`,
  });
  await browser.close();
}

// Typografische Ligaturen zurück in Einzelbuchstaben übersetzen. Ohne das
// liefert die PDF-Textextraktion "Reexion" statt "Reflexion", weil fi/fl als
// eine einzige Glyphe gesetzt werden.
const LIGATURES = [
  [/ﬀ/gu, "ff"], [/ﬁ/gu, "fi"], [/ﬂ/gu, "fl"],
  [/ﬃ/gu, "ffi"], [/ﬄ/gu, "ffl"], [/ﬅ/gu, "st"], [/ﬆ/gu, "st"],
];

function unligature(text) {
  let out = text;
  for (const [pattern, replacement] of LIGATURES) out = out.replace(pattern, replacement);
  return out;
}

async function measurePages(pdfPath) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const content = await p.getTextContent();
    pageTexts.push(unligature(content.items.map((it) => it.str).join("")));
  }
  return { numPages: doc.numPages, pageTexts };
}

function markerSequence() {
  const seq = [];
  for (const part of orderedParts) {
    seq.push({ key: `part:${part.anchor}`, marker: `§PART:${part.anchor}§` });
    for (const a of part.articles) seq.push({ key: `art:${a.slug}`, marker: `§ART:${a.slug}§` });
  }
  return seq;
}

function findPageNumbers(pageTexts, seq) {
  const pageNo = new Map();
  let cursor = 0; // 0-based index into pageTexts
  const missing = [];
  for (const { key, marker } of seq) {
    let found = -1;
    for (let i = cursor; i < pageTexts.length; i++) {
      if (pageTexts[i].includes(marker)) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      missing.push(key);
      continue;
    }
    pageNo.set(key, found + 1); // 1-indexed page number
    cursor = found; // next marker must be on this page or later
  }
  return { pageNo, missing };
}

async function main() {
  console.log("Pass 1: Messung...");
  const pass1Html = buildHtml(new Map());
  await renderPdf(pass1Html, path.join(tmpDir, "pass1.html"), path.join(tmpDir, "pass1.pdf"));
  const { numPages, pageTexts } = await measurePages(path.join(tmpDir, "pass1.pdf"));
  const seq = markerSequence();
  const { pageNo, missing } = findPageNumbers(pageTexts, seq);
  console.log(`Pass 1 fertig: ${numPages} Seiten, ${seq.length - missing.length}/${seq.length} Marker gefunden.`);
  if (missing.length) console.warn("Nicht gefunden:", missing.slice(0, 20));

  console.log("Pass 2: finaler Render...");
  const finalHtml = buildHtml(pageNo);
  await renderPdf(finalHtml, path.join(tmpDir, "pass2.html"), outPath);
  const final = await measurePages(outPath);

  // Vollständigkeitsprüfung: Chrome kann bei mehrspaltigem Satz Inhalte
  // auslassen, ohne einen Fehler zu melden. Deshalb wird gegengeprüft, dass
  // jeder Artikel wirklich im fertigen PDF steht - sonst schlägt der Build fehl.
  const allText = final.pageTexts.join("\n");
  const absent = seq.filter(({ marker }) => !allText.includes(marker));
  console.log(
    `Buch erzeugt: ${outPath} (${usedEntries.length} Artikel, ${orderedParts.length} Teile, ${final.numPages} Seiten)`,
  );
  if (absent.length) {
    console.error(
      `\nFEHLER: ${absent.length} von ${seq.length} Abschnitten fehlen im fertigen PDF:`,
    );
    for (const { key } of absent.slice(0, 40)) console.error(`  - ${key}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Vollständigkeit geprüft: alle ${seq.length} Abschnitte sind im PDF enthalten.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
