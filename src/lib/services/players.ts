export const PLAYER_NAME_MAX_LENGTH = 50;

export type ParsePlayerNameResult = { ok: true; name: string } | { ok: false; error: string };

// Normalizes a player name (trim, collapse whitespace) and checks the same limits as the
// database. Length is counted in code points, like Postgres char_length.
export function parsePlayerName(raw: string): ParsePlayerNameResult {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    return { ok: false, error: "Podaj imię zawodnika" };
  }
  if (Array.from(name).length > PLAYER_NAME_MAX_LENGTH) {
    return { ok: false, error: `Imię może mieć najwyżej ${PLAYER_NAME_MAX_LENGTH} znaków` };
  }
  return { ok: true, name };
}
