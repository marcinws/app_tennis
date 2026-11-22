import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type GoalErrorCode, parseGoalText } from "@/lib/services/goals";

const idSchema = z.uuid();
const goalFormSchema = z.object({ action: z.enum(["save", "end"]), text: z.string() });

function notFound() {
  return new Response("Nie znaleziono celu", { status: 404 });
}

export const POST: APIRoute = async (context) => {
  const parsedPlayerId = idSchema.safeParse(context.params.id);
  const parsedGoalId = idSchema.safeParse(context.params.goalId);
  if (!parsedPlayerId.success || !parsedGoalId.success) {
    return notFound();
  }
  const playerId = parsedPlayerId.data;
  const goalId = parsedGoalId.data;
  const redirectWithError = (code: GoalErrorCode) => context.redirect(`/players/${playerId}?error=${code}`);

  const form = await context.request.formData();
  const parsedForm = goalFormSchema.safeParse({ action: form.get("action"), text: form.get("text") ?? "" });
  if (!parsedForm.success) {
    return new Response("Nieprawidłowe dane formularza", { status: 400 });
  }

  let changes: { text: string } | { active: false };
  if (parsedForm.data.action === "save") {
    const parsedText = parseGoalText(parsedForm.data.text);
    if (!parsedText.ok) {
      return redirectWithError(parsedText.error);
    }
    changes = { text: parsedText.text };
  } else {
    changes = { active: false };
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError("not_configured");
  }

  // Under RLS a foreign, missing or already ended goal is not an error, just zero updated rows.
  const { data, error } = await supabase
    .from("player_goals")
    .update(changes)
    .eq("id", goalId)
    .eq("player_id", playerId)
    .eq("active", true)
    .select("id");
  if (error) {
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to update goal", error);
    return new Response("Nie udało się zapisać celu", { status: 500 });
  }
  if (data.length === 0) {
    return redirectWithError("goal_not_found");
  }

  return context.redirect(`/players/${playerId}`);
};
