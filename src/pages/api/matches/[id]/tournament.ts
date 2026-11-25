import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type MatchErrorCode, parseTournamentName } from "@/lib/services/matches";

const matchIdSchema = z.uuid();
const tournamentFormSchema = z.object({ tournament_name: z.string() });

// Fills in the tournament name of a match that has none; an existing name is never changed here.
export const POST: APIRoute = async (context) => {
  const parsedId = matchIdSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return new Response("Nie znaleziono meczu", { status: 404 });
  }
  const matchId = parsedId.data;
  const summaryUrl = `/matches/${matchId}/summary`;
  const redirectWithError = (code: MatchErrorCode) => context.redirect(`${summaryUrl}?error=${code}`);

  const form = await context.request.formData();
  const parsedForm = tournamentFormSchema.safeParse({ tournament_name: form.get("tournament_name") ?? "" });
  if (!parsedForm.success) {
    return redirectWithError("tournament_empty");
  }
  const parsedName = parseTournamentName(parsedForm.data.tournament_name);
  if (!parsedName.ok) {
    return redirectWithError(parsedName.error);
  }
  if (parsedName.name === null) {
    return redirectWithError("tournament_empty");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError("not_configured");
  }

  // Under RLS a foreign match matches no row, exactly like a match that already has a name.
  const { data, error } = await supabase
    .from("matches")
    .update({ tournament_name: parsedName.name })
    .eq("id", matchId)
    .is("tournament_name", null)
    .select("id");
  if (error) {
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to fill in the tournament name", { id: matchId, error });
    return new Response("Nie udało się zapisać nazwy turnieju", { status: 500 });
  }
  if (data.length === 0) {
    return redirectWithError("tournament_already_set");
  }
  return context.redirect(summaryUrl);
};
