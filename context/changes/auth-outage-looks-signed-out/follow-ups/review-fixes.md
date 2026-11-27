# Follow-ups from implementation review

Source: `reviews/impl-review.md` (2026-11-27)

## F3 — Strona 503 przy awarii Auth to goły tekst

- **Where**: `src/middleware.ts` (`authUnavailable`, wariant tekstowy)
- **What**: Rodzic, który odświeży chronioną stronę w trakcie awarii Supabase Auth, widzi sam tekst bez layoutu i bez przycisku ponowienia. Dane w kolejce są bezpieczne.
- **Proposed change**: Razem z przyczyną nr 5 z audytu observability (brak `src/pages/500.astro`) dodać stronę błędu w layoucie aplikacji z przyciskiem „Odśwież” i oprzeć na niej także tę odpowiedź.
- **Status**: open
