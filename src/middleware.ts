// =============================================================================
// src/middleware.ts — Auth middleware (runs on Edge)
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_ROUTES = ["/login", "/recuperar", "/reset-password"];

// Bot crawlers that need access to OG meta tags for link previews
const BOT_USER_AGENTS = [
  "WhatsApp",
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "TelegramBot",
  "Discordbot",
  "Googlebot",
];

function isBot(ua: string | null): boolean {
  if (!ua) return false;
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── MAINTENANCE MODE ──────────────────────────────────────────────────────
  // Scheduled downtime. Every route 307-redirects (temporary, never cached) to
  // the maintenance notice at "/", so directly-typed or browser-saved URLs
  // (e.g. /dashboard, /planilla, /login) all land on the notice. Static assets
  // are excluded by the matcher below, so the notice still renders.
  // To LIFT maintenance: set MAINTENANCE_MODE = false (or revert this block) and redeploy.
  const MAINTENANCE_MODE = false;
  if (MAINTENANCE_MODE) {
    if (pathname === "/") {
      return NextResponse.next(); // serve the maintenance notice (no auth)
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow bot crawlers through so they can read OG meta tags for link previews
  if (isBot(request.headers.get("user-agent"))) {
    return NextResponse.next();
  }

  // Allow static assets, API health, manifest, SW
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as never),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // An API call must never be answered with a redirect. fetch() follows it by
    // default, /login replies 200 with HTML, and the caller sees res.ok === true
    // — so a write that never reached the database reports success. The Plan
    // Anual grid did exactly that: it marked the cell saved and cleared its
    // spinner, and the value was gone on the next reload. Answer /api/* with the
    // same 401 shape the route guards use (lib/auth/guards.ts) so the caller can
    // tell a dead session from a successful write.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image
     * - favicon.ico, public files
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js).*)",
  ],
};
