# Cele zawodnika na ekranie meczu — plan implementacji

## Overview

Rodzic definiuje i zmienia cele treningowe zawodnika, najwyżej trzy aktywne naraz (FR-012), i widzi aktywne cele zawodnika na ekranie meczu przez cały czas zapisu (FR-013). To S-06 z `context/foundation/roadmap.md`; S-07 doda do celów obserwacje, a S-08 pokaże je w podsumowaniu.

## Current State Analysis

- Zawodnicy: tabela `public.players` (`supabase/migrations/20261116120000_create_players.sql`) z RLS na `select`/`insert`/`update`, polityki z `(select auth.uid())`, `insert (name)` i `update (name)` dla `authenticated` (`20261117160000_restrict_columns_and_rls_initplan.sql`). Para `(id, owner_id)` ma unikalny klucz `players_id_owner_id_key` — cel się do niej odwoła złożonym kluczem obcym, tak jak `matches`.
- Strona `/players` (`src/pages/players.astro`) listuje zawodników z formularzem zmiany imienia; trasy `POST /api/players` i `POST /api/players/[id]` walidują przez `z` i czyste funkcje z `src/lib/services/players.ts`, błędy wracają jako `?error=<kod>` ze stałymi komunikatami.
- Middleware chroni prefiksy `/players`, `/api/players`, `/matches`, `/api/matches` (`src/middleware.ts:4`). Trasy pod `/api/players/[id]/goals…` i strona `/players/[id]` są chronione bez zmian.
- Ekran meczu `src/pages/matches/[id].astro` ładuje mecz z `player:players(name)` i renderuje wyspę `MatchRecorder` (`client:load`). Mecz zawsze ma zawodnika (`matches.player_id not null`), więc sekcja celów zawsze dotyczy wybranego zawodnika.
- Brak tabeli celów i kodu celów.

## Desired End State

- Lista zawodników ma przy każdym link „Cele”. Strona `/players/<id>` pokazuje aktywne cele zawodnika (najwyżej 3), z polem edycji tekstu, przyciskami „Zapisz” i „Zakończ” przy każdym, oraz formularz „Dodaj cel”, nieaktywny z komunikatem, gdy są już 3 aktywne.
- Zakończony cel znika z listy aktywnych i z ekranu meczu, ale zostaje w bazie (S-07 przypnie do celów obserwacje).
- Ekran meczu ma nad wynikiem stałą sekcję „Cele” z aktywnymi celami zawodnika meczu; bez celów pokazuje „Brak aktywnych celów” z linkiem do strony celów zawodnika.
- Czwarty aktywny cel jest odrzucany zarówno przez trasę, jak i przez bazę, także przy dwóch równoczesnych zapisach.
- Cele widzi i zmienia wyłącznie właściciel konta (NFR, RLS).

### Key Discoveries:

- Złożony klucz obcy `(player_id, owner_id) → players (id, owner_id)` sprawia, że cel nie może wskazać zawodnika innego konta — ten sam wzorzec co `matches` (`20261117140000_create_matches.sql`), z kodem błędu FK zamienianym na `player_not_found`.
- Limit „3 aktywne” nie da się wyrazić indeksem unikalnym; potrzebny wyzwalacz, który blokuje wiersz zawodnika (`select … for update`) przed policzeniem, żeby dwa równoczesne zapisy nie dały czwartego celu. `for update` wymaga uprawnienia `update` na choć jednej kolumnie `players` — `authenticated` ma `update (name)`.
- Sekcja celów jako zwykły HTML z `.astro` nie dokłada pracy wyspie React, więc nie wpływa na czas reakcji przycisków punktów (ryzyko S-06 w roadmapie).

## What We're NOT Doing

- Usuwanie celów i przywracanie zakończonych celów; historia zakończonych celów na stronie.
- Zmiana kolejności celów (kolejność: od najstarszego aktywnego).
- Zapamiętywanie, jakie cele obowiązywały w danym meczu — ekran meczu pokazuje bieżące aktywne cele zawodnika. Ewentualny zapis stanu celów przy meczu należy do S-07/S-08.
- Obserwacje i notatki (S-07), podsumowanie (S-08).
- Edycja celów z ekranu meczu (link prowadzi do strony celów).
- Testy przeglądarkowe (Playwright).

## Implementation Approach

Nowa tabela `public.player_goals (id, owner_id, player_id, text, active, created_at)` z RLS na `select`/`insert`/`update` dla właściciela, `grant insert (player_id, text)` i `grant update (text, active)`. Wyzwalacz `before insert or update of active` odrzuca czwarty aktywny cel kodem `P0001` z komunikatem `goal_limit`. Czyste funkcje w `src/lib/services/goals.ts` normalizują tekst (jak `parsePlayerName`), znają limit i komunikaty błędów. Trasy formularzy robią przekierowania z `?error=` jak trasy zawodników.

## Phase 1: Reguły i tabela celów

### Overview

Czyste funkcje celów z testami i migracja tabeli z RLS, uprawnieniami na kolumny i wyzwalaczem limitu.

### Changes Required:

#### 1. Reguły celów

**File**: `src/lib/services/goals.ts`, `src/lib/services/goals.test.ts`
**Intent**: Walidacja tekstu celu i limit w jednym miejscu dla tras i strony.
**Contract**:

- `GOAL_TEXT_MAX_LENGTH = 100`, `MAX_ACTIVE_GOALS = 3`.
- `GOAL_ERROR_MESSAGES`: `text_empty` „Wpisz treść celu”, `text_too_long` „Cel może mieć najwyżej 100 znaków”, `goal_limit` „Zawodnik ma już 3 aktywne cele. Zakończ jeden, żeby dodać nowy”, `goal_not_found` „Nie znaleziono celu”, `not_configured` „Supabase nie jest skonfigurowany”; typ `GoalErrorCode`.
- `parseGoalText(raw)` → `{ ok: true, text } | { ok: false, error }` (trim, zwinięte białe znaki, długość w code pointach).
- `canAddGoal(activeCount)` → `activeCount < MAX_ACTIVE_GOALS`.
- `goalErrorMessage(code)` jak `playerErrorMessage`.
- Testy: pusty i biały tekst, 100 i 101 znaków (w tym emoji), zwijanie spacji, limit 2/3, nieznany kod błędu.

#### 2. Migracja

**File**: `supabase/migrations/20261122120000_create_player_goals.sql`
**Intent**: Tabela celów dostępna tylko właścicielowi, z limitem aktywnych celów w bazie.
**Contract**:

- `create table public.player_goals (id uuid pk default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade, player_id uuid not null, text text not null check (char_length(text) between 1 and 100 and text = btrim(text)), active boolean not null default true, created_at timestamptz not null default now(), foreign key (player_id, owner_id) references public.players (id, owner_id) on delete cascade)`.
- Indeks `(player_id, active, created_at)`.
- RLS włączone; polityki `player_goals_select_own`, `player_goals_insert_own`, `player_goals_update_own` dla `authenticated` z `owner_id = (select auth.uid())`.
- `revoke all … from anon`; `revoke insert, update, delete, truncate, references, trigger … from authenticated`; `grant insert (player_id, text)`, `grant update (text, active)`.
- Funkcja `public.enforce_active_goal_limit()` (`language plpgsql`, `security invoker`, `set search_path = ''`): gdy nowy wiersz jest aktywny (insert, albo update zmieniający `active` na true), blokuje `public.players` wiersz `new.player_id` przez `for update`, liczy aktywne cele zawodnika (bez bieżącego wiersza) i przy 3 lub więcej robi `raise exception 'goal_limit' using errcode = 'P0001'`. Wyzwalacz `before insert or update of active`.
- Komentarz: limit musi równać się `MAX_ACTIVE_GOALS` w `goals.ts`.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

## Phase 2: Zarządzanie celami i cele na ekranie meczu

### Overview

Strona celów zawodnika, trasy dodawania, zmiany i zakończenia celu oraz sekcja „Cele” na ekranie meczu.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`
**Intent**: Typ celu dla stron.
**Contract**: `interface PlayerGoal { id: string; text: string; created_at: string }`.

#### 2. Dodanie celu

**File**: `src/pages/api/players/[id]/goals/index.ts`
**Intent**: Dodać aktywny cel zawodnikowi.
**Contract**: `POST`; `z.uuid()` dla id zawodnika (inaczej 404), `z.object({ text: z.string() })`, `parseGoalText`; zlicza aktywne cele (`count: "exact", head: true`) i przy `!canAddGoal` przekierowuje z `goal_limit`; `insert { player_id, text }`; błąd FK `player_goals_player_id_owner_id_fkey` → 404 „Nie znaleziono zawodnika”; wyjątek `P0001` z `goal_limit` → przekierowanie z `goal_limit`; inny błąd → `console.error` i 500. Sukces → `/players/<id>`. Błędy → `/players/<id>?error=<kod>`.

#### 3. Zmiana i zakończenie celu

**File**: `src/pages/api/players/[id]/goals/[goalId].ts`
**Intent**: Zapisać nowy tekst albo zakończyć cel.
**Contract**: `POST`; oba id przez `z.uuid()` (inaczej 404); `z.object({ action: z.enum(["save", "end"]), text: z.string() })` (brak `text` → `""`); `save` → `parseGoalText` i `update { text }`, `end` → `update { active: false }`; zawsze `.eq("id", goalId).eq("player_id", id).eq("active", true).select("id")`; zero wierszy → przekierowanie z `goal_not_found`; błąd → `console.error` i 500; sukces → `/players/<id>`.

#### 4. Strona celów

**File**: `src/pages/players/[id].astro`, `src/pages/players.astro`
**Intent**: Zarządzanie celami jednego zawodnika.
**Contract**:

- Ładuje zawodnika (`id, name`, 404 przy braku) i jego aktywne cele rosnąco po `created_at`; błędy zapytań → `console.error` i 500.
- Nagłówek „Cele: <imię>”, link „← Zawodnicy”, komunikat błędu z `goalErrorMessage`.
- Każdy aktywny cel: formularz z polem tekstu (`maxlength` 100), przyciskami `name="action"` `value="save"` „Zapisz” i `value="end"` „Zakończ”.
- Formularz „Dodaj cel”, gdy `canAddGoal`; w przeciwnym razie tekst limitu zamiast formularza.
- Pusta lista: „Ten zawodnik nie ma jeszcze celów.”
- Styl jak `players.astro`. Na liście zawodników przy każdym zawodniku link „Cele” do `/players/<id>`.

#### 5. Cele na ekranie meczu

**File**: `src/pages/matches/[id].astro`, `src/types.ts`
**Intent**: Stale widoczne aktywne cele zawodnika meczu.
**Contract**:

- Zapytanie meczu dociąga `player:players(id, name)`; drugie zapytanie pobiera aktywne cele zawodnika rosnąco po `created_at`; błąd → `console.error` i 500. `Match.player` dostaje `id`.
- Nad wyspą `MatchRecorder` sekcja `<section aria-labelledby="goals-heading">` z nagłówkiem „Cele” i listą celów; bez celów „Brak aktywnych celów” i link „Dodaj cele” do `/players/<player id>`. Zwarta (maks. 3 krótkie wiersze), bez JavaScriptu.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie: dodanie, zmiana i zakończenie celu na stronie celów; przy 3 aktywnych formularz dodawania jest zastąpiony komunikatem
- Na telefonie: ekran meczu pokazuje aktywne cele zawodnika nad wynikiem i nie przesuwa przycisków punktów poza ekran

## Phase 3: Smoke i wdrożenie

### Overview

Smoke sprawdza trasy celów, limit i RLS; migracja trafia na produkcję przed merge, po sprawdzeniu ustawień projektu Supabase.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`
**Intent**: Sprawdzić cele na prawdziwych trasach w CI.
**Contract**: kroki konta A po utworzeniu zawodnika i przed startem meczu:

- „goals page renders” — `GET /players/<playerAId>` → 200;
- „a goal is added” ×3 — `POST /api/players/<playerAId>/goals` z różnymi tekstami → 302 `/players/<playerAId>`;
- „a fourth active goal is rejected” → 302 `/players/<playerAId>?error=goal_limit`;
- „an empty goal is rejected” → 302 z `text_empty`;
- „goals page lists the goals” — tekst pierwszego celu na stronie;
- po starcie meczu: „match page shows the player's goals” — tekst celu na stronie meczu.

Konto B: „second account cannot add a goal to another account's player” — `POST /api/players/<playerAId>/goals` → 404; „second account cannot open another account's goals page” → 404.

Kolejność dotychczasowych kroków bez zmian; zmiana i zakończenie celu wymagają id celu z HTML, więc zostają w teście na telefonie.

#### 2. Wdrożenie

**Intent**: Migracja przed kodem.
**Contract**: gałąź i PR; po zielonym CI użytkownik sprawdza w panelu Supabase ustawienia spoza repo (Data API → Exposed schemas zawiera `public`; lekcja „Ustawienia projektu Supabase poza repo”) i uruchamia `npx supabase db push`; potem merge; wpis w dzienniku wdrożeń.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- CI na PR zielone, w tym nowe kroki smoke

#### Manual Verification:

- Ustawienia produkcyjnego projektu Supabase sprawdzone przed `db push`
- `npx supabase db push` na produkcji przed merge
- Po merge job `deploy` i smoke produkcyjny zielone
- Na telefonie na produkcji: cele zawodnika dodane i widoczne na ekranie meczu
- Dziennik wdrożeń uzupełniony

## Testing Strategy

- Jednostkowe: walidacja tekstu celu i limit (faza 1).
- Smoke w CI: trasy celów, limit z bazy, RLS między kontami, cele na ekranie meczu (faza 3).
- Ręczne na telefonie: edycja i zakończenie celu, układ ekranu meczu.

## Performance Considerations

Ekran meczu wykonuje jedno dodatkowe zapytanie o najwyżej 3 wiersze z indeksem `(player_id, active, created_at)`; sekcja celów nie zmienia wyspy React.

## Migration Notes

Migracja addytywna: nowa tabela, funkcja i wyzwalacz. Poprzednia wersja Workera nie odwołuje się do `player_goals`, więc rollback kodu jest bezpieczny; cofnięcie schematu = nowa migracja przez gałąź i PR.

## References

- `context/foundation/prd.md` — FR-012, FR-013
- `context/foundation/roadmap.md` — S-06
- `context/foundation/lessons.md` — ustawienia Supabase poza repo; uprawnienia tylko na kolumny z formularza
- `supabase/migrations/20261117140000_create_matches.sql` — złożony klucz obcy do zawodnika
- `context/archive/2026-11-16-player-roster/` — wzorzec tras i strony zawodników

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły i tabela celów

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 50601b0
- [x] 1.2 Lint przechodzi: `npm run lint` — 50601b0
- [x] 1.3 Typy przechodzą: `npx astro check` — 50601b0

### Phase 2: Zarządzanie celami i cele na ekranie meczu

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` — 61d1ac6
- [x] 2.2 Lint przechodzi: `npm run lint` — 61d1ac6
- [x] 2.3 Typy przechodzą: `npx astro check` — 61d1ac6
- [x] 2.4 Build przechodzi: `npm run build` — 61d1ac6

#### Manual

- [x] 2.5 Na telefonie: dodanie, zmiana i zakończenie celu; przy 3 aktywnych formularz dodawania zastąpiony komunikatem
- [x] 2.6 Na telefonie: ekran meczu pokazuje aktywne cele nad wynikiem i nie spycha przycisków punktów poza ekran

### Phase 3: Smoke i wdrożenie

#### Automated

- [x] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs` — 59e9f67
- [x] 3.2 CI na PR zielone, w tym nowe kroki smoke — 59e9f67

#### Manual

- [x] 3.3 Ustawienia produkcyjnego projektu Supabase sprawdzone przed `db push`
- [x] 3.4 `npx supabase db push` na produkcji przed merge
- [x] 3.5 Po merge job `deploy` i smoke produkcyjny zielone
- [x] 3.6 Na telefonie na produkcji: cele dodane i widoczne na ekranie meczu
- [x] 3.7 Dziennik wdrożeń uzupełniony
