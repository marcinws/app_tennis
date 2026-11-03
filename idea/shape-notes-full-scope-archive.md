---
project: "Tennis Match Companion"
context_type: greenfield
created: 2026-10-29
updated: 2026-10-29
checkpoint:
  current_phase: 7
  phases_completed: [1, 2, 3, 4, 5, 6]
  gray_areas_resolved:
    - topic: "Główna wartość"
      decision: "Śledzenie wyniku na żywo, korekty i odtwarzalna chronologia; cele treningowe jako drugi filar."
    - topic: "Dostęp rodziców"
      decision: "Osobne konta e-mail/hasło, dwie osoby na profil przez jednorazowy kod, jeden prowadzący punktację na mecz."
    - topic: "Format punktacji MVP"
      decision: "Sześć gotowych wariantów: trzy formaty tenisowe z wersjami advantage i No-Ad; bez edytora."
    - topic: "Tryby i korekty"
      decision: "Punkt po punkcie i gem po gemie, natychmiastowe przełączanie, korekta bieżącego i ostatniego zakończonego gema, historia operacji."
    - topic: "Offline"
      decision: "Cały mecz bez internetu, lokalna trwałość zdarzeń, synchronizacja później; blokada wylogowania przy zaległych zmianach."
    - topic: "Konflikty"
      decision: "Podwójny mecz offline nie usuwa danych; po synchronizacji użytkownik wybiera aktywny, drugi staje się wstrzymany."
    - topic: "Przeniesienie urządzenia"
      decision: "Ten sam rodzic może przenieść prowadzenie na inne urządzenie wyłącznie po pełnej synchronizacji pierwszego."
    - topic: "Zarządzanie danymi"
      decision: "W MVP brak usuwania meczów, archiwizacji/usuwania profili z UI i odłączania rodziców; żądania prywatności poza tym ograniczeniem."
    - topic: "Test główny"
      decision: "E2E obejmuje pełny mecz, korektę i późniejszy przegląd historii; offline nadal wymaga weryfikacji odrębnej."
  frs_drafted: 54
  quality_check_status: pending
---

# Tennis Match Companion — notatki z `/10x-shape`

> **Status:** roboczy checkpoint po rozmowie; decyzje produktowe przechwycone. Końcowa kontrola krzyżowa (faza 7) oczekuje na akceptację użytkownika. To **nie** jest gotowy PRD ani uruchomienie skilla w lokalnym repozytorium użytkownika. Dokument przygotowano do umieszczenia w `context/foundation/shape-notes.md` projektu i dalszego przetworzenia przez `/10x-prd` po zatwierdzeniu.

## Vision & Problem Statement

Rodzic obserwujący mecz juniorskiego tenisa często samodzielnie prowadzi notatki na kartce, gdy dzieci sędziują spotkanie i ogłaszają wynik. Przy pominięciu wymiany lub pomyłce trudno odtworzyć punktację, potwierdzić aktualny stan i zachować rzetelną historię meczu. Na kortach internet bywa słaby lub niedostępny.

Tennis Match Companion ma pozwalać rodzicowi szybko zapisywać punkty albo całe gemy, korygować wynik bez utraty śladu zmian oraz wracać do chronologii zdarzeń. Drugim zastosowaniem jest przypominanie dziecku ustalonych przed spotkaniem celów treningowych i obserwowanie ich realizacji po każdym gemie.

## User & Persona

**Główna persona:** rodzic młodego zawodnika/zawodniczki grającego/-ej turnieje tenisowe. Używa telefonu na korcie, często jedną ręką i w krótkich przerwach, potrzebuje minimalnej liczby dotknięć i pewności, że notatki nie znikną po zerwaniu połączenia.

**Drugorzędna persona:** drugi rodzic tego samego dziecka. Korzysta z osobnego konta, ogląda wynik i historię z ostatniej synchronizacji, współzarządza profilem i celami, ale nie może wprowadzać punktacji meczu rozpoczętego przez pierwszego rodzica.

## Success Criteria

### Primary

- Rodzic jest w stanie przeprowadzić mecz od utworzenia do potwierdzonego zakończenia, wprowadzić korektę i odczytać kolejność punktów, gemów oraz zmian w szczegółowej historii.
- Rozpoczęty mecz można prowadzić w całości bez dostępu do internetu; zapisane lokalnie zdarzenia są dostępne po zamknięciu i ponownym otwarciu aplikacji, a następnie synchronizowane bez utraty lub dublowania zdarzeń.

### Secondary

- Po każdym gemie można ocenić do trzech celów treningowych oraz później przejrzeć obserwacje w kontekście przebiegu meczu.
- Drugi rodzic widzi ostatni zsynchronizowany wynik i czas aktualizacji, a po odzyskaniu łączności otrzymuje nowsze dane.

### Guardrails

- Tylko uprawnieni rodzice mogą przeglądać profil i powiązane z nim dane; tylko prowadzący może zmieniać punktację swojego meczu.
- Korekty nie tworzą fikcyjnych punktów ani nie usuwają chronologii wcześniej wprowadzonych zdarzeń.
- Dane z telefonu prowadzącego nie są tracone wskutek zamknięcia aplikacji, restartu ani ponownego wysyłania po chwilowej awarii sieci.
- Wynik widziany przez drugiego rodzica podczas braku synchronizacji jest oznaczony czasem ostatniej aktualizacji.

## User Stories

### US-01: Pełny przebieg i historia meczu — główny test E2E

- **Given** zalogowany rodzic z profilem zawodnika i wybranymi celami.
- **When** tworzy mecz, wskazuje pierwszy serwis i format, zapisuje punkty, dokonuje korekty, dopisuje notatkę, ocenia cele, potwierdza zakończenie i otwiera podsumowanie.
- **Then** widzi poprawny wynik, chronologię punktów, gemów i korekt, notatki oraz oceny przypisane do właściwych gemów.

#### Acceptance Criteria
- Nowy mecz wymaga wskazania pierwszego serwującego; nazwa przeciwnika jest opcjonalna.
- Zapis punktu lub gema aktualizuje wynik zgodnie z regułami meczu.
- Cofnięta albo skorygowana operacja nie znika bez śladu z historii.
- Po potwierdzeniu zakończenia punktacja nie podlega dalszej edycji.
- Główny obowiązkowy scenariusz E2E to właśnie ta historia użytkownika.

### US-02: Korekty i niepełna punktacja

- **Given** trwający gem ze znanym częściowym wynikiem.
- **When** rodzic przełącza tryb rejestrowania, ręcznie przyznaje gem albo ustawia aktualny wynik punktowy.
- **Then** wynik bieżący pozostaje spójny, a historia zachowuje wcześniejsze punkty i osobne zdarzenie korekty.

#### Acceptance Criteria
- Możliwe jest cofnięcie ostatniej operacji, korekta bieżącego oraz ostatniego zakończonego gema; edycja dowolnych dawnych gemów poza MVP.
- Ręczne przyznanie gema nie dopisuje niezaobserwowanych punktów; gem jest oznaczony jako niepełny/ręcznie zakończony.
- Ręczna korekta bieżącej punktacji nie tworzy sztucznych punktów.
- Zmiana trybu punkt-po-punkcie ↔ gem-po-gemie działa natychmiast, także w trakcie gema.

### US-03: Cele treningowe i notatki

- **Given** profil z maksymalnie trzema aktywnymi celami.
- **When** rodzic kończy gem.
- **Then** widzi przypomnienie celów, może ocenić każdy jako „osiągnięty”, „częściowo osiągnięty”, „nieosiągnięty” albo pominąć ocenę.

#### Acceptance Criteria
- Cele z profilu są dołączane do meczu, z możliwością zmiany przed jego rozpoczęciem.
- Pominięta ocena nie jest liczona jako negatywna.
- Notatka dodana podczas meczu ma przypisanie do aktywnego gema i czas dodania.
- Po zakończeniu meczu oboje rodzice mogą poprawiać notatki i oceny, ale nie wynik ani przebieg punktacji.

### US-04: Offline i synchronizacja

- **Given** wcześniej zalogowany rodzic z dostępnym profilem zawodnika.
- **When** traci internet przed lub podczas meczu, zapisuje punkty/korekty/notatki, zamyka aplikację, a później odzyskuje połączenie.
- **Then** może kontynuować mecz bez utraty lokalnych danych, a wszystkie zdarzenia trafiają do wspólnej historii po synchronizacji.

#### Acceptance Criteria
- Bez internetu można rozpocząć, prowadzić, wstrzymać, wznowić i zakończyć mecz.
- Lokalne zmiany przetrwają zamknięcie i ponowne uruchomienie aplikacji.
- Nie można się wylogować, dopóki są niezsynchronizowane zdarzenia.
- Widoczny jest stan synchronizacji i liczba oczekujących zmian.
- Ponowne wysłanie nie duplikuje punktów.
- Ta historia wymaga osobnej weryfikacji offline (nie została wybrana jako podstawowy obowiązkowy test E2E).

### US-05: Drugi rodzic i uprawnienia

- **Given** pierwszy rodzic utworzył profil zawodnika.
- **When** generuje jednorazowy kod i drugi rodzic używa go na własnym koncie.
- **Then** drugi rodzic ma równorzędny dostęp do profilu, celów i historii, ale punktację danego meczu edytuje tylko rodzic, który go rozpoczął.

#### Acceptance Criteria
- Kod można wykorzystać tylko raz i maksymalnie dwóch rodziców może zostać przypisanych do profilu w MVP.
- Osoba niepowiązana z profilem nie uzyskuje dostępu do meczów.
- Drugi rodzic widzi ostatni zsynchronizowany wynik i znacznik czasu aktualizacji.

### US-06: Wstrzymanie, wznowienie i konflikt

- **Given** mecz trwający albo wstrzymany.
- **When** rodzic wstrzymuje mecz i wraca do niego później.
- **Then** wynik, serwujący, historia, cele i notatki pozostają niezmienione.

#### Acceptance Criteria
- Dla zawodnika może być jeden trwający mecz i wiele wstrzymanych.
- Jeśli dwa urządzenia utworzyły offline dwa trwające mecze tego samego zawodnika, przy synchronizacji zachowuje się obie historie; użytkownik wybiera jeden aktywny, drugi zostaje wstrzymany.
- Przeniesienie prowadzenia między urządzeniami tego samego rodzica wymaga pełnej synchronizacji urządzenia źródłowego; po zmianie tylko docelowe może punktować.

## Functional Requirements

### Konta i profile
- FR-001: Rodzic może zarejestrować konto przy użyciu adresu e-mail i hasła. Priority: must-have
- FR-002: Rodzic może się zalogować i uzyskać dostęp do własnych oraz udostępnionych profili zawodników. Priority: must-have
- FR-003: Rodzic może utworzyć profil zawodnika, podając tylko imię lub pseudonim. Priority: must-have
- FR-004: Rodzic może ustawić w profilu domyślny schemat punktacji. Priority: must-have
- FR-005: Rodzic może ustawić w profilu domyślny tryb zapisu: punkty albo całe gemy. Priority: must-have
- FR-006: Rodzic może utworzyć i utrzymywać maksymalnie trzy aktywne cele treningowe w profilu. Priority: must-have
- FR-007: Rodzic może wygenerować jednorazowy kod udostępnienia profilu drugiemu rodzicowi. Priority: must-have
- FR-008: Drugi rodzic może połączyć swoje konto z profilem, podając ważny, niewykorzystany kod. Priority: must-have

### Uruchomienie meczu i punktacja
- FR-009: Rodzic może rozpocząć mecz dla wybranego zawodnika i gotowego formatu punktacji. Priority: must-have
- FR-010: Rodzic może pozostawić nazwę przeciwnika pustą i korzystać z nazwy domyślnej. Priority: must-have
- FR-011: Rodzic musi wybrać pierwszą osobę serwującą przed startem meczu. Priority: must-have
- FR-012: Rodzic może wybrać przed meczem format inny niż domyślny z profilu. Priority: must-have
- FR-013: Rodzic może zmienić przed meczem automatycznie dołączone cele. Priority: must-have
- FR-014: Prowadzący może przyznać pojedynczy punkt wybranemu zawodnikowi. Priority: must-have
- FR-015: Prowadzący może ręcznie przyznać cały gem wybranemu zawodnikowi. Priority: must-have
- FR-016: Prowadzący może w trakcie meczu natychmiast przełączać tryb punktów i gemów, zachowując częściowy stan. Priority: must-have
- FR-017: Prowadzący może cofnąć ostatnią operację rejestrowania wyniku. Priority: must-have
- FR-018: Prowadzący może skorygować aktualny wynik punktowy gema bez dopisywania brakujących wymian. Priority: must-have
- FR-019: Prowadzący może skorygować bieżący i ostatni zakończony gem. Priority: must-have
- FR-020: Prowadzący może ręcznie ustawić bieżący wynik tie-breaka, zachowując wcześniejszą historię. Priority: must-have
- FR-021: Prowadzący może zobaczyć automatycznie wyliczany wynik gemów, setów i meczu. Priority: must-have
- FR-022: Prowadzący może zobaczyć automatyczną podpowiedź serwującego w gemie i tie-breaku. Priority: must-have
- FR-023: Prowadzący może ręcznie skorygować osobę serwującą, z zachowaniem zdarzenia korekty. Priority: must-have
- FR-024: Rodzic może przeglądać chronologiczne zdarzenia pogrupowane według setów i gemów. Priority: must-have
- FR-025: Rodzic może rozpoznać w historii gem ręcznie zakończony lub o niepełnej punktacji. Priority: must-have

### Schematy i zakończenie
- FR-026: Rodzic może wybrać standardowy mecz do dwóch wygranych setów do 6 gemów, z tie-breakiem przy 6:6, w wariancie klasycznym albo No-Ad. Priority: must-have
- FR-027: Rodzic może wybrać dwa sety do 6 gemów z super tie-breakiem do 10 przy remisie 1:1, w wariancie klasycznym albo No-Ad. Priority: must-have
- FR-028: Rodzic może wybrać skrócone sety do 4 gemów z tie-breakiem przy 4:4 i super tie-breakiem do 10 przy 1:1, w wariancie klasycznym albo No-Ad. Priority: must-have
- FR-029: Prowadzący może rozgrywać tie-break do 7 i super tie-break do 10, z przewagą dwóch punktów. Priority: must-have
- FR-030: Rodzic może zachować pierwotny schemat meczu niezależnie od późniejszych zmian ustawień profilu. Priority: must-have
- FR-031: Prowadzący może potwierdzić wykryte automatycznie zakończenie meczu lub wrócić do korekty. Priority: must-have
- FR-032: Rodzic może przeglądać końcowy wynik, chronologię, notatki i oceny celów w podsumowaniu meczu. Priority: must-have
- FR-033: Rodzic może obejrzeć zbiorcze podsumowanie realizacji celów treningowych. Priority: must-have

### Cele i notatki
- FR-034: Prowadzący może zobaczyć przypomnienie aktywnych celów po każdym gemie. Priority: must-have
- FR-035: Prowadzący może po każdym gemie ocenić każdy cel jako osiągnięty, częściowo osiągnięty lub nieosiągnięty. Priority: must-have
- FR-036: Prowadzący może pominąć ocenę celu bez nadania oceny negatywnej. Priority: must-have
- FR-037: Prowadzący może dodać notatkę automatycznie skojarzoną z aktualnym gemem i czasem. Priority: must-have
- FR-038: Każdy z rodziców może po zakończeniu meczu edytować notatki i oceny celów bez zmiany punktacji. Priority: must-have

### Statusy, offline, współdzielenie
- FR-039: Prowadzący może wstrzymać i wznowić mecz bez utraty jego stanu. Priority: must-have
- FR-040: Rodzic może zobaczyć listę meczów zakończonych, trwających i wstrzymanych. Priority: must-have
- FR-041: Rodzic może mieć wiele wstrzymanych meczów jednego zawodnika i co najwyżej jeden znany jako trwający. Priority: must-have
- FR-042: Wcześniej zalogowany rodzic może rozpocząć, prowadzić, wstrzymać, wznowić i zakończyć mecz bez dostępu do internetu. Priority: must-have
- FR-043: Rodzic może nadal przeglądać i edytować lokalne zdarzenia meczu po restarcie aplikacji. Priority: must-have
- FR-044: Rodzic może zobaczyć status synchronizacji i liczbę zdarzeń oczekujących na wysłanie. Priority: must-have
- FR-045: Rodzic może korzystać z automatycznego wysłania zaległych zdarzeń po odzyskaniu sieci. Priority: must-have
- FR-046: Rodzic może zobaczyć zablokowanie wylogowania, jeśli istnieją zdarzenia niezsynch­ronizowane. Priority: must-have
- FR-047: Drugi rodzic może zobaczyć ostatni zsynchronizowany stan meczu wraz z czasem aktualizacji. Priority: must-have
- FR-048: Rodzic może rozstrzygnąć konflikt dwóch offline rozpoczętych meczów bez usuwania ich historii. Priority: must-have
- FR-049: Ten sam rodzic może przenieść prowadzenie meczu na drugi telefon po pełnym zsynchronizowaniu pierwszego. Priority: must-have
- FR-050: Prowadzący może zachować wyłączność edycji punktacji swojego meczu po synchronizacji, przeniesieniu i wznowieniu. Priority: must-have

### Poza MVP
- FR-051: Rodzic może tworzyć i edytować własne schematy punktacji z parametrów tenisowych. Priority: nice-to-have
- FR-052: Rodzic może odłączyć swoje konto od współdzielonego profilu zawodnika. Priority: nice-to-have
- FR-053: Rodzic może archiwizować lub usuwać profil zawodnika z poziomu aplikacji. Priority: nice-to-have
- FR-054: Rodzic może usuwać pojedyncze mecze z poziomu aplikacji. Priority: nice-to-have

## Non-Functional Requirements

- **Praca offline:** po wcześniejszym zalogowaniu i uzyskaniu dostępu do potrzebnego profilu możliwe jest rozpoczęcie i ukończenie całego meczu bez połączenia sieciowego.
- **Trwałość:** żaden punkt, ręczna korekta, notatka ani ocena, których zapis został potwierdzony użytkownikowi, nie znika po zamknięciu i ponownym uruchomieniu aplikacji na tym samym urządzeniu.
- **Spójność synchronizacji:** ponawiane przesłanie tego samego zdarzenia nie powoduje ponownego naliczenia punktu ani zdublowania wpisu w historii.
- **Integralność historii:** zapis ręcznego zakończenia gema lub korekty nie produkuje zdarzeń punktów, których rodzic nie obserwował.
- **Prywatność:** rodzic niepołączony z danym profilem nie może oglądać jego danych; przed udostępnieniem konieczne jest użycie jednorazowego kodu.
- **Widoczność świeżości danych:** podgląd drugiego rodzica zawiera czas ostatniej synchronizacji stanu meczu.
- **Odporność na konflikty:** w przypadku dwóch aktywnych meczów tego samego zawodnika po pracy offline oba zestawy zdarzeń pozostają zachowane do decyzji rodzica.
- **Użyteczność mobilna:** rejestrowanie pojedynczego punktu i cofnięcie ostatniej operacji powinny być dostępne z głównego ekranu meczu, bez przechodzenia przez dodatkowe widoki.
- **Dane minimalne:** profil dziecka wymaga tylko imienia lub pseudonimu; aplikacja nie wymaga nazwiska, daty urodzenia, rocznika ani klubu.
- **Parametry ilościowe:** dokładne cele wydajnościowe i obsługiwane przeglądarki/urządzenia nie zostały jeszcze uzgodnione (zob. Open Questions).

## Business Logic

Wynik meczu, kolejność serwowania i status zakończenia wynikają z wybranego przed startem schematu tenisowego oraz z chronologii zarejestrowanych punktów, ręcznych rozstrzygnięć i korekt, bez dopisywania niezaobserwowanych wymian.

Reguły obejmują klasyczne gemy na przewagi i No-Ad; sety do 6 lub 4 gemów; tie-break przy 6:6 lub 4:4; zwykły tie-break do 7 i super tie-break do 10 z przewagą dwóch punktów. Serwis w zwykłych gemach naprzemienny; w tie-breaku sekwencja 1–2–2–2…, uwzględniająca prawidłowy początek następnego seta. Rodzic jawnie wybiera pierwszego serwującego i może skorygować podpowiedź. Po ręcznej korekcie wyniku tie-breaka podpowiedź serwisu uwzględnia nową liczbę rozegranych punktów.

Zmiana schematu po rozpoczęciu meczu nie jest możliwa; zapisany schemat jest migawką zasad z momentu startu. W bieżącym gemie można ręcznie ustawić rzeczywisty stan punktów; można też przyznać gem mimo niepełnej historii. Korekty i cofnięcia są widoczne w dzienniku zdarzeń. Po osiągnięciu warunku zwycięstwa zakończenie wymaga potwierdzenia, po czym punktacja staje się tylko do odczytu. Notatki i oceny celów można nadal poprawiać.

## Access Control

| Aktor / obiekt | Profil, cele, historia | Punktacja trwającego meczu | Notatki i oceny po meczu | Zaproszenie drugiego rodzica |
|---|---|---|---|---|
| Rodzic powiązany z profilem, który rozpoczął mecz | Odczyt i edycja zgodnie z funkcją | Tak — wyłącznie jego mecz | Tak | Tak, jeśli jest wolne miejsce |
| Drugi rodzic powiązany z profilem | Odczyt i edycja zgodnie z funkcją | Nie — tylko podgląd ostatniej synchronizacji | Tak | Nie, gdy osiągnięto limit dwóch |
| Osoba niezalogowana lub niepowiązana z profilem | Brak dostępu | Brak | Brak | Może jedynie zalogować się/zarejestrować i przedstawić ważny kod |

- Konta są oddzielne; uwierzytelnienie: e-mail + hasło.
- Współdzielenie profilu: jednorazowy kod, maksymalnie dwóch rodziców na profil.
- Obie osoby mają równorzędne prawa do profilu, celów i zakończonych meczów, natomiast prowadzenie punktacji jest zarezerwowane dla inicjatora danego meczu.
- Bezpieczne przeniesienie prowadzenia między urządzeniami dotyczy **tego samego konta rodzica**, nie przekazania roli drugiemu rodzicowi.
- Wylogowanie z konta prowadzącego jest blokowane do czasu synchronizacji wszystkich lokalnych zmian.

## Non-Goals

- **Edytor własnych schematów punktacji:** odłożony po MVP, aby zmniejszyć złożoność konfiguracji i testów.
- **Usuwanie pojedynczych meczów z UI:** odłożone; historia jest zachowywana, także dla meczów rozpoczętych omyłkowo.
- **Archiwizacja i usuwanie profili zawodników z UI:** odłożone po MVP; nie zwalnia to z obsługi żądań dotyczących danych osobowych poza tą funkcją.
- **Odłączanie rodziców:** odłożone po MVP.
- **Edycja dowolnego, dawno zakończonego gema:** poza MVP; korekty ograniczono do bieżącego i ostatnio zakończonego gema.
- **Graficzne odtwarzanie meczu jako animacja / przewijany replay:** poza MVP; dostępna jest chronologiczna lista zdarzeń.
- **Zaawansowane statystyki meczowe i rozbudowane analizy skuteczności:** poza MVP; dostępne podsumowanie celów i pełna historia.
- **Przekazanie prawa punktowania drugiemu rodzicowi podczas meczu:** poza MVP.
- **Awaryjne przejęcie prowadzenia z niesynchronizowanego, niedostępnego urządzenia:** poza MVP.
- **Zakończenie meczu jako krecz, dyskwalifikacja, odwołany/anulowany lub bez wyniku:** nieuzgodnione jako funkcja MVP; obecny przepływ obejmuje zakończenie po osiągnięciu wyniku i potwierdzeniu.
- **Wysyłanie zaproszeń e-mail, powiadomienia push, AI-coach w produkcie:** nieobjęte uzgodnionym MVP.

## Open Questions

1. **Szczegółowa reguła krótkiego seta:** czy w wariancie do 4 gemów przy 3:3 wymagane jest osiągnięcie 5:3 lub 4:4 i tie-break, zgodnie z wybraną konwencją? Użytkownik ustalił tie-break przy 4:4, ale nie wyraził osobno reguły wcześniejszego zakończenia przy 4:3. **Owner:** użytkownik (decyzja produktowa). **Rozstrzygnąć:** przed zamrożeniem PRD silnika punktacji.
2. **Wybór strony odbioru przy No-Ad:** czy w MVP ma być rejestrowana, czy pozostaje poza funkcjonalnością? **Owner:** użytkownik. **Rozstrzygnąć:** przed PRD.
3. **Cofanie po manualnej korekcie i ocenie celu:** dokładny zakres „ostatniej operacji” (czy tylko operacje wyniku, czy też notatki i oceny) nie został rozstrzygnięty. **Owner:** użytkownik. **Rozstrzygnąć:** przed PRD/implementacją.
4. **Korekty ostatnio zakończonego gema:** dokładne skutki korekty zmieniającej zwycięzcę gema, a więc wyniki dalszych setów, wymagają reguły użytkownika lub ograniczenia. **Owner:** użytkownik. **Rozstrzygnąć:** przed PRD/implementacją.
5. **Uprawnienia w trakcie meczu do notatek i ocen:** ustalono, że drugi rodzic jest read-only względem punktacji, ale zakres dopisywania przez niego obserwacji *w trakcie* meczu nie został wprost ustalony. **Owner:** użytkownik. **Rozstrzygnąć:** przed PRD.
6. **Żądania usunięcia danych osobowych:** sposób zgłoszenia i realizacji usunięcia konta/profilu poza UI nie został opisany. **Owner:** użytkownik. **Rozstrzygnąć:** przed udostępnieniem aplikacji rzeczywistym użytkownikom.
7. **Docelowa skala i miary wydajności:** nie uzgodniono liczby kont, obciążenia, minimalnej wersji przeglądarek ani celów opóźnienia operacji. **Owner:** użytkownik. **Rozstrzygnąć:** na etapie PRD i dalszej decyzji technicznej.
8. **Obsługa celu lub notatki, gdy gem właśnie został zakończony:** dokładny kontekst nowej notatki dodawanej między gemami nie został formalnie określony. **Owner:** użytkownik. **Rozstrzygnąć:** przed domknięciem UX.
9. **Akceptacja ryzyka czasu:** zakres nadal obejmuje dwa konta, offline/synchronizację, sześć schematów i korekty przy dostępności 5–8 godzin tygodniowo do 6 grudnia 2026 r.; nie ustalono planu redukcji zakresu w razie opóźnienia. **Owner:** użytkownik. **Rozstrzygnąć:** na etapie planowania realizacji.

## Timeline acknowledgment

Użytkownik podał dostępność około 5–8 godzin tygodniowo i cel ukończenia MVP do **6 grudnia 2026 r.** Został uprzedzony, że zakres obejmujący pełny offline, synchronizację dwojga rodziców, korekty i wiele formatów tenisowych jest ambitny. Wybrał świadomie pozostawienie tych funkcji w MVP, odkładając tylko edytor własnych schematów; nie ustalono jednak dodatkowej rezerwy ani warunkowej kolejności redukcji zakresu.

## Quality cross-check

**Status: oczekuje na decyzję użytkownika (faza 7).**

| Wymagany element | Ocena | Uwagi |
|---|---|---|
| Access Control | present | Role, połączenie kont, ograniczenie prowadzenia punktacji |
| Business Logic | present | Jednozdaniowa główna reguła oraz szczegóły punktacji i korekt |
| Project artifacts | present | Niniejszy dokument wraz z checkpointem |
| Timeline-cost acknowledged | present | Jawny czas i koszty zakresu; dalsze ryzyko wymienione w Open Questions |
| Non-Goals | present | Odłożone funkcje zostały jawnie wymienione |
| Preserved behavior | n/a | Greenfield |

**Dodatkowa ocena ryzyk (nie blokuje cross-checku):** przed utworzeniem PRD warto doprecyzować co najmniej regułę krótkiego seta, zakres cofania i granice edycji drugiego rodzica w trakcie meczu. Te otwarte pytania nie zostały po cichu rozstrzygnięte.

## Forward: technical-roadmap

- Wybrany główny obowiązkowy **test E2E z perspektywy użytkownika: pełny przebieg meczu z korektą i historią**. To decyzja o zakresie walidacji produktu; wybór frameworków testowych i konfiguracja CI/CD zostają na późniejszy etap.
- Offline i synchronizacja wymagają odrębnej weryfikacji trwałości, idempotencji i konfliktów, nawet jeżeli nie stanowią pierwszego testu E2E.
- Rekomendowana kolejność przyrostów do późniejszego planowania: rdzeń wyniku i korekty; historia; cele/notatki; formaty; offline; współdzielenie; stabilizacja. Jest to **propozycja planowania**, nie dodatkowe zatwierdzone wymaganie użytkownika.
- Rozmowa była prowadzona na poziomie wymagań; nie ustalano technologii, dostawcy usług ani architektury.

## Następny krok

Po zatwierdzeniu kontroli jakości zmienić we frontmatter `checkpoint.current_phase` na `8`, `phases_completed` na `[1, 2, 3, 4, 5, 6, 7]` oraz `quality_check_status` na `accepted` (lub `warned`, jeśli użytkownik akceptuje braki). Następnie w repozytorium projektu uruchomić `/10x-prd` na podstawie `context/foundation/shape-notes.md`.
