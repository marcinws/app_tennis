export type AuthOutcome = "ok" | "signed_out" | "unavailable";

// Tells a signed-out user apart from Supabase Auth being unreachable, from the shape of the
// AuthError that auth-js getUser() returns (it never throws for these). Only a 4xx other than
// a rate limit proves the session itself is bad; anything else is an outage the client should retry.
export function classifyAuthError(error: { name: string; status?: number } | null): AuthOutcome {
  if (error === null) {
    return "ok";
  }
  // auth-js uses it for network failures (status 0) and Supabase 5xx/52x responses.
  if (error.name === "AuthRetryableFetchError") {
    return "unavailable";
  }
  const { status } = error;
  if (status === undefined || status === 0 || status === 429 || status >= 500) {
    return "unavailable";
  }
  return "signed_out";
}

export type AuthDecision = "next" | "redirect" | "unavailable_json" | "unavailable_text";

// What the middleware does with a request, once the Auth outcome is known. An outage on a protected
// route answers 503 (JSON for the API, so the sync queues read the code and retry); an outage on a
// public route carries on as anonymous; only a real sign-out is redirected to the sign-in page.
export function authDecision({
  outcome,
  pathname,
  isProtected,
  hasUser,
}: {
  outcome: AuthOutcome;
  pathname: string;
  isProtected: boolean;
  hasUser: boolean;
}): AuthDecision {
  if (!isProtected) {
    return "next";
  }
  if (outcome === "unavailable") {
    return pathname.startsWith("/api/") ? "unavailable_json" : "unavailable_text";
  }
  return hasUser ? "next" : "redirect";
}
