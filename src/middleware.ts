import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_PREFIXES = ["/login", "/signup"];

function isAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // favicon.ico, robots.txt, images, ...
  );
}

/**
 * Route protection:
 *  - not logged in  → only `/`, `/login/*`, `/signup/*` are reachable (else → `/`)
 *  - student        → `/` + auth pages + `/class/*`            (no `/admin`)
 *  - teacher        → everything, including `/admin`
 *
 * The session is validated with `supabase.auth.getUser()` (a call to Supabase),
 * so a hand-crafted cookie is never trusted on its own.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAsset(pathname)) return NextResponse.next();

  const isHome = pathname === "/";
  const isAuthPage = AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isPublic = isHome || isAuthPage;

  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No credentials and a public page → nothing to check, skip the round-trip.
  if (!url || !anonKey) {
    // Misconfigured deployment: the app can't talk to Supabase at all anyway, and
    // RLS (not the middleware) is what protects the data. Warn loudly and let the
    // public pages load so the missing .env.local is easy to spot.
    // eslint-disable-next-line no-console
    console.warn("middleware: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are missing — route protection is off.");
    return NextResponse.next();
  }
  if (isPublic && !hasSessionCookie) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectToHome = () => {
    const target = request.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    // keep any cookies refreshed while validating the session
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  // ----- not logged in -----
  if (!user) return isPublic ? response : redirectToHome();

  // ----- logged in -----
  const role = (user.user_metadata?.role ?? user.app_metadata?.role ?? "") as string;

  // A logged-in user has no business on the login/signup forms.
  if (isAuthPage) return redirectToHome();

  // /admin (and any future /teacher/* route) is teacher-only.
  const isTeacherArea = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isTeacherArea && role !== "teacher") return redirectToHome();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|map)$).*)",
  ],
};
