import { describe, expect, it } from "vitest";

import { authDecision, classifyAuthError } from "./auth";

describe("classifyAuthError", () => {
  it("treats no error as ok", () => {
    expect(classifyAuthError(null)).toBe("ok");
  });

  it.each([
    ["a missing session", { name: "AuthSessionMissingError", status: 400 }],
    ["a rejected token", { name: "AuthApiError", status: 401 }],
    ["an invalid JWT", { name: "AuthInvalidJwtError", status: 400 }],
  ])("treats %s as signed out", (_, error) => {
    expect(classifyAuthError(error)).toBe("signed_out");
  });

  // Regression (observability audit 2026-11-26, P1): an Auth outage was read as a signed-out user,
  // so a parent mid-match saw "session expired" and the sync queues stopped.
  it.each([
    ["a network failure", { name: "AuthRetryableFetchError", status: 0 }],
    ["a Supabase 503", { name: "AuthRetryableFetchError", status: 503 }],
    ["a rate limit", { name: "AuthApiError", status: 429 }],
    ["a server error", { name: "AuthApiError", status: 500 }],
    ["an error without a status", { name: "AuthUnknownError" }],
  ])("treats %s as unavailable", (_, error) => {
    expect(classifyAuthError(error)).toBe("unavailable");
  });
});

describe("authDecision", () => {
  // Regression (impl review of auth-outage-looks-signed-out, F1): the middleware branching had no test,
  // so a flipped condition would turn an Auth outage back into a sign-in redirect without failing CI.
  it.each([
    ["a signed-in user on a protected page", "ok", "/matches", true, true, "next"],
    ["an anonymous visitor on a public page", "signed_out", "/", false, false, "next"],
    ["a signed-out user on a protected page", "signed_out", "/matches", true, false, "redirect"],
    ["an outage on a protected API route", "unavailable", "/api/matches/1/log", true, false, "unavailable_json"],
    ["an outage on a protected page", "unavailable", "/matches/1", true, false, "unavailable_text"],
    ["an outage on a public page", "unavailable", "/auth/signin", false, false, "next"],
  ] as const)("%s", (_, outcome, pathname, isProtected, hasUser, expected) => {
    expect(authDecision({ outcome, pathname, isProtected, hasUser })).toBe(expected);
  });
});
