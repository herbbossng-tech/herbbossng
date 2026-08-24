import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STOREFRONT_OFFICE_COOKIE } from "@/lib/office-context";

// Persists a storefront visitor's explicit `?office=NG` choice into a cookie
// so it sticks for the rest of the visit (package selector, currency, order
// form fields) without needing to repeat the query param on every link.
export function proxy(request: NextRequest) {
  const officeParam = request.nextUrl.searchParams.get("office");
  if (!officeParam) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(STOREFRONT_OFFICE_COOKIE, officeParam.toUpperCase(), {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  matcher: ["/((?!admin|api|_next|uploads).*)"],
};
