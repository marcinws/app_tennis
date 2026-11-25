import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { type MatchNotesStatus, useMatchNotes } from "@/components/hooks/useMatchNotes";
import {
  lastObservationId,
  NOTE_ERROR_MESSAGES,
  NOTE_TEXT_MAX_LENGTH,
  observationCount,
  parseNoteText,
} from "@/lib/services/match-notes";
import { cn } from "@/lib/utils";
import type { MatchNote, MatchObservation } from "@/types";

interface Goal {
  id: string;
  text: string;
  // False for a goal ended during this match; it stays on screen because it has observations here.
  active: boolean;
}

interface Props {
  matchId: string;
  playerId: string;
  goals: Goal[];
  initialObservations: MatchObservation[];
  initialNotes: MatchNote[];
}

function statusText(status: MatchNotesStatus): string | null {
  switch (status.kind) {
    case "saved":
      return null;
    case "waiting":
      return "Obserwacje i notatki czekają na sieć — są na telefonie";
    case "error":
      if (status.local) {
        return `Uwaga: ${status.detail ?? "błąd na telefonie"}`;
      }
      return `Błąd zapisu obserwacji (${status.detail ?? "nieznany"}), ponawiam`;
    case "unauthorized":
      return "Sesja wygasła — zaloguj się ponownie, obserwacje i notatki są na telefonie";
    case "rejected":
      return `Serwer odrzucił obserwację lub notatkę (${status.detail ?? "nieznany"})`;
  }
}

function noteTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

export default function MatchNotes({ matchId, playerId, goals, initialObservations, initialNotes }: Props) {
  const { ready, state, pending, status, addObservation, removeObservation, addNote, removeNote, dismissRejected } =
    useMatchNotes({
      matchId,
      initialObservations,
      initialNotes,
    });
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const notesPanelId = useId();
  const noteInputId = useId();
  const message = statusText(status);
  const overLimit = Array.from(draft).length > NOTE_TEXT_MAX_LENGTH;

  const submitNote = () => {
    const parsed = parseNoteText(draft);
    if (!parsed.ok) {
      setDraftError(NOTE_ERROR_MESSAGES[parsed.error]);
      return;
    }
    addNote(parsed.text);
    setDraft("");
    setDraftError(null);
  };

  return (
    <section
      aria-labelledby="goals-heading"
      className="mb-4 space-y-2 rounded-lg border border-white/20 bg-white/5 p-3 text-sm"
    >
      <h2 id="goals-heading" className="text-xs font-semibold tracking-wide text-blue-100/70 uppercase">
        Cele
      </h2>
      {goals.length === 0 ? (
        <p className="text-blue-100/70">
          Brak aktywnych celów ·{" "}
          <a
            href={`/players/${playerId}`}
            className="text-purple-300 transition-colors hover:text-purple-100 hover:underline"
          >
            Dodaj cele
          </a>
        </p>
      ) : (
        <ul className="space-y-2">
          {goals.map((goal) => {
            const count = observationCount(state, goal.id);
            const lastId = lastObservationId(state, goal.id);
            return (
              <li key={goal.id} className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-foreground min-h-12 flex-1 justify-between gap-3 text-left whitespace-normal"
                  aria-label={`Obserwacja: ${goal.text}. Dotąd ${count}`}
                  disabled={!ready}
                  onClick={() => {
                    addObservation(goal.id);
                  }}
                >
                  <span className={cn("min-w-0 flex-1", !goal.active && "line-through opacity-70")}>{goal.text}</span>
                  <span className="rounded-full bg-purple-600 px-2.5 py-0.5 font-semibold text-white tabular-nums">
                    {count}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-foreground min-h-12 w-12"
                  aria-label={`Cofnij obserwację: ${goal.text}`}
                  disabled={!ready || lastId === null}
                  onClick={() => {
                    if (lastId !== null) {
                      removeObservation(lastId);
                    }
                  }}
                >
                  −
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="ghost"
        className="h-auto px-0 text-purple-300 hover:bg-transparent hover:text-purple-100"
        aria-expanded={notesOpen}
        aria-controls={notesPanelId}
        onClick={() => {
          setNotesOpen(!notesOpen);
        }}
      >
        {notesOpen ? "Ukryj notatki" : "Notatki"} ({state.notes.length})
      </Button>

      {notesOpen && (
        <div id={notesPanelId} className="space-y-2">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitNote();
            }}
          >
            <label htmlFor={noteInputId} className="sr-only">
              Notatka
            </label>
            <input
              id={noteInputId}
              type="text"
              value={draft}
              placeholder="Krótka notatka"
              aria-invalid={draftError !== null}
              aria-describedby={`${noteInputId}-hint`}
              className="min-h-12 min-w-0 flex-1 rounded-md border border-white/20 bg-white/10 px-3 text-white placeholder:text-blue-100/50"
              onChange={(event) => {
                setDraft(event.target.value);
                setDraftError(null);
              }}
            />
            <Button type="submit" className="min-h-12" disabled={!ready}>
              Dodaj
            </Button>
          </form>
          {/* No maxLength: it counts UTF-16 units, the limit counts characters like parseNoteText and Postgres. */}
          <p
            id={`${noteInputId}-hint`}
            className={cn("text-xs", draftError || overLimit ? "text-red-200" : "text-blue-100/60")}
          >
            {draftError ?? `${Array.from(draft).length}/${NOTE_TEXT_MAX_LENGTH}`}
          </p>
          {state.notes.length > 0 && (
            <ul className="space-y-1">
              {state.notes.map((note) => (
                <li key={note.id} className="flex items-start gap-2">
                  <span className="text-blue-100/60 tabular-nums">{noteTime(note.created_at)}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {note.text}
                    {pending.has(note.id) && <span className="ml-1 text-xs text-yellow-200">(na telefonie)</span>}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-200 hover:underline disabled:opacity-50"
                    disabled={!ready}
                    onClick={() => {
                      if (window.confirm(`Usunąć notatkę „${note.text}”? Nie da się jej odtworzyć.`)) {
                        removeNote(note.id);
                      }
                    }}
                  >
                    Usuń
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={cn("flex items-center gap-2", message === null && "sr-only")}>
        <p role="status" className="text-xs text-yellow-200">
          {ready ? (message ?? "Obserwacje zapisane") : "Wczytywanie obserwacji z telefonu…"}
        </p>
        {status.kind === "rejected" && (
          <button type="button" className="text-xs text-purple-300 hover:underline" onClick={dismissRejected}>
            OK
          </button>
        )}
      </div>
    </section>
  );
}
