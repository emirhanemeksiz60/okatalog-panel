import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";

export const runtime = "nodejs";

const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

const SIZES = new Set(["regular", "medium", "hd"]);

type Body = {
  imageBase64?: string;
  size?: string;
};

function stripDataUrlBase64(s: string): string {
  const m = /^data:[^;]+;base64,(.+)$/i.exec(s.trim());
  return m ? m[1]! : s.trim();
}

export async function POST(request: NextRequest) {
  const firmaId = getFirmaSessionIdFromRequest(request);
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
    const size = String(body.size ?? "").trim();
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

    const imageB64 = stripDataUrlBase64(imageRaw);

    const form = new FormData();
    form.append("image_file_b64", imageB64);
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
