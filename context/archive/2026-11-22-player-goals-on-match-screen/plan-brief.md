# Cele zawodnika na ekranie meczu — Plan Brief

> Full plan: `context/changes/player-goals-on-match-screen/plan.md`

## What & Why

Rodzic definiuje i zmienia cele treningowe zawodnika (najwyżej 3 aktywne, FR-012) i widzi je na ekranie meczu przez cały zapis (FR-013). To S-06 z roadmapy; otwiera drogę do obserwacji przy celach (S-07) i podsumowania (S-08).

## Starting Point

Są zawodnicy (`players` z RLS i uprawnieniami na kolumny), strona `/players` i ekran meczu z wyspą `MatchRecorder`. Celów nie ma ani w bazie, ani w kodzie.

## Key Decisions Made

| Decision       | Choice                                                                                        | Why (1 sentence)                                                |
| -------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Model danych   | Tabela `player_goals` z `active`; cel się kończy, nie usuwa                                   | S-07 przypnie do celów obserwacje, więc cele muszą przetrwać    |
| Limit 3        | Sprawdzenie w trasie + wyzwalacz w bazie z blokadą wiersza zawodnika                          | Dwa równoczesne zapisy nie dadzą czwartego celu                 |
| Bezpieczeństwo | RLS właściciela, złożony FK do zawodnika, `insert (player_id, text)`, `update (text, active)` | Wzorzec `matches` i lekcja o uprawnieniach na kolumny           |
| Zarządzanie    | Strona `/players/<id>`: dodaj, zmień tekst, zakończ                                           | Lista zawodników zostaje prosta; trasy pod chronionym prefiksem |
| Ekran meczu    | Sekcja „Cele” w HTML nad wynikiem, bieżące aktywne cele                                       | Bez pracy dla wyspy React, więc bez wpływu na 200 ms            |
| Testy          | Unit + kroki smoke (limit, RLS, ekran meczu) + telefon                                        | Ten sam wzorzec co poprzednie wycinki                           |

Decyzje przyjęte według rekomendacji, bez wywiadu (prośba użytkownika).

## Scope

**In scope:** tabela i reguły celów, strona celów, sekcja na ekranie meczu, smoke, wdrożenie.

**Out of scope:** usuwanie i przywracanie celów, kolejność celów, zapis celów przy meczu, edycja z ekranu meczu, obserwacje i notatki (S-07), podsumowanie (S-08), Playwright.

## Phases at a Glance

| Phase                                         | What it delivers                             | Key risk                                         |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| 1. Reguły i tabela celów                      | `goals.ts`, migracja z RLS i wyzwalaczem     | Wyzwalacz bez uprawnienia do blokady zawodnika   |
| 2. Zarządzanie celami i cele na ekranie meczu | Trasy, strona `/players/<id>`, sekcja „Cele” | Sekcja spycha przyciski punktów na małym ekranie |
| 3. Smoke i wdrożenie                          | Kroki smoke, `db push`, PR, wdrożenie        | Merge przed `db push` = 500 na ekranie meczu     |

**Prerequisites:** S-01 i S-03 wdrożone (są).
**Estimated effort:** ~2 sesje w 3 fazach.

## Open Risks & Assumptions

- Ekran meczu pokazuje bieżące cele zawodnika, nie cele z dnia meczu; zapis stanu celów przy meczu rozstrzygnie S-07/S-08.
- Przed `db push` trzeba sprawdzić ustawienia produkcyjnego Supabase spoza repo (lekcja z S-01).

## Success Criteria (Summary)

- Rodzic ustawia do 3 aktywnych celów zawodnika, zmienia ich treść i kończy je.
- Cele zawodnika są widoczne na ekranie meczu przez cały zapis, bez spowolnienia przycisków.
- Cele widzi i zmienia wyłącznie właściciel konta.
