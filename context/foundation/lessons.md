# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Ustawienia projektu Supabase poza repo

- **Context**: context/deployment/deploy-plan.md (3.4a); S-01 player-roster, wdrożenie 2026-11-17
- **Problem**: Po wdrożeniu pierwszej tabeli `/players` zwracało 500 (`PGRST002`), bo w produkcyjnym projekcie Supabase Data API nie udostępniało schematu `public` (log PostgREST: `pg_pgrst_no_exposed_schemas`). Smoke w CI tego nie wykrył, bo lokalny Supabase bierze ustawienia z `supabase/config.toml`, a produkcja z panelu.
- **Rule**: Przed pierwszym wdrożeniem wycinka, który dodaje tabelę lub korzysta z nowej usługi Supabase, sprawdź ustawienia produkcyjnego projektu, których nie ma w repo (Data API → Exposed schemas, Auth, Storage), i porównaj je z `supabase/config.toml`. Przy błędach PostgREST najpierw czytaj Logs → PostgREST w panelu.
- **Applies to**: /10x-plan i /10x-implement dla wycinków z migracją (S-02 i kolejne); deploy-plan.md sekcja 3

## Uprawnienia tylko na kolumny z formularza

- **Context**: supabase/migrations/20261117140000_create_matches.sql:37-38; przegląd S-02 match-start (F1, F4), 2026-11-17
- **Problem**: `authenticated` miało `insert`/`update` na całe tabele `players` i `matches`, więc właściciel mógł przez PostgREST wstawić wiersz z własnym `id` i `created_at` (np. zmienić „ostatni mecz”). RLS ogranicza wiersze, nie kolumny. Polityki z gołym `auth.uid()` liczą funkcję dla każdego wiersza.
- **Rule**: Przy każdej nowej tabeli i każdym nowym uprawnieniu `insert`/`update` nadawaj je na kolumny, które faktycznie wysyła trasa (`grant insert (kol1, kol2) …`), a `id`, `owner_id`, `created_at` zostaw domyślnym wartościom. W politykach RLS pisz `(select auth.uid())`, nie `auth.uid()`.
- **Applies to**: /10x-plan, /10x-implement i /10x-impl-review dla wycinków z migracją (S-03 i kolejne, szczególnie przy dodaniu `update` na `matches`)

## Migracja potwierdzona przed merge

- **Context**: S-07, S-08, S-09 (2026-11-25), `context/deployment/deploy-plan.md` (dziennik wdrożeń)
- **Problem**: Trzy razy z rzędu `npx supabase db push` uruchomiony poza sesją agenta nie zapisał migracji na produkcji, choć użytkownik zgłosił ją jako wypchniętą. Merge na `main` wdraża kod od razu, więc nowa tabela lub uprawnienie dałyby na produkcji 500.
- **Rule**: Przed merge PR z migracją uruchom `npx supabase migration list --linked` i sprawdź, że nowa migracja ma wartość w kolumnie `remote`. Bez tego nie merguj. `db push` najlepiej uruchamiać w sesji (`! npx supabase db push`), żeby jego wynik był widoczny.
- **Applies to**: /10x-implement i każdy merge PR z plikiem w `supabase/migrations/`; deploy-plan.md punkt 3.5
