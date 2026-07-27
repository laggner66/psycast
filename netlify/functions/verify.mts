// GET ?token=... — validates a magic-link token and, if valid, sets a
// long-lived signed session cookie and redirects to the originally
// requested page (or the homepage).
import type { Context } from "@netlify/functions";
import { signToken, verifyToken } from "./_shared/crypto.mjs";

export const config = { path: "/api/verify" };

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    return new Response("Server ist nicht korrekt konfiguriert (SESSION_SECRET fehlt).", {
      status: 500,
    });
  }

  const payload = await verifyToken(token, secret);
  if (!payload || payload.purpose !== "login" || typeof payload.email !== "string") {
    return Response.redirect(new URL("/login?error=invalid", url.origin), 302);
  }

  const session = await signToken(
    { email: payload.email, purpose: "session", exp: Date.now() + THIRTY_DAYS * 1000 },
    secret
  );

  const next = url.searchParams.get("next");
  const redirectPath = next && next.startsWith("/") ? next : "/";

  // Netlify's routing for custom `config.path` functions appends the
  // original request's query string to any Location header we return, so a
  // plain 302 can't be used here (it would leak the token into the target
  // URL). Serving a tiny HTML page with a client-side redirect sidesteps
  // that platform behavior entirely.
  const escapedPath = redirectPath.replace(/"/g, "&quot;");
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${escapedPath}">
<title>Weiterleitung …</title></head>
<body>Du wirst weitergeleitet … <a href="${escapedPath}">Klicke hier, falls das nicht automatisch passiert.</a>
<script>location.replace(${JSON.stringify(redirectPath)});</script>
</body></html>`;

  const res = new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  res.headers.append(
    "Set-Cookie",
    `psycast_session=${session}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; Secure; SameSite=Lax`
  );
  return res;
};
