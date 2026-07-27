// Writes the list of gated article slugs to two places:
//  - public/access-manifest.json (informational, shipped with the site)
//  - netlify/edge-functions/gated-slugs.json (bundled into the edge
//    function so it can check access without a network round-trip)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const contentDir = path.resolve("src/content/articles");
const files = readdirSync(contentDir).filter((f) => f.endsWith(".md"));

const gated = [];
const publicSlugs = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const raw = readFileSync(path.join(contentDir, file), "utf8");
  const isPublic = /^access:\s*"?public"?/m.test(raw);
  (isPublic ? publicSlugs : gated).push(slug);
}

mkdirSync(path.resolve("public"), { recursive: true });
writeFileSync(
  path.resolve("public/access-manifest.json"),
  JSON.stringify({ public: publicSlugs, gated }, null, 2),
  "utf8"
);

mkdirSync(path.resolve("netlify/edge-functions"), { recursive: true });
writeFileSync(
  path.resolve("netlify/edge-functions/gated-slugs.json"),
  JSON.stringify(gated),
  "utf8"
);

console.log(
  `Zugriffs-Manifest erzeugt: ${publicSlugs.length} öffentlich, ${gated.length} geschützt.`
);
