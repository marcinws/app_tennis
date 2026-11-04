# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Źródła zakresu

- Obowiązujący zakres MVP opisuje `context/foundation/prd.md`. Ma pierwszeństwo przed `context/foundation/shape-notes.md`, który nie zawiera późniejszych zmian w PRD.
- `idea/` to materiały historyczne sprzed ustalenia zakresu, np. pełny offline, osobne konto drugiego rodzica i sześć formatów. Nie traktuj ich jako wymagań.

## Twarde zasady projektu

- Każda nowa tabela Supabase ma włączone RLS z osobnymi politykami na operację i rolę. Mecze i notatki widzi wyłącznie zalogowany właściciel konta (NFR w PRD).

## Polecenia

- `npm run dev` — serwer deweloperski (środowisko Cloudflare workerd)
- `npm run build` — build produkcyjny (SSR przez `@astrojs/cloudflare`)
- `npm run preview` — podgląd buildu produkcyjnego
- `npm run lint` / `npm run lint:fix` — ESLint z regułami sprawdzającymi typy
- `npm run format` — Prettier (z wtyczkami Astro i Tailwind)
- `npx astro check` — sprawdzenie typów; CI uruchamia je po `npx astro sync`
- `npm run smoke` — test przepływu logowania (`scripts/smoke.mjs`) na działającym serwerze pod `BASE_URL` (domyślnie `http://localhost:4321`). Uruchamiaj po aktualizacji zależności.

Nie ma jeszcze runnera testów jednostkowych, więc nie da się uruchomić pojedynczego testu. Dopisz polecenie, gdy powstanie.

Hook pre-commit (husky + lint-staged) uruchamia `eslint --fix` na `*.{ts,tsx,astro}` i `prettier --write` na `*.{json,css,md}`. Husky ustawia `core.hooksPath` w skrypcie `prepare`, więc po świeżym klonie hook działa dopiero po `npm install`.

Skrypty instalacyjne zależności są dopuszczane jawnie w `allowScripts` w `package.json` (npm 11). Po podbiciu wersji `esbuild` lub `workerd` zatwierdź je ponownie: `npm install-scripts approve esbuild workerd`.

## Architektura

Aplikacja Astro 7 w trybie SSR (`output: "server"`) z wyspami React 19, Tailwind 4, logowaniem przez Supabase i komponentami shadcn/ui, wdrażana na Cloudflare Workers. Szkielet pochodzi z `10x-astro-starter`; log bootstrapu jest w `context/changes/bootstrap-verification/verification.md`.

### Logowanie

- `src/lib/supabase.ts` tworzy klienta Supabase SSR (`@supabase/ssr`) z sesją w ciasteczkach. `SUPABASE_URL` i `SUPABASE_KEY` to sekrety serwerowe z `astro:env/server`, zadeklarowane w `env.schema` w `astro.config.mjs`.
- `src/middleware.ts` przy każdym żądaniu ustala użytkownika w `context.locals.user` i przekierowuje niezalogowanych z tras w `PROTECTED_ROUTES`.
- Endpointy: `src/pages/api/auth/{signin,signup,signout}.ts`. Strony: `src/pages/auth/{signin,signup,confirm-email}.astro`. Przykład chronionej strony: `src/pages/dashboard.astro`.

### Konwencje

- Strony i layouty to pliki `.astro`. React tylko dla elementów ze stanem lub obsługą zdarzeń na kliencie (np. przyciski punktów, cofanie). Bez dyrektyw Next.js (`"use client"`). Hooki w `src/components/hooks/`.
- Klasy Tailwind łącz helperem `cn()` z `@/lib/utils`, nie sklejaj stringów ręcznie.
- shadcn/ui: komponenty w `src/components/ui/`, styl "new-york", nowe dodawaj przez `npx shadcn@latest add <nazwa>`.
- Trasy API eksportują handlery `GET`/`POST` typu `APIRoute`. Nowe trasy walidują wejście przez `z` z `astro/zod` (bez osobnej zależności `zod`), zamiast rzutować dane formularza `as string` jak w `src/pages/api/auth/*`.
- Reguły liczenia wyniku i inne czyste funkcje domenowe w `src/lib/services/<obszar>.ts`, bez importów z Astro i Supabase, żeby dało się je testować w izolacji. W `src/lib/` tylko infrastruktura (`supabase.ts`, `utils.ts`). Wspólne typy w `src/types.ts`.
- Migracje Supabase w `supabase/migrations/` z nazwą `YYYYMMDDHHmmss_krotki_opis.sql`.

### Środowisko

- Node.js 26 (`.nvmrc`: 26.13.0, CI: 26).
- Końce linii LF wymusza `.gitattributes`, bo Prettier odrzuca CRLF, a git na Windows z `core.autocrlf=true` domyślnie zapisuje pliki z CRLF.
- ESLint pomija `.claude/` (`globalIgnores` w `eslint.config.js`), bo to zarządzane skille kursu, nie kod projektu.
- Konfiguracja Supabase, zmienne środowiskowe i wdrożenie: @README.md.
- Bez `SUPABASE_URL` i `SUPABASE_KEY` build przechodzi, ale `createClient` w `src/lib/supabase.ts` zwraca `null` i logowanie jest wyłączone.
- CI (`.github/workflows/ci.yml`) uruchamia lint, `astro check`, build i test smoke z lokalnym Supabase. Wersja Supabase CLI w CI musi być równa `supabase` w `package.json`, bo CLI 3.x odrzuca sekcję `[inbucket]` w `supabase/config.toml`.
- Zasady dopisuj w `CLAUDE.md`; `AGENTS.md` tylko wskazuje na ten plik.

## Zestaw 10x-cli

- `.claude/skills/`, `.claude/prompts/` i blok między znacznikami poniżej są zarządzane przez `@przeprogramowani/10x-cli`. Blok jest podmieniany przy każdym `get`, więc własne zasady dopisuj poza znacznikami.
- `get` na tym komputerze losowo kończy się błędem `EPERM` przy podmianie `.claude/.10x-cli-manifest.json`, bo CLI nie ponawia `rename`. Ponów polecenie z preloadem przez `NODE_OPTIONS=--require`, który ponawia `fs.renameSync` przy `EPERM`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — moduł 3, lekcja 5 (debugowanie)

Zamień awarię w poprawkę, której agent może bronić: najpierw dowody, potem nieprzechodzący test, a następnie poprawka.

```
signal (monitoring | log | flaky E2E | stack trace) -> gather evidence -> reproduce -> failing test -> fix -> verify
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-frame` | Zgłoszenie przychodzi jako „bug + proponowana poprawka”. Sprawdź, czy zaobserwowany objaw i podana przyczyna rzeczywiście do siebie pasują, zanim ktokolwiek cokolwiek naprawi. |
| `/10x-new` -> `/10x-research` -> `/10x-plan` -> `/10x-implement` | Poprawka to coś więcej niż jednolinijkowa zmiana. Research zbiera dowody; plan zaczyna się od nieprzechodzącego testu regresji. |
| `/10x-tdd` | Pisanie testu regresji, który odtwarza błąd przed wprowadzeniem poprawki. |
| `/10x-e2e` | Błąd pojawia się tylko w uruchomionej aplikacji. Odtwórz go w przeglądarce i zachowaj ten test. |
| `/10x-observability-audit` | Błędy są nieobecne, zaszumione lub niemożliwe do zdiagnozowania na produkcji. Audytuje krytyczne przepływy pod kątem kodu ukrywającego awarie i zapisuje raport z datą w `context/audits/observability/`. Użyj `--verify <report>`, aby ponownie sprawdzić wcześniejszy raport po poprawkach. |

### Twarde zasady

- **Dowody przed hipotezą.** Korzystaj z tego, co pokazują tracker błędów, logi, odtworzenie problemu i kod. Nigdy nie zgaduj przyczyny wyłącznie na podstawie stack trace.
- **Błąd najpierw staje się nieprzechodzącym testem.** Poprawka jest gotowa, gdy ten test przechodzi z czerwonego na zielony i pozostaje w zestawie testów.
- **Nigdy nie ukrywaj dowodów.** Żadnych pustych `catch`, żadnych ignorowanych odrzuceń promise'ów, żadnego zamieniania awarii w przekierowania lub `200`, żadnego porzucania przyczyn błędów. Jeśli poprawka wymaga `catch`, loguje lub raportuje błąd wraz z jego przyczyną.
- **Napraw przyczynę, nie test.** Nie edytuj asercji, aby pasowała do nowego zachowania, chyba że zmieniło się samo wymaganie.

### Granice lekcji

- `/10x-observability-audit` czyta kod i zapisuje raport. Nigdy nie zmienia audytowanego kodu. Naprawianie tego, co znajdzie, przechodzi przez łańcuch zmian.
- Wybór dostawcy monitoringu należy do `/10x-infra-research`, a nie do tej lekcji.

<!-- END @przeprogramowani/10x-cli -->
