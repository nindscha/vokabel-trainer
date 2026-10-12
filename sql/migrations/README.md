# Datenbank-Migrationen

Schema-Änderungen für Supabase (PostgreSQL) liegen hier als nummerierte, einmalig ausführbare Dateien.

| Datei | Inhalt | Stand |
|---|---|---|
| `0001_baseline.sql` | Tabellen `words` und `progress` vor der Familien-Funktion (idempotent) | Entspricht dem Live-Stand (dort ursprünglich manuell angelegt) |
| `0002_family_groups.sql` | Familien, Kinder, Einladungen, Policies und Funktionen | Im Live-Projekt angewendet (Migration `family_groups`) |
| `0003_revoke_write_grants.sql` | Entzieht `anon` und `authenticated` überflüssige Rechte (`TRUNCATE`, `DELETE`, `REFERENCES`, `TRIGGER`; auf `words` auch `INSERT`/`UPDATE`) | Im Live-Projekt angewendet (Migration `revoke_write_grants`) |
| `0004_rounds.sql` | Tabelle `rounds` (abgeschlossene Übungsrunden für Serie, Kalender, Verlauf) mit RLS: Kind fügt ein, Kind und Eltern lesen | Im Live-Projekt angewendet (Migration `rounds`) |

## Regeln

- Die Datenbank ist die führende Quelle. `data/vokabeln.json` ist nur ein Offline-Fallback und wird aus der Tabelle `words` erzeugt.
- Neue Änderungen als neue Datei mit der nächsten Nummer anlegen (`0003_…sql`). Bestehende Dateien nicht mehr ändern, wenn sie angewendet wurden.
- Jede Datei muss auf einer leeren Datenbank in Reihenfolge laufen und auf einer bestehenden Datenbank nichts kaputt machen.
- Neue Tabellen immer mit RLS (`enable row level security`) und passenden Policies anlegen.
- Nach jeder Migration `sql/seed_words.sql` und `data/vokabeln.json` abgleichen, falls sich Vokabeln geändert haben.

## Anwenden

Im Supabase Dashboard unter SQL Editor die Dateien in Reihenfolge ausführen. Auf dem Live-Projekt wurde bereits alles bis `0004` angewendet, daher dort nichts erneut ausführen.

Bei Abweichungen den Stand per Supabase MCP oder `list_migrations` prüfen.

## Bekannte offene Punkte

- Die Rechte auf `words` und `progress` sind seit `0003` eingeschränkt. Offen bleiben die Supabase-Warnungen zu `SECURITY DEFINER` und zum Passwortschutz.
