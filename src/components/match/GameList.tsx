import { type GameRecord, pointLabel, type Side } from "@/lib/services/scoring";
import { cn } from "@/lib/utils";

interface Props {
  history: GameRecord[];
  names: Record<Side, string>;
  withAdvantage: boolean;
}

// Score at the deciding point of a regular game, e.g. 40:30; from deuce the loser stays at 40.
function gameScoreText(record: GameRecord, withAdvantage: boolean): { score: string; note: string | null } {
  const { player, opponent } = record.points;
  if (record.tiebreak) {
    return { score: `${player}:${opponent}`, note: null };
  }
  const loserPoints = record.points[record.winner === "player" ? "opponent" : "player"];
  const fromDeuce = loserPoints >= 3;
  const winnerLabel = fromDeuce && withAdvantage ? "AD" : "40";
  const loserLabel = fromDeuce ? "40" : pointLabel(loserPoints);
  const labels = record.winner === "player" ? [winnerLabel, loserLabel] : [loserLabel, winnerLabel];
  const note = fromDeuce ? (withAdvantage ? "po równowadze" : "przy 40:40") : null;
  return { score: labels.join(":"), note };
}

function groupBySet(history: GameRecord[]): GameRecord[][] {
  const sets: GameRecord[][] = [];
  for (const record of history) {
    (sets[record.set - 1] ??= []).push(record);
  }
  return sets.filter((games) => games.length > 0);
}

export default function GameList({ history, names, withAdvantage }: Props) {
  if (history.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="game-list-heading" className="space-y-3">
      <h2 id="game-list-heading" className="text-lg font-semibold">
        Przebieg meczu
      </h2>
      {groupBySet(history).map((games) => (
        <table key={games[0].set} className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="mb-1 text-left text-xs text-blue-100/70">
            {games[0].superTiebreak ? "Super tie-break" : `Set ${games[0].set}`}
          </caption>
          <thead className="text-xs text-blue-100/70">
            <tr>
              <th scope="col" className="w-10 font-normal">
                Gem
              </th>
              <th scope="col" className="font-normal">
                Serwuje
              </th>
              <th scope="col" className="font-normal">
                Wygrywa
              </th>
              <th scope="col" className="w-24 font-normal">
                Punkty
              </th>
              <th scope="col" className="w-10 text-right font-normal">
                Set
              </th>
            </tr>
          </thead>
          <tbody>
            {games.map((record) => {
              const { score, note } = gameScoreText(record, withAdvantage);
              const details = [note, record.manual ? "ręcznie" : null].filter((detail) => detail !== null);
              return (
                <tr key={record.game} className="border-t border-white/10 align-top">
                  <td className="py-1.5 tabular-nums">
                    {record.superTiebreak ? "STB" : record.tiebreak ? "TB" : record.game}
                  </td>
                  <td className="truncate py-1.5">{names[record.server]}</td>
                  <td className={cn("truncate py-1.5", record.winner === "player" && "font-semibold")}>
                    {names[record.winner]}
                  </td>
                  <td className="py-1.5">
                    <span className="font-semibold tabular-nums">{score}</span>
                    {details.length > 0 && <span className="block text-xs text-blue-100/70">{details.join(", ")}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {/* A super tie-break is not a set of games, so it has no set score. */}
                    {record.superTiebreak ? "–" : `${record.setScore.player}:${record.setScore.opponent}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </section>
  );
}
