// Erzeugt public/llms.txt und public/robots.txt aus dem echten Bestand.
//
// llms.txt ist ein aufkommender Standard, mit dem eine Website KI-Systemen in
// kompakter Form mitteilt, worum es geht und wo die wichtigsten Einstiege
// liegen. Beides wird generiert statt gepflegt, damit Zahlen und Struktur nie
// von der Wirklichkeit abweichen.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyPart, PART_ORDER, PART_DESCRIPTIONS, ROMAN } from "../src/lib/parts.js";
import { slugify } from "../src/lib/slugify.js";

const SITE = "https://psycast.netlify.app";
const contentDir = path.resolve("src/content/articles");

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = {};
  if (!match) return data;
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    data[key] = value.trim().replace(/^"(.*)"$/, "$1");
  }
  return data;
}

const files = readdirSync(contentDir).filter((f) => f.endsWith(".md")).sort();
const articles = files.map((file) => {
  const slug = file.replace(/\.md$/u, "");
  const data = parseFrontmatter(readFileSync(path.join(contentDir, file), "utf8"));
  return {
    slug,
    title: data.title ?? slug,
    category: data.category ?? "",
    excerpt: data.excerpt ?? "",
    access: data.access ?? "gated",
    part: classifyPart(data.category ?? "", data.title ?? slug),
  };
});

const publicArticles = articles.filter((a) => a.access === "public");
const categories = [...new Set(articles.map((a) => a.category).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, "de"));

const partsPresent = PART_ORDER
  .map((name) => ({ name, items: articles.filter((a) => a.part === name) }))
  .filter((p) => p.items.length > 0)
  .map((p, i) => ({ ...p, roman: ROMAN[i], slug: slugify(p.name) }));

// ---------------------------------------------------------------- llms.txt
const lines = [];
lines.push("# psycast — Archiv der Counselorakademie");
lines.push("");
lines.push(
  `> Dauerhaft erreichbares Facharchiv mit ${articles.length} Beiträgen von Thomas Laggner ` +
    "(Counselorakademie) zu Lebens- und Sozialberatung, Mentaltraining, Mediation, Supervision, " +
    "Selbstmitgefühl und Psychoedukation. Die Beiträge stammen aus dem Blog der Counselorakademie " +
    "und wurden für das Archiv in eine durchgehende thematische Gliederung gebracht.",
);
lines.push("");
lines.push("## Über dieses Archiv");
lines.push("");
lines.push(`- Sprache: Deutsch (Österreich)`);
lines.push(`- Umfang: ${articles.length} Fachbeiträge in ${partsPresent.length} Teilen, ${categories.length} Kategorien`);
lines.push(`- Autor: Thomas Laggner, Lebens- und Sozialberater, Counselorakademie`);
lines.push(`- Quelle der Beiträge: https://www.counselorakademie.com/blog`);
lines.push(
  `- Zugang: ${publicArticles.length} Beiträge sind frei lesbar. ` +
    `Die übrigen ${articles.length - publicArticles.length} stehen persönlich eingeladenen Gästen ` +
    "nach Anmeldung zur Verfügung; ihr Volltext ist öffentlich nicht abrufbar.",
);
lines.push(
  "- Inhaltlicher Hinweis: Die Beiträge dienen Reflexion, Orientierung und Weiterbildung. " +
    "Sie ersetzen keine Psychotherapie, medizinische Behandlung, Diagnostik oder Krisenhilfe.",
);
lines.push("");
lines.push("## Einstiege");
lines.push("");
lines.push(`- [Startseite](${SITE}/): Überblick, Kategorien, neueste Beiträge`);
lines.push(`- [Thematische Gliederung](${SITE}/teile): alle ${partsPresent.length} Teile mit Beschreibung`);
lines.push(`- [Volltextsuche](${SITE}/suche): Suche über Titel, Kategorie, Schlagwort und Volltext`);
lines.push(`- [Zugang anfragen](${SITE}/zugang-anfragen): Zugang zu den nicht öffentlichen Beiträgen`);
lines.push("");
lines.push("## Thematische Teile");
lines.push("");
for (const part of partsPresent) {
  lines.push(`### Teil ${part.roman}: ${part.name}`);
  lines.push("");
  lines.push(PART_DESCRIPTIONS[part.name] ?? "");
  lines.push("");
  lines.push(`- Beiträge: ${part.items.length}`);
  lines.push(`- Übersicht: ${SITE}/teil/${part.slug}`);
  lines.push("");
}
lines.push("## Frei lesbare Beiträge");
lines.push("");
lines.push("Diese Beiträge sind ohne Anmeldung vollständig abrufbar:");
lines.push("");
for (const a of publicArticles) {
  const summary = a.excerpt ? `: ${a.excerpt.slice(0, 160)}` : "";
  lines.push(`- [${a.title}](${SITE}/artikel/${a.slug})${summary}`);
}
lines.push("");
lines.push("## Kategorien");
lines.push("");
for (const category of categories) {
  const count = articles.filter((a) => a.category === category).length;
  lines.push(`- [${category}](${SITE}/kategorie/${slugify(category)}): ${count} Beiträge`);
}
lines.push("");
lines.push("## Maschinenlesbare Ressourcen");
lines.push("");
lines.push(`- Suchindex (JSON): ${SITE}/search-index.json`);
lines.push(`- Sitemap: ${SITE}/sitemap-index.xml`);
lines.push("");

writeFileSync(path.resolve("public/llms.txt"), lines.join("\n"), "utf8");

// -------------------------------------------------------------- robots.txt
// KI-Crawler ausdrücklich erlauben: das Archiv soll in KI-Antworten
// auffindbar sein. Der Adminbereich und die Login-Strecke bleiben ausgenommen.
const aiAgents = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot", "meta-externalagent",
];

const robots = [
  "# psycast — Archiv der Counselorakademie",
  "# Klassische Suchmaschinen und KI-Systeme sind ausdrücklich willkommen.",
  "",
  "User-agent: *",
  "Allow: /",
  "Disallow: /admin",
  "Disallow: /login",
  "Disallow: /api/",
  "",
  ...aiAgents.flatMap((agent) => [`User-agent: ${agent}`, "Allow: /", ""]),
  `Sitemap: ${SITE}/sitemap-index.xml`,
  "",
].join("\n");

writeFileSync(path.resolve("public/robots.txt"), robots, "utf8");

console.log(
  `KI-Dateien: llms.txt (${partsPresent.length} Teile, ${publicArticles.length} frei lesbare Beiträge gelistet) ` +
    `und robots.txt (${aiAgents.length} KI-Agenten freigegeben) in public/ erzeugt.`,
);
