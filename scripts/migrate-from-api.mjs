// One-time full migration from the Wix Blog Data API. Reads WIX_API_KEY and
// WIX_SITE_ID from the environment (never hardcode or commit these).
// Fetches all categories, tags and posts (with rich content), converts each
// post's Ricos rich content to Markdown, and writes one file per NEW post
// (already-migrated posts, identified by originalUrl, are skipped) into
// src/content/articles/, matching the schema in src/content.config.ts.

import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const API_KEY = process.env.WIX_API_KEY;
const SITE_ID = process.env.WIX_SITE_ID;
if (!API_KEY || !SITE_ID) {
  console.error("WIX_API_KEY und WIX_SITE_ID müssen als Umgebungsvariablen gesetzt sein.");
  process.exit(1);
}

const BASE = "https://www.wixapis.com/blog/v3";
const HEADERS = { Authorization: API_KEY, "wix-site-id": SITE_ID };
const contentDir = path.resolve("src/content/articles");

async function wixGet(pathname, params) {
  const url = new URL(BASE + pathname);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${pathname} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function slugify(text) {
  return text
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchAllCategories() {
  const data = await wixGet("/categories", { "paging.limit": 100 });
  return data.categories;
}

async function fetchAllTags() {
  const tags = [];
  let offset = 0;
  while (true) {
    const data = await wixGet("/tags", { "paging.limit": 100, "paging.offset": offset });
    tags.push(...data.tags);
    offset += data.tags.length;
    if (offset >= data.metaData.total || data.tags.length === 0) break;
  }
  return tags;
}

async function fetchAllPosts() {
  const posts = [];
  let offset = 0;
  while (true) {
    const data = await wixGet("/posts", {
      "paging.limit": 50,
      "paging.offset": offset,
      fieldsets: "RICH_CONTENT",
    });
    posts.push(...data.posts);
    offset += data.posts.length;
    process.stderr.write(`  ${offset}/${data.metaData.total} Posts geladen\n`);
    if (offset >= data.metaData.total || data.posts.length === 0) break;
  }
  return posts;
}

// Converts a Wix Ricos rich-content document to Markdown. Handles the node
// types actually used by counselorakademie's posts; unknown node types fall
// back to rendering their children so nothing is silently dropped.
function renderTextNode(node) {
  let text = node.textData?.text ?? "";
  const decos = node.textData?.decorations ?? [];
  const isBold = decos.some((d) => d.type === "BOLD");
  const isItalic = decos.some((d) => d.type === "ITALIC");
  const link = decos.find((d) => d.type === "LINK");
  if (isBold) text = `**${text}**`;
  if (isItalic) text = `*${text}*`;
  if (link?.linkData?.link?.url) text = `[${text}](${link.linkData.link.url})`;
  return text;
}

function renderChildren(nodes) {
  return (nodes ?? []).map(renderNode).join("");
}

function renderNode(node) {
  switch (node.type) {
    case "TEXT":
      return renderTextNode(node);
    case "LINE_BREAK":
      return "\n";
    case "PARAGRAPH": {
      const text = renderChildren(node.nodes).trim();
      return text ? text + "\n\n" : "";
    }
    case "HEADING": {
      const level = Math.min((node.headingData?.level ?? 2) + 1, 6);
      const text = renderChildren(node.nodes).trim();
      return text ? `${"#".repeat(level)} ${text}\n\n` : "";
    }
    case "BULLETED_LIST":
      return renderList(node, "-");
    case "ORDERED_LIST":
      return renderList(node, "1.");
    case "LIST_ITEM":
      return renderChildren(node.nodes).trim();
    case "BLOCKQUOTE": {
      const text = renderChildren(node.nodes).trim();
      return text
        ? text.split("\n").map((l) => `> ${l}`).join("\n") + "\n\n"
        : "";
    }
    case "DIVIDER":
      return "---\n\n";
    case "IMAGE": {
      const url = node.imageData?.image?.src?.url;
      return url ? `![](${url})\n\n` : "";
    }
    default:
      return renderChildren(node.nodes);
  }
}

function renderList(node, marker) {
  const items = (node.nodes ?? [])
    .map((li) => renderChildren(li.nodes).trim())
    .filter(Boolean)
    .map((text) => `${marker} ${text}`);
  return items.length ? items.join("\n") + "\n\n" : "";
}

function richContentToMarkdown(richContent) {
  if (!richContent?.nodes) return "";
  return richContent.nodes.map(renderNode).join("").trim();
}

const CRISIS_KEYWORDS = [
  "suizid", "selbstmord", "selbsttötung", "suizidgedanken", "lebensmüde",
];
const CRISIS_NOTE =
  "\n\n> Wenn du selbst gerade an Suizid denkst oder in einer akuten Krise " +
  "bist: Die Telefonseelsorge ist unter 142 kostenlos, anonym und rund um " +
  "die Uhr erreichbar.";

function withCrisisNoteIfNeeded(markdown) {
  const lower = markdown.toLowerCase();
  const mentionsCrisisTopic = CRISIS_KEYWORDS.some((k) => lower.includes(k));
  const alreadyHasResource = lower.includes("telefonseelsorge");
  return mentionsCrisisTopic && !alreadyHasResource ? markdown + CRISIS_NOTE : markdown;
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function truncate(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function existingOriginalUrls() {
  const urls = new Set();
  for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".md"))) {
    const raw = readFileSync(path.join(contentDir, file), "utf8");
    const m = raw.match(/^originalUrl:\s*"?([^"\n]+)"?/m);
    if (m) urls.add(m[1].trim());
  }
  return urls;
}

async function main() {
  console.error("Lade Kategorien, Tags und Posts von der Wix Blog API...");
  const [categories, tags, posts] = await Promise.all([
    fetchAllCategories(),
    fetchAllTags(),
    fetchAllPosts(),
  ]);

  const catById = new Map(categories.map((c) => [c.id, c.label]));
  const realCatIds = categories
    .filter((c) => !/^präsenztage/i.test(c.label))
    .map((c) => c.id);
  const tagById = new Map(tags.map((t) => [t.id, t.label]));

  const already = existingOriginalUrls();
  const usedFilenames = new Set(readdirSync(contentDir).filter((f) => f.endsWith(".md")));

  let written = 0;
  let skipped = 0;

  const limit = process.env.MIGRATE_LIMIT ? Number(process.env.MIGRATE_LIMIT) : null;
  const postsToProcess = limit ? posts.slice(0, limit) : posts;

  for (const post of postsToProcess) {
    const originalUrl = `https://www.counselorakademie.com/post/${post.slug}`;
    if (already.has(originalUrl)) {
      skipped++;
      continue;
    }

    const primaryCatId = (post.categoryIds ?? []).find((id) => realCatIds.includes(id));
    const category = primaryCatId ? catById.get(primaryCatId) : "Sonstiges";
    const postTags = (post.tagIds ?? []).map((id) => tagById.get(id)).filter(Boolean);

    let body = richContentToMarkdown(post.richContent);
    body = withCrisisNoteIfNeeded(body);
    if (!body) body = post.excerpt ?? "";

    const excerptSource = (typeof post.excerpt === "string" && post.excerpt) || body || post.title;
    const excerpt = truncate(excerptSource, 200);
    const metaDescription = truncate(excerptSource, 155);

    let baseSlug = slugify(post.slug) || slugify(post.title) || post.id;
    let filename = `${baseSlug}.md`;
    let n = 2;
    while (usedFilenames.has(filename)) {
      filename = `${baseSlug}-${n}.md`;
      n++;
    }
    usedFilenames.add(filename);

    const heroImage = post.media?.wixMedia?.image?.url;
    const frontmatter = [
      "---",
      `title: ${yamlString(post.title)}`,
      `category: ${yamlString(category)}`,
      `tags: [${postTags.map(yamlString).join(", ")}]`,
      `originalUrl: ${yamlString(originalUrl)}`,
      post.minutesToRead ? `readingTime: ${yamlString(`${post.minutesToRead} Min.`)}` : null,
      heroImage ? `heroImage: ${yamlString(heroImage)}` : null,
      `excerpt: ${yamlString(excerpt)}`,
      `metaDescription: ${yamlString(metaDescription)}`,
      post.firstPublishedDate ? `publishDate: ${yamlString(post.firstPublishedDate)}` : null,
      "---",
    ]
      .filter(Boolean)
      .join("\n");

    writeFileSync(path.join(contentDir, filename), frontmatter + "\n\n" + body + "\n", "utf8");
    written++;
  }

  console.error(`Fertig: ${written} neue Artikel geschrieben, ${skipped} bereits vorhanden übersprungen.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
