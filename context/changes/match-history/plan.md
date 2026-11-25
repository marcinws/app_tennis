# Historia meczów — plan implementacji

## Overview

Rodzic przegląda listę wcześniejszych meczów, otwiera podgląd meczu i usuwa mecz po potwierdzeniu (FR-017). To S-09, ostatni wycinek milestone'u M-1 w `context/foundation/roadmap.md`.

## Current State Analysis

- Meczów nie da się przeglądać. `/matches/new` linkuje tylko do ostatniego meczu, a `/matches` nie istnieje. Middleware chroni prefiks `/matches` (`src/middleware.ts:4`), więc nowa strona jest chroniona bez zmian.
- Podsumowanie `/matches/<id>/summary` (S-08) pokazuje wszystko o meczu, więc jest gotowym podglądem.
- `authenticated` nie ma `delete` na `matches` (`supabase/migrations/20261117140000_create_matches.sql` revoke), a polityki delete też nie ma. Obserwacje i notatki mają `on delete cascade` od meczu (`20261125120000_create_match_observations_and_notes.sql`). Kaskada działa w imieniu właściciela tabeli, więc nie potrzebuje dodatkowych uprawnień.
- Limit 10 ms CPU na żądanie w planie Free Cloudflare (pytanie 3 w roadmapie). Odtwarzanie logów wielu meczów na liście mogłoby go przekroczyć.

## Desired End State

- `/matches` („Historia meczów”, link w górnym pasku) pokazuje mecze konta od najnowszego: datę, zawodnika, turniej (albo „Bez nazwy turnieju”) i format. Każdy wiersz prowadzi do podsumowania. Bez meczów strona pokazuje „Brak meczów” z linkiem do nowego meczu.
- Podsumowanie ma na dole sekcję „Usuń mecz”: rozwinięcie pokazuje ostrzeżenie, że wyniku, obserwacji i notatek nie da się odtworzyć, i przycisk „Tak, usuń mecz trwale”. Po usunięciu rodzic wraca na listę z komunikatem „Mecz usunięty”.
- Usunięcie meczu usuwa jego obserwacje i notatki. Cudzego meczu nie da się usunąć.

### Key Discoveries:

- Lista nie potrzebuje `events`. Pomijamy kolumnę i odtwarzanie wyniku, więc koszt listy nie rośnie z długością meczów.
- `<details>` z drugim przyciskiem daje potwierdzenie bez JavaScriptu i bez `window.confirm`, który na części telefonów bywa blokowany.

## What We're NOT Doing

- Wynik na liście (CPU; wynik jest w podsumowaniu), filtrowanie, wyszukiwanie, stronicowanie (lista ograniczona do 200 najnowszych z dopiskiem, gdy jest więcej).
- Cofnięcie usunięcia, kosz, miękkie usuwanie.
- Czyszczenie kopii usuniętego meczu w localStorage telefonu. Ekran usuniętego meczu daje 404, a kopia jest nieszkodliwa.
- Usuwanie zawodników.
- Testy przeglądarkowe (Playwright).

## Implementation Approach

Statyczna strona `src/pages/matches/index.astro` z jednym zapytaniem bez `events`. Usuwanie idzie trasą formularza `POST /api/matches/[id]/delete` z przekierowaniem na `/matches?deleted=1` albo `?error=`. Migracja dodaje `grant delete` i politykę `matches_delete_own`. Komunikaty listy trafiają do `src/lib/services/matches.ts`.

## Phase 1: Uprawnienie i komunikaty

### Overview

Migracja usuwania i stałe komunikaty listy z testem.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261125160000_allow_match_delete.sql`

**Intent**: Właściciel może usunąć własny mecz; obserwacje i notatki znikają kaskadowo.

**Contract**: `create policy matches_delete_own on public.matches for delete to authenticated using (owner_id = (select auth.uid()))`; `grant delete on public.matches to authenticated`.

#### 2. Komunikaty i limit listy

**File**: `src/lib/services/matches.ts`, `src/lib/services/matches.test.ts`

**Intent**: Jedno źródło dla tekstów i limitu historii.

**Contract**: `MATCH_HISTORY_LIMIT = 200`. `MATCH_ERROR_MESSAGES.match_not_found` = „Nie znaleziono meczu”. `historyNotice(searchParams)` → `{ kind: "deleted" } | { kind: "error"; message } | null` (`deleted=1` → komunikat sukcesu; znane `error` → komunikat; reszta → `null`).

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

---

## Phase 2: Lista, usuwanie i nawigacja

### Overview

Strona historii, trasa usuwania, sekcja usuwania w podsumowaniu i link w górnym pasku.

### Changes Required:

#### 1. Trasa usuwania

**File**: `src/pages/api/matches/[id]/delete.ts`

**Intent**: Trwałe usunięcie własnego meczu z formularza.

**Contract**: `POST`, waliduje `z.uuid()` (zły id → 404). Wykonuje `delete().eq("id").select("id")`. Zero wierszy → `/matches?error=match_not_found`, błąd bazy → log i 500, sukces → `/matches?deleted=1`.

#### 2. Strona historii

**File**: `src/pages/matches/index.astro`

**Intent**: Lista meczów konta.

**Contract**: Zapytanie `id, tournament_name, format, created_at, player:players(name)`, `order created_at desc`, `limit MATCH_HISTORY_LIMIT + 1` (nadmiar → dopisek „Pokazano 200 najnowszych meczów”). Każdy wiersz to link do `/matches/<id>/summary` z datą (`Europe/Warsaw`), zawodnikiem, turniejem i formatem. Komunikat `historyNotice`: sukces `role="status"`, błąd `role="alert"`. Błąd odczytu → log i 500. Link „Nowy mecz”.

#### 3. Usuwanie w podsumowaniu i nawigacja

**File**: `src/pages/matches/[id]/summary.astro`, `src/components/Topbar.astro`

**Intent**: Potwierdzone usunięcie z podglądu meczu i droga do historii.

**Contract**:

- Na dole podsumowania `<details>` z `<summary>` „Usuń mecz”. W środku ostrzeżenie i `<form method="POST" action="/api/matches/<id>/delete">` z przyciskiem „Tak, usuń mecz trwale”.
- Link „Historia” w górnym pasku zalogowanego, obok „Mecz”.
- Link „Historia meczów” na podsumowaniu obok „Wróć do meczu”.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie: lista pokazuje mecze od najnowszego, wiersz otwiera podsumowanie, a usunięcie wymaga rozwinięcia i drugiego przycisku i wraca na listę z komunikatem

---

## Phase 3: Smoke i wdrożenie

### Overview

Kroki smoke dla listy, usuwania i izolacji kont, PR, `db push`, wdrożenie.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: CI sprawdza historię, usuwanie z kaskadą i RLS.

**Contract**:

- **Konto A:** `/matches` zawiera nazwę turnieju i link do podsumowania meczu A.
- **Konto B:**
  - `/matches` nie zawiera meczów A;
  - usunięcie meczu A → `/matches?error=match_not_found`.
- **Konto A na końcu:**
  - mecz A wciąż ma podsumowanie;
  - usunięcie meczu A (ma obserwacje i notatki, więc sprawdza też kaskadę) → `/matches?deleted=1`;
  - podsumowanie → 404;
  - `/matches` bez linku do meczu A.
- **Tryb `production`:** anonimowe `/matches` → logowanie.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- CI na PR zielone, w tym nowe kroki smoke

#### Manual Verification:

- `npx supabase db push` na produkcji przed merge, potwierdzony przez `npx supabase migration list --linked`
- Po merge job `deploy` i smoke produkcyjny zielone
- Na telefonie na produkcji: historia i usunięcie testowego meczu działają
- Dziennik wdrożeń uzupełniony

---

## Testing Strategy

### Unit Tests:

- `historyNotice`: `deleted=1`, znany błąd, nieznany błąd, brak parametrów, `deleted` o innej wartości.

### Integration Tests:

- Kroki smoke z fazy 3. Usunięcie meczu z obserwacjami i notatkami dowodzi kaskady (inaczej klucz obcy odrzuciłby usunięcie).

### Manual Testing Steps:

1. Otwórz „Historia” i sprawdź kolejność oraz dane meczów.
2. Otwórz podsumowanie testowego meczu, rozwiń „Usuń mecz” i usuń. Sprawdź komunikat i brak meczu na liście.

## Migration Notes

Polityka i `grant delete`. Wycofanie kodu jest bezpieczne, bo poprzednia wersja nie usuwa meczów. Usunięte mecze są nieodwracalne, tak jak wymaga PRD. Wymaga `npx supabase db push` przed merge.

## References

- Podsumowanie (podgląd): `src/pages/matches/[id]/summary.astro`
- Wzorzec formularza z `?error=`: `src/pages/api/matches/[id]/tournament.ts`
- Kaskady: `supabase/migrations/20261125120000_create_match_observations_and_notes.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Uprawnienie i komunikaty

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 397c3c0
- [x] 1.2 Lint przechodzi: `npm run lint` — 397c3c0
- [x] 1.3 Typy przechodzą: `npx astro check` — 397c3c0

### Phase 2: Lista, usuwanie i nawigacja

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` — 2febe04
- [x] 2.2 Lint przechodzi: `npm run lint` — 2febe04
- [x] 2.3 Typy przechodzą: `npx astro check` — 2febe04
- [x] 2.4 Build przechodzi: `npm run build` — 2febe04

#### Manual

- [ ] 2.5 Na telefonie: lista pokazuje mecze od najnowszego, wiersz otwiera podsumowanie, a usunięcie wymaga rozwinięcia i drugiego przycisku i wraca na listę z komunikatem

### Phase 3: Smoke i wdrożenie

#### Automated

- [x] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs` — 8d4a2fa
- [x] 3.2 CI na PR zielone, w tym nowe kroki smoke — 8d4a2fa

#### Manual

- [ ] 3.3 `npx supabase db push` na produkcji przed merge, potwierdzony przez `npx supabase migration list --linked`
- [ ] 3.4 Po merge job `deploy` i smoke produkcyjny zielone
- [ ] 3.5 Na telefonie na produkcji: historia i usunięcie testowego meczu działają
- [ ] 3.6 Dziennik wdrożeń uzupełniony
