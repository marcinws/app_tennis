import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  isReachableGameScore,
  type MatchAction,
  type MatchState,
  MAX_GAME_SCORE_POINTS,
  pointLabel,
  type Score,
  type Side,
} from "@/lib/services/scoring";
import { cn } from "@/lib/utils";

interface Props {
  state: MatchState;
  withAdvantage: boolean;
  tiebreakTo: number;
  names: Record<Side, string>;
  onSave: (action: MatchAction) => void;
  onCancel: () => void;
}

type Mode = "progress" | "won";

const SIDES = ["player", "opponent"] as const;
// Regular game choices as point counts; 4 stands for AD.
const LOSER_CHOICES = [0, 1, 2, 3] as const;
const AD = 4;

function other(side: Side): Side {
  return side === "player" ? "opponent" : "player";
}

// Score with `side` at `points` and the other side at `rivalPoints`.
function scoreFor(side: Side, points: number, rivalPoints: number): Score {
  return side === "player" ? { player: points, opponent: rivalPoints } : { player: rivalPoints, opponent: points };
}

function choiceLabel(points: number): string {
  return points === AD ? "AD" : pointLabel(points);
}

// In-progress counts from the current score; deuce and advantage fold into 3:3, 4:3 or 3:4.
function initialProgress(points: Score): Score {
  const { player, opponent } = points;
  if (player >= 3 && opponent >= 3) {
    if (player === opponent) {
      return { player: 3, opponent: 3 };
    }
    return player > opponent ? { player: AD, opponent: 3 } : { player: 3, opponent: AD };
  }
  return { player: Math.min(player, 3), opponent: Math.min(opponent, 3) };
}

// AD needs the other side at 40, so choosing either keeps the pair valid.
function chooseProgress(score: Score, side: Side, points: number): Score {
  if (points === AD) {
    return scoreFor(side, AD, 3);
  }
  const rivalPoints = score[other(side)];
  return scoreFor(side, points, rivalPoints === AD ? 3 : rivalPoints);
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      className={cn("min-h-12 flex-1 text-base whitespace-normal tabular-nums", !selected && "text-foreground")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export default function ManualGameScore({ state, withAdvantage, tiebreakTo, names, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>("progress");
  const [progress, setProgress] = useState<Score>(() => initialProgress(state.points));
  const [gameWinner, setGameWinner] = useState<Side | null>(null);
  const [loserPoints, setLoserPoints] = useState(0);
  const [tiebreak, setTiebreak] = useState<Score>(state.points);

  const target = state.inTiebreak ? tiebreakTo : 4;
  const lead = state.inTiebreak || withAdvantage ? 2 : 1;

  let score: Score | null;
  let description: string;
  if (state.inTiebreak) {
    score = tiebreak;
    const leader = score.player > score.opponent ? "player" : "opponent";
    const won = Math.max(score.player, score.opponent) >= target && Math.abs(score.player - score.opponent) >= 2;
    if (!isReachableGameScore(score, target, lead)) {
      description = `Wynik niemożliwy w tie-breaku do ${target}`;
    } else if (won) {
      description = `Tie-break dla ${names[leader]}, ${score[leader]}:${score[other(leader)]}`;
    } else {
      description = `Tie-break w trakcie, ${score.player}:${score.opponent}`;
    }
  } else if (mode === "progress") {
    score = progress;
    description = `${names.player} ${choiceLabel(score.player)}, ${names.opponent} ${choiceLabel(score.opponent)}`;
  } else if (gameWinner === null) {
    score = null;
    description = "Wybierz, kto wygrał gema";
  } else {
    // From 40 the loser forces deuce: with advantage the winner needs two more points.
    const fromDeuce = loserPoints === 3;
    score = scoreFor(gameWinner, fromDeuce && withAdvantage ? 5 : 4, loserPoints);
    const detail = fromDeuce ? (withAdvantage ? "po równowadze" : "przy 40:40") : `40:${pointLabel(loserPoints)}`;
    description = `Gem dla ${names[gameWinner]}, ${detail}`;
  }
  const canSave = score !== null && isReachableGameScore(score, target, lead);

  return (
    <div className="space-y-4 rounded-md border border-white/20 bg-white/5 p-3">
      {state.inTiebreak ? (
        <div className="space-y-3">
          {SIDES.map((side) => (
            <div key={side} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-semibold">{names[side]}</span>
              <Button
                type="button"
                variant="outline"
                className="text-foreground min-h-12 min-w-12 text-lg"
                aria-label={`Odejmij punkt: ${names[side]}`}
                disabled={tiebreak[side] === 0}
                onClick={() => {
                  setTiebreak({ ...tiebreak, [side]: tiebreak[side] - 1 });
                }}
              >
                −
              </Button>
              <span className="w-10 text-center text-2xl font-bold tabular-nums">{tiebreak[side]}</span>
              <Button
                type="button"
                variant="outline"
                className="text-foreground min-h-12 min-w-12 text-lg"
                aria-label={`Dodaj punkt: ${names[side]}`}
                disabled={tiebreak[side] >= MAX_GAME_SCORE_POINTS}
                onClick={() => {
                  setTiebreak({ ...tiebreak, [side]: tiebreak[side] + 1 });
                }}
              >
                +
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <ChoiceButton
              selected={mode === "progress"}
              onClick={() => {
                setMode("progress");
              }}
            >
              W trakcie
            </ChoiceButton>
            {SIDES.map((side) => (
              <ChoiceButton
                key={side}
                selected={mode === "won" && gameWinner === side}
                onClick={() => {
                  setMode("won");
                  setGameWinner(side);
                }}
              >
                {`Gem dla ${names[side]}`}
              </ChoiceButton>
            ))}
          </div>

          {mode === "progress" ? (
            SIDES.map((side) => (
              <div key={side} className="space-y-1">
                <p className="truncate text-sm text-blue-100/80">{names[side]}</p>
                <div className="flex gap-2">
                  {(withAdvantage ? [...LOSER_CHOICES, AD] : LOSER_CHOICES).map((points) => (
                    <ChoiceButton
                      key={points}
                      selected={progress[side] === points}
                      onClick={() => {
                        setProgress(chooseProgress(progress, side, points));
                      }}
                    >
                      {choiceLabel(points)}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-1">
              <p className="truncate text-sm text-blue-100/80">
                {gameWinner === null ? "Wynik przegranego" : `Wynik: ${names[other(gameWinner)]}`}
              </p>
              <div className="flex gap-2">
                {LOSER_CHOICES.map((points) => (
                  <ChoiceButton
                    key={points}
                    selected={loserPoints === points}
                    onClick={() => {
                      setLoserPoints(points);
                    }}
                  >
                    {pointLabel(points)}
                  </ChoiceButton>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p aria-live="polite" className={cn("text-sm", canSave ? "text-blue-100/80" : "text-yellow-200")}>
        {description}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="text-foreground min-h-12 w-full" onClick={onCancel}>
          Anuluj
        </Button>
        <Button
          type="button"
          className="min-h-12 w-full"
          disabled={!canSave}
          onClick={() => {
            if (score !== null) {
              onSave({ type: "game_score", player: score.player, opponent: score.opponent });
            }
          }}
        >
          Zapisz
        </Button>
      </div>
    </div>
  );
}
