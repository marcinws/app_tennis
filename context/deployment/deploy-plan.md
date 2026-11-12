---
project: tennis-match-companion
created: 2026-11-10
platform: Cloudflare Workers (plan Free)
status: draft
sources:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
  - context/foundation/prd.md
---

# Plan pierwszego wdrożenia

Legenda: **[Claude]** — Claude Code wykonuje sam (odczyt, build, testy, przygotowanie zmian). **[Ty]** — wymaga Twojego udziału: logowania w przeglądarce, panelu, sekretu albo zgody na operację produkcyjną (zgodnie z sekcją Approval w `infrastructure.md`).

## 0. Stan wyjściowy (2026-11-10)

| Element        | Stan                                                                                              | Wpływ na wdrożenie                                 |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Platforma      | Cloudflare Workers, Worker ze statycznymi zasobami (`wrangler.jsonc`, `@astrojs/cloudflare` 14.4) | Bez zmian w kodzie                                 |
| Nazwa Workera  | `tennis-match-companion` (od 2026-11-10)                                                          | Zrobione (krok 2.1)                                |
| Supabase       | Projekt w chmurze, `eu-west-1` (Irlandia); URL i klucz w GitHub secrets                           | Te same wartości trafią do sekretów Workera        |
| Migracje       | Brak `supabase/migrations/`; używane tylko `auth.users`                                           | Pierwsze wdrożenie bez migracji                    |
| CI             | `ci.yml`: job `ci` (lint, `astro check`, build) i `smoke` (lokalny Supabase); zielone             | Brak kroku wdrożenia (etap 6)                      |
| Node.js        | `.nvmrc` 26.13.0, CI `node-version: 26`, lokalnie v26.13.0                                        | Zgodne                                             |
| Cloudflare CLI | `wrangler` 4.156.0 w devDependencies, **niezalogowany**                                           | Logowanie w kroku 1.1                              |
| Sekrety        | `SUPABASE_URL`, `SUPABASE_KEY` jako `optional: true`                                              | Brak = cicho wyłączone logowanie; weryfikuje smoke |

## 1. Konto i platforma Cloudflare

- 1.1 **[Ty]** Zaloguj wrangler (otwiera przeglądarkę): `! npx wrangler login`. Jeśli nie masz konta Cloudflare — załóż je (plan Free, karta niepotrzebna).
- 1.2 **[Claude]** `npx wrangler whoami` — potwierdzenie konta i Account ID.
- 1.3 **[Ty]** Przy pierwszym wdrożeniu Cloudflare może poprosić o wybór subdomeny `*.workers.dev` — wybierz ją w panelu (Workers & Pages → Overview), jeśli wrangler o to zapyta.

## 2. Przygotowanie konfiguracji (osobny commit, przed wdrożeniem)

Wykonane 2026-11-10: nazwa Workera zmieniona, `session: false` w `astro.config.mjs` (adapter nie tworzy już KV `SESSION`; bindingi w `wrangler deploy --dry-run`: tylko `IMAGES` i `ASSETS`, gzip 463 KiB), `tech-stack.md` poprawiony; lint, `astro check` i build przechodzą. Zostaje push i zielone CI.

- 2.1 **[Claude]** `wrangler.jsonc`: `"name": "tennis-match-companion"` (późniejsza zmiana = nowy Worker i nowy adres).
- 2.2 **[Claude]** Sprawdzić w dokumentacji `@astrojs/cloudflare` 14, czy wdrożenie tworzy KV `SESSION`; jeśli tak, a sesje Astro nie są używane — wyłączyć je w `astro.config.mjs` (sesję trzyma Supabase w ciasteczkach). Jeśli opcji nie ma, zaakceptować pusty KV.
- 2.3 **[Claude]** Poprawić `tech-stack.md`: `deployment_target: cloudflare-workers` i zdanie o „Cloudflare Pages”.
- 2.4 **[Claude]** `npm run lint`, `npx astro check`, `npm run build` lokalnie; push i zielone CI przed krokiem 4.

Poza zakresem pierwszego wdrożenia (ryzyko z rejestru, osobna zmiana): zmiana `optional: true` na wymagane sekrety.

## 3. Supabase (istniejący projekt, Irlandia `eu-west-1`)

- 3.1 **[Ty]** Region sprawdzony 2026-11-12: `eu-west-1` (Irlandia), nie zalecany `eu-central-1`. Decyzja: zostajemy. Polska–Irlandia to ok. 20–40 ms więcej na stronę SSR niż Frankfurt (szacunek), a ryzyko z `infrastructure.md` dotyczyło regionu w USA. Wymaganie 200 ms od dotknięcia spełnia zapis na urządzeniu (FR-011). Weryfikacja w 5.5; jeśli strony będą wolne, nowy projekt we Frankfurcie, póki nie ma prawdziwych danych.
- 3.2 **[Ty]** Authentication → Sign In / Providers → Email: **Confirm email = off** (MVP, wymagane przez smoke).
- 3.3 **[Ty]** ✅ Authentication → URL Configuration: po kroku 4 ustaw **Site URL** na `https://tennis-match-companion.<subdomena>.workers.dev` i dodaj go do Redirect URLs.
- 3.4 **[Ty]** Przekaż mi wartości tylko przez terminal przy `wrangler secret put` (krok 4.2) — nie wklejaj klucza do czatu. `SUPABASE_KEY` to klucz `anon`/publishable, nie `service_role`.
- 3.5 Migracje: brak. Gdy powstaną, będą wdrażane przed kodem i pisane wstecznie zgodnie (patrz Rollback).

## 4. Pierwsze wdrożenie (ręczne)

Zmienne środowiskowe:

| Zmienna                                         | Gdzie                                         | Ustawia                          |
| ----------------------------------------------- | --------------------------------------------- | -------------------------------- |
| `SUPABASE_URL`, `SUPABASE_KEY`                  | Sekrety Workera (runtime, `astro:env/server`) | [Ty] przez `wrangler secret put` |
| `SUPABASE_URL`, `SUPABASE_KEY`                  | GitHub secrets (build w CI)                   | Już ustawione                    |
| `SUPABASE_URL`, `SUPABASE_KEY`                  | `.env` + `.dev.vars` lokalnie (git-ignored)   | Bez zmian                        |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets                                | [Ty], dopiero w etapie 6         |

- 4.1 **[Claude]** `npm ci && npm run build` na czystym `main`; `npx wrangler deploy --dry-run` — kontrola bundla i bindingów bez wdrożenia.
- 4.2 **[Ty]** ✅ Sekrety (wrangler zaproponuje utworzenie Workera, jeśli jeszcze nie istnieje — potwierdź):
  - `! npx wrangler secret put SUPABASE_URL`
  - `! npx wrangler secret put SUPABASE_KEY`
- 4.3 **[Claude]** ✅ `npx wrangler secret list` — obie nazwy widoczne.
- 4.4 **[Ty — zgoda]** ✅ Wdrożenie produkcyjne: `npx wrangler deploy` (mogę je uruchomić po Twoim wyraźnym „wdrażaj”). Zapisz adres `https://tennis-match-companion.<subdomena>.workers.dev`.
- 4.5 **[Claude]** ✅ `npx wrangler deployments list` — zapisanie ID wersji w tym pliku (sekcja Dziennik).

## 5. Testy po wdrożeniu

- 5.1 **[Claude]** ✅ `curl -sI <URL>/` → 200; `curl -sI <URL>/dashboard` → 302 na `/auth/signin`.
- 5.2 **[Claude]** ✅ `BASE_URL=<URL> npm run smoke` — rejestracja, logowanie, strona chroniona, wylogowanie. Niepowodzenie przy logowaniu = sprawdzić sekrety (4.3) i Confirm email (3.2).
- 5.3 **[Claude]** ✅ W trakcie smoke: `npx wrangler tail --format pretty --status error` — brak błędów.
- 5.4 **[Ty]** ✅ Usuń konta testowe: Supabase → Authentication → Users, filtr `smoke-` → usuń (albo SQL Editor: `delete from auth.users where email like 'smoke-%@example.com';`).
- 5.5 **[Ty]** ✅ Telefon z Androidem, sieć komórkowa: otwórz adres, załóż konto, zaloguj się, otwórz `/dashboard`. Odczucie czasu odpowiedzi.
- 5.6 **[Ty/Claude]** Panel Cloudflare → Workers → tennis-match-companion → Observability: CPU time żądań SSR wyraźnie poniżej 10 ms (ryzyko limitu planu Free).

Kryterium sukcesu: 5.1–5.3 zielone, 5.5 bez problemów, brak błędów 1102 w logach.

Wynik 2026-11-12 (wersja `5301db83`): 5.1–5.3 zielone, 0 wyjątków i błędów w logach, wszystkie żądania `ok`. Czas CPU: ciepłe żądania 1–8 ms; pierwsze żądania po starcie izolatu 13 ms (`/`) i 56 ms (`/auth/signin`) — powyżej 10 ms planu Free, mimo to obsłużone. Obserwować w Workers Logs; przy błędach 1102 przejść na Workers Paid. Wrangler włączył domyślnie `workers_dev` i publiczne Preview URLs (ryzyko z rejestru w `infrastructure.md`) — do rozstrzygnięcia w etapie 6 (`preview_urls`).

## 6. Automatyczne wdrożenie z GitHub Actions (osobna zmiana)

Zrealizowane 2026-11-12 w zmianie `context/changes/ci-auto-deploy/` (plan, decyzje i weryfikacja w `plan.md`).

- 6.1 **[Ty]** ✅ `CLOUDFLARE_API_TOKEN` (szablon „Edit Cloudflare Workers”) w GitHub secrets; `CLOUDFLARE_ACCOUNT_ID` ustawił Claude.
- 6.2 **[Claude]** ✅ Job `deploy` w `ci.yml`: po zielonych `ci` i `smoke`, tylko `push` i ręczne uruchomienie na `main`, środowisko `production` bez wymaganego zatwierdzania, `concurrency: production`. Kolejność: build → zapis wersji obsługującej 100% ruchu → `wrangler deploy --message "CI deploy of <sha>"` → czekanie na 200 → `SMOKE_MODE=production npm run smoke` (bez zakładania kont). Akcje na Node 24, `preview_urls: false`.
- 6.3 **[Claude]** ✅ Przy nieudanym sprawdzeniu job sam robi `wrangler rollback` do zapisanej wersji, ponownie uruchamia smoke i kończy się na czerwono (e-mail z GitHuba). Próba generalna: `gh workflow run ci.yml --ref main -f simulate_check_failure=true`. Przy błędzie: `gh run view <id> --log-failed`.

## 7. Rollback

| Sytuacja                                                | Działanie                                                                                                                                                                                 | Kto                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Sprawdzenie po wdrożeniu z CI nie przechodzi            | Automatycznie: job `deploy` robi `wrangler rollback` do wersji sprzed wdrożenia i ponownie uruchamia smoke; przebieg czerwony                                                             | CI; [Ty] dostajesz e-mail         |
| Nowa wersja psuje aplikację, a smoke tego nie wykrył    | `npx wrangler versions list` → `npx wrangler rollback <VERSION_ID> --message "<powód>"`, potem smoke; następny push na `main` znów wdroży kod z `main`, więc najpierw poprawka lub revert | [Claude] przygotowuje, [Ty] zgoda |
| Pierwsze wdrożenie nie działa (brak poprzedniej wersji) | Poprawka i ponowny `wrangler deploy`; w ostateczności wyłączyć trasę `workers.dev` w panelu lub `npx wrangler delete`                                                                     | [Ty]                              |
| Błędne sekrety                                          | `wrangler secret put` z poprawną wartością (działa od razu, bez redeployu)                                                                                                                | [Ty]                              |
| Rotacja klucza Supabase                                 | Nowy klucz w Supabase → `wrangler secret put SUPABASE_KEY` → aktualizacja GitHub secret → smoke                                                                                           | [Ty] + [Claude]                   |
| Migracja bazy (w przyszłości)                           | Rollback nie cofa danych; migracje wstecznie zgodne, kopia bazy przed migracją                                                                                                            | [Ty] zgoda                        |

Rollback dotyczy jednej ze 100 ostatnich wersji. Logi z 3 dni w Workers Logs — błędy analizować od razu.

## 8. Podział odpowiedzialności — podsumowanie

**Claude Code bez nadzoru:** odczyt konfiguracji, build, `--dry-run`, `whoami`, `secret list`, `versions list`, `deployments list`, `tail`, smoke, curl, przygotowanie zmian w konfiguracji i CI (commit/push na Twoją prośbę).

**Ty:** `wrangler login`, ustawienia projektu Supabase, wartości sekretów, zgoda na `wrangler deploy` i `rollback`, usuwanie kont testowych, test na telefonie, token API Cloudflare w GitHub.

**Od etapu 6:** push na `main` (który Claude robi tylko na Twoją prośbę) jest zgodą na wdrożenie produkcyjne; CI wdraża i w razie potrzeby wycofuje bez dalszego udziału.

## Dziennik wdrożeń

| Data       | Wersja (ID)                                                     | Commit    | Wynik smoke                              | Uwagi                                                                                                                       |
| ---------- | --------------------------------------------------------------- | --------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-12 | `5301db83-921e-42ef-ab07-e305a6f19fa8`                          | `c4a7d42` | 8/8 PASS                                 | Pierwsze wdrożenie, ręczne `wrangler deploy`; https://tennis-match-companion.marcin-wojcik-swidnik.workers.dev              |
| 2026-11-12 | `e120b908-5d47-464d-b05c-5fbfc62f1979`                          | `4e8c06d` | 9/9 PASS                                 | Poprawka komunikatu po rejestracji; najpierw podgląd `versions upload --preview-alias fix-confirm`, potem `versions deploy` |
| 2026-11-12 | `8794ba25-e9cc-4663-a34a-f187ecc3effa`                          | `c0f1c81` | production 4/4 PASS                      | Pierwsze automatyczne wdrożenie z CI (przebieg 43232400493)                                                                 |
| 2026-11-12 | `f31135e7-237d-46e2-bead-47b08e76b338` → rollback do `8794ba25` | `c0f1c81` | production 4/4 PASS przed i po rollbacku | Próba generalna rollbacku, `simulate_check_failure=true` (przebieg 43234181132, celowo czerwony)                            |
