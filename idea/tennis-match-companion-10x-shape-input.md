# Tennis Match Companion — wsad do `/10x-shape`

> **Status:** materiał wejściowy do sesji planistycznej, **niezatwierdzony PRD**.  
> **Cel:** 10xDevs 4.0 — 10xBuilder.  
> **Planowany termin pierwszego zgłoszenia:** 6 grudnia 2026 r., do 23:59 (strefę czasową terminu należy potwierdzić u organizatorów).  
> **Dostępny czas:** 5–8 godzin tygodniowo; od 16 października do 6 grudnia około 7 tygodni, orientacyjnie 35–58 godzin.  
> **Kontekst wykonawcy:** doświadczony programista, niewielkie doświadczenie w tworzeniu kompletnych aplikacji z agentami AI (jedna aplikacja z wcześniejszego kursu).

## 1. Opis pomysłu do wklejenia do `/10x-shape`

Chcę zbudować prostą w obsłudze na telefonie aplikację wspierającą rodziców dzieci startujących w turniejach tenisowych. Dzieci często samodzielnie sędziują swoje mecze i mogą poprosić rodzica o potwierdzenie aktualnego wyniku. Rodzic powinien móc szybko, jednym dotknięciem, zapisać wygrany punkt albo gem, odtworzyć przebieg punktacji, naprawić pomyłkę oraz zobaczyć podpowiedź, kto serwuje. Aplikacja musi obsługiwać zapis punkt po punkcie, gem po gemie oraz sytuację, w której rodzic rejestruje punkty, ale przegapił ich część i ręcznie wpisuje wynik gema. Wynik powinien być liczony według wybranego formatu rozgrywki, docelowo także własnych schematów użytkownika.

Drugą podstawową wartością jest wspieranie celów treningowych: przed meczem rodzic wybiera maksymalnie trzy aktywne cele dla dziecka, w czasie meczu otrzymuje dyskretne przypomnienia, zaznacza obserwacje i dopisuje notatki, a po spotkaniu przegląda podsumowanie. Po rejestracji główny rodzic może zaprosić drugiego rodzica do współdzielenia zawodników i meczów. Aplikacja musi zachować użyteczność przy słabym lub niedostępnym internecie — do doprecyzowania, czy pełne działanie offline jest bezwzględnie wymagane na pierwszy termin.

Chcę wykonać certyfikacyjne MVP 10xBuilder przy użyciu skilli i agentów AI z kursu, a nie rozbudowany system turniejowy. Priorytetem są czytelny mobilny UX, poprawna historia zmian wyniku, korekty punktacji i sensowna logika serwisu, także tie-breaków. Potrzebuję podczas `/10x-shape` ustalić granice MVP, reguły domenowe, przypadki brzegowe, kryteria akceptacji i plan ograniczenia ryzyka w terminie do 6 grudnia.

## 2. Problem i użytkownicy

**Główny użytkownik:** rodzic obserwujący mecz dziecka z trybun lub przy korcie. Nie jest oficjalnym sędzią; wspiera obserwację i może pomóc ustalić sporny wynik.  
**Drugi użytkownik:** drugi rodzic współdzielący dane zawodnika i historię.  
**Sytuacja użycia:** mecz na żywo, ograniczony czas na interakcję z telefonem, czasami słaby internet; rodzic nie chce tracić uwagi z przebiegu gry.

**Rezultat dla użytkownika:** wiarygodna, możliwa do skorygowania historia meczu oraz zapis realizacji 2–3 celów treningowych — bez konieczności ręcznego liczenia i pamiętania wszystkich zdarzeń.

## 3. Zasady produktu i UX

- **Mobile first:** ekran meczu na smartfonie, duże pola dotykowe dla „punkt zawodnika” i „punkt przeciwnika”, wyraźny wynik i serwujący.
- **Minimalna liczba kliknięć:** zwykły punkt jednym dotknięciem; szybkie „cofnij”.
- **Omyłki są normalne:** korekta musi być łatwa i bezpieczna; przypadkowe podwójne dotknięcie nie może niepostrzeżenie zniszczyć historii.
- **Jawność niepełnych danych:** odróżniać punktację rzeczywiście zapisaną od wyniku gema wpisanego ręcznie. Nie fabrykować brakujących punktów.
- **Jeden główny widok meczu:** punktacja, serwujący, cele i szybka notatka dostępne bez wielu przejść między ekranami.
- **Czytelny stan synchronizacji:** lokalnie zapisane / oczekuje na synchronizację / zsynchronizowane / błąd.
- **Prywatność dziecka:** konta rodziców i dostęp tylko do ich zawodników/meczów; minimum danych identyfikacyjnych.

## 4. Wymagania użytkownika (potwierdzone w rozmowie)

Identyfikatory `UR` oznaczają potrzeby zgłoszone przez użytkownika, nie przesądzają kolejności implementacji.

| ID | Wymaganie |
|---|---|
| UR-01 | Rodzic ma własne konto i po rejestracji może dodać/zaprosić drugiego rodzica. |
| UR-02 | Rodzic może utworzyć profil zawodnika/dziecka. |
| UR-03 | W profilu zawodnika można określić domyślny tryb rejestracji: poszczególne punkty w gemie albo tylko zakończone gemy. |
| UR-04 | W trybie punktowym rodzic może ręcznie wskazać wynik w gemach / przyznać zakończony gem mimo niekompletnej rejestracji punktów. |
| UR-05 | Rodzic może zapisywać przebieg spotkania w punktach oraz obserwować bieżący wynik. |
| UR-06 | Można łatwo naprawić źle kliknięty wynik i odtworzyć historię zmian punktacji. |
| UR-07 | System zapamiętuje, kto serwował, oraz sugeruje kolejnego serwującego z uwzględnieniem tie-breaków. |
| UR-08 | Format punktowania może zależeć od turnieju; docelowo użytkownik definiuje i zapisuje własne schematy. |
| UR-09 | W trakcie meczu rodzic dodaje notatki/uwagi. |
| UR-10 | Rodzic może zdefiniować elementy do obserwacji, ustalić na mecz maksymalnie 2–3 aktywne cele i odnotować ich realizację. |
| UR-11 | Aplikacja przypomina rodzicowi podczas meczu o obserwowaniu aktywnych celów. |
| UR-12 | Interfejs jest prosty i wygodny w użyciu podczas oglądania gry. |
| UR-13 | Aplikacja działa użytecznie przy słabym internecie; szczegółowy wymóg działania całkowicie offline wymaga potwierdzenia. |

## 5. Proponowane przypadki użycia

### UC-01: Przygotowanie meczu
1. Rodzic loguje się, wybiera dziecko i rozpoczyna nowy mecz.
2. Podaje przeciwnika (opcjonalnie nazwę turnieju i datę), format punktacji oraz pierwszego serwującego.
3. Wybiera maksymalnie 3 aktywne cele (własne, zapisane wcześniej).
4. Widzi czytelny ekran punktacji i może rozpocząć rejestrację.

### UC-02: Punkt po punkcie
1. Rodzic klika zawodnika, który wygrał wymianę.
2. System utrwala zdarzenie, przelicza wynik punktowy/gemowy/setowy i wskazuje serwującego.
3. Po zakończeniu gema system wyświetla nowy stan oraz nieinwazyjne przypomnienie o celach.

### UC-03: Pominięte punkty albo cały gem
1. Rodzic przegapił fragment meczu; dotychczasowe punkty zapisane w gemie są niekompletne.
2. Wybiera akcję ręcznego zakończenia gema i jego zwycięzcę, ewentualnie wpisuje poprawny stan gemów.
3. System zapisuje **ręczne rozstrzygnięcie** jako osobne zdarzenie, bez dopisywania fikcyjnych wymian.
4. Oblicza wynik i podpowiedź serwującego od nowego, zatwierdzonego stanu; pokazuje, że szczegółowa punktacja gema jest niepełna.

### UC-04: Korekta błędu
1. Rodzic dostrzega błędnie przyznany punkt albo gem.
2. Używa szybkiego cofnięcia ostatniej akcji lub otwiera historię, aby skorygować wcześniejsze zdarzenie.
3. Wynik, kolejność serwujących i historia zostają spójne, a korekta pozostaje identyfikowalna.

### UC-05: Obserwowanie celów
1. Przed meczem rodzic wybiera od 0 do 3 celów, np. „split step przed returnem”, „powrót do pozycji”, „atak krótkiej piłki”.
2. Cele pozostają widoczne na ekranie meczu; po określonym zdarzeniu (propozycja: koniec gema) pojawia się dyskretne przypomnienie.
3. Rodzic zaznacza obserwację celu (np. wykonane / niewykonane / nieobserwowane) i opcjonalnie dodaje notatkę.
4. Po meczu przegląda obserwacje i uwagi bez automatycznego oceniania dziecka na podstawie brakujących danych.

### UC-06: Drugi rodzic
1. Rodzic zaprasza drugiego rodzica, np. adresem e-mail.
2. Zaproszony rodzic zakłada konto lub loguje się i akceptuje zaproszenie.
3. Oboje mają uprawniony dostęp do przypisanych dzieci, meczów i obserwacji.
4. **Propozycja ograniczenia MVP:** tylko jedna aktywna osoba edytuje punktację tego samego meczu; druga widzi stan po synchronizacji. Wymaga decyzji podczas planowania.

### UC-07: Słaba łączność
1. Rodzic traci połączenie w trakcie meczu.
2. Rejestrowanie punktów, korekt i notatek jest nadal możliwe, jeżeli przyjęty zostanie pełny tryb offline.
3. System utrwala operacje lokalnie i wyraźnie pokazuje oczekujące zmiany.
4. Po odzyskaniu internetu dane synchronizują się bez duplikowania punktów; konflikty są obsłużone zdefiniowaną regułą.

## 6. Szczegółowe zagadnienia domenowe do sprecyzowania podczas `/10x-shape`

### 6.1. Schemat punktacji

Docelowo trzeba obsłużyć różne formaty spotkań, w tym potencjalnie:
- standardowe gemy z przewagami lub bez przewag (no-ad),
- różną liczbę gemów do seta i warunek przewagi gemowej,
- zwykły tie-break, tie-break decydujący i match tie-break,
- różną liczbę setów, ewentualne skrócone sety.

**Nie są to jeszcze zatwierdzone formaty MVP.** Na start rekomendowany jest jeden konkretnie opisany standardowy schemat z tie-breakiem, z drugim schematem tylko wtedy, gdy testy i czas na to pozwolą. Edytor dowolnych reguł użytkownika jest znaczącym rozszerzeniem — architektura powinna go umożliwiać, ale samo UI edytora można odłożyć.

### 6.2. Historia wyniku i korekty

**Propozycja projektowa:** zapis dziennika zdarzeń meczu zamiast wyłącznie nadpisywanego wyniku. Przykładowe typy: `POINT_AWARDED`, `GAME_AWARDED_MANUALLY`, `SERVER_CORRECTED`, `SCORE_CORRECTED`, `POINT_REVERTED`, `NOTE_ADDED`. Bieżący wynik jest wyprowadzany z uporządkowanej historii; korekty nie muszą usuwać śladów wcześniejszych działań.

Do decyzji: czy dopuszczamy tylko „cofnij ostatnią operację”, czy także zmianę dowolnego starszego punktu (znacznie trudniejsza, bo wpływa na późniejsze gemy i serwis). Korekta wcześniejszego gema może wymagać ponownego przeliczenia następujących zdarzeń lub jawnego ograniczenia sposobu korekty.

### 6.3. Serwis

Zasady muszą uwzględniać: wskazanie pierwszego serwującego, zmianę serwisu między gemami, sekwencję 1–2–2–2… w standardowym tie-breaku, a po tie-breaku rozpoczęcie kolejnego seta przez właściwego zawodnika. Przy ręcznie rozstrzygniętym gemie liczba wymian nie jest znana — podpowiedź serwisu na kolejne gemy nadal powinna być możliwa; podczas niedokładnie odtworzonego tie-breaka system powinien jasno komunikować brak pewności, zamiast zgadywać.

### 6.4. Cele i przypomnienia

Proponowany model: **biblioteka celów** użytkownika, wybranie maksimum 3 na dany mecz, zapis poszczególnych obserwacji i notatek. Przypomnienia widoczne w aplikacji (np. koniec gema) są prostsze od powiadomień push i nie wymagają uprawnień systemowych. Do ustalenia: cykliczność przypomnień, możliwość wyciszenia i forma oznaczenia realizacji celu.

### 6.5. Offline i współdzielenie

Dwa wymagania w napięciu: rejestrowanie meczu bez internetu oraz współdzielenie na dwóch urządzeniach. W pierwszej wersji warto przewidzieć **jednego prowadzącego mecz** i lokalną kolejkę zmian synchronizowaną z backendem, ale szczegóły wymagają osobnego rozstrzygnięcia. Potrzebne są reguły na wypadek ponownego wysłania tej samej operacji i dwóch równoległych edycji.

## 7. Sugerowany podział zakresu (do zatwierdzenia, nie automatyczne wymagania)

| Priorytet | Funkcje | Uwagi |
|---|---|---|
| P0 — rdzeń certyfikacyjny | Logowanie, prywatność danych; profil zawodnika; mecz; pojedyncze punkty/gemy; podstawowa historia; szybkie cofnięcie; wynik i serwujący; do 3 celów; notatki; przypomnienie na ekranie | Nie obcinać logiki domenowej tylko po to, aby powstał pusty CRUD. |
| P1 — istotne wymagania produktowe | Pełna odporność offline z synchronizacją; zapraszanie drugiego rodzica; korekty starszych zdarzeń; tryb mieszany z niepełnymi gemami | Kolejność i ograniczenia rozstrzygnąć według ryzyka. Tryb mieszany jest szczególnie ważny dla użyteczności. |
| P2 — po pierwszym zgłoszeniu, jeśli nie zmieści się | Graficzny kreator dowolnych schematów; synchroniczna edycja przez oboje rodziców; push; zaawansowane statystyki i AI w aplikacji | Docelowy kierunek, nie obietnica certyfikacyjna. |

**Ważne:** użytkownik zgłosił potrzebę dwóch rodziców, trybu mieszanego, serwisu i słabego internetu jako część wizji produktu. Priorytety P0/P1/P2 powyżej to **propozycja ograniczenia terminu**, nie rezygnacja z wymagań. Sesja `/10x-shape` powinna uzyskać decyzję, które kompromisy są dopuszczalne.

## 8. Minimalne kryteria akceptacji do rozwinięcia w PRD

- **AC-01 Dostęp:** rodzic A nie widzi meczów niepowiązanego rodzica B; drugi rodzic otrzymuje dostęp dopiero po zaakceptowaniu zaproszenia.
- **AC-02 Punktacja:** każdy zapisany punkt prowadzi do deterministycznego, odtwarzalnego wyniku; poprawnie rozstrzygane są m.in. równowaga, przewagi i zakończenie gema według wybranego formatu.
- **AC-03 Korekta:** po błędnym kliknięciu możliwe jest cofnięcie; wynik wraca do stanu sprzed operacji i historia pokazuje, że nastąpiła korekta.
- **AC-04 Niepełna historia:** jeśli zapisano 2 punkty, a rodzic ręcznie przyznał gem, następny gem rozpoczyna się od poprawnego wyniku, bez dopisywania niezarejestrowanych punktów.
- **AC-05 Serwis:** znany pierwszy serwujący wystarcza do wyznaczenia serwującego kolejne zwykłe gemy; podczas kompletnego tie-breaka system wskazuje poprawną kolejność serwisu.
- **AC-06 Cele:** nie można przypisać więcej niż 3 aktywnych celów do meczu; dostępne jest przypomnienie i zapis obserwacji.
- **AC-07 Dane:** nowo rozpoczęty oraz zakończony mecz jest dostępny w historii, wraz z chronologią wyniku i uwagami.
- **AC-08 Offline (jeśli zatwierdzone na MVP):** po utracie sieci zapis kilku kolejnych punktów i cofnięcia pozostaje możliwy; po ponownym połączeniu wynik nie zmienia się i operacje nie są dublowane.
- **AC-09 Rodzina (jeśli zatwierdzone na MVP):** zaakceptowane zaproszenie daje drugiemu rodzicowi prawidłowy dostęp, ale nie osobom postronnym.
- **AC-10 UX:** podstawowe przyznanie punktu i cofnięcie możliwe bez opuszczania ekranu meczu.

## 9. Dopasowanie do 10xBuilder

Według dostarczonych zasad certyfikacji projekt wymaga:

1. **Kontroli dostępu** — logowanie i autoryzacja dostępu do profili zawodników, meczów i ewentualnie danych współdzielonych.
2. **Sensownego CRUD** — np. zawodnicy, mecze, cele, notatki (operacje historii punktacji mogą mieć odrębne reguły nieusuwalności).
3. **Logiki biznesowej** — silnik wyniku, formaty meczów, wyznaczanie serwującego, korekty.
4. **Dokumentacji kontekstowej** — opis produktu i reguł, architektura/infrastruktura, plan realizacji; nazwy plików są przykładowe.
5. **Co najmniej jednego testu z perspektywy użytkownika** — proponowany priorytet: pełny scenariusz rozpoczęcia meczu, błędnego punktu, cofnięcia, zakończenia gema i poprawnego serwującego; osobne testy jednostkowe logiki punktacji będą bardzo pomocne.

Udostępnienie pod publicznym URL jest korzystne, lecz dla projektu customowego nie stanowi generalnego warunku 10xBuilder. AI ma wspierać **proces tworzenia** — nie trzeba budować w produkcie coacha AI. Szczegółowe wymagania Architect/Champion są osobne. Powyższe zestawienie służy planowaniu, nie stanowi gwarancji zaliczenia.

**Źródła lokalne:** `10xdevs-4-certification.md`, `10xdevs-4-dates.md`, `certyfikacja_10xBuilder_zasady_i_terminy.md`, `SKILL.md` (`10x-idea-check`).

## 10. Proponowany plan pracy ze skillami

1. **`/10x-shape`** — odkrycie przypadków użycia, reguł punktacji i korekt, ostateczna granica MVP, decyzje o offline i współdzieleniu.
2. **`/10x-prd`** — PRD po zatwierdzeniu zakresu; user stories, kryteria akceptacji, założenia i wyłączenia.
3. **Dalszy workflow kursu** — architektura, implementacja małych przyrostów, testy, dokumentacja i wdrożenie zgodnie z faktycznie dostępnymi skillami w środowisku użytkownika (nazw nieznanych skilli nie zakładamy).

**Pierwszy działający przyrost:** jedna osoba tworzy mecz, ustawia serwującego, klika punkt, widzi wynik, cofa punkt. Dopiero potem kolejne formaty, cele, notatki, współdzielenie i pełne offline.

## 11. Otwarte pytania decyzyjne na sesję `/10x-shape`

1. **Offline:** czy aplikacja ma działać całkowicie bez internetu podczas aktywnego meczu, czy wystarczy tolerowanie chwilowych przerw połączenia?
2. **Format na start:** jaki konkretny format rozgrywek jest niezbędny w MVP (standard, no-ad, tie-break, match tie-break, liczba setów)?
3. **Korekta:** czy wystarczy cofanie ostatniej akcji i ręczne ustalenie poprawnego gema, czy konieczna jest edycja dowolnego wcześniejszego punktu?
4. **Tryb mieszany:** czy ręcznie podajemy jedynie zwycięzcę gema, czy także skorygowany licznik gemów/setów?
5. **Rola drugiego rodzica:** sam podgląd, notatki, przejmowanie prowadzenia meczu, czy pełna jednoczesna edycja?
6. **Cel:** co znaczy „wykonany” — pojedyncza obserwacja, wielokrotne zdarzenia, ocena po meczu czy tylko oznaczenie „zwróciłem uwagę”?
7. **Przypomnienie:** po każdym gemie, co kilka gemów, co określony czas czy według preferencji rodzica?
8. **Stan meczu:** czy musi być możliwe wznowienie meczu po zamknięciu przeglądarki, restarcie telefonu i późniejszym otwarciu aplikacji?
9. **Profil przeciwnika i RODO:** jakie dane przechowujemy o dziecku i przeciwniku; czy wystarczą nazwy wyświetlane bez danych wrażliwych?
10. **Priorytety na 6 grudnia:** które z ryzykownych funkcji (zaproszenia, pełny offline, korekta historyczna, kreator zasad) użytkownik akceptuje jako późniejszy etap, jeśli integracja i testy wykażą zbyt wysoki koszt?

## 12. Kluczowe ryzyka

- **Niedoszacowany silnik punktacji:** szczególnie tie-break, ręczne nadpisanie gema, korekty historyczne i zależny od nich serwis.
- **Synchronizacja offline:** łatwo niechcący powielić kliknięcia lub dopuścić konflikt dwóch edytorów.
- **Zbyt dużo funkcji na czas certyfikacji:** 5–8 godzin w tygodniu wymusza małe przyrosty i rezerwę na testowanie oraz wdrożenie.
- **UX na żywo:** nawet poprawny technicznie formularz może być nieużyteczny, jeśli odrywa uwagę rodzica od obserwacji gry.

**Decyzja do podjęcia po `/10x-shape`:** zaakceptowany zakres MVP, definicja pierwszego ukończonego przepływu i jawny katalog funkcji odłożonych — zanim zostanie wygenerowany ostateczny PRD.
