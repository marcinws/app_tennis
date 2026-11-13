# Testy jednostkowe reguł domenowych — plan implementacji

## Overview

Dodajemy Vitest jako runner testów jednostkowych dla czystych funkcji domenowych w `src/lib/services/` wraz z pierwszą prawdziwą funkcją domenową (`pointLabel` — nazwa liczby punktów w gemie) i jej testem, a następnie uruchamiamy testy w jobie `ci`, żeby nieprzechodzący test blokował wdrożenie. To foundation F-01 z `context/foundation/roadmap.md`; odblokowuje S-03 (`point-scoring-first-format`), S-04 i S-05, których reguły liczenia wyniku muszą być sprawdzane testami, zanim zobaczy je prawdziwy mecz.

## Current State Analysis

- Brak runnera testów jednostkowych: `package.json` nie ma skryptu `test` ani zależności testowej; jedyny test to `scripts/smoke.mjs` (HTTP na działającym serwerze).
- `CLAUDE.md` mówi: „Nie ma jeszcze runnera testów jednostkowych, więc nie da się uruchomić pojedynczego testu. Dopisz polecenie, gdy powstanie.”
- Konwencja z `CLAUDE.md`: reguły liczenia wyniku i inne czyste funkcje domenowe w `src/lib/services/<obszar>.ts`, bez importów z Astro i Supabase. Katalog `src/lib/services/` jeszcze nie istnieje.
- Astro 7.4.4 i wszystkie wtyczki używają Vite 8.3.5 (`npm ls vite`); Vitest 5.1.0 ma `peerDependencies.vite: ^6.4.0 || ^7.0.0 || ^8.0.0`, więc współdzieli tę samą instancję Vite.
- `tsconfig.json` rozszerza `astro/tsconfigs/strict` (`moduleResolution: Bundler`, `verbatimModuleSyntax`) i obejmuje `**/*`, więc pliki testów i `vitest.config.ts` są typowane i lintowane regułami type-checked bez zmian w konfiguracji.
- Alias `@/*` → `./src/*` jest zdefiniowany tylko w `tsconfig.json`; Vitest go nie odczyta sam.
- `.github/workflows/ci.yml`: job `ci` (npm ci → astro sync → lint → astro check → build); job `deploy` ma `needs: [ci, smoke]`, więc każdy krok w `ci` jest już bramką wdrożenia.

## Desired End State

- `npm test` uruchamia jednorazowo wszystkie testy `src/**/*.test.ts` i kończy się kodem ≠ 0 przy nieprzechodzącym teście; `npm run test:watch` uruchamia tryb watch; `npx vitest run <ścieżka>` uruchamia pojedynczy plik.
- `src/lib/services/scoring.ts` eksportuje `pointLabel`, pokryte testem w `src/lib/services/scoring.test.ts`.
- Job `ci` uruchamia `npm test` przed buildem; czerwony test zatrzymuje `deploy`.
- `CLAUDE.md` i `README.md` opisują polecenia testów, w tym pojedynczy test.

### Key Discoveries:

- `package.json:5-14` — skrypty; brak `test`.
- `.github/workflows/ci.yml:19-34` — job `ci`, do którego dochodzi krok testów przed `npm run build`.
- `.github/workflows/ci.yml:67-68` — `deploy` zależy od `ci`, więc nie trzeba zmieniać `needs`.
- `CLAUDE.md` sekcja „Polecenia” — zdanie o braku runnera do zastąpienia.
- `README.md` sekcja „Available Scripts” i „## CI” — miejsca na opis testów.

## What We're NOT Doing

- Nie używamy `getViteConfig` z Astro w konfiguracji Vitest — ładowałby adapter Cloudflare i środowisko workerd, a funkcje domenowe z definicji nie importują Astro.
- Brak testów komponentów React, środowiska DOM i testów E2E — dojdą, gdy wycinek będzie ich potrzebował.
- Brak progu pokrycia i raportów coverage.
- Brak uruchamiania testów w hooku pre-commit (zostaje `eslint --fix` / `prettier --write`).
- `pointLabel` nie obsługuje równowagi ani przewagi (zależą od wyniku obu graczy) ani tie-breaka — to zakres S-03.
- Brak osobnego joba `test` w CI.

## Implementation Approach

Samodzielna konfiguracja Vitest (środowisko `node`, alias `@`, wzorzec plików `src/**/*.test.ts`) bez zależności od konfiguracji Astro. Pierwsza funkcja domenowa jest prawdziwą, małą regułą, z której skorzysta S-03, a nie kodem demonstracyjnym. Testy importują `describe`/`it`/`expect` jawnie z `vitest` (bez globali), więc nie trzeba zmieniać typów w `tsconfig.json`. Po zielonym przebiegu lokalnym jeden krok w jobie `ci` czyni testy bramką wdrożenia.

## Phase 1: Runner i pierwszy test

### Overview

Vitest działa lokalnie, a pierwsza funkcja domenowa ma test, który przechodzi i robi się czerwony po celowym zepsuciu funkcji.

### Changes Required:

#### 1. Zależność i skrypty

**File**: `package.json`

**Intent**: Dodać Vitest jako zależność dev oraz skrypty do jednorazowego uruchomienia i trybu watch.

**Contract**: `devDependencies.vitest: ^5.1.0` (instalacja przez `npm install -D vitest`, aktualizuje `package-lock.json`); `scripts.test: "vitest run"`, `scripts["test:watch"]: "vitest"`. Jeśli instalacja doda nowy pakiet ze skryptem instalacyjnym, zatwierdzić go w `allowScripts` zgodnie z `CLAUDE.md`.

#### 2. Konfiguracja Vitest

**File**: `vitest.config.ts` (nowy)

**Intent**: Konfiguracja niezależna od Astro: testy jednostkowe w środowisku Node, z aliasem `@` jak w `tsconfig.json`.

**Contract**: `defineConfig` z `vitest/config`; `test.include: ["src/**/*.test.ts"]`, `test.environment: "node"`; `resolve.alias` mapuje `@` na `./src` (ścieżka bezwzględna z `import.meta.dirname`, jak w `eslint.config.js`).

#### 3. Pierwsza funkcja domenowa

**File**: `src/lib/services/scoring.ts` (nowy)

**Intent**: Nazwa liczby punktów wygranych przez gracza w zwykłym gemie, użyta później przez ekran meczu w S-03.

**Contract**: `export function pointLabel(points: number): string` — 0 → `"0"`, 1 → `"15"`, 2 → `"30"`, 3 → `"40"`; dla liczby niecałkowitej, ujemnej lub większej niż 3 rzuca `RangeError` z komunikatem zawierającym otrzymaną wartość. Bez importów z Astro i Supabase.

#### 4. Test funkcji

**File**: `src/lib/services/scoring.test.ts` (nowy)

**Intent**: Pierwszy test jednostkowy i wzorzec dla kolejnych: plik obok kodu, jawne importy z `vitest`.

**Contract**: przypadki 0, 1, 2, 3 → `"0"`, `"15"`, `"30"`, `"40"`; `RangeError` dla 4, -1 i 1.5.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie mapowania w `pointLabel` (np. 3 → `"45"`) daje kod ≠ 0 z `npm test`; zmiana cofnięta przed commitem
- Pojedynczy plik uruchamia się: `npx vitest run src/lib/services/scoring.test.ts`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- `npm run test:watch` startuje w trybie watch i ponownie uruchamia test po zapisaniu `scoring.ts`

**Implementation Note**: Po zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: CI i dokumentacja

### Overview

Testy są bramką wdrożenia w CI, a polecenia są opisane tam, gdzie agenci i ludzie ich szukają.

### Changes Required:

#### 1. Krok testów w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać testy jednostkowe w jobie `ci`, żeby czerwony test zatrzymywał `deploy` (który już ma `needs: [ci, smoke]`).

**Contract**: nowy krok `- run: npm test` w jobie `ci` po `npx astro check`, przed `npm run build`. Bez zmian w jobach `smoke` i `deploy`.

#### 2. Polecenia w CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Zastąpić zdanie o braku runnera opisem poleceń testów.

**Contract**: sekcja „Polecenia”: punkty `npm test` (Vitest, jednorazowo, `src/**/*.test.ts`), `npm run test:watch`, pojedynczy test `npx vitest run <ścieżka>` (lub `-t "<nazwa>"`); zdanie „Nie ma jeszcze runnera…” usunięte. W „Konwencje”: testy funkcji domenowych obok kodu jako `<obszar>.test.ts`, z jawnymi importami z `vitest`. Punkt o CI uzupełniony o testy.

#### 3. README

**File**: `README.md`

**Intent**: Opisać nowe skrypty i krok CI.

**Contract**: „Available Scripts”: `npm test` i `npm run test:watch`; „## CI”: punkt **ci** wymienia testy jednostkowe.

### Success Criteria:

#### Automated Verification:

- `.github/workflows/ci.yml` zawiera `npm test` w jobie `ci` przed `npm run build`: `grep -n "npm test" .github/workflows/ci.yml`
- Formatowanie dokumentacji: `npx prettier --check CLAUDE.md README.md`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Po pushu na `main` job `ci` pokazuje krok `npm test` z przechodzącym testem, a `deploy` kończy się sukcesem (push na `main` to wdrożenie produkcyjne)

**Implementation Note**: Push wykonać dopiero po zgodzie użytkownika.

---

## Testing Strategy

### Unit Tests:

- `pointLabel`: wszystkie cztery poprawne wartości oraz wartości poza zakresem (powyżej 3, ujemna, niecałkowita).

### Integration Tests:

- Brak — smoke (`npm run smoke`) pozostaje testem integracyjnym przepływu logowania.

### Manual Testing Steps:

1. `npm run test:watch`, zmienić `scoring.ts`, sprawdzić ponowne uruchomienie.
2. Po pushu sprawdzić `gh run view` — krok `npm test` zielony w jobie `ci`.

## Performance Considerations

Vitest dokłada kilka sekund do joba `ci`; brak wpływu na bundle Workera, bo `vitest` jest zależnością dev, a pliki `*.test.ts` nie są importowane przez aplikację.

## Migration Notes

Nie dotyczy.

## References

- Roadmap: `context/foundation/roadmap.md` — F-01 `domain-test-runner`, odblokowuje S-03, S-04, S-05
- Konwencja usług domenowych: `CLAUDE.md` sekcja „Konwencje”
- Bramka wdrożenia: `.github/workflows/ci.yml:67-68`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner i pierwszy test

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 5f0e4b0
- [x] 1.2 Celowe zepsucie mapowania w `pointLabel` daje kod ≠ 0 z `npm test`; zmiana cofnięta — 5f0e4b0
- [x] 1.3 Pojedynczy plik uruchamia się: `npx vitest run src/lib/services/scoring.test.ts` — 5f0e4b0
- [x] 1.4 Lint przechodzi: `npm run lint` — 5f0e4b0
- [x] 1.5 Typy przechodzą: `npx astro check` — 5f0e4b0
- [x] 1.6 Build przechodzi: `npm run build` — 5f0e4b0

#### Manual

- [x] 1.7 `npm run test:watch` ponownie uruchamia test po zapisaniu `scoring.ts` — 5f0e4b0

### Phase 2: CI i dokumentacja

#### Automated

- [x] 2.1 `npm test` w jobie `ci` przed `npm run build`
- [x] 2.2 Formatowanie dokumentacji: `npx prettier --check CLAUDE.md README.md`
- [x] 2.3 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 2.4 Po pushu na `main` krok `npm test` zielony w jobie `ci`, a `deploy` kończy się sukcesem
