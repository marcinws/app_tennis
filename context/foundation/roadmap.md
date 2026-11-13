---
project: Tennis Match Companion
version: 1
status: draft
created: 2026-11-13
updated: 2026-11-13
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-real-match-recorded
milestone_seq: 1
milestone_status: open
---

# Roadmap: Tennis Match Companion

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.
> PRD nie numeruje wymagań niefunkcjonalnych, więc mapa nazywa je tak: `NFR-200ms` (nowy wynik poniżej 200 ms od dotknięcia, także przy słabej sieci), `NFR-android` (działa na telefonach z Androidem), `NFR-owner-only` (mecze i notatki widzi wyłącznie właściciel konta).

## Milestone

**M-1: Prawdziwy mecz zapisany na telefonie** — Status: open

- **Intent:** Rodzic zapisuje na telefonie cały prawdziwy mecz dziecka — wynik, cele, obserwacje i notatki — i po meczu widzi poprawny wynik z podsumowaniem, a zapisane punkty nie przepadają przy utracie sieci.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** US-01; FR-001–FR-005, FR-007–FR-018, FR-020 (wszystkie wymagania konieczne). FR-006 jest poza zakresem (patrz `## Parked`).

## Vision recap

Rodzic dziecka grającego w turniejach tenisowych musi w trakcie meczu liczyć i zapisywać punkty, aby pomóc dziecku, gdy pomyli wynik, a także notować uwagi o technice gry. Dziś robi to na kartce lub w telefonie, co rozprasza go podczas meczu, a zwykłe narzędzia nie łączą wyniku z obserwacjami z tego samego meczu.

## North star

**S-03: Rodzic zapisuje punkty meczu jednym dotknięciem w formacie „do 2 wygranych setów”, cofa pomyłki, widzi wynik i serwującego, a punkty nie przepadają bez sieci** — to najmniejszy przepływ, który dowodzi głównego kryterium sukcesu (zapis prawdziwego meczu na telefonie), a przy celu `speed` sprawdza najdroższe wymaganie (FR-011) zanim powstanie reszta.

> Gwiazda przewodnia to najmniejszy wycinek end-to-end, którego dostarczenie dowodzi, że produkt działa. Stoi tak wcześnie, jak pozwalają jego warunki wstępne, bo wszystko inne ma znaczenie tylko wtedy, gdy on działa.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                 | Prerequisites | PRD refs                                                              | Status   |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------- | -------- |
| F-01 | domain-test-runner              | (foundation) reguły liczenia wyniku da się sprawdzać testami jednostkowymi w CI      | —             | Business Logic, FR-004                                                | ready    |
| S-01 | player-roster                   | rodzic może zdefiniować zawodników, widocznych tylko na jego koncie                  | —             | FR-001, FR-002, FR-018, NFR-owner-only                                | ready    |
| S-02 | match-start                     | rodzic może rozpocząć mecz: zawodnik, opcjonalna nazwa turnieju, format, serwujący   | S-01          | FR-003, FR-004, FR-020                                                | proposed |
| S-03 | point-scoring-first-format      | rodzic może zapisywać punkty jednym dotknięciem, cofać je i nie tracić ich bez sieci | S-02, F-01    | US-01, FR-004, FR-005, FR-008, FR-010, FR-011, NFR-200ms, NFR-android | proposed |
| S-04 | manual-game-score-and-game-list | rodzic może ręcznie wpisać wynik gema i zobaczyć przebieg meczu jako listę gemów     | S-03          | FR-007, FR-009                                                        | proposed |
| S-05 | remaining-match-formats         | rodzic może zapisać mecz z super tie-breakiem lub w krótkich setach                  | S-03          | FR-004                                                                | proposed |
| S-06 | player-goals-on-match-screen    | rodzic może ustawić do trzech celów zawodnika i widzieć je na ekranie meczu          | S-01, S-03    | FR-012, FR-013                                                        | proposed |
| S-07 | in-match-observations-and-notes | rodzic może jednym dotknięciem zaznaczyć obserwację przy celu i dopisać notatkę      | S-06          | FR-014, FR-015                                                        | proposed |
| S-08 | post-match-summary              | rodzic może zobaczyć podsumowanie meczu i uzupełnić nazwę turnieju po meczu          | S-04, S-07    | US-01, FR-003, FR-016                                                 | proposed |
| S-09 | match-history                   | rodzic może przeglądać wcześniejsze mecze, otworzyć podgląd i usunąć mecz            | S-03          | FR-017                                                                | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                             | Note                                                                                  |
| ------ | ------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| A      | Zawodnik i start    | `S-01` → `S-02`                   | Najkrótsza droga do gwiazdy przewodniej; równolegle z `F-01`.                         |
| B      | Liczenie wyniku     | `F-01` → `S-03` → `S-04` → `S-05` | Łączy się ze strumieniem A w `S-03`; `S-05` jest pierwszy do cięcia przy braku czasu. |
| C      | Cele i podsumowanie | `S-06` → `S-07` → `S-08`          | Łączy się ze strumieniem B w `S-03`, a `S-08` czeka też na `S-04`.                    |
| D      | Historia            | `S-09`                            | Zależy tylko od `S-03`; można ją robić równolegle z B i C.                            |

## Baseline

What's already in place in the codebase as of `2026-11-13` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 z wyspami React 19, Tailwind 4, shadcn/ui (`src/components/ui/`), layout i strony startowe.
- **Backend / API:** partial — tylko trasy logowania (`src/pages/api/auth/*`); brak tras domenowych.
- **Data:** absent — `supabase/config.toml` jest, ale brak `supabase/migrations/` i tabel; używane tylko `auth.users`.
- **Auth:** present — logowanie e-mailem i hasłem przez Supabase z sesją w ciasteczkach, ochrona tras w `src/middleware.ts` (FR-001, FR-018 działają na produkcji).
- **Deploy / infra:** present — Cloudflare Workers, CI (lint, `astro check`, build, smoke) z auto-deployem i auto-rollbackiem na `main`; brak runnera testów jednostkowych (jest tylko smoke).
- **Observability:** partial — Workers Logs włączone w `wrangler.jsonc`, brak śledzenia błędów i alertów.

## Foundations

### F-01: Testy jednostkowe reguł domenowych

- **Outcome:** (foundation) czyste funkcje domenowe można sprawdzać testami jednostkowymi uruchamianymi lokalnie i w CI, z jednym przykładowym testem.
- **Change ID:** domain-test-runner
- **PRD refs:** Business Logic, FR-004
- **Unlocks:** S-03, S-04, S-05 — ścieżka weryfikacji reguł liczenia wyniku, serwującego i odrzucania wyników gemów niezgodnych z formatem.
- **Prerequisites:** —
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Reguły tenisowe (przewagi, tie-break, serwujący) łatwo popsuć po cichu; bez testów przed `S-03` poprawność wyniku sprawdzałby dopiero prawdziwy mecz.
- **Status:** ready

## Slices

### S-01: Lista zawodników

- **Outcome:** rodzic może zdefiniować zawodników, a widzi ich wyłącznie zalogowany właściciel konta.
- **Change ID:** player-roster
- **PRD refs:** FR-001, FR-002, FR-018, NFR-owner-only
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pierwszy wycinek z danymi ustala wzorzec tabel z dostępem tylko dla właściciela; logowanie (FR-001, FR-018) już działa i jest tu tylko wykorzystywane.
- **Status:** ready

### S-02: Start meczu

- **Outcome:** rodzic może rozpocząć mecz, wybierając zawodnika, wpisując nazwę turnieju albo zostawiając ją pustą, wybierając format i wskazując pierwszego serwującego.
- **Change ID:** match-start
- **PRD refs:** FR-003, FR-004, FR-020
- **Prerequisites:** S-01
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Na tym etapie dostępny jest tylko format „do 2 wygranych setów”; wybór formatu musi przewidywać dwa kolejne z `S-05`, żeby ich dodanie nie zmieniało startu meczu.
- **Status:** proposed

### S-03: Zapis punktów w pierwszym formacie

- **Outcome:** rodzic może zapisywać wygrane punkty jednym dotknięciem w formacie „do 2 wygranych setów”, cofać ostatnie akcje, widzieć aktualny wynik i podpowiedź serwującego z możliwością poprawki, a przy słabej lub zanikającej sieci zapisane punkty nie przepadają.
- **Change ID:** point-scoring-first-format
- **PRD refs:** US-01, FR-004, FR-005, FR-008, FR-010, FR-011, NFR-200ms, NFR-android
- **Prerequisites:** S-02, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Co ma się stać, gdy ten sam mecz zapisywany jest na dwóch telefonach jednego konta (drugi rodzic) i oba wracają do sieci? — Owner: user. Block: no.
- **Risk:** Najdroższy element MVP (FR-011) i jedyne miejsce, gdzie łączy się zapis na urządzeniu, synchronizacja i reguły wyniku; PRD każe go robić od początku, bo trudno dołożyć go później.
- **Status:** proposed

### S-04: Ręczny wynik gema i przebieg meczu

- **Outcome:** rodzic może ręcznie wpisać wynik gema, gdy przegapił punkty (aplikacja odrzuca wyniki niezgodne z formatem), i zobaczyć przebieg meczu jako listę wyników gemów.
- **Change ID:** manual-game-score-and-game-list
- **PRD refs:** FR-007, FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ręczny wynik gema musi tak samo przesuwać serwującego i działać przy słabej sieci jak punkty z `S-03`; robiony zaraz po nim korzysta z tych samych reguł.
- **Status:** proposed

### S-05: Pozostałe formaty meczu

- **Outcome:** rodzic może zapisać mecz w formacie „2 sety i super tie-break do 10” albo w krótkich setach do 4 gemów, w każdym z gemami z przewagami lub bez.
- **Change ID:** remaining-match-formats
- **PRD refs:** FR-004
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** PRD zakłada, że dwa kolejne formaty dochodzą po przetestowaniu reguł na pierwszym; przy celu `speed` to pierwszy kandydat do przesunięcia, jeśli zabraknie czasu.
- **Status:** proposed

### S-06: Cele zawodnika na ekranie meczu

- **Outcome:** rodzic może zdefiniować i zmieniać cele treningowe zawodnika (maksymalnie trzy aktywne naraz) i widzieć aktywne cele wybranego zawodnika na ekranie meczu przez cały czas zapisu.
- **Change ID:** player-goals-on-match-screen
- **PRD refs:** FR-012, FR-013
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-04, S-05, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cele dzielą ekran meczu z przyciskami punktów; nie mogą utrudniać zapisu ani spowalniać odpowiedzi poniżej 200 ms.
- **Status:** proposed

### S-07: Obserwacje i notatki podczas meczu

- **Outcome:** rodzic może podczas meczu zaznaczać obserwacje przy celu jednym dotknięciem i dopisywać krótkie notatki.
- **Change ID:** in-match-observations-and-notes
- **PRD refs:** FR-014, FR-015
- **Prerequisites:** S-06
- **Parallel with:** S-04, S-05, S-09
- **Blockers:** —
- **Unknowns:**
  - Czy obserwacje i notatki też mają przetrwać zanik sieci tak jak punkty? FR-011 i zabezpieczenia w PRD mówią tylko o punktach. — Owner: user. Block: no.
- **Risk:** Pisanie notatek odciąga od meczu (zabezpieczenie z PRD), więc obserwacja przy celu musi pozostać szybsza niż notatka.
- **Status:** proposed

### S-08: Podsumowanie po meczu

- **Outcome:** rodzic może zobaczyć po meczu na jednym ekranie wynik, cele, obserwacje i notatki oraz uzupełnić nazwę turnieju, jeśli pozostała pusta.
- **Change ID:** post-match-summary
- **PRD refs:** US-01, FR-003, FR-016
- **Prerequisites:** S-04, S-07
- **Parallel with:** S-05, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zamyka US-01 i główne kryterium sukcesu; bez statystyk i analiz (poza zakresem w PRD), więc tylko zbiera dane z wcześniejszych wycinków.
- **Status:** proposed

### S-09: Historia meczów

- **Outcome:** rodzic może przeglądać listę wcześniejszych meczów, otworzyć podgląd meczu i usunąć mecz po potwierdzeniu.
- **Change ID:** match-history
- **PRD refs:** FR-017
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Czy podgląd wcześniejszego meczu ma być tym samym ekranem co podsumowanie z `S-08`? — Owner: user. Block: no.
- **Risk:** Usunięcie jest nieodwracalne (notatek nie da się odtworzyć), więc potwierdzenie jest częścią wycinka, nie dodatkiem.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                       | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                    |
| ---------- | ------------------------------- | ----------------------------------------------------------- | --------------------- | ---------------------------------------- |
| F-01       | domain-test-runner              | Testy jednostkowe reguł domenowych w CI                     | yes                   | Run `/10x-plan domain-test-runner`       |
| S-01       | player-roster                   | Lista zawodników widoczna tylko dla właściciela             | yes                   | Run `/10x-plan player-roster`            |
| S-02       | match-start                     | Start meczu: zawodnik, turniej, format, pierwszy serwujący  | no                    | Czeka na S-01                            |
| S-03       | point-scoring-first-format      | Zapis punktów z cofaniem, odporny na brak sieci (1. format) | no                    | Czeka na S-02 i F-01; gwiazda przewodnia |
| S-04       | manual-game-score-and-game-list | Ręczny wynik gema i lista gemów                             | no                    | Czeka na S-03                            |
| S-05       | remaining-match-formats         | Super tie-break i krótkie sety                              | no                    | Czeka na S-03; pierwszy do cięcia        |
| S-06       | player-goals-on-match-screen    | Cele zawodnika na ekranie meczu                             | no                    | Czeka na S-01 i S-03                     |
| S-07       | in-match-observations-and-notes | Obserwacje przy celach i notatki podczas meczu              | no                    | Czeka na S-06                            |
| S-08       | post-match-summary              | Podsumowanie meczu i uzupełnienie turnieju                  | no                    | Czeka na S-04 i S-07                     |
| S-09       | match-history                   | Historia meczów z podglądem i usuwaniem                     | no                    | Czeka na S-03                            |

## Open Roadmap Questions

1. **Czy 18 obowiązkowych wymagań zmieści się w 15–30 godzinach pracy?** Zakres jest ambitny i może wymagać cięcia podczas pracy. — Owner: autor projektu. Block: roadmap-wide; wrócić po dostarczeniu `S-03` (pierwszy kandydat do cięcia: `S-05`).
2. **Jak „web-app” ma się do wymagania działania na telefonach z Androidem?** Notatki podają oba założenia i trzeba je uwzględnić przy wyborze technologii. — Owner: autor projektu. Block: none; `tech-stack.md` wybrał aplikację w przeglądarce telefonu, do potwierdzenia testem na Androidzie przy `S-03`.
3. **Czy limit 10 ms czasu procesora na żądanie w planie Free Cloudflare wystarczy?** Pierwsze wdrożenie zmierzyło 13 ms i 56 ms przy zimnym starcie. — Owner: autor projektu. Block: none; obserwować błędy 1102 w Workers Logs, szczególnie po `S-03`.

## Parked

- **Własne schematy punktacji** — Why parked: PRD §Non-Goals, w MVP tylko predefiniowane formaty.
- **Zaproszenia drugiego rodzica i współdzielenie między kontami** — Why parked: PRD §Non-Goals, w MVP jedno konto.
- **Pełne działanie offline (logowanie i start meczu bez sieci)** — Why parked: PRD §Non-Goals, bez sieci działa tylko zapis trwającego meczu.
- **Statystyki i analizy** — Why parked: PRD §Non-Goals, podsumowanie tylko zbiera dane.
- **Zapis gema jednym dotknięciem (FR-006)** — Why parked: PRD §Non-Goals, FR-007 pokrywa tę potrzebę.
- **Samodzielny reset hasła** — Why parked: PRD §Non-Goals, przy kilku użytkownikach naprawiany ręcznie.
- **Lista turniejów** — Why parked: PRD §Non-Goals, nazwa turnieju wpisywana przy meczu lub po nim.

## Milestone History

## Done
