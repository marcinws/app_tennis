---
project: tennis-match-companion
researched_at: 2026-11-05
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.4 (SSR) + React 19
  runtime: Cloudflare workerd (@astrojs/cloudflare 14.4, wrangler 4.156)
---

## Recommendation

**Deploy on Cloudflare Workers** (Worker ze statycznymi zasobami, plan Free).

Projekt jest już skonfigurowany pod tę platformę: adapter `@astrojs/cloudflare`, `wrangler.jsonc`, a `astro dev` działa na tym samym runtime workerd co produkcja, więc wdrożenie nie wymaga zmian w kodzie. Cloudflare przeszedł wszystkie pięć kryteriów platformy przyjaznej agentom i przy ruchu kilku rodziców kosztuje 0 zł. To przesądziło przy odpowiedziach z wywiadu: najniższy koszt jako priorytet, jeden region (Polska), brak trwałych połączeń i Supabase jako zewnętrzny dostawca bazy i logowania.

## Platform Comparison

Ocena: Pass / Partial / Fail. Stan funkcji sprawdzony 2026-11-05.

| Platforma          | CLI-first | Managed/Serverless | Dokumentacja dla agenta | Stabilne API wdrożeniowe | MCP / Integracja              | Suma | Koszt przy tym ruchu                      |
| ------------------ | --------- | ------------------ | ----------------------- | ------------------------ | ----------------------------- | ---- | ----------------------------------------- |
| Cloudflare Workers | Pass      | Pass               | Pass                    | Pass                     | Pass (część serwerów w becie) | 5    | 0 zł                                      |
| Vercel             | Pass      | Pass               | Partial                 | Pass                     | Pass                          | 4.5  | 0 zł (Hobby, tylko niekomercyjnie)        |
| Netlify            | Partial   | Pass               | Pass                    | Pass                     | Pass                          | 4.5  | 0 zł, ok. 15–20 wdrożeń prod. / mies.     |
| Fly.io             | Pass      | Partial            | Pass                    | Pass                     | Partial (eksperymentalne)     | 4    | ok. $1–3, wymagana karta                  |
| Railway            | Partial   | Pass               | Pass                    | Partial                  | Pass                          | 4    | ok. $5                                    |
| Render             | Partial   | Pass               | Pass                    | Partial                  | Pass                          | 4    | $0 z zimnym startem ok. 1 min albo ok. $7 |

Twardy filtr trwałych połączeń nikogo nie wykluczył, bo aplikacja działa w modelu żądanie–odpowiedź. Priorytet najniższego kosztu obniżył ocenę platform kontenerowych (Fly.io, Railway, Render), które przy stale działającej usłudze kosztują kilka dolarów miesięcznie.

- **Cloudflare Workers.** Każdą operację wykonuje się z `wrangler`: `deploy`, `rollback`, `versions`, `tail`, `secret`. Dokumentacja jest dostępna jako `llms.txt` i markdown, ze źródłami w `cloudflare/cloudflare-docs`. Istnieją oficjalne zdalne serwery MCP (docs, bindings, builds, observability), z których część jest w becie. Plan Free daje 100 000 żądań dziennie i 10 ms CPU na żądanie; żądania do statycznych zasobów są bezpłatne i nielimitowane. `@astrojs/cloudflare` v14 nie obsługuje już Cloudflare Pages.
- **Vercel.** Hobby jest darmowy (1M wywołań funkcji miesięcznie), a po przekroczeniu limitu funkcja jest wstrzymywana na 30 dni bez naliczania opłat. Oficjalny MCP to `mcp.vercel.com`. Domyślny region funkcji to `iad1` (Waszyngton), a Hobby pozwala na jeden region. Plan Hobby jest wyłącznie do użytku niekomercyjnego. Nie potwierdzono istnienia `llms.txt`.
- **Netlify.** Ceny są oparte na kredytach: plan Free daje 300 kredytów, a każde wdrożenie produkcyjne kosztuje 15. Wycofanie wdrożenia jest dostępne w panelu lub przez API, bez polecenia CLI. W planie Free funkcje działają tylko w `cmh` (Ohio); zmiana regionu wymaga planu Pro za $20.
- **Fly.io.** Nie ma darmowego planu dla nowych kont (tylko $1 kredytu na 7 dni). Wymaga `@astrojs/node`, Dockerfile i regionu `fra`. MCP jest oznaczony jako eksperymentalny.
- **Railway.** Plan Hobby kosztuje $5 miesięcznie; jedyny region w UE to Amsterdam. Nie ma polecenia wycofania w CLI, a w trybie Serverless zimny start może zwrócić 502.
- **Render.** Darmowa usługa usypia się po 15 minutach, a zimny start trwa około minuty, co na korcie jest nie do przyjęcia. Nie ma polecenia wycofania w CLI, a płatny plan to ok. $7 (ceny z 2026 roku nie są potwierdzone na oficjalnej stronie).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Jako jedyna przeszła wszystkie pięć kryteriów i nie wymaga żadnej zmiany w projekcie. Kosztuje 0 zł. Wdrożenie, wycofanie, logi i sekrety obsługuje się wyłącznie z CLI, więc agent może przejść cały cykl operacyjny bez panelu.

#### 2. Vercel

Ma równie dobre CLI i MCP oraz darmowy plan bez naliczania opłat po przekroczeniu limitów. Przegrywa, bo wymaga zmiany adaptera na `@astrojs/vercel`, ręcznego przeniesienia regionu z `iad1` na `fra1` i obowiązuje go zakaz komercyjnego użycia w planie Hobby.

#### 3. Netlify

Ma dobrą dokumentację dla agentów (`llms.txt`, markdown) i oficjalny MCP. Przegrywa, bo w darmowym planie funkcje działają tylko w Ohio, a limit kredytów (ok. 15–20 wdrożeń miesięcznie) koliduje z automatycznym wdrażaniem po każdym scaleniu. Też wymaga zmiany adaptera.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Limit 10 ms CPU na żądanie w planie Free.** SSR Astro razem z `@supabase/ssr` może go przekroczyć na stronach z historią meczów, a Worker zwraca wtedy błąd. Czas oczekiwania na sieć się nie liczy, ale nikt tego jeszcze nie zmierzył.
2. **Każde żądanie SSR idzie do Supabase przez internet.** Jeśli projekt Supabase powstanie w domyślnym regionie w USA, każda strona dostaje kilkaset milisekund opóźnienia.
3. **Adapter domyślnie tworzy KV `SESSION` dla sesji Astro.** Projekt ich nie używa, bo sesję trzyma Supabase w ciasteczkach, więc to zbędny zasób tworzony przy pierwszym wdrożeniu.
4. **Platforma nie pokrywa FR-011.** Zapis przy zaniku sieci zależy wyłącznie od kodu w przeglądarce; Worker nie pomoże, jeśli zapis punktu będzie czekał na odpowiedź serwera.
5. **`ci.yml` nie ma kroku wdrożenia.** Przepływ „auto-deploy po scaleniu” z `tech-stack.md` nie jest jeszcze zrealizowany i wymaga tokenu API Cloudflare w sekretach GitHuba.

### Pre-Mortem — How This Could Fail

Pół roku później rodzic otwiera aplikację na korcie i widzi błąd 1102, bo przekroczono limit CPU. Do Workera trafiało coraz więcej logiki: liczenie wyniku, podsumowania, historia. Każde żądanie odtwarzało cały stan meczu po stronie serwera. Lokalnie wszystko działało, więc nikt nie patrzył na czas CPU w logach. Projekt Supabase powstał w domyślnym regionie, przez co każdy punkt szedł przez Atlantyk i wymaganie poniżej 200 ms przestało być osiągalne. Przy słabym zasięgu żądania wisiały, a ponieważ zapis czekał na serwer, punkty przepadały i zawiódł główny guardrail MVP. Wycofanie wdrożenia nie pomogło, bo migracje bazy już się wykonały, a stary kod nie pasował do nowego schematu. Sekrety ustawiano ręcznie w panelu, więc po rotacji klucza Supabase produkcja tygodniami działała bez logowania: `createClient` zwracał `null` i aplikacja nie zgłaszała żadnego błędu.

### Unknown Unknowns

- `@astrojs/cloudflare` v14 nie obsługuje już Cloudflare Pages. Jedynym celem jest Worker ze statycznymi zasobami, a starsze poradniki „Astro na Pages” są nieaktualne.
- Adresy wersji (preview) są publiczne, gdy włączone jest `workers_dev`. Ich logów nie widać w `wrangler tail`, Workers Logs ani Logpush.
- Workers Logs w planie Free przechowuje logi przez 3 dni (200 000 zdarzeń dziennie). `wrangler rollback` cofa tylko do jednej ze 100 ostatnich wersji i nie zmienia danych w Supabase.
- W `wrangler.jsonc` Worker nadal nazywa się `10x-astro-starter`. Pierwsze wdrożenie utworzy go pod tą nazwą, a późniejsza zmiana oznacza nowego Workera i nowy adres `workers.dev`.
- Brak `SUPABASE_URL` lub `SUPABASE_KEY` nie przerywa ani buildu, ani działania aplikacji, tylko po cichu wyłącza logowanie (`astro.config.mjs` oznacza obie zmienne jako `optional: true`).

## Operational Story

- **Preview deploys**: `npx wrangler versions upload --preview-alias <gałąź>` tworzy wersję z publicznym adresem na `workers.dev`, bez zmiany produkcji. Do ochrony podglądów potrzebny jest Cloudflare Access. Alternatywa to Workers Builds, który tworzy podgląd dla każdej gałęzi innej niż produkcyjna; limity buildów w planie Free nie zostały sprawdzone. Podglądów nie ma dla Workerów z Durable Objects.
- **Secrets**: produkcyjne `SUPABASE_URL` i `SUPABASE_KEY` ustawia się przez `npx wrangler secret put <KLUCZ>`; lokalnie trzyma się je w `.dev.vars`. `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` do wdrożenia z CI trafiają do sekretów repozytorium GitHub. Rotacja klucza Supabase: nowy klucz w Supabase, potem `wrangler secret put SUPABASE_KEY`, potem sprawdzenie logowania testem `npm run smoke`.
- **Rollback**: `npx wrangler rollback [<VERSION_ID>] --message "<powód>"` przywraca poprzednią wersję w kilka sekund; listę wersji pokazuje `npx wrangler versions list`. Wycofanie nie cofa migracji w `supabase/migrations/`, więc migracje muszą być wstecznie zgodne z poprzednią wersją kodu.
- **Approval**: zgody człowieka wymagają wdrożenie na produkcję (`wrangler deploy` lub `versions deploy`), wycofanie produkcji, `wrangler secret put` na produkcji oraz migracje i usuwanie danych w Supabase. Agent może bez nadzoru wykonywać `wrangler versions upload`, `versions list`, `deployments list`, `tail`, `secret list` i build.
- **Logs**: na żywo przez `npx wrangler tail --format pretty --status error`. Logi historyczne z 3 dni są w Workers Logs (włączone przez `observability.enabled` w `wrangler.jsonc`). Logi pipeline'u odczytuje się przez `gh run view <id> --log-failed`.

## Risk Register

| Risk                                                           | Source                               | Likelihood | Impact | Mitigation                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Przekroczenie 10 ms CPU w planie Free kończy żądania błędem    | Devil's advocate                     | M          | H      | Po pierwszym wdrożeniu sprawdzić czas CPU w Workers Logs dla stron meczu i historii. Liczenie wyniku trzymać w przeglądarce. Przy stałym przekraczaniu przejść na Workers Paid ($5 miesięcznie).          |
| Projekt Supabase w odległym regionie wydłuża każde żądanie SSR | Devil's advocate / Pre-mortem        | M          | H      | Utworzyć projekt Supabase w regionie `eu-central-1` (Frankfurt). Opóźnienie sprawdzić z telefonu na sieci komórkowej.                                                                                     |
| Zapis punktów zależny od odpowiedzi serwera łamie FR-011       | Pre-mortem                           | M          | H      | Zapisywać punkty najpierw na urządzeniu, a do Supabase synchronizować w tle. Odtworzyć utratę sieci testem E2E przed wydaniem.                                                                            |
| Wycofanie wersji po migracji schematu psuje aplikację          | Pre-mortem / Research finding        | M          | M      | Migracje pisać jako wstecznie zgodne (najpierw dodać kolumnę, usuwać dopiero w kolejnym wydaniu). Przed migracją zrobić kopię bazy.                                                                       |
| Brak sekretów po cichu wyłącza logowanie na produkcji          | Unknown unknowns                     | M          | H      | Po każdym wdrożeniu uruchomić `npm run smoke` na adresie produkcyjnym. Rozważyć zmianę `optional: true` na wymagane w `astro.config.mjs`.                                                                 |
| Brak kroku wdrożenia w CI; wdrożenia ręczne i niespójne        | Devil's advocate                     | H          | M      | Dodać do `ci.yml` job wdrożenia na `main` po przejściu `ci` i `smoke`, z `CLOUDFLARE_API_TOKEN` w sekretach GitHub. Zrobić to w ramach osobnej zmiany, bo konfiguracja CI jest poza zakresem tej decyzji. |
| Nazwa Workera `10x-astro-starter` utrwali się w adresie        | Unknown unknowns                     | H          | L      | Przed pierwszym wdrożeniem zmienić `name` w `wrangler.jsonc` na `tennis-match-companion`.                                                                                                                 |
| Zbędny KV `SESSION` tworzony przy wdrożeniu                    | Research finding                     | H          | L      | Ustawić `session: false` w `astro.config.mjs`, jeśli sesje Astro nie będą używane.                                                                                                                        |
| Publiczne adresy podglądów ujawniają niewydane funkcje         | Unknown unknowns                     | L          | L      | Podglądów używać tylko z testowym projektem Supabase; w razie potrzeby osłonić je Cloudflare Access.                                                                                                      |
| Serwery MCP Cloudflare częściowo w becie                       | Research finding (status 2026-11-05) | M          | L      | Operacje opierać na `wrangler`; MCP traktować jako wygodę, a nie jedyną ścieżkę.                                                                                                                          |
| 3-dniowa retencja logów w planie Free utrudnia analizę błędów  | Unknown unknowns                     | M          | M      | Błędy zgłaszane przez rodziców analizować od razu. Narzędzie do śledzenia błędów wybrać osobno, gdy będzie potrzebne.                                                                                     |

## Getting Started

1. W `wrangler.jsonc` zmień `"name": "10x-astro-starter"` na `"name": "tennis-match-companion"`. Jeśli sesje Astro nie są potrzebne, dodaj `session: false` w `astro.config.mjs`.
2. Utwórz projekt Supabase w regionie Frankfurt (`eu-central-1`) i wyłącz w nim potwierdzanie e-maila na czas testów, zgodnie z `README.md`.
3. Zaloguj się do Cloudflare (`npx wrangler login`), ustaw sekrety (`npx wrangler secret put SUPABASE_URL` oraz `npx wrangler secret put SUPABASE_KEY`), a następnie wdroż: `npm run build && npx wrangler deploy`. Projekt używa `wrangler` z `devDependencies`, więc globalna instalacja nie jest potrzebna.
4. Sprawdź wdrożenie: `BASE_URL=https://tennis-match-companion.<subdomena>.workers.dev npm run smoke` oraz `npx wrangler tail --format pretty`.
5. Dodaj do `ci.yml` automatyczne wdrożenie na `main` w osobnej zmianie (`/10x-new`).

Lokalnie `npm run dev` uruchamia już workerd przez wtyczkę Vite Cloudflare, więc osobne `wrangler dev` nie jest potrzebne.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
