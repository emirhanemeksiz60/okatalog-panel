import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  imageBase64?: string;
};

type CldJson = {
  secure_url?: string;
  error?: { message?: string };
};

export async function POST(req: Request) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
    if (!cloudName || !uploadPreset) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CLOUDINARY_CLOUD_NAME veya CLOUDINARY_UPLOAD_PRESET tanımlı değil.",
        },
        { status: 500 },
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json(
        { success: false, error: "Geçersiz JSON body." },
        { status: 400 },
      );
    }

    const raw = String(body.imageBase64 ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { success: false, error: "imageBase64 zorunlu." },
        { status: 400 },
      );
    }

    const fileField = raw.startsWith("data:")
      ? raw
      : `data:image/png;base64,${raw}`;

    const form = new FormData();
    form.append("file", fileField);
    form.append("upload_preset", uploadPreset);

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const res = await fetch(url, { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as CldJson;

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            data.error?.message ||
            `Cloudinary hata: ${res.status} ${res.statusText}`,
        },
        { status: res.status >= 500 ? 502 : 400 },
      );
    }
    if (data.error?.message) {
      return NextResponse.json(
        { success: false, error: data.error.message },
        { status: 400 },
      );
    }
    if (!data.secure_url) {
      return NextResponse.json(
        { success: false, error: "Yanıtta secure_url yok." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, url: data.secure_url });
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
