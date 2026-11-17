export const PLAYER_NAME_MAX_LENGTH = 50;

// Error codes travel in the `?error=` query of /players; the page shows only these fixed messages,
// so a crafted link cannot put its own text in the app.
export const PLAYER_ERROR_MESSAGES = {
  name_empty: "Podaj imię zawodnika",
  name_too_long: `Imię może mieć najwyżej ${PLAYER_NAME_MAX_LENGTH} znaków`,
  duplicate: "Taki zawodnik już istnieje",
  not_configured: "Supabase nie jest skonfigurowany",
} as const;

export type PlayerErrorCode = keyof typeof PLAYER_ERROR_MESSAGES;

export type ParsePlayerNameResult = { ok: true; name: string } | { ok: false; error: PlayerErrorCode };

// Normalizes a player name (trim, collapse whitespace) and checks the same limits as the
// database. Length is counted in code points, like Postgres char_length.
export function parsePlayerName(raw: string): ParsePlayerNameResult {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    return { ok: false, error: "name_empty" };
  }
  if (Array.from(name).length > PLAYER_NAME_MAX_LENGTH) {
    return { ok: false, error: "name_too_long" };
  }
  return { ok: true, name };
}

// Message for an `?error=` value; unknown or missing codes show nothing.
export function playerErrorMessage(code: string | null): string | null {
  return code !== null && Object.hasOwn(PLAYER_ERROR_MESSAGES, code)
    ? PLAYER_ERROR_MESSAGES[code as PlayerErrorCode]
    : null;
}
