---
change_id: review-fixes-in-match-observations
title: Poprawki z przeglądu kodu S-07 (kolejka obserwacji i notatek)
status: archived
created: 2026-11-25
updated: 2026-11-25
archived_at: 2026-11-25T13:06:07Z
---

## Notes

Poprawki z `/code-review 13` (S-07): punkty 1, 2, 3, 6, 8, 9.

Świadomie pominięte:

- 4: `23505` → 200 bez sprawdzenia meczu wiersza — tylko przy powtórzonym id (losowy uuid z telefonu); zdradza jedynie istnienie id.
- 5: cel zakończony przed synchronizacją znika z ekranu meczu po przeładowaniu — obserwacje i tak trafiają na serwer i do podsumowania (S-08).
- 7: limit rozmiaru tylko z `Content-Length` — dotyczy wyłącznie spreparowanych żądań zalogowanego właściciela.
