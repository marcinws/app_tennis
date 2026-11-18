# Zapis punktów w pierwszym formacie — plan implementacji

## Overview

Strona `/matches/<id>` staje się ekranem zapisu meczu. Rodzic dotyka „Punkt dla …”, a wynik (sety, gemy, punkty, tie-break) i podpowiedź serwującego zmieniają się od razu. Może cofać akcje aż do początku meczu i poprawić serwującego. Każde dotknięcie zapisuje się najpierw na telefonie, a w tle trafia do Supabase, więc przy słabej lub zanikającej sieci zapisane punkty nie przepadają (US-01, FR-004, FR-005, FR-008, FR-010, FR-011, NFR-200ms, NFR-android).

To wycinek S-03 z `context/foundation/roadmap.md` (gwiazda przewodnia). Praca idzie na gałęzi `point-scoring-first-format` z pull requestem. Migracja trafia na produkcję przez `npx supabase db push` przed merge, a merge na `main` wdraża kod (`CLAUDE.md`, `context/deployment/deploy-plan.md` 3.5).

## Current State Analysis

- `src/lib/services/scoring.ts` zawiera tylko `pointLabel` (0/15/30/40) z testem. Reguł gema, seta, tie-breaka, końca meczu i serwującego nie ma.
- `src/lib/services/matches.ts` — `MATCH_FORMATS` (jeden format `best_of_3_sets`), `FIRST_SERVERS = ["player", "opponent"]`, typ `FirstServer`. Moduł jest czysty, bez importów z Astro i Supabase.
- `public.matches`:
  - Kolumny: `id, owner_id, player_id, tournament_name, format, with_advantage (default true), first_server, created_at`.
  - Polityki `matches_select_own` i `matches_insert_own` z `(select auth.uid())`.
  - Uprawnienia: `authenticated` ma `select` na tabelę i `insert` tylko na 4 kolumny. Nie ma `update` ani `delete`, a `anon` nie ma nic (`supabase/migrations/20261117140000_create_matches.sql`, `20261117160000_restrict_columns_and_rls_initplan.sql`).
- `src/pages/matches/[id].astro` — strona w czystym Astro z danymi startu. Robi `.maybeSingle().overrideTypes<Match | null>()`, a cudzy mecz daje 404.
- `src/middleware.ts:4,19-22` — niezalogowany na `/api/matches/*` dostaje **302 na `/auth/signin`**. `fetch` domyślnie podąża za przekierowaniem i zwraca 200 z HTML logowania, więc wygasła sesja wyglądałaby jak udany zapis.
- Trasy domenowe (`src/pages/api/players/*`, `src/pages/api/matches/index.ts`) przyjmują formularze i odpowiadają przekierowaniem. Trasy JSON jeszcze nie ma.
- Wyspy React: tylko formularze logowania (`src/components/auth/SignInForm.tsx`, `client:load` w `src/pages/auth/signin.astro:14`). Katalog `src/components/hooks/` nie istnieje.
- `vitest.config.ts` — `environment: "node"`, pliki `src/**/*.test.ts`. Bez jsdom, więc logikę hooka i wyspy trzeba trzymać w czystych funkcjach w `src/lib/services/`.
- `scripts/smoke.mjs`:
  - Helper `request` wysyła tylko formularze.
  - Tryb `full` ma 30 kroków (konta A i B, `matchAId` przechwycony z przekierowania), tryb `production` ma 6 kroków.
- Brak Dockera lokalnie, więc bazę sprawdza smoke w CI. Lokalny `npm run dev` łączy się z produkcyjnym Supabase, więc ekranu nie da się przeklikać przed `db push`.
- `context/foundation/lessons.md`:
  - „Uprawnienia tylko na kolumny z formularza” — dotyczy wprost dodania `update` na `matches`.
  - „Ustawienia projektu Supabase poza repo” — sprawdzić ustawienia produkcji przed wdrożeniem.

## Desired End State

- Na `/matches/<id>` rodzic ma:
  - dwa duże przyciski „Punkt dla <imię>” i „Punkt dla przeciwnika”;
  - „Cofnij”, które działa aż do pustego meczu;
  - „Zmień serwującego”;
  - tablicę wyniku: zakończone sety z wynikiem tie-breaka, gemy bieżącego seta, punkty gema 0/15/30/40/AD albo punkty tie-breaka;
  - oznaczenie, kto serwuje.

  Nowy wynik pojawia się bez czekania na sieć.

- Po wygraniu drugiego seta przyciski punktów i „Zmień serwującego” są zablokowane, ekran pokazuje „Mecz zakończony” ze zwycięzcą, a „Cofnij” nadal działa.
- Pełny przebieg (lista akcji) jest w `localStorage` telefonu i w `matches.events` z numerem `matches.revision`. Linia stanu pokazuje jeden ze stanów:
  - „Zapisano”;
  - „Czeka na sieć — punkty są na telefonie”;
  - „Błąd zapisu …, ponawiam”;
  - „Sesja wygasła …”;
  - „Serwer odrzucił zapis …”.
- Gdy inny telefon zapisał ten mecz w międzyczasie, ekran pokazuje „Mecz zmieniono na innym telefonie” z wyborem „Wczytaj wersję z serwera” albo „Zachowaj mój zapis”.
- Po przeładowaniu strony z siecią niezsynchronizowany przebieg z telefonu ma pierwszeństwo przed wersją z serwera.
- `authenticated` ma `update` tylko na `events` i `revision` oraz politykę `matches_update_own` z `(select auth.uid())`. Konto B nie zapisze przebiegu meczu A.
- Smoke `full` w CI dowodzi:
  - zapisu;
  - idempotentnego ponowienia;
  - 409 przy konflikcie;
  - 400 dla błędnego przebiegu i dla punktu po końcu meczu;
  - 404 dla konta B.

  Test na Androidzie w trybie samolotowym potwierdza FR-011.

### Key Discoveries:

- `src/middleware.ts:19-22` — 302 dla niezalogowanego, więc klient musi wysyłać `redirect: "manual"` i traktować `response.type === "opaqueredirect"` jako wygasłą sesję.
- `src/pages/api/matches/index.ts:6-8,52-60` — wzorzec mapowania kodu błędu Postgresa i logowania z komentarzem `no-console`.
- `src/pages/matches/[id].astro:23-35` — zapytanie meczu, do rozszerzenia o `events, revision`.
- `src/lib/services/matches.ts:1-9` — format i serwujący jako stałe z typami; reguły formatu mają się z nimi zgadzać.
- `supabase/migrations/20261117160000_restrict_columns_and_rls_initplan.sql` — wzorzec `grant … (kolumny)` i polityk z `(select auth.uid())`.
- `scripts/smoke.mjs:31-43,60-88` — `request`, `startAndCaptureMatch`, `matchAId`.

## What We're NOT Doing

- Service worker i otwieranie strony meczu bez sieci. Zapis bez sieci działa, dopóki karta jest otwarta. Jeśli przeglądarka ją zamknie bez sieci, punkty z telefonu wrócą po ponownym otwarciu z siecią (PRD Non-Goals: brak pełnego offline).
- Osobna tabela zdarzeń punktów i kolejka pojedynczych wstawień i usunięć. Cały przebieg leży w jednej kolumnie `jsonb`.
- Scalanie przebiegów z dwóch telefonów. Konflikt jest wykrywany, a rodzic wybiera jedną wersję.
- Ponawianie cofniętej akcji („redo”) i limit głębokości cofania.
- Przycisk „Zakończ mecz” i kolumna statusu. Koniec meczu wynika z przebiegu.
- Ręczny wynik gema i lista gemów (S-04), pozostałe formaty i przełącznik przewag w UI (S-05). Reguły obsługują grę bez przewag, bo kolumna `with_advantage` już jest, ale formularz startu dalej zapisuje `true`.
- Playwright i test E2E utraty sieci (zostaje jako dalsza praca z rejestru ryzyk w `context/foundation/infrastructure.md`). FR-011 sprawdzają testy jednostkowe kolejki, smoke trasy i test na telefonie.
- Zmiana `src/middleware.ts`.
- Testy komponentów React (brak jsdom). Logika wyspy siedzi w testowanych czystych funkcjach.

## Implementation Approach

Od dołu, jak w S-01 i S-02:

1. czyste reguły wyniku z testami;
2. schemat i trasa zapisu;
3. ekran z kolejką na telefonie;
4. smoke i wdrożenie w kolejności migracja → kod.

Źródłem prawdy jest **lista akcji** (`point` z wygrywającym albo `switch_server`). Stan meczu zawsze powstaje z jej odtworzenia, więc:

- cofanie usuwa ostatnią akcję;
- poprawka serwującego też jest akcją i da się ją cofnąć;
- trasa może sprawdzić przebieg tymi samymi regułami co ekran.

Mecz to kilkaset akcji, więc odtworzenie przy każdym dotknięciu mieści się z zapasem w 200 ms.

Synchronizacja działa jak optymistyczna blokada na `revision`:

- Klient wysyła cały przebieg i `base_revision`, czyli numer, na którym go zbudował.
- Trasa zapisuje warunkowo `where revision = base` i ustawia `base + 1`.
- Jeśli numer w bazie jest inny, trasa porównuje przebiegi. Identyczny oznacza ponowione żądanie, którego odpowiedź zginęła, i daje sukces z obecnym numerem. Inny daje 409 z wersją z serwera.

Na telefonie w locie jest najwyżej jedno żądanie. Po odpowiedzi klient wysyła ponownie, jeśli przebieg zmienił się w międzyczasie. Przy braku sieci i błędach 5xx ponawia z rosnącym opóźnieniem, a także po zdarzeniu `online` i po powrocie do karty.

Reguły formatu (gemy w secie, tie-break, sety do wygrania) są konfiguracją przypisaną do `MatchFormatId`, więc S-05 dopisze formaty bez zmiany silnika.

## Critical Implementation Details

- **Kolejność wdrożenia** — migracja musi być na produkcji przed merge na `main`, bo strona meczu wybiera `events, revision`. Migracja jest addytywna, z domyślnymi `'[]'` i `0`, więc obecny kod działa na nowym schemacie, a istniejące mecze z S-02 stają się meczami bez punktów.
- **`check` na `jsonb`** — Postgres nie gwarantuje kolejności sprawdzania warunków połączonych `and`, a `jsonb_array_length` rzuca błąd dla nie-tablicy. Ograniczenie musi mieć postać `case when jsonb_typeof(events) = 'array' then jsonb_array_length(events) <= 2000 else false end`.
- **Wygasła sesja** — `fetch(…, { redirect: "manual" })`. Przekierowanie z middleware daje odpowiedź `opaqueredirect` ze statusem 0. Klient nie może jej uznać za sukces ani za brak sieci.
- **Kolejność zapisu na telefonie** — każda akcja trafia do `localStorage` synchronicznie, zanim zmieni się stan Reacta i zanim ruszy żądanie. Dzięki temu zamknięcie karty zaraz po dotknięciu nie gubi punktu.
- **Pierwszeństwo przy starcie** — przebieg z telefonu oznaczony jako niezsynchronizowany wygrywa z wersją z serwera, nawet gdy serwer ma wyższy `revision`. Ewentualny konflikt wychodzi przy pierwszej synchronizacji jako 409, a nie jako ciche nadpisanie.

## Phase 1: Reguły wyniku i serwującego

### Overview

Czyste funkcje odtwarzają stan meczu z listy akcji według formatu i pierwszego serwującego. Obsługują gem z przewagą i bez, set, tie-break, koniec meczu, rotację i poprawkę serwującego oraz odczyt przebiegu z niezaufanego wejścia. Wszystko jest pokryte testami.

### Changes Required:

#### 1. Silnik wyniku

**File**: `src/lib/services/scoring.ts`

**Intent**: Jedno miejsce reguł wyniku, używane przez ekran (każde dotknięcie) i trasę (sprawdzenie przebiegu przed zapisem), bez importów z Astro i Supabase. Istniejące `pointLabel` zostaje.

**Contract**:

- `type Side = FirstServer` (`import type` z `./matches`).
- `type MatchAction = { type: "point"; winner: Side } | { type: "switch_server" }`.
- `MAX_MATCH_ACTIONS = 2000` z komentarzem, że wartość musi być równa `check` na `matches.events` w migracji z fazy 2.
- `interface ScoringRules { gamesPerSet: number; tiebreakAt: number; tiebreakTo: number; setsToWin: number }` oraz `FORMAT_RULES: Record<MatchFormatId, ScoringRules>` z `best_of_3_sets: { gamesPerSet: 6, tiebreakAt: 6, tiebreakTo: 7, setsToWin: 2 }`. Typ `Record` wymusza wpis dla każdego formatu z S-05.
- `interface MatchSetup { format: MatchFormatId; withAdvantage: boolean; firstServer: Side }`.
- `interface MatchState`:
  - `sets: { player: number; opponent: number; tiebreak: { player: number; opponent: number } | null }[]` — zakończone sety;
  - `games: { player; opponent }` — bieżący set;
  - `points: { player; opponent }` — bieżący gem albo tie-break;
  - `inTiebreak: boolean`;
  - `server: Side`;
  - `winner: Side | null`.
- `replayMatch(setup, actions: readonly MatchAction[])` → `{ ok: true; state: MatchState } | { ok: false; error: "action_after_match_end"; index: number }`.
- Reguły:
  - Gem z przewagami: wygrywa ten, kto ma co najmniej 4 punkty i 2 punkty przewagi.
  - Gem bez przewag: wygrywa pierwszy do 4, więc przy 3:3 rozstrzyga następny punkt.
  - Set: wygrywa ten, kto ma `gamesPerSet` gemów i 2 gemy przewagi (6:4, 7:5). Przy `tiebreakAt:tiebreakAt` gra się tie-break do `tiebreakTo`, zawsze z 2 punktami przewagi, a set kończy się 7:6.
  - Mecz: wygrywa ten, kto pierwszy zdobędzie `setsToWin` setów. Każda akcja po wyłonieniu zwycięzcy, także `switch_server`, daje błąd z jej indeksem.
- Serwujący:
  - Zmienia się co gem.
  - W tie-breaku pierwszy punkt serwuje ten, na kogo przypada kolej, potem zmiana co 2 punkty (A, B, B, A, A, …).
  - Gem po tie-breaku (pierwszy gem nowego seta) serwuje ten, kto odbierał pierwszy punkt tie-breaka.
  - `switch_server` odwraca serwującego od tego miejsca. Bieżący i każdy późniejszy gem lub punkt tie-breaka liczy się od poprawionego.
- `gamePointLabels(state, withAdvantage)` → `{ player: string; opponent: string }`:
  - w tie-breaku liczby;
  - w gemie 0/15/30/40;
  - przy równowadze od 3:3 „40”/„40”;
  - przewaga „AD”/„40” (tylko z przewagami).
- `parseMatchActions(raw: unknown)` → `{ ok: true; actions: MatchAction[] } | { ok: false }`. Wejście musi być tablicą o długości najwyżej `MAX_MATCH_ACTIONS`, a każdy element jednym z dwóch kształtów. Funkcja przepisuje tylko znane pola. Kod jest ręczny, bez `zod`, bo moduł nie importuje z Astro.
- `sameActions(a, b): boolean` — porównanie dwóch przebiegów element po elemencie.

#### 2. Testy reguł

**File**: `src/lib/services/scoring.test.ts`

**Intent**: Zablokować reguły tenisowe testami, zanim powstanie ekran (ryzyko F-01). Istniejące testy `pointLabel` zostają.

**Contract**: przypadki (pomocnik budujący akcje, np. `points("player", 4)`):

- Gem:
  - 4:0 kończy gem;
  - 3:3 → AD → 40:40 → dwa punkty kończą gem;
  - bez przewag 3:3 i jeden punkt kończy gem.
- Etykiety:
  - 0/15/30/40;
  - 40:40;
  - AD/40;
  - bez przewag przy 3:3 „40”/„40”;
  - tie-break pokazuje liczby.
- Set:
  - 6:4 kończy set;
  - 5:5 → 7:5;
  - 6:6 włącza tie-break;
  - tie-break 7:5 daje set 7:6 z `tiebreak: { 7, 5 }`;
  - tie-break 6:6 → 8:6.
- Mecz:
  - 2:0 w setach daje zwycięzcę;
  - przy 1:1 trwa trzeci set;
  - punkt po zakończeniu daje `action_after_match_end` z indeksem;
  - to samo dla `switch_server`.
- Serwujący:
  - zmienia się co gem od `firstServer`;
  - kolejność w tie-breaku A, B, B, A, A;
  - pierwszy gem po tie-breaku serwuje odbierający pierwszy punkt tie-breaka;
  - `switch_server` odwraca bieżący i następne gemy;
  - `switch_server` w tie-breaku odwraca bieżący punkt i dalszą kolejność;
  - odcięcie ostatniej akcji (cofnięcie) przywraca poprzedni stan.
- `parseMatchActions`:
  - poprawna lista;
  - nie-tablica;
  - 2001 elementów;
  - nieznany `type`;
  - `point` bez `winner` albo z `winner: "both"`;
  - dodatkowe pola są pomijane.
- `sameActions`: równe, różna długość, różny zwycięzca.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie reguły przewag (gem kończy się przy 4 punktach bez 2 punktów przewagi) daje czerwony `npx vitest run src/lib/services/scoring.test.ts`; zmiana cofnięta
- Celowe zepsucie kolejności serwującego w tie-breaku (zmiana co punkt) daje czerwony `npx vitest run src/lib/services/scoring.test.ts`; zmiana cofnięta
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Faza nie ma kroków ręcznych.

---

## Phase 2: Migracja i trasa zapisu przebiegu

### Overview

Mecz przechowuje przebieg i jego numer. Właściciel może je zmieniać tylko przez dwie kolumny, a trasa JSON zapisuje przebieg warunkowo, z obsługą ponowień i konfliktów, bez ukrywania błędów.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_match_events.sql` (nowy; znacznik czasu późniejszy niż `20261117160000`)

**Intent**: Miejsce na przebieg meczu z uprawnieniem do zmiany tylko tych kolumn, które wysyła trasa (lekcja „Uprawnienia tylko na kolumny z formularza”).

**Contract**:

- `alter table public.matches add column events jsonb not null default '[]'::jsonb` z `check (case when jsonb_typeof(events) = 'array' then jsonb_array_length(events) <= 2000 else false end)` (patrz Critical Implementation Details).
- `add column revision integer not null default 0 check (revision >= 0)`.
- `grant update (events, revision) on public.matches to authenticated` z komentarzem, że pozostałe kolumny zostają bez `update`.
- `create policy matches_update_own on public.matches for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))`.
- Brak polityki `delete` i brak zmian dla `anon`.

#### 2. Typ meczu

**File**: `src/types.ts`

**Intent**: Strona meczu wybiera przebieg i numer.

**Contract**: `Match` dostaje `events: unknown` (odczytywane przez `parseMatchActions`, bo baza pilnuje tylko tego, że to tablica) i `revision: number`.

#### 3. Trasa zapisu przebiegu

**File**: `src/pages/api/matches/[id]/log.ts` (nowy)

**Intent**: Zapis całego przebiegu z telefonu. Ponowienie jest bezpieczne, konflikt z innym telefonem jest jawny, a błędny przebieg odrzucony regułami z fazy 1.

**Contract**: `PUT: APIRoute`, odpowiedzi JSON (`Content-Type: application/json`):

- `id` walidowany `z.uuid()`; błędny → `404 { error: "match_not_found" }`.
- Ciało walidowane `z.object({ base_revision: z.number().int().nonnegative(), events: z.unknown() })` z `astro/zod`. Błędny JSON albo kształt → `400 { error: "invalid_body" }`. `parseMatchActions(events)` nie przechodzi → `400 { error: "invalid_log" }`.
- Brak klienta → `500 { error: "not_configured" }`.
- Odczyt meczu (`format, with_advantage, first_server, events, revision`, `.maybeSingle()`):
  - `null` (cudzy lub nieistniejący, RLS) → `404 { error: "match_not_found" }`;
  - zapisany `format` spoza `MATCH_FORMATS` → log i `500`.
- `replayMatch` na wysłanym przebiegu nie przechodzi → `400 { error: "action_after_match_end" }`.
- Zapis: `update({ events, revision: base_revision + 1 }).eq("id", id).eq("revision", base_revision).select("revision").maybeSingle()`:
  - wiersz zwrócony → `200 { revision }`;
  - brak wiersza (inny numer w bazie) → ponowny odczyt `events, revision`. Gdy `sameActions(stored, sent)` → `200 { revision: stored.revision }` (ponowienie, którego odpowiedź zginęła). W przeciwnym razie `409 { error: "conflict", revision, events }`.
- Każdy błąd Supabase → `console.error` (komentarz `no-console` z powodem jak w `src/pages/api/matches/index.ts`) i `500 { error: "save_failed" }`.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Migracja nadaje `update` tylko na dwie kolumny i dodaje politykę `update`: plik zawiera `grant update (events, revision)`, `for update to authenticated` i `(select auth.uid())`, a nie zawiera `grant update on`
- Limit długości zgodny z kodem: `grep -n "2000"` znajduje wartość w migracji i `MAX_MATCH_ACTIONS` w `src/lib/services/scoring.ts`

**Implementation Note**: Zachowanie trasy na prawdziwej bazie sprawdza smoke w fazie 4.

---

## Phase 3: Ekran zapisu z kolejką na telefonie

### Overview

Strona meczu renderuje wyspę React, która zapisuje każdą akcję na telefonie i synchronizuje przebieg w tle. Decyzje kolejki są czystymi funkcjami z testami.

### Changes Required:

#### 1. Reguły kolejki na telefonie

**File**: `src/lib/services/match-sync.ts` (nowy)

**Intent**: Wszystkie decyzje synchronizacji, które da się sprawdzić bez przeglądarki: co wczytać przy starcie, jak potraktować odpowiedź serwera, kiedy ponowić.

**Contract**:

- `interface StoredMatchLog { version: 1; actions: MatchAction[]; baseRevision: number; pending: boolean }` oraz `storageKey(matchId)` → `"match-log:<id>"`.
- `serializeStoredLog(log): string`.
- `parseStoredLog(raw: string | null)` → `{ ok: true; log: StoredMatchLog | null } | { ok: false }`. `null` oznacza brak kopii, a `ok: false` uszkodzoną kopię (przebieg czytany przez `parseMatchActions`).
- `chooseInitialLog(local: StoredMatchLog | null, server: { actions: MatchAction[]; revision: number })` → `StoredMatchLog`:
  - kopia z telefonu z `pending: true` wygrywa zawsze;
  - w przeciwnym razie wygrywa wersja z serwera (`pending: false`, `baseRevision = server.revision`).
- `interpretSyncResponse(response: { kind: "network_error" } | { kind: "redirect" } | { kind: "http"; status: number; body: unknown })` → jedno z:
  - `{ kind: "saved"; revision }` (200);
  - `{ kind: "conflict"; server: { actions; revision } }` (409 z poprawnym ciałem);
  - `{ kind: "unauthorized" }` (przekierowanie, 401);
  - `{ kind: "rejected"; error: string }` (400, 404 — bez ponawiania);
  - `{ kind: "retry"; reason: string }` (brak sieci, 5xx, nieczytelne ciało).
- `retryDelayMs(attempt: number)` → 1 s, 2 s, 4 s, …, najwyżej 30 s.

#### 2. Testy kolejki

**File**: `src/lib/services/match-sync.test.ts` (nowy)

**Intent**: Dowód, że punkty nie przepadają w przypadkach brzegowych FR-011.

**Contract**:

- `chooseInitialLog`:
  - kopia `pending` wygrywa z serwerem o wyższym `revision`;
  - kopia bez `pending` przegrywa z serwerem;
  - brak kopii → serwer.
- `parseStoredLog`: `null`, poprawna kopia, uszkodzony JSON, zła wersja, błędny przebieg.
- `interpretSyncResponse`:
  - 200 → `saved`;
  - 409 z ciałem → `conflict`;
  - 409 bez ciała → `retry`;
  - przekierowanie → `unauthorized`;
  - 400 i 404 → `rejected`;
  - 500 i `network_error` → `retry`.
- `retryDelayMs`: rośnie i nie przekracza 30 s.
- Ten sam przebieg z serializacji i parsowania wraca równy (`sameActions`).

#### 3. Hook przebiegu meczu

**File**: `src/components/hooks/useMatchLog.ts` (nowy)

**Intent**: Stan przebiegu na ekranie, trwały zapis na telefonie i synchronizacja w tle, zgodnie z regułami z `match-sync.ts`.

**Contract**:

- `useMatchLog({ matchId, initialActions, initialRevision })` zwraca:
  - `actions`;
  - `status: "saved" | "waiting" | "error" | "unauthorized" | "rejected" | "conflict"` z opcjonalnym `detail`;
  - `record(action)`;
  - `undo()`;
  - `keepServer()`;
  - `keepMine()`.
- Start: `parseStoredLog(localStorage)` i `chooseInitialLog`. Uszkodzona kopia → `console.error`, odłożenie surowej wartości pod `match-log:<id>:corrupt`, start z serwera.
- `record`/`undo`: najpierw zapis `{ pending: true }` do `localStorage` (synchronicznie), potem stan. Wyjątek `localStorage` (np. tryb prywatny) → `console.error` i `status: "error"` z opisem „nie można zapisać na telefonie”, a synchronizacja działa dalej.
- Synchronizacja:
  - najwyżej jedno żądanie w locie: `fetch("/api/matches/<id>/log", { method: "PUT", redirect: "manual", body: { base_revision, events } })`;
  - po `saved` ustawia `baseRevision`, a `pending: false` tylko wtedy, gdy przebieg nie zmienił się od wysłania (inaczej wysyła ponownie);
  - `retry` → timer `retryDelayMs`, a także natychmiast po `online` i po `visibilitychange` na widoczną kartę;
  - `unauthorized` i `rejected` zatrzymują ponawianie do następnej akcji albo przeładowania.
- Konflikt:
  - `keepServer()` zastępuje przebieg wersją z serwera (`pending: false`);
  - `keepMine()` ustawia `baseRevision` na numer serwera i wysyła ponownie.
- Sprzątanie timerów i nasłuchów przy odmontowaniu.

#### 4. Wyspa zapisu meczu

**File**: `src/components/match/MatchRecorder.tsx` (nowy)

**Intent**: Ekran meczu dla rodzica na korcie: jedno dotknięcie na punkt, wynik i serwujący zawsze widoczne, cofanie pod ręką (FR-005 Socrates).

**Contract**:

- Propsy: `matchId`, `playerName`, `format: MatchFormatId`, `withAdvantage`, `firstServer: Side`, `initialActions: MatchAction[]`, `initialRevision: number`.
- Stan z `useMatchLog`. Wynik z `replayMatch` (memo po `actions`) i `gamePointLabels`. Gdyby przebieg z telefonu nie przechodził `replayMatch`, wyspa pokazuje błąd zamiast wyniku, bez cichego obcinania.
- Tablica wyniku:
  - dwa wiersze (imię zawodnika, „Przeciwnik”);
  - kolumny zakończonych setów z małym wynikiem tie-breaka, gemy bieżącego seta, punkty;
  - kropka przy serwującym i tekst „Serwuje: …”.
- Przyciski:
  - „Punkt dla <imię>” i „Punkt dla przeciwnika” — duże (co najmniej `min-h-24`), pełna szerokość na telefonie;
  - „Cofnij” — wyłączony przy pustym przebiegu;
  - „Zmień serwującego”.
- Po wyłonieniu zwycięzcy: „Mecz zakończony — wygrywa …”, punkty i zmiana serwującego wyłączone, „Cofnij” aktywne.
- Linia stanu `role="status"`:
  - „Zapisano”;
  - „Czeka na sieć — punkty są na telefonie”;
  - „Błąd zapisu (…), ponawiam”;
  - „Sesja wygasła — zaloguj się ponownie, punkty są na telefonie”;
  - „Serwer odrzucił zapis (…)”.
- Konflikt jako `role="alert"`: „Mecz zmieniono na innym telefonie” z przyciskami „Wczytaj wersję z serwera” i „Zachowaj mój zapis”.
- Klasy łączone przez `cn()`, wygląd jak karty na `src/pages/matches/[id].astro`, komponent `Button` z `src/components/ui/button.tsx`.

#### 5. Strona meczu

**File**: `src/pages/matches/[id].astro`

**Intent**: Strona meczu podaje wyspie dane startu i przebieg z serwera.

**Contract**:

- Zapytanie wybiera dodatkowo `events, revision`.
- `parseMatchActions(match.events)` nie przechodzi albo `format` spoza `MATCH_FORMATS` → log i `500` „Nie udało się wczytać meczu”.
- Nad danymi startu `<MatchRecorder client:load … />`. Dane startu (turniej, format, pierwszy serwujący, data) i odnośnik „Nowy mecz” zostają pod wyspą.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie pierwszeństwa w `chooseInitialLog` (serwer wygrywa z kopią `pending`) daje czerwony `npx vitest run src/lib/services/match-sync.test.ts`; zmiana cofnięta
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Klient nie podąża za przekierowaniem: `grep -n "redirect: \"manual\"" src/components/hooks/useMatchLog.ts`

**Implementation Note**: Bez migracji na produkcji ekranu nie da się przeklikać lokalnie (dev łączy się z produkcyjnym Supabase). Zachowanie end-to-end sprawdza faza 4.

---

## Phase 4: Smoke, ustawienia produkcji i wdrożenie

### Overview

Smoke w CI dowodzi zachowania trasy zapisu i izolacji między kontami. Ustawienia produkcji są sprawdzone według lekcji, zmiana trafia na produkcję w kolejności migracja → kod, a test na Androidzie potwierdza zapis bez sieci.

### Changes Required:

#### 1. Smoke zapisu przebiegu

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić trasę, `check`, uprawnienia na kolumny i RLS na prawdziwej bazie w CI.

**Contract**:

- `request` przyjmuje opcję `json` (ciało `JSON.stringify`, `Content-Type: application/json`). Helper zapisu przebiegu meczu `matchAId` rzuca wyjątek, gdy `matchAId` nie został przechwycony (jak `startMatchForCapturedPlayer`).
- Tryb `full`, konto A, po „match page shows the tournament”:
  - `PUT` z `base_revision: 0` i jednym punktem zawodnika → 200 z `"revision":1`;
  - to samo ponownie → 200 z `"revision":1` (ponowienie);
  - `base_revision: 0` z punktem przeciwnika → 409 z `"conflict"`;
  - `events: [{ "type": "bogus" }]` → 400 z `"invalid_log"`;
  - 48 punktów zawodnika i jeden więcej z `base_revision: 1` → 400 z `"action_after_match_end"`;
  - strona meczu → 200.
- Konto B, po „second account cannot open first account's match”: `PUT` na mecz A z `base_revision: 1` → 404 z `"match_not_found"`.
- Tryb `production`: niezalogowany `PUT` na losowy UUID → 302 na `/auth/signin` (bez zapisu).

#### 2. Dziennik wdrożeń

**File**: `context/deployment/deploy-plan.md`

**Intent**: Ślad wdrożenia S-03.

**Contract**: Wiersz w „Dziennik wdrożeń” z datą, ID wersji, commitem merge i wynikiem smoke produkcyjnego.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- Lint przechodzi: `npm run lint`
- CI dla PR zielone (`ci` i `smoke`, w tym kroki zapisu przebiegu i konta B): `gh pr checks <nr> --watch`

#### Manual Verification:

- Migracja na produkcji: `[Ty]` `npx supabase db push`, `[Claude]` `npx supabase migration list --linked` pokazuje migrację przebiegu lokalnie i zdalnie
- Ustawienia produkcji według lekcji: `[Claude]` zapytanie tylko do odczytu przez `npx supabase db query --linked -f <plik>` potwierdza kolumny `events` i `revision`, `UPDATE` dla `authenticated` tylko na nich, politykę `matches_update_own` z `(SELECT auth.uid())`, brak uprawnień `anon`; `[Ty]` Data API nadal udostępnia `public`
- Po merge na `main` job `deploy` zielony (w tym smoke `production`)
- Na Androidzie: kilka gemów z cofnięciem i zmianą serwującego, potem tryb samolotowy, kilka punktów („Czeka na sieć”), powrót sieci („Zapisano”), przeładowanie pokazuje ten sam wynik
- Na Androidzie: dojście do końca meczu (przyciski punktów zablokowane, „Cofnij” działa) i odczucie odpowiedzi poniżej 200 ms
- Konflikt: ten sam mecz w drugiej przeglądarce, punkt w każdej, komunikat „Mecz zmieniono na innym telefonie” i obie opcje działają
- Workers Logs: brak błędów 1102 (limit CPU) dla `PUT /api/matches/*/log`

**Implementation Note**: Merge na `main` dopiero po potwierdzeniu `db push`; to wdrożenie produkcyjne.

---

## Testing Strategy

### Unit Tests:

- `replayMatch`, `gamePointLabels`: gem z przewagą i bez, set 6:4 i 7:5, tie-break 7:6 i 8:6, koniec meczu, akcje po końcu, rotacja serwującego, tie-break, poprawka serwującego, cofnięcie.
- `parseMatchActions`, `sameActions`: niezaufane wejście, limit 2000, porównanie przebiegów.
- `chooseInitialLog`, `parseStoredLog`, `interpretSyncResponse`, `retryDelayMs`: pierwszeństwo kopii z telefonu, uszkodzona kopia, każda klasa odpowiedzi, opóźnienia.

### Integration Tests:

- Smoke `full` w CI: zapis, ponowienie, konflikt, błędny przebieg, punkt po końcu meczu (reguły z fazy 1 na trasie), izolacja zapisu dla konta B.
- Smoke `production`: niezalogowany zapis przebiegu przekierowuje na logowanie.

### Manual Testing Steps:

1. Na Androidzie rozpocząć mecz, zapisać kilka gemów, cofnąć punkt, poprawić serwującego.
2. Włączyć tryb samolotowy, zapisać kilka punktów; linia stanu pokazuje „Czeka na sieć”.
3. Wyłączyć tryb samolotowy; linia stanu wraca do „Zapisano”; przeładować stronę — wynik ten sam.
4. Zapisać mecz do końca; przyciski punktów zablokowane, „Cofnij” odblokowuje je.
5. Otworzyć ten sam mecz w drugiej przeglądarce, zapisać punkt w obu, sprawdzić komunikat konfliktu i obie opcje.

## Performance Considerations

- Każde dotknięcie odtwarza cały przebieg (najwyżej kilkaset akcji, prosta pętla) i zapisuje kilka KB do `localStorage`. To mieści się w budżecie 200 ms bez sieci.
- Trasa parsuje i odtwarza przebieg raz na żądanie i robi jedno lub dwa zapytania. Trzeba obserwować czas CPU w Workers Logs w związku z otwartym pytaniem 3 w roadmapie (limit 10 ms planu Free).
- Jedno żądanie w locie ogranicza liczbę zapisów przy szybkich dotknięciach. Kolejne wysyłają już najnowszy przebieg.

## Migration Notes

Migracja jest addytywna: dwie kolumny z domyślnymi wartościami, nowe uprawnienie na kolumny i nowa polityka. Kolejność: `db push` na produkcję → merge na `main` → deploy. Rollback kodu przez `wrangler rollback` zostawia kolumny, których stary kod nie wybiera, więc stara strona meczu dalej działa.

## References

- Roadmap: `context/foundation/roadmap.md` — S-03 `point-scoring-first-format`; Unknown o dwóch telefonach rozstrzygnięty jako wykrycie konfliktu z wyborem rodzica
- PRD: US-01, FR-004, FR-005, FR-008, FR-010, FR-011, NFR (200 ms, Android, dane tylko właściciela), Business Logic
- Lekcje: `context/foundation/lessons.md` — „Uprawnienia tylko na kolumny z formularza”, „Ustawienia projektu Supabase poza repo”
- Rejestr ryzyk: `context/foundation/infrastructure.md` — zapis punktów najpierw na urządzeniu
- Poprzedni wycinek: `context/archive/2026-11-17-match-start/plan.md`
- Wzorce: `src/lib/services/matches.ts`, `src/pages/api/matches/index.ts`, `src/pages/matches/[id].astro`, `supabase/migrations/20261117160000_restrict_columns_and_rls_initplan.sql`, `src/components/auth/SignInForm.tsx`
- Smoke: `scripts/smoke.mjs`
- Wdrożenie i migracje: `context/deployment/deploy-plan.md` (3.4a, 3.5)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły wyniku i serwującego

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 93a8ab5
- [x] 1.2 Celowe zepsucie reguły przewag daje czerwony test; zmiana cofnięta — 93a8ab5
- [x] 1.3 Celowe zepsucie kolejności serwującego w tie-breaku daje czerwony test; zmiana cofnięta — 93a8ab5
- [x] 1.4 Lint przechodzi: `npm run lint` — 93a8ab5
- [x] 1.5 Typy przechodzą: `npx astro check` — 93a8ab5

### Phase 2: Migracja i trasa zapisu przebiegu

#### Automated

- [x] 2.1 Testy przechodzą: `npm test`
- [x] 2.2 Lint przechodzi: `npm run lint`
- [x] 2.3 Typy przechodzą: `npx astro check`
- [x] 2.4 Build przechodzi: `npm run build`
- [x] 2.5 Migracja nadaje `update` tylko na dwie kolumny i dodaje politykę `update`
- [x] 2.6 Limit długości zgodny z kodem

### Phase 3: Ekran zapisu z kolejką na telefonie

#### Automated

- [ ] 3.1 Testy przechodzą: `npm test`
- [ ] 3.2 Celowe zepsucie pierwszeństwa w `chooseInitialLog` daje czerwony test; zmiana cofnięta
- [ ] 3.3 Lint przechodzi: `npm run lint`
- [ ] 3.4 Typy przechodzą: `npx astro check`
- [ ] 3.5 Build przechodzi: `npm run build`
- [ ] 3.6 Klient nie podąża za przekierowaniem

### Phase 4: Smoke, ustawienia produkcji i wdrożenie

#### Automated

- [ ] 4.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- [ ] 4.2 Lint przechodzi: `npm run lint`
- [ ] 4.3 CI dla PR zielone (`ci` i `smoke`, w tym kroki zapisu przebiegu i konta B)

#### Manual

- [ ] 4.4 Migracja na produkcji: `db push` i `migration list --linked`
- [ ] 4.5 Ustawienia produkcji według lekcji: kolumny, uprawnienie `update` na kolumny, polityka, Data API
- [ ] 4.6 Po merge na `main` job `deploy` zielony
- [ ] 4.7 Na Androidzie: zapis, cofanie, zmiana serwującego, tryb samolotowy i powrót sieci, przeładowanie
- [ ] 4.8 Na Androidzie: koniec meczu i odpowiedź poniżej 200 ms
- [ ] 4.9 Konflikt w drugiej przeglądarce i obie opcje
- [ ] 4.10 Workers Logs: brak błędów 1102 dla zapisu przebiegu
