// Renders a print-ready A5 PDF brochure: cover, table of contents (grouped
// by category, with page numbers), then one page per article with title,
// category, excerpt and QR code. Uses the user's installed Google Chrome via
// puppeteer-core (no Chromium download).
//
// Structural note: groupByCategory / paginateToc / assignPageNumbers are
// standalone so the same pipeline can be reused later for a full "book"
// build (e.g. scripts/generate-book.mjs) with a different per-article page
// budget instead of the brochure's fixed one-page-per-article rule.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const contentDir = path.resolve("src/content/articles");
const qrDir = path.resolve("public/qrcodes");
const outPath = path.resolve("psycast-broschuere.pdf");

// Row-weight budget per TOC page at 9.5pt on A5 (tuned by visual QA pass).
const CATEGORY_ROW_WEIGHT = 2;
const ARTICLE_ROW_WEIGHT = 1;
const TOC_PAGE_BUDGET = 24;

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!match) return data;
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    value = value.trim().replace(/^"(.*)"$/, "$1");
    data[key] = value;
  }
  return data;
}

function groupByCategory(entries) {
  const map = new Map();
  for (const e of entries) {
    const cat = e.data.category ?? "Ohne Kategorie";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(e);
  }
  const categories = [...map.keys()].sort((a, b) => a.localeCompare(b, "de"));
  return categories.map((cat) => ({
    category: cat,
    articles: map
      .get(cat)
      .sort((a, b) => (a.data.title ?? "").localeCompare(b.data.title ?? "", "de")),
  }));
}

// Splits the category groups into TOC pages using a simple row-weight
// budget, so the page count is known before rendering (needed to compute
// real page numbers for the TOC without a two-pass PDF measurement).
function paginateToc(groups) {
  const pages = [];
  let current = [];
  let used = 0;
  for (const group of groups) {
    const weight = CATEGORY_ROW_WEIGHT + group.articles.length * ARTICLE_ROW_WEIGHT;
    if (used > 0 && used + weight > TOC_PAGE_BUDGET) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(group);
    used += weight;
  }
  if (current.length) pages.push(current);
  return pages;
}

// Page 1 is the cover, then one page per TOC page, then one page per
// article in TOC order (each article card is forced to exactly one page).
function assignPageNumbers(tocPages, groups) {
  let page = 1 + tocPages.length + 1;
  for (const group of groups) {
    for (const article of group.articles) {
      article.page = page;
      page += 1;
    }
  }
}

const files = readdirSync(contentDir).filter((f) => f.endsWith(".md")).sort();

const entries = files.map((file) => {
  const slug = file.replace(/\.md$/, "");
  const data = parseFrontmatter(readFileSync(path.join(contentDir, file), "utf8"));
  const qrPath = path.join(qrDir, `${slug}.png`);
  const qrBase64 = readFileSync(qrPath).toString("base64");
  return { slug, data, qrBase64 };
});

const groups = groupByCategory(entries);
const tocPages = paginateToc(groups);
assignPageNumbers(tocPages, groups);

const tocPagesHtml = tocPages
  .map(
    (pageGroups) => `
    <section class="toc-page">
      ${pageGroups
        .map(
          (g) => `
        <h3 class="toc-cat">${g.category}</h3>
        <ul class="toc-list">
          ${g.articles
            .map(
              (a) =>
                `<li><span class="toc-title">${a.data.title ?? a.slug}</span><span class="toc-page-no">${a.page}</span></li>`
            )
            .join("\n")}
        </ul>`
        )
        .join("\n")}
    </section>`
  )
  .join("\n");

// Cards are hard-clamped to a single A5 page (fixed height + overflow
// hidden as a safety net) so the TOC page numbers computed above always
// match the real render. Title/excerpt are also pre-truncated so clipping
// essentially never triggers in practice.
function clip(text, max) {
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

const cardsHtml = groups
  .flatMap((g) => g.articles)
  .map(
    (e) => `
    <section class="card">
      <h2>${clip(e.data.title ?? e.slug, 90)}</h2>
      <p class="cat">${e.data.category ?? ""}</p>
      <p class="excerpt">${clip(e.data.excerpt ?? "", 170)}</p>
      <div class="qr-row">
        <img src="data:image/png;base64,${e.qrBase64}" alt="QR" />
        <span class="url">psycast.netlify.app/artikel/${e.slug}</span>
      </div>
    </section>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<style>
  @page { size: A5; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #17211f; margin: 0; }
  .cover { page-break-after: always; text-align: center; padding-top: 40mm; }
  .cover h1 { font-size: 28pt; color: #2f6f68; margin-bottom: 4mm; }
  .cover p { font-size: 11pt; color: #53615d; }
  .toc-page { page-break-after: always; padding-top: 2mm; height: 176mm; overflow: hidden; }
  .toc-page:first-of-type::before {
    content: "Inhaltsverzeichnis"; display: block; font-size: 16pt; color: #2f6f68;
    margin-bottom: 6mm; font-weight: bold;
  }
  .toc-cat { font-size: 10pt; color: #b87a5b; text-transform: uppercase; letter-spacing: 0.5pt;
    margin: 5mm 0 2mm; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li { display: flex; justify-content: space-between; gap: 4mm; font-size: 9.5pt;
    padding: 1mm 0; border-bottom: 0.2mm dotted #cbd3d0; }
  .toc-title { flex: 1; }
  .toc-page-no { color: #53615d; }
  .card { page-break-inside: avoid; page-break-after: always; padding-top: 4mm;
    height: 176mm; overflow: hidden; }
  .card h2 { font-size: 15pt; color: #17211f; margin: 0 0 2mm; line-height: 1.3;
    max-height: 13mm; overflow: hidden; }
  .card .cat { font-size: 9pt; color: #b87a5b; font-weight: bold; text-transform: uppercase; margin: 0 0 4mm; }
  .card .excerpt { font-size: 10.5pt; line-height: 1.5; }
  .qr-row { margin-top: 8mm; display: flex; align-items: center; gap: 5mm; }
  .qr-row img { width: 26mm; height: 26mm; }
  .qr-row .url { font-size: 8.5pt; color: #53615d; word-break: break-all; }
</style></head>
<body>
  <div class="cover">
    <h1>psycast</h1>
    <p>Artikel-Archiv der Counselorakademie</p>
    <p>${entries.length} Beiträge · QR-Code zu jedem Artikel</p>
  </div>
  ${tocPagesHtml}
  ${cardsHtml}
</body></html>`;

writeFileSync(path.resolve("brochure.tmp.html"), html, "utf8");

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
await page.goto(`file://${path.resolve("brochure.tmp.html")}`, { waitUntil: "networkidle0" });
await page.pdf({
  path: outPath,
  format: "a5",
  printBackground: true,
  displayHeaderFooter: true,
  margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
  headerTemplate: `<span></span>`,
  footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#888;font-family:Georgia,serif;"><span class="pageNumber"></span></div>`,
});
await browser.close();

console.log(
  `Broschüre erzeugt: ${outPath} (${entries.length} Artikel, ${tocPages.length} TOC-Seite(n))`
);
