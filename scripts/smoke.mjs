// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_MODE=full (default) creates two accounts, a player and a match; SMOKE_MODE=production writes nothing and is the only mode safe for production.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const MODE = process.env.SMOKE_MODE ?? "full";
const runId = Date.now();
const email = `smoke-${runId}@example.com`;
const emailB = `smoke-${runId}-b@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
const PLAYER_NAME = "Smoke Player";
const TOURNAMENT_NAME = "Smoke Cup";
let playerAId;
let matchAId;

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

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
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

// Starts a match for account A's player. Throws when the player id was not captured, so a missing id cannot pass as a rejected start.
function startMatchForCapturedPlayer(fields) {
  if (!playerAId) throw new Error("Player id of account A was not captured");
  return request("/api/matches", {
    method: "POST",
    form: { player_id: playerAId, tournament_name: "", format: "best_of_3_sets", first_server: "player", ...fields },
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

function requestCapturedMatch() {
  if (!matchAId) throw new Error("Match id of account A was not captured");
  return request(`/matches/${matchAId}`);
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
  ["new match form lists the player", () => request("/matches/new"), { status: 200, text: PLAYER_NAME }],
  ["starting a match redirects to the match", startAndCaptureMatch, { status: 302, location: "/matches/" }],
  ["match page shows the tournament", requestCapturedMatch, { status: 200, text: TOURNAMENT_NAME }],
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
    { status: 302, location: "/matches/new?error=" },
  ],
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
  ["second account cannot open first account's match", requestCapturedMatch, { status: 404 }],
  [
    "second account cannot start a match for first account's player",
    () => startMatchForCapturedPlayer({ tournament_name: TOURNAMENT_NAME }),
    { status: 302, location: "/matches/new?error=" },
  ],
  ["second account has no last match", () => request("/matches/new"), { status: 200, absent: TOURNAMENT_NAME }],
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
