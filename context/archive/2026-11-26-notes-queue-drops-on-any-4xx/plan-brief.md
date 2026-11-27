# Kolejka notatek usuwa wpis tylko przy znanym odrzuceniu — Plan Brief

> Full plan: `context/changes/notes-queue-drops-on-any-4xx/plan.md`
> Audyt (zamiast research): `context/audits/observability/2026-11-26_point-sync-notes-deletion.md` (N1, N2)

## What & Why

Kolejka obserwacji i notatek usuwa wpis z telefonu przy każdej odpowiedzi 4xx poza 401, 408 i 429. Dotyczy to także odpowiedzi spoza aplikacji, takich jak 403 z WAF Cloudflare, HTML-owa 404 po wdrożeniu czy 413 z platformy. Jedno wdrożenie albo jedna reguła WAF może więc po cichu skasować notatki wielu rodziców, a serwer nie zostawi o tym żadnego śladu.

## Starting Point

`interpretNotesResponse` (`src/lib/services/match-notes.ts:201-225`) traktuje każde 4xx jako ostateczne. Hook usuwa wtedy wpis z kolejki i zapisuje go tylko w `:rejected` na telefonie. Trasy notatek i obserwacji zwracają zamknięty zbiór 7 kodów JSON i nie logują żadnego z nich.

## Desired End State

Wpis znika z kolejki tylko wtedy, gdy nasza trasa zwróciła znany kod, np. `text_too_long` albo `goal_not_found`. Każde inne 4xx zostawia wpis na ekranie ze statusem „Błąd zapisu obserwacji (http_403), ponawiam”, a kolejka ponawia z backoffem. Każde odrzucenie w trasie zostawia w Workers Logs linię `console.warn` z meczem, wpisem, użytkownikiem i kodem.

## Key Decisions Made

| Decision                            | Choice                                                                               | Why (1 sentence)                                                                  | Source          |
| ----------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------- |
| Co z nieznanym 4xx                  | Ponawiać jak 5xx (`retry`, `http_<status>`)                                          | Zero utraty danych i brak nowego UI, bo ścieżka retry z komunikatem już istnieje. | Plan            |
| Kiedy usuwać wpis                   | Tylko przy kodzie z eksportowanego zbioru `NOTES_REJECTION_CODES`                    | Tylko nasza trasa wie, że wpis jest trwale zły. Status bez kodu tego nie mówi.    | Plan (audyt N1) |
| Spójność kodów klient–trasa         | Helper odrzucenia w trasach typowany `NotesRejectionCode`                            | Nowy kod w trasie bez wpisu w zbiorze nie przejdzie `astro check`.                | Plan            |
| Logi odrzuceń na serwerze           | Tak, w tej zmianie: `console.warn` z route, method, matchId, id wpisu, userId, kodem | Bez tego odrzucenia, które nadal kasują wpis, nie zostawiają śladu.               | Plan (audyt N2) |
| Asercja „400 bez treści → rejected” | Zmieniona na `retry`                                                                 | Zmieniło się samo wymaganie. Stara asercja opisywała błąd.                        | Plan            |

## Scope

**In scope:**

- `interpretNotesResponse` i zbiór znanych kodów w `match-notes.ts`, plus testy regresji
- `console.warn` przy każdym 4xx w trasach notatek i obserwacji

**Out of scope:**

- wspólny helper logowania dla aplikacji i kanał błędów z przeglądarki
- kolejka punktów (`match-sync.ts`)
- limit prób albo wstrzymanie kolejki przy trwałym 403
- ustalenia N3–N10 z audytu

## Architecture / Approach

Jeden zbiór kodów żyje w `match-notes.ts`. Klient używa go, żeby rozstrzygnąć między `rejected` a `retry`. Trasy używają jego typu w lokalnym helperze, który loguje i zwraca dokładnie tę samą odpowiedź co dziś. UI i hook się nie zmieniają, bo ścieżki `retry` i `rejected` już istnieją.

## Phases at a Glance

| Phase                                     | What it delivers                                                            | Key risk                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Biała lista kodów odrzucenia w kolejce | Testy regresji (najpierw czerwone), potem `rejected` tylko dla znanego kodu | Trwały 403 blokuje kolejkę i ponawia bez końca (świadoma decyzja)                    |
| 2. Logi odrzuceń w trasach                | `console.warn` z kontekstem przy każdym 4xx w obu trasach                   | Przypadkowa zmiana statusu lub treści odpowiedzi, czego nie złapią testy jednostkowe |

**Prerequisites:** brak, bo zmiana nie ma migracji. Pracować na gałęzi i przez PR, zgodnie z CLAUDE.md.
**Estimated effort:** ~1 sesja, 2 małe fazy.

## Open Risks & Assumptions

- Zakładamy, że WAF i platforma nie zwracają JSON-a z polem `error` równym jednemu z naszych kodów.
- Trasy nie mają testów jednostkowych, więc niezmienność odpowiedzi w fazie 2 sprawdza się ręcznie i przez typy.

## Success Criteria (Summary)

- Notatka zablokowana odpowiedzią 403 zostaje na ekranie i zapisuje się po zdjęciu blokady.
- Odrzucenie z naszej trasy nadal usuwa wpis, ale zostawia linię w Workers Logs z meczem, wpisem i użytkownikiem.
- Testy regresji N1 są w zestawie i przechodzą.
