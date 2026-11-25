# Poprawki z przeglądu kodu S-07 — plan implementacji

## Overview

Przegląd `/code-review 13` (PR #13, S-07) znalazł dwa błędy, które przy słabej sieci gubią albo przywracają dane rodzica, oraz kilka drobnych uwag. Ta zmiana naprawia punkty 1, 2, 3, 6, 8 i 9, każdy błąd najpierw jako nieprzechodzący test. Punkty 4, 5 i 7 są świadomie pominięte (`change.md`).

## What We're NOT Doing

- Punkty 4, 5, 7 przeglądu (powody w `change.md`).
- Ten sam przypadek 408/429 w kolejce punktów (`interpretSyncResponse` w `match-sync.ts`). Tam odrzucenie tylko zatrzymuje kolejkę do następnej akcji i niczego nie usuwa.
- Migracje.

## Phase 1: Poprawki kolejki obserwacji i notatek

### Changes Required:

#### 1. Usunięcie wpisu wysłanego wcześniej (przegląd 1)

**File**: `src/lib/services/match-notes.ts`, `src/components/hooks/useMatchNotes.ts`

**Intent**: Usunięcie skraca kolejkę tylko dla dodania, którego nigdy nie wysłano. Dodanie czekające na ponowienie mogło już być na serwerze.

**Contract**: `enqueue(queue, op, sentIds: ReadonlySet<string>)`. Hook dopisuje id do `sentIds` przed wysłaniem, a dodania wczytane z telefonu traktuje jako wysłane.

#### 2. Tymczasowe 408 i 429 (przegląd 2)

**File**: `src/lib/services/match-notes.ts`

**Intent**: Przekroczony czas i limit żądań są ponawiane, a nie odrzucane.

**Contract**: `interpretNotesResponse` → `retry` dla 408 i 429.

#### 3. Trwałe ostrzeżenie o odrzuceniu (przegląd 3)

**File**: `src/components/hooks/useMatchNotes.ts`, `src/components/match/MatchNotes.tsx`

**Intent**: Ostrzeżenie zostaje do potwierdzenia przez rodzica, z licznikiem odrzuceń.

**Contract**: `dismissRejected()` w hooku, przycisk „OK” przy linii stanu.

#### 4. Limit znaków notatki w polu (przegląd 6)

**File**: `src/components/match/MatchNotes.tsx`

**Intent**: Pole nie ucina emoji przed limitem; limit liczy `parseNoteText`.

**Contract**: bez `maxLength`; licznik na czerwono powyżej 200.

#### 5. Ograniczona lista `:rejected` (przegląd 8)

**File**: `src/lib/services/match-notes.ts`

**Intent**: Dowody odrzuceń nie mogą zapełnić localStorage.

**Contract**: `appendRejected(raw, entry)`, `MAX_REJECTED_ENTRIES = 50`.

#### 6. Typy wspólne (przegląd 9)

**File**: `src/lib/services/match-notes.ts`, hook, wyspa

**Intent**: Zasada CLAUDE.md „Wspólne typy w `src/types.ts`”.

**Contract**: `MatchObservation` i `MatchNote` z `src/types.ts`; serwis nie definiuje własnych.

### Success Criteria:

#### Automated Verification:

- Testy regresji najpierw czerwone, potem zielone: `npx vitest run src/lib/services/match-notes.test.ts`
- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- CI na PR zielone

#### Manual Verification:

- Po merge job `deploy` i smoke produkcyjny zielone
- Na telefonie: obserwacje, „−” i notatki działają jak wcześniej

## References

- Przegląd: wynik `/code-review 13` (rozmowa 2026-11-25), streszczony w `change.md`
- Zarchiwizowana zmiana: `context/archive/2026-11-25-in-match-observations-and-notes/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Poprawki kolejki obserwacji i notatek

#### Automated

- [ ] 1.1 Testy regresji najpierw czerwone, potem zielone: `npx vitest run src/lib/services/match-notes.test.ts`
- [ ] 1.2 Testy przechodzą: `npm test`
- [ ] 1.3 Lint przechodzi: `npm run lint`
- [ ] 1.4 Typy przechodzą: `npx astro check`
- [ ] 1.5 Build przechodzi: `npm run build`
- [ ] 1.6 CI na PR zielone

#### Manual

- [ ] 1.7 Po merge job `deploy` i smoke produkcyjny zielone
- [ ] 1.8 Na telefonie: obserwacje, „−” i notatki działają jak wcześniej
