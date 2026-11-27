import { describe, expect, it } from "vitest";

import { classifyAuthError } from "./auth";

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
