export const GOAL_TEXT_MAX_LENGTH = 100;
// Must equal the limit in public.enforce_active_goal_limit() (supabase/migrations).
export const MAX_ACTIVE_GOALS = 3;

// Error codes travel in the `?error=` query; the page shows only these fixed messages,
// so a crafted link cannot put its own text in the app.
export const GOAL_ERROR_MESSAGES = {
  text_empty: "Wpisz treść celu",
  text_too_long: `Cel może mieć najwyżej ${GOAL_TEXT_MAX_LENGTH} znaków`,
  goal_limit: `Zawodnik ma już ${MAX_ACTIVE_GOALS} aktywne cele. Zakończ jeden, żeby dodać nowy`,
  goal_not_found: "Nie znaleziono celu",
  not_configured: "Supabase nie jest skonfigurowany",
} as const;

export type GoalErrorCode = keyof typeof GOAL_ERROR_MESSAGES;

export type ParseGoalTextResult = { ok: true; text: string } | { ok: false; error: GoalErrorCode };

// Normalizes a goal (trim, collapse whitespace) and checks the same limits as the
// database. Length is counted in code points, like Postgres char_length.
export function parseGoalText(raw: string): ParseGoalTextResult {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length === 0) {
    return { ok: false, error: "text_empty" };
  }
  if (Array.from(text).length > GOAL_TEXT_MAX_LENGTH) {
    return { ok: false, error: "text_too_long" };
  }
  return { ok: true, text };
}

export function canAddGoal(activeCount: number): boolean {
  return activeCount < MAX_ACTIVE_GOALS;
}

// Message for an `?error=` value; unknown or missing codes show nothing.
export function goalErrorMessage(code: string | null): string | null {
  return code !== null && Object.hasOwn(GOAL_ERROR_MESSAGES, code) ? GOAL_ERROR_MESSAGES[code as GoalErrorCode] : null;
}
