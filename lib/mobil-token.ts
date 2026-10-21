import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mobil uygulama (okatalog) için HMAC-SHA256 imzalı token.
 * Format: base64url(payload) + "." + base64url(imza)
 * Yalnız sunucu tarafında kullanılır; MOBIL_TOKEN_SECRET istemciye asla gitmez.
 */

export type MobilTokenMode = "musteri" | "esnaf";

export type MobilTokenPayload = {
  mode: MobilTokenMode;
  firma_id: string;
  /** Yalnız mode === "musteri" iken dolu */
  musteri_id?: string;
  /** Unix saniye */
  exp: number;
};

const TOKEN_SURE_SN = 30 * 24 * 60 * 60; // 30 gün

function getSecret(): string {
  const secret = process.env.MOBIL_TOKEN_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("MOBIL_TOKEN_SECRET tanımlı değil.");
  }
  return secret;
}

function b64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function b64urlDecodeToString(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadPart: string): Buffer {
  return createHmac("sha256", getSecret()).update(payloadPart).digest();
}

/** Yeni mobil token üretir (30 gün geçerli). */
export function createMobilToken(input: {
  mode: MobilTokenMode;
  firma_id: string;
  musteri_id?: string | null;
}): string {
  const payload: MobilTokenPayload = {
    mode: input.mode,
    firma_id: input.firma_id,
    ...(input.mode === "musteri" && input.musteri_id
      ? { musteri_id: input.musteri_id }
      : {}),
    exp: Math.floor(Date.now() / 1000) + TOKEN_SURE_SN,
  };
  const payloadPart = b64urlEncode(JSON.stringify(payload));
  const sigPart = sign(payloadPart).toString("base64url");
  return `${payloadPart}.${sigPart}`;
}

/** Token'ı doğrular; imza bozuksa veya süresi dolmuşsa null döner. */
export function verifyMobilToken(token: string): MobilTokenPayload | null {
  try {
    const parts = String(token ?? "").trim().split(".");
    if (parts.length !== 2) return null;
    const [payloadPart, sigPart] = parts as [string, string];
    if (!payloadPart || !sigPart) return null;

    const expected = sign(payloadPart);
    let given: Buffer;
    try {
      given = Buffer.from(sigPart, "base64url");
    } catch {
      return null;
    }
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;

    const parsed = JSON.parse(b64urlDecodeToString(payloadPart)) as Partial<MobilTokenPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode !== "musteri" && parsed.mode !== "esnaf") return null;
    if (typeof parsed.firma_id !== "string" || !parsed.firma_id.trim()) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    if (parsed.mode === "musteri") {
      if (typeof parsed.musteri_id !== "string" || !parsed.musteri_id.trim()) return null;
    }

    return {
      mode: parsed.mode,
      firma_id: parsed.firma_id,
      ...(parsed.mode === "musteri" ? { musteri_id: parsed.musteri_id as string } : {}),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * "Authorization: Bearer <token>" başlığını okur.
 * Doğrulanırsa payload, aksi halde null döner.
 */
export function getMobilSession(request: Request): MobilTokenPayload | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) return null;
  return verifyMobilToken(m[1]!.trim());
}
