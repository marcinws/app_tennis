import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type PlayerErrorCode, parsePlayerName } from "@/lib/services/players";

const UNIQUE_VIOLATION = "23505";

const playerIdSchema = z.uuid();
const playerFormSchema = z.object({ name: z.string() });

function notFound() {
  return new Response("Nie znaleziono zawodnika", { status: 404 });
}

export const POST: APIRoute = async (context) => {
  const redirectWithError = (code: PlayerErrorCode) => context.redirect(`/players?error=${code}`);
  const parsedId = playerIdSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return notFound();
  }

  const form = await context.request.formData();
  const parsedForm = playerFormSchema.safeParse({ name: form.get("name") });
  if (!parsedForm.success) {
    return redirectWithError("name_empty");
  }
  const parsedName = parsePlayerName(parsedForm.data.name);
  if (!parsedName.ok) {
    return redirectWithError(parsedName.error);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError("not_configured");
  }

  // Under RLS a foreign or missing id is not an error, just zero updated rows.
  const { data, error } = await supabase
    .from("players")
    .update({ name: parsedName.name })
    .eq("id", parsedId.data)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return redirectWithError("duplicate");
    }
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to rename player", error);
    return new Response("Nie udało się zapisać zawodnika", { status: 500 });
  }
  if (data.length === 0) {
    return notFound();
  }

  return context.redirect("/players");
};
