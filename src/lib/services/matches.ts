// Ids must equal the `check` values on matches.format
// (supabase/migrations/20261121120000_add_match_formats.sql).
export const MATCH_FORMATS = [
  { id: "best_of_3_sets", label: "Do 2 wygranych setów, tie-break przy 6:6" },
  { id: "two_sets_super_tiebreak", label: "2 sety, przy 1:1 super tie-break do 10" },
  { id: "short_sets", label: "Krótkie sety do 4 gemów, tie-break przy 4:4" },
] as const;

export type MatchFormatId = (typeof MATCH_FORMATS)[number]["id"];

export const FIRST_SERVERS = ["player", "opponent"] as const;

export type FirstServer = (typeof FIRST_SERVERS)[number];

export const TOURNAMENT_NAME_MAX_LENGTH = 100;

// Error codes travel in the `?error=` query; the page shows only these fixed messages,
// so a crafted link cannot put its own text in the app.
export const MATCH_ERROR_MESSAGES = {
  player_missing: "Wybierz zawodnika",
  player_not_found: "Nie znaleziono zawodnika",
  tournament_too_long: `Nazwa turnieju może mieć najwyżej ${TOURNAMENT_NAME_MAX_LENGTH} znaków`,
  format_invalid: "Wybierz format meczu",
  first_server_invalid: "Wskaż, kto serwuje pierwszy",
  advantage_invalid: "Wybierz, czy gemy są z przewagami",
  not_configured: "Supabase nie jest skonfigurowany",
} as const;

export type MatchErrorCode = keyof typeof MATCH_ERROR_MESSAGES;

export type ParseTournamentNameResult = { ok: true; name: string | null } | { ok: false; error: MatchErrorCode };

export interface MatchStart {
  tournamentName: string | null;
  format: MatchFormatId;
  withAdvantage: boolean;
  firstServer: FirstServer;
}

export type ParseMatchStartResult = { ok: true; value: MatchStart } | { ok: false; error: MatchErrorCode };

// Normalizes an optional tournament name (trim, collapse whitespace); empty means no tournament.
// Length is counted in code points, like Postgres char_length.
export function parseTournamentName(raw: string): ParseTournamentNameResult {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    return { ok: true, name: null };
  }
  if (Array.from(name).length > TOURNAMENT_NAME_MAX_LENGTH) {
    return { ok: false, error: "tournament_too_long" };
  }
  return { ok: true, name };
}

export function isMatchFormatId(value: string): value is MatchFormatId {
  return MATCH_FORMATS.some((format) => format.id === value);
}

function isFirstServer(value: string): value is FirstServer {
  return (FIRST_SERVERS as readonly string[]).includes(value);
}

// Checks the match start form. The player id is validated by the route, as HTTP input.
export function parseMatchStart(input: {
  tournamentName: string;
  format: string;
  // Radio value from the form: "true" or "false".
  withAdvantage: string;
  firstServer: string;
}): ParseMatchStartResult {
  const tournament = parseTournamentName(input.tournamentName);
  if (!tournament.ok) {
    return tournament;
  }
  if (!isMatchFormatId(input.format)) {
    return { ok: false, error: "format_invalid" };
  }
  if (input.withAdvantage !== "true" && input.withAdvantage !== "false") {
    return { ok: false, error: "advantage_invalid" };
  }
  if (!isFirstServer(input.firstServer)) {
    return { ok: false, error: "first_server_invalid" };
  }
  return {
    ok: true,
    value: {
      tournamentName: tournament.name,
      format: input.format,
      withAdvantage: input.withAdvantage === "true",
      firstServer: input.firstServer,
    },
  };
}

export function matchFormatLabel(id: string): string | null {
  return MATCH_FORMATS.find((format) => format.id === id)?.label ?? null;
}

// Message for an `?error=` value; unknown or missing codes show nothing.
export function matchErrorMessage(code: string | null): string | null {
  return code !== null && Object.hasOwn(MATCH_ERROR_MESSAGES, code)
    ? MATCH_ERROR_MESSAGES[code as MatchErrorCode]
    : null;
}
