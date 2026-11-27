# Awaria Supabase Auth nie wygląda jak wylogowanie — plan implementacji

## Overview

`src/middleware.ts` ignoruje `error` z `supabase.auth.getUser()`. Przerwa w Supabase Auth, przekroczony limit (429) albo błąd sieci w Workerze daje taki sam wynik jak brak sesji: `user = null`, a na chronionych trasach przekierowanie 302 do `/auth/signin`. Klient synchronizacji traktuje przekierowanie jako wygaśnięcie sesji. Rodzic widzi wtedy „Sesja wygasła”, a kolejki punktów i notatek stają. W logach nie ma żadnego śladu.

Ta zmiana rozróżnia oba przypadki. Awaria zostaje zapisana w logu, a na chronionych trasach zwraca 503, które klient ponawia. Brak sesji działa tak jak dziś.

Źródło: ustalenie P1 (przyczyna nr 2) w `context/audits/observability/2026-11-26_point-sync-notes-deletion.md`.

## Current State Analysis

- `src/middleware.ts:10-13` pobiera tylko `data.user`, a `error` przepada. `:18-21` przekierowuje każdego bez użytkownika z `PROTECTED_ROUTES`, także `/api/players` i `/api/matches`.
- auth-js zwraca `{ user: null, error }` dla każdego `AuthError` (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2721-2729`):
  - brak sesji: `name: "AuthSessionMissingError"`, status 400;
  - błąd sieci: `AuthRetryableFetchError` ze statusem 0 (`lib/fetch.js:28,120`);
  - Supabase 5xx/52x: `AuthRetryableFetchError` ze statusem odpowiedzi (`lib/fetch.js:37,43`);
  - 429 i inne 4xx: `AuthApiError` ze statusem;
  - nieprawidłowy token lub refresh token: `AuthApiError` albo `AuthInvalidJwtError` ze statusem 4xx. Oznacza to faktyczne wylogowanie.
- Klienci synchronizacji ponawiają 5xx: punkty przez `src/lib/services/match-sync.ts:120`, notatki przez `src/lib/services/match-notes.ts`, gałąź „reszta → retry”. Odpowiedź 503 z JSON-em `{ error: "auth_unavailable" }` da więc na ekranie „Błąd zapisu… (auth_unavailable), ponawiam” i automatyczne wznowienie, gdy Auth wróci.
- Zgodnie z CLAUDE.md czyste reguły trafiają do `src/lib/services/<obszar>.ts`, bez importów z Astro i Supabase. Tam też mają testy.

## Desired End State

- Czysta funkcja `classifyAuthError(error)` w `src/lib/services/auth.ts` zwraca jeden z wyników:
  - `ok` — brak błędu;
  - `signed_out` — brak sesji albo nieprawidłowy token (4xx inne niż 429);
  - `unavailable` — `AuthRetryableFetchError`, status 0, status ≥ 500 albo 429.
- Middleware:
  - **`signed_out` z `AuthSessionMissingError`** nie loguje niczego. To zwykły anonimowy ruch i dziś działa tak samo.
  - **`signed_out` z innym błędem** loguje `console.warn` z nazwą, statusem, kodem i ścieżką. Dalej działa jak dziś, czyli przekierowuje na chronionych trasach.
  - **`unavailable`** loguje `console.error` z nazwą, statusem, kodem, ścieżką i metodą. Na chronionej trasie zwraca 503 z nagłówkiem `Retry-After: 5`: dla `/api/*` JSON `{ "error": "auth_unavailable" }`, dla stron krótki tekst po polsku. Na trasie publicznej żądanie idzie dalej jako anonimowe.
- Gdy Auth wróci, kolejki punktów i notatek ruszają same, bez ponownego logowania.

### Key Discoveries:

- Nazwy błędów auth-js są stabilne i jawne, np. `AuthRetryableFetchError` (`lib/errors.js:217-219`) i `AuthSessionMissingError` (`:100-102`). Klasyfikacja po `name` i `status` nie wymaga importu z Supabase, więc funkcja jest czysta.
- Na chronionej stronie odpowiedź 503 zamiast przekierowania zostawia rodzica na stronie meczu. Po odświeżeniu, gdy Auth wróci, mecz działa dalej.

## What We're NOT Doing

- Endpointy `signin`, `signup` i `signout` (ustalenia P6 i P7) nie zmieniają się.
- `createClient` zwracający `null` przy braku sekretów (P5) nie zmienia się.
- Nie ma ponawiania `getUser` po stronie serwera. Ponawia klient.
- Treść komunikatów w UI klienta się nie zmienia. Kod `auth_unavailable` pojawia się w istniejącym „…, ponawiam”.

## Implementation Approach

Faza 1 jest test-first. Najpierw testy `classifyAuthError` dla każdego kształtu błędu z auth-js, potem sama funkcja. Faza 2 podłącza klasyfikację w middleware i wprowadza logi oraz 503.

## Phase 1: Klasyfikacja błędu Auth

### Overview

Czysta funkcja rozstrzyga, czy błąd z `getUser()` oznacza wylogowanie, czy niedostępność Supabase.

### Changes Required:

#### 1. Testy

**File**: `src/lib/services/auth.test.ts`

**Intent**: Testy regresji P1, które nie przechodzą przed implementacją. Przypadki:

- `null` → `ok`;
- `AuthSessionMissingError` (400) → `signed_out`;
- `AuthApiError` 401 i `AuthInvalidJwtError` 400 → `signed_out`;
- `AuthRetryableFetchError` ze statusem 0 i 503 → `unavailable`;
- `AuthApiError` 429 → `unavailable`;
- `AuthApiError` 500 → `unavailable`;
- `AuthUnknownError` bez statusu → `unavailable`, bo brak dowodu, że sesja jest zła.

**Contract**: import `describe`/`it`/`expect` z `vitest`, komentarz `// Regression (observability audit 2026-11-26, P1): …`.

#### 2. Funkcja

**File**: `src/lib/services/auth.ts`

**Intent**: Klasyfikacja po `name` i `status`, bez importów z Astro i Supabase.

**Contract**: `export type AuthOutcome = "ok" | "signed_out" | "unavailable";` oraz `export function classifyAuthError(error: { name: string; status?: number } | null): AuthOutcome`. Reguła: brak błędu → `ok`; `AuthRetryableFetchError`, brak statusu, status 0, 429 lub ≥ 500 → `unavailable`; pozostałe → `signed_out`.

### Success Criteria:

#### Automated Verification:

- Nowe testy nie przechodzą przed dodaniem funkcji: `npx vitest run src/lib/services/auth.test.ts`
- Po zmianie wszystkie testy jednostkowe przechodzą: `npm test`
- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`

---

## Phase 2: Middleware loguje awarię i zwraca 503

### Overview

Middleware używa klasyfikacji. Awaria jest widoczna w logu i ponawiana przez klienta, a nie zamieniana w „Sesja wygasła”.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: Odczytać `error` z `getUser()` i sklasyfikować go. Przy `unavailable` zalogować błąd i na chronionej trasie zwrócić 503. Przy `signed_out` z błędem innym niż brak sesji zalogować ostrzeżenie. Reszta zachowania bez zmian.

**Contract**:

- Log awarii: `console.error("Supabase Auth unavailable", { name, status, code, path, method })`. Ostrzeżenie: `console.warn("Supabase Auth rejected the session", { name, status, code, path })`. Bez maila i bez tokenów.
- Na chronionej trasie przy `unavailable`: `503`, nagłówek `Retry-After: 5`. Dla `/api/` w JSON (`Content-Type: application/json`, `{ "error": "auth_unavailable" }`), w pozostałych przypadkach `text/plain; charset=utf-8` z tekstem „Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.”
- `context.locals.user` pozostaje `null` przy każdym błędzie.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Przy `npm run dev` z zatrzymanym lokalnym Supabase (`npx supabase stop`) i zalogowaną sesją w przeglądarce trwający mecz pokazuje „…(auth_unavailable), ponawiam” zamiast „Sesja wygasła”, a w terminalu jest linia `Supabase Auth unavailable`. Po `npx supabase start` punkty zapisują się bez ponownego logowania.
- Wylogowany użytkownik na `/matches` nadal trafia na `/auth/signin`.

---

## Testing Strategy

### Unit Tests:

- `classifyAuthError` dla każdego kształtu błędu z auth-js.

### Manual Testing Steps:

1. Zaloguj się w `npm run dev` i otwórz trwający mecz.
2. Uruchom `npx supabase stop` i zapisz punkt. Powinien pojawić się status „ponawiam” i log `Supabase Auth unavailable`.
3. Uruchom `npx supabase start`. Punkt zapisuje się sam.
4. Wyloguj się i wejdź na `/matches`. Powinno nastąpić przekierowanie do logowania.

## References

- Audyt: `context/audits/observability/2026-11-26_point-sync-notes-deletion.md` (P1, przyczyna nr 2)
- auth-js: `node_modules/@supabase/auth-js/dist/module/lib/errors.js`, `lib/fetch.js`, `GoTrueClient.js:2721-2729`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Klasyfikacja błędu Auth

#### Automated

- [x] 1.1 Nowe testy nie przechodzą przed dodaniem funkcji — 023467d
- [x] 1.2 Po zmianie wszystkie testy jednostkowe przechodzą — 023467d
- [x] 1.3 Typy przechodzą — 023467d
- [x] 1.4 Lint przechodzi — 023467d

### Phase 2: Middleware loguje awarię i zwraca 503

#### Automated

- [x] 2.1 Typy przechodzą
- [x] 2.2 Lint przechodzi
- [x] 2.3 Testy jednostkowe przechodzą
- [x] 2.4 Build przechodzi

#### Manual

- [x] 2.5 Zatrzymany Supabase daje „ponawiam” i log Supabase Auth unavailable, a po starcie punkty zapisują się bez logowania
- [x] 2.6 Wylogowany użytkownik na /matches trafia na /auth/signin
