// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_MODE=full (default) creates two accounts, a player and a match; SMOKE_MODE=production writes nothing and is the only mode safe for production.

import { randomUUID } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const MODE = process.env.SMOKE_MODE ?? "full";
const runId = Date.now();
const email = `smoke-${runId}@example.com`;
const emailB = `smoke-${runId}-b@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
const PLAYER_NAME = "Smoke Player";
const TOURNAMENT_NAME = "Smoke Cup";
// Three goals fill the active-goal limit; plain text so the pages render them verbatim.
const GOAL_TEXTS = ["Smoke goal serve", "Smoke goal return", "Smoke goal volley"];
// Contains GOAL_TEXTS[0], so the match page check below still finds it after the edit.
const EDITED_GOAL_TEXT = "Smoke goal serve edited";
const REPLACEMENT_GOAL_TEXT = "Smoke goal replacement";
let playerAId;
// Goal ids of account A by goal text, read from the goal forms; account B later tries to end one.
const goalIds = new Map();
let matchAId;
// Account A's short-set match without advantage, started after the last-match link check.
let shortMatchId;
// Ids picked by the "phone" for account A's observations and notes; the first of each is deleted again.
const OBSERVATION_IDS = [randomUUID(), randomUUID()];
const NOTE_IDS = [randomUUID(), randomUUID()];
const NOTE_TEXTS = ["Smoke note deleted", "Smoke note kept"];
const FILLED_TOURNAMENT_NAME = "Smoke Open";
// Account A's match left without a tournament name; account B later tries to fill it in.
let unnamedMatchId;

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, json } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

// Reads the id of account A's player from the rename form on /players; later account B tries to rename it.
// Throws instead of failing the step, because every RLS check after it depends on the id.
async function capturePlayerId() {
  const actual = await request("/players");
  const forms = actual.body.matchAll(/<form[^>]*action="\/api\/players\/([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/form>/g);
  const match = [...forms].find(([, , inner]) => inner.includes(`value="${PLAYER_NAME}"`));
  if (!match) throw new Error(`No rename form for "${PLAYER_NAME}" on /players (status ${actual.status})`);
  playerAId = match[1];
  return actual;
}

function renameCapturedPlayer() {
  if (!playerAId) throw new Error("Player id of account A was not captured");
  return request(`/api/players/${playerAId}`, { method: "POST", form: { name: "Smoke Hijacked" } });
}

// Adds a goal to account A's player. Throws when the player id was not captured, so a missing id cannot pass as a rejected add.
function addGoalToCapturedPlayer(text) {
  if (!playerAId) throw new Error("Player id of account A was not captured");
  return request(`/api/players/${playerAId}/goals`, { method: "POST", form: { text } });
}

function requestCapturedPlayerGoals() {
  if (!playerAId) throw new Error("Player id of account A was not captured");
  return request(`/players/${playerAId}`);
}

// Reads the goal ids of account A from the edit forms on /players/<id>.
// Throws instead of failing the step, because the edit and RLS checks after it depend on the ids.
async function captureGoalIds() {
  const actual = await requestCapturedPlayerGoals();
  const forms = actual.body.matchAll(
    /<form[^>]*action="\/api\/players\/[0-9a-f-]{36}\/goals\/([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/form>/g,
  );
  for (const [, id, inner] of forms) {
    const text = GOAL_TEXTS.find((goalText) => inner.includes(`value="${goalText}"`));
    if (text) goalIds.set(text, id);
  }
  const missing = GOAL_TEXTS.filter((text) => !goalIds.has(text));
  if (missing.length > 0) throw new Error(`No edit form for goals ${missing.join(", ")} (status ${actual.status})`);
  return actual;
}

// Saves or ends one of account A's goals; throws when its id was not captured.
function changeCapturedGoal(text, form) {
  const goalId = goalIds.get(text);
  if (!playerAId || !goalId) throw new Error(`Id of goal "${text}" of account A was not captured`);
  return request(`/api/players/${playerAId}/goals/${goalId}`, { method: "POST", form });
}

// Starts a match for account A's player. Throws when the player id was not captured, so a missing id cannot pass as a rejected start.
function startMatchForCapturedPlayer(fields) {
  if (!playerAId) throw new Error("Player id of account A was not captured");
  return request("/api/matches", {
    method: "POST",
    form: {
      player_id: playerAId,
      tournament_name: "",
      format: "best_of_3_sets",
      with_advantage: "true",
      first_server: "player",
      ...fields,
    },
  });
}

// Starts account A's match and reads its id from the redirect; account B later tries to open it.
// Throws instead of failing the step, because the match checks after it depend on the id.
async function startAndCaptureMatch() {
  const actual = await startMatchForCapturedPlayer({ tournament_name: TOURNAMENT_NAME });
  const match = /^\/matches\/([0-9a-f-]{36})$/.exec(actual.location);
  if (!match)
    throw new Error(
      `No match id in the redirect after starting a match (status ${actual.status}, location "${actual.location}")`,
    );
  matchAId = match[1];
  return actual;
}

// Starts the short-set match without advantage and reads its id, like startAndCaptureMatch.
async function startAndCaptureShortMatch() {
  const actual = await startMatchForCapturedPlayer({ format: "short_sets", with_advantage: "false" });
  const match = /^\/matches\/([0-9a-f-]{36})$/.exec(actual.location);
  if (!match)
    throw new Error(
      `No match id in the redirect after starting a short-set match (status ${actual.status}, location "${actual.location}")`,
    );
  shortMatchId = match[1];
  return actual;
}

// Starts a match without a tournament name and reads its id, like startAndCaptureMatch.
async function startAndCaptureUnnamedMatch() {
  const actual = await startMatchForCapturedPlayer({});
  const match = /^\/matches\/([0-9a-f-]{36})$/.exec(actual.location);
  if (!match)
    throw new Error(
      `No match id in the redirect after starting an unnamed match (status ${actual.status}, location "${actual.location}")`,
    );
  unnamedMatchId = match[1];
  return actual;
}

function requestSummary(matchId) {
  if (!matchId) throw new Error("Match id of account A was not captured");
  return request(`/matches/${matchId}/summary`);
}

function fillTournamentName(matchId, name) {
  if (!matchId) throw new Error("Match id of account A was not captured");
  return request(`/api/matches/${matchId}/tournament`, { method: "POST", form: { tournament_name: name } });
}

function saveShortMatchLog(baseRevision, events) {
  if (!shortMatchId) throw new Error("Short-set match id of account A was not captured");
  return request(`/api/matches/${shortMatchId}/log`, { method: "PUT", json: { base_revision: baseRevision, events } });
}

function requestCapturedMatch() {
  if (!matchAId) throw new Error("Match id of account A was not captured");
  return request(`/matches/${matchAId}`);
}

// Saves or deletes an observation in account A's match at account A's first goal (or `goalId`).
function putCapturedObservation(observationId, goalId = goalIds.get(GOAL_TEXTS[0])) {
  if (!matchAId || !goalId) throw new Error("Match or goal id of account A was not captured");
  return request(`/api/matches/${matchAId}/observations/${observationId}`, {
    method: "PUT",
    json: { goal_id: goalId },
  });
}

function deleteCapturedObservation(observationId) {
  if (!matchAId) throw new Error("Match id of account A was not captured");
  return request(`/api/matches/${matchAId}/observations/${observationId}`, { method: "DELETE" });
}

function putCapturedNote(noteId, text) {
  if (!matchAId) throw new Error("Match id of account A was not captured");
  return request(`/api/matches/${matchAId}/notes/${noteId}`, { method: "PUT", json: { text } });
}

function deleteCapturedNote(noteId) {
  if (!matchAId) throw new Error("Match id of account A was not captured");
  return request(`/api/matches/${matchAId}/notes/${noteId}`, { method: "DELETE" });
}

const PLAYER_POINT = { type: "point", winner: "player" };
const OPPONENT_POINT = { type: "point", winner: "opponent" };
// 12 games of 4 points win the match 6:0 6:0, so the 49th point comes after the match has ended.
const MATCH_WINNING_POINTS = Array.from({ length: 48 }, () => PLAYER_POINT);
// A hand-entered 4:0 wins the game; 6:3 cannot happen in a game with advantage, which the smoke match uses.
const MANUAL_GAME_WON = { type: "game_score", player: 4, opponent: 0 };
const MANUAL_GAME_IMPOSSIBLE = { type: "game_score", player: 6, opponent: 3 };
// Without advantage the point at 40:40 wins the game (4:3), so 5:3 can only happen with advantage.
const DECIDING_POINT_GAME = { type: "game_score", player: 4, opponent: 3 };
const ADVANTAGE_GAME = { type: "game_score", player: 5, opponent: 3 };

// Saves the log of account A's match. Throws when the match id was not captured, so a missing id cannot pass as a rejected save.
function saveCapturedMatchLog(baseRevision, events) {
  if (!matchAId) throw new Error("Match id of account A was not captured");
  return request(`/api/matches/${matchAId}/log`, { method: "PUT", json: { base_revision: baseRevision, events } });
}

const fullSteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["players redirects anonymous user", () => request("/players"), { status: 302, location: "/auth/signin" }],
  ["new match redirects anonymous user", () => request("/matches/new"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  // Email confirmation is disabled for the smoke run, so signup must not tell the user to check their inbox.
  [
    "confirm page reports auto-confirmed account",
    () => request("/auth/confirm-email"),
    { status: 200, text: "Registration successful" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["players renders for signed-in user", () => request("/players"), { status: 200 }],
  [
    "adding a player redirects to the list",
    () => request("/api/players", { method: "POST", form: { name: PLAYER_NAME } }),
    { status: 302, location: "/players" },
  ],
  ["players list shows the new player", () => request("/players"), { status: 200, text: PLAYER_NAME }],
  [
    "duplicate player name is rejected",
    () => request("/api/players", { method: "POST", form: { name: " smoke   player " } }),
    { status: 302, location: "/players?error=" },
  ],
  ["player id is read from the rename form", capturePlayerId, { status: 200 }],
  ["goals page renders", requestCapturedPlayerGoals, { status: 200 }],
  [
    "a goal is added",
    () => addGoalToCapturedPlayer(GOAL_TEXTS[0]),
    {
      status: 302,
      // Getter: the player id is captured by an earlier step, after this array is built.
      get location() {
        return `/players/${playerAId}`;
      },
    },
  ],
  [
    "a goal is added",
    () => addGoalToCapturedPlayer(GOAL_TEXTS[1]),
    {
      status: 302,
      // Getter: the player id is captured by an earlier step, after this array is built.
      get location() {
        return `/players/${playerAId}`;
      },
    },
  ],
  [
    "a goal is added",
    () => addGoalToCapturedPlayer(GOAL_TEXTS[2]),
    {
      status: 302,
      // Getter: the player id is captured by an earlier step, after this array is built.
      get location() {
        return `/players/${playerAId}`;
      },
    },
  ],
  [
    "a fourth active goal is rejected",
    () => addGoalToCapturedPlayer("Smoke goal fourth"),
    {
      status: 302,
      get location() {
        return `/players/${playerAId}?error=goal_limit`;
      },
    },
  ],
  [
    "an empty goal is rejected",
    () => addGoalToCapturedPlayer("   "),
    {
      status: 302,
      get location() {
        return `/players/${playerAId}?error=text_empty`;
      },
    },
  ],
  ["goals page lists the goals", requestCapturedPlayerGoals, { status: 200, text: GOAL_TEXTS[0] }],
  ["goal ids are read from the goal forms", captureGoalIds, { status: 200 }],
  [
    "a goal text is changed",
    () => changeCapturedGoal(GOAL_TEXTS[0], { action: "save", text: EDITED_GOAL_TEXT }),
    {
      status: 302,
      get location() {
        return `/players/${playerAId}`;
      },
    },
  ],
  ["goals page shows the changed goal", requestCapturedPlayerGoals, { status: 200, text: EDITED_GOAL_TEXT }],
  [
    "a goal is ended",
    () => changeCapturedGoal(GOAL_TEXTS[1], { action: "end", text: GOAL_TEXTS[1] }),
    {
      status: 302,
      get location() {
        return `/players/${playerAId}`;
      },
    },
  ],
  // The redirect prefix also matches an error redirect, so the page check below proves the slot was freed.
  [
    "ending a goal frees a slot",
    () => addGoalToCapturedPlayer(REPLACEMENT_GOAL_TEXT),
    {
      status: 302,
      get location() {
        return `/players/${playerAId}`;
      },
    },
  ],
  [
    "goals page lists the new goal without the ended one",
    requestCapturedPlayerGoals,
    { status: 200, text: REPLACEMENT_GOAL_TEXT, absent: GOAL_TEXTS[1] },
  ],
  ["new match form lists the player", () => request("/matches/new"), { status: 200, text: PLAYER_NAME }],
  ["starting a match redirects to the match", startAndCaptureMatch, { status: 302, location: "/matches/" }],
  ["match page shows the tournament", requestCapturedMatch, { status: 200, text: TOURNAMENT_NAME }],
  ["match page shows the player's goals", requestCapturedMatch, { status: 200, text: GOAL_TEXTS[0] }],
  ["an observation is saved", () => putCapturedObservation(OBSERVATION_IDS[0]), { status: 200 }],
  // A retry whose response was lost: the id is already stored, so it succeeds without a duplicate.
  ["retrying the same observation succeeds", () => putCapturedObservation(OBSERVATION_IDS[0]), { status: 200 }],
  ["a second observation is saved", () => putCapturedObservation(OBSERVATION_IDS[1]), { status: 200 }],
  [
    "an observation at an unknown goal is rejected",
    () => putCapturedObservation(randomUUID(), randomUUID()),
    { status: 404, text: '"goal_not_found"' },
  ],
  // The ids travel in the island props on the match page.
  ["match page shows the observations", requestCapturedMatch, { status: 200, text: OBSERVATION_IDS[0] }],
  ["an observation is deleted", () => deleteCapturedObservation(OBSERVATION_IDS[0]), { status: 204 }],
  ["deleting it again succeeds", () => deleteCapturedObservation(OBSERVATION_IDS[0]), { status: 204 }],
  [
    "match page drops the deleted observation",
    requestCapturedMatch,
    { status: 200, text: OBSERVATION_IDS[1], absent: OBSERVATION_IDS[0] },
  ],
  ["a note is saved", () => putCapturedNote(NOTE_IDS[0], NOTE_TEXTS[0]), { status: 200 }],
  ["retrying the same note succeeds", () => putCapturedNote(NOTE_IDS[0], NOTE_TEXTS[0]), { status: 200 }],
  ["a second note is saved", () => putCapturedNote(NOTE_IDS[1], NOTE_TEXTS[1]), { status: 200 }],
  [
    "a note over 200 characters is rejected",
    () => putCapturedNote(randomUUID(), "a".repeat(201)),
    { status: 400, text: '"text_too_long"' },
  ],
  ["an empty note is rejected", () => putCapturedNote(randomUUID(), "   "), { status: 400, text: '"text_empty"' }],
  ["match page shows the notes", requestCapturedMatch, { status: 200, text: NOTE_TEXTS[0] }],
  ["a note is deleted", () => deleteCapturedNote(NOTE_IDS[0]), { status: 204 }],
  [
    "match page drops the deleted note",
    requestCapturedMatch,
    { status: 200, text: NOTE_TEXTS[1], absent: NOTE_TEXTS[0] },
  ],
  [
    "saving the first point bumps the revision",
    () => saveCapturedMatchLog(0, [PLAYER_POINT]),
    { status: 200, text: '"revision":1' },
  ],
  // A retry whose response was lost must succeed with the same revision, not report a conflict.
  [
    "retrying the same save returns the same revision",
    () => saveCapturedMatchLog(0, [PLAYER_POINT]),
    { status: 200, text: '"revision":1' },
  ],
  // The same lost response, with a point added since: the extension is saved, not reported as a conflict.
  [
    "a log extending the stored one is saved",
    () => saveCapturedMatchLog(0, [PLAYER_POINT, PLAYER_POINT]),
    { status: 200, text: '"revision":2' },
  ],
  [
    "a different log on a stale revision is a conflict",
    () => saveCapturedMatchLog(0, [OPPONENT_POINT]),
    { status: 409, text: '"conflict"' },
  ],
  [
    "unknown log action is rejected",
    () => saveCapturedMatchLog(1, [{ type: "bogus" }]),
    { status: 400, text: '"invalid_log"' },
  ],
  [
    "a point after the match ended is rejected",
    () => saveCapturedMatchLog(1, [...MATCH_WINNING_POINTS, PLAYER_POINT]),
    { status: 400, text: '"action_after_match_end"' },
  ],
  ["match page renders after saving the log", requestCapturedMatch, { status: 200 }],
  // The rejected saves above wrote nothing, so the stored log is still two points at revision 2.
  [
    "a manual game score is saved",
    () => saveCapturedMatchLog(2, [PLAYER_POINT, PLAYER_POINT, MANUAL_GAME_WON]),
    { status: 200, text: '"revision":3' },
  ],
  [
    "a game score impossible in the format is rejected",
    () => saveCapturedMatchLog(3, [PLAYER_POINT, PLAYER_POINT, MANUAL_GAME_IMPOSSIBLE]),
    { status: 400, text: '"invalid_game_score"' },
  ],
  [
    "new match form links the last match",
    () => request("/matches/new"),
    {
      status: 200,
      // Getter: the match id is captured by an earlier step, after this array is built.
      get text() {
        return `href="/matches/${matchAId}"`;
      },
    },
  ],
  [
    "unknown match format is rejected",
    () => startMatchForCapturedPlayer({ format: "custom" }),
    { status: 302, location: "/matches/new?error=format_invalid" },
  ],
  [
    "unknown advantage value is rejected",
    () => startMatchForCapturedPlayer({ with_advantage: "maybe" }),
    { status: 302, location: "/matches/new?error=advantage_invalid" },
  ],
  [
    "a short-set match without advantage starts",
    startAndCaptureShortMatch,
    {
      status: 302,
      get location() {
        return `/matches/${shortMatchId}`;
      },
    },
  ],
  [
    "a game won at 40:40 is accepted without advantage",
    () => saveShortMatchLog(0, [DECIDING_POINT_GAME]),
    { status: 200, text: '"revision":1' },
  ],
  [
    "advantage scores are rejected without advantage",
    () => saveShortMatchLog(1, [DECIDING_POINT_GAME, ADVANTAGE_GAME]),
    { status: 400, text: '"invalid_game_score"' },
  ],
  [
    "summary shows the result, goals and notes",
    () => requestSummary(matchAId),
    { status: 200, text: NOTE_TEXTS[1], absent: NOTE_TEXTS[0] },
  ],
  ["summary lists the observed goal", () => requestSummary(matchAId), { status: 200, text: EDITED_GOAL_TEXT }],
  [
    "summary of a match without a tournament offers the form",
    () => requestSummary(shortMatchId),
    { status: 200, text: 'name="tournament_name"' },
  ],
  [
    "an empty tournament name is rejected",
    () => fillTournamentName(shortMatchId, "   "),
    {
      status: 302,
      get location() {
        return `/matches/${shortMatchId}/summary?error=tournament_empty`;
      },
    },
  ],
  [
    "a missing tournament name is filled in",
    () => fillTournamentName(shortMatchId, FILLED_TOURNAMENT_NAME),
    {
      status: 302,
      get location() {
        return `/matches/${shortMatchId}/summary`;
      },
    },
  ],
  [
    "summary shows the filled-in name without the form",
    () => requestSummary(shortMatchId),
    { status: 200, text: FILLED_TOURNAMENT_NAME, absent: 'name="tournament_name"' },
  ],
  [
    "an existing tournament name is not replaced",
    () => fillTournamentName(shortMatchId, "Smoke Renamed"),
    {
      status: 302,
      get location() {
        return `/matches/${shortMatchId}/summary?error=tournament_already_set`;
      },
    },
  ],
  ["a match without a tournament starts", startAndCaptureUnnamedMatch, { status: 302, location: "/matches/" }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  // Account B checks that RLS hides and protects account A's players.
  [
    "signup creates second account",
    () => {
      jar.clear();
      return request("/api/auth/signup", { method: "POST", form: { email: emailB, password } });
    },
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin accepts second account",
    () => request("/api/auth/signin", { method: "POST", form: { email: emailB, password } }),
    { status: 302, location: "/" },
  ],
  ["players of first account are hidden from second", () => request("/players"), { status: 200, absent: PLAYER_NAME }],
  ["second account cannot rename first account's player", renameCapturedPlayer, { status: 404 }],
  [
    "second account cannot add a goal to another account's player",
    () => addGoalToCapturedPlayer("Smoke goal hijacked"),
    { status: 404 },
  ],
  ["second account cannot open another account's goals page", requestCapturedPlayerGoals, { status: 404 }],
  [
    "second account cannot end another account's goal",
    () => changeCapturedGoal(GOAL_TEXTS[0], { action: "end", text: "" }),
    {
      status: 302,
      get location() {
        return `/players/${playerAId}?error=goal_not_found`;
      },
    },
  ],
  ["second account cannot open first account's match", requestCapturedMatch, { status: 404 }],
  [
    "second account cannot save first account's match log",
    () => saveCapturedMatchLog(1, [PLAYER_POINT, PLAYER_POINT]),
    { status: 404, text: '"match_not_found"' },
  ],
  [
    "second account cannot start a match for first account's player",
    () => startMatchForCapturedPlayer({ tournament_name: TOURNAMENT_NAME }),
    { status: 302, location: "/matches/new?error=player_not_found" },
  ],
  ["second account has no last match", () => request("/matches/new"), { status: 200, absent: TOURNAMENT_NAME }],
  ["second account cannot open first account's summary", () => requestSummary(matchAId), { status: 404 }],
  [
    "second account cannot fill in first account's tournament name",
    () => fillTournamentName(unnamedMatchId, "Smoke Hijacked Cup"),
    {
      status: 302,
      get location() {
        return `/matches/${unnamedMatchId}/summary?error=tournament_already_set`;
      },
    },
  ],
  [
    "second account cannot add an observation to first account's match",
    () => putCapturedObservation(randomUUID()),
    { status: 404, text: '"match_not_found"' },
  ],
  [
    "second account cannot add a note to first account's match",
    () => putCapturedNote(randomUUID(), "Smoke note hijacked"),
    { status: 404, text: '"match_not_found"' },
  ],
  // RLS turns a foreign delete into zero rows, which reads like an already deleted entry.
  ["second account's delete of a foreign note is a no-op", () => deleteCapturedNote(NOTE_IDS[1]), { status: 204 }],
  [
    "second account's delete of a foreign observation is a no-op",
    () => deleteCapturedObservation(OBSERVATION_IDS[1]),
    { status: 204 },
  ],
  // Back as account A: the 404 above must mean RLS blocked the update, not that the route broke.
  [
    "signin accepts first account again",
    () => {
      jar.clear();
      return request("/api/auth/signin", { method: "POST", form: { email, password } });
    },
    { status: 302, location: "/" },
  ],
  [
    "first account's player keeps its name",
    () => request("/players"),
    { status: 200, text: PLAYER_NAME, absent: "Smoke Hijacked" },
  ],
  ["first account's goal stays active", requestCapturedPlayerGoals, { status: 200, text: EDITED_GOAL_TEXT }],
  ["first account's note survives the foreign delete", requestCapturedMatch, { status: 200, text: NOTE_TEXTS[1] }],
  [
    "first account's observation survives the foreign delete",
    requestCapturedMatch,
    { status: 200, text: OBSERVATION_IDS[1] },
  ],
  [
    "first account's match keeps its empty tournament name",
    () => requestSummary(unnamedMatchId),
    { status: 200, text: 'name="tournament_name"', absent: "Smoke Hijacked Cup" },
  ],
];

// Read-only checks: a sign-in attempt for an account that does not exist proves the Worker reaches Supabase.
const productionSteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["players redirects anonymous user", () => request("/players"), { status: 302, location: "/auth/signin" }],
  ["new match redirects anonymous user", () => request("/matches/new"), { status: 302, location: "/auth/signin" }],
  ["signin page renders", () => request("/auth/signin"), { status: 200 }],
  [
    "signin reaches Supabase",
    () =>
      request("/api/auth/signin", {
        method: "POST",
        form: { email: `smoke-probe-${Date.now()}@example.com`, password },
      }),
    { status: 302, location: "/auth/signin?error=Invalid%20login%20credentials" },
  ],
  // The middleware redirects before the route runs, so nothing is written.
  [
    "match log save redirects anonymous user",
    () =>
      request(`/api/matches/${randomUUID()}/log`, {
        method: "PUT",
        json: { base_revision: 0, events: [PLAYER_POINT] },
      }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "match summary redirects anonymous user",
    () => request(`/matches/${randomUUID()}/summary`),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "match note save redirects anonymous user",
    () => request(`/api/matches/${randomUUID()}/notes/${randomUUID()}`, { method: "PUT", json: { text: "probe" } }),
    { status: 302, location: "/auth/signin" },
  ],
];

const stepsByMode = { full: fullSteps, production: productionSteps };
const steps = Object.hasOwn(stepsByMode, MODE) ? stepsByMode[MODE] : null;
if (!steps) {
  console.log(`Unknown SMOKE_MODE "${MODE}", expected one of: ${Object.keys(stepsByMode).join(", ")}`);
  process.exit(1);
}
console.log(`Smoke mode: ${MODE} against ${BASE_URL}`);

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.text === undefined || actual.body.includes(expected.text)) &&
    (expected.absent === undefined || !actual.body.includes(expected.absent));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(
      `      expected ${expected.status} ${expected.location ?? ""}${expected.text ? ` with "${expected.text}"` : ""}${
        expected.absent ? ` without "${expected.absent}"` : ""
      }`,
    );
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
