// Minimal HMAC-signed token verifier (Web Crypto only). Mirrors
// netlify/functions/_shared/crypto.mjs — duplicated on purpose, see the
// comment there.

function base64urlToBytes(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

export async function verifyToken(
  token: string | undefined | null,
  secret: string
): Promise<Record<string, unknown> | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
