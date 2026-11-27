import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  appendRejected,
  applyOp,
  applyQueue,
  enqueue,
  interpretNotesResponse,
  type MatchNotesState,
  type NotesOp,
  notesStorageKey,
  opId,
  parseStoredNotes,
  pendingIds,
  serializeStoredNotes,
} from "@/lib/services/match-notes";
import { retryDelayMs, type SyncResponse } from "@/lib/services/match-sync";
import type { MatchNote, MatchObservation } from "@/types";

export type MatchNotesStatusKind = "saved" | "waiting" | "error" | "unauthorized" | "rejected";

export interface MatchNotesStatus {
  kind: MatchNotesStatusKind;
  detail?: string;
  // A problem with the copy on the phone, not a failed server save, so nothing is retried for it.
  local?: true;
}

export interface MatchNotesSnapshot {
  // False until the phone's copy has been read; nothing may be recorded before that.
  ready: boolean;
  state: MatchNotesState;
  // Ids of entries the server has not confirmed yet.
  pending: Set<string>;
  status: MatchNotesStatus;
}

const STORAGE_FAILED_DETAIL = "nie można zapisać na telefonie";
const CORRUPT_COPY_DETAIL = "kopia na telefonie była uszkodzona";
const SYNC_TIMEOUT_MS = 10_000;

function opUrl(matchId: string, op: NotesOp): string {
  const kind = op.type === "put_observation" || op.type === "delete_observation" ? "observations" : "notes";
  return `/api/matches/${encodeURIComponent(matchId)}/${kind}/${encodeURIComponent(opId(op))}`;
}

function opRequest(op: NotesOp): { method: "PUT" | "DELETE"; body?: string } {
  switch (op.type) {
    case "put_observation":
      return { method: "PUT", body: JSON.stringify({ goal_id: op.observation.goal_id }) };
    case "put_note":
      return { method: "PUT", body: JSON.stringify({ text: op.note.text }) };
    case "delete_observation":
    case "delete_note":
      return { method: "DELETE" };
  }
}

// Queue engine outside React state, like the match log store: storage writes stay synchronous
// and ordered before rendering, and exactly one request is in flight at a time.
function createMatchNotesStore(matchId: string, initial: MatchNotesState) {
  const key = notesStorageKey(matchId);
  const listeners = new Set<() => void>();

  // What the server has confirmed; the screen shows it with the queue applied on top.
  let confirmed: MatchNotesState = initial;
  let queue: NotesOp[] = [];
  let ready = false;
  let syncStatus: MatchNotesStatus = { kind: "saved" };
  let storageFailed = false;
  // Set when the phone's copy was corrupt at start; cleared by the next successful save.
  let corruptCopy = false;
  // Set by unauthorized; cleared by the next action, a reload, or the network coming back.
  let stopped = false;
  // Ids of adds sent at least once; such an add may be on the server even while it waits for a retry.
  // Adds read back from the phone count as sent, because an earlier page may have sent them.
  const sentIds = new Set<string>();
  // Rejections stay on screen until the parent dismisses them, so a later save cannot hide them.
  let rejectedNotice: { count: number; detail: string } | null = null;
  let attempt = 0;
  // Each start() gets a new generation; responses from an older one are dropped.
  let generation = 0;
  let inFlight: NotesOp | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let removeListeners: (() => void) | null = null;

  const serverSnapshot: MatchNotesSnapshot = { ready: false, state: initial, pending: new Set(), status: syncStatus };
  let snapshot: MatchNotesSnapshot = serverSnapshot;

  function emit() {
    const quiet = syncStatus.kind === "saved" || syncStatus.kind === "waiting";
    let status = syncStatus;
    if (quiet && rejectedNotice !== null) {
      const { count, detail } = rejectedNotice;
      status = { kind: "rejected", detail: count > 1 ? `${detail}, razem ${count}` : detail };
    } else if (quiet && storageFailed) {
      status = { kind: "error", detail: STORAGE_FAILED_DETAIL, local: true };
    } else if (quiet && corruptCopy) {
      status = { kind: "error", detail: CORRUPT_COPY_DETAIL, local: true };
    }
    snapshot = { ready, state: applyQueue(confirmed, queue), pending: pendingIds(queue), status };
    for (const listener of listeners) {
      listener();
    }
  }

  // Writes the queue to localStorage first; an empty queue means the server has everything.
  function persist(next: NotesOp[]) {
    try {
      if (next.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, serializeStoredNotes({ version: 1, queue: next }));
      }
      storageFailed = false;
    } catch (error) {
      // eslint-disable-next-line no-console -- no error tracker yet; the status line also shows the failure
      console.error("Failed to save match notes on the device", error);
      storageFailed = true;
    }
    queue = next;
  }

  // Keeps a rejected operation as evidence, like the match log's :corrupt and :discarded copies.
  function keepRejected(op: NotesOp, error: string) {
    try {
      const rejectedKey = `${key}:rejected`;
      localStorage.setItem(rejectedKey, appendRejected(localStorage.getItem(rejectedKey), { op, error }));
    } catch (storageError) {
      // eslint-disable-next-line no-console -- no error tracker yet; the rejection itself is logged by the caller
      console.error("Failed to keep the rejected match note operation", storageError);
    }
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function send(op: NotesOp): Promise<SyncResponse> {
    const { method, body } = opRequest(op);
    let response: Response;
    try {
      response = await fetch(opUrl(matchId, op), {
        method,
        // An expired session redirects to sign-in; following it would read as a successful save.
        redirect: "manual",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        // A hanging request would block the queue; a timeout rejects and is retried as a network error.
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
        body,
      });
    } catch (error) {
      // eslint-disable-next-line no-console -- no error tracker yet; the queue retries and the status line shows it
      console.error("Match note sync request failed", error);
      return { kind: "network_error" };
    }
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { kind: "redirect" };
    }
    let responseBody: unknown = null;
    if (response.status !== 204) {
      try {
        responseBody = await response.json();
      } catch (error) {
        // eslint-disable-next-line no-console -- no error tracker yet; an unreadable body falls back to the status code
        console.error("Match note sync response is not JSON", response.status, error);
      }
    }
    return { kind: "http", status: response.status, body: responseBody };
  }

  async function sync() {
    if (!ready || inFlight !== null || stopped || queue.length === 0) {
      return;
    }
    clearTimer();
    const myGeneration = generation;
    const op = queue[0];
    inFlight = op;
    sentIds.add(opId(op));
    const response = await send(op);
    if (myGeneration !== generation) {
      return;
    }
    inFlight = null;
    const outcome = interpretNotesResponse(response);

    switch (outcome.kind) {
      case "saved":
        attempt = 0;
        confirmed = applyOp(confirmed, op);
        persist(queue.slice(1));
        corruptCopy = false;
        syncStatus = queue.length === 0 ? { kind: "saved" } : { kind: "waiting" };
        emit();
        void sync();
        return;
      case "rejected":
        // A retry cannot fix it, so the operation leaves the queue and its effect leaves the screen.
        // eslint-disable-next-line no-console -- no error tracker yet; the status line also shows the rejection
        console.error("Server rejected a match note operation", { matchId, op, error: outcome.error });
        keepRejected(op, outcome.error);
        attempt = 0;
        persist(queue.slice(1));
        rejectedNotice = { count: (rejectedNotice?.count ?? 0) + 1, detail: outcome.error };
        syncStatus = queue.length === 0 ? { kind: "saved" } : { kind: "waiting" };
        emit();
        void sync();
        return;
      case "unauthorized":
        stopped = true;
        syncStatus = { kind: "unauthorized" };
        emit();
        return;
      case "retry":
        // A client error that did not come from the notes routes stalls the whole queue until it clears;
        // logged once per stalled operation, not on every retry.
        if (attempt === 0 && response.kind === "http" && response.status >= 400 && response.status < 500) {
          // eslint-disable-next-line no-console -- no error tracker yet; the status line also shows it
          console.error("Match note sync stalled on a client error", {
            matchId,
            opType: op.type,
            status: response.status,
            reason: outcome.reason,
          });
        }
        syncStatus =
          outcome.reason === "network_error" ? { kind: "waiting" } : { kind: "error", detail: outcome.reason };
        emit();
        timer = setTimeout(() => {
          timer = null;
          void sync();
        }, retryDelayMs(attempt));
        attempt += 1;
        return;
    }
  }

  function retryNow() {
    stopped = false;
    void sync();
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      void sync();
    }
  }

  function change(op: NotesOp) {
    if (!ready) {
      return;
    }
    persist(enqueue(queue, op, sentIds));
    // A new action is the user's retry after an expired session.
    stopped = false;
    attempt = 0;
    syncStatus = queue.length === 0 ? { kind: "saved" } : { kind: "waiting" };
    emit();
    void sync();
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,

    start() {
      generation += 1;
      inFlight = null;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(key);
      } catch (error) {
        // eslint-disable-next-line no-console -- no error tracker yet; the status line also shows the failure
        console.error("Failed to read match notes from the device", error);
        storageFailed = true;
      }
      const parsed = parseStoredNotes(raw);
      if (parsed.ok) {
        queue = parsed.stored?.queue ?? [];
        for (const op of queue) {
          sentIds.add(opId(op));
        }
      } else {
        // eslint-disable-next-line no-console -- no error tracker yet; the raw copy is kept for inspection
        console.error("Corrupt match notes on the device, starting from the server copy", { matchId });
        corruptCopy = true;
        queue = [];
        try {
          localStorage.setItem(`${key}:corrupt`, raw ?? "");
          localStorage.removeItem(key);
        } catch (error) {
          // eslint-disable-next-line no-console -- no error tracker yet; nothing else can keep the corrupt copy
          console.error("Failed to keep the corrupt match notes", error);
        }
      }
      ready = true;
      syncStatus = queue.length === 0 ? { kind: "saved" } : { kind: "waiting" };
      emit();

      window.addEventListener("online", retryNow);
      document.addEventListener("visibilitychange", onVisibilityChange);
      removeListeners = () => {
        window.removeEventListener("online", retryNow);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
      void sync();
    },

    stop() {
      generation += 1;
      inFlight = null;
      clearTimer();
      removeListeners?.();
      removeListeners = null;
    },

    addObservation(goalId: string) {
      const observation: MatchObservation = { id: crypto.randomUUID(), goal_id: goalId };
      change({ type: "put_observation", observation });
    },

    dismissRejected() {
      rejectedNotice = null;
      emit();
    },

    removeObservation(id: string) {
      change({ type: "delete_observation", id });
    },

    // `text` must already be normalized by parseNoteText.
    addNote(text: string) {
      const note: MatchNote = { id: crypto.randomUUID(), text, created_at: new Date().toISOString() };
      change({ type: "put_note", note });
    },

    removeNote(id: string) {
      change({ type: "delete_note", id });
    },
  };
}

export function useMatchNotes({
  matchId,
  initialObservations,
  initialNotes,
}: {
  matchId: string;
  initialObservations: MatchObservation[];
  initialNotes: MatchNote[];
}) {
  // Created once per mount; the server props only seed the confirmed state.
  const [store] = useState(() =>
    createMatchNotesStore(matchId, { observations: initialObservations, notes: initialNotes }),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    store.start();
    return () => {
      store.stop();
    };
  }, [store]);

  const addObservation = useCallback(
    (goalId: string) => {
      store.addObservation(goalId);
    },
    [store],
  );
  const removeObservation = useCallback(
    (id: string) => {
      store.removeObservation(id);
    },
    [store],
  );
  const dismissRejected = useCallback(() => {
    store.dismissRejected();
  }, [store]);
  const addNote = useCallback(
    (text: string) => {
      store.addNote(text);
    },
    [store],
  );
  const removeNote = useCallback(
    (id: string) => {
      store.removeNote(id);
    },
    [store],
  );

  return { ...snapshot, addObservation, removeObservation, addNote, removeNote, dismissRejected };
}
