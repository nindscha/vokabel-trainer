# Hinweise für Agenten und Entwickler

Statische Vanilla-JS-PWA, kein Build, keine Tests, keine Module. Sprache der UI und Doku: Deutsch.

## Architektur
- Skripte liegen in `js/` und werden in `index.html` per `<script>` in fester Reihenfolge geladen und hängen als Globals zusammen: supabase → `js/supabaseClient.js` → `js/authService.js` → `js/dataService.js` → `js/familyService.js` → `js/dom.js` → `js/logic.js` → `js/stats.js` → `js/family.js` → `js/app.js`. Neue Skripte in dieser Reihenfolge einfügen.
- `js/app.js` (`App`) steuert Ansichten (`showView`), Quiz und Karteikarten. `js/family.js` (`Family`) rendert Konto/Familie/Fortschritt. `js/logic.js` (`Logic`) enthält reine Regeln ohne DOM: Antwortprüfung, Mischen, Wiederholungsauswahl, Statistik (Lernstand, Serie, Kalender, Verlauf). `js/stats.js` (`Stats`) baut daraus die Statistik-Karten für Kinder- und Elternansicht.
- Fortschritt liegt lokal in `localStorage` (`vokabel_progress`, Besitzer in `vokabel_progress_owner`). In die Cloud wird nur mit Kind-Anmeldung geschrieben (`DataService.syncChildProgress`).
- Abgeschlossene Runden (bis zur Ergebnisseite) landen in der Tabelle `rounds`, offline zuerst in der Warteschlange `vokabel_rounds_pending`. Sie wird bei jedem `syncChildProgress` hochgeladen; die `id` erzeugt der Browser, doppeltes Hochladen ist unschädlich.
- Vokabeln kommen aus Supabase (`words`), Fallback `data/vokabeln.json`.

## Konventionen
- Kein `innerHTML` mit Daten. DOM per `createElement`/`textContent` bauen (siehe `Dom.h()` in `js/dom.js`).
- Bedienelemente als `<button>` oder mit `role="button"` und `tabindex="0"`.
- **Service Worker:** Bei jeder Änderung an gecachten Dateien `CACHE_NAME` in `sw.js` erhöhen. Neue Dateien in `ASSETS` eintragen (mit Pfad, z. B. `./js/neu.js`), sonst werden sie nicht offline geliefert.

## Prüfen
- Syntax: `node --check js/<datei>.js`.
- Lokal: `python3 -m http.server 8000`, im Browser durchklicken. Bei Service-Worker-Effekten Registrierung und Cache löschen.

## Sicherheitsmodell (Supabase)
- Zugriff nur über RLS und `security definer`-Funktionen aus `sql/migrations/0002_family_groups.sql` (`create_family`, `add_child`, `join_as_child`, `create_parent_invite`, `accept_parent_invite`). Neue Tabellen immer mit RLS und Policies anlegen.
- Kinder sind anonyme Sitzungen (`is_anonymous`), Eltern normale Konten. Wer Familiencode und Kindname kennt, kann beitreten.
- Der Publishable Key im Client ist öffentlich gedacht. Keine Secret- oder Service-Keys einchecken.
- Schemaänderungen als neue nummerierte Datei in `sql/migrations/` anlegen (siehe [sql/migrations/README.md](sql/migrations/README.md)). Bestehende Migrationen nicht mehr ändern.
- Die Datenbank ist die führende Vokabelquelle. `data/vokabeln.json` und `sql/seed_words.sql` daraus neu erzeugen, wenn sich Vokabeln ändern.

## Fallstricke
- Alte `progress`-Zeilen ohne `child_id` sind für die App unsichtbar.
- Lokaler Fortschritt gehört genau einem Kind. Beim Anmelden wird Gast- oder fremder Fortschritt verworfen, beim Abmelden des Kindes wird er nach einem letzten Abgleich gelöscht. Als Gast oder Elternteil Geübtes landet nie in der Cloud.
- Registrierung ist bewusst entfernt, Eltern legt der Admin im Dashboard an.
- Datumswerte (`played_on`, `lastPracticed`) sind lokale Daten über `Logic.localDate()`, nicht `toISOString()` (UTC).

## Git
Arbeit auf `develop`, Merge nach `main` per Pull Request. `main` wird über GitHub Pages ausgeliefert.
