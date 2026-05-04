import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getFirmaAuthSessionById } from "@/lib/firma-auth-server";
import {
  FIRMA_SESSION_COOKIE,
  isFirmaSessionCookieValue,
} from "@/lib/firma-session";

export async function GET() {
  const id = (await cookies()).get(FIRMA_SESSION_COOKIE)?.value;
  if (!id || !isFirmaSessionCookieValue(id)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let session;
  try {
    session = await getFirmaAuthSessionById(id);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Oturum doğrulanamadı.",
      },
      { status: 500 },
    );
  }

  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, session });
}
