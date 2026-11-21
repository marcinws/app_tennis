# Pozostałe formaty meczu — Plan Brief

> Full plan: `context/changes/remaining-match-formats/plan.md`

## What & Why

Rodzic wybiera przy starcie meczu jeden z trzech formatów z FR-004 (do 2 wygranych setów, 2 sety i super tie-break do 10, krótkie sety do 4 gemów) oraz gemy z przewagami lub bez. To S-05 z roadmapy.

## Key Decisions Made

| Decision        | Choice                                                                     | Why (1 sentence)                                       |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Krótkie sety    | Do 2 wygranych setów, set do 4 gemów z przewagą 2, tie-break do 7 przy 4:4 | Dosłownie reguła z PRD, ten sam mechanizm co sety do 6 |
| Super tie-break | Przy 1:1 w setach zamiast 3. seta, do 10 z przewagą 2, liczony jako set    | Reguła z PRD; kolejność serwisów jak w tie-breaku      |
| Przewagi        | Radio w formularzu startu, domyślnie z przewagami, dla każdego formatu     | Silnik już obsługuje oba warianty (S-04)               |
| Dane            | Migracja: rozszerzony `check` formatu + `grant insert (with_advantage)`    | Uprawnienia tylko na kolumny z formularza (lessons.md) |
| Testy           | Unit + 4 kroki smoke + test na telefonie                                   | Ten sam wzorzec co S-03 i S-04                         |

## Phases at a Glance

| Phase                                     | What it delivers                                   | Key risk                                       |
| ----------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| 1. Reguły nowych formatów                 | `FORMAT_RULES`, super tie-break, walidacja przewag | Zły serwujący lub cel w super tie-breaku       |
| 2. Start meczu i ekran w nowych formatach | Migracja, trasa, formularz, ekran                  | Rozjazd id formatów między kodem a bazą        |
| 3. Smoke i wdrożenie                      | Kroki smoke, `db push`, PR, wdrożenie              | Merge przed `db push` = 500 przy starcie meczu |

## Open Risks & Assumptions

- Rollback poniżej wersji z S-05 jest niebezpieczny, gdy istnieje mecz w nowym formacie.
- Decyzje planu przyjęte według rekomendacji bez wywiadu (prośba użytkownika w `change.md`).
