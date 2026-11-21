import { describe, expect, it } from "vitest";

import {
  extendsActions,
  gamePointLabels,
  gameTarget,
  isReachableGameScore,
  type MatchAction,
  type MatchSetup,
  type MatchState,
  parseMatchActions,
  pointLabel,
  replayMatch,
  sameActions,
  type Side,
} from "./scoring";

describe("pointLabel", () => {
  it.each([
    [0, "0"],
    [1, "15"],
    [2, "30"],
    [3, "40"],
  ])("labels %i points as %s", (points, label) => {
    expect(pointLabel(points)).toBe(label);
  });

  it.each([4, -1, 1.5])("throws RangeError for %s", (points) => {
    expect(() => pointLabel(points)).toThrow(RangeError);
    expect(() => pointLabel(points)).toThrow(String(points));
  });
});

const setup: MatchSetup = { format: "best_of_3_sets", withAdvantage: true, firstServer: "player" };
const noAdvantage: MatchSetup = { ...setup, withAdvantage: false };

function points(winner: Side, count: number): MatchAction[] {
  return Array.from({ length: count }, () => ({ type: "point", winner }));
}

function games(winner: Side, count: number): MatchAction[] {
  return Array.from({ length: count }, () => points(winner, 4)).flat();
}

// Alternating games starting with the player, so neither side breaks away.
function evenGames(pairs: number): MatchAction[] {
  return Array.from({ length: pairs }, () => [...games("player", 1), ...games("opponent", 1)]).flat();
}

// 3:3 in points, i.e. deuce in a game with advantage.
const deuce: MatchAction[] = [...points("player", 3), ...points("opponent", 3)];
const switchServer: MatchAction = { type: "switch_server" };

function replay(actions: MatchAction[], matchSetup: MatchSetup = setup): MatchState {
  const result = replayMatch(matchSetup, actions);
  if (!result.ok) {
    throw new Error(`Replay failed at action ${result.index}`);
  }
  return result.state;
}

describe("replayMatch: game", () => {
  it("ends the game at 4:0", () => {
    const state = replay(points("player", 4));
    expect(state.games).toEqual({ player: 1, opponent: 0 });
    expect(state.points).toEqual({ player: 0, opponent: 0 });
  });

  it("needs a 2-point lead after deuce with advantage", () => {
    expect(replay([...deuce, ...points("player", 1)]).points).toEqual({ player: 4, opponent: 3 });
    const backToDeuce = [...deuce, ...points("player", 1), ...points("opponent", 1)];
    expect(replay(backToDeuce).points).toEqual({ player: 4, opponent: 4 });
    expect(replay(backToDeuce).games).toEqual({ player: 0, opponent: 0 });
    expect(replay([...backToDeuce, ...points("opponent", 2)]).games).toEqual({ player: 0, opponent: 1 });
  });

  it("ends the game on the point after 3:3 without advantage", () => {
    const state = replay([...deuce, ...points("opponent", 1)], noAdvantage);
    expect(state.games).toEqual({ player: 0, opponent: 1 });
    expect(state.points).toEqual({ player: 0, opponent: 0 });
  });
});

describe("gamePointLabels", () => {
  it.each([
    [0, "0"],
    [1, "15"],
    [2, "30"],
    [3, "40"],
  ])("labels %i points as %s", (count, label) => {
    expect(gamePointLabels(replay(points("player", count)), true)).toEqual({ player: label, opponent: "0" });
  });

  it("shows 40:40 at deuce and after advantage is lost", () => {
    expect(gamePointLabels(replay(deuce), true)).toEqual({ player: "40", opponent: "40" });
    const backToDeuce = [...deuce, ...points("player", 1), ...points("opponent", 1)];
    expect(gamePointLabels(replay(backToDeuce), true)).toEqual({ player: "40", opponent: "40" });
  });

  it("shows AD for the side with advantage", () => {
    expect(gamePointLabels(replay([...deuce, ...points("player", 1)]), true)).toEqual({
      player: "AD",
      opponent: "40",
    });
    expect(gamePointLabels(replay([...deuce, ...points("opponent", 1)]), true)).toEqual({
      player: "40",
      opponent: "AD",
    });
  });

  it("shows 40:40 at 3:3 without advantage", () => {
    expect(gamePointLabels(replay(deuce, noAdvantage), false)).toEqual({ player: "40", opponent: "40" });
  });

  it("shows plain numbers in a tie-break", () => {
    const state = replay([...evenGames(6), ...points("player", 5), ...points("opponent", 4)]);
    expect(state.inTiebreak).toBe(true);
    expect(gamePointLabels(state, true)).toEqual({ player: "5", opponent: "4" });
  });
});

describe("replayMatch: set", () => {
  it("ends the set at 6:4", () => {
    const state = replay([...evenGames(4), ...games("player", 2)]);
    expect(state.sets).toEqual([{ player: 6, opponent: 4, tiebreak: null }]);
    expect(state.games).toEqual({ player: 0, opponent: 0 });
  });

  it("goes on from 5:5 to 7:5", () => {
    expect(replay([...evenGames(5), ...games("player", 1)]).games).toEqual({ player: 6, opponent: 5 });
    const state = replay([...evenGames(5), ...games("player", 2)]);
    expect(state.sets).toEqual([{ player: 7, opponent: 5, tiebreak: null }]);
  });

  it("starts a tie-break at 6:6", () => {
    const state = replay(evenGames(6));
    expect(state.inTiebreak).toBe(true);
    expect(state.games).toEqual({ player: 6, opponent: 6 });
    expect(state.sets).toEqual([]);
  });

  it("records a 7:5 tie-break as a 7:6 set", () => {
    const state = replay([...evenGames(6), ...points("opponent", 5), ...points("player", 7)]);
    expect(state.sets).toEqual([{ player: 7, opponent: 6, tiebreak: { player: 7, opponent: 5 } }]);
    expect(state.inTiebreak).toBe(false);
    expect(state.games).toEqual({ player: 0, opponent: 0 });
    expect(state.points).toEqual({ player: 0, opponent: 0 });
  });

  it("needs a 2-point lead from 6:6 in a tie-break", () => {
    const sixAll = [...evenGames(6), ...points("player", 6), ...points("opponent", 6)];
    expect(replay([...sixAll, ...points("opponent", 1)]).points).toEqual({ player: 6, opponent: 7 });
    const state = replay([...sixAll, ...points("opponent", 2)]);
    expect(state.sets).toEqual([{ player: 6, opponent: 7, tiebreak: { player: 6, opponent: 8 } }]);
  });
});

describe("replayMatch: match", () => {
  it("has a winner after 2:0 in sets", () => {
    const state = replay(games("opponent", 12));
    expect(state.winner).toBe("opponent");
    expect(state.sets).toEqual([
      { player: 0, opponent: 6, tiebreak: null },
      { player: 0, opponent: 6, tiebreak: null },
    ]);
  });

  it("plays a third set at 1:1", () => {
    const state = replay([...games("player", 6), ...games("opponent", 6), ...games("player", 1)]);
    expect(state.winner).toBeNull();
    expect(state.sets).toHaveLength(2);
    expect(state.games).toEqual({ player: 1, opponent: 0 });
  });

  it.each<[string, MatchAction]>([
    ["a point", { type: "point", winner: "player" }],
    ["switch_server", switchServer],
  ])("rejects %s after the match end with its index", (_name, action) => {
    const actions = [...games("player", 12), action, action];
    expect(replayMatch(setup, actions)).toEqual({ ok: false, error: "action_after_match_end", index: 48 });
  });
});

describe("replayMatch: server", () => {
  it("alternates every game from the first server", () => {
    expect(replay([]).server).toBe("player");
    expect(replay(games("player", 1)).server).toBe("opponent");
    expect(replay(games("opponent", 2)).server).toBe("player");
    expect(replay([], { ...setup, firstServer: "opponent" }).server).toBe("opponent");
  });

  it("serves a tie-break in the order A, B, B, A, A", () => {
    // 12 games served P, O, ..., O, so the player serves the first tie-break point.
    const order = [0, 1, 2, 3, 4].map((count) => replay([...evenGames(6), ...points("player", count)]).server);
    expect(order).toEqual(["player", "opponent", "opponent", "player", "player"]);
  });

  it("gives the first game after a tie-break to the receiver of its first point", () => {
    const state = replay([...evenGames(6), ...points("player", 7)]);
    expect(state.server).toBe("opponent");
  });

  it("flips the current and later games on switch_server", () => {
    expect(replay([switchServer]).server).toBe("opponent");
    expect(replay([switchServer, ...games("player", 1)]).server).toBe("player");
    expect(replay([...games("player", 1), switchServer, ...games("player", 1)]).server).toBe("opponent");
  });

  it("flips the current tie-break point and the rest of the order on switch_server", () => {
    const tiebreak = [...evenGames(6), ...points("player", 1), switchServer];
    const order = [0, 1, 2, 3].map((count) => replay([...tiebreak, ...points("player", count)]).server);
    expect(order).toEqual(["player", "player", "opponent", "opponent"]);
    expect(replay([...tiebreak, ...points("player", 6)]).server).toBe("player");
  });

  it("restores the previous state when the last action is dropped", () => {
    const before = [...evenGames(6), ...points("player", 2)];
    expect(replay([...before, ...points("opponent", 1)].slice(0, -1))).toEqual(replay(before));
    expect(replay([...before, switchServer].slice(0, -1))).toEqual(replay(before));
  });
});

describe("parseMatchActions", () => {
  it("accepts a valid log", () => {
    const raw = [{ type: "point", winner: "player" }, { type: "switch_server" }, { type: "point", winner: "opponent" }];
    expect(parseMatchActions(raw)).toEqual({ ok: true, actions: raw });
  });

  it("accepts a log of the maximum length", () => {
    expect(parseMatchActions(Array.from({ length: 2000 }, () => ({ type: "switch_server" }))).ok).toBe(true);
  });

  // Literal limit on purpose: it must match the check on matches.events in the migration.
  it("rejects a log of 2001 actions", () => {
    expect(parseMatchActions(Array.from({ length: 2001 }, () => ({ type: "switch_server" })))).toEqual({ ok: false });
  });

  it.each([null, undefined, "[]", 3, { type: "switch_server" }])("rejects non-array %j", (raw) => {
    expect(parseMatchActions(raw)).toEqual({ ok: false });
  });

  it.each([
    ["an unknown type", { type: "bogus" }],
    ["a point without a winner", { type: "point" }],
    ["a point won by both", { type: "point", winner: "both" }],
    ["null", null],
    ["a string", "point"],
  ])("rejects %s", (_name, item) => {
    expect(parseMatchActions([{ type: "switch_server" }, item])).toEqual({ ok: false });
  });

  it("drops extra fields", () => {
    const raw = [
      { type: "point", winner: "player", note: "x" },
      { type: "switch_server", winner: "opponent" },
    ];
    expect(parseMatchActions(raw)).toEqual({
      ok: true,
      actions: [{ type: "point", winner: "player" }, { type: "switch_server" }],
    });
  });
});

describe("sameActions", () => {
  const log: MatchAction[] = [...points("player", 2), switchServer];

  it("matches equal logs", () => {
    expect(sameActions(log, [...points("player", 2), switchServer])).toBe(true);
    expect(sameActions([], [])).toBe(true);
  });

  it("rejects logs of different length", () => {
    expect(sameActions(log, log.slice(0, -1))).toBe(false);
  });

  it("rejects logs with a different point winner", () => {
    expect(sameActions(log, [...points("player", 1), ...points("opponent", 1), switchServer])).toBe(false);
  });

  it("rejects logs with a different action type", () => {
    expect(sameActions(log, [...points("player", 3)])).toBe(false);
  });
});

describe("extendsActions", () => {
  const log: MatchAction[] = [...points("player", 2), switchServer];

  it("accepts equal logs", () => {
    expect(extendsActions(log, [...points("player", 2), switchServer])).toBe(true);
  });

  it("accepts a sent log that extends the stored one", () => {
    expect(extendsActions(log, [...log, ...points("opponent", 1)])).toBe(true);
  });

  it("accepts an empty stored log", () => {
    expect(extendsActions([], log)).toBe(true);
  });

  it("rejects a sent log shorter than the stored one", () => {
    expect(extendsActions(log, log.slice(0, -1))).toBe(false);
  });

  it("rejects a log of the same length with a different action", () => {
    expect(extendsActions(log, [...points("player", 3)])).toBe(false);
  });

  it("rejects a sent log that differs in the middle", () => {
    const sent = [...points("player", 1), ...points("opponent", 1), switchServer, ...points("player", 1)];
    expect(extendsActions(log, sent)).toBe(false);
  });
});

function gameScore(player: number, opponent: number): MatchAction {
  return { type: "game_score", player, opponent };
}

describe("gameTarget", () => {
  it("gives a regular game 4 points with a lead of 2, or 1 without advantage", () => {
    expect(gameTarget(false, 7, true)).toEqual({ target: 4, lead: 2 });
    expect(gameTarget(false, 7, false)).toEqual({ target: 4, lead: 1 });
  });

  it("gives a tie-break its own target with a lead of 2, with or without advantage", () => {
    expect(gameTarget(true, 7, false)).toEqual({ target: 7, lead: 2 });
  });
});

describe("isReachableGameScore", () => {
  it.each<[string, number, 1 | 2, string[], boolean]>([
    ["in progress with advantage", 4, 2, ["3:2", "3:3", "4:3", "4:4", "6:5"], true],
    ["won with advantage", 4, 2, ["4:0", "4:2", "5:3"], true],
    ["past the end with advantage", 4, 2, ["5:0", "5:2", "6:3"], false],
    ["in progress or won without advantage", 4, 1, ["3:3", "4:3"], true],
    ["past the end without advantage", 4, 1, ["4:4", "5:3"], false],
    ["in progress or won in a tie-break", 7, 2, ["6:6", "8:7", "7:5", "9:7"], true],
    ["past the end in a tie-break", 7, 2, ["8:5"], false],
  ])("%s", (_name, target, lead, scores, expected) => {
    for (const [player, opponent] of scores.map((score) => score.split(":").map(Number))) {
      expect(isReachableGameScore({ player, opponent }, target, lead), `${player}:${opponent}`).toBe(expected);
      expect(isReachableGameScore({ player: opponent, opponent: player }, target, lead), `${opponent}:${player}`).toBe(
        expected,
      );
    }
  });

  it.each([
    [-1, 0],
    [1.5, 0],
  ])("rejects %s:%s", (player, opponent) => {
    expect(isReachableGameScore({ player, opponent }, 4, 2)).toBe(false);
  });
});

describe("replayMatch: game_score", () => {
  it("keeps an in-progress game open with the same server", () => {
    const state = replay([...points("player", 1), gameScore(3, 2)]);
    expect(state.points).toEqual({ player: 3, opponent: 2 });
    expect(gamePointLabels(state, true)).toEqual({ player: "40", opponent: "30" });
    expect(state.games).toEqual({ player: 0, opponent: 0 });
    expect(state.server).toBe("player");
  });

  it("closes a won game and changes the server", () => {
    const state = replay([gameScore(4, 2)]);
    expect(state.games).toEqual({ player: 1, opponent: 0 });
    expect(state.points).toEqual({ player: 0, opponent: 0 });
    expect(state.server).toBe("opponent");
  });

  it("labels entered scores past deuce", () => {
    expect(gamePointLabels(replay([gameScore(4, 3)]), true)).toEqual({ player: "AD", opponent: "40" });
    expect(gamePointLabels(replay([gameScore(6, 5)]), true)).toEqual({ player: "AD", opponent: "40" });
    expect(gamePointLabels(replay([gameScore(5, 6)]), true)).toEqual({ player: "40", opponent: "AD" });
  });

  it("follows the format without advantage", () => {
    expect(replay([gameScore(4, 3)], noAdvantage).games).toEqual({ player: 1, opponent: 0 });
    const actions = [...points("player", 1), gameScore(4, 4)];
    expect(replayMatch(noAdvantage, actions)).toEqual({ ok: false, error: "invalid_game_score", index: 1 });
  });

  it("rejects a score the game would have ended before", () => {
    expect(replayMatch(setup, [gameScore(6, 3)])).toEqual({ ok: false, error: "invalid_game_score", index: 0 });
  });

  it("closes the set with a game-ending entry at 5:4", () => {
    const state = replay([...evenGames(4), ...games("player", 1), gameScore(4, 1)]);
    expect(state.sets).toEqual([{ player: 6, opponent: 4, tiebreak: null }]);
    expect(state.games).toEqual({ player: 0, opponent: 0 });
  });

  it("serves a tie-break entry as after the same number of points", () => {
    const entered = replay([...evenGames(6), gameScore(5, 3)]);
    const played = replay([...evenGames(6), ...points("player", 5), ...points("opponent", 3)]);
    expect(entered.inTiebreak).toBe(true);
    expect(entered.server).toBe(played.server);
  });

  it("closes the set 7:6 with a won tie-break entry", () => {
    const state = replay([...evenGames(6), gameScore(7, 5)]);
    expect(state.sets).toEqual([{ player: 7, opponent: 6, tiebreak: { player: 7, opponent: 5 } }]);
    expect(state.inTiebreak).toBe(false);
    expect(state.server).toBe("opponent");
  });

  it("rejects a tie-break score past its end", () => {
    const actions = [...evenGames(6), gameScore(8, 5)];
    expect(replayMatch(setup, actions)).toEqual({ ok: false, error: "invalid_game_score", index: 48 });
  });

  it("decides the match with an entry ending the deciding set", () => {
    const state = replay([...games("player", 6), ...games("opponent", 6), ...evenGames(6), gameScore(3, 7)]);
    expect(state.winner).toBe("opponent");
    expect(state.sets[2]).toEqual({ player: 6, opponent: 7, tiebreak: { player: 3, opponent: 7 } });
  });

  it("rejects game_score after the match end", () => {
    const actions = [...games("player", 12), gameScore(1, 0)];
    expect(replayMatch(setup, actions)).toEqual({ ok: false, error: "action_after_match_end", index: 48 });
  });

  it("restores the previous state when the entry is dropped", () => {
    const before = [...games("player", 1), ...points("opponent", 1)];
    expect(replay([...before, gameScore(3, 2)].slice(0, -1))).toEqual(replay(before));
    expect(replay([...before, gameScore(4, 2)].slice(0, -1))).toEqual(replay(before));
  });
});

describe("replayMatch: history", () => {
  it("starts empty", () => {
    expect(replay([]).history).toEqual([]);
  });

  it("records games won on points", () => {
    const state = replay([...games("player", 1), ...points("player", 2), ...points("opponent", 4)]);
    expect(state.history).toEqual([
      {
        set: 1,
        game: 1,
        server: "player",
        winner: "player",
        points: { player: 4, opponent: 0 },
        tiebreak: false,
        manual: false,
        setScore: { player: 1, opponent: 0 },
      },
      {
        set: 1,
        game: 2,
        server: "opponent",
        winner: "opponent",
        points: { player: 2, opponent: 4 },
        tiebreak: false,
        manual: false,
        setScore: { player: 1, opponent: 1 },
      },
    ]);
  });

  it("numbers games within each set and keeps the final set score", () => {
    const state = replay([...games("player", 6), ...games("opponent", 1)]);
    expect(state.history).toHaveLength(7);
    expect(state.history[5]).toMatchObject({ set: 1, game: 6, setScore: { player: 6, opponent: 0 } });
    expect(state.history[6]).toMatchObject({ set: 2, game: 1, setScore: { player: 0, opponent: 1 } });
  });

  it("marks a game with an entered score as manual", () => {
    const state = replay([...points("player", 1), gameScore(4, 1), ...games("opponent", 1)]);
    expect(state.history[0]).toMatchObject({ winner: "player", points: { player: 4, opponent: 1 }, manual: true });
    expect(state.history[1]).toMatchObject({ winner: "opponent", manual: false });
  });

  it("records a tie-break with the server of its first point", () => {
    const state = replay([...evenGames(6), ...points("opponent", 5), ...points("player", 7)]);
    expect(state.history.at(-1)).toEqual({
      set: 1,
      game: 13,
      server: "player",
      winner: "player",
      points: { player: 7, opponent: 5 },
      tiebreak: true,
      manual: false,
      setScore: { player: 7, opponent: 6 },
    });
  });

  it("records the tie-break starter after switch_server", () => {
    const state = replay([...evenGames(6), ...points("player", 3), switchServer, ...points("player", 4)]);
    expect(state.history.at(-1)).toMatchObject({ tiebreak: true, server: "opponent" });
  });

  it("records the corrected server after switch_server during a game", () => {
    const state = replay([...points("player", 1), switchServer, ...points("player", 3)]);
    expect(state.history[0]).toMatchObject({ server: "opponent", winner: "player" });
    expect(state.server).toBe("player");
  });
});

describe("parseMatchActions: game_score", () => {
  it("accepts a valid game_score", () => {
    const raw = [gameScore(0, 99), gameScore(4, 2)];
    expect(parseMatchActions(raw)).toEqual({ ok: true, actions: raw });
  });

  it.each([
    ["a negative count", { type: "game_score", player: -1, opponent: 0 }],
    ["a fractional count", { type: "game_score", player: 1.5, opponent: 0 }],
    ["a count above 99", { type: "game_score", player: 100, opponent: 0 }],
    ["a missing count", { type: "game_score", player: 3 }],
    ["a string count", { type: "game_score", player: "3", opponent: 0 }],
  ])("rejects %s", (_name, item) => {
    expect(parseMatchActions([item])).toEqual({ ok: false });
  });

  it("drops extra fields", () => {
    const raw = [{ type: "game_score", player: 3, opponent: 2, winner: "player" }];
    expect(parseMatchActions(raw)).toEqual({ ok: true, actions: [gameScore(3, 2)] });
  });
});

describe("sameActions and extendsActions: game_score", () => {
  it("compares both counts", () => {
    expect(sameActions([gameScore(3, 2)], [gameScore(3, 2)])).toBe(true);
    expect(sameActions([gameScore(3, 2)], [gameScore(2, 3)])).toBe(false);
    expect(sameActions([gameScore(3, 2)], [gameScore(3, 1)])).toBe(false);
    expect(extendsActions([gameScore(3, 2)], [gameScore(3, 2), switchServer])).toBe(true);
    expect(extendsActions([gameScore(3, 2)], [gameScore(4, 2), switchServer])).toBe(false);
  });
});
