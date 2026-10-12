# Statistiken für Kinder und Eltern – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kinder sehen auf ihrer Kontoseite Serie, Lernkalender, Lernstand und Auffrischen; Eltern sehen pro Kind zusätzlich Verlauf und schwierige Wörter.

**Architecture:** Abgeschlossene Runden werden in einer neuen Supabase-Tabelle `rounds` gespeichert (lokale Warteschlange für offline). Alle Kennzahlen sind reine Funktionen in `js/logic.js`; die Karten baut die neue Datei `js/stats.js`, die von `js/family.js` für Kinder- und Elternansicht genutzt wird.

**Tech Stack:** Vanilla JS ohne Build und Module (Globals), Supabase (Postgres, RLS, supabase-js 2.117.2), Service Worker, Playwright MCP zum Prüfen.

**Spec:** `docs/superpowers/specs/2026-10-12-statistiken-design.md`

## Global Constraints

- Kein `innerHTML` mit Daten; DOM nur über `Dom.h()` / `textContent`.
- Bedienelemente sind `<button>` oder haben `role="button"` und `tabindex="0"`.
- Neue Skripte in `index.html` in der festen Reihenfolge einfügen: `js/stats.js` nach `js/logic.js`, vor `js/family.js`.
- Neue gecachte Dateien in `ASSETS` von `sw.js`; vor dem Abschluss `CACHE_NAME` erhöhen.
- Keine Testdateien im Repo (AGENTS.md: „keine Tests“). Prüfskripte liegen im Scratchpad: `SCRATCH=/tmp/claude-11000/-home-maik-Projekte-Vokabel/0cff291d-13e5-4979-9f41-7fbece5e99f5/scratchpad`.
- Syntaxprüfung jeder geänderten JS-Datei: `node --check js/<datei>.js`.
- Bestehende Migrationen nicht ändern; neue Datei `sql/migrations/0004_rounds.sql`.
- Migration auf das **Live-Projekt** (`fhkojiwbcdhkgpozltqp`) erst nach ausdrücklicher Zustimmung des Nutzers zum gezeigten SQL.
- Browser-Tests nur mit dem Testkonto aus `.env.test` und der Familie „Testfamilie (Claude)“ (Kindcode `RFR8VZNE`, Kind „Testkind“). Keine anderen Familien anfassen, in die Datenbank nur über die App schreiben.
- UI-Texte auf Deutsch. Konstanten: `SECURE_MIN_CORRECT = 3`, `SECURE_MIN_RATE = 0.7`, `REFRESH_AFTER_DAYS = 14`, `REFRESH_MAX_WORDS = 10`, `CALENDAR_WEEKS = 8`, `TREND_WEEKS = 8`, `DIFFICULT_MIN_ATTEMPTS = 2`, `DIFFICULT_MAX_WORDS = 10`.
- Arbeit auf `develop`, Commits mit Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Runde kurz nach Mitternacht** (00:30 Uhr Ortszeit): `played_on` und `lastPracticed` sind das heutige lokale Datum, nicht das UTC-Datum von gestern. → Test in Task 1 (`localDate`).
2. **Doppeltes Hochladen** (App-Start-Sync und Rundenende laufen gleichzeitig, oder Upload war erfolgreich, aber die Antwort ging verloren): keine doppelte Zeile, kein Fehler. → Test in Task 3.
3. **Wartende Runden eines anderen Kindes** auf demselben Gerät werden nie unter dem neuen Kind hochgeladen. → Test in Task 3.
4. **Neues Kind ohne Daten**: alle Karten erscheinen ohne Fehler („🔥 0“, leerer Kalender, „Alles frisch 🎉“, Verlauf nur „–“). → Test in Task 5 und Task 6.
5. **„Alle Wörter wiederholen“ nach einer Auffrischen-Runde** wiederholt genau dieselben Wörter und erzeugt eine Runde mit `week = null`. → Test in Task 4.

---

### Task 1: Kennzahlen in `js/logic.js`

**Files:**
- Modify: `js/logic.js` (neue Funktionen vor `return`, Rückgabeobjekt erweitern)
- Test: `$SCRATCH/logic-check.js` (nicht im Repo)

**Interfaces:**
- Consumes: nichts
- Produces (alle an `Logic`):
  - `localDate(date?: Date) → 'YYYY-MM-DD'` (lokale Zeit)
  - `addDays(iso: string, days: number) → string`
  - `weekStart(iso: string) → string` (Montag der Woche)
  - `wordLevel(stats?: { correct, wrong }) → 'new' | 'shaky' | 'secure'`
  - `levelCounts(words: any[], getStats: (word) => stats|undefined) → { new, shaky, secure }`
  - `wordsToRefresh(words, getStats, today: string) → words[]` (älteste zuerst; `stats.lastPracticed` als `YYYY-MM-DD`)
  - `streaks(dates: string[], today: string) → { current, longest, playedToday }`
  - `calendarDays(dates: string[], today: string) → { date, played, future }[]` (Länge 56, beginnt Montag)
  - `weeklyAccuracy(rounds: { played_on, is_retry, correct, word_count }[], today) → { weekStart, rate: number|null }[]` (Länge 8)
  - `difficultWords(rows: { week, word_en, correct, wrong }[]) → rows[]`
  - Konstante `REFRESH_MAX_WORDS`

- [ ] **Step 1: Prüfskript schreiben**

`$SCRATCH/logic-check.js`:

```js
// Prüft die Statistik-Regeln aus js/logic.js (nicht Teil des Repos)
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');

const src = fs.readFileSync('/home/maik/Projekte/Vokabel/js/logic.js', 'utf8');
const ctx = {};
vm.runInNewContext(`${src}\nthis.Logic = Logic;`, ctx);
const L = ctx.Logic;
const plain = v => JSON.parse(JSON.stringify(v));

// localDate: lokale Zeit, auch kurz nach Mitternacht
assert.equal(L.localDate(new Date(2026, 9, 12, 0, 30)), '2026-10-12');
assert.equal(L.localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');

// Datumsrechnung über Monats-, Jahres- und Sommerzeitgrenzen
assert.equal(L.addDays('2026-10-31', 1), '2026-11-01');
assert.equal(L.addDays('2026-01-01', -1), '2025-12-31');
assert.equal(L.addDays('2026-10-24', 2), '2026-10-26');
assert.equal(L.weekStart('2026-10-12'), '2026-10-12'); // Montag
assert.equal(L.weekStart('2026-10-18'), '2026-10-12'); // Sonntag
assert.equal(L.weekStart('2026-01-01'), '2025-12-29'); // Donnerstag

// wordLevel: Grenzwerte
assert.equal(L.wordLevel(undefined), 'new');
assert.equal(L.wordLevel({ correct: 0, wrong: 0 }), 'new');
assert.equal(L.wordLevel({ correct: 2, wrong: 0 }), 'shaky');
assert.equal(L.wordLevel({ correct: 3, wrong: 0 }), 'secure');
assert.equal(L.wordLevel({ correct: 7, wrong: 3 }), 'secure'); // genau 70 %
assert.equal(L.wordLevel({ correct: 9, wrong: 4 }), 'shaky');  // 69 %
assert.equal(L.wordLevel({ correct: 0, wrong: 5 }), 'shaky');

// levelCounts
const words = [{ en: 'a' }, { en: 'b' }, { en: 'c' }];
const stats = { a: { correct: 3, wrong: 0 }, b: { correct: 1, wrong: 1 } };
assert.deepEqual(plain(L.levelCounts(words, w => stats[w.en])), { new: 1, shaky: 1, secure: 1 });

// wordsToRefresh: genau 14 Tage zählt, 13 nicht, neue Wörter nie, älteste zuerst
const refreshStats = {
  a: { correct: 3, wrong: 0, lastPracticed: '2026-09-28' }, // 14 Tage
  b: { correct: 1, wrong: 0, lastPracticed: '2026-09-29' }, // 13 Tage
  c: { correct: 1, wrong: 2, lastPracticed: '2026-09-01' }, // 41 Tage
  d: undefined
};
const refreshWords = ['a', 'b', 'c', 'd'].map(en => ({ en }));
assert.deepEqual(plain(L.wordsToRefresh(refreshWords, w => refreshStats[w.en], '2026-10-12')).map(w => w.en), ['c', 'a']);

// streaks
assert.deepEqual(plain(L.streaks([], '2026-10-12')), { current: 0, longest: 0, playedToday: false });
assert.deepEqual(plain(L.streaks(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-12'], '2026-10-12')),
  { current: 3, longest: 3, playedToday: true });
// heute noch nicht gespielt: Serie bis gestern zählt
assert.deepEqual(plain(L.streaks(['2026-10-10', '2026-10-11'], '2026-10-12')),
  { current: 2, longest: 2, playedToday: false });
// ein Tag Lücke: Serie weg, längste bleibt
assert.deepEqual(plain(L.streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10'], '2026-10-12')),
  { current: 0, longest: 3, playedToday: false });
// über Monats- und Jahresgrenze
assert.equal(L.streaks(['2025-12-31', '2026-01-01'], '2026-01-01').current, 2);

// calendarDays: 8 Wochen ab Montag, Zukunft markiert
const cal = plain(L.calendarDays(['2026-10-12', '2026-08-24', '2026-08-23'], '2026-10-14'));
assert.equal(cal.length, 56);
assert.equal(cal[0].date, '2026-08-24');
assert.equal(cal[55].date, '2026-10-18');
assert.equal(cal[0].played, true);
assert.equal(cal.some(d => d.date === '2026-08-23'), false);
assert.deepEqual(cal.find(d => d.date === '2026-10-12'), { date: '2026-10-12', played: true, future: false });
assert.equal(cal.find(d => d.date === '2026-10-15').future, true);

// weeklyAccuracy: ignoriert is_retry, leere Wochen null
const trend = plain(L.weeklyAccuracy([
  { played_on: '2026-10-12', is_retry: false, correct: 6, word_count: 10 },
  { played_on: '2026-10-13', is_retry: false, correct: 4, word_count: 10 },
  { played_on: '2026-10-13', is_retry: true, correct: 0, word_count: 5 },
  { played_on: '2026-08-01', is_retry: false, correct: 1, word_count: 1 } // außerhalb
], '2026-10-14'));
assert.equal(trend.length, 8);
assert.equal(trend[0].weekStart, '2026-08-24');
assert.deepEqual(trend[7], { weekStart: '2026-10-12', rate: 0.5 });
assert.equal(trend[6].rate, null);

// difficultWords: min. 2 Versuche, min. 1 Fehler, nach Quote, dann nach Fehlern
const diff = plain(L.difficultWords([
  { word_en: 'a', correct: 0, wrong: 1 }, // nur 1 Versuch
  { word_en: 'b', correct: 1, wrong: 1 }, // 50 %
  { word_en: 'c', correct: 0, wrong: 2 }, // 100 %
  { word_en: 'd', correct: 2, wrong: 2 }, // 50 %, mehr Fehler als b
  { word_en: 'e', correct: 5, wrong: 0 }  // keine Fehler
]));
assert.deepEqual(diff.map(r => r.word_en), ['c', 'd', 'b']);
assert.equal(L.difficultWords(Array.from({ length: 15 }, (_, i) => ({ word_en: `w${i}`, correct: 0, wrong: 2 }))).length, 10);

assert.equal(L.REFRESH_MAX_WORDS, 10);
console.log('logic-check: alle Prüfungen bestanden');
```

- [ ] **Step 2: Prüfskript ausführen, muss fehlschlagen**

Run: `TZ=Europe/Berlin node $SCRATCH/logic-check.js`
Expected: FAIL mit `TypeError: L.localDate is not a function`

- [ ] **Step 3: Funktionen implementieren**

In `js/logic.js` direkt vor `  return {` einfügen:

```js
  // ---------- Statistik ----------
  const SECURE_MIN_CORRECT = 3;
  const SECURE_MIN_RATE = 0.7;
  const REFRESH_AFTER_DAYS = 14;
  const REFRESH_MAX_WORDS = 10;
  const CALENDAR_WEEKS = 8;
  const TREND_WEEKS = 8;
  const DIFFICULT_MIN_ATTEMPTS = 2;
  const DIFFICULT_MAX_WORDS = 10;
  const DAY_MS = 86400000;

  // Datum als YYYY-MM-DD in lokaler Zeit (toISOString wäre UTC)
  function localDate(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // Tage als ganze Zahlen über UTC, damit die Sommerzeit nichts verschiebt
  function toDayNumber(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }

  function fromDayNumber(n) {
    return new Date(n * DAY_MS).toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    return fromDayNumber(toDayNumber(iso) + days);
  }

  // Montag der Woche
  function weekStart(iso) {
    const n = toDayNumber(iso);
    const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
    return fromDayNumber(n - weekday);
  }

  function wordLevel(stats) {
    const { correct = 0, wrong = 0 } = stats || {};
    const attempts = correct + wrong;
    if (attempts === 0) return 'new';
    if (correct >= SECURE_MIN_CORRECT && correct / attempts >= SECURE_MIN_RATE) return 'secure';
    return 'shaky';
  }

  function levelCounts(words, getStats) {
    const counts = { new: 0, shaky: 0, secure: 0 };
    words.forEach(word => { counts[wordLevel(getStats(word))]++; });
    return counts;
  }

  // Geübte Wörter, deren letzte Übung mindestens REFRESH_AFTER_DAYS zurückliegt
  function wordsToRefresh(words, getStats, today) {
    const limit = toDayNumber(today) - REFRESH_AFTER_DAYS;
    return words
      .map(word => ({ word, stats: getStats(word) }))
      .filter(({ stats }) => wordLevel(stats) !== 'new' && stats.lastPracticed &&
        toDayNumber(stats.lastPracticed) <= limit)
      .sort((a, b) => a.stats.lastPracticed.localeCompare(b.stats.lastPracticed))
      .map(item => item.word);
  }

  // Heute noch nicht gespielt: die Serie bis gestern zählt weiter
  function streaks(dates, today) {
    const days = [...new Set(dates)].map(toDayNumber).sort((a, b) => a - b);
    const played = new Set(days);
    let longest = 0;
    let run = 0;
    days.forEach((day, i) => {
      run = i > 0 && day === days[i - 1] + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    });
    const t = toDayNumber(today);
    const playedToday = played.has(t);
    let current = 0;
    for (let day = playedToday ? t : t - 1; played.has(day); day--) current++;
    return { current, longest, playedToday };
  }

  function firstCalendarDay(today, weeks) {
    return addDays(weekStart(today), -7 * (weeks - 1));
  }

  function calendarDays(dates, today) {
    const played = new Set(dates);
    const first = firstCalendarDay(today, CALENDAR_WEEKS);
    const t = toDayNumber(today);
    return Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => {
      const date = addDays(first, i);
      return { date, played: played.has(date), future: toDayNumber(date) > t };
    });
  }

  // Runden "Nur die falschen" verzerren die Quote und zählen nicht
  function weeklyAccuracy(rounds, today) {
    const first = firstCalendarDay(today, TREND_WEEKS);
    const weeks = Array.from({ length: TREND_WEEKS }, (_, i) =>
      ({ weekStart: addDays(first, 7 * i), correct: 0, total: 0 }));
    const byStart = new Map(weeks.map(w => [w.weekStart, w]));
    rounds.forEach(round => {
      if (round.is_retry) return;
      const week = byStart.get(weekStart(round.played_on));
      if (!week) return;
      week.correct += round.correct;
      week.total += round.word_count;
    });
    return weeks.map(w => ({ weekStart: w.weekStart, rate: w.total > 0 ? w.correct / w.total : null }));
  }

  function difficultWords(rows) {
    return rows
      .filter(r => r.wrong > 0 && r.correct + r.wrong >= DIFFICULT_MIN_ATTEMPTS)
      .map(row => ({ row, rate: row.wrong / (row.correct + row.wrong) }))
      .sort((a, b) => b.rate - a.rate || b.row.wrong - a.row.wrong)
      .slice(0, DIFFICULT_MAX_WORDS)
      .map(item => item.row);
  }
```

Rückgabeobjekt ersetzen durch:

```js
  return {
    normalizeText,
    getAcceptedVariants,
    checkAnswer,
    shuffleArray,
    recapKey,
    selectRecapWords,
    REFRESH_MAX_WORDS,
    localDate,
    addDays,
    weekStart,
    wordLevel,
    levelCounts,
    wordsToRefresh,
    streaks,
    calendarDays,
    weeklyAccuracy,
    difficultWords
  };
```

Kopfkommentar der Datei bleibt; `// logic.js – reine Logik ohne DOM und ohne Speicherzugriff` stimmt weiterhin.

- [ ] **Step 4: Prüfen**

Run: `node --check js/logic.js && TZ=Europe/Berlin node $SCRATCH/logic-check.js && TZ=America/Los_Angeles node $SCRATCH/logic-check.js`
Expected: zweimal `logic-check: alle Prüfungen bestanden`

- [ ] **Step 5: Commit**

```bash
git add js/logic.js
git commit -m "Add statistics rules to Logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration `0004_rounds.sql`

**Files:**
- Create: `sql/migrations/0004_rounds.sql`
- Modify: `sql/migrations/README.md` (Tabelle und Absatz „Anwenden“)

**Interfaces:**
- Consumes: `public.children`, `public.is_child_session(uuid)`, `public.is_child_parent(uuid)` aus `0002`
- Produces: Tabelle `public.rounds` mit Spalten `id, child_id, played_on, finished_at, mode, direction, week, is_retry, word_count, correct, wrong`; `authenticated` darf `select`, `insert`

- [ ] **Step 1: Migration schreiben**

`sql/migrations/0004_rounds.sql`:

```sql
-- Abgeschlossene Übungsrunden für Serie, Lernkalender und Verlauf.
-- Eine Zeile pro Runde bis zur Ergebnisseite. Die id erzeugt der Browser,
-- dadurch ist erneutes Hochladen (Offline-Warteschlange) unschädlich.
-- played_on ist das Datum nach Gerätezeit.

create table if not exists public.rounds (
  id          uuid primary key,
  child_id    uuid not null references public.children(id) on delete cascade,
  played_on   date not null,
  finished_at timestamptz not null,
  mode        text not null check (mode in ('quiz', 'flashcard')),
  direction   text not null check (direction in ('de-en', 'en-de')),
  week        int,
  is_retry    boolean not null default false,
  word_count  int not null check (word_count > 0),
  correct     int not null check (correct >= 0),
  wrong       int not null check (wrong >= 0),
  check (correct + wrong = word_count)
);

create index if not exists rounds_child_played_on_idx
  on public.rounds (child_id, played_on);

alter table public.rounds enable row level security;

-- Nur lesen und einfügen; Runden werden nie geändert oder gelöscht
revoke all on public.rounds from anon, authenticated;
grant select, insert on public.rounds to authenticated;

drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds for select to authenticated
  using (public.is_child_session(child_id) or public.is_child_parent(child_id));

drop policy if exists rounds_insert on public.rounds;
create policy rounds_insert on public.rounds for insert to authenticated
  with check (public.is_child_session(child_id));
```

- [ ] **Step 2: SQL dem Nutzer zeigen und Zustimmung einholen**

Dem Nutzer das SQL zeigen und fragen: „Soll ich `0004_rounds.sql` jetzt auf das Live-Projekt anwenden?“ Ohne ausdrückliches Ja nicht weiter.

- [ ] **Step 3: Anwenden**

Supabase MCP: `apply_migration` mit `project_id: fhkojiwbcdhkgpozltqp`, `name: rounds`, `query:` Inhalt der Datei.

- [ ] **Step 4: Prüfen**

Supabase MCP `list_migrations` → enthält `rounds`.
Supabase MCP `execute_sql` (nur lesend):

```sql
select
  (select relrowsecurity from pg_class where oid = 'public.rounds'::regclass) as rls,
  (select array_agg(privilege_type order by privilege_type) from information_schema.role_table_grants
     where table_name = 'rounds' and grantee = 'authenticated') as auth_grants,
  (select count(*) from information_schema.role_table_grants
     where table_name = 'rounds' and grantee = 'anon') as anon_grants,
  (select array_agg(policyname order by policyname) from pg_policies where tablename = 'rounds') as policies;
```

Expected: `rls = true`, `auth_grants = {INSERT,SELECT}`, `anon_grants = 0`, `policies = {rounds_insert,rounds_select}`.

Supabase MCP `get_advisors` (security und performance): keine **neuen** Warnungen zu `rounds` außer der bekannten Art „Anonymous Access Policies“ (gewollt, Kinder sind anonym).

- [ ] **Step 5: README nachtragen**

In `sql/migrations/README.md` in der Tabelle nach der Zeile für `0003` ergänzen:

```markdown
| `0004_rounds.sql` | Tabelle `rounds` (abgeschlossene Übungsrunden für Serie, Kalender, Verlauf) mit RLS: Kind fügt ein, Kind und Eltern lesen | Im Live-Projekt angewendet (Migration `rounds`) |
```

Und im Absatz „Anwenden“ den Satz `Auf dem Live-Projekt wurde bereits alles bis `0002` angewendet` ersetzen durch `Auf dem Live-Projekt wurde bereits alles bis `0004` angewendet`.

- [ ] **Step 6: Commit**

```bash
git add sql/migrations/0004_rounds.sql sql/migrations/README.md
git commit -m "Add migration 0004 for completed practice rounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Runden speichern und abgleichen

**Files:**
- Modify: `js/dataService.js` (neue Funktionen, `saveWordResult`, `syncChildProgress`, `clearLocalProgress`, Rückgabeobjekt)
- Modify: `js/familyService.js` (`getChildRounds`)
- Modify: `js/app.js` (`showResults`)

**Interfaces:**
- Consumes: `Logic.localDate()` (Task 1), Tabelle `rounds` (Task 2), `AuthService.getChild()`
- Produces:
  - `DataService.recordRound({ mode, direction, week, isRetry, wordCount, correct, wrong }) → Promise<void>`
  - `DataService.getChildRounds(childId) → Promise<{ rounds: Round[], complete: boolean }>` (Cloud plus Warteschlange)
  - `FamilyService.getChildRounds(childId) → Promise<Round[]>`
  - `Round = { id, child_id, played_on, finished_at, mode, direction, week, is_retry, word_count, correct, wrong }`

- [ ] **Step 1: Fehlschlagende Prüfung im Browser**

Lokalen Server starten (`python3 -m http.server 8000` im Hintergrund). Playwright: Browser-Cache leeren und Service Worker abmelden (siehe Memory: CDP `Network.clearBrowserCache`, `getRegistrations().unregister()`, `caches.delete`), `http://localhost:8000/` laden. Als Testkind anmelden (Konto → Familiencode `RFR8VZNE`, Name `Testkind`).

`browser_evaluate`:

```js
() => typeof DataService.recordRound
```

Expected: `"undefined"`

- [ ] **Step 2: `js/dataService.js` erweitern**

Unter `const OWNER_KEY = 'vokabel_progress_owner';` einfügen:

```js
  const ROUNDS_KEY = 'vokabel_rounds_pending';
  const ROUND_COLUMNS =
    'id, child_id, played_on, finished_at, mode, direction, week, is_retry, word_count, correct, wrong';
```

In `saveWordResult` die Zeile

```js
    all[key][word].lastPracticed = new Date().toISOString().split('T')[0];
```

ersetzen durch

```js
    all[key][word].lastPracticed = Logic.localDate();
```

In `syncChildProgress` den Block

```js
    // Nur eigenen Fortschritt übernehmen; Gast- oder fremder Fortschritt wird verworfen
    if (localStorage.getItem(OWNER_KEY) !== childId) localStorage.removeItem(PROGRESS_KEY);
    localStorage.setItem(OWNER_KEY, childId);
```

ersetzen durch

```js
    // Nur eigenen Fortschritt übernehmen; Gast- oder fremder Fortschritt wird verworfen
    if (localStorage.getItem(OWNER_KEY) !== childId) {
      localStorage.removeItem(PROGRESS_KEY);
      localStorage.removeItem(ROUNDS_KEY);
    }
    localStorage.setItem(OWNER_KEY, childId);
```

und am Ende von `syncChildProgress`, nach dem schließenden `}` des `catch`-Blocks und vor dem schließenden `}` der Funktion, einfügen:

```js

    await flushPendingRounds(childId);
```

`clearLocalProgress` ersetzen durch:

```js
  // Lokalen Fortschritt, wartende Runden und Besitzer löschen (beim Abmelden eines Kindes)
  function clearLocalProgress() {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(ROUNDS_KEY);
    localStorage.removeItem(OWNER_KEY);
  }
```

Vor `// Statistik für eine Woche` einfügen:

```js
  function readPendingRounds() {
    try {
      return JSON.parse(localStorage.getItem(ROUNDS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  // Abgeschlossene Runde merken und hochladen (nur mit Kind-Anmeldung)
  async function recordRound({ mode, direction, week, isRetry, wordCount, correct, wrong }) {
    const child = AuthService.getChild();
    if (!child || wordCount === 0) return;

    const now = new Date();
    const pending = readPendingRounds();
    pending.push({
      id: crypto.randomUUID(),
      child_id: child.id,
      played_on: Logic.localDate(now),
      finished_at: now.toISOString(),
      mode,
      direction,
      week: week ?? null,
      is_retry: isRetry,
      word_count: wordCount,
      correct,
      wrong
    });
    localStorage.setItem(ROUNDS_KEY, JSON.stringify(pending));
    await flushPendingRounds(child.id);
  }

  // Wartende Runden hochladen; bereits vorhandene ids werden ignoriert
  async function flushPendingRounds(childId) {
    const pending = readPendingRounds().filter(r => r.child_id === childId);
    if (!supabase || pending.length === 0) return;
    try {
      const { error } = await supabase
        .from('rounds')
        .upsert(pending, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      const sent = new Set(pending.map(r => r.id));
      localStorage.setItem(ROUNDS_KEY,
        JSON.stringify(readPendingRounds().filter(r => !sent.has(r.id))));
    } catch (err) {
      console.warn('Round sync failed:', err.message || err);
    }
  }

  // Runden eines Kindes aus der Cloud plus noch wartende; complete=false ohne Cloud
  async function getChildRounds(childId) {
    const pending = readPendingRounds().filter(r => r.child_id === childId);
    if (!supabase) return { rounds: pending, complete: false };
    try {
      const { data, error } = await supabase
        .from('rounds')
        .select(ROUND_COLUMNS)
        .eq('child_id', childId);
      if (error) throw error;
      const ids = new Set(data.map(r => r.id));
      return { rounds: data.concat(pending.filter(r => !ids.has(r.id))), complete: true };
    } catch (err) {
      console.warn('Loading rounds failed:', err.message || err);
      return { rounds: pending, complete: false };
    }
  }

```

Rückgabeobjekt um `recordRound,` und `getChildRounds,` ergänzen (nach `clearLocalProgress,`).

Hinweis: `Logic` wird nach `dataService.js` geladen, aber erst zur Laufzeit aufgerufen; das ist in Ordnung.

- [ ] **Step 3: `js/familyService.js` erweitern**

Nach `getChildProgress` einfügen:

```js
  function getChildRounds(childId) {
    return unwrap(
      client.from('rounds')
        .select('id, played_on, finished_at, mode, direction, week, is_retry, word_count, correct, wrong')
        .eq('child_id', childId)
    );
  }
```

und `getChildRounds` im Rückgabeobjekt nach `getChildProgress` ergänzen.

- [ ] **Step 4: `App.showResults` erweitern**

In `js/app.js` in `showResults` direkt nach der Zeile `const isRetryRound = currentWords.length < fullSetSize;` einfügen:

```js
    DataService.recordRound({
      mode: currentMode,
      direction,
      week: recapOptions ? null : currentWeek,
      isRetry: isRetryRound,
      wordCount: sessionResults.length,
      correct,
      wrong
    });
```

- [ ] **Step 5: Syntax prüfen**

Run: `node --check js/dataService.js && node --check js/familyService.js && node --check js/app.js`
Expected: keine Ausgabe

- [ ] **Step 6: Im Browser prüfen**

Browser-Cache leeren, Service Worker abmelden, neu laden. Prüfen, dass `typeof DataService.recordRound === 'function'`. Angemeldet als Testkind (sonst anmelden).

a) **Runde abschließen:** Woche 4 → Quiz → alle Fragen per `App.submitQuiz()` beantworten (wie im bisherigen Test: Antwort setzen, zweimal `submitQuiz`). Dann:

```js
async () => {
  await new Promise(r => setTimeout(r, 1500));
  const child = AuthService.getChild();
  const { data } = await Backend.client.from('rounds').select('*').eq('child_id', child.id)
    .order('finished_at', { ascending: false }).limit(1);
  return { pending: localStorage.getItem('vokabel_rounds_pending'), last: data[0] };
}
```

Expected: `pending` ist `"[]"`; `last` hat `mode: 'quiz'`, `week: 4`, `is_retry: false`, `word_count: 7`, `played_on` = heutiges lokales Datum.

b) **Doppeltes Hochladen (Review Focus 2):**

```js
async () => {
  const c = Backend.client;
  const child = AuthService.getChild();
  const { data: [row] } = await c.from('rounds').select('*').eq('child_id', child.id).limit(1);
  const again = await c.from('rounds').upsert([row], { onConflict: 'id', ignoreDuplicates: true });
  const { count } = await c.from('rounds').select('id', { count: 'exact', head: true }).eq('id', row.id);
  return { error: again.error?.message ?? null, count };
}
```

Expected: `error: null`, `count: 1`. Falls `error` „permission denied“ meldet: in `flushPendingRounds` statt `upsert` einzeln `insert` verwenden und den Fehlercode `23505` (Unique) als Erfolg werten; Test wiederholen.

c) **Fremde child_id, Update, Delete:**

```js
async () => {
  const c = Backend.client;
  const child = AuthService.getChild();
  const foreign = await c.from('rounds').insert({
    id: crypto.randomUUID(), child_id: crypto.randomUUID(), played_on: '2026-10-12',
    finished_at: new Date().toISOString(), mode: 'quiz', direction: 'de-en',
    week: 1, is_retry: false, word_count: 1, correct: 1, wrong: 0 });
  const upd = await c.from('rounds').update({ correct: 0 }).eq('child_id', child.id);
  const del = await c.from('rounds').delete().eq('child_id', child.id);
  return { foreign: foreign.error?.message, upd: upd.error?.message, del: del.error?.message };
}
```

Expected: alle drei mit Fehlermeldung (RLS bzw. „permission denied“).

d) **Wartende Runden eines anderen Kindes (Review Focus 3):**

```js
async () => {
  const child = AuthService.getChild();
  const other = { id: crypto.randomUUID(), child_id: crypto.randomUUID(), played_on: '2026-10-12',
    finished_at: new Date().toISOString(), mode: 'quiz', direction: 'de-en', week: 1,
    is_retry: false, word_count: 1, correct: 1, wrong: 0 };
  localStorage.setItem('vokabel_rounds_pending', JSON.stringify([other]));
  await DataService.syncChildProgress(child.id);
  const { count } = await Backend.client.from('rounds').select('id', { count: 'exact', head: true }).eq('id', other.id);
  const left = localStorage.getItem('vokabel_rounds_pending');
  localStorage.setItem('vokabel_rounds_pending', '[]');
  return { uploaded: count, left };
}
```

Expected: `uploaded: 0`, `left` enthält weiterhin genau diese Zeile (nicht hochgeladen, nicht verloren).

e) **Offline:** `browser_run_code_unsafe` mit `await page.context().setOffline(true)`, eine Runde Woche 4 abschließen, prüfen: `JSON.parse(localStorage.getItem('vokabel_rounds_pending')).length === 1`. Dann `setOffline(false)`, `await DataService.syncChildProgress(AuthService.getChild().id)`, prüfen: Warteschlange `[]` und Zeile mit dieser `id` in `rounds`.

f) **Abbruch:** Woche 4 → Quiz → eine Frage beantworten → `App.goHome()`. Anzahl Zeilen in `rounds` für das Kind vorher und nachher gleich.

g) **Gast:** Konto → Abmelden (Knopf). Als Gast eine Runde Woche 4 abschließen. `localStorage.getItem('vokabel_rounds_pending')` ist `null`.

- [ ] **Step 7: Commit**

```bash
git add js/dataService.js js/familyService.js js/app.js
git commit -m "Record completed rounds with offline queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wiederholung mit fester Wortliste (`App.startWordSet`)

**Files:**
- Modify: `js/app.js` (`launchRecap`, neue Funktion `startWordSet`, Public API)

**Interfaces:**
- Consumes: `startFlashcards(words)`, `startQuiz(words)`, `recapOptions`
- Produces: `App.startWordSet(words: { week, en, de }[], mode: 'quiz' | 'flashcard') → void`

- [ ] **Step 1: Fehlschlagende Prüfung**

Im Browser: `typeof App.startWordSet` → Expected `"undefined"`.

- [ ] **Step 2: Implementieren**

In `js/app.js` `launchRecap` ersetzen durch:

```js
  async function launchRecap(mode) {
    const words = recapOptions.words ||
      await buildRecapSelection(recapOptions.count, recapOptions.strategy);
    if (mode === 'flashcard') {
      startFlashcards(words);
    } else {
      startQuiz(words);
    }
  }

  // Wiederholung mit fester Wortliste (z. B. Auffrischen aus der Statistik)
  function startWordSet(words, mode) {
    currentWeek = null;
    recapOptions = { count: words.length, words: [...words] };
    if (mode === 'flashcard') {
      startFlashcards(words);
    } else {
      startQuiz(words);
    }
  }
```

Im Public-API-Objekt nach `startRecap,` ergänzen: `startWordSet,`

- [ ] **Step 3: Syntax prüfen**

Run: `node --check js/app.js`
Expected: keine Ausgabe

- [ ] **Step 4: Im Browser prüfen (Review Focus 5)**

Cache leeren und neu laden, als Testkind angemeldet:

```js
async () => {
  const words = (await DataService.getAllWords()).filter(w => w.week === 3).slice(0, 3);
  App.setDirection('de-en'); // Abfragewörter sind dann die deutschen
  App.startWordSet(words, 'quiz');
  const asked = [];
  for (let i = 0; i < 3; i++) {
    asked.push(document.getElementById('quiz-prompt-word').textContent);
    document.getElementById('quiz-answer').value = 'xyz';
    App.submitQuiz(); App.submitQuiz();
  }
  App.retryAllWords();
  await new Promise(r => setTimeout(r, 100));
  const askedAgain = [];
  for (let i = 0; i < 3; i++) {
    askedAgain.push(document.getElementById('quiz-prompt-word').textContent);
    document.getElementById('quiz-answer').value = 'xyz';
    App.submitQuiz(); App.submitQuiz();
  }
  await new Promise(r => setTimeout(r, 1500));
  const { data } = await Backend.client.from('rounds').select('week, is_retry, word_count')
    .eq('child_id', AuthService.getChild().id).order('finished_at', { ascending: false }).limit(2);
  return { same: [...asked].sort().join() === [...askedAgain].sort().join(),
    expected: words.map(w => w.de).sort().join() === [...asked].sort().join(), rounds: data };
}
```

Expected: `same: true`, `expected: true`, beide `rounds` mit `week: null`, `is_retry: false`, `word_count: 3`.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "Add App.startWordSet for fixed word list rounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `js/stats.js` und Kinderansicht

**Files:**
- Create: `js/stats.js`
- Modify: `index.html` (Script-Tag), `sw.js` (`ASSETS`), `css/style.css` (Abschnitt Statistik), `js/family.js` (`open`, `renderChild`, Helfer `groupByWeek`)

**Interfaces:**
- Consumes: `Logic.*` (Task 1), `DataService.getChildRounds`, `DataService.getProgress`, `DataService.getAllWords`, `App.startWordSet` (Task 4), `Dom.h`
- Produces (an `Stats`, jeweils ein DOM-Element):
  - `streakCard(dates: string[], today: string)`
  - `calendarCard(dates: string[], today: string, complete = true)`
  - `levelCard(weeks: { week, words }[], getStats)`
  - `refreshCard(words, onStart: (words, mode) => void)`
  - `trendCard(rounds, today)`
  - `difficultCard(rows, translations: Map<'week|en', de>)`
- `Family`-intern: `groupByWeek(words) → { week, words }[]`

Vor dem Schreiben der Diagramme (Kalender, Lernstand-Balken, Verlauf) den Skill `dataviz` laden und dessen Regeln für Farben, Beschriftung und Zugänglichkeit anwenden; die Struktur unten bleibt.

- [ ] **Step 1: Fehlschlagende Prüfung**

Im Browser als Testkind: Konto öffnen, `document.querySelectorAll('#account-content .card').length` → Expected `1` (nur „Hallo Testkind!“).

- [ ] **Step 2: `js/stats.js` anlegen**

```js
// stats.js – Statistik-Karten für Kinder- und Elternansicht

const Stats = (() => {
  const { h } = Dom;
  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const LEVELS = [
    { key: 'secure', label: 'sicher' },
    { key: 'shaky', label: 'wackelig' },
    { key: 'new', label: 'neu' }
  ];

  function card(title, ...content) {
    return h('section', { class: 'card' }, h('h3', {}, title), ...content);
  }

  // 'YYYY-MM-DD' → 'TT.MM.'
  function shortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${d}.${m}.`;
  }

  function days(n) {
    return `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
  }

  function streakCard(dates, today) {
    const { current, longest, playedToday } = Logic.streaks(dates, today);
    return card('Serie',
      h('div', { class: 'streak-number' }, `🔥 ${current}`),
      h('p', { class: 'muted' }, `${days(current)} am Stück`),
      h('p', { class: 'muted small' }, `Längste Serie: ${days(longest)}`),
      !playedToday && current > 0
        ? h('p', { class: 'streak-hint' }, 'Heute noch keine Runde, sonst ist die Serie morgen weg.')
        : null);
  }

  function calendarCard(dates, today, complete = true) {
    const cells = Logic.calendarDays(dates, today);
    const grid = h('div', { class: 'calendar', role: 'list', 'aria-label': 'Lernkalender' },
      WEEKDAYS.map(day => h('div', { class: 'calendar-head', 'aria-hidden': 'true' }, day)),
      cells.map((cell, i) => {
        const state = cell.future ? 'noch offen' : cell.played ? 'geübt' : 'nicht geübt';
        const classes = ['calendar-day'];
        if (cell.played) classes.push('played');
        if (cell.future) classes.push('future');
        if (cell.date === today) classes.push('today');
        return h('div', {
          class: classes.join(' '),
          role: 'listitem',
          'aria-label': `${WEEKDAYS[i % 7]}, ${shortDate(cell.date)}: ${state}`
        });
      }));
    return card('Lernkalender', grid,
      h('p', { class: 'muted small' }, `Die letzten ${cells.length / 7} Wochen, ein Kästchen pro Tag.`),
      complete ? null : h('p', { class: 'muted small' }, 'Ohne Internet ist der Kalender vielleicht unvollständig.'));
  }

  function levelText(counts) {
    return LEVELS.map(level => `${counts[level.key]} ${level.label}`).join(' · ');
  }

  function levelBar(counts) {
    const total = LEVELS.reduce((sum, level) => sum + counts[level.key], 0);
    return h('div', { class: 'level-bar', 'aria-hidden': 'true' }, LEVELS.map(level => {
      const segment = h('div', { class: `level-seg ${level.key}` });
      segment.style.width = total > 0 ? `${(counts[level.key] / total) * 100}%` : '0%';
      return segment;
    }));
  }

  function levelLegend() {
    return h('div', { class: 'level-legend muted small' }, LEVELS.map(level =>
      h('span', {}, h('span', { class: `legend-dot ${level.key}` }), level.label)));
  }

  // weeks: [{ week, words }], getStats(word) → { correct, wrong } oder undefined
  function levelCard(weeks, getStats) {
    const total = Logic.levelCounts(weeks.flatMap(w => w.words), getStats);
    const rows = weeks.map(w => {
      const counts = Logic.levelCounts(w.words, getStats);
      return h('div', { class: 'week-progress' },
        h('div', { class: 'week-progress-head' },
          h('strong', {}, `Woche ${w.week}`),
          h('span', { class: 'muted' }, levelText(counts))),
        levelBar(counts));
    });
    return card('Lernstand',
      h('p', {}, levelText(total)),
      levelBar(total),
      levelLegend(),
      h('div', { class: 'stack' }, rows));
  }

  function refreshCard(words, onStart) {
    if (words.length === 0) {
      return card('Auffrischen', h('p', { class: 'muted' }, 'Alles frisch 🎉'));
    }
    const pick = words.slice(0, Logic.REFRESH_MAX_WORDS);
    const button = (label, mode) =>
      h('button', { class: 'btn-small', type: 'button', onclick: () => onStart(pick, mode) }, label);
    return card('Auffrischen',
      h('p', {}, words.length === 1
        ? '1 Wort wartet aufs Auffrischen.'
        : `${words.length} Wörter warten aufs Auffrischen.`),
      h('p', { class: 'muted small' },
        `Lange nicht geübt. Eine Runde nimmt bis zu ${Logic.REFRESH_MAX_WORDS} davon.`),
      h('div', { class: 'button-row' },
        button('✏️ Quiz', 'quiz'),
        button('🃏 Karteikarten', 'flashcard')));
  }

  function trendCard(rounds, today) {
    const weeks = Logic.weeklyAccuracy(rounds, today);
    const columns = weeks.map(week => {
      const pct = week.rate === null ? null : Math.round(week.rate * 100);
      const fill = h('div', { class: 'trend-fill' });
      fill.style.height = `${pct ?? 0}%`;
      return h('div', {
        class: 'trend-col',
        role: 'listitem',
        'aria-label': `Woche ab ${shortDate(week.weekStart)}: ${pct === null ? 'keine Runde' : `${pct} % richtig`}`
      },
        h('div', { class: 'trend-value', 'aria-hidden': 'true' }, pct === null ? '–' : `${pct}%`),
        h('div', { class: 'trend-track', 'aria-hidden': 'true' }, fill),
        h('div', { class: 'trend-label', 'aria-hidden': 'true' }, shortDate(week.weekStart)));
    });
    return card('Verlauf',
      h('div', { class: 'trend', role: 'list', 'aria-label': 'Trefferquote pro Woche' }, columns),
      h('p', { class: 'muted small' }, 'Trefferquote pro Woche, ohne Runden „Nur die falschen“.'));
  }

  // translations: Map 'week|en' → deutsche Übersetzung
  function difficultCard(rows, translations) {
    const content = rows.length === 0
      ? h('p', { class: 'muted' }, 'Keine auffälligen Wörter. 🎉')
      : h('div', { class: 'stack' }, rows.map(r =>
          h('div', { class: 'results-word-item' },
            h('span', {}, '❌'),
            h('span', {}, `${r.word_en} → ${translations.get(`${r.week}|${r.word_en}`) || '?'}`),
            h('span', { class: 'muted small push-right' }, `${r.wrong} von ${r.correct + r.wrong} falsch`))));
    return card('Schwierige Wörter', content);
  }

  return { streakCard, calendarCard, levelCard, refreshCard, trendCard, difficultCard };
})();
```

- [ ] **Step 3: Einbinden**

`index.html`: nach `<script src="js/logic.js"></script>` einfügen:

```html
  <script src="js/stats.js"></script>
```

`sw.js`: in `ASSETS` nach `'./js/logic.js',` einfügen: `'./js/stats.js',`

- [ ] **Step 4: CSS ergänzen**

In `css/style.css` vor `/* Small screens: tighter spacing */` einfügen:

```css
/* ---------- Statistik ---------- */
.streak-number {
  font-size: 2.4rem;
  font-weight: 800;
}

.streak-hint {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--warning);
}

.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-head {
  font-size: 0.7rem;
  color: var(--text-lighter);
  text-align: center;
}

.calendar-day {
  aspect-ratio: 1;
  border-radius: 4px;
  background: var(--border);
}

.calendar-day.played {
  background: var(--success);
}

.calendar-day.future {
  background: transparent;
  border: 1px dashed var(--border);
}

.calendar-day.today {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.level-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--border);
}

.level-seg.secure,
.legend-dot.secure {
  background: var(--success);
}

.level-seg.shaky,
.legend-dot.shaky {
  background: var(--warning);
}

.level-seg.new,
.legend-dot.new {
  background: var(--border);
}

.level-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.trend {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  align-items: end;
}

.trend-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.trend-value {
  font-size: 0.7rem;
  color: var(--text-light);
}

.trend-track {
  width: 100%;
  height: 80px;
  display: flex;
  align-items: flex-end;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
}

.trend-fill {
  width: 100%;
  background: var(--primary);
  border-radius: 4px 4px 0 0;
}

.trend-label {
  font-size: 0.65rem;
  color: var(--text-lighter);
}
```

- [ ] **Step 5: Kinderansicht in `js/family.js`**

In `open()` die Zeile `else if (role === 'child') renderChild(root);` ersetzen durch `else if (role === 'child') await renderChild(root);`

Vor `// ---------- Konto ----------` einfügen:

```js
  // [{ week, en, de }] → [{ week, words }] in der Reihenfolge der Wochen
  function groupByWeek(words) {
    const map = new Map();
    words.forEach(word => {
      if (!map.has(word.week)) map.set(word.week, []);
      map.get(word.week).push(word);
    });
    return [...map].map(([week, list]) => ({ week, words: list }));
  }

```

`renderChild` ersetzen durch:

```js
  async function renderChild(root) {
    const child = AuthService.getChild();
    const logout = h('button', { class: 'btn-secondary', type: 'button' }, 'Abmelden');
    logout.addEventListener('click', () => run(logout, async () => {
      // Letzter Abgleich, damit offline Geübtes nicht verloren geht
      await DataService.syncChildProgress(child.id);
      DataService.clearLocalProgress();
      await AuthService.signOut();
      await open();
    }));

    const loading = h('p', { class: 'muted' }, 'Lade Statistik…');
    root.append(card(`Hallo ${child.name}!`,
      h('p', { class: 'muted' }, `Familie ${child.familyName}. Dein Fortschritt wird gespeichert und ist für deine Eltern sichtbar.`),
      logout), loading);

    try {
      const [words, { rounds, complete }] = await Promise.all([
        DataService.getAllWords(),
        DataService.getChildRounds(child.id)
      ]);
      const today = Logic.localDate();
      const dates = rounds.map(r => r.played_on);
      const getStats = word => DataService.getProgress(word.week)[word.en];
      loading.replaceWith(
        Stats.streakCard(dates, today),
        Stats.calendarCard(dates, today, complete),
        Stats.levelCard(groupByWeek(words), getStats),
        Stats.refreshCard(Logic.wordsToRefresh(words, getStats, today), App.startWordSet));
    } catch (err) {
      loading.remove();
      setMessage(err.message || String(err));
    }
  }
```

- [ ] **Step 6: Syntax prüfen**

Run: `node --check js/stats.js && node --check js/family.js && node --check sw.js`
Expected: keine Ausgabe

- [ ] **Step 7: Im Browser prüfen**

Cache leeren, Service Worker abmelden, neu laden, als Testkind angemeldet, Konto öffnen.

a) Karten vorhanden:

```js
() => [...document.querySelectorAll('#account-content .card h3')].map(e => e.textContent)
```

Expected: `["Hallo Testkind!", "Serie", "Lernkalender", "Lernstand", "Auffrischen"]`

b) Werte plausibel: `document.querySelector('.streak-number').textContent` ist `"🔥 1"` (Runden aus Task 3 von heute); `document.querySelectorAll('.calendar-day').length === 56`; genau ein `.calendar-day.today`, und es hat die Klasse `played`.

c) Auffrischen: Eine Auffrischen-Situation herstellen:

```js
() => {
  const all = JSON.parse(localStorage.getItem('vokabel_progress'));
  const word = Object.keys(all.week_2)[0];
  all.week_2[word].lastPracticed = '2026-09-01';
  localStorage.setItem('vokabel_progress', JSON.stringify(all));
  return word;
}
```

Konto erneut öffnen (`Family.open()`), Text der Auffrischen-Karte enthält „1 Wort wartet aufs Auffrischen.“, Klick auf „✏️ Quiz“ öffnet `view-quiz` mit `1 / 1`. Danach `App.goHome()` (Abbruch, keine Runde).

d) **Neues Kind ohne Daten (Review Focus 4):** Als Eltern anmelden (`.env.test`), in „Testfamilie (Claude)“ Kind „Leerkind“ hinzufügen, abmelden, als „Leerkind“ beitreten, Konto öffnen. Expected: „🔥 0“, kein `.calendar-day.played`, Lernstand „0 sicher · 0 wackelig · 62 neu“, „Alles frisch 🎉“, keine Fehler in `browser_console_messages` (Level `error`). Danach abmelden; „Leerkind“ bleibt für Task 6.

e) Screenshot der Kinderansicht (`browser_take_screenshot`, `fullPage: true`) ansehen: Kalender sieben Spalten, keine horizontale Scrollleiste bei 375 px Breite (`browser_resize` 375×800).

- [ ] **Step 8: Commit**

```bash
git add js/stats.js js/family.js index.html sw.js css/style.css
git commit -m "Show statistics on the child's account page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Elternansicht

**Files:**
- Modify: `js/family.js` (`openProgress`, `buildProgress`)

**Interfaces:**
- Consumes: `FamilyService.getChildProgress`, `FamilyService.getChildRounds` (Task 3), `DataService.getAllWords`, `Stats.*` (Task 5), `Logic.difficultWords`, `groupByWeek`
- Produces: keine neuen Schnittstellen

- [ ] **Step 1: Fehlschlagende Prüfung**

Als Eltern angemeldet, Testfamilie → Testkind → Fortschritt:

```js
() => [...document.querySelectorAll('#progress-content .card h3')].map(e => e.textContent)
```

Expected: `["Pro Woche", "Schwierige Wörter"]`

- [ ] **Step 2: `openProgress` anpassen**

Den `try`-Block in `openProgress` ersetzen durch:

```js
    try {
      const [rows, words, rounds] = await Promise.all([
        FamilyService.getChildProgress(child.id),
        DataService.getAllWords(),
        FamilyService.getChildRounds(child.id)
      ]);
      root.replaceChildren(...buildProgress(rows, words, rounds));
    } catch (err) {
      root.replaceChildren();
      setMessage(err.message);
    }
```

- [ ] **Step 3: `buildProgress` ersetzen**

Die bisherige `async function buildProgress(rows, weeks)` vollständig ersetzen durch:

```js
  function buildProgress(rows, words, rounds) {
    if (rows.length === 0 && rounds.length === 0) {
      return [h('p', { class: 'muted' }, 'Noch nichts geübt.')];
    }

    const totalCorrect = rows.reduce((sum, r) => sum + r.correct, 0);
    const totalWrong = rows.reduce((sum, r) => sum + r.wrong, 0);
    const lastDate = rows.map(r => r.last_practiced).filter(Boolean).sort().pop();

    const summary = h('div', { class: 'stat-grid' },
      stat(totalCorrect, 'Richtig', 'correct'),
      stat(totalWrong, 'Falsch', 'wrong'),
      stat(`${percent(totalCorrect, totalWrong)}%`, 'Quote'),
      stat(formatDate(lastDate), 'Zuletzt geübt'));

    const today = Logic.localDate();
    const dates = rounds.map(r => r.played_on);
    const progress = new Map(rows.map(r => [`${r.week}|${r.word_en}`,
      { correct: r.correct, wrong: r.wrong, lastPracticed: r.last_practiced }]));
    const getStats = word => progress.get(`${word.week}|${word.en}`);
    const translations = new Map(words.map(w => [`${w.week}|${w.en}`, w.de]));

    return [
      summary,
      Stats.streakCard(dates, today),
      Stats.calendarCard(dates, today),
      Stats.levelCard(groupByWeek(words), getStats),
      Stats.trendCard(rounds, today),
      Stats.difficultCard(Logic.difficultWords(rows), translations)
    ];
  }
```

`stat`, `percent` und `formatDate` bleiben unverändert.

- [ ] **Step 4: Syntax prüfen**

Run: `node --check js/family.js`
Expected: keine Ausgabe

- [ ] **Step 5: Im Browser prüfen**

Cache leeren, neu laden, als Eltern angemeldet, Testfamilie → Testkind → Fortschritt.

a) Expected Karten: `["Serie", "Lernkalender", "Lernstand", "Verlauf", "Schwierige Wörter"]` (die Übersicht ist `.stat-grid`, keine `.card`).

b) Verlauf: `document.querySelectorAll('.trend-col').length === 8`; die letzte Spalte zeigt einen Prozentwert (Runden aus Task 3/4 von heute), Spalten ohne Runden zeigen „–“.

c) Schwierige Wörter: Einträge zeigen „N von M falsch“ und eine Übersetzung (kein „?“).

d) Gleiche Zahlen wie beim Kind: Serie und Lernstand-Text der Elternansicht stimmen mit der Kinderansicht aus Task 5 überein.

e) **Neues Kind ohne Daten (Review Focus 4):** Fortschritt von „Leerkind“ öffnen → „Noch nichts geübt.“, keine Konsolenfehler. Danach „Leerkind“ über 🗑 entfernen (Dialog mit `browser_handle_dialog` bestätigen).

f) Screenshot bei 375 px Breite ansehen, keine horizontale Scrollleiste.

- [ ] **Step 6: Commit**

```bash
git add js/family.js
git commit -m "Show streak, calendar, levels and trend in the parent view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Doku, Cache-Version, Issue, Gesamtprüfung

**Files:**
- Modify: `AGENTS.md`, `sw.js`, `README.md`
- GitHub: Issue #7 (`nindscha/vokabel-trainer`)

**Interfaces:**
- Consumes: alles aus Task 1–6
- Produces: nichts Neues

- [ ] **Step 1: AGENTS.md aktualisieren**

Im Abschnitt „Architektur“ die Ladereihenfolge ersetzen durch:

```markdown
supabase → `js/supabaseClient.js` → `js/authService.js` → `js/dataService.js` → `js/familyService.js` → `js/dom.js` → `js/logic.js` → `js/stats.js` → `js/family.js` → `js/app.js`
```

Den Satz über `Logic` ersetzen durch:

```markdown
`js/logic.js` (`Logic`) enthält reine Regeln ohne DOM: Antwortprüfung, Mischen, Wiederholungsauswahl, Statistik (Lernstand, Serie, Kalender, Verlauf). `js/stats.js` (`Stats`) baut daraus die Statistik-Karten für Kinder- und Elternansicht.
```

Nach dem Punkt zum lokalen Fortschritt ergänzen:

```markdown
- Abgeschlossene Runden (bis zur Ergebnisseite) landen in der Tabelle `rounds`, offline zuerst in der Warteschlange `vokabel_rounds_pending`. Sie wird bei jedem `syncChildProgress` hochgeladen; die `id` erzeugt der Browser, doppeltes Hochladen ist unschädlich.
```

Unter „Fallstricke“ ergänzen:

```markdown
- Datumswerte (`played_on`, `lastPracticed`) sind lokale Daten über `Logic.localDate()`, nicht `toISOString()` (UTC).
```

- [ ] **Step 2: README.md aktualisieren**

In „Funktionen“ nach dem Punkt zur Wiederholung ergänzen:

```markdown
- **Statistik:** Kinder sehen auf ihrer Kontoseite Serie, Lernkalender, Lernstand und Wörter zum Auffrischen. Eltern sehen pro Kind zusätzlich den Verlauf der Trefferquote und schwierige Wörter.
```

In der Dateitabelle nach `js/logic.js` ergänzen:

```markdown
| `js/stats.js` | Statistik-Karten für Kinder- und Elternansicht |
```

und die Zeile zu `sql/migrations/` auf `(`0001`–`0004`, Anleitung)` ändern.

- [ ] **Step 3: Cache-Version erhöhen**

`sw.js`: `CACHE_NAME` von `'vokabel-trainer-v17'` auf `'vokabel-trainer-v18'`.

Run: `node --check sw.js`
Expected: keine Ausgabe

- [ ] **Step 4: Gesamtprüfung im Browser**

Cache leeren, Service Worker abmelden, neu laden. Einmal durchspielen: als Testkind eine Wochenrunde per Tastatur (Enter) abschließen → Konto zeigt Serie und Kalender mit heute; als Eltern Fortschritt des Testkinds öffnen → gleiche Serie, Verlauf mit heutiger Woche. `browser_console_messages` Level `error`: leer. Danach `browser_close` und lokalen Server beenden.

Run: `cd /home/maik/Projekte/Vokabel && for f in js/*.js sw.js; do node --check "$f" || echo "FAIL $f"; done && TZ=Europe/Berlin node $SCRATCH/logic-check.js`
Expected: nur `logic-check: alle Prüfungen bestanden`

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md sw.js
git commit -m "Document statistics and bump service worker cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Issue #7 anpassen**

GitHub MCP `issue_write` (`method: update`, `issue_number: 7`): im Body `sql/migrations/0004_cleanup_anonymous_users.sql` durch `sql/migrations/0005_cleanup_anonymous_users.sql` ersetzen (übriger Text unverändert, vorher mit `issue_read` lesen).

- [ ] **Step 7: Abschluss**

Nicht pushen. Dem Nutzer berichten: Commits, Testergebnisse, offene Punkte; fragen, ob gepusht und der PR #6 aktualisiert bzw. ein neuer PR erstellt werden soll.
