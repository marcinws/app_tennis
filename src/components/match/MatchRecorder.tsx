import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useMatchLog, type MatchLogStatus } from "@/components/hooks/useMatchLog";
import type { MatchFormatId } from "@/lib/services/matches";
import { gamePointLabels, type MatchAction, replayMatch, type Side } from "@/lib/services/scoring";
import { cn } from "@/lib/utils";

interface Props {
  matchId: string;
  playerName: string;
  format: MatchFormatId;
  withAdvantage: boolean;
  firstServer: Side;
  initialActions: MatchAction[];
  initialRevision: number;
}

function statusText(status: MatchLogStatus): string | null {
  switch (status.kind) {
    case "saved":
      return "Zapisano";
    case "waiting":
      return "Czeka na sieć — punkty są na telefonie";
    case "error":
      return `Błąd zapisu (${status.detail ?? "nieznany"}), ponawiam`;
    case "unauthorized":
      return "Sesja wygasła — zaloguj się ponownie, punkty są na telefonie";
    case "rejected":
      return `Serwer odrzucił zapis (${status.detail ?? "nieznany"})`;
    case "conflict":
      // The conflict alert below explains the state.
      return null;
  }
}

export default function MatchRecorder({
  matchId,
  playerName,
  format,
  withAdvantage,
  firstServer,
  initialActions,
  initialRevision,
}: Props) {
  const { ready, actions, status, record, undo, keepServer, keepMine } = useMatchLog({
    matchId,
    initialActions,
    initialRevision,
  });
  const replay = useMemo(
    () => replayMatch({ format, withAdvantage, firstServer }, actions),
    [format, withAdvantage, firstServer, actions],
  );

  const names: Record<Side, string> = { player: playerName, opponent: "Przeciwnik" };
  const state = replay.ok ? replay.state : null;
  const labels = state ? gamePointLabels(state, withAdvantage) : null;
  const finished = state !== null && state.winner !== null;
  const canScore = ready && state !== null && !finished;
  const message = statusText(status);

  return (
    <section aria-label="Zapis meczu" className="mb-8 space-y-4">
      {state && labels ? (
        <table className="w-full table-fixed border-collapse text-center text-lg">
          <caption className="sr-only">Wynik meczu</caption>
          <thead className="text-xs text-blue-100/70">
            <tr>
              <th scope="col" className="w-2/5 text-left font-normal">
                Zawodnik
              </th>
              {state.sets.map((_, index) => (
                <th key={index} scope="col" className="font-normal">
                  Set {index + 1}
                </th>
              ))}
              {!finished && (
                <>
                  <th scope="col" className="font-normal">
                    Gemy
                  </th>
                  <th scope="col" className="font-normal">
                    {state.inTiebreak ? "Tie-break" : "Punkty"}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {(["player", "opponent"] as const).map((side) => (
              <tr key={side} className="border-t border-white/10">
                <th scope="row" className="truncate py-2 text-left font-semibold">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mr-2 inline-block size-2.5 rounded-full align-middle",
                      !finished && state.server === side ? "bg-yellow-300" : "bg-transparent",
                    )}
                  />
                  {names[side]}
                </th>
                {state.sets.map((set, index) => (
                  <td key={index} className="py-2 tabular-nums">
                    {set[side]}
                    {set.tiebreak && <sup className="ml-0.5 text-xs text-blue-100/70">{set.tiebreak[side]}</sup>}
                  </td>
                ))}
                {!finished && (
                  <>
                    <td className="py-2 tabular-nums">{state.games[side]}</td>
                    <td className="py-2 font-bold tabular-nums">{labels[side]}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p role="alert" className="rounded-md border border-red-300/40 bg-red-500/20 p-3 text-sm">
          Nie można odtworzyć wyniku z zapisu na telefonie
          {!replay.ok && ` (akcja nr ${replay.index + 1} po zakończeniu meczu)`}. Cofnij ostatnie akcje albo wczytaj
          mecz ponownie.
        </p>
      )}

      {state &&
        (state.winner ? (
          <p className="text-lg font-semibold">Mecz zakończony — wygrywa {names[state.winner]}</p>
        ) : (
          <p className="text-sm text-blue-100/80">Serwuje: {names[state.server]}</p>
        ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          className="min-h-24 w-full text-lg whitespace-normal"
          disabled={!canScore}
          onClick={() => {
            record({ type: "point", winner: "player" });
          }}
        >
          Punkt dla {playerName}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-24 w-full text-lg whitespace-normal"
          disabled={!canScore}
          onClick={() => {
            record({ type: "point", winner: "opponent" });
          }}
        >
          Punkt dla przeciwnika
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-12 w-full"
          disabled={!ready || actions.length === 0}
          onClick={undo}
        >
          Cofnij
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-12 w-full whitespace-normal"
          disabled={!canScore}
          onClick={() => {
            record({ type: "switch_server" });
          }}
        >
          Zmień serwującego
        </Button>
      </div>

      {status.kind === "conflict" && (
        <div role="alert" className="space-y-3 rounded-md border border-yellow-300/40 bg-yellow-500/20 p-3 text-sm">
          <p>Mecz zmieniono na innym telefonie</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="text-foreground" onClick={keepServer}>
              Wczytaj wersję z serwera
            </Button>
            <Button type="button" onClick={keepMine}>
              Zachowaj mój zapis
            </Button>
          </div>
        </div>
      )}

      <p
        role="status"
        className={cn("min-h-5 text-sm", status.kind === "saved" ? "text-blue-100/70" : "text-yellow-200")}
      >
        {ready ? message : "Wczytywanie zapisu z telefonu…"}
      </p>
    </section>
  );
}
