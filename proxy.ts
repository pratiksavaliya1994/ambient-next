import { NextResponse, type NextRequest } from "next/server"

/**
 * Redirects only — UX, not security.
 *
 * CVE-2025-29927 showed proxy/middleware checks can be bypassed by spoofing a
 * header, so this deliberately does no more than look for a session cookie:
 * every server action verifies the session itself via `requireSession()`. It
 * also avoids importing the Auth.js config, which would pull the whole
 * provider setup into the proxy runtime.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
]

export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name))
  if (signedIn) return NextResponse.next()

  const url = new URL("/login", request.url)
  url.searchParams.set(
    "callbackUrl",
    request.nextUrl.pathname + request.nextUrl.search
  )
  return NextResponse.redirect(url)
}

export const config = {
  // Everything except the login page, the Auth.js endpoints and static assets.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
