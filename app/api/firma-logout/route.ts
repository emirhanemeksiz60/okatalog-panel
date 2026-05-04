import { NextResponse } from "next/server";
import {
  FIRMA_SESSION_COOKIE,
  firmaSessionClearCookieOptions,
} from "@/lib/firma-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(FIRMA_SESSION_COOKIE, "", firmaSessionClearCookieOptions());
  return res;
}
