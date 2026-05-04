import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-session";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin/giris")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!(await isAdminAuthenticated(request))) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/giris";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (isDashboard) {
    if (!getFirmaSessionIdFromRequest(request)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard", "/dashboard/:path*"],
};
