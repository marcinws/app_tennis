import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { parseNoteText } from "@/lib/services/match-notes";

const UNIQUE_VIOLATION = "23505";
// The match is missing or belongs to another account (composite FK on match_notes).
const FOREIGN_KEY_VIOLATION = "23503";
// A 200-character note is at most about 800 bytes of UTF-8 plus the JSON around it.
const MAX_BODY_BYTES = 4096;

const idSchema = z.uuid();
const bodySchema = z.object({ text: z.string() });

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function saveFailed(message: string, cause: unknown) {
  // eslint-disable-next-line no-console -- no error tracker yet; the server log is the only place this failure is visible
  console.error(message, cause);
  return json({ error: "save_failed" }, 500);
}

function parseIds(params: Record<string, string | undefined>) {
  const matchId = idSchema.safeParse(params.id);
  const noteId = idSchema.safeParse(params.noteId);
  return matchId.success && noteId.success ? { matchId: matchId.data, noteId: noteId.data } : null;
}

// Saves one note under an id picked by the phone; repeating the request is safe.
export const PUT: APIRoute = async (context) => {
  const ids = parseIds(context.params);
  if (!ids) {
    return json({ error: "not_found" }, 404);
  }
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
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return json({ error: "invalid_body" }, 400);
  }
  const parsedText = parseNoteText(parsedBody.data.text);
  if (!parsedText.ok) {
    return json({ error: parsedText.error }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "not_configured" }, 500);
  }

  const { error: insertError } = await supabase
    .from("match_notes")
    .insert({ id: ids.noteId, match_id: ids.matchId, text: parsedText.text });
  if (insertError) {
    // A retry whose first response was lost: the row is already there.
    if (insertError.code === UNIQUE_VIOLATION) {
      return json({ id: ids.noteId }, 200);
    }
    if (insertError.code === FOREIGN_KEY_VIOLATION) {
      return json({ error: "match_not_found" }, 404);
    }
    return saveFailed("Failed to save note", insertError);
  }
  return json({ id: ids.noteId }, 200);
};

// Deletes one note; an id that is already gone counts as deleted.
export const DELETE: APIRoute = async (context) => {
  const ids = parseIds(context.params);
  if (!ids) {
    return json({ error: "not_found" }, 404);
  }
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "not_configured" }, 500);
  }
  const { error } = await supabase.from("match_notes").delete().eq("id", ids.noteId).eq("match_id", ids.matchId);
  if (error) {
    return saveFailed("Failed to delete note", error);
  }
  return new Response(null, { status: 204 });
};
