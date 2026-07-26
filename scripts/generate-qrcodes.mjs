// Generates one QR code (PNG) per article, pointing to its live psycast URL.
// Run after content is in src/content/articles/ and before `astro build`
// (output goes to public/qrcodes/ so Astro copies it verbatim into dist/).
import { readdirSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

const SITE = "https://psycast.netlify.app";
const contentDir = path.resolve("src/content/articles");
const outDir = path.resolve("public/qrcodes");

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const files = readdirSync(contentDir).filter((f) => f.endsWith(".md"));
console.log(`Generiere ${files.length} QR-Codes ...`);

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const url = `${SITE}/artikel/${slug}`;
  const outPath = path.join(outDir, `${slug}.png`);
  await QRCode.toFile(outPath, url, {
    width: 480,
    margin: 2,
    color: { dark: "#17211f", light: "#ffffffff" },
  });
}

console.log(`Fertig: ${files.length} QR-Codes in public/qrcodes/`);
