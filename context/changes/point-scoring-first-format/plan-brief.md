# Zapis punktów w pierwszym formacie — Plan Brief

> Full plan: `context/changes/point-scoring-first-format/plan.md`

## What & Why

Rodzic zapisuje na telefonie punkty meczu jednym dotknięciem w formacie „do 2 wygranych setów”. Może cofać pomyłki, widzi wynik i serwującego, a przy zanikającej sieci zapisane punkty nie przepadają. To gwiazda przewodnia roadmapy (S-03): najmniejszy przepływ, który dowodzi głównego kryterium sukcesu, i najdroższe wymaganie MVP (FR-011), które PRD każe zbudować od początku.

## Starting Point

S-02 zapisuje start meczu w `public.matches` i pokazuje dane startu na `/matches/<id>`. Reguły wyniku to dziś tylko `pointLabel`. `authenticated` nie ma `update` na `matches`, nie ma wysp React ze stanem poza logowaniem, a middleware odpowiada niezalogowanemu na `/api/*` przekierowaniem 302.

## Desired End State

`/matches/<id>` jest ekranem zapisu:

- dwa duże przyciski punktu;
- „Cofnij” aż do początku meczu;
- „Zmień serwującego”;
- tablica setów, gemów i punktów z tie-breakiem;
- linia stanu zapisu („Zapisano”, „Czeka na sieć”, błędy).

Punkty zapisują się na telefonie od razu, a do Supabase w tle. Po końcu meczu przyciski punktów są zablokowane. Konflikt z drugim telefonem jest wykryty, a rodzic wybiera wersję.

## Key Decisions Made

| Decision             | Choice                                                        | Why (1 sentence)                                                                          |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Model danych         | Cały przebieg jako `matches.events jsonb` + `revision`        | Jedno uprawnienie na dwie kolumny, ponowienia są idempotentne, cofanie to krótsza lista.  |
| Strona bez sieci     | Zapis działa przy otwartej karcie, bez service workera        | Zgodne z Non-Goal „brak pełnego offline”; punkty z telefonu wracają po otwarciu z siecią. |
| Głębokość cofania    | Do początku meczu                                             | Najprostsza reguła, a pomyłkę sprzed kilku punktów da się poprawić.                       |
| Koniec meczu         | Blokada punktów, „Cofnij” działa, bez kolumny statusu         | Brak niemożliwych wyników, a ostatnia pomyłka zostaje do poprawienia.                     |
| Poprawka serwującego | Akcja w przebiegu, odwraca serwującego i dalszą rotację       | Na korcie błędna podpowiedź zwykle przesuwa całą kolejność.                               |
| Dwa telefony         | 409 i wybór „Wczytaj wersję z serwera” / „Zachowaj mój zapis” | Żadne punkty nie znikają po cichu (zabezpieczenie z PRD), bez logiki scalania.            |
| Dowód FR-011         | Testy jednostkowe kolejki + smoke trasy + test na Androidzie  | Istniejące narzędzia w budżecie godzin; E2E z Playwright zostaje jako dalsza praca.       |
| Stan zapisu          | Krótka linia pod wynikiem                                     | Rodzic wie, że punkty są bezpieczne, a błędy nie są ukryte.                               |
| Bez przewag          | Obsłużone w regułach, w UI dopiero S-05                       | Kolumna `with_advantage` już jest, a koszt w silniku jest mały.                           |

## Scope

**In scope:**

- reguły gema, seta, tie-breaka, końca meczu i serwującego z testami;
- migracja `events`/`revision` z `update` na kolumny i polityką;
- trasa `PUT /api/matches/<id>/log`;
- kolejka na telefonie (`localStorage`, ponawianie, konflikt);
- wyspa ekranu meczu;
- smoke;
- wdrożenie.

**Out of scope:**

- service worker;
- tabela zdarzeń;
- scalanie dwóch telefonów;
- redo;
- przycisk „Zakończ mecz”;
- ręczny wynik gema (S-04);
- pozostałe formaty i przełącznik przewag (S-05);
- Playwright;
- zmiana middleware.

## Architecture / Approach

Źródłem prawdy jest lista akcji (`point` z wygrywającym, `switch_server`), a stan meczu to zawsze jej odtworzenie czystą funkcją `replayMatch`. Używa jej ekran przy każdym dotknięciu i trasa przed zapisem.

Hook `useMatchLog` zapisuje listę do `localStorage` synchronicznie, a potem wysyła cały przebieg z `base_revision`, z najwyżej jednym żądaniem w locie i z `redirect: "manual"`, żeby wygasła sesja nie udawała sukcesu. Trasa zapisuje warunkowo na `revision`:

- identyczny przebieg przy innym numerze uznaje za ponowienie;
- inny przebieg przy innym numerze kończy się 409 z wersją z serwera.

Decyzje kolejki (co wczytać, jak potraktować odpowiedź, opóźnienia ponowień) są czystymi funkcjami w `match-sync.ts`.

## Phases at a Glance

| Phase                                     | What it delivers                                                        | Key risk                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Reguły wyniku i serwującego            | `replayMatch`, etykiety, odczyt przebiegu; testy                        | Ciche błędy w tie-breaku i rotacji serwującego                 |
| 2. Migracja i trasa zapisu przebiegu      | `events`/`revision`, `update` na kolumny, `PUT …/log` z 409             | `check` na `jsonb` i uprawnienia szersze niż kolumny trasy     |
| 3. Ekran zapisu z kolejką na telefonie    | `match-sync.ts` z testami, `useMatchLog`, `MatchRecorder`               | Utrata punktu przy zamknięciu karty lub wygasłej sesji         |
| 4. Smoke, ustawienia produkcji, wdrożenie | Kroki smoke trasy, `db push`, sprawdzenie produkcji, test na Androidzie | Kolejność migracja → kod; zachowanie w prawdziwej słabej sieci |

**Prerequisites:** S-02 i F-01 zrobione (oba `done`). Gałąź `point-scoring-first-format` z PR, a `db push` przed merge.
**Estimated effort:** ~4 sesje w 4 fazach; najwięcej pracy w fazach 1 i 3.

## Open Risks & Assumptions

- Android może zamknąć kartę w tle. Bez sieci rodzic nie wróci wtedy do zapisu, dopóki sieć nie wróci, choć punktów nie traci. Świadomie bez service workera.
- `localStorage` może być niedostępny (tryb prywatny). Wtedy ekran pokazuje błąd zapisu na telefonie i synchronizuje tylko przez sieć.
- Limit 10 ms CPU w planie Free Cloudflare przy odtwarzaniu przebiegu na trasie — do obserwacji w Workers Logs.
- Brak automatycznego testu przeglądarkowego utraty sieci. Ścieżkę przeglądarki sprawdza tylko test ręczny.

## Success Criteria (Summary)

- Rodzic zapisuje na Androidzie mecz do końca, z cofaniem i poprawką serwującego, a wynik jest poprawny według formatu.
- Punkty zapisane w trybie samolotowym trafiają na serwer po powrocie sieci i są widoczne po przeładowaniu.
- Drugi telefon nie nadpisuje meczu po cichu, a konto B nie może zapisać przebiegu meczu A.
