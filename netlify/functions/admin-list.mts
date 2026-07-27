// GET ?adminKey=... — lists all approved email addresses. Same
// shared-secret guard as admin-approve.
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/admin-list" };

export default async (req: Request, _context: Context) => {
  const adminKey = process.env.ADMIN_KEY;
  const url = new URL(req.url);
  if (!adminKey || url.searchParams.get("adminKey") !== adminKey) {
    return new Response(JSON.stringify({ message: "Nicht autorisiert." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = getStore("approved-emails");
  const { blobs } = await store.list();
  const entries = await Promise.all(
    blobs.map(async (b) => ({
      email: b.key,
      ...(await store.get(b.key, { type: "json" }).catch(() => ({}))),
    }))
  );

  return new Response(JSON.stringify({ entries }), {
    headers: { "Content-Type": "application/json" },
  });
};
