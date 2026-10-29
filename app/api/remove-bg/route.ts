import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";
import { getMobilSession } from "@/lib/mobil-token";

export const runtime = "nodejs";

const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

/** remove.bg size değerleri; mobil "auto" gönderir → regular */
const SIZES = new Set(["regular", "medium", "hd"]);

/** Boş / bozuk görselleri remove.bg'ye göndermeden ele (yaklaşık ~100 bayt) */
const MIN_IMAGE_BYTES = 100;

type Body = {
  imageBase64?: string;
  size?: string;
};

type DetectedImage = {
  mime: string;
  filename: string;
};

/**
 * data:image/...;base64,XXX veya charset içeren data URL'lerden ham base64 çıkar.
 * Eski regex (`data:[^;]+;base64`) charset=utf-8 gibi ek parametrelerde
 * başarısız olup tüm data: önekini remove.bg'ye iletiyordu.
 */
function stripDataUrlBase64(s: string): string {
  const t = s.trim();
  if (t.startsWith("data:")) {
    const idx = t.indexOf("base64,");
    if (idx !== -1) {
      return t.slice(idx + "base64,".length).replace(/\s+/g, "");
    }
  }
  return t.replace(/\s+/g, "");
}

function normalizeBase64(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  if (pad) b64 += "=".repeat(pad);
  return b64;
}

function detectImage(buf: Buffer): DetectedImage | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", filename: "image.jpg" };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { mime: "image/png", filename: "image.png" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", filename: "image.webp" };
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") {
    return { mime: "image/gif", filename: "image.gif" };
  }
  return null;
}

function isLikelyHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const ftyp = buf.toString("ascii", 8, Math.min(buf.length, 20)).toLowerCase();
  return (
    ftyp.includes("heic") ||
    ftyp.includes("heif") ||
    ftyp.includes("mif1") ||
    ftyp.includes("msf1")
  );
}

export async function POST(request: NextRequest) {
  // Panel cookie VEYA mobil esnaf token (firma_id token'dan)
  const cookieFirmaId = getFirmaSessionIdFromRequest(request);
  const mobil = cookieFirmaId ? null : getMobilSession(request);
  const firmaId =
    cookieFirmaId ?? (mobil && mobil.mode === "esnaf" ? mobil.firma_id : undefined);
  if (!firmaId) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const apiKey = process.env.REMOVE_BG_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "REMOVE_BG_API_KEY tanımlı değil." },
        { status: 500 },
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { success: false, error: "Geçersiz JSON body." },
        { status: 400 },
      );
    }

    const imageRaw = String(body.imageBase64 ?? "").trim();
    const sizeRaw = String(body.size ?? "").trim();
    const size = sizeRaw === "auto" ? "regular" : sizeRaw;
    if (!imageRaw) {
      return NextResponse.json(
        { success: false, error: "imageBase64 zorunlu." },
        { status: 400 },
      );
    }
    if (!SIZES.has(size)) {
      return NextResponse.json(
        {
          success: false,
          error: 'size alanı "regular", "medium" veya "hd" olmalı.',
        },
        { status: 400 },
      );
    }

    const imageB64 = normalizeBase64(stripDataUrlBase64(imageRaw));
    if (!imageB64 || imageB64.length < 32) {
      return NextResponse.json(
        {
          success: false,
          error: "Görsel verisi boş veya çok kısa. Lütfen başka bir fotoğraf deneyin.",
        },
        { status: 400 },
      );
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(imageB64, "base64");
    } catch {
      return NextResponse.json(
        { success: false, error: "Görsel base64 çözülemedi." },
        { status: 400 },
      );
    }

    if (!bytes.length || bytes.length < MIN_IMAGE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Görsel çok küçük veya boş (${bytes.length} bayt). Remove.bg'ye gönderilmedi.`,
        },
        { status: 400 },
      );
    }

    if (isLikelyHeic(bytes)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "HEIC/HEIF formatı desteklenmiyor. Lütfen JPEG veya PNG olarak kaydedip tekrar deneyin.",
        },
        { status: 400 },
      );
    }

    const detected = detectImage(bytes);
    if (!detected) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Görsel okunamadı (JPEG/PNG/WEBP bekleniyor). Dosya bozuk veya desteklenmeyen format olabilir.",
        },
        { status: 400 },
      );
    }

    // remove.bg resmi JS örneği: binary image_file (image_file_b64 yerine daha güvenilir)
    const form = new FormData();
    const fileBytes = new Uint8Array(bytes);
    form.append(
      "image_file",
      new Blob([fileBytes], { type: detected.mime }),
      detected.filename,
    );
    form.append("size", size);
    form.append("format", "png");

    const res = await fetch(REMOVE_BG_URL, {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: errText || `Remove.bg hata: ${res.status} ${res.statusText}`,
        },
        { status: res.status >= 500 ? 502 : 400 },
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const imageBase64 = buf.toString("base64");
    return NextResponse.json({ success: true, imageBase64 });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Bilinmeyen hata",
      },
      { status: 500 },
    );
  }
}
