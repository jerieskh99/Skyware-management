import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth(function middleware(req) {
  const { nextUrl } = req;
  // Guard on the presence of a user, not just a truthy `req.auth`. In the Edge
  // runtime (production `next start`), NextAuth can hand middleware a
  // truthy-but-empty session object, so `!!req.auth` reported EVERY request as
  // logged in — bouncing unauthenticated visitors from /login to /dashboard
  // and into a redirect loop, while the Node-side `auth()` in pages correctly
  // saw no session. Requiring `req.auth.user` keeps the two in agreement.
  const isLoggedIn = !!req.auth?.user;

  const isAuthRoute =
    nextUrl.pathname === "/login" ||
    nextUrl.pathname === "/forgot-password" ||
    nextUrl.pathname.startsWith("/reset-password");

  // Pass through auth API and health check unconditionally.
  if (
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (!isLoggedIn && !isAuthRoute) {
    // API callers get JSON 401 so client code can branch on it
    // rather than parsing an HTML login redirect.
    if (nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", nextUrl);
    if (nextUrl.pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Skip static files and Next.js internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
