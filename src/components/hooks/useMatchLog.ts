import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  chooseInitialLog,
  interpretSyncResponse,
  parseStoredLog,
  retryDelayMs,
  serializeStoredLog,
  storageKey,
  type ServerMatchLog,
  type StoredMatchLog,
  type SyncResponse,
} from "@/lib/services/match-sync";
import { type MatchAction, sameActions } from "@/lib/services/scoring";

export type MatchLogStatusKind = "saved" | "waiting" | "error" | "unauthorized" | "rejected" | "conflict";

export interface MatchLogStatus {
  kind: MatchLogStatusKind;
  detail?: string;
}

export interface MatchLogSnapshot {
  // False until the phone's copy has been read; actions must not be recorded before that.
  ready: boolean;
  actions: MatchAction[];
  status: MatchLogStatus;
}

const STORAGE_FAILED_DETAIL = "nie można zapisać na telefonie";

// Sync engine outside React state, so storage writes stay synchronous and ordered before rendering.
function createMatchLogStore(matchId: string, server: ServerMatchLog) {
  const key = storageKey(matchId);
  const url = `/api/matches/${encodeURIComponent(matchId)}/log`;
  const listeners = new Set<() => void>();

  let log: StoredMatchLog = chooseInitialLog(null, server);
  let ready = false;
  let syncStatus: MatchLogStatus = { kind: "saved" };
  let storageFailed = false;
  let conflictServer: ServerMatchLog | null = null;
  // Set by unauthorized, rejected and conflict; cleared by the next action or a reload.
  let stopped = false;
  let attempt = 0;
  // Each start() gets a new generation; responses from an older one are dropped.
  let generation = 0;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let removeListeners: (() => void) | null = null;

  const serverSnapshot: MatchLogSnapshot = { ready: false, actions: log.actions, status: syncStatus };
  let snapshot: MatchLogSnapshot = serverSnapshot;

  function emit() {
    const status =
      storageFailed && (syncStatus.kind === "saved" || syncStatus.kind === "waiting")
        ? { kind: "error" as const, detail: STORAGE_FAILED_DETAIL }
        : syncStatus;
    snapshot = { ready, actions: log.actions, status };
    for (const listener of listeners) {
      listener();
    }
  }

  // Writes to localStorage first, then updates what the screen shows.
  function persist(next: StoredMatchLog) {
    try {
      localStorage.setItem(key, serializeStoredLog(next));
      storageFailed = false;
    } catch (error) {
      // eslint-disable-next-line no-console -- no error tracker yet; the status line also shows the failure
      console.error("Failed to save match log on the device", error);
      storageFailed = true;
    }
    log = next;
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function send(sent: StoredMatchLog): Promise<SyncResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT",
        // An expired session redirects to sign-in; following it would read as a successful save.
        redirect: "manual",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_revision: sent.baseRevision, events: sent.actions }),
      });
    } catch (error) {
      // eslint-disable-next-line no-console -- no error tracker yet; the queue retries and the status line shows it
      console.error("Match log sync request failed", error);
      return { kind: "network_error" };
    }
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { kind: "redirect" };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch (error) {
      // eslint-disable-next-line no-console -- no error tracker yet; an unreadable body is treated as a retry below
      console.error("Match log sync response is not JSON", response.status, error);
    }
    return { kind: "http", status: response.status, body };
  }

  async function sync() {
    if (!ready || inFlight || stopped || !log.pending) {
      return;
    }
    clearTimer();
    const myGeneration = generation;
    const sent = log;
    inFlight = true;
    const response = await send(sent);
    if (myGeneration !== generation) {
      return;
    }
    inFlight = false;
    const outcome = interpretSyncResponse(response);

    switch (outcome.kind) {
      case "saved": {
        attempt = 0;
        // Actions recorded while the request was in flight still need a save.
        const unchanged = sameActions(log.actions, sent.actions);
        persist({ ...log, baseRevision: outcome.revision, pending: !unchanged });
        syncStatus = { kind: "saved" };
        emit();
        if (!unchanged) {
          void sync();
        }
        return;
      }
      case "conflict":
        stopped = true;
        conflictServer = outcome.server;
        syncStatus = { kind: "conflict" };
        emit();
        return;
      case "unauthorized":
        stopped = true;
        syncStatus = { kind: "unauthorized" };
        emit();
        return;
      case "rejected":
        stopped = true;
        syncStatus = { kind: "rejected", detail: outcome.error };
        emit();
        return;
      case "retry":
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
    void sync();
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      void sync();
    }
  }

  function changeActions(actions: MatchAction[]) {
    if (!ready) {
      return;
    }
    persist({ version: 1, actions, baseRevision: log.baseRevision, pending: true });
    // A new action is the user's retry after unauthorized or rejected.
    stopped = false;
    attempt = 0;
    if (syncStatus.kind !== "saved" && syncStatus.kind !== "waiting" && syncStatus.kind !== "error") {
      syncStatus = { kind: "waiting" };
    }
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
      inFlight = false;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(key);
      } catch (error) {
        // eslint-disable-next-line no-console -- no error tracker yet; the status line also shows the failure
        console.error("Failed to read match log from the device", error);
        storageFailed = true;
      }
      const parsed = parseStoredLog(raw);
      let local: StoredMatchLog | null = null;
      if (parsed.ok) {
        local = parsed.log;
      } else {
        // eslint-disable-next-line no-console -- no error tracker yet; the raw copy is kept for inspection
        console.error("Corrupt match log on the device, starting from the server copy", { matchId });
        try {
          localStorage.setItem(`${key}:corrupt`, raw ?? "");
        } catch (error) {
          // eslint-disable-next-line no-console -- no error tracker yet; nothing else can keep the corrupt copy
          console.error("Failed to keep the corrupt match log", error);
        }
      }
      log = chooseInitialLog(local, server);
      ready = true;
      syncStatus = log.pending ? { kind: "waiting" } : { kind: "saved" };
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
      inFlight = false;
      clearTimer();
      removeListeners?.();
      removeListeners = null;
    },

    record(action: MatchAction) {
      changeActions([...log.actions, action]);
    },

    undo() {
      if (log.actions.length === 0) {
        return;
      }
      changeActions(log.actions.slice(0, -1));
    },

    keepServer() {
      if (conflictServer === null) {
        return;
      }
      persist({ version: 1, actions: conflictServer.actions, baseRevision: conflictServer.revision, pending: false });
      conflictServer = null;
      stopped = false;
      attempt = 0;
      syncStatus = { kind: "saved" };
      emit();
    },

    keepMine() {
      if (conflictServer === null) {
        return;
      }
      persist({ ...log, baseRevision: conflictServer.revision, pending: true });
      conflictServer = null;
      stopped = false;
      attempt = 0;
      syncStatus = { kind: "waiting" };
      emit();
      void sync();
    },
  };
}

export function useMatchLog({
  matchId,
  initialActions,
  initialRevision,
}: {
  matchId: string;
  initialActions: MatchAction[];
  initialRevision: number;
}) {
  // Created once per mount; the server props only seed the first render and the start-up choice.
  const [store] = useState(() => createMatchLogStore(matchId, { actions: initialActions, revision: initialRevision }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    store.start();
    return () => {
      store.stop();
    };
  }, [store]);

  const record = useCallback(
    (action: MatchAction) => {
      store.record(action);
    },
    [store],
  );
  const undo = useCallback(() => {
    store.undo();
  }, [store]);
  const keepServer = useCallback(() => {
    store.keepServer();
  }, [store]);
  const keepMine = useCallback(() => {
    store.keepMine();
  }, [store]);

  return { ...snapshot, record, undo, keepServer, keepMine };
}
