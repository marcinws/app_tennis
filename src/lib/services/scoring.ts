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

// game_score sets the points of the current game or tie-break, as entered by hand.
export type MatchAction =
  | { type: "point"; winner: Side }
  | { type: "switch_server" }
  | { type: "game_score"; player: number; opponent: number };

// Must equal the `check` on matches.events in the match events migration.
export const MAX_MATCH_ACTIONS = 2000;

// Upper bound for each game_score count accepted from untrusted input.
export const MAX_GAME_SCORE_POINTS = 99;

export interface ScoringRules {
  gamesPerSet: number;
  tiebreakAt: number;
  tiebreakTo: number;
  setsToWin: number;
  // Points of the tie-break played instead of the deciding set; null means a full deciding set.
  superTiebreakTo: number | null;
}

// Record forces a rules entry for every format in MATCH_FORMATS.
export const FORMAT_RULES: Record<MatchFormatId, ScoringRules> = {
  best_of_3_sets: { gamesPerSet: 6, tiebreakAt: 6, tiebreakTo: 7, setsToWin: 2, superTiebreakTo: null },
  two_sets_super_tiebreak: { gamesPerSet: 6, tiebreakAt: 6, tiebreakTo: 7, setsToWin: 2, superTiebreakTo: 10 },
  short_sets: { gamesPerSet: 4, tiebreakAt: 4, tiebreakTo: 7, setsToWin: 2, superTiebreakTo: null },
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
  // A super tie-break is recorded as a 1:0 set with its points in `tiebreak`.
  superTiebreak: boolean;
}

// One finished game; `set` and `game` count from 1.
export interface GameRecord {
  set: number;
  game: number;
  // Server when the game ended; in a tie-break the server of its first point.
  server: Side;
  winner: Side;
  points: Score;
  tiebreak: boolean;
  superTiebreak: boolean;
  // True when a game_score was entered in this game.
  manual: boolean;
  // Games in the set after this game.
  setScore: Score;
}

export interface MatchState {
  sets: SetScore[];
  games: Score;
  points: Score;
  inTiebreak: boolean;
  // Points to win the current tie-break; outside a tie-break the target of a set tie-break.
  tiebreakTo: number;
  superTiebreak: boolean;
  server: Side;
  winner: Side | null;
  history: GameRecord[];
}

export type ReplayMatchResult =
  | { ok: true; state: MatchState }
  | { ok: false; error: "action_after_match_end" | "invalid_game_score"; index: number };

export function other(side: Side): Side {
  return side === "player" ? "opponent" : "player";
}

// Tie-break serve order from its first server: A, B, B, A, A, ...
function tiebreakServer(starter: Side, pointsPlayed: number): Side {
  return Math.floor((pointsPlayed + 1) / 2) % 2 === 0 ? starter : other(starter);
}

function hasWon(score: Score, side: Side, target: number, lead: number): boolean {
  return score[side] >= target && score[side] - score[other(side)] >= lead;
}

function isInProgress(score: Score, target: number, lead: 1 | 2): boolean {
  if (hasWon(score, "player", target, lead) || hasWon(score, "opponent", target, lead)) {
    return false;
  }
  const belowTarget = score.player <= target - 1 && score.opponent <= target - 1;
  return belowTarget || (lead === 2 && Math.abs(score.player - score.opponent) <= 1);
}

// Points to win the current game or tie-break and the lead it needs.
export function gameTarget(
  inTiebreak: boolean,
  tiebreakTo: number,
  withAdvantage: boolean,
): { target: number; lead: 1 | 2 } {
  return inTiebreak ? { target: tiebreakTo, lead: 2 } : { target: 4, lead: withAdvantage ? 2 : 1 };
}

// Whether a game (or tie-break) to `target` with the required `lead` can stand at `score`:
// still in progress, or won exactly by its last point.
export function isReachableGameScore(score: Score, target: number, lead: 1 | 2): boolean {
  const { player, opponent } = score;
  if (!Number.isInteger(player) || !Number.isInteger(opponent) || player < 0 || opponent < 0) {
    return false;
  }
  if (isInProgress(score, target, lead)) {
    return true;
  }
  return (["player", "opponent"] as const).some(
    (side) => hasWon(score, side, target, lead) && isInProgress({ ...score, [side]: score[side] - 1 }, target, lead),
  );
}

// Rebuilds the match from the full action log, so undo is just dropping the last action.
export function replayMatch(setup: MatchSetup, actions: readonly MatchAction[]): ReplayMatchResult {
  const rules = FORMAT_RULES[setup.format];
  const sets: SetScore[] = [];
  let games: Score = { player: 0, opponent: 0 };
  let points: Score = { player: 0, opponent: 0 };
  // Widened on purpose: closeGame reassigns these, which TS narrowing does not see.
  let inTiebreak = false as boolean;
  let superTiebreak = false as boolean;
  let tiebreakTo = rules.tiebreakTo;
  // Server of the current regular game; in a tie-break the order derives from tiebreakStarter.
  let server: Side = setup.firstServer;
  let tiebreakStarter: Side = setup.firstServer;
  let winner = null as Side | null;
  const history: GameRecord[] = [];
  // Whether a game_score was entered in the current game.
  let manual = false;

  // Records the finished set; returns whether it decided the match.
  const closeSet = (setWinner: Side, finalGames: Score, tiebreak: Score | null): boolean => {
    sets.push({ ...finalGames, tiebreak, superTiebreak });
    return sets.filter((set) => set[setWinner] > set[other(setWinner)]).length >= rules.setsToWin;
  };

  // At one set short of the match each, a format with a super tie-break plays it instead of a set.
  const openSuperTiebreakIfDue = () => {
    const setsWon = (side: Side) => sets.filter((set) => set[side] > set[other(side)]).length;
    const oneShort = rules.setsToWin - 1;
    if (rules.superTiebreakTo !== null && setsWon("player") === oneShort && setsWon("opponent") === oneShort) {
      inTiebreak = true;
      superTiebreak = true;
      tiebreakTo = rules.superTiebreakTo;
      tiebreakStarter = server;
    }
  };

  // Closes the won game or tie-break, whether it ended on a point or on a game_score.
  const closeGame = (side: Side) => {
    const record = {
      set: sets.length + 1,
      game: games.player + games.opponent + 1,
      server: inTiebreak ? tiebreakStarter : server,
      winner: side,
      points,
      tiebreak: inTiebreak,
      superTiebreak,
      manual,
    };
    games = { ...games, [side]: games[side] + 1 };
    history.push({ ...record, setScore: games });
    manual = false;

    if (inTiebreak) {
      const decided = closeSet(side, games, points);
      if (decided) {
        winner = side;
      }
      games = { player: 0, opponent: 0 };
      points = { player: 0, opponent: 0 };
      inTiebreak = false;
      superTiebreak = false;
      tiebreakTo = rules.tiebreakTo;
      // The tie-break counts as one game in the alternation.
      server = other(tiebreakStarter);
      if (!decided) {
        openSuperTiebreakIfDue();
      }
      return;
    }

    points = { player: 0, opponent: 0 };
    server = other(server);
    if (hasWon(games, side, rules.gamesPerSet, 2)) {
      if (closeSet(side, games, null)) {
        winner = side;
      } else {
        openSuperTiebreakIfDue();
      }
      games = { player: 0, opponent: 0 };
    } else if (games.player === rules.tiebreakAt && games.opponent === rules.tiebreakAt) {
      inTiebreak = true;
      tiebreakStarter = server;
    }
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

    const { target, lead } = gameTarget(inTiebreak, tiebreakTo, setup.withAdvantage);
    if (action.type === "game_score") {
      const score = { player: action.player, opponent: action.opponent };
      if (!isReachableGameScore(score, target, lead)) {
        return { ok: false, error: "invalid_game_score", index };
      }
      points = score;
      manual = true;
    } else {
      points = { ...points, [action.winner]: points[action.winner] + 1 };
    }

    const gameWinner = (["player", "opponent"] as const).find((side) => hasWon(points, side, target, lead));
    if (gameWinner !== undefined) {
      closeGame(gameWinner);
    }
  }

  const currentServer = inTiebreak ? tiebreakServer(tiebreakStarter, points.player + points.opponent) : server;
  return {
    ok: true,
    state: {
      sets,
      games,
      points,
      inTiebreak,
      tiebreakTo,
      superTiebreak,
      server: currentServer,
      winner,
      history,
    },
  };
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

function isGamePoints(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_GAME_SCORE_POINTS;
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
    } else if (item.type === "game_score" && isGamePoints(item.player) && isGamePoints(item.opponent)) {
      actions.push({ type: "game_score", player: item.player, opponent: item.opponent });
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
  if (a.type === "game_score") {
    return b.type === "game_score" && b.player === a.player && b.opponent === a.opponent;
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
