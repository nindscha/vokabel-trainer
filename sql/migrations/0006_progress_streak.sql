-- Richtige Antworten in Folge pro Wort ("streak").
-- Die App setzt den Wert bei einer richtigen Antwort um 1 hoch und bei einer
-- falschen auf 0. Ein Wort gilt auch dann als sicher, wenn es zuletzt
-- mindestens 3-mal in Folge richtig war, selbst bei schlechter Gesamtquote.
-- Bestehende Zeilen starten mit 0; der Lernstand ändert sich dadurch nicht.
-- Rechte und Policies auf progress gelten zeilenweise und bleiben unverändert.

alter table public.progress
  add column if not exists streak int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.progress'::regclass and conname = 'progress_streak_check'
  ) then
    alter table public.progress
      add constraint progress_streak_check check (streak >= 0);
  end if;
end $$;
