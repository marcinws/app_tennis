import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type GoalErrorCode, canAddGoal, parseGoalText } from "@/lib/services/goals";

const FOREIGN_KEY_VIOLATION = "23503";
// The player is missing or belongs to another account (composite FK on player_goals).
const PLAYER_FOREIGN_KEY = "player_goals_player_id_owner_id_fkey";
// Raised by public.enforce_active_goal_limit() when a concurrent add won the race.
const RAISE_EXCEPTION = "P0001";
const GOAL_LIMIT_MESSAGE = "goal_limit";

const playerIdSchema = z.uuid();
const goalFormSchema = z.object({ text: z.string() });

function notFound() {
  return new Response("Nie znaleziono zawodnika", { status: 404 });
}

export const POST: APIRoute = async (context) => {
  const parsedId = playerIdSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return notFound();
  }
  const playerId = parsedId.data;
  const redirectWithError = (code: GoalErrorCode) => context.redirect(`/players/${playerId}?error=${code}`);

  const form = await context.request.formData();
  const parsedForm = goalFormSchema.safeParse({ text: form.get("text") });
  if (!parsedForm.success) {
    return redirectWithError("text_empty");
  }
  const parsedText = parseGoalText(parsedForm.data.text);
  if (!parsedText.ok) {
    return redirectWithError(parsedText.error);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError("not_configured");
  }

  const { count, error: countError } = await supabase
    .from("player_goals")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .eq("active", true);
  if (countError) {
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to count active goals", countError);
    return new Response("Nie udało się zapisać celu", { status: 500 });
  }
  if (!canAddGoal(count ?? 0)) {
    return redirectWithError("goal_limit");
  }

  const { error } = await supabase.from("player_goals").insert({ player_id: playerId, text: parsedText.text });
  if (error) {
    // Only the composite FK means "not your player"; any other FK failure is a real error.
    if (error.code === FOREIGN_KEY_VIOLATION && error.message.includes(PLAYER_FOREIGN_KEY)) {
      return notFound();
    }
    if (error.code === RAISE_EXCEPTION && error.message === GOAL_LIMIT_MESSAGE) {
      return redirectWithError("goal_limit");
    }
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to insert goal", error);
    return new Response("Nie udało się zapisać celu", { status: 500 });
  }

  return context.redirect(`/players/${playerId}`);
};
