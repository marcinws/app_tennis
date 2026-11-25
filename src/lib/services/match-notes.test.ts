import { describe, expect, it } from "vitest";

import {
  applyOp,
  applyQueue,
  enqueue,
  interpretNotesResponse,
  lastObservationId,
  type MatchNotesState,
  MAX_QUEUED_OPS,
  NOTE_TEXT_MAX_LENGTH,
  type NotesOp,
  notesStorageKey,
  appendRejected,
  MAX_REJECTED_ENTRIES,
  observationCount,
  parseNoteText,
  parseStoredNotes,
  pendingIds,
  serializeStoredNotes,
} from "./match-notes";

const GOAL_A = "00000000-0000-4000-8000-00000000000a";
const GOAL_B = "00000000-0000-4000-8000-00000000000b";
const OBS_1 = "00000000-0000-4000-8000-000000000001";
const OBS_2 = "00000000-0000-4000-8000-000000000002";
const OBS_3 = "00000000-0000-4000-8000-000000000003";
const NOTE_1 = "00000000-0000-4000-8000-000000000011";
const NOTE_2 = "00000000-0000-4000-8000-000000000012";

const empty: MatchNotesState = { observations: [], notes: [] };
const putObs = (id: string, goalId = GOAL_A): NotesOp => ({
  type: "put_observation",
  observation: { id, goal_id: goalId },
});
const putNote = (id: string, text = "Dobry serwis"): NotesOp => ({
  type: "put_note",
  note: { id, text, created_at: "2026-11-25T10:00:00.000Z" },
});

describe("parseNoteText", () => {
  it("trims and collapses whitespace", () => {
    expect(parseNoteText("  za  krótko\n przy siatce ")).toEqual({ ok: true, text: "za krótko przy siatce" });
  });

  it("rejects an empty or blank note", () => {
    expect(parseNoteText("")).toEqual({ ok: false, error: "text_empty" });
    expect(parseNoteText(" \n\t ")).toEqual({ ok: false, error: "text_empty" });
  });

  it("accepts exactly the limit and rejects one more", () => {
    expect(parseNoteText("a".repeat(NOTE_TEXT_MAX_LENGTH)).ok).toBe(true);
    expect(parseNoteText("a".repeat(NOTE_TEXT_MAX_LENGTH + 1))).toEqual({ ok: false, error: "text_too_long" });
  });

  it("counts an emoji as one character, like Postgres char_length", () => {
    expect(parseNoteText("🎾".repeat(NOTE_TEXT_MAX_LENGTH)).ok).toBe(true);
    expect(parseNoteText("🎾".repeat(NOTE_TEXT_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe("applyOp", () => {
  it("adds an entry once even when the same put is applied twice", () => {
    const state = applyOp(applyOp(empty, putObs(OBS_1)), putObs(OBS_1));
    expect(state.observations).toEqual([{ id: OBS_1, goal_id: GOAL_A }]);
  });

  it("keeps notes in the order they were added", () => {
    const state = applyQueue(empty, [putNote(NOTE_1, "pierwsza"), putNote(NOTE_2, "druga")]);
    expect(state.notes.map((note) => note.text)).toEqual(["pierwsza", "druga"]);
  });

  it("deletes by id and ignores a missing id", () => {
    const state = applyQueue(empty, [putNote(NOTE_1), putObs(OBS_1)]);
    expect(applyOp(state, { type: "delete_note", id: NOTE_1 }).notes).toEqual([]);
    expect(applyOp(state, { type: "delete_observation", id: OBS_2 })).toEqual(state);
  });
});

describe("applyQueue on the server state", () => {
  it("lays queued operations over the server copy without duplicates", () => {
    const server: MatchNotesState = { observations: [{ id: OBS_1, goal_id: GOAL_A }], notes: [] };
    const state = applyQueue(server, [putObs(OBS_1), putObs(OBS_2, GOAL_B), { type: "delete_observation", id: OBS_1 }]);
    expect(state.observations).toEqual([{ id: OBS_2, goal_id: GOAL_B }]);
  });
});

describe("enqueue", () => {
  it("drops both the waiting add and its delete", () => {
    const queue = enqueue([putObs(OBS_1), putObs(OBS_2)], { type: "delete_observation", id: OBS_2 }, new Set([OBS_1]));
    expect(queue).toEqual([putObs(OBS_1)]);
  });

  it("keeps the delete when the add is in flight", () => {
    const deleteOp: NotesOp = { type: "delete_note", id: NOTE_1 };
    expect(enqueue([putNote(NOTE_1)], deleteOp, new Set([NOTE_1]))).toEqual([putNote(NOTE_1), deleteOp]);
  });

  // Regression (review of S-07): an add whose response was lost may already be on the server
  // while it waits for a retry, so dropping it with its delete would leave the entry there.
  it("keeps the delete when the add was sent before and now waits for a retry", () => {
    const deleteOp: NotesOp = { type: "delete_observation", id: OBS_2 };
    expect(enqueue([putObs(OBS_2)], deleteOp, new Set([OBS_2]))).toEqual([putObs(OBS_2), deleteOp]);
  });

  it("queues the delete of an entry the server already has", () => {
    const deleteOp: NotesOp = { type: "delete_observation", id: OBS_3 };
    expect(enqueue([], deleteOp, new Set())).toEqual([deleteOp]);
  });

  it("does not cancel an add of the other kind with the same id", () => {
    const deleteOp: NotesOp = { type: "delete_note", id: OBS_1 };
    expect(enqueue([putObs(OBS_1)], deleteOp, new Set())).toEqual([putObs(OBS_1), deleteOp]);
  });
});

describe("pendingIds", () => {
  it("lists ids of adds still in the queue", () => {
    expect(pendingIds([putObs(OBS_1), { type: "delete_note", id: NOTE_2 }, putNote(NOTE_1)])).toEqual(
      new Set([OBS_1, NOTE_1]),
    );
  });
});

describe("observationCount and lastObservationId", () => {
  const state = applyQueue(empty, [putObs(OBS_1, GOAL_A), putObs(OBS_2, GOAL_B), putObs(OBS_3, GOAL_A)]);

  it("counts observations per goal", () => {
    expect(observationCount(state, GOAL_A)).toBe(2);
    expect(observationCount(state, GOAL_B)).toBe(1);
  });

  it("returns the newest observation of the goal, or null", () => {
    expect(lastObservationId(state, GOAL_A)).toBe(OBS_3);
    expect(lastObservationId(empty, GOAL_A)).toBeNull();
  });
});

describe("parseStoredNotes", () => {
  it("prefixes the storage key with the match id", () => {
    expect(notesStorageKey("abc")).toBe("match-notes:abc");
  });

  it("reads back what it serialized", () => {
    const stored = {
      version: 1 as const,
      queue: [putObs(OBS_1), putNote(NOTE_1), { type: "delete_note" as const, id: NOTE_2 }],
    };
    expect(parseStoredNotes(serializeStoredNotes(stored))).toEqual({ ok: true, stored });
  });

  it("reports no copy for null", () => {
    expect(parseStoredNotes(null)).toEqual({ ok: true, stored: null });
  });

  it("drops unknown fields", () => {
    const raw = JSON.stringify({ version: 1, queue: [{ ...putObs(OBS_1), extra: 1 }] });
    expect(parseStoredNotes(raw)).toEqual({ ok: true, stored: { version: 1, queue: [putObs(OBS_1)] } });
  });

  it.each([
    ["invalid JSON", "{"],
    ["wrong version", JSON.stringify({ version: 2, queue: [] })],
    ["queue not an array", JSON.stringify({ version: 1, queue: {} })],
    ["unknown op", JSON.stringify({ version: 1, queue: [{ type: "edit_note", id: NOTE_1 }] })],
    ["id not a uuid", JSON.stringify({ version: 1, queue: [{ type: "delete_note", id: "1" }] })],
    [
      "note over the limit",
      JSON.stringify({ version: 1, queue: [putNote(NOTE_1, "a".repeat(NOTE_TEXT_MAX_LENGTH + 1))] }),
    ],
    ["note not normalized", JSON.stringify({ version: 1, queue: [putNote(NOTE_1, " a ")] })],
    ["queue too long", JSON.stringify({ version: 1, queue: Array(MAX_QUEUED_OPS + 1).fill(putObs(OBS_1)) })],
  ])("rejects %s", (_, raw) => {
    expect(parseStoredNotes(raw)).toEqual({ ok: false });
  });
});

describe("interpretNotesResponse", () => {
  it("treats 200 and 204 as saved", () => {
    expect(interpretNotesResponse({ kind: "http", status: 200, body: {} })).toEqual({ kind: "saved" });
    expect(interpretNotesResponse({ kind: "http", status: 204, body: null })).toEqual({ kind: "saved" });
  });

  it("treats a redirect and 401 as an expired session", () => {
    expect(interpretNotesResponse({ kind: "redirect" })).toEqual({ kind: "unauthorized" });
    expect(interpretNotesResponse({ kind: "http", status: 401, body: null })).toEqual({ kind: "unauthorized" });
  });

  it("rejects other client errors with their code", () => {
    expect(interpretNotesResponse({ kind: "http", status: 404, body: { error: "goal_not_found" } })).toEqual({
      kind: "rejected",
      error: "goal_not_found",
    });
    expect(interpretNotesResponse({ kind: "http", status: 400, body: null })).toEqual({
      kind: "rejected",
      error: "http_400",
    });
  });

  // Regression (review of S-07): a timeout or rate limit is temporary, so dropping the entry loses data.
  it.each([408, 429])("retries a temporary %i", (status) => {
    expect(interpretNotesResponse({ kind: "http", status, body: null })).toEqual({
      kind: "retry",
      reason: `http_${status}`,
    });
  });

  it("retries network and server errors", () => {
    expect(interpretNotesResponse({ kind: "network_error" })).toEqual({ kind: "retry", reason: "network_error" });
    expect(interpretNotesResponse({ kind: "http", status: 500, body: { error: "save_failed" } })).toEqual({
      kind: "retry",
      reason: "save_failed",
    });
  });
});

describe("appendRejected", () => {
  const entry = (n: number) => ({ op: putObs(OBS_1), error: `e${n}` });

  it("starts a list when there is none or it is unreadable", () => {
    expect(JSON.parse(appendRejected(null, entry(1)))).toEqual([entry(1)]);
    expect(JSON.parse(appendRejected("{", entry(1)))).toEqual([entry(1)]);
    expect(JSON.parse(appendRejected('{"a":1}', entry(1)))).toEqual([entry(1)]);
  });

  // Regression (review of S-07): an unbounded list can fill localStorage and break every save.
  it("keeps only the newest entries", () => {
    let raw: string | null = null;
    for (let n = 0; n < MAX_REJECTED_ENTRIES + 5; n++) {
      raw = appendRejected(raw, entry(n));
    }
    const list = JSON.parse(raw ?? "[]") as { error: string }[];
    expect(list).toHaveLength(MAX_REJECTED_ENTRIES);
    expect(list.at(-1)?.error).toBe(`e${MAX_REJECTED_ENTRIES + 4}`);
    expect(list[0].error).toBe("e5");
  });
});
