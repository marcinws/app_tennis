# Start meczu — Plan Brief

> Full plan: `context/changes/match-start/plan.md`

## What & Why

Rodzic rozpoczyna mecz: wybiera swojego zawodnika, wpisuje nazwę turnieju albo zostawia ją pustą, wybiera format i wskazuje pierwszego serwującego (FR-003, FR-004, FR-020). To wycinek S-02 z roadmapy i warunek gwiazdy przewodniej S-03, która na stronie meczu zbuduje zapis punktów.

## Starting Point

Działa logowanie i lista zawodników z S-01 (`public.players` z RLS, strona `/players`, smoke z dwoma kontami). Nie ma żadnej tabeli meczów ani strony meczu; reguły wyniku to na razie tylko `pointLabel`.

## Desired End State

Na `/matches/new` rodzic wypełnia krótki formularz i trafia na `/matches/<id>` z danymi startu. Nad formularzem widzi odnośnik do ostatniego meczu, a bez zawodników — odnośnik do `/players`. Mecz widzi i tworzy wyłącznie właściciel konta, a baza nie pozwala wskazać cudzego zawodnika.

## Key Decisions Made

| Decision             | Choice                                                                         | Why (1 sentence)                                                                               |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Przewagi w gemach    | Kolumna `with_advantage` z domyślnym `true`, bez przełącznika; wybór doda S-05 | S-03 liczy tylko gemy z przewagami, a schemat nie wymaga później migracji danych.              |
| Przyszłe formaty     | Formularz pokazuje tylko formaty z listy domenowej (dziś jeden)                | Rodzic nie trafi na nieczynną opcję; S-05 tylko dopisuje pozycje i rozszerza `check`.          |
| Przeciwnik           | Bez imienia przeciwnika; strony to zawodnik i „Przeciwnik”                     | Zgodne z PRD i mniej pól przy korcie.                                                          |
| Po starcie           | Strona `/matches/<id>` z danymi startu                                         | S-03 dostaje gotowy adres i odczyt meczu, smoke sprawdza izolację na prawdziwej stronie.       |
| Powrót do meczu      | Odnośnik do najnowszego meczu na `/matches/new`, link „Mecz” w pasku           | Jedno zapytanie bez statusu meczu; S-09 zastąpi to pełną listą.                                |
| Edycja danych startu | Brak w S-02 (brak polityki `update`)                                           | Serwującego poprawia S-03, turniej uzupełnia S-08; mniejsza powierzchnia RLS.                  |
| Cudzy zawodnik       | Złożony klucz obcy `(player_id, owner_id) → players (id, owner_id)`            | Zwykły klucz obcy omija RLS, więc tylko baza może zagwarantować zawodnika z tego samego konta. |

## Scope

**In scope:**

- Migracja `matches` z RLS (`select`, `insert`), ograniczonymi uprawnieniami i złożonym kluczem obcym.
- `src/lib/services/matches.ts` z listą formatów, regułami startu, kodami błędów i testami.
- `/matches/new`, `POST /api/matches`, `/matches/[id]`, chronione trasy, link w pasku.
- Smoke: start meczu i izolacja kont A/B w CI, przekierowanie niezalogowanego na produkcji.
- Kontrola ustawień produkcyjnego Supabase według lekcji, PR, `db push`, wdrożenie.

**Out of scope:** przełącznik przewag i przyszłe formaty (S-05), imię przeciwnika, edycja i usuwanie meczów, lista meczów (S-09), status meczu, liczenie wyniku i serwującego (S-03), React na stronach meczu.

## Architecture / Approach

Formularz HTML → `POST /api/matches` (zod dla kształtu i `uuid`, `parseMatchStart` dla reguł) → insert przez klienta z sesją użytkownika; `owner_id` z `auth.uid()`, polityka `insert` i złożony klucz obcy pilnują właściciela i zawodnika. Naruszenie klucza obcego (`23503`) wraca jako komunikat, inne błędy są logowane i dają `500`. Strony czytają przez RLS; cudzy mecz to zero wierszy → `404`.

## Phases at a Glance

| Phase                                      | What it delivers                                       | Key risk                                                        |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| 1. Tabela meczów i reguły startu           | Migracja z RLS i złożonym FK, moduł domenowy z testami | Rozjazd identyfikatorów formatów między listą a `check` w bazie |
| 2. Start meczu i strona meczu              | Formularz, trasa, strona meczu, ochrona tras           | Brak bazy lokalnie — zachowanie widać dopiero w CI              |
| 3. Smoke, ustawienia produkcji i wdrożenie | Izolacja meczów w CI, kontrola produkcji, wdrożenie    | Merge przed `db push` daje 500 na produkcji                     |

**Prerequisites:** S-01 wdrożone (jest); Supabase CLI połączone z produkcją (`supabase/.temp/project-ref`); `db push` wykonujesz Ty przed merge.
**Estimated effort:** ~2 sesje w 3 fazach, podobnie jak S-01.

## Open Risks & Assumptions

- „Ostatni mecz” to najnowszy rozpoczęty, także zakończony — do czasu statusu meczu z S-03/S-08.
- Pomyłka przy starcie zostaje w bazie do S-09 (usuwanie); rodzic zaczyna nowy mecz.
- Bez Dockera lokalnie bazę i RLS sprawdza tylko smoke w CI.

## Success Criteria (Summary)

- Na telefonie rodzic rozpoczyna mecz z turniejem i bez i widzi poprawne dane startu.
- Smoke w CI dowodzi, że drugie konto nie widzi meczu i nie użyje cudzego zawodnika.
- Wdrożenie z `main` zielone, a ustawienia produkcji zgodne z lekcją.
