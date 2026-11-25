import type { MatchNote, MatchObservation } from "../../types";
import type { SyncResponse } from "./match-sync";

// Must equal the `check` on match_notes.text in the observations and notes migration.
export const NOTE_TEXT_MAX_LENGTH = 200;

// Upper bound for the queue read back from the phone; far above what one match produces.
export const MAX_QUEUED_OPS = 1000;

export const NOTE_ERROR_MESSAGES = {
  text_empty: "Wpisz treść notatki",
  text_too_long: `Notatka może mieć najwyżej ${NOTE_TEXT_MAX_LENGTH} znaków`,
} as const;

export type NoteErrorCode = keyof typeof NOTE_ERROR_MESSAGES;

export type ParseNoteTextResult = { ok: true; text: string } | { ok: false; error: NoteErrorCode };

// Normalizes a note (trim, collapse whitespace) and checks the same limits as the
// database. Length is counted in code points, like Postgres char_length.
export function parseNoteText(raw: string): ParseNoteTextResult {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length === 0) {
    return { ok: false, error: "text_empty" };
  }
  if (Array.from(text).length > NOTE_TEXT_MAX_LENGTH) {
    return { ok: false, error: "text_too_long" };
  }
  return { ok: true, text };
}

export interface MatchNotesState {
  observations: MatchObservation[];
  notes: MatchNote[];
}

export type NotesOp =
  | { type: "put_observation"; observation: MatchObservation }
  | { type: "delete_observation"; id: string }
  | { type: "put_note"; note: MatchNote }
  | { type: "delete_note"; id: string };

// The phone's copy: operations the server has not confirmed yet, oldest first.
// The state shown is always the server's state with these applied on top.
export interface StoredMatchNotes {
  version: 1;
  queue: NotesOp[];
}

export function notesStorageKey(matchId: string): string {
  return `match-notes:${matchId}`;
}

export function serializeStoredNotes(stored: StoredMatchNotes): string {
  return JSON.stringify(stored);
}

export function opId(op: NotesOp): string {
  switch (op.type) {
    case "put_observation":
      return op.observation.id;
    case "put_note":
      return op.note.id;
    case "delete_observation":
    case "delete_note":
      return op.id;
  }
}

// Adding an id that is already there changes nothing, so a replayed queue never duplicates an entry.
export function applyOp(state: MatchNotesState, op: NotesOp): MatchNotesState {
  switch (op.type) {
    case "put_observation":
      return state.observations.some((item) => item.id === op.observation.id)
        ? state
        : { ...state, observations: [...state.observations, op.observation] };
    case "delete_observation":
      return { ...state, observations: state.observations.filter((item) => item.id !== op.id) };
    case "put_note":
      return state.notes.some((item) => item.id === op.note.id)
        ? state
        : { ...state, notes: [...state.notes, op.note] };
    case "delete_note":
      return { ...state, notes: state.notes.filter((item) => item.id !== op.id) };
  }
}

export function applyQueue(state: MatchNotesState, queue: readonly NotesOp[]): MatchNotesState {
  return queue.reduce(applyOp, state);
}

function putTypeFor(op: NotesOp): NotesOp["type"] | null {
  if (op.type === "delete_observation") {
    return "put_observation";
  }
  if (op.type === "delete_note") {
    return "put_note";
  }
  return null;
}

// Appends an operation. Deleting an entry whose add was never sent drops both, so the server never sees
// either. An add sent at least once (in flight, or waiting for a retry after a lost response) may already
// be on the server, so its delete stays. `sentIds` holds the ids of every add sent at least once.
export function enqueue(queue: readonly NotesOp[], op: NotesOp, sentIds: ReadonlySet<string>): NotesOp[] {
  const putType = putTypeFor(op);
  const id = opId(op);
  if (putType !== null && !sentIds.has(id)) {
    const index = queue.findIndex((queued) => queued.type === putType && opId(queued) === id);
    if (index !== -1) {
      return [...queue.slice(0, index), ...queue.slice(index + 1)];
    }
  }
  return [...queue, op];
}

// Ids of entries whose add the server has not confirmed yet.
export function pendingIds(queue: readonly NotesOp[]): Set<string> {
  return new Set(queue.filter((op) => op.type === "put_observation" || op.type === "put_note").map(opId));
}

export function observationCount(state: MatchNotesState, goalId: string): number {
  return state.observations.filter((item) => item.goal_id === goalId).length;
}

export function lastObservationId(state: MatchNotesState, goalId: string): string | null {
  const matching = state.observations.filter((item) => item.goal_id === goalId);
  return matching.length === 0 ? null : matching[matching.length - 1].id;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseOp(item: unknown): NotesOp | null {
  if (!isRecord(item)) {
    return null;
  }
  if ((item.type === "delete_observation" || item.type === "delete_note") && isUuid(item.id)) {
    return { type: item.type, id: item.id };
  }
  if (item.type === "put_observation" && isRecord(item.observation)) {
    const { id, goal_id: goalId } = item.observation;
    return isUuid(id) && isUuid(goalId) ? { type: "put_observation", observation: { id, goal_id: goalId } } : null;
  }
  if (item.type === "put_note" && isRecord(item.note)) {
    const { id, text, created_at: createdAt } = item.note;
    if (!isUuid(id) || typeof text !== "string" || typeof createdAt !== "string") {
      return null;
    }
    const parsed = parseNoteText(text);
    return parsed.ok && parsed.text === text ? { type: "put_note", note: { id, text, created_at: createdAt } } : null;
  }
  return null;
}

// Reads the phone's copy. `stored: null` means there is no copy; `ok: false` means the copy is corrupt.
// Copies only known fields, so extra keys never reach a request.
export function parseStoredNotes(raw: string | null): { ok: true; stored: StoredMatchNotes | null } | { ok: false } {
  if (raw === null) {
    return { ok: true, stored: null };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // A corrupt copy is reported to the caller as ok: false, which logs it and keeps the raw value.
    return { ok: false };
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.queue) || value.queue.length > MAX_QUEUED_OPS) {
    return { ok: false };
  }
  const queue: NotesOp[] = [];
  for (const item of value.queue as unknown[]) {
    const op = parseOp(item);
    if (op === null) {
      return { ok: false };
    }
    queue.push(op);
  }
  return { ok: true, stored: { version: 1, queue } };
}

export type NotesSyncOutcome =
  | { kind: "saved" }
  | { kind: "unauthorized" }
  | { kind: "rejected"; error: string }
  | { kind: "retry"; reason: string };

function errorCode(body: unknown, status: number): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : `http_${status}`;
}

// Maps a PUT/DELETE /api/matches/<id>/{observations,notes}/<id> result to what the queue does next.
export function interpretNotesResponse(response: SyncResponse): NotesSyncOutcome {
  if (response.kind === "network_error") {
    return { kind: "retry", reason: "network_error" };
  }
  // The middleware redirects an expired session to the sign-in page.
  if (response.kind === "redirect") {
    return { kind: "unauthorized" };
  }
  const { status, body } = response;
  if (status === 200 || status === 204) {
    return { kind: "saved" };
  }
  if (status === 401) {
    return { kind: "unauthorized" };
  }
  // A timeout or a rate limit passes; dropping the entry for it would lose the parent's data.
  if (status === 408 || status === 429) {
    return { kind: "retry", reason: errorCode(body, status) };
  }
  // A retry cannot fix any other client error.
  if (status >= 400 && status < 500) {
    return { kind: "rejected", error: errorCode(body, status) };
  }
  return { kind: "retry", reason: errorCode(body, status) };
}

// Rejected operations kept on the phone as evidence; only the newest stay, so the list cannot fill storage.
export const MAX_REJECTED_ENTRIES = 50;

export interface RejectedEntry {
  op: NotesOp;
  error: string;
}

// Adds an entry to the stored `:rejected` list and returns the new raw value.
export function appendRejected(raw: string | null, entry: RejectedEntry): string {
  let previous: unknown;
  try {
    previous = JSON.parse(raw ?? "[]");
  } catch {
    // An unreadable list is evidence of nothing; it is replaced by a fresh one.
    previous = [];
  }
  const list: unknown[] = Array.isArray(previous) ? (previous as unknown[]) : [];
  return JSON.stringify([...list, entry].slice(-MAX_REJECTED_ENTRIES));
}
