<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Kolejka notatek usuwa wpis tylko przy znanym odrzuceniu

- **Plan**: context/changes/notes-queue-drops-on-any-4xx/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Zablokowana kolejka przy trwałym obcym 4xx nie zostawia żadnego sygnału

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchNotes.ts:217-226, src/lib/services/match-notes.ts:238-245
- **Detail**: Obce 4xx ponawia się teraz w nieskończoność. To świadoma decyzja z planu, bo chroni dane. Kolejka jest FIFO, więc trwały 403 z WAF albo HTML 404 po zmianie trasy blokuje wszystkie kolejne wpisy meczu. Gałąź retry nic nie loguje, nawet w konsoli telefonu. Takie odpowiedzi nie docierają do trasy, więc nowy `console.warn` na serwerze ich nie widzi. Utrata danych bez śladu zamieniła się w zatrzymanie kolejki bez śladu.
- **Fix**: Przy pierwszej próbie (`attempt === 0`) z powodem `http_4xx` zapisać w hooku `console.error` ze statusem, `matchId` i typem operacji, w konwencji pozostałych logów hooka.
  - Strength: Ten sam mechanizm co pozostałe awarie po stronie telefonu, jedna linia na zablokowaną operację, a nie na każdą próbę.
  - Tradeoff: Ślad zostaje tylko na telefonie, dopóki nie powstanie kanał błędów klienta (przyczyna nr 1 z audytu).
  - Confidence: MED — poprawia diagnozę u rodzica z DevTools, ale nie u osoby dyżurnej.
  - Blind spot: Nie sprawdzono, jak często WAF Cloudflare na tym koncie zwraca 403 dla PUT z JSON.
- **Decision**: FIXED — console.error once per stalled operation (attempt 0, 4xx) in useMatchNotes.ts

### F2 — Kontrola, że NoteErrorCode ⊆ NotesRejectionCode, działa tylko przez miejsce wywołania

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/match-notes.ts:10-13
- **Detail**: Plan zalecał gwarancję w samym `match-notes.ts`. Teraz pilnuje tego wyłącznie wywołanie `rejected(context, parsedText.error, 400)` w trasie notatek. Usunięcie tego wywołania zdejmie zabezpieczenie.
- **Fix**: Dodać `satisfies Record<NoteErrorCode & NotesRejectionCode, string>` (albo `Partial<Record<NotesRejectionCode, string>>`) do `NOTE_ERROR_MESSAGES`, żeby kontrola istniała w module.
- **Decision**: FIXED — NOTE_ERROR_MESSAGES satisfies Partial<Record<NotesRejectionCode, string>>; verified a stray code fails astro check

### F3 — Powód retry gubi nieznany `body.error`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/match-notes.ts:245
- **Detail**: Dla 4xx z nieznanym kodem (np. `{ error: "something_else" }` po wdrożeniu nowego kodu) powód to `http_400`. Plan wybrał to celowo, ale nieznany kod jest najlepszą wskazówką przy zablokowanej kolejce.
- **Fix**: Użyć `errorCode(body, status)` tak jak w gałęzi 408/429 i zmienić asercję w teście „a 400 with an unknown code” na `something_else`.
- **Decision**: FIXED — retry reason uses errorCode(body, status); test asserts something_else (red before, green after)

### F4 — Surowe, nieprzycięte parametry w logu odrzucenia

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/matches/[id]/notes/[noteId].ts:22-31, src/pages/api/matches/[id]/observations/[observationId].ts:20-29
- **Detail**: Przy `not_found` w logu trafiają surowe `context.params`. Rejestracja jest otwarta, więc zalogowany użytkownik może wysłać id długości bliskiej limitowi URL (~16 KB) i dostać jedną dużą linię logu na żądanie. Wstrzyknięcie linii nie jest możliwe, bo log jest strukturalny.
- **Fix**: Przycinać id w helperze (`String(value).slice(0, 64)`).
- **Decision**: FIXED — clip() limits logged ids to 64 chars in both routes

### F5 — Kolejka punktów ma ten sam wzorzec „każde 4xx jest ostateczne”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/match-sync.ts:117-119
- **Detail**: `interpretSyncResponse` nadal mapuje każde 4xx na `rejected`. Synchronizacja punktów zatrzymuje się wtedy, ale nie kasuje danych, i dzieje się to także przy 403 z WAF (audyt A3). Zgodnie z planem jest to poza zakresem, ale te dwie kolejki rozjeżdżają się teraz w tej samej kwestii.
- **Fix**: Osobna zmiana dla A3 (logi 4xx w `log.ts` i biała lista kodów w `match-sync.ts`), wydzielająca przy okazji wspólny helper `rejected()`.
  - Strength: Domyka przyczynę nr 3 z audytu dla głównej pętli.
  - Tradeoff: Kolejna zmiana i PR.
  - Confidence: HIGH — wzorzec jest już sprawdzony w tej zmianie.
  - Blind spot: Kolejka punktów zatrzymuje się na `rejected`, a nie usuwa danych, więc priorytet jest niższy niż N1.
- **Decision**: DEFERRED — follow-up queued in follow-ups/review-fixes.md
