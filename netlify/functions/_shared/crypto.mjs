// Minimal HMAC-signed token helper (Web Crypto only, no dependencies) used
// to issue and verify magic-link / session tokens. Duplicated (not
// imported) in netlify/edge-functions/_shared/crypto.ts because the Node
// function bundler and the Deno edge bundler resolve modules differently —
// keeping this self-contained avoids cross-runtime bundling issues.

function base64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(payload, secret) {
  const key = await importKey(secret);
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64url(sig)}`;
}

export async function verifyToken(token, secret) {
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
