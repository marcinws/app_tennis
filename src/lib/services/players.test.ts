import { describe, expect, it } from "vitest";

import { PLAYER_NAME_MAX_LENGTH, parsePlayerName } from "./players";

describe("parsePlayerName", () => {
  it.each([
    ["  Ola  ", "Ola"],
    ["Ola   Kowalska", "Ola Kowalska"],
    ["Ola\t\nKowalska", "Ola Kowalska"],
  ])("normalizes %j to %j", (raw, name) => {
    expect(parsePlayerName(raw)).toEqual({ ok: true, name });
  });

  it.each(["", "   "])("rejects empty name %j", (raw) => {
    expect(parsePlayerName(raw)).toEqual({ ok: false, error: "Podaj imię zawodnika" });
  });

  it("accepts a name of exactly the maximum length", () => {
    const raw = "a".repeat(PLAYER_NAME_MAX_LENGTH);
    expect(parsePlayerName(raw)).toEqual({ ok: true, name: raw });
  });

  it("rejects a name one character over the maximum length", () => {
    expect(parsePlayerName("a".repeat(PLAYER_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: "Imię może mieć najwyżej 50 znaków",
    });
  });
});
