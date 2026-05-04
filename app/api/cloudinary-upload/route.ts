import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cloudinarySunucuBase64Yukle } from "@/lib/cloudinary-upload";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";

export const runtime = "nodejs";

type Body = {
  imageBase64?: string;
};

export async function POST(request: NextRequest) {
  const firmaId = getFirmaSessionIdFromRequest(request);
  if (!firmaId) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
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

  const raw = String(body.imageBase64 ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { success: false, error: "imageBase64 zorunlu." },
      { status: 400 },
    );
  }

  try {
    const secureUrl = await cloudinarySunucuBase64Yukle(raw);
    return NextResponse.json({ success: true, url: secureUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
    const envEksik = msg === "Cloudinary env değişkenleri eksik";
    return NextResponse.json(
      { success: false, error: msg },
      { status: envEksik ? 500 : 400 },
    );
  }
}
