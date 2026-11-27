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
