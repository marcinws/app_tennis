import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { type FirstServer, isMatchFormatId } from "@/lib/services/matches";
import { extendsActions, parseMatchActions, replayMatch, sameActions } from "@/lib/services/scoring";

// The largest valid log (2000 actions) is about 72 KB; anything far above it is not worth parsing.
const MAX_BODY_BYTES = 131_072;

const matchIdSchema = z.uuid();
const logBodySchema = z.object({
  // Below the Postgres integer maximum, so revision + 1 still fits.
  base_revision: z.number().int().nonnegative().max(2147483646),
  events: z.unknown(),
});

interface StoredMatch {
  format: string;
  with_advantage: boolean;
  first_server: FirstServer;
  events: unknown;
  revision: number;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function saveFailed(message: string, cause: unknown) {
  // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
  console.error(message, cause);
  return json({ error: "save_failed" }, 500);
}

// Saves the whole match log, conditional on the revision the client built it on.
export const PUT: APIRoute = async (context) => {
  const parsedId = matchIdSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return json({ error: "match_not_found" }, 404);
  }
  const id = parsedId.data;

  const contentLength = context.request.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    // Malformed JSON is a client error; the 400 below is the handling.
    return json({ error: "invalid_body" }, 400);
  }
  const parsedBody = logBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return json({ error: "invalid_body" }, 400);
  }
  const baseRevision = parsedBody.data.base_revision;
  const parsedLog = parseMatchActions(parsedBody.data.events);
  if (!parsedLog.ok) {
    return json({ error: "invalid_log" }, 400);
  }
  const actions = parsedLog.actions;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "not_configured" }, 500);
  }

  // Under RLS a foreign match is indistinguishable from a missing one: both read as no row.
  const { data: match, error: readError } = await supabase
    .from("matches")
    .select("format, with_advantage, first_server, events, revision")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<StoredMatch | null, { merge: false }>();
  if (readError) {
    return saveFailed("Failed to load match for log save", readError);
  }
  if (!match) {
    return json({ error: "match_not_found" }, 404);
  }
  if (!isMatchFormatId(match.format)) {
    return saveFailed("Stored match has an unknown format", { id, format: match.format });
  }

  const replay = replayMatch(
    { format: match.format, withAdvantage: match.with_advantage, firstServer: match.first_server },
    actions,
  );
  if (!replay.ok) {
    return json({ error: replay.error }, 400);
  }

  const { data: saved, error: updateError } = await supabase
    .from("matches")
    .update({ events: actions, revision: baseRevision + 1 })
    .eq("id", id)
    .eq("revision", baseRevision)
    .select("revision")
    .maybeSingle()
    .overrideTypes<{ revision: number } | null, { merge: false }>();
  if (updateError) {
    return saveFailed("Failed to save match log", updateError);
  }
  if (saved) {
    return json({ revision: saved.revision }, 200);
  }

  // The stored revision differs: either a retry whose response was lost, or another phone's save.
  const { data: current, error: rereadError } = await supabase
    .from("matches")
    .select("events, revision")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Pick<StoredMatch, "events" | "revision"> | null, { merge: false }>();
  if (rereadError) {
    return saveFailed("Failed to reread match log after a revision mismatch", rereadError);
  }
  if (!current) {
    return json({ error: "match_not_found" }, 404);
  }
  const stored = parseMatchActions(current.events);
  if (!stored.ok) {
    return saveFailed("Stored match log is invalid", { id, revision: current.revision });
  }
  if (sameActions(stored.actions, actions)) {
    return json({ revision: current.revision }, 200);
  }
  // A retry whose response was lost, with points added since. Saving the extension is safe,
  // because no stored action is ever dropped, whichever phone recorded it.
  if (extendsActions(stored.actions, actions)) {
    const { data: extended, error: extendError } = await supabase
      .from("matches")
      .update({ events: actions, revision: current.revision + 1 })
      .eq("id", id)
      .eq("revision", current.revision)
      .select("revision")
      .maybeSingle()
      .overrideTypes<{ revision: number } | null, { merge: false }>();
    if (extendError) {
      return saveFailed("Failed to save an extended match log", extendError);
    }
    if (extended) {
      return json({ revision: extended.revision }, 200);
    }
    // Another save won the race; report its log as a conflict.
    const { data: latest, error: latestError } = await supabase
      .from("matches")
      .select("events, revision")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<Pick<StoredMatch, "events" | "revision"> | null, { merge: false }>();
    if (latestError) {
      return saveFailed("Failed to reread match log after a lost extension race", latestError);
    }
    if (!latest) {
      return json({ error: "match_not_found" }, 404);
    }
    const latestActions = parseMatchActions(latest.events);
    if (!latestActions.ok) {
      return saveFailed("Stored match log is invalid", { id, revision: latest.revision });
    }
    return json({ error: "conflict", revision: latest.revision, events: latestActions.actions }, 409);
  }
  return json({ error: "conflict", revision: current.revision, events: stored.actions }, 409);
};
