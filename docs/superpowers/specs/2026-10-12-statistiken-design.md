# Statistiken für Kinder und Eltern – Design

Stand: 2026-10-12 · Status: Entwurf zur Freigabe

## Ziel

Kinder sehen ihre eigene, motivierende Statistik. Eltern sehen pro Kind eine ausführlichere Statistik. Beide Ansichten rechnen mit denselben Regeln, damit dieselben Zahlen erscheinen.

## Festgelegte Anforderungen

- Ein Tag zählt für die Serie, wenn an ihm **mindestens eine Runde abgeschlossen** wurde (bis zur Ergebnisseite). **Jede** abgeschlossene Runde zählt, unabhängig von der Länge. Abbruch über „← Zurück“ zählt nicht.
- **Kinder** sehen: Serie, Lernkalender, Lernstand, Auffrischen.
- **Eltern** sehen zusätzlich: Verlauf der Trefferquote und schwierige Wörter.
- Die Kinder-Statistik liegt auf der **Kontoseite** (👤) unter „Hallo …!“. Der 🔥-Zähler im Kopfbereich bleibt unverändert.
- Statistiken gibt es nur für angemeldete Kinder. Gäste und Eltern erzeugen keine Runden.

## Nicht Teil dieses Vorhabens

- Verlauf einzelner Wörter (würde eine Tabelle pro Antwort erfordern, kann später ergänzt werden)
- Quote getrennt nach Richtung (Daten vorhanden, später leicht ergänzbar)
- Einstellbares Tagesziel, Abstufungen im Kalender, Vergleich zwischen Geschwistern

## 1. Datenmodell: Migration `sql/migrations/0004_rounds.sql`

Neue Tabelle `public.rounds`, eine Zeile pro abgeschlossener Runde:

| Spalte | Typ | Bedeutung |
|---|---|---|
| `id` | `uuid primary key` | im Browser erzeugt (`crypto.randomUUID()`), macht Hochladen idempotent |
| `child_id` | `uuid not null references public.children(id) on delete cascade` | |
| `played_on` | `date not null` | Datum nach Gerätezeit |
| `finished_at` | `timestamptz not null` | Zeitpunkt des Rundenendes |
| `mode` | `text not null check (mode in ('quiz','flashcard'))` | |
| `direction` | `text not null check (direction in ('de-en','en-de'))` | |
| `week` | `int` (nullable) | `null` = Wiederholung über alle Wochen |
| `is_retry` | `boolean not null default false` | Runde „Nur die falschen wiederholen“ |
| `word_count` | `int not null check (word_count > 0)` | |
| `correct` | `int not null check (correct >= 0)` | |
| `wrong` | `int not null check (wrong >= 0)` | |

Zusätzlich `check (correct + wrong = word_count)` und Index auf `(child_id, played_on)`.

Rechte:

- `enable row level security`
- `revoke all on public.rounds from anon, authenticated`, dann `grant select, insert on public.rounds to authenticated`
- Policy `rounds_select` (select, authenticated): `public.is_child_session(child_id) or public.is_child_parent(child_id)`
- Policy `rounds_insert` (insert, authenticated): `with check (public.is_child_session(child_id))`
- Kein Update, kein Delete (weder Recht noch Policy)

Das Datum stammt vom Gerät und ist fälschbar. Akzeptiert: Ein Kind kann höchstens seine eigene Serie schönen.

Die Migration bekommt `0004`; das Aufräumen anonymer Benutzer aus Issue #7 wird `0005`.

## 2. Speichern und Abgleich

**Auslöser:** `App.showResults()` in `js/app.js` ruft `DataService.recordRound({ mode, direction, week, isRetry, wordCount, correct, wrong })` auf.

- `week`: `currentWeek` in der Wochenübung, `null` in Wiederholung und Auffrischen
- `isRetry`: die bestehende Bedingung `currentWords.length < fullSetSize` aus `showResults`
- `wordCount`, `correct`, `wrong`: aus `sessionResults`

**`DataService.recordRound(round)`:**

1. Ohne angemeldetes Kind (`AuthService.getChild()` leer): nichts tun.
2. Zeile bilden mit `id = crypto.randomUUID()`, `child_id`, `played_on = Logic.localDate(now)`, `finished_at = now.toISOString()`.
3. Zeile an die lokale Warteschlange `localStorage['vokabel_rounds_pending']` (JSON-Array) anhängen.
4. Warteschlange hochladen (`flushPendingRounds`).

**`flushPendingRounds(childId)`:** Lädt alle wartenden Zeilen des Kindes per `upsert(rows, { onConflict: 'id', ignoreDuplicates: true })` hoch und entfernt sie bei Erfolg aus der Warteschlange. Bei Fehler bleiben sie liegen, Warnung per `console.warn` wie beim bestehenden Fortschritts-Sync.

**Weitere Auslöser:** `syncChildProgress` ruft zusätzlich `flushPendingRounds` auf (App-Start, Anmeldung, letzter Abgleich vor dem Abmelden).

**Besitzer-Regel:** Die Warteschlange gehört demselben Kind wie der lokale Fortschritt. Sie wird verworfen, wenn `syncChildProgress` einen anderen oder keinen Besitzer vorfindet, und von `clearLocalProgress` gelöscht.

**Datumskorrektur:** `Logic.localDate(date)` liefert `YYYY-MM-DD` in lokaler Zeit. `saveWordResult` nutzt es künftig für `lastPracticed` statt `toISOString()` (bisher UTC-Datum).

## 3. Kennzahlen: reine Funktionen in `js/logic.js`

Alle Funktionen sind ohne DOM und ohne Speicherzugriff. „Heute“ wird als Parameter `today` (`YYYY-MM-DD`) übergeben.

Konstanten: `SECURE_MIN_CORRECT = 3`, `SECURE_MIN_RATE = 0.7`, `REFRESH_AFTER_DAYS = 14`, `REFRESH_MAX_WORDS = 10`, `CALENDAR_WEEKS = 8`, `TREND_WEEKS = 8`, `DIFFICULT_MIN_ATTEMPTS = 2`, `DIFFICULT_MAX_WORDS = 10`.

- **`wordLevel(stats)`** → `'new' | 'shaky' | 'secure'`
  - `new`: keine Versuche
  - `secure`: `correct >= 3` und `correct / (correct + wrong) >= 0.7`
  - `shaky`: sonst
- **`levelCounts(words, getStats)`** → `{ new, shaky, secure }` für eine Wortliste
- **`wordsToRefresh(words, getStats, today)`** → geübte Wörter (`shaky` oder `secure`) mit `lastPracticed` mindestens 14 Tage vor `today`, älteste zuerst
- **`streaks(dates, today)`** → `{ current, longest, playedToday }`
  - `dates`: Datumswerte der Runden (Duplikate erlaubt)
  - `current`: Tage am Stück, endend heute; wenn heute nicht gespielt, endend gestern; sonst 0
- **`calendarDays(dates, today)`** → Liste der Tage der letzten 8 Kalenderwochen (je Montag bis Sonntag; die letzte Woche ist die, die `today` enthält; Tage nach `today` sind als Zukunft markiert), je `{ date, played, future }`
- **`weeklyAccuracy(rounds, today)`** → 8 Einträge für dieselben Kalenderwochen wie der Kalender, je `{ weekStart, rate | null }` mit `weekStart` als Montag und `rate = Summe correct / Summe word_count`; Runden mit `is_retry` werden ignoriert, Wochen ohne Runden haben `rate: null`
- **`difficultWords(rows)`** → Zeilen mit mindestens 2 Versuchen und mindestens einem Fehler, sortiert nach Fehlerquote absteigend, bei Gleichstand nach Anzahl Fehler, höchstens 10

## 4. Ansichten

**Neue Datei `js/stats.js` (`Stats`)** baut die Karten mit `Dom.h()`. Ladereihenfolge: nach `js/logic.js`, vor `js/family.js`. Eintrag in `ASSETS` in `sw.js`, Ladereihenfolge in AGENTS.md ergänzen.

Bausteine (jeweils ein Element zurück): `streakCard`, `calendarCard`, `levelCard` (gesamt plus pro Woche), `refreshCard` (mit Knöpfen Quiz/Karteikarten), `trendCard`, `difficultCard`.

**Kinderansicht** (`Family.renderChild`, unter „Hallo …!“): Serie, Lernkalender, Lernstand, Auffrischen.

- Lernstand und Auffrischen aus dem lokalen Fortschritt (`DataService.getProgress`) und den Vokabeln (`DataService.getAllWords`)
- Runden aus der Cloud (`DataService.getChildRounds(childId)`) plus wartende Runden aus der Warteschlange
- Schlägt das Laden der Runden fehl: Serie und Kalender aus den wartenden Runden, mit Hinweis „Ohne Internet ist der Kalender vielleicht unvollständig.“

**Elternansicht** (`Family.openProgress`): bestehende Übersicht, dann Serie, Lernkalender, Lernstand pro Woche (ersetzt die heutigen Abdeckungsbalken), Verlauf, schwierige Wörter. Lernstand und schwierige Wörter aus dem Cloud-Fortschritt (`FamilyService.getChildProgress`, wie bisher), Runden über `FamilyService.getChildRounds(childId)`.

**Darstellung:**

- Kalender: Raster 7 Spalten × 8 Zeilen, Kästchen mit `aria-label` wie „Mo, 12.10.: geübt“ bzw. „nicht geübt“
- Lernstand: gestapelter Balken aus drei Segmenten (sicher/wackelig/neu) mit Legende und Zahlen als Text
- Verlauf: 8 senkrechte CSS-Balken mit Prozentwert als Text, leere Wochen als „–“
- Farben über CSS-Variablen in `css/style.css`, keine Bibliothek

**Auffrischen-Runde:** neue Funktion `App.startWordSet(words, mode)`. Sie setzt `recapOptions = { count: words.length, words }`. `launchRecap` nutzt `recapOptions.words`, wenn vorhanden, sonst wie bisher `buildRecapSelection`. Damit wiederholt „Alle Wörter wiederholen“ auf der Ergebnisseite genau diese Wörter.

## 5. Prüfen

- **Logik:** Wegwerf-Skript im Scratchpad (nicht im Repo), lädt `js/logic.js` in Node und prüft: Serie über Monats- und Jahresgrenze, „heute noch nicht gespielt“, Lücken, längste Serie; Kalender-Ausrichtung auf Montag und Zukunftstage; Grenzwerte beim Lernstand (2/3 richtig, 69 %/70 %); Auffrischen genau 13/14 Tage; Verlauf ignoriert `is_retry` und leere Wochen; `localDate` kurz nach Mitternacht.
- **Datenbank:** Migration wird auf das Live-Projekt angewendet, erst nach ausdrücklicher Zustimmung zum gezeigten SQL. Danach Supabase-Advisors prüfen.
- **Browser (Playwright, Testkonto „Testfamilie (Claude)“):**
  - Runde abschließen → Zeile in `rounds`
  - Gleiche `id` erneut hochladen → ignoriert, keine Doppelung, und kein Fehler, obwohl `authenticated` kein `update`-Recht hat (falls doch: auf reines `insert` mit Behandlung des Unique-Fehlers `23505` umstellen)
  - Einfügen mit fremder `child_id` → abgelehnt
  - Update und Delete → abgelehnt
  - Offline abschließen → Runde in der Warteschlange, nach Rückkehr ins Netz hochgeladen
  - Abbruch über „← Zurück“ → keine Runde
  - Gast und Eltern spielen → keine Runde
  - Kinder- und Elternansicht durchklicken, Auffrischen startet Runde mit den fälligen Wörtern

## 6. Doku und Begleitarbeiten

- AGENTS.md: neue Datei `js/stats.js` in der Ladereihenfolge, Tabelle `rounds` und Warteschlange bei Architektur bzw. Fallstricken
- `sql/migrations/README.md`: Zeile für `0004`
- `sw.js`: `CACHE_NAME` erhöhen, `./js/stats.js` in `ASSETS`
- Issue #7: Nummer `0005` statt `0004`
