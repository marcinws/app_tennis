import type { FirstServer, MatchFormatId } from "./matches";

const POINT_LABELS = ["0", "15", "30", "40"] as const;

// Label for points won by one player in a regular (non-tiebreak) game.
export function pointLabel(points: number): string {
  if (!Number.isInteger(points) || points < 0 || points >= POINT_LABELS.length) {
    throw new RangeError(`Invalid point count: ${points}`);
  }
  return POINT_LABELS[points];
}

export type Side = FirstServer;

export type MatchAction = { type: "point"; winner: Side } | { type: "switch_server" };

// Must equal the `check` on matches.events in the match events migration.
export const MAX_MATCH_ACTIONS = 2000;

export interface ScoringRules {
  gamesPerSet: number;
  tiebreakAt: number;
  tiebreakTo: number;
  setsToWin: number;
}

// Record forces a rules entry for every format in MATCH_FORMATS.
export const FORMAT_RULES: Record<MatchFormatId, ScoringRules> = {
  best_of_3_sets: { gamesPerSet: 6, tiebreakAt: 6, tiebreakTo: 7, setsToWin: 2 },
};

export interface MatchSetup {
  format: MatchFormatId;
  withAdvantage: boolean;
  firstServer: Side;
}

export interface Score {
  player: number;
  opponent: number;
}

export interface SetScore extends Score {
  tiebreak: Score | null;
}

export interface MatchState {
  sets: SetScore[];
  games: Score;
  points: Score;
  inTiebreak: boolean;
  server: Side;
  winner: Side | null;
}

export type ReplayMatchResult =
  { ok: true; state: MatchState } | { ok: false; error: "action_after_match_end"; index: number };

function other(side: Side): Side {
  return side === "player" ? "opponent" : "player";
}

// Tie-break serve order from its first server: A, B, B, A, A, ...
function tiebreakServer(starter: Side, pointsPlayed: number): Side {
  return Math.floor((pointsPlayed + 1) / 2) % 2 === 0 ? starter : other(starter);
}

function hasWon(score: Score, side: Side, target: number, lead: number): boolean {
  return score[side] >= target && score[side] - score[other(side)] >= lead;
}

// Rebuilds the match from the full action log, so undo is just dropping the last action.
export function replayMatch(setup: MatchSetup, actions: readonly MatchAction[]): ReplayMatchResult {
  const rules = FORMAT_RULES[setup.format];
  const sets: SetScore[] = [];
  let games: Score = { player: 0, opponent: 0 };
  let points: Score = { player: 0, opponent: 0 };
  let inTiebreak = false;
  // Server of the current regular game; in a tie-break the order derives from tiebreakStarter.
  let server: Side = setup.firstServer;
  let tiebreakStarter: Side = setup.firstServer;
  let winner: Side | null = null;

  // Records the finished set; returns whether it decided the match.
  const closeSet = (setWinner: Side, finalGames: Score, tiebreak: Score | null): boolean => {
    sets.push({ ...finalGames, tiebreak });
    return sets.filter((set) => set[setWinner] > set[other(setWinner)]).length >= rules.setsToWin;
  };

  for (const [index, action] of actions.entries()) {
    if (winner !== null) {
      return { ok: false, error: "action_after_match_end", index };
    }
    if (action.type === "switch_server") {
      // Flipping the starter flips the current tie-break point and the rest of the order.
      if (inTiebreak) {
        tiebreakStarter = other(tiebreakStarter);
      } else {
        server = other(server);
      }
      continue;
    }

    const side = action.winner;
    points = { ...points, [side]: points[side] + 1 };

    if (inTiebreak) {
      if (hasWon(points, side, rules.tiebreakTo, 2)) {
        if (closeSet(side, { ...games, [side]: games[side] + 1 }, points)) {
          winner = side;
        }
        games = { player: 0, opponent: 0 };
        points = { player: 0, opponent: 0 };
        inTiebreak = false;
        // The tie-break counts as one game in the alternation.
        server = other(tiebreakStarter);
      }
      continue;
    }

    if (!hasWon(points, side, 4, setup.withAdvantage ? 2 : 1)) {
      continue;
    }
    games = { ...games, [side]: games[side] + 1 };
    points = { player: 0, opponent: 0 };
    server = other(server);
    if (hasWon(games, side, rules.gamesPerSet, 2)) {
      if (closeSet(side, games, null)) {
        winner = side;
      }
      games = { player: 0, opponent: 0 };
    } else if (games.player === rules.tiebreakAt && games.opponent === rules.tiebreakAt) {
      inTiebreak = true;
      tiebreakStarter = server;
    }
  }

  const currentServer = inTiebreak ? tiebreakServer(tiebreakStarter, points.player + points.opponent) : server;
  return { ok: true, state: { sets, games, points, inTiebreak, server: currentServer, winner } };
}

// Point labels for the current game or tie-break.
export function gamePointLabels(state: MatchState, withAdvantage: boolean): { player: string; opponent: string } {
  const { player, opponent } = state.points;
  if (state.inTiebreak) {
    return { player: String(player), opponent: String(opponent) };
  }
  if (withAdvantage && player >= 3 && opponent >= 3) {
    if (player === opponent) {
      return { player: "40", opponent: "40" };
    }
    return player > opponent ? { player: "AD", opponent: "40" } : { player: "40", opponent: "AD" };
  }
  return { player: pointLabel(player), opponent: pointLabel(opponent) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSide(value: unknown): value is Side {
  return value === "player" || value === "opponent";
}

// Reads an action log from untrusted input (request body, database, localStorage).
// Copies only known fields, so extra keys never reach storage.
export function parseMatchActions(raw: unknown): { ok: true; actions: MatchAction[] } | { ok: false } {
  if (!Array.isArray(raw) || raw.length > MAX_MATCH_ACTIONS) {
    return { ok: false };
  }
  const actions: MatchAction[] = [];
  for (const item of raw as unknown[]) {
    if (!isRecord(item)) {
      return { ok: false };
    }
    if (item.type === "switch_server") {
      actions.push({ type: "switch_server" });
    } else if (item.type === "point" && isSide(item.winner)) {
      actions.push({ type: "point", winner: item.winner });
    } else {
      return { ok: false };
    }
  }
  return { ok: true, actions };
}

function sameAction(a: MatchAction, b: MatchAction): boolean {
  if (a.type === "point") {
    return b.type === "point" && b.winner === a.winner;
  }
  return b.type === a.type;
}

export function sameActions(a: readonly MatchAction[], b: readonly MatchAction[]): boolean {
  return a.length === b.length && a.every((action, index) => sameAction(action, b[index]));
}

// True when `sent` starts with all of `stored`, so saving `sent` drops no stored action.
export function extendsActions(stored: readonly MatchAction[], sent: readonly MatchAction[]): boolean {
  return stored.length <= sent.length && stored.every((action, index) => sameAction(action, sent[index]));
}
