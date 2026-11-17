# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Ustawienia projektu Supabase poza repo

- **Context**: context/deployment/deploy-plan.md (3.4a); S-01 player-roster, wdrożenie 2026-11-17
- **Problem**: Po wdrożeniu pierwszej tabeli `/players` zwracało 500 (`PGRST002`), bo w produkcyjnym projekcie Supabase Data API nie udostępniało schematu `public` (log PostgREST: `pg_pgrst_no_exposed_schemas`). Smoke w CI tego nie wykrył, bo lokalny Supabase bierze ustawienia z `supabase/config.toml`, a produkcja z panelu.
- **Rule**: Przed pierwszym wdrożeniem wycinka, który dodaje tabelę lub korzysta z nowej usługi Supabase, sprawdź ustawienia produkcyjnego projektu, których nie ma w repo (Data API → Exposed schemas, Auth, Storage), i porównaj je z `supabase/config.toml`. Przy błędach PostgREST najpierw czytaj Logs → PostgREST w panelu.
- **Applies to**: /10x-plan i /10x-implement dla wycinków z migracją (S-02 i kolejne); deploy-plan.md sekcja 3
