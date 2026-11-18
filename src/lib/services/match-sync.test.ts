import { describe, expect, it } from "vitest";

import {
  chooseInitialLog,
  interpretSyncResponse,
  parseStoredLog,
  retryDelayMs,
  serializeStoredLog,
  storageKey,
  type StoredMatchLog,
} from "./match-sync";
import { type MatchAction, sameActions } from "./scoring";

const actions: MatchAction[] = [
  { type: "point", winner: "player" },
  { type: "switch_server" },
  { type: "point", winner: "opponent" },
];

const pendingLog: StoredMatchLog = { version: 1, actions, baseRevision: 2, pending: true };
const serverLog = { actions: [{ type: "point", winner: "opponent" }] satisfies MatchAction[], revision: 5 };

describe("storageKey", () => {
  it("prefixes the match id", () => {
    expect(storageKey("abc")).toBe("match-log:abc");
  });
});

describe("chooseInitialLog", () => {
  it("keeps a pending phone copy over a server with a higher revision", () => {
    expect(chooseInitialLog(pendingLog, serverLog)).toEqual(pendingLog);
  });

  it("takes the server over a synced phone copy", () => {
    const synced: StoredMatchLog = { ...pendingLog, pending: false };
    expect(chooseInitialLog(synced, serverLog)).toEqual({
      version: 1,
      actions: serverLog.actions,
      baseRevision: 5,
      pending: false,
    });
  });

  it("takes the server when there is no phone copy", () => {
    expect(chooseInitialLog(null, serverLog)).toEqual({
      version: 1,
      actions: serverLog.actions,
      baseRevision: 5,
      pending: false,
    });
  });
});

describe("parseStoredLog", () => {
  it("reads a missing copy as no log", () => {
    expect(parseStoredLog(null)).toEqual({ ok: true, log: null });
  });

  it("reads a valid copy", () => {
    expect(parseStoredLog(serializeStoredLog(pendingLog))).toEqual({ ok: true, log: pendingLog });
  });

  it("rejects corrupt JSON", () => {
    expect(parseStoredLog("{not json")).toEqual({ ok: false });
  });

  it("rejects an unknown version", () => {
    expect(parseStoredLog(JSON.stringify({ ...pendingLog, version: 2 }))).toEqual({ ok: false });
  });

  it("rejects an invalid action log", () => {
    const raw = JSON.stringify({ ...pendingLog, actions: [{ type: "point", winner: "nobody" }] });
    expect(parseStoredLog(raw)).toEqual({ ok: false });
  });

  it("rejects an invalid revision or pending flag", () => {
    expect(parseStoredLog(JSON.stringify({ ...pendingLog, baseRevision: -1 }))).toEqual({ ok: false });
    expect(parseStoredLog(JSON.stringify({ ...pendingLog, pending: "yes" }))).toEqual({ ok: false });
  });

  it("round-trips the same action log", () => {
    const parsed = parseStoredLog(serializeStoredLog(pendingLog));
    if (!parsed.ok || parsed.log === null) {
      throw new Error("Expected a stored log");
    }
    expect(sameActions(parsed.log.actions, actions)).toBe(true);
  });
});

describe("interpretSyncResponse", () => {
  it("reads 200 as saved", () => {
    expect(interpretSyncResponse({ kind: "http", status: 200, body: { revision: 3 } })).toEqual({
      kind: "saved",
      revision: 3,
    });
  });

  it("reads 200 without a revision as retry", () => {
    expect(interpretSyncResponse({ kind: "http", status: 200, body: null }).kind).toBe("retry");
  });

  it("reads 409 with a body as conflict", () => {
    const body = { error: "conflict", revision: 7, events: serverLog.actions };
    expect(interpretSyncResponse({ kind: "http", status: 409, body })).toEqual({
      kind: "conflict",
      server: { actions: serverLog.actions, revision: 7 },
    });
  });

  it("reads 409 without a body as retry", () => {
    expect(interpretSyncResponse({ kind: "http", status: 409, body: null }).kind).toBe("retry");
  });

  it("reads a redirect as unauthorized", () => {
    expect(interpretSyncResponse({ kind: "redirect" })).toEqual({ kind: "unauthorized" });
  });

  it("reads 401 as unauthorized", () => {
    expect(interpretSyncResponse({ kind: "http", status: 401, body: null })).toEqual({ kind: "unauthorized" });
  });

  it.each([
    [400, "invalid_log"],
    [404, "match_not_found"],
    [413, "payload_too_large"],
  ])("reads %i as rejected", (status, error) => {
    expect(interpretSyncResponse({ kind: "http", status, body: { error } })).toEqual({ kind: "rejected", error });
  });

  it.each([403, 415])("reads %i without an error code as rejected with the status", (status) => {
    expect(interpretSyncResponse({ kind: "http", status, body: null })).toEqual({
      kind: "rejected",
      error: `http_${status}`,
    });
  });

  it("reads 503 as retry", () => {
    expect(interpretSyncResponse({ kind: "http", status: 503, body: null })).toEqual({
      kind: "retry",
      reason: "http_503",
    });
  });

  it("reads 500 as retry", () => {
    expect(interpretSyncResponse({ kind: "http", status: 500, body: { error: "save_failed" } })).toEqual({
      kind: "retry",
      reason: "save_failed",
    });
  });

  it("reads a network error as retry", () => {
    expect(interpretSyncResponse({ kind: "network_error" })).toEqual({ kind: "retry", reason: "network_error" });
  });
});

describe("retryDelayMs", () => {
  it("grows from 1 s", () => {
    expect([0, 1, 2, 3].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000]);
  });

  it("never exceeds 30 s", () => {
    for (const attempt of [5, 6, 10, 100, 10_000]) {
      expect(retryDelayMs(attempt)).toBeLessThanOrEqual(30_000);
    }
    expect(retryDelayMs(10)).toBe(30_000);
  });
});
