import { describe, expect, it } from "vitest";

import { PLAYER_NAME_MAX_LENGTH, parsePlayerName, playerErrorMessage } from "./players";

describe("parsePlayerName", () => {
  it.each([
    ["  Ola  ", "Ola"],
    ["Ola   Kowalska", "Ola Kowalska"],
    ["Ola\t\nKowalska", "Ola Kowalska"],
  ])("normalizes %j to %j", (raw, name) => {
    expect(parsePlayerName(raw)).toEqual({ ok: true, name });
  });

  it.each(["", "   "])("rejects empty name %j", (raw) => {
    expect(parsePlayerName(raw)).toEqual({ ok: false, error: "name_empty" });
  });

  it("accepts a name of exactly the maximum length", () => {
    const raw = "a".repeat(PLAYER_NAME_MAX_LENGTH);
    expect(parsePlayerName(raw)).toEqual({ ok: true, name: raw });
  });

  it("rejects a name one character over the maximum length", () => {
    expect(parsePlayerName("a".repeat(PLAYER_NAME_MAX_LENGTH + 1))).toEqual({ ok: false, error: "name_too_long" });
  });
});

describe("playerErrorMessage", () => {
  it.each([
    ["name_empty", "Podaj imię zawodnika"],
    ["name_too_long", "Imię może mieć najwyżej 50 znaków"],
    ["duplicate", "Taki zawodnik już istnieje"],
  ])("maps %j to a fixed message", (code, message) => {
    expect(playerErrorMessage(code)).toBe(message);
  });

  it.each([null, "", "Sesja wygasła, zadzwoń pod 123", "toString", "__proto__"])(
    "shows nothing for unknown code %j",
    (code) => {
      expect(playerErrorMessage(code)).toBeNull();
    },
  );
});
