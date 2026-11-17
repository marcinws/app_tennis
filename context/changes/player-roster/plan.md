# Lista zawodników — plan implementacji

## Overview

Rodzic może zdefiniować zawodników (FR-002), których widzi wyłącznie zalogowany właściciel konta (NFR-owner-only). Powstaje pierwsza tabela domenowa `players` z RLS, strona `/players` z dodawaniem i zmianą imienia oraz odrzucaniem duplikatów, a izolację danych między kontami sprawdza smoke test w CI. To wycinek S-01 z `context/foundation/roadmap.md`; ustala wzorzec tabel z dostępem tylko dla właściciela i ścieżkę wdrażania migracji, z których skorzystają S-02 i kolejne wycinki.

Praca idzie na gałęzi `player-roster` z pull requestem: CI dla PR uruchamia `ci` i `smoke` bez wdrożenia, migracja trafia na produkcję przed merge, a merge na `main` wdraża kod.

## Current State Analysis

- Brak `supabase/migrations/`; jedyne dane to `auth.users`. `supabase/config.toml` ma włączone migracje (`[db.migrations] enabled = true`).
- Job `smoke` w `.github/workflows/ci.yml` uruchamia `supabase start`, który stosuje migracje z `supabase/migrations/`, więc tabela powstanie automatycznie w CI.
- Produkcyjny projekt Supabase nie jest połączony z CLI (`supabase/.temp/` zawiera tylko `cli-latest`). `context/deployment/deploy-plan.md:52` (3.5) mówi „Migracje: brak”, a sekcja Rollback (`:103`) zakłada migracje wstecznie zgodne.
- Na tym komputerze nie ma Dockera ani `.env`/`.dev.vars`, więc bazy i RLS nie da się sprawdzić lokalnie — tylko w CI.
- `src/lib/supabase.ts` tworzy klienta z sesją użytkownika z ciasteczek (klucz anon/publishable), więc zapytania działają w imieniu zalogowanego użytkownika i `auth.uid()` w politykach RLS ma wartość; bez sekretów zwraca `null`.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; niezalogowany jest przekierowany na `/auth/signin`.
- `src/pages/api/auth/signin.ts` — wzorzec trasy: `APIRoute`, `createClient`, `context.redirect` z `?error=`; rzutuje dane formularza `as string`, czego nowe trasy mają nie robić (walidacja `z` z `astro/zod`, CLAUDE.md).
- `src/components/Topbar.astro` — link „Dashboard” dla zalogowanego; `src/pages/dashboard.astro` to przykład startera.
- `scripts/smoke.mjs` — tryb `full` (konto, logowanie, strona chroniona, wylogowanie) i `production` (tylko odczyt); kroki to krotki `[nazwa, run, expected]` z `status`, `location` (prefiks) i `text` (zawiera).
- `src/lib/services/scoring.ts` + `scoring.test.ts` — wzorzec czystej funkcji domenowej z testem Vitest.

## Desired End State

- Tabela `public.players` z włączonym RLS i osobnymi politykami `select`/`insert`/`update` dla roli `authenticated`, ograniczonymi do `owner_id = auth.uid()`; brak polityk dla `anon` i brak polityki `delete`.
- Imię jest normalizowane (przycięte, wielokrotne spacje zredukowane do jednej), ma 1–50 znaków i jest unikalne w obrębie konta bez względu na wielkość liter.
- Zalogowany rodzic na `/players` widzi swoich zawodników alfabetycznie, dodaje nowego i zmienia imię istniejącego; duplikat i błędne imię wracają z komunikatem po polsku.
- Smoke `full` w CI dowodzi, że drugie konto nie widzi i nie może zmienić zawodnika pierwszego.
- Migracja jest na produkcji, kod wdrożony z `main`, a procedura migracji opisana w `deploy-plan.md` i `CLAUDE.md`.

### Key Discoveries:

- `src/middleware.ts:4` — lista chronionych tras do rozszerzenia o `/players` i `/api/players`.
- `src/pages/api/auth/signin.ts:12-19` — wzorzec obsługi braku klienta i przekierowania z błędem.
- `scripts/smoke.mjs:40-68` — kroki trybu `full`; `:70-83` — kroki `production`; `:93-99` — porównanie `expected`.
- `.github/workflows/ci.yml:51` — `supabase start` w jobie `smoke` stosuje migracje.
- `context/deployment/deploy-plan.md:52` i `:103` — miejsca na procedurę migracji.

## What We're NOT Doing

- Usuwanie zawodników (brak polityki `delete`) — zderzyłoby się z meczami i celami z późniejszych wycinków.
- Dodatkowe pola zawodnika (data urodzenia, zdjęcie itp.) — PRD wymaga tylko zawodnika do wyboru przy meczu.
- Automatyczne migracje w CI (`supabase db push` w jobie `deploy`) i sekrety bazy w GitHub.
- Testy SQL (pgTAP) — izolację sprawdza smoke z drugim kontem.
- React na stronie `/players` — zwykłe formularze HTML wystarczą.
- Tłumaczenie istniejących ekranów logowania na polski i usuwanie przykładowego `/dashboard`.
- Generowanie typów bazy przez `supabase gen types` — jeden ręczny typ w `src/types.ts`.
- Lokalny Supabase na tym komputerze (brak Dockera).

## Implementation Approach

Od dołu: najpierw schemat i reguły imienia (sprawdzalne testem jednostkowym), potem strona i trasy, które z nich korzystają, na końcu smoke dowodzący izolacji na prawdziwej bazie w CI. Imię jest normalizowane w czystej funkcji domenowej przed zapisem, a baza utrzymuje te same reguły ograniczeniami (`check` i unikalny indeks), więc duplikat wykryty przez bazę (kod `23505`) zamienia się w komunikat dla rodzica bez dodatkowego zapytania. Zmiana imienia przez cudze konto kończy się `404`, bo RLS ukrywa wiersz, a trasa sprawdza, czy aktualizacja dotknęła rekordu.

## Critical Implementation Details

- **Kolejność wdrożenia** — migracja musi być na produkcji, zanim kod trafi na `main`, bo merge od razu wdraża Workera, a strona `/players` bez tabeli zwróci 500. Rollback Workera nie cofa migracji; tabela jest addytywna, więc stary kod działa z nią bez zmian.
- **Zmiana imienia bez wiersza** — `update` objęty RLS na cudzym lub nieistniejącym `id` nie zwraca błędu, tylko zero wierszy; trasa musi poprosić o zwrot zmienionych wierszy i odpowiedzieć `404`, gdy jest ich zero.

## Phase 1: Tabela i reguły imienia

### Overview

Schemat `players` z RLS istnieje jako migracja, a reguły imienia są czystą funkcją z testem.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261116120000_create_players.sql` (nowy)

**Intent**: Pierwsza tabela domenowa z dostępem wyłącznie dla właściciela, zgodnie z twardą zasadą RLS z `CLAUDE.md`.

**Contract**: `public.players`: `id uuid primary key default gen_random_uuid()`, `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `name text not null` z `check (char_length(name) between 1 and 50 and name = btrim(name))`, `created_at timestamptz not null default now()`. Unikalny indeks na `(owner_id, lower(name))`. `alter table … enable row level security`. Polityki, każda osobno, `to authenticated`: `players_select_own` (`using (owner_id = auth.uid())`), `players_insert_own` (`with check (owner_id = auth.uid())`), `players_update_own` (`using` i `with check` `owner_id = auth.uid()`). Brak polityk dla `anon` i brak polityki `delete`.

#### 2. Reguły imienia

**File**: `src/lib/services/players.ts` (nowy)

**Intent**: Jedno miejsce reguł imienia, używane przez obie trasy i testowalne w izolacji.

**Contract**: `export function parsePlayerName(raw: string): { ok: true; name: string } | { ok: false; error: string }` — przycina, redukuje ciągi białych znaków do jednej spacji; pusty wynik → `"Podaj imię zawodnika"`; ponad 50 znaków → `"Imię może mieć najwyżej 50 znaków"`. Eksport stałej `PLAYER_NAME_MAX_LENGTH = 50`. Bez importów z Astro i Supabase.

#### 3. Test reguł

**File**: `src/lib/services/players.test.ts` (nowy)

**Intent**: Pokrycie normalizacji i granic długości.

**Contract**: `"  Ola  "` → `"Ola"`; `"Ola   Kowalska"` → `"Ola Kowalska"`; `""` i `"   "` → błąd pustego imienia; 50 znaków → ok; 51 znaków → błąd długości.

#### 4. Typ zawodnika

**File**: `src/types.ts` (nowy)

**Intent**: Wspólny typ dla strony i tras (konwencja z `CLAUDE.md`).

**Contract**: `export interface Player { id: string; name: string; created_at: string }` — bez `owner_id`, którego UI nie używa.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie limitu w `parsePlayerName` (np. 50 → 51) daje czerwony `npx vitest run src/lib/services/players.test.ts`; zmiana cofnięta
- Migracja zawiera RLS i trzy polityki: `grep -c "create policy" supabase/migrations/20261116120000_create_players.sql` zwraca 3 i plik zawiera `enable row level security`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Faza nie ma kroków ręcznych; migrację sprawdzi CI w fazie 3.

---

## Phase 2: Strona /players i trasy API

### Overview

Zalogowany rodzic widzi listę zawodników, dodaje nowego i zmienia imię; trasy walidują wejście i nie ukrywają błędów.

### Changes Required:

#### 1. Ochrona tras

**File**: `src/middleware.ts`

**Intent**: Niezalogowany nie wchodzi na stronę ani do tras zawodników.

**Contract**: `PROTECTED_ROUTES` zawiera `"/players"` i `"/api/players"`.

#### 2. Dodawanie zawodnika

**File**: `src/pages/api/players/index.ts` (nowy)

**Intent**: Zapis nowego zawodnika z formularza.

**Contract**: `POST: APIRoute`. Dane formularza walidowane `z.object({ name: z.string() })` z `astro/zod`, potem `parsePlayerName`. Błąd walidacji → `redirect("/players?error=<komunikat>")`. Insert tylko `{ name }` (`owner_id` z domyślnego `auth.uid()`). Błąd `23505` → `redirect("/players?error=Taki zawodnik już istnieje")`. Brak klienta Supabase → przekierowanie z błędem jak w `signin.ts`. Każdy inny błąd bazy → `console.error` z obiektem błędu (z komentarzem wyłączającym `no-console` i powodem) i odpowiedź `500` z krótkim tekstem. Sukces → `redirect("/players")`.

#### 3. Zmiana imienia

**File**: `src/pages/api/players/[id].ts` (nowy)

**Intent**: Poprawa imienia istniejącego zawodnika.

**Contract**: `POST: APIRoute`. `id` z parametru walidowany `z.string().uuid()` (błędny → `404`). Imię jak przy dodawaniu. Update `{ name }` po `id` z żądaniem zwrotu zmienionych wierszy; zero wierszy → `404`. Duplikat, brak klienta i inne błędy jak w trasie dodawania. Sukces → `redirect("/players")`.

#### 4. Strona listy

**File**: `src/pages/players.astro` (nowy)

**Intent**: Ekran zarządzania zawodnikami dla rodzica, po polsku.

**Contract**: Pobiera `id, name, created_at` posortowane po `name` rosnąco; błąd zapytania → zalogowany i odpowiedź `500` (nie pusta lista). Pokazuje `?error=` nad formularzami. Formularz dodawania `POST /api/players` z polem `name` (`maxlength` = `PLAYER_NAME_MAX_LENGTH`, `required`). Przy każdym zawodniku formularz `POST /api/players/<id>` z polem `name` wypełnionym bieżącym imieniem i przyciskiem „Zapisz”. Pusta lista → zachęta do dodania pierwszego zawodnika. Wygląd zgodny z istniejącymi stronami (`Layout`, klasy jak w `dashboard.astro`), klasy łączone przez `cn()` tam, gdzie są warunkowe.

#### 5. Link w pasku

**File**: `src/components/Topbar.astro`

**Intent**: Dojście do listy z każdej strony.

**Contract**: Dla zalogowanego link „Zawodnicy” do `/players` obok istniejącego „Dashboard”.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Trasy są chronione: `grep -n "/players" src/middleware.ts`

**Implementation Note**: Bez bazy lokalnie strony nie da się sprawdzić ręcznie; zachowanie end-to-end sprawdza smoke w fazie 3 i test na telefonie po wdrożeniu.

---

## Phase 3: Izolacja w smoke, PR i wdrożenie

### Overview

Smoke w CI dowodzi izolacji danych, procedura migracji jest opisana, a zmiana trafia na produkcję w kolejności migracja → kod.

### Changes Required:

#### 1. Smoke z dwoma kontami

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić zawodników i RLS na prawdziwej bazie w CI.

**Contract**: Oczekiwania kroku dostają pole `absent` (tekst, którego nie może być w treści). Tryb `full`, po zalogowaniu konta A: `/players` → 200; dodanie „Smoke Player” → 302 na `/players`; lista zawiera „Smoke Player”; duplikat `" smoke   player "` → 302 na `/players?error=`; identyfikator zawodnika odczytany z akcji formularza na `/players` i zapamiętany. Po istniejącym wylogowaniu: rejestracja i logowanie konta B (osobny e-mail `smoke-…-b@example.com`); `/players` → 200 bez „Smoke Player”; zmiana imienia zawodnika A przez B → 404. Oba tryby: `/players` dla niezalogowanego → 302 na `/auth/signin` (w `production` tylko ten krok dochodzi, nadal bez zapisu).

#### 2. Procedura migracji

**File**: `context/deployment/deploy-plan.md`

**Intent**: Udokumentować ręczną ścieżkę migracji przed kodem.

**Contract**: 3.5 zastąpione procedurą: jednorazowo `[Ty]` `npx supabase login` i `npx supabase link --project-ref <ref>`; przy każdej migracji `[Ty]` `npx supabase db push` przed merge na `main`, `[Claude]` sprawdza `npx supabase migration list`. Wiersz migracji w tabeli Rollback zaktualizowany (migracje addytywne, rollback Workera ich nie cofa). Wpis w dzienniku wdrożeń po wdrożeniu.

#### 3. Zasada w CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Agent nie wypycha kodu z nową migracją na `main` przed `db push`.

**Contract**: W „Środowisko”: migracje trafiają na produkcję ręcznie przez `npx supabase db push` przed merge na `main`; zmiany z migracją idą przez gałąź i PR; odwołanie do `deploy-plan.md`.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- Lint przechodzi: `npm run lint`
- Formatowanie dokumentacji: `npx prettier --check CLAUDE.md context/deployment/deploy-plan.md`
- CI dla PR zielone (`ci` i `smoke`, w tym kroki zawodników i konta B): `gh pr checks <nr> --watch`

#### Manual Verification:

- Migracja na produkcji: `npx supabase db push` wykonane, w panelu Supabase tabela `players` ma włączone RLS i trzy polityki
- Po merge na `main` job `deploy` zielony
- Na telefonie: dodanie zawodnika, zmiana imienia, odrzucony duplikat z komunikatem

**Implementation Note**: Merge na `main` dopiero po potwierdzeniu `db push`; to wdrożenie produkcyjne.

---

## Testing Strategy

### Unit Tests:

- `parsePlayerName`: przycinanie, redukcja spacji, puste imię, granica 50/51 znaków.

### Integration Tests:

- Smoke `full` w CI: dodanie, lista, duplikat, izolacja odczytu i zapisu między kontami A i B na lokalnym Supabase z migracją.
- Smoke `production`: `/players` przekierowuje niezalogowanego.

### Manual Testing Steps:

1. Na telefonie zalogować się, otworzyć „Zawodnicy”, dodać zawodnika.
2. Zmienić mu imię, sprawdzić listę.
3. Dodać to samo imię inną wielkością liter — komunikat „Taki zawodnik już istnieje”.

## Performance Considerations

Jedno zapytanie na stronę, lista kilku rekordów; indeks unikalny `(owner_id, lower(name))` obsługuje też filtr po właścicielu.

## Migration Notes

Migracja addytywna (nowa tabela), bez danych do przeniesienia. Kolejność: `db push` na produkcję → merge na `main` → deploy. Rollback kodu przez `wrangler rollback` zostawia tabelę, której stary kod nie używa. Wycofanie samej tabeli wymagałoby nowej migracji `drop table`, nieplanowanej.

## References

- Roadmap: `context/foundation/roadmap.md` — S-01 `player-roster`
- PRD: FR-001, FR-002, FR-018, NFR (dane widzi wyłącznie właściciel)
- Wzorzec trasy: `src/pages/api/auth/signin.ts`
- Wzorzec usługi i testu: `src/lib/services/scoring.ts`, `src/lib/services/scoring.test.ts`
- Smoke: `scripts/smoke.mjs`
- Wdrożenie i rollback: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tabela i reguły imienia

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 6e65349
- [x] 1.2 Celowe zepsucie limitu w `parsePlayerName` daje czerwony test; zmiana cofnięta — 6e65349
- [x] 1.3 Migracja zawiera RLS i trzy polityki — 6e65349
- [x] 1.4 Lint przechodzi: `npm run lint` — 6e65349
- [x] 1.5 Typy przechodzą: `npx astro check` — 6e65349

### Phase 2: Strona /players i trasy API

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` — 074e348
- [x] 2.2 Lint przechodzi: `npm run lint` — 074e348
- [x] 2.3 Typy przechodzą: `npx astro check` — 074e348
- [x] 2.4 Build przechodzi: `npm run build` — 074e348
- [x] 2.5 Trasy są chronione: `grep -n "/players" src/middleware.ts` — 074e348

### Phase 3: Izolacja w smoke, PR i wdrożenie

#### Automated

- [x] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs` — 76d009b
- [x] 3.2 Lint przechodzi: `npm run lint` — 76d009b
- [x] 3.3 Formatowanie dokumentacji: `npx prettier --check CLAUDE.md context/deployment/deploy-plan.md` — 76d009b
- [x] 3.4 CI dla PR zielone (`ci` i `smoke`, w tym kroki zawodników i konta B) — 76d009b

#### Manual

- [x] 3.5 Migracja na produkcji: `db push`, tabela `players` z RLS i trzema politykami w panelu — 76d009b
- [x] 3.6 Po merge na `main` job `deploy` zielony — b0ffd4e
- [x] 3.7 Na telefonie: dodanie, zmiana imienia, odrzucony duplikat — b0ffd4e
