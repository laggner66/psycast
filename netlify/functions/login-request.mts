// POST { email } — if the email is on the approved list (Netlify Blobs),
// emails a short-lived magic-link via Resend. Always responds with the same
// generic message so the endpoint can't be used to check which emails are
// approved.
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { signToken } from "./_shared/crypto.mjs";

export const config = { path: "/api/login-request" };

const GENERIC_MSG =
  "Falls diese E-Mail-Adresse freigeschaltet ist, hast du in Kürze eine Nachricht mit einem Login-Link erhalten.";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let email = "";
  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return json({ message: "Ungültige Anfrage." }, 400);
  }

  if (!email || !email.includes("@")) {
    return json({ message: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  }

  const store = getStore("approved-emails");
  const approved = await store.get(email, { type: "json" }).catch(() => null);

  if (approved) {
    const secret = process.env.SESSION_SECRET;
    const siteUrl = process.env.SITE_URL ?? "https://psycast.netlify.app";
    if (!secret) {
      console.error("SESSION_SECRET fehlt — Magic-Link kann nicht signiert werden.");
      return json({ message: GENERIC_MSG });
    }

    const token = await signToken(
      { email, purpose: "login", exp: Date.now() + 15 * 60 * 1000 },
      secret
    );
    const link = `${siteUrl}/api/verify?token=${encodeURIComponent(token)}`;

    const sent = await sendMagicLinkEmail(email, link);
    if (!sent) {
      // No email provider configured yet — log so Thomas can find it in the
      // Netlify function logs and forward it manually in the meantime.
      console.log(`[psycast] Magic-Link für ${email}: ${link}`);
    }
  }

  return json({ message: GENERIC_MSG });
};

async function sendMagicLinkEmail(email: string, link: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.FROM_EMAIL ?? "psycast@counselorakademie.com";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `psycast <${from}>`,
      to: [email],
      subject: "Dein Login-Link für psycast",
      html: `<p>Hallo,</p><p>hier ist dein persönlicher Login-Link für das psycast-Archiv. Er ist 15 Minuten gültig:</p><p><a href="${link}">${link}</a></p><p>Falls du diesen Link nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>`,
    }),
  });
  return res.ok;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
