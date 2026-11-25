import { describe, expect, it } from "vitest";

import { type MatchAction, type MatchSetup, replayMatch } from "./scoring";
import { hasPendingLocalData, setScoresText, summaryGoals } from "./summary";

const P: MatchAction = { type: "point", winner: "player" };
const O: MatchAction = { type: "point", winner: "opponent" };

// Four straight points win a game for that side.
function games(side: MatchAction, count: number): MatchAction[] {
  return Array.from({ length: count * 4 }, () => side);
}

// Alternating games from `first`, `pairs` times each side (e.g. 6:6 from pairs = 6).
function alternate(first: MatchAction, second: MatchAction, pairs: number): MatchAction[] {
  return Array.from({ length: pairs }, () => [...games(first, 1), ...games(second, 1)]).flat();
}

function stateOf(actions: MatchAction[], format: MatchSetup["format"] = "best_of_3_sets") {
  const result = replayMatch({ format, withAdvantage: true, firstServer: "player" }, actions);
  if (!result.ok) {
    throw new Error(`invalid test log: ${result.error}`);
  }
  return result.state;
}

describe("setScoresText", () => {
  it("shows 0:0 before the first point", () => {
    expect(setScoresText(stateOf([]))).toBe("0:0");
  });

  it("adds the games of the set in progress", () => {
    expect(setScoresText(stateOf([...games(P, 6), ...games(O, 2)]))).toBe("6:0 0:2");
  });

  it("leaves out an untouched next set once a set is over", () => {
    expect(setScoresText(stateOf(games(P, 6)))).toBe("6:0");
  });

  it("shows a finished match from the player's side, also when the opponent wins", () => {
    expect(setScoresText(stateOf([...games(O, 6), ...games(P, 6), ...games(O, 6)]))).toBe("0:6 6:0 0:6");
  });

  it("puts the loser's tie-break points in brackets", () => {
    // 6:6, then the tie-break 7:5 for the player.
    const tiebreak = [...Array.from({ length: 5 }, () => [P, O]).flat(), P, P];
    expect(setScoresText(stateOf([...alternate(P, O, 6), ...tiebreak]))).toBe("7:6(5)");
  });

  it("shows a super tie-break in square brackets", () => {
    const superTiebreak = [...Array.from({ length: 8 }, () => [P, O]).flat(), P, P];
    const state = stateOf([...games(P, 6), ...games(O, 6), ...superTiebreak], "two_sets_super_tiebreak");
    expect(setScoresText(state)).toBe("6:0 0:6 [10:8]");
  });

  it("shows the running super tie-break score", () => {
    const state = stateOf([...games(P, 6), ...games(O, 6), P, P, O], "two_sets_super_tiebreak");
    expect(setScoresText(state)).toBe("6:0 0:6 [2:1]");
  });
});

describe("summaryGoals", () => {
  const start = "2026-11-25T10:00:00.000Z";
  const goal = (id: string, createdAt: string, active = true) => ({
    id,
    text: `Cel ${id}`,
    active,
    created_at: createdAt,
  });

  it("keeps observed goals, also ended ones, with their counts", () => {
    const goals = [goal("a", "2026-11-20T00:00:00Z", false)];
    expect(summaryGoals(goals, [{ goal_id: "a" }, { goal_id: "a" }], start)).toEqual([
      { id: "a", text: "Cel a", count: 2 },
    ]);
  });

  it("keeps active goals from before the match with 0 observations", () => {
    expect(summaryGoals([goal("a", "2026-11-20T00:00:00Z")], [], start)).toEqual([
      { id: "a", text: "Cel a", count: 0 },
    ]);
  });

  it("drops an active goal added after the match started unless it was observed", () => {
    const later = goal("b", "2026-11-25T11:00:00Z");
    expect(summaryGoals([later], [], start)).toEqual([]);
    expect(summaryGoals([later], [{ goal_id: "b" }], start)).toEqual([{ id: "b", text: "Cel b", count: 1 }]);
  });

  it("drops an ended goal without observations", () => {
    expect(summaryGoals([goal("a", "2026-11-20T00:00:00Z", false)], [], start)).toEqual([]);
  });

  it("orders goals from the oldest", () => {
    const goals = [goal("new", "2026-11-22T00:00:00Z"), goal("old", "2026-11-20T00:00:00Z")];
    expect(summaryGoals(goals, [], start).map((item) => item.id)).toEqual(["old", "new"]);
  });
});

describe("hasPendingLocalData", () => {
  const log = (pending: boolean) => JSON.stringify({ version: 1, actions: [P], baseRevision: 0, pending });
  const notes = (queue: unknown[]) => JSON.stringify({ version: 1, queue });

  it("is false without copies on the phone", () => {
    expect(hasPendingLocalData(null, null)).toBe(false);
  });

  it("follows the pending flag of the match log", () => {
    expect(hasPendingLocalData(log(false), null)).toBe(false);
    expect(hasPendingLocalData(log(true), null)).toBe(true);
  });

  it("is true while the notes queue has operations", () => {
    expect(hasPendingLocalData(null, notes([]))).toBe(false);
    expect(
      hasPendingLocalData(null, notes([{ type: "delete_note", id: "00000000-0000-4000-8000-000000000001" }])),
    ).toBe(true);
  });

  it("is true for a corrupt copy", () => {
    expect(hasPendingLocalData("{", null)).toBe(true);
    expect(hasPendingLocalData(null, "{")).toBe(true);
  });
});
