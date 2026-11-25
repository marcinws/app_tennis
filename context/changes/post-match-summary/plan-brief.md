# Podsumowanie po meczu — Plan Brief

> Full plan: `context/changes/post-match-summary/plan.md`

## What & Why

Rodzic po meczu widzi na jednym ekranie wynik, cele, obserwacje i notatki (FR-016) i może uzupełnić pustą nazwę turnieju (FR-003). To S-08; domyka US-01 i główne kryterium sukcesu MVP.

## Starting Point

Ekran meczu zbiera już wszystkie dane (log, cele, obserwacje, notatki), ale pokazuje je tylko w trakcie zapisu. Nazwy turnieju po starcie nie da się zmienić, bo `authenticated` ma `update` tylko na `events, revision`.

## Desired End State

Po meczu link „Zobacz podsumowanie” prowadzi na `/matches/<id>/summary`. Ten ekran pokazuje wynik setów, zwycięzcę, przebieg gemów, cele z liczbą obserwacji i notatki z godziną. Gdy nazwa turnieju jest pusta, jest tam formularz do jej uzupełnienia.

## Key Decisions Made

| Decision          | Choice                                                                             | Why (1 sentence)                                                   |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Miejsce           | Osobna strona `/matches/<id>/summary`, statyczny `.astro`                          | S-09 użyje jej jako podglądu meczu; brak wyspy = szybkie wczytanie |
| Kiedy dostępne    | Zawsze; wyróżniony link po zakończeniu meczu                                       | Mecz może się nie skończyć (krecz), a dane i tak chcemy zobaczyć   |
| Wynik             | `replayMatch` na serwerze + `GameList` bez hydratacji                              | Te same reguły co ekran meczu, zero nowej logiki liczenia          |
| Cele              | Obserwowane w meczu + aktywne utworzone przed startem meczu, z liczbą (także 0)    | Cel dodany po meczu nie udaje celu tego meczu                      |
| Nazwa turnieju    | Tylko uzupełnienie pustej (`.is("tournament_name", null)`), bez edycji istniejącej | Dokładnie FR-003; edycja to inna decyzja                           |
| Uprawnienia       | `grant update (tournament_name)` na `matches`                                      | Lekcja o uprawnieniach na kolumny; polityka właściciela już jest   |
| Dane na telefonie | Ostrzeżenie z linkiem do meczu, gdy log lub notatki czekają w localStorage         | Podsumowanie z serwera mogłoby być niepełne bez słowa              |
| Testy             | Unit (`summary.ts`) + kroki smoke (podsumowanie, nazwa, RLS) + telefon             | Ten sam wzorzec co poprzednie wycinki                              |

Decyzje przyjęte według rekomendacji, bez wywiadu (prośba użytkownika). Odpowiada to też na pytanie S-09: podgląd = ten ekran.

## Scope

**In scope:** strona podsumowania, trasa uzupełnienia nazwy, migracja uprawnienia, linki z ekranu meczu, ostrzeżenie o danych na telefonie, smoke, wdrożenie.

**Out of scope:** statystyki, edycja istniejącej nazwy, ręczne kończenie meczu, lista i usuwanie meczów (S-09), Playwright.

## Phases at a Glance

| Phase                                         | What it delivers                             | Key risk                                                       |
| --------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| 1. Reguły podsumowania i uprawnienie          | `summary.ts` z testami, komunikaty, migracja | Zapis tie-breaków w wyniku niezgodny z przyzwyczajeniem tenisa |
| 2. Ekran podsumowania i uzupełnienie turnieju | Strona, trasa, linki z ekranu meczu          | Podsumowanie z serwera starsze niż zapis na telefonie          |
| 3. Smoke i wdrożenie                          | Kroki smoke, PR, `db push`, wdrożenie        | Merge przed `db push` = błąd przy uzupełnianiu nazwy           |

**Prerequisites:** S-04 i S-07 wdrożone (są).
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Cele pokazane w podsumowaniu wynikają z bieżącego stanu celów i obserwacji. Brak migawki celów z dnia meczu jest świadomy (decyzja z S-06/S-07).
- Zwykły tenisowy zapis wyniku: z perspektywy zawodnika, tie-break w nawiasie jako punkty przegranego.

## Success Criteria (Summary)

- Po meczu rodzic jednym linkiem widzi wynik, przebieg, cele z obserwacjami i notatki.
- Pustą nazwę turnieju da się uzupełnić po meczu.
- Podsumowanie widzi wyłącznie właściciel konta.
