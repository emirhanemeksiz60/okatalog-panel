import type { NextRequest } from "next/server";

/** HttpOnly admin oturum çerezi */
export const ADMIN_SESSION_COOKIE = "admin_session";

const enc = new TextEncoder();
const dec = new TextDecoder();

function utf8ToBase64Url(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(b64url: string): string {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)!;
  return dec.decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256Base64Url(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  return out === 0;
}

/**
 * ADMIN_PASSWORD ile imzalı oturum jetonu üretir (yalnız sunucu / Route Handler).
 */
export async function signAdminSessionToken(): Promise<string> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("ADMIN_PASSWORD tanımlı değil");
  }
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const payload = utf8ToBase64Url(JSON.stringify({ sub: "admin", exp }));
  const sig = await hmacSha256Base64Url(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * admin_session çerez değerini doğrular (middleware + API).
 */
export async function verifyAdminSessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !token) return false;
  const i = token.lastIndexOf(".");
  if (i <= 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = await hmacSha256Base64Url(payload, secret);
  if (!timingSafeEqualStr(sig, expected)) return false;
  try {
    const json = JSON.parse(base64UrlToUtf8(payload)) as { exp?: number };
    if (typeof json.exp !== "number") return false;
    return json.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(request: NextRequest): Promise<boolean> {
  const t = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionToken(t);
}
