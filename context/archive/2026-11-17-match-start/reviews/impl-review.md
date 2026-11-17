<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Start meczu

- **Plan**: context/changes/match-start/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Zgodność z planem: wszystkie 11 pozycji „Changes Required” MATCH, brak naruszeń „What We're NOT Doing”. Kryteria automatyczne lokalnie zielone (testy 50/50, greps migracji, lint, `astro check`, build), CI PR #3 zielone (smoke 30/30), produkcja: migracja, RLS, polityki i uprawnienia sprawdzone zapytaniem, smoke production 6/6, test na telefonie potwierdzony.

## Findings

### F1 — Klient może ustawić `created_at` i `id` meczu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261117140000_create_matches.sql:37-38
- **Detail**: `authenticated` ma `insert` na całą tabelę, więc przez PostgREST (z kluczem publishable i własną sesją) można wstawić mecz z dowolnym `created_at` lub `id`. Polityka `insert` pilnuje tylko `owner_id = auth.uid()`, więc szkoda dotyczy wyłącznie własnych danych: można np. zmienić, który mecz `/matches/new` pokazuje jako ostatni (`new.astro:27`, sortowanie po `created_at`). To samo dotyczy `players` (`created_at`, `id`). S-03 doda `update` na `matches`, gdzie ten sam problem obejmie więcej kolumn.
- **Fix A ⭐ Recommended**: Nowa migracja z uprawnieniami na kolumny dla `matches` i `players` (`revoke insert …; grant insert (<kolumny z formularza>) …`, dla `players` także `update (name)`) plus lekcja na kolejne tabele
  - Strength: Zamyka lukę w bazie, niezależnie od tras; S-03 dostaje gotowy wzorzec do `update`.
  - Tradeoff: Kolejna migracja z `db push` przed merge i PR; trzeba dopilnować, by insert przez trasy nadal działał (smoke w CI to sprawdzi).
  - Confidence: HIGH — uprawnienia na kolumny to standardowy mechanizm Postgresa, a `owner_id` i `created_at` biorą wartość z domyślnych.
  - Blind spot: Nie sprawdzono, czy `select("id")` po insercie wymaga dodatkowych uprawnień (powinien wystarczyć `select` na tabelę).
- **Fix B**: Tylko lekcja: uprawnienia na kolumny od S-03 (przy dodaniu `update`), bez zmiany istniejących tabel
  - Strength: Bez migracji teraz; zmiana trafi tam, gdzie i tak powstaje nowe uprawnienie.
  - Tradeoff: Do tego czasu `created_at` i `id` pozostają ustawialne przez właściciela.
  - Confidence: MED — ryzyko dotyczy tylko własnych danych właściciela.
  - Blind spot: S-03 może o tym zapomnieć, jeśli lekcja nie zostanie przeczytana.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Uprawnienia tylko na kolumny z formularza (Fixed via Fix A: migracja 20261117160000_restrict_columns_and_rls_initplan)

### F2 — Każde `23503` zamienia się w „Nie znaleziono zawodnika” bez logu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/matches/index.ts:53
- **Detail**: Insert ma dwa klucze obce: złożony `matches_player_id_owner_id_fkey` i `matches_owner_id_fkey` (do `auth.users`). Trasa mapuje każde naruszenie klucza obcego na `player_not_found` i niczego nie loguje, więc błąd drugiego klucza zostałby ukryty jako komunikat dla rodzica (zasada „Nigdy nie ukrywaj dowodów” z `CLAUDE.md`). Middleware weryfikuje użytkownika przez `auth.getUser()`, więc w praktyce to rzadkie, ale mapowanie jest szersze niż zamiar.
- **Fix**: Mapuj na `player_not_found` tylko naruszenie `matches_player_id_owner_id_fkey` (sprawdzenie nazwy ograniczenia w `error.message`); każde inne `23503` logować i zwracać 500.
- **Decision**: FIXED (mapowanie tylko dla matches_player_id_owner_id_fkey)

### F3 — Smoke nie dowodzi, że start z cudzym zawodnikiem zablokował klucz obcy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:170 (i :146)
- **Detail**: Kroki „second account cannot start a match for first account's player” i „unknown match format is rejected” oczekują tylko prefiksu `/matches/new?error=`. Przeszłyby też, gdyby trasa odrzuciła żądanie z innego powodu (np. regresja walidacji), więc nie dowodzą działania złożonego klucza obcego ani walidacji formatu. Log CI pokazał właściwe kody, ale asercja ich nie wymaga.
- **Fix**: Oczekiwać `/matches/new?error=player_not_found` i `/matches/new?error=format_invalid`.
- **Decision**: FIXED (smoke oczekuje format_invalid i player_not_found)

### F4 — Polityki RLS wywołują `auth.uid()` dla każdego wiersza

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261117140000_create_matches.sql:25-33
- **Detail**: Doradca Supabase (`auth_rls_initplan`) zaleca `(select auth.uid())`, żeby funkcja liczyła się raz na zapytanie. Polityki `players` mają ten sam wzorzec; przy skali MVP bez znaczenia, ale przy liście meczów (S-09) koszt rośnie z liczbą wierszy.
- **Fix**: W kolejnej migracji z politykami (np. razem z F1 albo w S-03) przepisać polityki `players` i `matches` na `(select auth.uid())`.
- **Decision**: FIXED (w migracji 20261117160000)

### F5 — Każdy błąd schematu formularza pokazuje „Wybierz zawodnika”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/matches/index.ts:26
- **Detail**: Nieudany `safeParse` zawsze daje `player_missing`, także gdy w polu tekstowym przyjdzie plik. Osiągalne tylko spreparowanym żądaniem; formularz wysyła tekst.
- **Fix**: Zostawić albo wybierać kod błędu po ścieżce nieudanego pola.
- **Decision**: SKIPPED
