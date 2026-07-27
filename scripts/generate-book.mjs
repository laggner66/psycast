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

const orderedParts = PART_ORDER.map((name, i) => ({
  name,
  roman: ROMAN[i],
  anchor: `part-${i}`,
  articles: byPart.get(name),
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
          <h3 class="toc-part-h"><span class="toc-roman">Teil ${part.roman}</span> ${esc(part.name)}
            <span class="toc-page-no toc-part-page">${partPage}</span></h3>
          <ul class="toc-list">${rows}</ul>
        </div>`;
    })
    .join("\n");
}

function articleHtml(a) {
  const meta = [a.data.category, a.data.readingTime].filter(Boolean).join(" · ");
  const bodyHtml = marked.parse(a.body || "");
  return `
    <section class="article" id="art-${a.slug}">
      <span class="marker">§ART:${a.slug}§</span>
      <p class="art-eyebrow">${esc(a.part)}</p>
      <h1>${esc(a.data.title ?? a.slug)}</h1>
      ${meta ? `<p class="art-meta">${esc(meta)}</p>` : ""}
      <div class="art-body">${bodyHtml}</div>
    </section>`;
}

function partDividerHtml(part) {
  return `
    <section class="part-divider" id="part-${part.anchor}">
      <span class="marker">§PART:${part.anchor}§</span>
      <div class="pd-roman">${part.roman}</div>
      <h2>${esc(part.name)}</h2>
      <p class="pd-count">${part.articles.length} Beiträge</p>
    </section>`;
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #17211f; margin: 0; font-size: 10.8pt; line-height: 1.55; }
  .cover { page-break-after: always; text-align: center; padding-top: 70mm; }
  .cover h1 { font-size: 30pt; color: #2f6f68; margin: 0 0 4mm; }
  .cover p { font-size: 11pt; color: #53615d; margin: 2mm 0; }
  .cover .cover-sub { font-size: 13pt; color: #17211f; margin-top: 8mm; }
  .frontmatter { page-break-after: always; padding-top: 20mm; font-size: 9.5pt; color: #445049; }
  .frontmatter h2 { font-size: 13pt; color: #2f6f68; margin-bottom: 4mm; }
  .frontmatter p { margin: 0 0 3mm; }
  .toc-header { page-break-before: always; font-size: 18pt; color: #2f6f68; margin: 0 0 6mm; font-weight: bold; }
  .toc-part { margin-bottom: 5mm; break-inside: avoid-page; }
  .toc-part-h { font-size: 11pt; color: #b87a5b; text-transform: uppercase; letter-spacing: 0.3pt;
    margin: 4mm 0 2mm; display: flex; justify-content: space-between; }
  .toc-roman { color: #2f6f68; margin-right: 2mm; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li { display: flex; align-items: baseline; gap: 2mm; font-size: 9pt; padding: 0.6mm 0; }
  .toc-title { flex: 0 1 auto; }
  .toc-dots { flex: 1 1 auto; border-bottom: 0.2mm dotted #cbd3d0; margin-bottom: 1mm; }
  .toc-page-no { color: #53615d; flex: 0 0 auto; }
  .marker { font-size: 1px; color: #fffffe; line-height: 0; }
`;

const CSS2 = `
  .part-divider { page-break-before: always; text-align: center; padding-top: 90mm; break-after: page; }
  .pd-roman { font-size: 40pt; color: #b87a5b; font-weight: bold; }
  .part-divider h2 { font-size: 20pt; color: #2f6f68; margin: 4mm 0; }
  .pd-count { font-size: 10pt; color: #53615d; }
  .article { page-break-before: always; padding-top: 4mm; }
  .art-eyebrow { font-size: 8.5pt; color: #b87a5b; text-transform: uppercase; letter-spacing: 0.4pt; margin: 0; }
  .article h1 { font-size: 16.5pt; color: #17211f; margin: 1mm 0 2mm; line-height: 1.3; }
  .art-meta { font-size: 8.5pt; color: #53615d; margin: 0 0 5mm; }
  .art-body { font-size: 10.5pt; }
  .art-body h2 { font-size: 13pt; color: #2f6f68; margin: 6mm 0 2mm; }
  .art-body h3 { font-size: 11.5pt; color: #2f6f68; margin: 5mm 0 2mm; }
  .art-body h4 { font-size: 10.5pt; color: #445049; margin: 4mm 0 2mm; }
  .art-body p { margin: 0 0 3mm; text-align: justify; }
  .art-body ul, .art-body ol { margin: 0 0 3mm; padding-left: 6mm; }
  .art-body li { margin-bottom: 1mm; }
  .art-body strong { color: #17211f; }
  .art-body a { color: #2f6f68; text-decoration: none; }
  .art-body blockquote { border-left: 0.6mm solid #b87a5b; margin: 3mm 0; padding: 1mm 0 1mm 4mm; color: #445049; font-style: italic; }
  .art-body table { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 9pt; }
  .art-body th, .art-body td { border: 0.2mm solid #cbd3d0; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
  .art-body th { background: #f2f5f3; }
  .art-body img { max-width: 100%; }
  .art-body hr { border: none; border-top: 0.2mm solid #cbd3d0; margin: 4mm 0; }
`;

function buildHtml(pageNo) {
  const contentHtml = orderedParts
    .map((part) => partDividerHtml(part) + part.articles.map(articleHtml).join("\n"))
    .join("\n");

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" /><style>${CSS}${CSS2}</style></head>
<body>
  <div class="cover">
    <h1>psycast</h1>
    <p class="cover-sub">Das Archiv-Buch</p>
    <p>${usedEntries.length} Beiträge aus dem Blog der Counselorakademie, in ${orderedParts.length} Teilen</p>
  </div>
  <div class="frontmatter">
    <h2>Über dieses Buch</h2>
    <p>Dieses Buch fasst alle ${usedEntries.length} Artikel des psycast-Archivs zusammen, das seinerseits
    den Blog der Counselorakademie (counselorakademie.com/blog) dauerhaft sichert. Die Artikel wurden
    aus den ursprünglichen Blog-Kategorien in eine neue, thematische Gliederung überführt, um sie als
    zusammenhängendes Nachschlagewerk lesbar zu machen.</p>
    <p>Herausgegeben von Thomas Laggner · Counselorakademie. Stand: ${today}.</p>
    <p>Dieses Buch ersetzt keine Psychotherapie, medizinische Behandlung oder Krisenhilfe.</p>
  </div>
  <div class="toc-header">Inhaltsverzeichnis</div>
  ${tocHtml(pageNo)}
  ${contentHtml}
</body></html>`;
}

async function renderPdf(html, htmlPath, pdfPath) {
  writeFileSync(htmlPath, html, "utf8");
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 0 });
  await page.pdf({
    path: pdfPath,
    format: "a4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: "20mm", bottom: "18mm", left: "24mm", right: "24mm" },
    headerTemplate: `<span></span>`,
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#888;font-family:Georgia,serif;"><span class="pageNumber"></span></div>`,
  });
  await browser.close();
}

async function measurePages(pdfPath) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const content = await p.getTextContent();
    pageTexts.push(content.items.map((it) => it.str).join(""));
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
  console.log(`Buch erzeugt: ${outPath} (${usedEntries.length} Artikel, ${orderedParts.length} Teile, ${final.numPages} Seiten)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
