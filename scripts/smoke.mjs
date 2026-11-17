// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_MODE=full (default) creates two accounts; SMOKE_MODE=production writes nothing and is the only mode safe for production.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const MODE = process.env.SMOKE_MODE ?? "full";
const runId = Date.now();
const email = `smoke-${runId}@example.com`;
const emailB = `smoke-${runId}-b@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
const PLAYER_NAME = "Smoke Player";
let playerAId;

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

const fullSteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["players redirects anonymous user", () => request("/players"), { status: 302, location: "/auth/signin" }],
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
];

// Read-only checks: a sign-in attempt for an account that does not exist proves the Worker reaches Supabase.
const productionSteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["players redirects anonymous user", () => request("/players"), { status: 302, location: "/auth/signin" }],
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
