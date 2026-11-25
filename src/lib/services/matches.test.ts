import { describe, expect, it } from "vitest";

import { historyNotice, matchErrorMessage, matchFormatLabel, parseMatchStart, parseTournamentName } from "./matches";

describe("parseTournamentName", () => {
  it.each([
    ["  Puchar   Lata ", "Puchar Lata"],
    ["Puchar\t\nLata", "Puchar Lata"],
  ])("normalizes %j to %j", (raw, name) => {
    expect(parseTournamentName(raw)).toEqual({ ok: true, name });
  });

  it.each(["", "   "])("treats %j as no tournament", (raw) => {
    expect(parseTournamentName(raw)).toEqual({ ok: true, name: null });
  });

  // Literal limits on purpose: they must match the check on matches.tournament_name in the migration.
  it("accepts a name of exactly 100 characters", () => {
    const raw = "a".repeat(100);
    expect(parseTournamentName(raw)).toEqual({ ok: true, name: raw });
  });

  it("rejects a name of 101 characters", () => {
    expect(parseTournamentName("a".repeat(101))).toEqual({
      ok: false,
      error: "tournament_too_long",
    });
  });
});

describe("parseMatchStart", () => {
  const valid = {
    tournamentName: "  Puchar   Lata ",
    format: "best_of_3_sets",
    withAdvantage: "true",
    firstServer: "opponent",
  };

  it("accepts a valid start", () => {
    expect(parseMatchStart(valid)).toEqual({
      ok: true,
      value: { tournamentName: "Puchar Lata", format: "best_of_3_sets", withAdvantage: true, firstServer: "opponent" },
    });
  });

  it("accepts a start without a tournament", () => {
    expect(parseMatchStart({ ...valid, tournamentName: "", firstServer: "player" })).toEqual({
      ok: true,
      value: { tournamentName: null, format: "best_of_3_sets", withAdvantage: true, firstServer: "player" },
    });
  });

  it("rejects a tournament name over the maximum length", () => {
    expect(parseMatchStart({ ...valid, tournamentName: "a".repeat(101) })).toEqual({
      ok: false,
      error: "tournament_too_long",
    });
  });

  it.each(["custom", ""])("rejects format %j", (format) => {
    expect(parseMatchStart({ ...valid, format })).toEqual({ ok: false, error: "format_invalid" });
  });

  it.each([
    ["false", false],
    ["true", true],
  ])("accepts advantage %j", (withAdvantage, expected) => {
    const result = parseMatchStart({ ...valid, withAdvantage });
    expect(result.ok && result.value.withAdvantage).toBe(expected);
  });

  it.each(["", "yes"])("rejects advantage %j", (withAdvantage) => {
    expect(parseMatchStart({ ...valid, withAdvantage })).toEqual({ ok: false, error: "advantage_invalid" });
  });

  it.each(["two_sets_super_tiebreak", "short_sets"])("accepts format %j", (format) => {
    const result = parseMatchStart({ ...valid, format });
    expect(result.ok && result.value.format).toBe(format);
  });

  it.each(["both", ""])("rejects first server %j", (firstServer) => {
    expect(parseMatchStart({ ...valid, firstServer })).toEqual({ ok: false, error: "first_server_invalid" });
  });
});

describe("matchFormatLabel", () => {
  it("returns the label of a known format", () => {
    expect(matchFormatLabel("best_of_3_sets")).toBe("Do 2 wygranych setów, tie-break przy 6:6");
  });

  it.each(["custom", "", "toString"])("returns null for unknown format %j", (id) => {
    expect(matchFormatLabel(id)).toBeNull();
  });
});

describe("matchErrorMessage", () => {
  it.each([
    ["player_missing", "Wybierz zawodnika"],
    ["player_not_found", "Nie znaleziono zawodnika"],
    ["tournament_too_long", "Nazwa turnieju może mieć najwyżej 100 znaków"],
    ["format_invalid", "Wybierz format meczu"],
    ["first_server_invalid", "Wskaż, kto serwuje pierwszy"],
    ["advantage_invalid", "Wybierz, czy gemy są z przewagami"],
    ["not_configured", "Supabase nie jest skonfigurowany"],
  ])("maps %j to a fixed message", (code, message) => {
    expect(matchErrorMessage(code)).toBe(message);
  });

  it.each([null, "", "Sesja wygasła, zadzwoń pod 123", "toString", "__proto__"])(
    "shows nothing for unknown code %j",
    (code) => {
      expect(matchErrorMessage(code)).toBeNull();
    },
  );
});

describe("historyNotice", () => {
  it("reports a deleted match", () => {
    expect(historyNotice(new URLSearchParams("deleted=1"))).toEqual({ kind: "deleted" });
  });

  it("shows the fixed message of a known error", () => {
    expect(historyNotice(new URLSearchParams("error=match_not_found"))).toEqual({
      kind: "error",
      message: "Nie znaleziono meczu",
    });
  });

  it.each(["", "error=whatever", "deleted=yes", "deleted=0"])("shows nothing for %j", (query) => {
    expect(historyNotice(new URLSearchParams(query))).toBeNull();
  });
});
