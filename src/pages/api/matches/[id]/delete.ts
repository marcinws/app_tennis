import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";

const matchIdSchema = z.uuid();

// Deletes a match for good; its observations and notes go with it (on delete cascade).
export const POST: APIRoute = async (context) => {
  const parsedId = matchIdSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return new Response("Nie znaleziono meczu", { status: 404 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/matches?error=not_configured");
  }

  // Under RLS a foreign match matches no row, exactly like a missing one.
  const { data, error } = await supabase.from("matches").delete().eq("id", parsedId.data).select("id");
  if (error) {
    // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
    console.error("Failed to delete match", { id: parsedId.data, error });
    return new Response("Nie udało się usunąć meczu", { status: 500 });
  }
  if (data.length === 0) {
    return context.redirect("/matches?error=match_not_found");
  }
  return context.redirect("/matches?deleted=1");
};
