# Vokabel-Trainer

Statische PWA zum Üben englischer Schulvokabeln (Karteikarten und Quiz, Richtung DE→EN oder EN→DE). Eltern können in Familiengruppen den Fortschritt ihrer Kinder einsehen.

Live: https://nindscha.github.io/vokabel-trainer/

## Funktionen
- Vokabeln nach Wochen, Fortschritt lokal gespeichert (`localStorage`), offlinefähig (Service Worker).
- **Wiederholung** über alle Wochen: Anzahl frei wählbar, Auswahl zufällig, falsch zuerst oder wenig geübt zuerst, als Karteikarten oder Quiz.
- **Statistik:** Kinder sehen auf ihrer Kontoseite Serie, Lernkalender, Lernstand und Wörter zum Auffrischen. Eltern sehen pro Kind zusätzlich den Verlauf der Trefferquote und schwierige Wörter.
- **Kinder** treten ohne Konto per Familiencode und Name bei (anonyme Supabase-Sitzung). Ihr Fortschritt wird in die Cloud synchronisiert.
- **Eltern** melden sich mit E-Mail und Passwort an, verwalten Familie und Kinder, sehen den Fortschritt und laden weitere Eltern per Code ein.
- Eltern-Konten werden vorerst manuell im Supabase-Dashboard angelegt, es gibt keine Registrierung in der App.

## Lokal starten
Kein Build nötig:

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen. Nach Änderungen an Assets den Service Worker neu laden (Dev-Tools → Application → Unregister) oder hart neu laden.

## Supabase einrichten
1. Projekt anlegen, URL und Publishable Key in [js/supabaseClient.js](js/supabaseClient.js) eintragen (öffentlich, die Daten schützt RLS).
2. Die Migrationen in [sql/migrations/](sql/migrations/) in Reihenfolge im SQL Editor ausführen: zuerst `0001_baseline.sql` (Tabellen `words` und `progress`), dann [sql/seed_words.sql](sql/seed_words.sql) (Vokabeln), dann `0002_family_groups.sql` (Familien, Policies, Funktionen), `0003_revoke_write_grants.sql` (Rechte einschränken) und `0004_rounds.sql` (Übungsrunden für die Statistik). Details und offene Punkte: [sql/migrations/README.md](sql/migrations/README.md).
3. Dashboard → Authentication → Sign In / Providers: **Allow anonymous sign-ins** aktivieren.
4. Eltern unter Authentication → Users → Add user anlegen (Auto Confirm User).

## Deployment
GitHub Pages aus `main`. Arbeit auf `develop`, Übernahme per Pull Request.

## Dateien
| Datei | Aufgabe |
|---|---|
| `index.html`, `css/style.css` | Markup und Styles aller Ansichten |
| `js/app.js` | Hauptlogik: Ansichten, Quiz, Karteikarten, Ergebnisse |
| `js/dataService.js` | Vokabeln laden, lokaler und Cloud-Fortschritt |
| `js/supabaseClient.js` | Supabase-Client (`Backend.client`) |
| `js/authService.js` | Anmeldung für Eltern und Kinder |
| `js/familyService.js` | Supabase-Aufrufe für Familien |
| `js/dom.js` | Gemeinsamer DOM-Helfer `Dom.h()` |
| `js/logic.js` | Reine Regeln: Antwortprüfung, Mischen, Wiederholungsauswahl, Statistik |
| `js/stats.js` | Statistik-Karten für Kinder- und Elternansicht |
| `js/family.js` | UI für Konto, Familie, Kinder, Fortschritt |
| `sw.js`, `manifest.json`, `icons/` | PWA und Offline-Cache |
| `data/vokabeln.json` | Offline-Vokabeln |
| `sql/migrations/` | Datenbank-Migrationen (`0001`–`0004`, Anleitung) |
| `sql/seed_words.sql` | Vokabeln für `words` |

Weitere Hinweise für Entwickler und Agenten: [AGENTS.md](AGENTS.md).
