import { NextResponse } from "next/server";
import { getFirmaAuthSessionById } from "@/lib/firma-auth-server";
import {
  FIRMA_SESSION_COOKIE,
  firmaSessionCookieOptions,
  isFirmaSessionCookieValue,
} from "@/lib/firma-session";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

type Body = {
  firma_kodu?: string;
  sifre?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const firmaKodu = String(body.firma_kodu ?? "").trim();
  const sifre = String(body.sifre ?? "");

  if (!firmaKodu || !sifre) {
    return NextResponse.json(
      { ok: false, error: "Firma kodu ve şifre zorunludur." },
      { status: 400 },
    );
  }

  let sb: ReturnType<typeof createFirmaServiceRoleClient>;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Sunucu yapılandırması eksik.",
      },
      { status: 500 },
    );
  }

  const { data: firmaId, error: rpcHata } = await sb.rpc("verify_firma_password", {
    p_firma_kodu: firmaKodu,
    p_sifre: sifre,
  });

  if (rpcHata) {
    return NextResponse.json(
      { ok: false, error: "Firma kodu veya şifre hatalı." },
      { status: 401 },
    );
  }

  const id =
    typeof firmaId === "string"
      ? firmaId.trim()
      : firmaId != null
        ? String(firmaId).trim()
        : "";

  if (!id || !isFirmaSessionCookieValue(id)) {
    return NextResponse.json(
      { ok: false, error: "Firma kodu veya şifre hatalı." },
      { status: 401 },
    );
  }

  const session = await getFirmaAuthSessionById(id);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Firma kodu veya şifre hatalı." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true, session });
  res.cookies.set(FIRMA_SESSION_COOKIE, id, firmaSessionCookieOptions());
  return res;
}
