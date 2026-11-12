import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE, isGuestId } from "@/lib/session-cookie";

/**
 * Every visitor gets a guest id cookie on their first request. It is set on the
 * forwarded request too, so the very first render already sees it.
 */
export function proxy(request: NextRequest) {
  if (isGuestId(request.cookies.get(GUEST_COOKIE)?.value)) return NextResponse.next();

  const id = crypto.randomUUID();
  request.cookies.set(GUEST_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: GUEST_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp|woff2?)$).*)"],
};
