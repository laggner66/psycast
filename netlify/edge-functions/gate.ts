// Runs on every request to /artikel/*. If the requested article's slug is
// in the gated list (see scripts/generate-access-manifest.mjs, bundled at
// build time as ./gated-slugs.json) and there is no valid session cookie,
// redirects to /login?next=<original path> instead of serving the page.
import type { Context } from "@netlify/edge-functions";
import { verifyToken } from "./_shared/crypto.ts";
import gatedSlugs from "./gated-slugs.json" with { type: "json" };

const gatedSet = new Set(gatedSlugs as string[]);

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace(/^\/artikel\//, "").replace(/\/$/, "");

  if (!gatedSet.has(slug)) {
    return context.next();
  }

  const secret = Deno.env.get("SESSION_SECRET");
  const cookie = getCookie(req, "psycast_session");
  const payload = secret ? await verifyToken(cookie, secret) : null;

  if (payload && payload.purpose === "session" && payload.email) {
    return context.next();
  }

  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("next", url.pathname);
  return Response.redirect(loginUrl, 302);
};

export const config = { path: "/artikel/*" };
