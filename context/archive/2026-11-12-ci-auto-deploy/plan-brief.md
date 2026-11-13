# Automatyczne wdrażanie na Cloudflare Workers z GitHub Actions — Plan Brief

> Full plan: `context/changes/ci-auto-deploy/plan.md`

## What & Why

Każdy push na `main` z zielonym CI ma sam trafiać na produkcję, a produkcja ma sama wracać do poprzedniej wersji, gdy po wdrożeniu nie działa. Dziś każde wdrożenie to ręczny `wrangler` z komputera, a przy kilku wydaniach tygodniowo do 6 grudnia to zbędny krok i ryzyko pomyłki. To etap 6 z `context/deployment/deploy-plan.md`.

## Starting Point

`ci.yml` ma joby `ci` (lint, `astro check`, build) i `smoke` (pełny przepływ logowania na lokalnym Supabase), bez wdrożenia, na akcjach z Node 20. Aplikacja działa na Workerze `tennis-match-companion` po dwóch ręcznych wdrożeniach; `CLOUDFLARE_API_TOKEN` jest już w GitHub secrets.

## Desired End State

Po pushu na `main` CI wdraża nową wersję, sprawdza produkcję bez zakładania kont i, jeśli coś nie działa, przywraca wersję sprzed wdrożenia, kończąc przebieg na czerwono z e-mailem. Rollback jest przećwiczony na prawdziwej produkcji, logi CI nie mają ostrzeżeń o Node 20, a Worker nie publikuje adresów podglądu.

## Key Decisions Made

| Decision              | Choice                                                            | Why (1 sentence)                                                                              |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Zatwierdzanie wdrożeń | Automatycznie, środowisko `production` bez recenzenta             | Push na `main` jest już decyzją człowieka, więc dodatkowe kliknięcie nic nie wnosi.           |
| Sprawdzenie produkcji | `SMOKE_MODE=production`: strony + logowanie nieistniejącym kontem | Wykrywa brak sekretów i zerwane połączenie z Supabase bez zaśmiecania bazy kontami testowymi. |
| Reakcja na błąd       | Auto-rollback do jawnego ID wersji sprzed wdrożenia               | Produkcja wraca w sekundy, a nieudane samo wdrożenie nie cofa dobrej wersji.                  |
| Preview URLs          | Wyłączone (`preview_urls: false`, `workers_dev: true`)            | Niewydane wersje nie są publicznie dostępne z produkcyjnym Supabase.                          |
| Narzędzie wdrożenia   | `npx wrangler` z `devDependencies`                                | Ta sama wersja co lokalnie, bez dodatkowej akcji.                                             |
| Wersje akcji          | `checkout@v7`, `setup-node@v7`, `setup-cli@v3`                    | Najnowsze wydania na Node 24 (sprawdzone 2026-11-12).                                         |

## Scope

**In scope:**

- Tryb `SMOKE_MODE=production` w `scripts/smoke.mjs`
- `workers_dev` i `preview_urls` w `wrangler.jsonc`
- Job `deploy`, `workflow_dispatch` z flagą próby, podbicie akcji w `ci.yml`
- Sekret `CLOUDFLARE_ACCOUNT_ID`
- Próba rollbacku i aktualizacja `deploy-plan.md`, `CLAUDE.md`, `README.md`

**Out of scope:**

- Wymagane zatwierdzanie wdrożeń, wdrożenia podglądowe dla PR
- Pełny smoke z rejestracją na produkcji, klucz `service_role` w CI
- Zmiany w kodzie aplikacji, sekretach Workera i Supabase; wycofywanie migracji

## Architecture / Approach

```
push main ─▶ ci ─┐
             smoke ─┴▶ deploy: build ─▶ zapisz wersję N ─▶ wrangler deploy (N+1)
                                   ─▶ czekaj na 200 ─▶ smoke production
                                        └─ błąd ─▶ rollback do N ─▶ smoke production ─▶ czerwony przebieg
```

## Phases at a Glance

| Phase                                | What it delivers                                                   | Key risk                                                          |
| ------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Produkcyjny tryb smoke i wrangler | Bezpieczny test produkcji, sprawdzony też na buildzie bez sekretów | Fałszywie zielony test, jeśli komunikat błędu Supabase się zmieni |
| 2. Job `deploy`                      | Automatyczne wdrożenie z rollbackiem, akcje na Node 24             | Zły format wyjścia przy odczycie wersji sprzed wdrożenia          |
| 3. Próba rollbacku i dokumentacja    | Przećwiczona ścieżka awaryjna, aktualne dokumenty                  | Kilka sekund zmiany wersji na produkcji podczas próby             |

**Prerequisites:** `CLOUDFLARE_API_TOKEN` w GitHub secrets (jest), zalogowany `wrangler` lokalnie (jest), zielone CI na `main` (jest).
**Estimated effort:** ~1 sesja, 3 fazy.

## Open Risks & Assumptions

- Smoke produkcyjny opiera się na treści komunikatu „Invalid login credentials” z Supabase; zmiana tego tekstu po stronie Supabase da czerwony przebieg i niepotrzebny rollback.
- Rollback cofa tylko kod Workera; gdy pojawią się migracje, muszą być wstecznie zgodne (zasada z `infrastructure.md`).
- Ręczne `wrangler deploy` z komputera zostanie nadpisane przy następnym pushu na `main`.

## Success Criteria (Summary)

- Push na `main` kończy się nową wersją na produkcji bez ręcznych kroków.
- Celowo nieudane sprawdzenie przywraca poprzednią wersję i wysyła e-mail.
- Aplikacja na telefonie działa po wdrożeniu z CI i po próbie rollbacku.
