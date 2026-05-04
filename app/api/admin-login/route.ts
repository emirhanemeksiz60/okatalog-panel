import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  signAdminSessionToken,
} from "@/lib/admin-session";

type Body = {
  username?: string;
  password?: string;
};

export async function POST(req: Request) {
  const user = process.env.ADMIN_USERNAME?.trim();
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json(
      { ok: false, error: "Sunucu yapılandırması eksik (ADMIN_USERNAME / ADMIN_PASSWORD)." },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (username !== user || password !== pass) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let token: string;
  try {
    token = await signAdminSessionToken();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Oturum oluşturulamadı." },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true, kadi: user });
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
