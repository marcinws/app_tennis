# Kolejka notatek usuwa wpis tylko przy znanym odrzuceniu — plan implementacji

## Overview

Kolejka obserwacji i notatek na telefonie usuwa wpis przy każdej odpowiedzi 4xx poza 401, 408 i 429. Dotyczy to także odpowiedzi, które nie pochodzą z naszych tras: 403 z WAF lub bot-checku Cloudflare, HTML-owej 404 po wdrożeniu bez trasy albo 413 z Cloudflare. Rodzic traci wtedy dane, a serwer nie zostawia żadnego śladu.

Ta zmiana wprowadza dwie rzeczy. Po pierwsze, kolejka usuwa wpis tylko wtedy, gdy odpowiedź niesie znany kod odrzucenia z tras notatek i obserwacji, a każdą inną odpowiedź 4xx ponawia. Po drugie, każde odrzucenie w tych trasach zostawia wpis `console.warn` w Workers Logs.

Źródło: ustalenia N1 i N2 w `context/audits/observability/2026-11-26_point-sync-notes-deletion.md`.

## Current State Analysis

- `interpretNotesResponse` (`src/lib/services/match-notes.ts:201-225`) wybiera odpowiedź tak:
  - 200 i 204 → `saved`;
  - przekierowanie i 401 → `unauthorized`;
  - 408 i 429 → `retry`;
  - **każde inne 4xx → `rejected`** z kodem z `body.error`, a gdy go nie ma, z `http_<status>`;
  - reszta → `retry`.
- Dla `rejected` hook (`src/components/hooks/useMatchNotes.ts:200-211`) loguje błąd tylko w konsoli telefonu, zapisuje wpis w `match-notes:<id>:rejected`, usuwa go z kolejki i z ekranu i pokazuje „Serwer odrzucił obserwację lub notatkę (…)”.
- Dla `retry` z powodem innym niż `network_error` hook pokazuje „Błąd zapisu obserwacji (<kod>), ponawiam” (`src/components/match/MatchNotes.tsx:39`) i ponawia z backoffem do 30 s (`src/lib/services/match-sync.ts:124-127`). Wpis zostaje w kolejce na początku, więc kolejność operacji jest zachowana.
- Trasy zwracają zamknięty zbiór kodów 4xx w JSON:
  - wspólne: `not_found` (404, złe id), `payload_too_large` (413), `invalid_body` (400), `match_not_found` (404);
  - tylko notatki (`src/pages/api/matches/[id]/notes/[noteId].ts`): `text_empty` (400), `text_too_long` (400);
  - tylko obserwacje (`src/pages/api/matches/[id]/observations/[observationId].ts`): `goal_not_found` (404).
- Żadna z tych ścieżek nie loguje niczego na serwerze. W Workers Logs widać tylko status odpowiedzi.
- Test `match-notes.test.ts:189-198` wymaga, żeby 400 bez treści dawało `rejected` z `http_400`. To założenie jest dokładnie tym błędem, więc ta asercja zmienia się razem z wymaganiem.

## Desired End State

- Odpowiedź 4xx (poza 401, 408 i 429) z `body.error` należącym do znanego zbioru kodów daje `rejected` z tym kodem. Zachowanie jest takie jak dziś: wpis trafia do `:rejected` i znika z kolejki.
- Każda inna odpowiedź 4xx daje `retry` z powodem `http_<status>`. Dotyczy to odpowiedzi bez treści, z treścią niebędącą JSON-em, z JSON-em bez `error` i z nieznanym kodem. Wpis zostaje w kolejce i na ekranie, rodzic widzi „Błąd zapisu obserwacji (http_403), ponawiam”, a kolejka ponawia z backoffem.
- Zbiór znanych kodów jest jeden i jest eksportowany z `match-notes.ts`. Trasy zwracają kody odrzucenia przez helper typowany tym zbiorem, więc nowy kod w trasie, którego nie ma w zbiorze, nie przejdzie `astro check`.
- Każda odpowiedź 4xx z tras notatek i obserwacji loguje `console.warn` z trasą, metodą, `matchId`, id wpisu, `userId` i kodem. Nie loguje treści notatki.

### Key Discoveries:

- Ścieżka `retry` istnieje i ma już komunikat dla rodzica, więc zmiana nie wymaga zmian w UI (`useMatchNotes.ts:217-226`, `MatchNotes.tsx:39`).
- `NoteErrorCode` (`match-notes.ts:15`) obejmuje `text_empty` i `text_too_long`. Zbiór kodów odrzucenia powinien je zawierać, a najlepiej wyprowadzać z niego typ.
- Middleware przekierowuje niezalogowanych przed wejściem do trasy (`src/middleware.ts:18-21`), więc w trasie `context.locals.user` jest ustawiony. Mimo to należy go czytać jako `user?.id ?? null`.
- Reguła `no-console` wymaga komentarza `eslint-disable-next-line no-console -- …`, jak w istniejących `saveFailed`.

## What We're NOT Doing

- Wspólny helper logowania dla całej aplikacji (przyczyna nr 4 z audytu). Helper zostaje lokalny dla tych dwóch tras.
- Kanał błędów z przeglądarki do serwera (przyczyna nr 1, P2). Odrzucenia nadal są logowane na telefonie tak jak dziś.
- Zmiany w kolejce punktów (`match-sync.ts`, A3). Tam 4xx zatrzymuje synchronizację, ale nie kasuje danych.
- Wstrzymywanie kolejki albo limit prób przy trwałym 403. Kolejka ponawia w nieskończoność, zgodnie z decyzją z planowania.
- Ustalenia N3–N10 z audytu, czyli uszkodzona kopia, DELETE bez wierszy, rozróżnianie kluczy obcych, sprawdzanie treści 200 i reszta.
- Logi 5xx i `saveFailed`: zostają bez zmian, łącznie z brakiem kontekstu (A5).

## Implementation Approach

Faza 1 jest test-first. Najpierw powstają testy regresji, które dziś nie przechodzą: 403 bez treści, 404 z treścią niebędącą JSON-em, 413 bez treści i 400 z nieznanym kodem mają dawać `retry` z `http_<status>`. Potem zmienia się `interpretNotesResponse`: `rejected` tylko dla znanego kodu, w pozostałych przypadkach `retry`.

Faza 2 dodaje w każdej z dwóch tras lokalny helper odrzucenia. Helper loguje `console.warn` i zwraca JSON z kodem. Jego parametr jest typowany zbiorem znanych kodów, więc obie strony kontraktu nie mogą się rozjechać.

## Phase 1: Biała lista kodów odrzucenia w kolejce

### Overview

Kolejka kasuje wpis tylko przy znanym kodzie z naszych tras. Każde inne 4xx wraca na ścieżkę `retry`.

### Changes Required:

#### 1. Testy regresji

**File**: `src/lib/services/match-notes.test.ts`

**Intent**: Dodać testy regresji, które teraz nie przechodzą. Opisują błąd z audytu (N1): odpowiedzi 4xx spoza naszych tras nie mogą kasować danych rodzica. Istniejący test „rejects other client errors with their code” trzeba rozdzielić. Przypadek `goal_not_found` zostaje jako `rejected`, a przypadek „400 bez treści” przechodzi do nowego zachowania (`retry`, `http_400`), bo zmieniło się wymaganie.

**Contract**: przypadki w `describe("interpretNotesResponse")`:

- każdy kod ze zbioru znanych kodów przy pasującym statusie 4xx daje `{ kind: "rejected", error: <kod> }`; użyć `it.each` po wyeksportowanym zbiorze;
- `{ status: 403, body: null }` daje `{ kind: "retry", reason: "http_403" }` (WAF);
- `{ status: 404, body: null }` daje `retry` z `http_404` (HTML 404, którego hook nie sparsował);
- `{ status: 413, body: null }` daje `retry` z `http_413`;
- `{ status: 400, body: { error: "something_else" } }` daje `retry` z `http_400` (nieznany kod);
- `{ status: 400, body: { message: "x" } }` daje `retry` z `http_400` (JSON bez `error`);
- obecne testy 401, przekierowania, 408/429, 5xx i błędu sieci zostają bez zmian.

Komentarz regresji ma wskazywać źródło, w konwencji pliku: `// Regression (observability audit 2026-11-26, N1): …`.

#### 2. Zbiór znanych kodów i interpretacja odpowiedzi

**File**: `src/lib/services/match-notes.ts`

**Intent**: Wyeksportować zbiór kodów odrzucenia, które zwracają trasy notatek i obserwacji. W `interpretNotesResponse` zwracać `rejected` tylko wtedy, gdy `body.error` należy do tego zbioru. Każde inne 4xx (poza 401, 408 i 429) ma dawać `retry` z powodem `http_<status>`. Komentarz przy gałęzi wyjaśnia, dlaczego tak jest: 4xx spoza naszych tras (WAF, brak trasy po wdrożeniu, limit platformy) nie mówi nic o samym wpisie.

**Contract**:

- `export const NOTES_REJECTION_CODES = ["not_found", "payload_too_large", "invalid_body", "match_not_found", "goal_not_found", "text_empty", "text_too_long"] as const;`
- `export type NotesRejectionCode = (typeof NOTES_REJECTION_CODES)[number];`
- `NoteErrorCode` musi pozostać podzbiorem `NotesRejectionCode`. Najlepiej to zagwarantować przez typ, np. `satisfies` albo odwołanie do kluczy `NOTE_ERROR_MESSAGES`.
- Sygnatura `interpretNotesResponse(response: SyncResponse): NotesSyncOutcome` się nie zmienia. W `rejected.error` trafia zawsze znany kod, w `retry.reason` dla nieznanego 4xx trafia `http_<status>`, a nie kod z treści.

### Success Criteria:

#### Automated Verification:

- Nowe testy regresji nie przechodzą przed zmianą w `match-notes.ts`: `npx vitest run src/lib/services/match-notes.test.ts`
- Po zmianie wszystkie testy jednostkowe przechodzą: `npm test`
- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- W DevTools telefonu (albo `npm run dev` z przeglądarką) zablokowanie żądania `PUT /api/matches/*/notes/*` odpowiedzią 403 (np. przez nadpisanie odpowiedzi w DevTools) zostawia notatkę na ekranie ze statusem „Błąd zapisu obserwacji (http_403), ponawiam”. Po zdjęciu blokady notatka zapisuje się na serwerze.

**Implementation Note**: Po fazie i zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim przejdziesz dalej.

---

## Phase 2: Logi odrzuceń w trasach notatek i obserwacji

### Overview

Każda odpowiedź 4xx z tras notatek i obserwacji zostawia w Workers Logs linię `console.warn`, którą da się powiązać z meczem, wpisem i użytkownikiem.

### Changes Required:

#### 1. Trasa notatek

**File**: `src/pages/api/matches/[id]/notes/[noteId].ts`

**Intent**: Zastąpić każdy `json({ error: … }, 4xx)` w PUT i DELETE lokalnym helperem odrzucenia. Helper loguje `console.warn` z kontekstem i zwraca tę samą odpowiedź co dziś: ten sam status i ten sam JSON. Rodzic i kolejka nie widzą żadnej różnicy.

**Contract**:

- Helper ma postać `rejected(context, code: NotesRejectionCode, status: number, ids)`. Nazwa może być inna, ale typ `code` musi pochodzić z `NotesRejectionCode` z `@/lib/services/match-notes`.
- Linia logu: `console.warn("Rejected a match note request", { route: "notes", method, matchId, noteId, userId, error: code, status })`.
- Gdy id nie przejdą walidacji (`not_found`), w logu znajdują się surowe `context.params.id` i `noteId`, bez pełnego `params`.
- `userId` = `context.locals.user?.id ?? null`. Bez maila i bez treści notatki.
- Komentarz `eslint-disable-next-line no-console -- …` w stylu `saveFailed`.
- `saveFailed` i ścieżka 500 `not_configured` zostają bez zmian.

#### 2. Trasa obserwacji

**File**: `src/pages/api/matches/[id]/observations/[observationId].ts`

**Intent**: To samo co w trasie notatek, z `route: "observations"`, `observationId` i kodem `goal_not_found`. Linia logu: `"Rejected a match observation request"`.

**Contract**: jak wyżej. Odpowiedzi (status i JSON) pozostają identyczne z dzisiejszymi.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Przy `npm run dev` żądanie `PUT /api/matches/<id>/notes/<noteId>` z pustym tekstem, wysłane z przeglądarki jako zalogowany użytkownik, zwraca 400 `text_empty`, a w terminalu pojawia się linia `Rejected a match note request` z `matchId`, `noteId`, `userId` i `error: "text_empty"`.
- Obserwacja z `goal_id` nieistniejącego celu zwraca 404 `goal_not_found` i loguje `Rejected a match observation request`.
- Zwykłe dodanie i usunięcie notatki i obserwacji działa bez zmian i nie loguje ostrzeżenia.

**Implementation Note**: Po fazie i zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie przez człowieka.

---

## Testing Strategy

### Unit Tests:

- `interpretNotesResponse`: każdy znany kod daje `rejected`. Nieznany kod, brak treści, treść niebędąca JSON-em i JSON bez `error` dają `retry` z `http_<status>`. Dotychczasowe 401, 408, 429, 5xx i błąd sieci zachowują się bez zmian.
- Trasy nie mają testów jednostkowych (projekt testuje tylko `src/lib/services/`). Zgodność kodów z trasami gwarantuje typ `NotesRejectionCode` sprawdzany w `astro check`.

### Manual Testing Steps:

1. W `npm run dev` otwórz mecz i dodaj notatkę, blokując `PUT …/notes/*` odpowiedzią 403. Notatka zostaje na ekranie ze statusem „ponawiam”.
2. Zdejmij blokadę. Notatka zapisuje się, a status wraca do „zapisano”.
3. Wyślij notatkę z pustym tekstem bezpośrednio przez `fetch` w konsoli. Trasa zwraca 400 `text_empty`, a w terminalu jest linia `console.warn` z kontekstem.

## Performance Considerations

Brak. Jedna linia logu na każde odrzucenie, które i tak jest rzadkie.

## Migration Notes

Brak migracji. Wpisy, które telefony już odrzuciły, zostają w `:rejected` i nie są przywracane.

## References

- Audyt: `context/audits/observability/2026-11-26_point-sync-notes-deletion.md` (N1, N2, przyczyna nr 3)
- Wcześniejsza zmiana w tym przepływie: `context/archive/2026-11-25-review-fixes-in-match-observations/plan.md`
- Wzorzec ścieżki retry: `src/components/hooks/useMatchNotes.ts:217-226`
- Wzorzec logowania w trasie: `src/pages/api/matches/[id]/notes/[noteId].ts:19-23`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Biała lista kodów odrzucenia w kolejce

#### Automated

- [x] 1.1 Nowe testy regresji nie przechodzą przed zmianą w match-notes.ts
- [x] 1.2 Po zmianie wszystkie testy jednostkowe przechodzą
- [x] 1.3 Typy przechodzą
- [x] 1.4 Lint przechodzi

#### Manual

- [x] 1.5 Zablokowany 403 PUT notatki zostawia ją na ekranie ze statusem „ponawiam”, a po zdjęciu blokady zapisuje się

### Phase 2: Logi odrzuceń w trasach notatek i obserwacji

#### Automated

- [ ] 2.1 Typy przechodzą
- [ ] 2.2 Lint przechodzi
- [ ] 2.3 Testy jednostkowe przechodzą
- [ ] 2.4 Build przechodzi

#### Manual

- [ ] 2.5 PUT notatki z pustym tekstem zwraca 400 text_empty i loguje Rejected a match note request z kontekstem
- [ ] 2.6 Obserwacja z nieistniejącym celem zwraca 404 goal_not_found i loguje Rejected a match observation request
- [ ] 2.7 Zwykłe dodanie i usunięcie notatki i obserwacji działa bez ostrzeżenia
