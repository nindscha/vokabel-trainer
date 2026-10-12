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
