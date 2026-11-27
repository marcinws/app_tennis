---
change_id: auth-outage-looks-signed-out
title: Awaria Supabase Auth nie wygląda jak wylogowanie
status: impl_reviewed
created: 2026-11-27
updated: 2026-11-27
archived_at: null
---

## Notes

Ustalenie P1 z `context/audits/observability/2026-11-26_point-sync-notes-deletion.md`: middleware ignoruje błąd z `getUser()`, więc przerwa w Supabase Auth, 429 albo błąd sieci kończy się przekierowaniem do logowania. Rodzic w trakcie meczu widzi „Sesja wygasła”, synchronizacja staje, a w Workers Logs są tylko zwykłe 302. Użytkownik poprosił o poprawkę bez osobnego wywiadu planistycznego; decyzje są w planie.
