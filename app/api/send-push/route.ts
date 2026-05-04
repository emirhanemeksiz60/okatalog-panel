import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";

/** Expo Push Service HTTP API — doğru path: /--/api/v2/push/send (/--/push/v2/send 404 döner). */
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

type PushBody = {
  firma_id?: string;
  token?: string;
  title?: string;
  body?: string;
};

export async function POST(request: NextRequest) {
  const firmaId = getFirmaSessionIdFromRequest(request);
  if (!firmaId) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as PushBody;
    const bodyFirmaId = String(body?.firma_id ?? "").trim();
    if (!bodyFirmaId) {
      return NextResponse.json({ error: "firma_id eksik" }, { status: 400 });
    }
    if (bodyFirmaId !== firmaId) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }
    const token = String(body.token ?? "").trim();
    const title = String(body.title ?? "").trim();
    const mesaj = String(body.body ?? "").trim();


    if (!token || !title || !mesaj) {
      return NextResponse.json(
        { ok: false, error: "token, title ve body zorunlu." },
        { status: 400 },
      );
    }

    const expoRequestBody = {
      to: token,
      title,
      body: mesaj,
    };

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const expoResponse = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers,
      // Tek mesaj veya aynı projeye ait en fazla 100 mesaj dizisi — ikisi de geçerli.
      body: JSON.stringify([expoRequestBody]),
    });

    const text = await expoResponse.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!expoResponse.ok) {
      return NextResponse.json(
        { ok: false, status: expoResponse.status, error: parsed },
        { status: expoResponse.status },
      );
    }

    return NextResponse.json({ ok: true, status: expoResponse.status, data: parsed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Bilinmeyen hata" },
      { status: 500 },
    );
  }
}
