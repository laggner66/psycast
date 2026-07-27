// POST { email, adminKey, action? } — adds (or removes, with
// action:"revoke") an email address from the approved-emails Blobs store.
// Guarded only by the ADMIN_KEY secret (shared-secret auth, appropriate for
// a single-operator invite list — not a general-purpose admin system).
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/admin-approve" };

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return json({ message: "ADMIN_KEY ist auf dem Server nicht gesetzt." }, 500);
  }

  let body: { email?: string; adminKey?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Ungültige Anfrage." }, 400);
  }

  if (body.adminKey !== adminKey) {
    return json({ message: "Falscher Admin-Key." }, 401);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ message: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  }

  const store = getStore("approved-emails");

  if (body.action === "revoke") {
    await store.delete(email);
    return json({ message: `${email} wurde entfernt.` });
  }

  await store.setJSON(email, { approvedAt: new Date().toISOString() });
  return json({ message: `${email} wurde freigeschaltet.` });
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
