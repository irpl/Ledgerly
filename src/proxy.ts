import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }
  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  // Protect everything except auth routes, the inbound-email webhook
  // (secured by shared secret), and static assets.
  matcher: [
    "/((?!api/auth|api/inbound-email|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons/|sw\\.js|offline).*)",
  ],
};
