// Renders a print-ready A5 PDF brochure: one entry per pilot article with
// title, category, short excerpt and QR code. Uses the user's installed
// Google Chrome via puppeteer-core (no Chromium download).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const contentDir = path.resolve("src/content/articles");
const qrDir = path.resolve("public/qrcodes");
const outPath = path.resolve("psycast-broschuere.pdf");

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

const files = readdirSync(contentDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

const entries = files.map((file) => {
  const slug = file.replace(/\.md$/, "");
  const data = parseFrontmatter(readFileSync(path.join(contentDir, file), "utf8"));
  const qrPath = path.join(qrDir, `${slug}.png`);
  const qrBase64 = readFileSync(qrPath).toString("base64");
  return { slug, data, qrBase64 };
});

const cardsHtml = entries
  .map(
    (e) => `
    <section class="card">
      <h2>${e.data.title ?? e.slug}</h2>
      <p class="cat">${e.data.category ?? ""}</p>
      <p class="excerpt">${e.data.excerpt ?? ""}</p>
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
  @page { size: A5; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #17211f; margin: 0; }
  .cover { page-break-after: always; text-align: center; padding-top: 40mm; }
  .cover h1 { font-size: 28pt; color: #2f6f68; margin-bottom: 4mm; }
  .cover p { font-size: 11pt; color: #53615d; }
  .card { page-break-inside: avoid; page-break-after: always; padding-top: 4mm; }
  .card h2 { font-size: 15pt; color: #17211f; margin: 0 0 2mm; line-height: 1.3; }
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
  ${cardsHtml}
</body></html>`;

writeFileSync(path.resolve("brochure.tmp.html"), html, "utf8");

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
await page.goto(`file://${path.resolve("brochure.tmp.html")}`, { waitUntil: "networkidle0" });
await page.pdf({ path: outPath, format: "a5", printBackground: true });
await browser.close();

console.log(`Broschüre erzeugt: ${outPath} (${entries.length} Artikel)`);
