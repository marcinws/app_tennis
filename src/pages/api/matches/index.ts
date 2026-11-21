import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type MatchErrorCode, parseMatchStart } from "@/lib/services/matches";

const FOREIGN_KEY_VIOLATION = "23503";
// The player is missing or belongs to another account (composite FK on matches).
const PLAYER_FOREIGN_KEY = "matches_player_id_owner_id_fkey";

const matchFormSchema = z.object({
  player_id: z.uuid(),
  tournament_name: z.string(),
  format: z.string(),
  first_server: z.string(),
});

export const POST: APIRoute = async (context) => {
  const redirectWithError = (code: MatchErrorCode) => context.redirect(`/matches/new?error=${code}`);
  const form = await context.request.formData();
  const parsedForm = matchFormSchema.safeParse({
    player_id: form.get("player_id") ?? "",
    tournament_name: form.get("tournament_name") ?? "",
    format: form.get("format") ?? "",
    first_server: form.get("first_server") ?? "",
  });
  if (!parsedForm.success) {
    return redirectWithError("player_missing");
  }
  const parsedStart = parseMatchStart({
    tournamentName: parsedForm.data.tournament_name,
    format: parsedForm.data.format,
    // Phase 2 reads with_advantage from the form; until then every match keeps the database default.
    withAdvantage: "true",
    firstServer: parsedForm.data.first_server,
  });
  if (!parsedStart.ok) {
    return redirectWithError(parsedStart.error);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError("not_configured");
  }

  const { data, error } = await supabase
    .from("matches")
    .insert({
      player_id: parsedForm.data.player_id,
      tournament_name: parsedStart.value.tournamentName,
      format: parsedStart.value.format,
      first_server: parsedStart.value.firstServer,
    })
    .select("id")
    .single();
  if (error) {
    // Only the composite FK means "not your player"; any other FK failure is a real error.
    if (error.code === FOREIGN_KEY_VIOLATION && error.message.includes(PLAYER_FOREIGN_KEY)) {
      return redirectWithError("player_not_found");
    }
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to insert match", error);
    return new Response("Nie udało się rozpocząć meczu", { status: 500 });
  }

  return context.redirect(`/matches/${data.id}`);
};
