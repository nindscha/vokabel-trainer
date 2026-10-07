# Hinweise für Agenten und Entwickler

Statische Vanilla-JS-PWA, kein Build, keine Tests, keine Module. Sprache der UI und Doku: Deutsch.

## Architektur
- Skripte werden in `index.html` per `<script>` in fester Reihenfolge geladen und hängen als Globals zusammen: supabase → `supabaseClient` → `authService` → `dataService` → `familyService` → `family` → `app`. Neue Skripte in dieser Reihenfolge einfügen.
- `app.js` (`App`) steuert Ansichten (`showView`), Quiz und Karteikarten. `family.js` (`Family`) rendert Konto/Familie/Fortschritt.
- Fortschritt liegt lokal in `localStorage` (`vokabel_progress`, Besitzer in `vokabel_progress_owner`). In die Cloud wird nur mit Kind-Anmeldung geschrieben (`DataService.syncChildProgress`).
- Vokabeln kommen aus Supabase (`words`), Fallback `vokabeln.json`.

## Konventionen
- Kein `innerHTML` mit Daten. DOM per `createElement`/`textContent` bauen (siehe `el()` in `app.js`, `h()` in `family.js`).
- Bedienelemente als `<button>` oder mit `role="button"` und `tabindex="0"`.
- **Service Worker:** Bei jeder Änderung an gecachten Dateien `CACHE_NAME` in `sw.js` erhöhen. Neue Dateien in `ASSETS` eintragen, sonst werden sie nicht offline geliefert.

## Prüfen
- Syntax: `node --check <datei>.js`.
- Lokal: `python3 -m http.server 8000`, im Browser durchklicken. Bei Service-Worker-Effekten Registrierung und Cache löschen.

## Sicherheitsmodell (Supabase)
- Zugriff nur über RLS und `security definer`-Funktionen in `family_schema.sql` (`create_family`, `add_child`, `join_as_child`, `create_parent_invite`, `accept_parent_invite`). Neue Tabellen immer mit RLS und Policies anlegen.
- Kinder sind anonyme Sitzungen (`is_anonymous`), Eltern normale Konten. Wer Familiencode und Kindname kennt, kann beitreten.
- Der Publishable Key im Client ist öffentlich gedacht. Keine Secret- oder Service-Keys einchecken.
- Schemaänderungen als Migration einspielen und `family_schema.sql` synchron halten.

## Fallstricke
- Alte `progress`-Zeilen ohne `child_id` sind für die App unsichtbar.
- Ein anderes Kind am selben Gerät setzt den lokalen Fortschritt zurück.
- Registrierung ist bewusst entfernt, Eltern legt der Admin im Dashboard an.

## Git
Arbeit auf `develop`, Merge nach `main` per Pull Request. `main` wird über GitHub Pages ausgeliefert.
