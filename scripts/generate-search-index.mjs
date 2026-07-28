// Erzeugt public/search-index.json für die Volltextsuche der Website.
//
// WICHTIG - Zugriffsschutz: 359 der Artikel sind nur für eingeladene Gäste
// lesbar. Ihr Volltext darf deshalb NICHT in den öffentlich abrufbaren
// Suchindex wandern, sonst wäre die Zugangssperre wirkungslos. Für gesperrte
// Artikel werden nur Angaben aufgenommen, die ohnehin öffentlich sichtbar
// sind (Titel, Kategorie, Tags, Kurzbeschreibung) - dieselben Felder, die auch
// in Übersichtslisten und Meta-Tags stehen.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyPart } from "../src/lib/parts.js";
import { slugify } from "../src/lib/slugify.js";

const contentDir = path.resolve("src/content/articles");
const outFile = path.resolve("public/search-index.json");

// Volltext pro Artikel begrenzen: hält den Index klein genug, deckt aber den
// weit überwiegenden Teil der Beiträge vollständig ab.
const MAX_BODY_CHARS = 6000;

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = {};
  if (!match) return { data, body: raw };
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    value = value.trim().replace(/^"(.*)"$/, "$1");
    if (key === "tags") {
      const inner = value.replace(/^\[|\]$/g, "").trim();
      data.tags = inner
        ? inner.split(",").map((t) => t.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean)
        : [];
      continue;
    }
    data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

/** Markdown grob zu durchsuchbarem Klartext machen. */
function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/gu, " ")           // Codeblöcke
    .replace(/`([^`]*)`/gu, "$1")               // Inline-Code
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")     // Bilder
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")   // Links auf Linktext reduzieren
    .replace(/^[>\s]*>/gmu, " ")                // Zitatzeichen
    .replace(/^[#\s]{1,6}/gmu, " ")             // Überschriften-Rauten
    .replace(/[*_~]/gu, " ")                    // Auszeichnungen
    .replace(/^\s*[-+*]\s+/gmu, " ")            // Listenpunkte
    .replace(/\|/gu, " ")                       // Tabellenstriche
    .replace(/\s+/gu, " ")
    .trim();
}

const files = readdirSync(contentDir).filter((f) => f.endsWith(".md")).sort();

let publicCount = 0;
let gatedCount = 0;

const entries = files.map((file) => {
  const slug = file.replace(/\.md$/u, "");
  const raw = readFileSync(path.join(contentDir, file), "utf8");
  const { data, body } = parseFrontmatter(raw);

  const isPublic = (data.access ?? "gated") === "public";
  if (isPublic) publicCount++;
  else gatedCount++;

  const category = data.category ?? "";
  const title = data.title ?? slug;
  const part = classifyPart(category, title);

  const entry = {
    s: slug,
    t: title,
    c: category,
    p: part,
    g: data.tags ?? [],
    a: isPublic ? 1 : 0,
    d: data.publishDate ?? "",
    r: data.readingTime ?? "",
    e: data.excerpt ?? data.metaDescription ?? "",
  };

  // Volltext ausschließlich für frei lesbare Beiträge.
  if (isPublic) {
    entry.b = toPlainText(body).slice(0, MAX_BODY_CHARS);
  }

  return entry;
});

const index = {
  generatedAt: new Date().toISOString(),
  total: entries.length,
  publicCount,
  gatedCount,
  note:
    "Volltext (Feld b) ist nur bei frei lesbaren Beiträgen enthalten. " +
    "Für zugangsbeschränkte Beiträge sind ausschließlich öffentlich sichtbare Angaben indexiert.",
  categories: [...new Set(entries.map((e) => e.c).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")),
  parts: [...new Set(entries.map((e) => e.p))].sort((a, b) => a.localeCompare(b, "de")),
  entries,
};

writeFileSync(outFile, JSON.stringify(index), "utf8");

// Sicherheitsnetz: kein Volltext bei gesperrten Beiträgen.
const leaked = entries.filter((e) => e.a === 0 && typeof e.b === "string");
if (leaked.length) {
  console.error(`FEHLER: ${leaked.length} zugangsbeschränkte Beiträge hätten Volltext im Index.`);
  process.exit(1);
}

const bytes = readFileSync(outFile).length;
console.log(
  `Suchindex: ${entries.length} Beiträge (${publicCount} frei mit Volltext, ${gatedCount} gesperrt ohne Volltext), ` +
    `${(bytes / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), outFile)}`,
);
