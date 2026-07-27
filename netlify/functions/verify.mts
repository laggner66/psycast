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
  const redirectTo = new URL(redirectPath, url.origin);
  redirectTo.search = "";

  const res = new Response(null, { status: 302 });
  res.headers.set("Location", redirectTo.toString());
  res.headers.append(
    "Set-Cookie",
    `psycast_session=${session}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; Secure; SameSite=Lax`
  );
  return res;
};
