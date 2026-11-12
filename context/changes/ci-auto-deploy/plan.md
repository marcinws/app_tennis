# Automatyczne wdrażanie na Cloudflare Workers z GitHub Actions — plan implementacji

## Overview

Po zielonych jobach `ci` i `smoke` na `main` nowy job `deploy` w `.github/workflows/ci.yml` wdraża Workera `tennis-match-companion`, sprawdza produkcję testem tylko do odczytu i przy nieudanym sprawdzeniu sam wycofuje produkcję do wersji sprzed wdrożenia. Przy okazji akcje GitHub przechodzą na wersje działające na Node 24, a publiczne adresy podglądu wersji zostają wyłączone. To etap 6 z `context/deployment/deploy-plan.md`.

## Current State Analysis

- `ci.yml` ma dwa joby (`ci`: lint, `astro check`, build; `smoke`: lokalny Supabase, build, `npm run preview`, `npm run smoke`) uruchamiane na `push` i `pull_request` do `main`. Nie ma kroku wdrożenia ani `workflow_dispatch`.
- Oba joby używają `actions/checkout@v4`, `actions/setup-node@v4`, a `smoke` także `supabase/setup-cli@v1`; wszystkie trzy działają na Node 20 i GitHub wymusza dla nich Node 24 z ostrzeżeniem. Najnowsze wersje (sprawdzone 2026-11-12): `checkout@v7` (node24), `setup-node@v7` (node24), `setup-cli@v3` (akcja złożona).
- Pierwsze wdrożenie było ręczne (`wrangler deploy`, wersja `5301db83`), poprawka komunikatu po rejestracji poszła przez `versions upload` + `versions deploy` (wersja `e120b908`). Worker ma sekrety `SUPABASE_URL` i `SUPABASE_KEY`.
- GitHub secrets: `CLOUDFLARE_API_TOKEN` (szablon „Edit Cloudflare Workers”), `SUPABASE_URL`, `SUPABASE_KEY`. Brak `CLOUDFLARE_ACCOUNT_ID`. Repozytorium jest publiczne; nie ma żadnego GitHub Environment.
- `scripts/smoke.mjs` ma jedną listę 9 kroków, w tym rejestrację nowego konta `smoke-<timestamp>@example.com` — uruchomiony na produkcji zostawia konto w Supabase.
- `wrangler.jsonc` nie ustawia `workers_dev` ani `preview_urls`, więc wrangler przy każdym wdrożeniu ostrzega i domyślnie włącza publiczne Preview URLs.

## Desired End State

Push na `main` z zielonym CI kończy się wdrożeniem nowej wersji na `https://tennis-match-companion.marcin-wojcik-swidnik.workers.dev` bez udziału człowieka. Po wdrożeniu CI potwierdza, że strony działają i że Worker łączy się z Supabase, nie zakładając kont. Jeśli to sprawdzenie nie przejdzie, produkcja wraca do wersji sprzed wdrożenia, a przebieg kończy się na czerwono (e-mail z GitHuba). Mechanizm wycofania jest przećwiczony. W logach CI nie ma ostrzeżeń o Node 20, a wrangler nie publikuje adresów podglądu.

### Key Discoveries:

- `src/pages/api/auth/signin.ts:11` przy braku klienta Supabase przekierowuje na `/auth/signin?error=Supabase%20is%20not%20configured`, a `:16` przy błędnych danych na `/auth/signin?error=Invalid%20login%20credentials`. Logowanie nieistniejącym kontem odróżnia więc działające sekrety od brakujących bez tworzenia danych.
- `astro.config.mjs` oznacza oba sekrety jako `optional: true` i nie wpisuje ich do bundla — sekrety Workera są czytane w runtime, więc build w jobie `deploy` nie potrzebuje `SUPABASE_*`.
- `npx wrangler rollback [version-id] -m <powód> -y` działa nieinteraktywnie (sprawdzone `--help`, wrangler 4.156.0).
- `scripts/smoke.mjs:66-80` — pętla kroków porównuje `status`, prefiks `location` i (od `4e8c06d`) fragment treści `text`; nowe kroki korzystają z tego samego formatu.
- Job `smoke` już czeka na gotowość serwera pętlą `curl -sf` (`ci.yml`, krok „Run smoke test against production preview”) — ten sam wzorzec posłuży do odczekania na nową wersję po wdrożeniu.

## What We're NOT Doing

- Bez wymaganego zatwierdzania wdrożeń w GitHubie (decyzja: push na `main` jest już decyzją człowieka).
- Bez pełnego smoke z rejestracją na produkcji i bez klucza `service_role` w GitHub secrets.
- Bez wdrożeń podglądowych dla pull requestów (Preview URLs wyłączone).
- Bez zmian w kodzie aplikacji, w sekretach Workera i w projekcie Supabase.
- Bez zmiany `optional: true` na wymagane sekrety (osobne ryzyko z rejestru w `infrastructure.md`).
- Bez wycofywania migracji Supabase — na razie ich nie ma; rollback dotyczy wyłącznie kodu Workera.
- Bez `cloudflare/wrangler-action` — wrangler z `devDependencies` gwarantuje tę samą wersję co lokalnie.

## Implementation Approach

Najpierw lokalnie weryfikowalne klocki (tryb produkcyjny smoke, konfiguracja wranglera), potem workflow, który je składa, a na końcu celowe wywołanie ścieżki awaryjnej. Wycofanie celuje w jawne ID wersji odczytane przed wdrożeniem, nie w „poprzednią wersję”, i uruchamia się tylko wtedy, gdy samo wdrożenie się powiodło — nieudany `wrangler deploy` nie zmienia produkcji, więc cofanie dobrej wersji byłoby szkodą.

## Critical Implementation Details

- **Timing & lifecycle** — nowa wersja może przez kilka sekund nie być jeszcze obsługiwana we wszystkich lokalizacjach; przed sprawdzeniem produkcji odczekaj, aż `/` odpowie 200 (do 60 s), tak jak job `smoke`. Wersję sprzed wdrożenia odczytaj w osobnym kroku **przed** `wrangler deploy` i zapisz w `$GITHUB_OUTPUT`; po wdrożeniu „aktualna” wersja to już nowa.
- **State sequencing** — krok rollbacku: `if: failure() && steps.deploy.outcome == 'success' && steps.previous.outputs.version_id != ''`. Po rollbacku uruchom ponownie produkcyjny smoke, żeby potwierdzić, że przywrócona wersja działa; job i tak pozostaje czerwony.

## Phase 1: Produkcyjny tryb smoke i konfiguracja wranglera

### Overview

Smoke dostaje tryb, który można bezpiecznie uruchamiać na produkcji, a `wrangler.jsonc` jawnie ustawia adresy Workera. Obie zmiany sprawdzamy lokalnie, zanim trafią do CI.

### Changes Required:

#### 1. Tryb `SMOKE_MODE=production`

**File**: `scripts/smoke.mjs`

**Intent**: Dodać zestaw kroków bez zapisu danych, wybierany zmienną `SMOKE_MODE`, żeby CI mogło sprawdzać produkcję po każdym wdrożeniu bez zakładania kont. Domyślny tryb (`full`) zostaje bez zmian dla joba `smoke` i lokalnego użycia.

**Contract**: `SMOKE_MODE` ∈ {`full` (domyślnie), `production`}; inna wartość kończy skrypt kodem 1 z komunikatem. Skrypt wypisuje użyty tryb. Kroki `production`:

- `home renders` → 200
- `dashboard redirects anonymous user` → 302 `/auth/signin`
- `signin page renders` → `GET /auth/signin` 200
- `signin reaches Supabase` → `POST /api/auth/signin` z nieistniejącym kontem `smoke-probe-<timestamp>@example.com` → 302 z `location` zaczynającym się od `/auth/signin?error=Invalid%20login%20credentials` (przy brakujących sekretach byłoby `Supabase%20is%20not%20configured`)

#### 2. Jawne adresy Workera

**File**: `wrangler.jsonc`

**Intent**: Zachować produkcyjny adres `workers.dev` i wyłączyć publiczne Preview URLs wersji, zgodnie z decyzją; usuwa też ostrzeżenia wranglera przy wdrożeniu.

**Contract**: `"workers_dev": true`, `"preview_urls": false` na najwyższym poziomie konfiguracji.

#### 3. Dokumentacja polecenia

**File**: `CLAUDE.md` (sekcja „Polecenia”), `README.md` (sekcja „Smoke test”)

**Intent**: Opisać `SMOKE_MODE=production` jako jedyny tryb dopuszczony na produkcji i to, że tryb domyślny zakłada konto.

**Contract**: po jednym zdaniu w obu sekcjach; bez zmian w innych sekcjach.

### Success Criteria:

#### Automated Verification:

- Tryb produkcyjny nie przechodzi na buildzie bez sekretów: `npm run build && npm run preview`, potem `SMOKE_MODE=production npm run smoke` kończy się FAIL na kroku `signin reaches Supabase` z `Supabase%20is%20not%20configured`
- Tryb produkcyjny przechodzi na produkcji: `SMOKE_MODE=production BASE_URL=https://tennis-match-companion.marcin-wojcik-swidnik.workers.dev npm run smoke`
- Nieznany tryb kończy się błędem: `SMOKE_MODE=foo npm run smoke` zwraca kod 1
- `npx wrangler deploy --dry-run` nie wypisuje ostrzeżeń o `workers_dev` ani `preview_urls`
- `npm run lint` i `npx astro check` bez błędów

#### Manual Verification:

- Po przebiegach z tej fazy w Supabase → Authentication → Users nie przybyło kont `smoke-probe-*`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznego sprawdzenia przed fazą 2.

---

## Phase 2: Job `deploy` w GitHub Actions

### Overview

Workflow wdraża po zielonym CI na `main`, sprawdza produkcję i w razie potrzeby wycofuje wersję. Wszystkie akcje przechodzą na wersje z Node 24.

### Changes Required:

#### 1. Sekret identyfikatora konta

**File**: — (GitHub secrets, `gh secret set CLOUDFLARE_ACCOUNT_ID`)

**Intent**: Wrangler w CI musi znać konto bez interaktywnego wyboru; wartość pochodzi z `npx wrangler whoami`. Ustawia Claude Code — to nie jest wartość tajna.

**Contract**: sekret repozytorium `CLOUDFLARE_ACCOUNT_ID`.

#### 2. Wersje akcji

**File**: `.github/workflows/ci.yml`

**Intent**: Usunąć ostrzeżenia o wycofywanym Node 20 we wszystkich jobach.

**Contract**: `actions/checkout@v7`, `actions/setup-node@v7`, `supabase/setup-cli@v3` (parametr `version: 2.122.0` i komentarz o zgodności z `devDependencies` zostają).

#### 3. Wyzwalacz ręczny

**File**: `.github/workflows/ci.yml`

**Intent**: Umożliwić ręczne uruchomienie całego workflow na `main` i przećwiczenie ścieżki awaryjnej w fazie 3.

**Contract**: `on.workflow_dispatch.inputs.simulate_check_failure` — `type: boolean`, `default: false`, opis wyjaśniający, że wymusza rollback po prawdziwym wdrożeniu.

#### 4. Job `deploy`

**File**: `.github/workflows/ci.yml`

**Intent**: Wdrożyć dokładnie ten commit, który przeszedł `ci` i `smoke`, sprawdzić produkcję i przy nieudanym sprawdzeniu wrócić do wersji sprzed wdrożenia.

**Contract**:

- `needs: [ci, smoke]`; `if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')` — nigdy dla `pull_request`.
- `environment: { name: production, url: https://tennis-match-companion.marcin-wojcik-swidnik.workers.dev }` bez wymaganych recenzentów (GitHub utworzy środowisko przy pierwszym przebiegu).
- `concurrency: { group: production, cancel-in-progress: false }` — wdrożenia nie nakładają się ani nie przerywają.
- `permissions: contents: read`; `env` joba: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` z sekretów oraz adres produkcji jako jedna zmienna.
- Kroki: checkout → setup-node 26 z cache npm → `npm ci` → `npm run build` (bez `SUPABASE_*`) → `id: previous` odczyt ID wersji aktualnie obsługującej 100% ruchu (np. `npx wrangler deployments status`; implementujący potwierdza format wyjścia w wranglerze 4.156) do `$GITHUB_OUTPUT` → `id: deploy` `npx wrangler deploy` z komunikatem zawierającym SHA commita → odczekanie na 200 z `/` (do 60 s) → `SMOKE_MODE=production npm run smoke` na adresie produkcji, a gdy `inputs.simulate_check_failure` jest `true`, krok kończy się celowo kodem 1 po smoke → rollback (warunek z „Critical Implementation Details”) `npx wrangler rollback <previous> -m "CI: post-deploy check failed for <sha>" -y` → ponowny `SMOKE_MODE=production npm run smoke` po rollbacku.

### Success Criteria:

#### Automated Verification:

- `CLOUDFLARE_ACCOUNT_ID` widoczny w `gh secret list`
- Po pushu przebieg CI na `main` jest zielony we wszystkich trzech jobach: `gh run watch <id> --exit-status`
- Job `deploy` nie uruchamia się dla pull requestów (warunek `if` w `ci.yml` obejmuje tylko `push` i `workflow_dispatch` na `main`)
- `npx wrangler deployments list` pokazuje nową wersję z SHA commita w komunikacie
- `SMOKE_MODE=production BASE_URL=<produkcja> npm run smoke` przechodzi po wdrożeniu z CI
- `gh run view <id>` nie pokazuje adnotacji o Node 20

#### Manual Verification:

- W repozytorium na GitHubie (Settings → Environments, zakładka Deployments) widać środowisko `production` z wpisem wdrożenia i linkiem do aplikacji
- Aplikacja na telefonie działa po wdrożeniu z CI tak samo jak wcześniej

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznego sprawdzenia przed fazą 3.

---

## Phase 3: Próba generalna rollbacku i dokumentacja

### Overview

Celowo wywołujemy ścieżkę awaryjną na prawdziwej produkcji, żeby rollback był sprawdzony, zanim będzie naprawdę potrzebny, a potem aktualizujemy dokumenty wdrożeniowe.

### Changes Required:

#### 1. Przebieg próbny

**File**: — (`gh workflow run ci.yml --ref main -f simulate_check_failure=true`)

**Intent**: Sprawdzić cały łańcuch: zapis wersji sprzed wdrożenia → wdrożenie → nieudane sprawdzenie → rollback → smoke po rollbacku. Wdrażany jest ten sam commit, więc użytkownicy nie widzą różnicy poza kilkusekundową zmianą wersji.

**Contract**: przebieg kończy się na czerwono; w logach joba `deploy` widać ID wersji sprzed wdrożenia, nowe ID, rollback do pierwszego z nich i zielony smoke po rollbacku.

#### 2. Plan wdrożenia

**File**: `context/deployment/deploy-plan.md`

**Intent**: Oznaczyć etap 6 jako wykonany, dopisać wiersz o automatycznym rollbacku w CI do tabeli „Rollback” i wpisy do „Dziennika wdrożeń” (wdrożenie z CI, próba rollbacku).

**Contract**: sekcje „6. Automatyczne wdrożenie…”, „7. Rollback”, „Dziennik wdrożeń”.

#### 3. Zasady projektu

**File**: `CLAUDE.md` (sekcja „Środowisko”, wpis o CI)

**Intent**: Zapisać, że push na `main` wdraża produkcję, że po wdrożeniu działa tylko `SMOKE_MODE=production` i że przy nieudanym sprawdzeniu CI sam robi rollback — to zmienia znaczenie każdego pushu dla agenta.

**Contract**: rozszerzenie istniejącego punktu o CI o 1–2 zdania.

### Success Criteria:

#### Automated Verification:

- Przebieg próbny kończy się statusem `failure`, a jego log zawiera udany `wrangler rollback`: `gh run view <id> --log`
- `npx wrangler deployments list` pokazuje po przebiegu próbnym jako aktywną wersję sprzed wdrożenia próbnego
- `SMOKE_MODE=production BASE_URL=<produkcja> npm run smoke` przechodzi po próbie
- `npx prettier --check context/deployment/deploy-plan.md CLAUDE.md`

#### Manual Verification:

- E-mail z GitHuba o nieudanym przebiegu dotarł do skrzynki
- Aplikacja na telefonie działa po próbie rollbacku

---

## Testing Strategy

### Integration Tests:

- `scripts/smoke.mjs` w trybie `production` jest testem po wdrożeniu; jego negatywna ścieżka (build bez sekretów) jest sprawdzona w fazie 1, zanim tryb trafi do CI.
- Tryb `full` dalej działa w jobie `smoke` na lokalnym Supabase — pełny przepływ rejestracji jest testowany przed każdym wdrożeniem.

### Manual Testing Steps:

1. Po fazie 2: otwórz aplikację na telefonie i zaloguj się.
2. Po fazie 3: sprawdź e-mail o nieudanym przebiegu i ponownie aplikację na telefonie.

## Migration Notes

Brak migracji danych. Pierwszy przebieg z jobem `deploy` utworzy GitHub Environment `production`. Ręczne `wrangler deploy` z komputera nadal działa, ale następny push na `main` nadpisze taką wersję.

## References

- Etap 6: `context/deployment/deploy-plan.md`
- Decyzja o platformie, rollback i zgody: `context/foundation/infrastructure.md` (sekcje Operational Story, Risk Register)
- Obecny workflow: `.github/workflows/ci.yml`
- Smoke: `scripts/smoke.mjs:38-80`
- Przekierowania logowania: `src/pages/api/auth/signin.ts:11`, `src/pages/api/auth/signin.ts:16`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Produkcyjny tryb smoke i konfiguracja wranglera

#### Automated

- [x] 1.1 Tryb produkcyjny nie przechodzi na buildzie bez sekretów — 27ace91
- [x] 1.2 Tryb produkcyjny przechodzi na produkcji — 27ace91
- [x] 1.3 Nieznany tryb kończy się błędem — 27ace91
- [x] 1.4 `wrangler deploy --dry-run` bez ostrzeżeń o `workers_dev` i `preview_urls` — 27ace91
- [x] 1.5 `npm run lint` i `npx astro check` bez błędów — 27ace91

#### Manual

- [x] 1.6 Brak nowych kont `smoke-probe-*` w Supabase — 27ace91

### Phase 2: Job `deploy` w GitHub Actions

#### Automated

- [x] 2.1 `CLOUDFLARE_ACCOUNT_ID` w `gh secret list` — c0f1c81
- [x] 2.2 Przebieg CI na `main` zielony we wszystkich trzech jobach — c0f1c81
- [x] 2.3 Job `deploy` nie uruchamia się dla pull requestów — c0f1c81
- [x] 2.4 `wrangler deployments list` pokazuje wersję z SHA commita — c0f1c81
- [x] 2.5 Produkcyjny smoke przechodzi po wdrożeniu z CI — c0f1c81
- [x] 2.6 Brak adnotacji o Node 20 — c0f1c81

#### Manual

- [x] 2.7 Środowisko `production` z wpisem wdrożenia na GitHubie — c0f1c81
- [x] 2.8 Aplikacja działa na telefonie po wdrożeniu z CI — c0f1c81

### Phase 3: Próba generalna rollbacku i dokumentacja

#### Automated

- [x] 3.1 Przebieg próbny kończy się `failure` z udanym rollbackiem w logu
- [x] 3.2 Aktywna jest wersja sprzed wdrożenia próbnego
- [x] 3.3 Produkcyjny smoke przechodzi po próbie
- [x] 3.4 `prettier --check` dla `deploy-plan.md` i `CLAUDE.md`

#### Manual

- [x] 3.5 E-mail z GitHuba o nieudanym przebiegu
- [x] 3.6 Aplikacja działa na telefonie po próbie rollbacku
