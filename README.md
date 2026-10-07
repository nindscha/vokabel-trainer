# Vokabel-Trainer

Statische PWA zum Üben englischer Schulvokabeln (Karteikarten und Quiz, Richtung DE→EN oder EN→DE). Eltern können in Familiengruppen den Fortschritt ihrer Kinder einsehen.

Live: https://nindscha.github.io/vokabel-trainer/

## Funktionen
- Vokabeln nach Wochen, Fortschritt lokal gespeichert (`localStorage`), offlinefähig (Service Worker).
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
1. Projekt anlegen, URL und Publishable Key in [supabaseClient.js](supabaseClient.js) eintragen (öffentlich, die Daten schützt RLS).
2. `seed_words.sql` ausführen (Tabelle `words`, falls nicht vorhanden), dann `family_schema.sql` (Familien, Policies, Funktionen). Das Skript ersetzt alle Policies auf `progress`.
3. Dashboard → Authentication → Sign In / Providers: **Allow anonymous sign-ins** aktivieren.
4. Eltern unter Authentication → Users → Add user anlegen (Auto Confirm User).

## Deployment
GitHub Pages aus `main`. Arbeit auf `develop`, Übernahme per Pull Request.

## Dateien
| Datei | Aufgabe |
|---|---|
| `index.html`, `style.css` | Markup und Styles aller Ansichten |
| `app.js` | Hauptlogik: Ansichten, Quiz, Karteikarten, Ergebnisse |
| `dataService.js` | Vokabeln laden, lokaler und Cloud-Fortschritt |
| `supabaseClient.js` | Supabase-Client (`Backend.client`) |
| `authService.js` | Anmeldung für Eltern und Kinder |
| `familyService.js` | Supabase-Aufrufe für Familien |
| `family.js` | UI für Konto, Familie, Kinder, Fortschritt |
| `sw.js`, `manifest.json`, `icons/` | PWA und Offline-Cache |
| `vokabeln.json` | Offline-Vokabeln |
| `family_schema.sql`, `seed_words.sql` | Datenbank |

Weitere Hinweise für Entwickler und Agenten: [AGENTS.md](AGENTS.md).
