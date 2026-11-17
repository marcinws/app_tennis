import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type PlayerErrorCode, parsePlayerName } from "@/lib/services/players";

const UNIQUE_VIOLATION = "23505";

const playerFormSchema = z.object({ name: z.string() });

export const POST: APIRoute = async (context) => {
  const redirectWithError = (code: PlayerErrorCode) => context.redirect(`/players?error=${code}`);
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

  const { error } = await supabase.from("players").insert({ name: parsedName.name });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return redirectWithError("duplicate");
    }
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to insert player", error);
    return new Response("Nie udało się zapisać zawodnika", { status: 500 });
  }

  return context.redirect("/players");
};
