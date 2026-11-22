import { describe, expect, it } from "vitest";

import { GOAL_TEXT_MAX_LENGTH, MAX_ACTIVE_GOALS, canAddGoal, goalErrorMessage, parseGoalText } from "./goals";

describe("parseGoalText", () => {
  it.each([
    ["  Lepszy serw  ", "Lepszy serw"],
    ["Lepszy   drugi serw", "Lepszy drugi serw"],
    ["Lepszy\t\ndrugi serw", "Lepszy drugi serw"],
  ])("normalizes %j to %j", (raw, text) => {
    expect(parseGoalText(raw)).toEqual({ ok: true, text });
  });

  it.each(["", "   ", "\t\n"])("rejects empty text %j", (raw) => {
    expect(parseGoalText(raw)).toEqual({ ok: false, error: "text_empty" });
  });

  it("accepts text of exactly the maximum length", () => {
    const raw = "a".repeat(GOAL_TEXT_MAX_LENGTH);
    expect(parseGoalText(raw)).toEqual({ ok: true, text: raw });
  });

  it("rejects text one character over the maximum length", () => {
    expect(parseGoalText("a".repeat(GOAL_TEXT_MAX_LENGTH + 1))).toEqual({ ok: false, error: "text_too_long" });
  });

  it("counts emoji as one character each", () => {
    const raw = "🎾".repeat(GOAL_TEXT_MAX_LENGTH);
    expect(parseGoalText(raw)).toEqual({ ok: true, text: raw });
    expect(parseGoalText(raw + "🎾")).toEqual({ ok: false, error: "text_too_long" });
  });
});

describe("canAddGoal", () => {
  it("allows a goal below the limit", () => {
    expect(canAddGoal(MAX_ACTIVE_GOALS - 1)).toBe(true);
  });

  it("blocks a goal at the limit", () => {
    expect(canAddGoal(MAX_ACTIVE_GOALS)).toBe(false);
  });
});

describe("goalErrorMessage", () => {
  it.each([
    ["text_empty", "Wpisz treść celu"],
    ["text_too_long", "Cel może mieć najwyżej 100 znaków"],
    ["goal_limit", "Zawodnik ma już 3 aktywne cele. Zakończ jeden, żeby dodać nowy"],
    ["goal_not_found", "Nie znaleziono celu"],
    ["not_configured", "Supabase nie jest skonfigurowany"],
  ])("maps %j to a fixed message", (code, message) => {
    expect(goalErrorMessage(code)).toBe(message);
  });

  it.each([null, "", "Sesja wygasła, zadzwoń pod 123", "toString", "__proto__"])(
    "shows nothing for unknown code %j",
    (code) => {
      expect(goalErrorMessage(code)).toBeNull();
    },
  );
});
