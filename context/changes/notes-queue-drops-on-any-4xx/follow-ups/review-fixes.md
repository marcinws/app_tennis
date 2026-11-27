# Follow-ups from implementation review

Source: `reviews/impl-review.md` (2026-11-27)

## F5 — Kolejka punktów: biała lista kodów odrzucenia i logi 4xx (audyt A3)

- **Where**: `src/lib/services/match-sync.ts:117-119`, `src/pages/api/matches/[id]/log.ts`
- **What**: `interpretSyncResponse` mapuje każde 4xx na `rejected`, więc synchronizacja punktów zatrzymuje się także przy 403 z WAF albo HTML 404 po wdrożeniu. Trasa `log.ts` nie loguje żadnego 4xx.
- **Proposed change**: osobna zmiana (`/10x-new`). Biała lista kodów z `log.ts` w `match-sync.ts` (obce 4xx → retry), `console.warn` przy każdym 4xx w `log.ts` z matchId, userId, baseRevision i kodem, wspólny helper `rejected()` wydzielony z tras notatek i obserwacji.
- **Status**: open
