import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await verifyAdminSessionToken(token))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const kadi = process.env.ADMIN_USERNAME?.trim() ?? "admin";
  return NextResponse.json({ ok: true, kadi });
}
