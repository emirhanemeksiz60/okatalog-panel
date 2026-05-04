import type { NextRequest } from "next/server";

/** HttpOnly firma panel oturum çerezi (değer: `firmalar.id` UUID) */
export const FIRMA_SESSION_COOKIE = "firma_session";

/** Standart UUID (PostgreSQL `uuid` / `firmalar.id`) */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFirmaSessionCookieValue(value: string | undefined | null): boolean {
  if (!value || value.length !== 36) return false;
  return UUID_RE.test(value);
}

export function getFirmaSessionIdFromRequest(request: NextRequest): string | undefined {
  const v = request.cookies.get(FIRMA_SESSION_COOKIE)?.value;
  return isFirmaSessionCookieValue(v) ? v : undefined;
}

export function firmaSessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
} {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 3600,
  };
}

export function firmaSessionClearCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: 0;
} {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  };
}
