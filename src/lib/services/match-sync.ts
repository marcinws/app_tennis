import { type MatchAction, parseMatchActions } from "./scoring";

// The phone's copy of a match log. `pending` means the server has not confirmed these actions yet.
export interface StoredMatchLog {
  version: 1;
  actions: MatchAction[];
  baseRevision: number;
  pending: boolean;
}

export interface ServerMatchLog {
  actions: MatchAction[];
  revision: number;
}

export type SyncResponse =
  { kind: "network_error" } | { kind: "redirect" } | { kind: "http"; status: number; body: unknown };

export type SyncOutcome =
  | { kind: "saved"; revision: number }
  | { kind: "conflict"; server: ServerMatchLog }
  | { kind: "unauthorized" }
  | { kind: "rejected"; error: string }
  | { kind: "retry"; reason: string };

const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 1_000;

export function storageKey(matchId: string): string {
  return `match-log:${matchId}`;
}

export function serializeStoredLog(log: StoredMatchLog): string {
  return JSON.stringify(log);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// Reads the phone's copy. `log: null` means there is no copy; `ok: false` means the copy is corrupt.
export function parseStoredLog(raw: string | null): { ok: true; log: StoredMatchLog | null } | { ok: false } {
  if (raw === null) {
    return { ok: true, log: null };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // A corrupt copy is reported to the caller as ok: false, which logs it and keeps the raw value.
    return { ok: false };
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRevision(value.baseRevision) ||
    typeof value.pending !== "boolean"
  ) {
    return { ok: false };
  }
  const actions = parseMatchActions(value.actions);
  if (!actions.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    log: { version: 1, actions: actions.actions, baseRevision: value.baseRevision, pending: value.pending },
  };
}

// An unsynced phone copy always wins, even over a newer server revision: a conflict then surfaces as a 409
// on the first sync instead of silently dropping points.
export function chooseInitialLog(local: StoredMatchLog | null, server: ServerMatchLog): StoredMatchLog {
  if (local?.pending) {
    return local;
  }
  return { version: 1, actions: server.actions, baseRevision: server.revision, pending: false };
}

function errorCode(body: unknown, status: number): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : `http_${status}`;
}

// Maps a PUT /api/matches/<id>/log result to what the queue does next.
export function interpretSyncResponse(response: SyncResponse): SyncOutcome {
  if (response.kind === "network_error") {
    return { kind: "retry", reason: "network_error" };
  }
  // The middleware redirects an expired session to the sign-in page.
  if (response.kind === "redirect") {
    return { kind: "unauthorized" };
  }
  const { status, body } = response;
  if (status === 200) {
    if (isRecord(body) && isRevision(body.revision)) {
      return { kind: "saved", revision: body.revision };
    }
    return { kind: "retry", reason: "invalid_response" };
  }
  if (status === 409) {
    if (isRecord(body) && body.error === "conflict" && isRevision(body.revision)) {
      const events = parseMatchActions(body.events);
      if (events.ok) {
        return { kind: "conflict", server: { actions: events.actions, revision: body.revision } };
      }
    }
    return { kind: "retry", reason: "invalid_response" };
  }
  if (status === 401) {
    return { kind: "unauthorized" };
  }
  // A retry cannot fix any other client error.
  if (status >= 400 && status < 500) {
    return { kind: "rejected", error: errorCode(body, status) };
  }
  return { kind: "retry", reason: errorCode(body, status) };
}

// Exponential backoff: 1 s, 2 s, 4 s, ..., capped at 30 s.
export function retryDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** safeAttempt, MAX_RETRY_DELAY_MS);
}
