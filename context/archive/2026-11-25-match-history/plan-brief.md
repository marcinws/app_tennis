# Historia meczów — Plan Brief

> Full plan: `context/changes/match-history/plan.md`

## What & Why

Rodzic przegląda wcześniejsze mecze, otwiera ich podgląd i usuwa mecz po potwierdzeniu (FR-017). To S-09, ostatni wycinek milestone'u M-1.

## Starting Point

Do meczów można wrócić tylko przez „ostatni mecz” na `/matches/new`. Podsumowanie z S-08 pokazuje wszystko o meczu. Meczu nie da się usunąć, bo brakuje uprawnienia i polityki delete. Obserwacje i notatki mają już kaskadę od meczu.

## Desired End State

„Historia” w górnym pasku prowadzi na listę meczów od najnowszego. Wiersz otwiera podsumowanie, a tam rozwijana sekcja „Usuń mecz” z drugim przyciskiem trwale usuwa mecz z obserwacjami i notatkami.

## Key Decisions Made

| Decision      | Choice                                                                     | Why (1 sentence)                                                          |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Podgląd       | Ekran podsumowania z S-08                                                  | Ma już wszystko; odpowiedź na pytanie z roadmapy                          |
| Lista         | Data, zawodnik, turniej, format; bez wyniku; limit 200                     | Odtwarzanie logów wielu meczów grozi limitem 10 ms CPU na Cloudflare Free |
| Potwierdzenie | `<details>` + drugi przycisk „Tak, usuń mecz trwale”, bez JS               | Działa na każdym telefonie i wymaga świadomego drugiego dotknięcia        |
| Miejsce       | Usuwanie w podsumowaniu, nie na liście                                     | Rodzic widzi, co usuwa, zanim usunie                                      |
| Dane          | Twarde usunięcie z kaskadą obserwacji i notatek                            | PRD: usunięcie jest nieodwracalne; brak kosza w zakresie                  |
| Uprawnienia   | `grant delete` + polityka `matches_delete_own`                             | Zasada RLS z CLAUDE.md: osobna polityka na operację                       |
| Testy         | Unit (`historyNotice`) + smoke (lista, RLS, usunięcie z kaskadą) + telefon | Ten sam wzorzec co poprzednie wycinki                                     |

Decyzje przyjęte według rekomendacji, bez wywiadu (prośba użytkownika).

## Scope

**In scope:** strona `/matches`, trasa usuwania, sekcja usuwania w podsumowaniu, link w górnym pasku, migracja, smoke, wdrożenie.

**Out of scope:** wynik na liście, filtry i stronicowanie, cofnięcie usunięcia, czyszczenie localStorage, usuwanie zawodników, Playwright.

## Phases at a Glance

| Phase                          | What it delivers                         | Key risk                                             |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| 1. Uprawnienie i komunikaty    | Migracja delete, komunikaty z testem     | Brak kaskady zablokowałby usunięcie (sprawdza smoke) |
| 2. Lista, usuwanie i nawigacja | `/matches`, trasa, sekcja w podsumowaniu | Przypadkowe usunięcie — dwa kroki potwierdzenia      |
| 3. Smoke i wdrożenie           | Kroki smoke, PR, `db push`, wdrożenie    | Merge przed `db push` = błąd przy usuwaniu           |

**Prerequisites:** S-08 wdrożony (jest).
**Estimated effort:** ~1 sesja w 3 fazach.

## Open Risks & Assumptions

- Więcej niż 200 meczów na koncie w MVP jest mało prawdopodobne; dopisek informuje o obcięciu listy.
- Kopia usuniętego meczu zostaje w localStorage telefonu, nieszkodliwie.

## Success Criteria (Summary)

- Rodzic widzi listę swoich meczów i otwiera ich podsumowanie.
- Mecz da się usunąć dopiero po potwierdzeniu, razem z obserwacjami i notatkami.
- Historię widzi i zmienia wyłącznie właściciel konta.
