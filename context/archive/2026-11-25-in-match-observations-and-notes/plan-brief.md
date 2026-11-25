# Obserwacje przy celach i notatki podczas meczu — Plan Brief

> Full plan: `context/changes/in-match-observations-and-notes/plan.md`

## What & Why

Rodzic podczas meczu zaznacza obserwację przy celu jednym dotknięciem (FR-014) i dopisuje krótkie notatki (FR-015). To S-07 z roadmapy. Bez tego podsumowanie po meczu (S-08) nie ma czego pokazać poza wynikiem.

## Starting Point

Ekran meczu pokazuje aktywne cele zawodnika jako statyczną listę nad wyspą `MatchRecorder`. Punkty przeżywają brak sieci dzięki kopii na telefonie i kolejce w `useMatchLog`. Tabel obserwacji i notatek nie ma.

## Desired End State

Cele na ekranie meczu są przyciskami z licznikiem obserwacji i cofaniem „−”. Pod nimi jest pole krótkiej notatki i lista notatek z usuwaniem. Wszystko zapisuje się od razu na telefonie i dociera na serwer po powrocie sieci. Widzi to wyłącznie właściciel konta.

## Key Decisions Made

| Decision       | Choice                                                                                   | Why (1 sentence)                                                                          |
| -------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Brak sieci     | Obserwacje i notatki przeżywają brak sieci jak punkty (kopia na telefonie + kolejka)     | Rodzic nie odróżni, który wpis „nie musiał” przetrwać; utrata notatek łamie US-01         |
| Model danych   | Osobne tabele `match_observations` i `match_notes`, nie log meczu                        | „Cofnij” i limit akcji dotyczą wyniku; obserwacje nie mogą go zaburzać                    |
| Idempotencja   | Id z telefonu (uuid), `23505` = już zapisane                                             | Ponowienia bez rewizji i bez konfliktów, bo wpisy tylko się dodaje i usuwa                |
| Spójność       | Złożone klucze obce: obserwacja → cel zawodnika meczu tego samego konta                  | Gwarancja w bazie zamiast sprawdzenia w trasie                                            |
| Obserwacja     | Jeden rodzaj: dotknięcie = +1 przy celu, „−” cofa ostatnią przy tym celu                 | Najszybsze możliwe zaznaczenie, zgodnie z ryzykiem z PRD (obserwacja szybsza niż notatka) |
| Notatka        | Najwyżej 200 znaków, przypięta do meczu, usuwanie z potwierdzeniem, bez edycji           | „Krótkie notatki” z FR-015; notatki nie da się odtworzyć                                  |
| Zakończony cel | Niezmienny także w bazie (`using (… and active)`); cel z obserwacjami zostaje na ekranie | Odpowiedź na pytanie z roadmapy i F4 z przeglądu S-06                                     |
| Ekran          | Osobna wyspa `MatchNotes` nad wynikiem                                                   | Dotknięcia celów nie renderują ponownie przycisków punktów (NFR 200 ms)                   |
| Testy          | Unit dla reguł kolejki + kroki smoke (idempotencja, RLS między kontami) + telefon        | Ten sam wzorzec co poprzednie wycinki                                                     |

Decyzje przyjęte według rekomendacji, bez wywiadu (prośba użytkownika). Rozstrzyga to też oba pytania z „Unknowns” S-07 w roadmapie.

## Scope

**In scope:** tabele i RLS, zaostrzenie polityki celów, 4 trasy, kolejka na telefonie, wyspa na ekranie meczu, smoke, wdrożenie.

**Out of scope:** rodzaje obserwacji, edycja notatek, przypinanie notatki do celu/gema, limity liczby wpisów, zapis treści celu przy obserwacji, podsumowanie (S-08), usuwanie meczu (S-09), Playwright.

## Architecture / Approach

Wyspa `MatchNotes` → hook `useMatchNotes` (stan + kolejka w localStorage `match-notes:<matchId>`) → po jednej operacji `PUT`/`DELETE /api/matches/<id>/{observations,notes}/<uuid>` → Supabase z RLS. Reguły kolejki to czyste funkcje w `src/lib/services/match-notes.ts`, a backoff jest wspólny z `match-sync.ts`.

## Phases at a Glance

| Phase                                      | What it delivers                       | Key risk                                                 |
| ------------------------------------------ | -------------------------------------- | -------------------------------------------------------- |
| 1. Reguły i tabele                         | `match-notes.ts` z testami, migracja   | Migracja sprawdzana dopiero w CI (brak Dockera lokalnie) |
| 2. Trasy, kolejka i wyspa na ekranie meczu | 4 trasy, `useMatchNotes`, `MatchNotes` | Kolejka gubi lub dubluje wpis przy zgubionej odpowiedzi  |
| 3. Smoke i wdrożenie                       | Kroki smoke, PR, `db push`, wdrożenie  | Merge przed `db push` = 500 na ekranie meczu             |

**Prerequisites:** S-06 wdrożony (jest).
**Estimated effort:** ~2 sesje w 3 fazach.

## Open Risks & Assumptions

- Zmiana tekstu aktywnego celu zmienia jego opis także w starszych meczach. Przyjmujemy, że edycja to poprawka literówki.
- Kolejność notatek wynika z kolejności dotarcia na serwer. Kolejka wysyła po kolei, więc to kolejność dodania na jednym telefonie.
- Przed `db push` trzeba sprawdzić ustawienia produkcyjnego Supabase spoza repo (lekcja z S-01).

## Success Criteria (Summary)

- Rodzic jednym dotknięciem zaznacza obserwację przy celu i może ją cofnąć.
- Rodzic dopisuje i usuwa krótkie notatki w trakcie meczu.
- Nic nie ginie przy braku sieci, a wpisy widzi wyłącznie właściciel konta.
