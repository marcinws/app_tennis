import type { APIContext, APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import type { NotesRejectionCode } from "@/lib/services/match-notes";

const UNIQUE_VIOLATION = "23505";
// The goal is missing, belongs to another player or to another account (composite FK on match_observations).
const FOREIGN_KEY_VIOLATION = "23503";
const MAX_BODY_BYTES = 1024;

const idSchema = z.uuid();
const bodySchema = z.object({ goal_id: z.uuid() });

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clip(value: string | undefined): string | null {
  return value === undefined ? null : value.slice(0, 64);
}

// Every client error goes through here, so the reason a phone's entry was refused is in the server log.
// Ids are logged as received (clipped, so an oversized path cannot bloat the log); the request body is not.
function rejected(context: APIContext, code: NotesRejectionCode, status: number) {
  // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this rejection is visible
  console.warn("Rejected a match observation request", {
    route: "observations",
    method: context.request.method,
    matchId: clip(context.params.id),
    observationId: clip(context.params.observationId),
    userId: context.locals.user?.id ?? null,
    error: code,
    status,
  });
  return json({ error: code }, status);
}

function saveFailed(message: string, cause: unknown) {
  // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
  console.error(message, cause);
  return json({ error: "save_failed" }, 500);
}

function parseIds(params: Record<string, string | undefined>) {
  const matchId = idSchema.safeParse(params.id);
  const observationId = idSchema.safeParse(params.observationId);
  return matchId.success && observationId.success ? { matchId: matchId.data, observationId: observationId.data } : null;
}

// Saves one observation under an id picked by the phone; repeating the request is safe.
export const PUT: APIRoute = async (context) => {
  const ids = parseIds(context.params);
  if (!ids) {
    return rejected(context, "not_found", 404);
  }
  const contentLength = context.request.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
    return rejected(context, "payload_too_large", 413);
  }
  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    // Malformed JSON is a client error; the 400 below is the handling.
    return rejected(context, "invalid_body", 400);
  }
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return rejected(context, "invalid_body", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "not_configured" }, 500);
  }

  // Under RLS a foreign match is indistinguishable from a missing one: both read as no row.
  const { data: match, error: readError } = await supabase
    .from("matches")
    .select("player_id")
    .eq("id", ids.matchId)
    .maybeSingle()
    .overrideTypes<{ player_id: string } | null, { merge: false }>();
  if (readError) {
    return saveFailed("Failed to load match for an observation", readError);
  }
  if (!match) {
    return rejected(context, "match_not_found", 404);
  }

  const { error: insertError } = await supabase.from("match_observations").insert({
    id: ids.observationId,
    match_id: ids.matchId,
    player_id: match.player_id,
    goal_id: parsedBody.data.goal_id,
  });
  if (insertError) {
    // A retry whose first response was lost: the row is already there.
    if (insertError.code === UNIQUE_VIOLATION) {
      return json({ id: ids.observationId }, 200);
    }
    if (insertError.code === FOREIGN_KEY_VIOLATION) {
      return rejected(context, "goal_not_found", 404);
    }
    return saveFailed("Failed to save observation", insertError);
  }
  return json({ id: ids.observationId }, 200);
};

// Deletes one observation; an id that is already gone counts as deleted.
export const DELETE: APIRoute = async (context) => {
  const ids = parseIds(context.params);
  if (!ids) {
    return rejected(context, "not_found", 404);
  }
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "not_configured" }, 500);
  }
  const { error } = await supabase
    .from("match_observations")
    .delete()
    .eq("id", ids.observationId)
    .eq("match_id", ids.matchId);
  if (error) {
    return saveFailed("Failed to delete observation", error);
  }
  return new Response(null, { status: 204 });
};
