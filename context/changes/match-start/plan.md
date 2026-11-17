# Start meczu — plan implementacji

## Overview

Rodzic może rozpocząć mecz: wybiera swojego zawodnika, wpisuje nazwę turnieju albo zostawia ją pustą, wybiera format i wskazuje pierwszego serwującego (FR-003, FR-004, FR-020). Powstaje tabela `matches` z dostępem tylko dla właściciela, strona startu `/matches/new` i strona meczu `/matches/<id>`, którą S-03 zamieni w ekran zapisu punktów. Lista formatów żyje w module domenowym, więc S-05 dopisuje formaty bez zmiany startu meczu.

To wycinek S-02 z `context/foundation/roadmap.md`. Praca idzie na gałęzi `match-start` z pull requestem; migracja trafia na produkcję przez `npx supabase db push` przed merge, a merge na `main` wdraża kod (`CLAUDE.md`, `context/deployment/deploy-plan.md` 3.5).

## Current State Analysis

- `public.players` (`supabase/migrations/20261116120000_create_players.sql`) z RLS i politykami `select`/`insert`/`update` dla `authenticated`; nadmiarowe uprawnienia odebrane w `20261117120000_restrict_players_grants.sql` (Supabase domyślnie daje `anon` i `authenticated` wszystkie uprawnienia, a RLS nie obejmuje `truncate`, `references` i `trigger`). Zawodników nie da się usunąć (brak polityki i uprawnienia `delete`).
- `src/lib/services/players.ts` — wzorzec reguł domenowych: stała długości, słownik `PLAYER_ERROR_MESSAGES` z kodami błędów przenoszonymi w `?error=`, `parsePlayerName` (przycina, redukuje białe znaki, długość w punktach kodowych) i `playerErrorMessage` (`Object.hasOwn`, nieznany kod → `null`). Testy w `players.test.ts`.
- `src/pages/api/players/index.ts` i `[id].ts` — wzorzec tras: `z` z `astro/zod`, `redirectWithError(code)`, brak klienta → `not_configured`, kod `23505` → komunikat, inny błąd → `console.error` z komentarzem `eslint-disable-next-line no-console` i odpowiedź `500`; `z.uuid()` dla identyfikatora, błędny → `404`.
- `src/pages/players.astro` — wzorzec strony: `Layout` + `Topbar`, zapytanie z `.overrideTypes<T[], { merge: false }>()`, błąd zapytania → log i `500`, komunikat z `?error=`, formularze HTML bez React.
- `src/lib/services/scoring.ts` — na razie tylko `pointLabel`; reguły formatu i serwującego budują S-03.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/players", "/api/players"]`, dopasowanie prefiksem.
- `src/components/Topbar.astro` — linki „Dashboard” i „Zawodnicy” dla zalogowanego.
- `scripts/smoke.mjs` — tryb `full` (21 kroków, konta A i B, `capturePlayerId` zapamiętuje `playerAId`) i `production` (5 kroków, bez zapisu); oczekiwania `status`, `location` (prefiks), `text`, `absent`.
- `src/types.ts` — tylko `Player`.
- Na tym komputerze nie ma Dockera, więc bazę i RLS sprawdza tylko smoke w CI; produkcyjną bazę można czytać przez `npx supabase db query --linked -f <plik>` (tylko diagnostyka).
- `context/foundation/lessons.md` — „Ustawienia projektu Supabase poza repo”: przed wdrożeniem wycinka z nową tabelą sprawdzić ustawienia produkcyjnego projektu, których nie ma w repo.

## Desired End State

- Tabela `public.matches` z RLS, politykami `select` i `insert` tylko dla właściciela i uprawnieniami ograniczonymi do `select, insert` dla `authenticated` (brak dla `anon`). Mecz nie może wskazywać zawodnika innego konta — pilnuje tego baza, nie tylko trasa.
- Zalogowany rodzic na `/matches/new` wybiera zawodnika, wpisuje turniej albo nie, wybiera format (dziś jeden, zaznaczony domyślnie) i pierwszego serwującego („zawodnik” lub „przeciwnik”), po czym trafia na `/matches/<id>` z danymi startu. Nad formularzem widzi odnośnik do swojego ostatniego meczu.
- Bez zawodników strona startu zamiast formularza pokazuje odnośnik do `/players`.
- Smoke `full` w CI dowodzi, że konto B nie widzi meczu A i nie może rozpocząć meczu z zawodnikiem A.
- Migracja na produkcji, ustawienia produkcji sprawdzone według lekcji, kod wdrożony z `main`.

### Key Discoveries:

- `supabase/migrations/20261116120000_create_players.sql:2-7` — wzorzec kolumn `owner_id` z `default auth.uid()` i `check` z `btrim`.
- `supabase/migrations/20261117120000_restrict_players_grants.sql` — wzorzec odbierania uprawnień do powtórzenia dla `matches`.
- `src/lib/services/players.ts:5-34` — wzorzec kodów błędów i normalizacji tekstu do powtórzenia dla nazwy turnieju.
- `src/pages/api/players/index.ts:10-37` — wzorzec trasy `POST`.
- `src/pages/players.astro:7-25` — wzorzec odczytu i obsługi błędu zapytania na stronie.
- `src/middleware.ts:4` — lista chronionych tras.
- `scripts/smoke.mjs:44-58` — `capturePlayerId`/`renameCapturedPlayer` jako wzorzec przechwycenia identyfikatora i rzucania wyjątku, gdy go brak; `:60-131` kroki `full`, `:134-148` kroki `production`.

## What We're NOT Doing

- Wybór „z przewagami / bez przewag” w formularzu — kolumna `with_advantage` powstaje z domyślnym `true`, a przełącznik dla wszystkich formatów dodaje S-05.
- Pokazywanie przyszłych formatów (super tie-break, krótkie sety) jako niedostępnych — formularz pokazuje tylko formaty z `MATCH_FORMATS`.
- Imię przeciwnika — strony meczu to zawodnik i „Przeciwnik”.
- Edycja danych startu i polityka `update` na `matches` — zmianę serwującego w trakcie dodaje S-03 (FR-010), uzupełnienie turnieju po meczu S-08 (FR-003).
- Usuwanie meczów i lista meczów — S-09.
- Status meczu (trwa/zakończony) — „ostatni mecz” to najnowszy rozpoczęty.
- Reguły liczenia wyniku i serwującego — S-03.
- React na stronach meczu — zwykłe formularze HTML.
- Testy SQL (pgTAP) — izolację sprawdza smoke z kontem B.

## Implementation Approach

Od dołu, jak w S-01: najpierw schemat i reguły startu (sprawdzalne testem jednostkowym), potem strony i trasa, na końcu smoke dowodzący izolacji na prawdziwej bazie w CI i wdrożenie w kolejności migracja → kod.

Przynależność zawodnika do konta pilnuje złożony klucz obcy `matches (player_id, owner_id) → players (id, owner_id)`: `owner_id` meczu pochodzi z `auth.uid()` i polityka `insert` wymusza, że to bieżący użytkownik, więc klucz obcy dopuszcza tylko zawodnika tego samego konta. Zwykły klucz obcy na `players(id)` tego nie zapewnia, bo sprawdzenie klucza obcego omija RLS. Naruszenie (`23503`) trasa zamienia w komunikat „Nie znaleziono zawodnika”.

Lista formatów jest danymi w `src/lib/services/matches.ts` (identyfikator + etykieta). Formularz renderuje radio z tej listy, trasa przyjmuje tylko identyfikatory z listy, a baza ma `check` z tymi samymi identyfikatorami. S-05 dopisuje pozycję do listy i rozszerza `check` migracją.

## Critical Implementation Details

- **Kolejność wdrożenia** — migracja musi być na produkcji, zanim kod trafi na `main`, bo merge od razu wdraża Workera, a strony meczu bez tabeli zwrócą 500. Migracja jest addytywna (nowa tabela i nowe ograniczenie unikalności na `players`), więc obecny kod działa na nowym schemacie.
- **Klucz obcy bez `on delete restrict`** — złożony klucz obcy zostaje z domyślnym `no action`. Usunięcie konta (`delete from auth.users`, używane do sprzątania kont `smoke-*`) kaskadowo usuwa w jednej instrukcji i zawodników, i mecze; `restrict` sprawdza od razu i zablokowałby to, `no action` sprawdza na końcu instrukcji.
- **Ostatni mecz** — zapytanie z `order("created_at", { ascending: false }).limit(1)`; indeks `(owner_id, created_at desc)` obsługuje je razem z filtrem RLS.

## Phase 1: Tabela meczów i reguły startu

### Overview

Schemat `matches` z RLS istnieje jako migracja, a reguły startu meczu (formaty, serwujący, nazwa turnieju, kody błędów) są czystymi funkcjami z testami.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_matches.sql` (nowy; znacznik czasu późniejszy niż `20261117120000`)

**Intent**: Tabela meczów z dostępem wyłącznie dla właściciela (twarda zasada RLS z `CLAUDE.md`) i gwarancją w bazie, że mecz wskazuje zawodnika tego samego konta.

**Contract**:

- `alter table public.players add constraint players_id_owner_id_key unique (id, owner_id)` — cel złożonego klucza obcego.
- `public.matches`: `id uuid primary key default gen_random_uuid()`; `owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade`; `player_id uuid not null`; `foreign key (player_id, owner_id) references public.players (id, owner_id)` (bez `on delete`); `tournament_name text` z `check (tournament_name is null or (char_length(tournament_name) between 1 and 100 and tournament_name = btrim(tournament_name)))`; `format text not null check (format in ('best_of_3_sets'))`; `with_advantage boolean not null default true`; `first_server text not null check (first_server in ('player', 'opponent'))`; `created_at timestamptz not null default now()`.
- Indeks `(owner_id, created_at desc)`.
- `enable row level security`; polityki, każda osobno, `to authenticated`: `matches_select_own` (`using (owner_id = auth.uid())`), `matches_insert_own` (`with check (owner_id = auth.uid())`). Brak polityk `update`/`delete` i brak polityk dla `anon`.
- `revoke all on public.matches from anon; revoke update, delete, truncate, references, trigger on public.matches from authenticated;` z komentarzem jak w `20261117120000_restrict_players_grants.sql`.

#### 2. Reguły startu meczu

**File**: `src/lib/services/matches.ts` (nowy)

**Intent**: Jedno miejsce reguł startu, używane przez formularz, trasę i stronę meczu, testowalne w izolacji (bez importów z Astro i Supabase).

**Contract**:

- `MATCH_FORMATS` — lista tylko do odczytu `{ id, label }`; dziś jedna pozycja `{ id: "best_of_3_sets", label: "Do 2 wygranych setów, tie-break przy 6:6" }`. Typ `MatchFormatId` wyprowadzony z listy. Identyfikatory muszą być równe wartościom `check` na `matches.format` (komentarz przy liście wskazuje migrację).
- `FIRST_SERVERS = ["player", "opponent"] as const`, typ `FirstServer`.
- `TOURNAMENT_NAME_MAX_LENGTH = 100`.
- `MATCH_ERROR_MESSAGES` (kody → stałe komunikaty po polsku): `player_missing` „Wybierz zawodnika”, `player_not_found` „Nie znaleziono zawodnika”, `tournament_too_long` „Nazwa turnieju może mieć najwyżej 100 znaków”, `format_invalid` „Wybierz format meczu”, `first_server_invalid` „Wskaż, kto serwuje pierwszy”, `not_configured` „Supabase nie jest skonfigurowany”. Typ `MatchErrorCode`.
- `parseTournamentName(raw: string)` → `{ ok: true; name: string | null } | { ok: false; error: MatchErrorCode }` — przycina i redukuje białe znaki jak `parsePlayerName`; pusty wynik → `name: null`; ponad 100 punktów kodowych → `tournament_too_long`.
- `parseMatchStart(input: { tournamentName: string; format: string; firstServer: string })` → `{ ok: true; value: { tournamentName: string | null; format: MatchFormatId; firstServer: FirstServer } } | { ok: false; error: MatchErrorCode }` — format spoza `MATCH_FORMATS` → `format_invalid`, serwujący spoza `FIRST_SERVERS` → `first_server_invalid`. Identyfikator zawodnika waliduje trasa (`z.uuid()`), bo to sprawa wejścia HTTP.
- `matchFormatLabel(id: string): string | null` i `matchErrorMessage(code: string | null): string | null` (nieznany kod → `null`, z `Object.hasOwn` jak `playerErrorMessage`).

#### 3. Testy reguł

**File**: `src/lib/services/matches.test.ts` (nowy)

**Intent**: Pokrycie normalizacji turnieju, granic długości i odrzucania wartości spoza list.

**Contract**: `"  Puchar   Lata "` → `"Puchar Lata"`; `""` i `"   "` → `null`; 100 znaków → ok; 101 → `tournament_too_long`; poprawny start → `ok` z wartościami; `format: "custom"` i `""` → `format_invalid`; `firstServer: "both"` → `first_server_invalid`; `matchErrorMessage` dla znanych kodów, `null`, nieznanego tekstu, `"toString"` i `"__proto__"`; `matchFormatLabel("best_of_3_sets")` zwraca etykietę, nieznany → `null`.

#### 4. Typ meczu

**File**: `src/types.ts`

**Intent**: Wspólny typ dla stron meczu.

**Contract**: `export interface Match { id: string; tournament_name: string | null; format: string; with_advantage: boolean; first_server: FirstServer; created_at: string; player: { name: string } }` — `player` to osadzony rekord z `players(name)`; `FirstServer` jako `import type` z `@/lib/services/matches`. Bez `owner_id` i `player_id`, których UI nie używa.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie limitu w `parseTournamentName` (100 → 101) daje czerwony `npx vitest run src/lib/services/matches.test.ts`; zmiana cofnięta
- Migracja zawiera RLS, dwie polityki i odebrane uprawnienia: `grep -c "create policy"` na pliku migracji zwraca 2, plik zawiera `enable row level security` i `revoke all on public.matches from anon`
- Identyfikatory formatów zgodne z bazą: `grep -n "best_of_3_sets"` znajduje wartość w migracji i w `src/lib/services/matches.ts`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Faza nie ma kroków ręcznych; migrację sprawdzi CI w fazie 3.

---

## Phase 2: Start meczu i strona meczu

### Overview

Zalogowany rodzic rozpoczyna mecz z formularza i trafia na stronę meczu; trasa waliduje wejście i nie ukrywa błędów, cudzy mecz daje 404.

### Changes Required:

#### 1. Ochrona tras

**File**: `src/middleware.ts`

**Intent**: Niezalogowany nie wchodzi na strony ani do trasy meczów.

**Contract**: `PROTECTED_ROUTES` zawiera dodatkowo `"/matches"` i `"/api/matches"`.

#### 2. Rozpoczęcie meczu

**File**: `src/pages/api/matches/index.ts` (nowy)

**Intent**: Zapis meczu z formularza startu.

**Contract**: `POST: APIRoute`. `redirectWithError(code: MatchErrorCode)` → `/matches/new?error=<code>`. Formularz walidowany `z.object({ player_id: z.uuid(), tournament_name: z.string(), format: z.string(), first_server: z.string() })` z `astro/zod`, pola brakujące jako `""`; błędny lub brakujący `player_id` → `player_missing`; reszta przez `parseMatchStart`. Brak klienta → `not_configured`. Insert `{ player_id, tournament_name, format, first_server }` (`owner_id` i `with_advantage` z domyślnych) z `.select("id").single()`. Kod `23503` (zawodnik nie istnieje albo należy do innego konta) → `player_not_found`. Każdy inny błąd → `console.error` (komentarz `no-console` z powodem jak w trasach zawodników) i `500` „Nie udało się rozpocząć meczu”. Sukces → `redirect("/matches/<id>")`.

#### 3. Strona startu

**File**: `src/pages/matches/new.astro` (nowy)

**Intent**: Formularz startu meczu po polsku, wygodny na telefonie, z drogą powrotu do ostatniego meczu.

**Contract**:

- Dwa zapytania: zawodnicy (`id, name`, sortowani po `name`) i ostatni mecz (`id, tournament_name, created_at, player:players(name)`, `created_at` malejąco, `limit(1)`); błąd któregokolwiek → log i `500`, brak klienta → `500` (jak `players.astro`).
- Komunikat z `matchErrorMessage(?error=)` nad formularzem (`role="alert"`).
- Gdy jest ostatni mecz: odnośnik „Wróć do ostatniego meczu” do `/matches/<id>` z imieniem zawodnika i turniejem (jeśli jest).
- Brak zawodników → tekst i odnośnik do `/players` zamiast formularza.
- Formularz `POST /api/matches`: zawodnik (`select name="player_id" required`), turniej (`input name="tournament_name"`, opcjonalny, `maxlength` = `TOURNAMENT_NAME_MAX_LENGTH`, placeholder sugerujący, że można zostawić puste), format (radio `name="format"` z `MATCH_FORMATS`, pierwszy zaznaczony), pierwszy serwujący (radio `name="first_server"`: „Zawodnik” / „Przeciwnik”, `required`, bez domyślnego zaznaczenia), przycisk „Rozpocznij mecz”.
- Wygląd jak `players.astro` (`Layout`, `Topbar`, te same klasy kart i pól); duże pola dotyku dla radio.

#### 4. Strona meczu

**File**: `src/pages/matches/[id].astro` (nowy)

**Intent**: Podgląd danych startu po rozpoczęciu; S-03 zamieni ją w ekran zapisu punktów.

**Contract**: `id` walidowany `z.uuid()` (błędny → `404` „Nie znaleziono meczu”). Zapytanie po `id` z `player:players(name)` i `.maybeSingle()`; `null` (cudzy lub nieistniejący, RLS) → `404`; błąd → log i `500`. Pokazuje: imię zawodnika, nazwę turnieju albo „Bez nazwy turnieju”, etykietę formatu z `matchFormatLabel`, pierwszego serwującego (imię zawodnika albo „Przeciwnik”), datę rozpoczęcia. Odnośnik „Nowy mecz” do `/matches/new`.

#### 5. Link w pasku

**File**: `src/components/Topbar.astro`

**Intent**: Dojście do startu meczu z każdej strony.

**Contract**: Dla zalogowanego link „Mecz” do `/matches/new` obok „Zawodnicy”.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Trasy są chronione: `grep -n "/matches" src/middleware.ts`

**Implementation Note**: Bez bazy lokalnie stron nie da się sprawdzić ręcznie; zachowanie end-to-end sprawdza smoke w fazie 3 i test na telefonie po wdrożeniu.

---

## Phase 3: Smoke, ustawienia produkcji i wdrożenie

### Overview

Smoke w CI dowodzi startu meczu i izolacji meczów między kontami, ustawienia produkcji są sprawdzone według lekcji, a zmiana trafia na produkcję w kolejności migracja → kod.

### Changes Required:

#### 1. Smoke startu meczu i izolacji

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić start meczu, RLS i złożony klucz obcy na prawdziwej bazie w CI.

**Contract**:

- Funkcja przechwytująca identyfikator meczu z nagłówka `location` po starcie (`/matches/<uuid>`), rzucająca wyjątek, gdy go brak (jak `capturePlayerId`); start meczu z `playerAId` rzuca, gdy `playerAId` nie został przechwycony.
- Tryb `full`, konto A, po „player id is read from the rename form”: `/matches/new` → 200 z `PLAYER_NAME`; start z `tournament_name: "Smoke Cup"`, `format: "best_of_3_sets"`, `first_server: "player"` → 302 na `/matches/`; strona meczu → 200 z „Smoke Cup”; `/matches/new` → 200 z odnośnikiem `/matches/<id>`; start z `format: "custom"` → 302 na `/matches/new?error=`.
- Konto B, po „second account cannot rename first account's player”: `/matches/<id A>` → 404; start meczu z `playerAId` → 302 na `/matches/new?error=`; `/matches/new` → 200 bez „Smoke Cup” (B nie ma ostatniego meczu).
- Oba tryby: `/matches/new` dla niezalogowanego → 302 na `/auth/signin` (w `production` tylko ten krok dochodzi, nadal bez zapisu).

#### 2. Dziennik wdrożeń

**File**: `context/deployment/deploy-plan.md`

**Intent**: Ślad wdrożenia S-02.

**Contract**: Wiersz w „Dziennik wdrożeń” z datą, ID wersji, commitem merge i wynikiem smoke produkcyjnego.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- Lint przechodzi: `npm run lint`
- CI dla PR zielone (`ci` i `smoke`, w tym kroki meczu i konta B): `gh pr checks <nr> --watch`

#### Manual Verification:

- Migracja na produkcji: `[Ty]` `npx supabase db push`, `[Claude]` `npx supabase migration list --linked` pokazuje migrację meczów lokalnie i zdalnie
- Ustawienia produkcji według lekcji: `[Claude]` zapytanie tylko do odczytu przez `npx supabase db query --linked -f <plik>` potwierdza RLS na `matches`, dwie polityki, uprawnienia `authenticated` = `INSERT, SELECT`, brak uprawnień `anon`; `[Ty]` Data API nadal udostępnia `public`
- Po merge na `main` job `deploy` zielony (w tym smoke `production`)
- Na telefonie: start meczu z turniejem i bez, strona meczu z poprawnymi danymi, odnośnik do ostatniego meczu

**Implementation Note**: Merge na `main` dopiero po potwierdzeniu `db push`; to wdrożenie produkcyjne.

---

## Testing Strategy

### Unit Tests:

- `parseTournamentName`: przycinanie, redukcja spacji, pusta nazwa → `null`, granica 100/101 znaków.
- `parseMatchStart`: poprawny start, format i serwujący spoza list.
- `matchErrorMessage`, `matchFormatLabel`: znane i nieznane wartości, klucze prototypu.

### Integration Tests:

- Smoke `full` w CI: start meczu, strona meczu, odnośnik do ostatniego meczu, odrzucony format, izolacja odczytu meczu i blokada startu z cudzym zawodnikiem dla konta B.
- Smoke `production`: `/matches/new` przekierowuje niezalogowanego.

### Manual Testing Steps:

1. Na telefonie zalogować się, wybrać „Mecz”, rozpocząć mecz z nazwą turnieju i serwującym zawodnikiem.
2. Sprawdzić stronę meczu: zawodnik, turniej, format, serwujący.
3. Rozpocząć drugi mecz bez nazwy turnieju, z serwującym przeciwnikiem; strona pokazuje „Bez nazwy turnieju” i „Przeciwnik”.
4. Wrócić na „Mecz” — odnośnik prowadzi do ostatniego meczu.

## Performance Considerations

Strona startu robi dwa małe zapytania (kilku zawodników, jeden mecz), strona meczu jedno z osadzonym zawodnikiem. Indeks `(owner_id, created_at desc)` obsługuje ostatni mecz.

## Migration Notes

Migracja addytywna: nowa tabela i ograniczenie unikalności `(id, owner_id)` na `players`, które zawsze jest spełnione, bo `id` jest już kluczem głównym. Kolejność: `db push` na produkcję → merge na `main` → deploy. Rollback kodu przez `wrangler rollback` zostawia tabelę, której stary kod nie używa.

## References

- Roadmap: `context/foundation/roadmap.md` — S-02 `match-start`
- PRD: FR-003, FR-004, FR-020, NFR (dane widzi wyłącznie właściciel)
- Lekcja: `context/foundation/lessons.md` — „Ustawienia projektu Supabase poza repo”
- Poprzedni wycinek: `context/archive/2026-11-16-player-roster/plan.md`
- Wzorce: `supabase/migrations/20261116120000_create_players.sql`, `supabase/migrations/20261117120000_restrict_players_grants.sql`, `src/lib/services/players.ts`, `src/pages/api/players/index.ts`, `src/pages/players.astro`
- Smoke: `scripts/smoke.mjs`
- Wdrożenie i migracje: `context/deployment/deploy-plan.md` (3.4a, 3.5)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tabela meczów i reguły startu

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 37dcd52
- [x] 1.2 Celowe zepsucie limitu w `parseTournamentName` daje czerwony test; zmiana cofnięta — 37dcd52
- [x] 1.3 Migracja zawiera RLS, dwie polityki i odebrane uprawnienia — 37dcd52
- [x] 1.4 Identyfikatory formatów zgodne z bazą — 37dcd52
- [x] 1.5 Lint przechodzi: `npm run lint` — 37dcd52
- [x] 1.6 Typy przechodzą: `npx astro check` — 37dcd52

### Phase 2: Start meczu i strona meczu

#### Automated

- [x] 2.1 Testy przechodzą: `npm test`
- [x] 2.2 Lint przechodzi: `npm run lint`
- [x] 2.3 Typy przechodzą: `npx astro check`
- [x] 2.4 Build przechodzi: `npm run build`
- [x] 2.5 Trasy są chronione: `grep -n "/matches" src/middleware.ts`

### Phase 3: Smoke, ustawienia produkcji i wdrożenie

#### Automated

- [ ] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 CI dla PR zielone (`ci` i `smoke`, w tym kroki meczu i konta B)

#### Manual

- [ ] 3.4 Migracja na produkcji: `db push` i `migration list --linked`
- [ ] 3.5 Ustawienia produkcji według lekcji: RLS, polityki i uprawnienia `matches`, Data API
- [ ] 3.6 Po merge na `main` job `deploy` zielony
- [ ] 3.7 Na telefonie: start meczu z turniejem i bez, strona meczu, odnośnik do ostatniego meczu
