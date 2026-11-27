import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { classifyAuthError } from "@/lib/services/auth";

const PROTECTED_ROUTES = ["/dashboard", "/players", "/api/players", "/matches", "/api/matches"];

// A short wait before the client retries; its sync queues already retry any 5xx with backoff.
const AUTH_RETRY_AFTER_SECONDS = "5";

// Sent instead of the sign-in redirect while Supabase Auth is unreachable, so a parent mid-match
// is not told the session expired and the sync queues resume on their own when Auth is back.
function authUnavailable(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "auth_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Retry-After": AUTH_RETRY_AFTER_SECONDS },
    });
  }
  return new Response("Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": AUTH_RETRY_AFTER_SECONDS },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const { pathname } = context.url;
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  context.locals.user = null;
  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    const outcome = classifyAuthError(error);
    if (outcome === "unavailable" && error) {
      // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place an Auth outage is visible
      console.error("Supabase Auth unavailable", {
        name: error.name,
        status: error.status ?? null,
        code: error.code ?? null,
        path: pathname,
        method: context.request.method,
      });
      if (isProtected) {
        return authUnavailable(pathname);
      }
    } else if (outcome === "signed_out" && error && error.name !== "AuthSessionMissingError") {
      // A rejected or revoked token, not an anonymous visit: worth a trace, but the user is signed out.
      // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this is visible
      console.warn("Supabase Auth rejected the session", {
        name: error.name,
        status: error.status ?? null,
        code: error.code ?? null,
        path: pathname,
      });
    }
  }

  if (isProtected && !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  return next();
});
