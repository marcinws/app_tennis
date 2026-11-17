# Lista zawodników — Plan Brief

> Full plan: `context/changes/player-roster/plan.md`

## What & Why

Rodzic może zdefiniować zawodników (FR-002), których widzi wyłącznie zalogowany właściciel konta. To S-01 z roadmapy: pierwszy wycinek z danymi, który ustala wzorzec tabel z RLS i ścieżkę migracji na produkcję, potrzebne potem w S-02 (start meczu) i S-06 (cele).

## Starting Point

Działa logowanie Supabase z sesją w ciasteczkach i ochrona tras w middleware; nie ma żadnej tabeli ani migracji, a produkcyjny Supabase nie jest połączony z CLI. Na tym komputerze nie ma Dockera, więc bazę sprawdza tylko CI (job `smoke` stawia lokalny Supabase i stosuje migracje).

## Desired End State

Na `/players` zalogowany rodzic widzi swoich zawodników alfabetycznie, dodaje nowego i poprawia imię; duplikat lub błędne imię wraca z komunikatem po polsku. Smoke w CI dowodzi, że drugie konto nie widzi ani nie zmieni cudzego zawodnika. Migracja jest na produkcji przed kodem.

## Key Decisions Made

| Decision         | Choice                                                            | Why (1 sentence)                                                                  |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Migracja na prod | Ręcznie: `supabase link` raz, `supabase db push` przed merge      | Bez sekretów bazy w CI i z kontrolą nad zmianą, której rollback Workera nie cofa. |
| Przepływ         | Gałąź `player-roster` + PR, merge po `db push`                    | Push na `main` wdraża od razu, a CI dla PR sprawdza bazę bez wdrożenia.           |
| Operacje         | Lista, dodawanie, zmiana imienia; bez usuwania                    | Brak usuwania nie zderzy się z meczami i celami z późniejszych wycinków.          |
| Duplikaty        | Odrzucane: po przycięciu i bez wielkości liter, w obrębie konta   | Na liście wyboru przy starcie meczu nie będzie dwóch identycznych pozycji.        |
| Reguły imienia   | 1–50 znaków, spacje znormalizowane; w funkcji domenowej i w bazie | Jedno źródło reguł z testem, a baza pilnuje ich niezależnie od kodu.              |
| Izolacja         | Smoke `full` z kontem A i B w CI                                  | Sprawdza całą ścieżkę HTTP → RLS na prawdziwej bazie przy każdym PR.              |
| Miejsce          | Strona `/players`, link „Zawodnicy” w pasku                       | Osobny adres, do którego odeślą kolejne wycinki; przykład startera zostaje.       |
| Błędy            | Walidacja/duplikat → komunikat; inny błąd bazy → log + 500        | Zasada „nie ukrywaj dowodów”: awaria nie staje się przekierowaniem.               |
| UI               | Zwykłe formularze HTML w Astro, po polsku                         | React tylko dla stanu po stronie klienta, którego tu nie ma.                      |

## Scope

**In scope:**

- Migracja `players` z RLS (select/insert/update dla `authenticated`, tylko właściciel)
- `parsePlayerName` z testami, typ `Player`
- Trasy `POST /api/players` i `POST /api/players/[id]`, strona `/players`, link w pasku
- Smoke z dwoma kontami, procedura migracji w `deploy-plan.md` i `CLAUDE.md`

**Out of scope:**

- Usuwanie zawodników, dodatkowe pola, automatyczne migracje w CI, pgTAP
- Tłumaczenie ekranów logowania, usuwanie `/dashboard`, generowane typy bazy

## Architecture / Approach

Formularz HTML wysyła `POST` do trasy Astro; trasa waliduje kształt przez `astro/zod`, normalizuje imię funkcją domenową i zapisuje przez klienta Supabase z sesją użytkownika, więc RLS i `auth.uid()` decydują o dostępie. Duplikat wykrywa unikalny indeks bazy (`23505`), a zmiana cudzego zawodnika kończy się `404`, bo RLS ukrywa wiersz i update nie dotyka żadnego rekordu.

## Phases at a Glance

| Phase                               | What it delivers                                         | Key risk                                                |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 1. Tabela i reguły imienia          | Migracja z RLS, `parsePlayerName` + testy, typ           | Błąd w SQL wyjdzie dopiero w CI (brak Dockera lokalnie) |
| 2. Strona /players i trasy API      | Lista, dodawanie, zmiana imienia, ochrona tras           | Bez bazy lokalnie zachowanie sprawdzi dopiero smoke     |
| 3. Izolacja w smoke, PR i wdrożenie | Smoke A/B, procedura migracji, `db push`, merge, telefon | Merge przed `db push` = 500 na produkcji                |

**Prerequisites:** F-01 (Vitest) gotowe; dostęp do panelu Supabase i `npx supabase login` po Twojej stronie.
**Estimated effort:** jedna–dwie sesje w trzech fazach, plus Twoje kroki `link` i `db push`.

## Open Risks & Assumptions

- Zakładamy, że domyślne uprawnienia Supabase dla `authenticated` na tabelach w `public` pozwalają na insert/update, a RLS je zawęża.
- Pierwsze uruchomienie migracji następuje w CI; poprawki SQL mogą wymagać kilku pushy na gałąź PR.

## Success Criteria (Summary)

- Rodzic na telefonie dodaje zawodnika, poprawia imię i dostaje komunikat przy duplikacie.
- Smoke w CI pokazuje, że drugie konto nie widzi i nie zmieni cudzego zawodnika.
- Kod z tabelą działa na produkcji bez błędów 500 po wdrożeniu.
