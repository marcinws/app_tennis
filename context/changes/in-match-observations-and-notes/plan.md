# Obserwacje przy celach i notatki podczas meczu — plan implementacji

## Overview

Rodzic podczas meczu zaznacza obserwację przy celu zawodnika jednym dotknięciem (FR-014) i dopisuje krótkie notatki (FR-015). Obserwacje i notatki, tak jak punkty, nie przepadają przy słabej sieci. To S-07 z `context/foundation/roadmap.md`. S-08 pokaże je w podsumowaniu, a S-09 usunie razem z meczem.

## Current State Analysis

- Ekran meczu `src/pages/matches/[id].astro:59-70` ładuje aktywne cele zawodnika meczu i renderuje je jako statyczną listę HTML nad wyspą `MatchRecorder` (`:94-117`). Celu nie da się dotknąć.
- Cele: `public.player_goals` (`supabase/migrations/20261122120000_create_player_goals.sql`), RLS select/insert/update właściciela, `update (text, active)`. Polityka update nie sprawdza `active` (przegląd S-06, F4), więc zakończony cel można zmienić bezpośrednio przez PostgREST. Trasa pilnuje `.eq("active", true)` (`src/pages/api/players/[id]/goals/[goalId].ts`).
- Punkty przeżywają brak sieci dzięki kopii na telefonie i kolejce z ponowieniami (`src/components/hooks/useMatchLog.ts`, czyste reguły w `src/lib/services/match-sync.ts`, w tym `retryDelayMs`). Log meczu to jeden dokument z rewizją. Obserwacje i notatki nie pasują do niego, bo „Cofnij” i limit 2000 akcji dotyczą wyniku.
- `matches` ma `(id, owner_id)` bez klucza unikalnego. `player_goals` też nie ma klucza złożonego, do którego można by się odwołać.

## Desired End State

- Na ekranie meczu każdy cel w sekcji „Cele” jest dużym przyciskiem. Dotknięcie dodaje obserwację i zwiększa licznik przy celu. Mały przycisk „−” cofa ostatnią obserwację tego celu w tym meczu.
- Pod celami jest przycisk „Notatki (N)”, który rozwija pole notatki (najwyżej 200 znaków) z przyciskiem „Dodaj”. Domyślnie jest zwinięty, żeby nie spychać przycisków punktów. Notatki meczu pokazują się listą od najstarszej, a każdą można usunąć po potwierdzeniu.
- Obserwacje i notatki zapisują się od razu na telefonie i trafiają na serwer w kolejności dotknięć. Bez sieci czekają i są ponawiane. Wczytanie strony bez sieci po powrocie nie gubi niezsynchronizowanych zmian.
- Cel zakończony w trakcie meczu, który ma już obserwacje w tym meczu, nadal jest widoczny na ekranie meczu z licznikiem.
- Obserwacje i notatki widzi i zmienia wyłącznie właściciel konta. Obserwacja może wskazać tylko cel zawodnika tego meczu, co pilnuje baza.
- Treść zakończonego celu jest niezmienna także przez PostgREST.

### Key Discoveries:

- Wstawianie z identyfikatorem nadanym na telefonie (uuid) czyni każdy zapis idempotentnym. Ponowienie po zgubionej odpowiedzi daje `23505`, a trasa traktuje to jako „już zapisane”. Dzięki temu kolejka nie potrzebuje rewizji ani rozwiązywania konfliktów: obserwacje i notatki tylko się dopisuje i usuwa.
- Złożone klucze obce `(match_id, player_id, owner_id) → matches (id, player_id, owner_id)` i `(goal_id, player_id, owner_id) → player_goals (id, player_id, owner_id)` gwarantują w bazie, że cel należy do zawodnika meczu i do tego samego konta, bez wyzwalacza.
- Polityka update celów z `using (… and active)` blokuje zmiany zakończonych celów. Zakończenie celu nadal działa, bo `using` sprawdza stary wiersz (aktywny), a `with check` tylko właściciela.

## What We're NOT Doing

- Rodzaje obserwacji (np. udane/nieudane), opis obserwacji, przypinanie notatki do celu lub do gema.
- Edycja notatki (usuń i dodaj ponownie).
- Limity liczby obserwacji i notatek w meczu.
- Zapis treści celu przy obserwacji: zmiana tekstu aktywnego celu traktowana jest jako poprawka i zmienia też jego opis we wcześniejszych meczach.
- Podsumowanie po meczu (S-08), historia i usuwanie meczów (S-09). Kaskadowe usuwanie z meczem jest w kluczach obcych już teraz.
- Rozwiązywanie konfliktów między dwoma telefonami: każdy dopisuje swoje, usunięcie usuwa wpis po id.
- Testy przeglądarkowe (Playwright).

## Implementation Approach

Dwie tabele: `match_observations (id, owner_id, match_id, player_id, goal_id, created_at)` i `match_notes (id, owner_id, match_id, text, created_at)`. Mają RLS select/insert/delete właściciela, bez update i z `id` z klienta. Cztery idempotentne trasy JSON: `PUT`/`DELETE` dla `/api/matches/[id]/observations/[observationId]` i `/api/matches/[id]/notes/[noteId]`.

Na kliencie osobna wyspa `MatchNotes` z hookiem `useMatchNotes` trzyma na telefonie stan i kolejkę operacji (`match-notes:<matchId>` w localStorage) i wysyła je po kolei z backoffem z `retryDelayMs`. Reguły (składanie kolejki, stan początkowy, ocena odpowiedzi, walidacja notatki) to czyste funkcje w `src/lib/services/match-notes.ts`. Wyspa jest osobna, więc nie spowalnia przycisków punktów.

## Critical Implementation Details

- **Kolejność kolejki:** operacje wysyłane są ściśle po kolei, jedna naraz. Usunięcie wpisu, którego dodanie wciąż czeka w kolejce i nie zostało jeszcze wysłane, usuwa obie operacje z kolejki zamiast wysyłać obie. Jeśli dodanie jest właśnie w locie, usunięcie zostaje w kolejce za nim.
- **Odrzucenie (4xx poza 401):** ponowienie nie pomoże, więc operacja wypada z kolejki. Wpis jest cofany ze stanu, a jego kopia trafia do `match-notes:<matchId>:rejected`. Błąd jest logowany i pokazany w linii stanu. 401 lub przekierowanie zatrzymuje kolejkę do następnej akcji, tak jak w `useMatchLog`.

## Phase 1: Reguły i tabele

### Overview

Czyste reguły obserwacji i notatek z testami oraz migracja dwóch tabel z RLS i zaostrzeniem polityki celów.

### Changes Required:

#### 1. Reguły obserwacji i notatek

**File**: `src/lib/services/match-notes.ts`, `src/lib/services/match-notes.test.ts`

**Intent**: Jedno miejsce dla walidacji notatki, kształtu stanu na telefonie i reguł kolejki, testowalne bez przeglądarki.

**Contract**:

- `NOTE_TEXT_MAX_LENGTH = 200`, `parseNoteText(raw)` → `{ ok: true, text } | { ok: false, error: "text_empty" | "text_too_long" }`. Normalizuje jak `parseGoalText`, długość liczy w code pointach.
- Typy: `Observation { id, goal_id }`, `Note { id, text, created_at: string | null }` (null, dopóki serwer nie potwierdzi), `NotesOp` = `put_observation | delete_observation | put_note | delete_note` z `id` (i `goal_id` / `text`), `MatchNotesState { observations, notes }`, `StoredMatchNotes { version: 1, state, queue }`.
- `applyOp(state, op)`: dodaje albo usuwa wpis po id; ponowne dodanie tego samego id nic nie zmienia.
- `enqueue(queue, op, inFlightId)`: dopisuje operację; `delete_*` wpisu, którego `put_*` czeka i nie jest w locie, usuwa obie.
- `parseStoredNotes(raw)` → `{ ok: true, stored | null } | { ok: false }`, `serializeStoredNotes`, `notesStorageKey(matchId)`.
- `initialNotesState(server, stored)`: stan serwera z nałożonymi po kolei operacjami z kolejki na telefonie.
- `interpretNotesResponse(response)` → `saved | unauthorized | rejected(error) | retry(reason)`, ten sam kształt `SyncResponse` co w `match-sync.ts`.
- `observationCount(state, goalId)`, `lastObservationId(state, goalId)`.

#### 2. Migracja

**File**: `supabase/migrations/20261125120000_create_match_observations_and_notes.sql`

**Intent**: Tabele obserwacji i notatek właściciela z gwarancją w bazie, że obserwacja dotyczy celu zawodnika meczu. Ukończony cel staje się niezmienny.

**Contract**:

- Klucze unikalne `matches (id, player_id, owner_id)`, `matches (id, owner_id)` i `player_goals (id, player_id, owner_id)`. Dziś złożony klucz `(id, owner_id)` ma tylko `players`.
- `match_observations`: `id uuid primary key` (bez domyślnej, z klienta), `owner_id default auth.uid()`, `match_id`, `player_id`, `goal_id`, `created_at default now()`. Klucze `(match_id, player_id, owner_id) → matches … on delete cascade` i `(goal_id, player_id, owner_id) → player_goals …`. Indeks `(match_id, created_at)`.
- `match_notes`: `id uuid primary key`, `owner_id`, `match_id`, `text` z `check (char_length between 1 and 200 and text = btrim(text))`, `created_at`. Klucz `(match_id, owner_id) → matches (id, owner_id) on delete cascade`. Indeks `(match_id, created_at)`.
- RLS na obu: polityki `select`, `insert`, `delete` z `(select auth.uid())`. `revoke all … from anon`, `revoke insert, update, delete, truncate, references, trigger … from authenticated`, potem `grant insert (id, match_id, player_id, goal_id)` / `grant insert (id, match_id, text)` i `grant delete`. `id` z klienta to świadomy wyjątek od lekcji „Uprawnienia tylko na kolumny z formularza” (idempotencja); `owner_id` i `created_at` zostają domyślne.
- `alter policy player_goals_update_own … using (owner_id = (select auth.uid()) and active)`.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Migracja jest sprawdzana w CI (smoke z lokalnym Supabase) w fazie 3. Lokalnie nie ma Dockera.

---

## Phase 2: Trasy, kolejka i wyspa na ekranie meczu

### Overview

Idempotentne trasy zapisu, hook z kolejką na telefonie i wyspa `MatchNotes` zamiast statycznej sekcji celów.

### Changes Required:

#### 1. Trasy

**File**: `src/pages/api/matches/[id]/observations/[observationId].ts`, `src/pages/api/matches/[id]/notes/[noteId].ts`

**Intent**: Zapis i usuwanie po id z telefonu, bezpieczne do powtarzania.

**Contract**:

- Walidacja `z.uuid()` parametrów i `z.object` ciała, a JSON taki jak w `log.ts`: `{ error: <kod> }` i statusy 200/204/400/404/500.
- `PUT observations/<oid>` z `{ goal_id }`: czyta `player_id` meczu (brak → 404 `match_not_found`), wstawia wiersz. `23505` → 200 (już zapisane), `23503` → 404 `goal_not_found`.
- `PUT notes/<nid>` z `{ text }`: `parseNoteText` (błąd → 400 z kodem), wstawia. `23505` → 200, `23503` → 404 `match_not_found`.
- `DELETE …/<id>`: `delete().eq("id").eq("match_id")` → 204 także dla brakującego wiersza (już usunięty).
- Błąd bazy → log `console.error` z przyczyną i 500 `save_failed`.

#### 2. Hook kolejki

**File**: `src/components/hooks/useMatchNotes.ts`

**Intent**: Stan obserwacji i notatek z kopią na telefonie i kolejką, odporny na brak sieci tak jak punkty.

**Contract**: `useMatchNotes({ matchId, initialObservations, initialNotes })` → `{ ready, observations, notes, status, addObservation(goalId), removeObservation(id), addNote(text), removeNote(id) }`. Magazyn poza Reactem (`useSyncExternalStore`), jak `createMatchLogStore`: zapis do localStorage przed renderem, jedno żądanie w locie, `AbortSignal.timeout`, `redirect: "manual"`, ponowienie przy `online` i `visibilitychange`, id z `crypto.randomUUID()`. Gdy kolejka się opróżni, kopia na telefonie jest usuwana. Status: `saved | waiting | error | unauthorized | rejected`.

#### 3. Wyspa na ekranie meczu

**File**: `src/components/match/MatchNotes.tsx`, `src/pages/matches/[id].astro`, `src/types.ts`

**Intent**: Cele jako przyciski obserwacji z licznikiem i cofaniem oraz notatki pod nimi. Sekcja zostaje nad wynikiem.

**Contract**:

- Strona ładuje obserwacje (`id, goal_id`) i notatki (`id, text, created_at`) meczu oraz cele: aktywne zawodnika i te, które mają obserwacje w tym meczu. Błąd odczytu → log i 500, jak dotąd.
- Typy `MatchObservation`, `MatchNote` w `src/types.ts`.
- `MatchNotes` (`client:load`) dostaje cele, obserwacje, notatki, `matchId` i `playerId`. Bez celów pokazuje „Brak aktywnych celów · Dodaj cele” jak dotąd. Przycisk celu ma `aria-label` z treścią celu i liczbą obserwacji, `min-h-12`, a „−” jest wyłączony przy zerze. Pole notatki ma `maxLength` 200 i licznik znaków, błąd walidacji pokazuje komunikat. Usunięcie notatki wymaga `confirm`. Linia stanu działa jak w `MatchRecorder` (`role="status"`).

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie: dotknięcie celu zwiększa licznik, „−” go zmniejsza, notatka dodaje się i usuwa po potwierdzeniu, a przyciski punktów zostają na ekranie bez przewijania przy 3 celach
- Na telefonie w trybie samolotowym: obserwacje i notatki dodane bez sieci zostają po przeładowaniu strony i trafiają na serwer po powrocie sieci

---

## Phase 3: Smoke i wdrożenie

### Overview

Kroki smoke dla tras i RLS, PR, `db push` na produkcji i wdrożenie.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: CI sprawdza zapis, idempotencję, usuwanie i izolację kont na prawdziwej bazie.

**Contract**: W trybie domyślnym, po krokach celów i meczu konta A, wykonuje kroki:

- A zapisuje obserwację przy swoim celu → 200, a powtórka → 200.
- A dodaje notatkę → 200, a ekran meczu zawiera jej treść.
- Konto B: PUT obserwacji i notatki do meczu A → 404, DELETE notatki A → 204, ale notatka zostaje na ekranie A.
- A usuwa notatkę → 204 i treści nie ma na ekranie.
- Notatka 201-znakowa → 400 `text_too_long`.
- Obserwacja z celem spoza zawodnika meczu lub z nieistniejącym celem → 404 `goal_not_found`.

Tryb `production` bez zmian.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- CI na PR zielone, w tym nowe kroki smoke

#### Manual Verification:

- Ustawienia produkcyjnego projektu Supabase sprawdzone przed `db push` (lekcja „Ustawienia projektu Supabase poza repo”)
- `npx supabase db push` na produkcji przed merge
- Po merge job `deploy` i smoke produkcyjny zielone
- Na telefonie na produkcji: obserwacje i notatki zapisane w meczu
- Dziennik wdrożeń uzupełniony

---

## Testing Strategy

### Unit Tests:

- `parseNoteText`: puste, same spacje, 200 i 201 znaków (także emoji), zwijanie białych znaków.
- `enqueue`: put+delete czekającego wpisu znikają, put w locie + delete zostaje, delete wpisu z serwera zostaje.
- `applyOp` i `initialNotesState`: serwer + kolejka, powtórzone put bez duplikatu, delete brakującego wpisu bez błędu.
- `parseStoredNotes`: brak kopii, zły JSON, zła wersja, złe operacje → `ok: false`.
- `interpretNotesResponse`: 200/204 → saved, przekierowanie i 401 → unauthorized, 400/404 → rejected z kodem, 5xx i sieć → retry.
- `observationCount` / `lastObservationId` dla wielu celów.

### Integration Tests:

- Kroki smoke z fazy 3 (CI z lokalnym Supabase).

### Manual Testing Steps:

1. Mecz z 3 celami: kilka dotknięć różnych celów, „−” przy jednym, przeładowanie → liczniki bez zmian.
2. Tryb samolotowy: 2 obserwacje i notatka, przeładowanie, wyłączenie trybu → linia stanu „Zapisano”, a drugi telefon/karta widzi wpisy.
3. Zakończenie celu na `/players/<id>` w trakcie meczu → cel z obserwacjami zostaje na ekranie meczu.

## Performance Considerations

Wyspa `MatchNotes` jest osobna od `MatchRecorder`, więc dotknięcia celu i wpisywanie notatki nie renderują ponownie tablicy wyniku ani przycisków punktów. Zapis do localStorage jest synchroniczny i mały.

## Migration Notes

Migracja tylko dodaje tabele, klucze unikalne i zmienia jedną politykę. Istniejące dane spełniają nowe klucze, bo `id` jest już unikalne. Wymaga `npx supabase db push` na produkcji przed merge (CLAUDE.md, `context/deployment/deploy-plan.md` 3.5). Wycofanie: kod bez migracji nie czyta nowych tabel, więc wystarczy `wrangler rollback`. Tabele mogą zostać.

## References

- Wzorzec kolejki: `src/components/hooks/useMatchLog.ts`, `src/lib/services/match-sync.ts`
- Wzorzec tabeli właściciela i uprawnień: `supabase/migrations/20261122120000_create_player_goals.sql`
- Poprzedni wycinek: `context/archive/2026-11-22-player-goals-on-match-screen/` (przegląd, F4)
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły i tabele

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 4fb755a
- [x] 1.2 Lint przechodzi: `npm run lint` — 4fb755a
- [x] 1.3 Typy przechodzą: `npx astro check` — 4fb755a

### Phase 2: Trasy, kolejka i wyspa na ekranie meczu

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` — e68f87b
- [x] 2.2 Lint przechodzi: `npm run lint` — e68f87b
- [x] 2.3 Typy przechodzą: `npx astro check` — e68f87b
- [x] 2.4 Build przechodzi: `npm run build` — e68f87b

#### Manual

- [ ] 2.5 Na telefonie: dotknięcie celu zwiększa licznik, „−” go zmniejsza, notatka dodaje się i usuwa po potwierdzeniu, a przyciski punktów zostają na ekranie bez przewijania przy 3 celach
- [ ] 2.6 Na telefonie w trybie samolotowym: obserwacje i notatki dodane bez sieci zostają po przeładowaniu strony i trafiają na serwer po powrocie sieci

### Phase 3: Smoke i wdrożenie

#### Automated

- [ ] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- [ ] 3.2 CI na PR zielone, w tym nowe kroki smoke

#### Manual

- [ ] 3.3 Ustawienia produkcyjnego projektu Supabase sprawdzone przed `db push`
- [ ] 3.4 `npx supabase db push` na produkcji przed merge
- [ ] 3.5 Po merge job `deploy` i smoke produkcyjny zielone
- [ ] 3.6 Na telefonie na produkcji: obserwacje i notatki zapisane w meczu
- [ ] 3.7 Dziennik wdrożeń uzupełniony
