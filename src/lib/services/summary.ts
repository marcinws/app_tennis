import { parseStoredLog, storageKey } from "./match-sync";
import { notesStorageKey, parseStoredNotes } from "./match-notes";
import type { MatchState, SetScore } from "./scoring";

function setText(set: SetScore): string {
  if (set.superTiebreak && set.tiebreak) {
    // A super tie-break replaces the deciding set, so its points are the score.
    return `[${set.tiebreak.player}:${set.tiebreak.opponent}]`;
  }
  const games = `${set.player}:${set.opponent}`;
  // Tennis notation: a set tie-break shows the loser's tie-break points in brackets, e.g. 7:6(5).
  return set.tiebreak ? `${games}(${Math.min(set.tiebreak.player, set.tiebreak.opponent)})` : games;
}

// Set scores from the player's side, e.g. "6:4 3:6 7:6(5)". An unfinished match ends with the current set.
export function setScoresText(state: MatchState): string {
  const parts = state.sets.map(setText);
  if (state.winner === null) {
    if (state.superTiebreak) {
      parts.push(`[${state.points.player}:${state.points.opponent}]`);
    } else if (parts.length === 0 || state.games.player > 0 || state.games.opponent > 0) {
      parts.push(`${state.games.player}:${state.games.opponent}`);
    }
  }
  return parts.join(" ");
}

export interface SummaryGoalInput {
  id: string;
  text: string;
  active: boolean;
  created_at: string;
}

export interface SummaryGoal {
  id: string;
  text: string;
  count: number;
}

// Goals of this match: every goal observed in it, plus active goals that existed when it started
// (a goal added later was not a goal of this match). Oldest first; a goal may have 0 observations.
export function summaryGoals(
  goals: readonly SummaryGoalInput[],
  observations: readonly { goal_id: string }[],
  matchCreatedAt: string,
): SummaryGoal[] {
  const counts = new Map<string, number>();
  for (const observation of observations) {
    counts.set(observation.goal_id, (counts.get(observation.goal_id) ?? 0) + 1);
  }
  const startedAt = Date.parse(matchCreatedAt);
  return goals
    .filter((goal) => counts.has(goal.id) || (goal.active && Date.parse(goal.created_at) <= startedAt))
    .slice()
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((goal) => ({ id: goal.id, text: goal.text, count: counts.get(goal.id) ?? 0 }));
}

// True when the phone still holds points or notes of the match the server has not confirmed.
// A corrupt copy counts too: the match screen is where it gets reported and set aside.
export function hasPendingLocalData(rawLog: string | null, rawNotes: string | null): boolean {
  const log = parseStoredLog(rawLog);
  const notes = parseStoredNotes(rawNotes);
  if (!log.ok || !notes.ok) {
    return true;
  }
  return (log.log?.pending ?? false) || (notes.stored?.queue.length ?? 0) > 0;
}

export function localDataKeys(matchId: string): { log: string; notes: string } {
  return { log: storageKey(matchId), notes: notesStorageKey(matchId) };
}
