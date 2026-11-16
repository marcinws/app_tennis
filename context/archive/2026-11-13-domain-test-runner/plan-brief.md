# Testy jednostkowe reguł domenowych — Plan Brief

> Full plan: `context/changes/domain-test-runner/plan.md`

## What & Why

Dodajemy runner testów jednostkowych dla czystych funkcji domenowych i włączamy go do CI. To foundation F-01 z roadmapy: reguły liczenia wyniku (przewagi, tie-break, serwujący) w S-03, S-04 i S-05 muszą być sprawdzane testami, zanim zobaczy je prawdziwy mecz.

## Starting Point

Projekt ma tylko smoke test HTTP (`scripts/smoke.mjs`); brak skryptu `test`, brak `src/lib/services/`, a `CLAUDE.md` wprost mówi, że runnera jeszcze nie ma. Astro działa na Vite 8.3.5, a CI blokuje deploy, gdy job `ci` jest czerwony.

## Desired End State

`npm test` uruchamia testy `src/**/*.test.ts`, `npm run test:watch` działa w trybie watch, a pojedynczy plik uruchamia `npx vitest run <ścieżka>`. Pierwsza prawdziwa funkcja domenowa `pointLabel` (0/15/30/40) ma test. Czerwony test w jobie `ci` zatrzymuje wdrożenie.

## Key Decisions Made

| Decision            | Choice                                              | Why (1 sentence)                                                                      |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Runner              | Vitest 5.1                                          | Ten sam Vite 8 co Astro, alias `@/`, watch, dobrze znany agentom.                     |
| Konfiguracja        | Samodzielny `vitest.config.ts`, bez `getViteConfig` | Funkcje domenowe nie importują Astro, a konfiguracja Astro ładuje adapter Cloudflare. |
| Przykładowy test    | `pointLabel` w `src/lib/services/scoring.ts`        | Ustala wzorzec, z którego S-03 skorzysta, zamiast kodu do wyrzucenia.                 |
| Zakres `pointLabel` | 0–3, `RangeError` poza zakresem                     | Równowaga i przewaga zależą od wyniku obu graczy — to S-03.                           |
| Miejsce w CI        | Krok `npm test` w jobie `ci` przed buildem          | `deploy` już czeka na `ci`, więc bez nowego joba i bez zmiany `needs`.                |
| Pliki testów        | Obok kodu, `*.test.ts`, jawne importy z `vitest`    | Bez globali nie trzeba zmieniać typów w `tsconfig.json`.                              |

## Scope

**In scope:**

- Vitest, skrypty `test` i `test:watch`, `vitest.config.ts`
- `pointLabel` z testem
- Krok w CI, opis w `CLAUDE.md` i `README.md`

**Out of scope:**

- Testy komponentów React, DOM, E2E, coverage
- Testy w hooku pre-commit
- Równowaga, przewaga, tie-break (S-03)

## Architecture / Approach

Vitest w środowisku `node` uruchamia pliki `*.test.ts` leżące obok czystych funkcji w `src/lib/services/`. Konfiguracja nie zależy od Astro. W CI krok `npm test` stoi w jobie `ci` między `astro check` a buildem, więc istniejąca zależność `deploy → ci` czyni go bramką wdrożenia.

## Phases at a Glance

| Phase                     | What it delivers                                             | Key risk                                                     |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 1. Runner i pierwszy test | Vitest lokalnie, `pointLabel` + test, czerwony przy zepsuciu | Lint type-checked może wymagać poprawek w pliku konfiguracji |
| 2. CI i dokumentacja      | `npm test` w jobie `ci`, polecenia w `CLAUDE.md` i `README`  | Push na `main` to wdrożenie produkcyjne                      |

**Prerequisites:** brak — Node 26, npm i CI już działają.
**Estimated effort:** jedna krótka sesja w dwóch fazach.

## Open Risks & Assumptions

- Zakładamy, że Vitest 5.1 nie dociągnie pakietu ze skryptem instalacyjnym; jeśli tak, trzeba go zatwierdzić w `allowScripts`.

## Success Criteria (Summary)

- `npm test` przechodzi lokalnie i w CI, a zepsucie reguły daje czerwony wynik.
- Agent znajduje w `CLAUDE.md`, jak uruchomić wszystkie testy i pojedynczy test.
