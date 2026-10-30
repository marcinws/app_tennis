---
project: "Tennis Match Companion"
context_type: greenfield
created: 2026-10-30
updated: 2026-10-30
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria problemu"
      decision: "tarcie podczas meczu; priorytetem szybkość i prostota zapisu"
    - topic: "logowanie"
      decision: "e-mail i hasło"
    - topic: "relacja między rodzicami w MVP"
      decision: "jedno konto, bez zaproszeń"
    - topic: "praca bez internetu"
      decision: "pełny offline poza MVP; przy słabej lub zanikającej sieci zapisane punkty nie mogą przepaść, a trwający mecz można dalej zapisywać"
    - topic: "cele treningowe"
      decision: "definiowane wcześniej i aktualne do czasu zmiany, nie wybierane przed każdym meczem"
  frs_drafted: 17
  quality_check_status: accepted
---

## Seed idea

Aplikacja na telefon dla rodziców dzieci grających w turniejach tenisowych. Szybki zapis punktów i gemów, ręczna korekta wyniku gema, cofanie pomyłek, przebieg punktacji i podpowiedź serwisu, liczone według wybranego formatu. Do trzech celów treningowych na mecz: przypomnienia, obserwacje, notatki, podsumowanie. Główny rodzic może zaprosić drugiego. Ma działać przy słabym internecie. Termin: 6 grudnia.

Do rozstrzygnięcia: czy pełny offline jest konieczny na ten termin, liczba godzin tygodniowo, które formaty są w MVP.

Sugestie, jeszcze niezatwierdzone: offline na jednym urządzeniu, własne schematy i zaproszenia po MVP.

## Vision & Problem Statement

Rodzic dziecka grającego w turniejach tenisowych musi w trakcie meczu liczyć i zapisywać punkty, aby pomóc dziecku, gdy zapomni lub pomyli wynik, a także notować uwagi o technice gry. Dziś robi to na kartce lub w telefonie, co rozprasza go podczas meczu.

Zwykłe narzędzia nie łączą wyniku z obserwacjami z tego samego meczu.

## User & Persona

Rodzic dziecka startującego w turniejach tenisowych, który obserwuje mecz i zapisuje jego przebieg. W MVP są to autor projektu i drugi rodzic tego samego dziecka.

## Access Control

Logowanie e-mailem i hasłem. W MVP jedno konto bez zaproszeń i bez rozdzielania ról; wszystkie dane należą do tego konta.

## Success Criteria

Przepływ MVP: logowanie -> wybór turnieju -> wybór predefiniowanego typu meczu -> zapis wyniku z widocznymi aktualnymi celami -> podsumowanie po meczu.

### Primary
- Rodzic zapisuje na telefonie cały prawdziwy mecz dziecka, a na koniec widzi poprawny wynik i podsumowanie z obserwacjami.

### Secondary
- Gdy dziecko pyta o wynik, rodzic od razu mu go podaje.

### Guardrails
- Zapisane punkty nie przepadają przy utracie sieci.
- Zapis nie odciąga rodzica od meczu.

## Timeline budget

mvp_weeks: 3 (praca po 5–10 godzin tygodniowo).
hard_deadline: 2026-12-06
after_hours_only: true

## Product framing

- product_type: web-app
- target_scale.users: small

## Non-Goals

- Brak własnych schematów punktacji: w MVP tylko predefiniowane formaty, schematy docelowo po MVP.
- Brak zaproszeń drugiego rodzica: w MVP jedno konto, współdzielenie między kontami po MVP.
- Brak pełnego działania offline: logowanie i start meczu wymagają sieci, a bez sieci działa tylko zapis trwającego meczu.
- Brak statystyk i analiz: podsumowanie zbiera dane, bez wykresów i wyliczeń skuteczności.

## User Stories

### US-01: Rodzic zapisuje mecz i widzi podsumowanie

- **Given** zalogowany rodzic z określonymi aktualnymi celami
- **When** wybiera turniej i predefiniowany typ meczu, a następnie zapisuje przebieg gry
- **Then** widzi poprawny wynik i podsumowanie meczu z obserwacjami

#### Acceptance Criteria
- Wynik jest liczony według wybranego formatu.
- Turniej może pozostać pusty, jeśli nie został wcześniej zdefiniowany.

## Functional Requirements

### Konto i dane

- FR-001: Rodzic can zalogować się e-mailem i hasłem. Priority: must-have
  > Socrates: Counter-argument considered: "logowanie na korcie spowalnia". Resolution: wymaganie zostaje, sesja pozostaje aktywna, więc rodzic loguje się rzadko.
- FR-002: Rodzic can wcześniej zdefiniować zawodników i turnieje. Priority: must-have
  > Socrates: Counter-argument considered: "turniej to zbyt dużo pracy". Resolution: turniej to tylko nazwa i data, bez drabinek i rund.
- FR-003: Rodzic can rozpocząć mecz, wybierając zdefiniowany turniej i zawodnika albo pozostawiając je puste, oraz uzupełnić je po meczu. Priority: must-have
  > Socrates: Counter-argument considered: "puste pola psują historię". Resolution: dodana możliwość uzupełnienia po meczu.
- FR-004: Rodzic can wybrać predefiniowany format meczu: do 2 wygranych setów z tie-breakiem, 2 sety i super tie-break albo krótkie sety, w każdym gemy z przewagami lub bez, a tie-break zawsze z przewagami. Priority: must-have
  > Socrates: Counter-argument considered: "za dużo wariantów na start". Resolution: pierwsza wersja działa na jednym formacie, a dwa kolejne dochodzą po przetestowaniu reguł.

### Zapis wyniku

- FR-005: Rodzic can zapisać wygrany punkt jednym dotknięciem. Priority: must-have
  > Socrates: Counter-argument considered: "łatwo o przypadkowe dotknięcie". Resolution: wymaganie zostaje, cofanie musi być zawsze pod ręką.
- FR-006: Rodzic can zapisać wygranego gema jednym dotknięciem. Priority: nice-to-have
  > Socrates: Counter-argument considered: "ręczny wynik gema wystarczy". Resolution: FR-007 pokrywa tę potrzebę, zapis gema zostaje poza MVP.
- FR-007: Rodzic can ręcznie wpisać wynik gema, gdy przegapił część punktów, a aplikacja odrzuca wyniki niezgodne z formatem. Priority: must-have
  > Socrates: Counter-argument considered: "nieprawidłowy wynik gema". Resolution: dodane odrzucanie wyników niezgodnych z formatem.
- FR-008: Rodzic can cofnąć ostatnie akcje zapisu. Priority: must-have
  > Socrates: Counter-argument considered: "samo cofanie wystarczy w MVP". Resolution: zakres zawężony do cofania ostatnich akcji, bez edycji dowolnego punktu w przeszłości.
- FR-009: Rodzic can zobaczyć przebieg meczu jako listę wyników gemów. Priority: must-have
  > Socrates: Counter-argument considered: "wystarczy przebieg gemów". Resolution: zakres zawężony do listy wyników gemów zamiast każdego punktu.
- FR-010: Rodzic can zobaczyć podpowiedź, kto serwuje, i poprawić ją, gdy jest niezgodna z tym, co dzieje się na korcie. Priority: must-have
  > Socrates: Counter-argument considered: "podpowiedź może się mylić". Resolution: dodana możliwość poprawienia serwującego.
- FR-011: Rodzic can dalej zapisywać trwający mecz przy słabej lub zanikającej sieci bez utraty zapisanych punktów. Priority: must-have
  > Socrates: Counter-argument considered: "to prawie pełny offline". Resolution: wymaganie zostaje jako najdroższy element MVP, realizowany od początku, bo trudno dołożyć go później.

### Cele i obserwacje

- FR-012: Rodzic can zdefiniować i zmieniać cele treningowe każdego zawodnika, z maksymalnie trzema aktywnymi naraz na zawodnika. Priority: must-have
  > Socrates: Counter-argument considered: "cele należą do dziecka". Resolution: cele są przypisane do zawodnika, a nie do całego konta.
- FR-013: Rodzic can widzieć aktywne cele na ekranie meczu przez cały czas zapisu. Priority: must-have
  > Socrates: Counter-argument considered: "widoczne cele na ekranie wystarczą". Resolution: bez dźwięku i powiadomień, przypomnieniem są stale widoczne cele.
- FR-014: Rodzic can zaznaczać obserwacje przy celu jednym dotknięciem podczas meczu. Priority: must-have
  > Socrates: Counter-argument considered: "dublowanie z notatkami". Resolution: znaczniki zostają, bo jedno dotknięcie przy celu odciąga mniej niż pisanie, a notatki są dodatkiem.
- FR-015: Rodzic can dopisywać krótkie notatki podczas meczu. Priority: must-have
  > Socrates: Counter-argument considered: "pisanie odciąga od meczu". Resolution: wymaganie zostaje, aplikacja zachęca do krótkich notatek.
- FR-016: Rodzic can zobaczyć podsumowanie po meczu: wynik, cele, obserwacje i notatki na jednym ekranie. Priority: must-have
  > Socrates: Counter-argument considered: "wystarczy zebranie danych". Resolution: podsumowanie zbiera dane, bez statystyk i analiz.

### Historia

- FR-017: Rodzic can przeglądać listę wcześniejszych meczów, otworzyć ich podgląd i usunąć mecz po potwierdzeniu. Priority: must-have
  > Socrates: Counter-argument considered: "usuwanie może być przypadkowe". Resolution: usunięcie wymaga potwierdzenia, bo notatek nie da się odtworzyć.

## Non-Functional Requirements

- Rodzic widzi nowy wynik w czasie poniżej 200 ms od dotknięcia, także przy słabej sieci.
- Aplikacja działa na telefonach z systemem Android.
- Mecze i notatki widzi wyłącznie zalogowany właściciel konta.

## Business Logic

Na podstawie wybranego formatu i zapisanych punktów lub wyników gemów aplikacja wyznacza aktualny wynik meczu i podpowiada, kto serwuje, a przez cały czas pokazuje aktywne cele zawodnika.

Dane wejściowe to format, punkty, ręczne wyniki gemów i pierwszy serwujący. Wynikiem jest bieżący stan meczu i serwujący, widoczne na ekranie meczu.

## Format rules

- Do 2 wygranych setów: sety do 6 gemów, tie-break przy 6:6. To pierwszy format do zbudowania.
- 2 sety i super tie-break: przy 1:1 w setach rozstrzyga super tie-break do 10.
- Krótkie sety: set do 4 gemów, przy 4:4 tie-break do 7.
- W każdym formacie gemy mogą być z przewagami lub bez, a tie-break jest zawsze z przewagami.

## Open Questions

1. **Czy 16 obowiązkowych wymagań zmieści się w 15–30 godzinach pracy?** Zakres jest ambitny i może wymagać cięcia podczas pracy. Owner: autor projektu. By: po zbudowaniu pierwszego przepływu.
