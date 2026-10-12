-- Verwaiste anonyme Benutzer (Kinder-Sitzungen) täglich löschen.
-- Ein anonymer Benutzer ohne Sitzung ist nicht mehr erreichbar, denn bei
-- einem anonymen Konto kann man sich nicht erneut anmelden. Das betrifft
-- fehlgeschlagene Beitritte (die App meldet sofort ab) und abgemeldete Geräte.
-- Aktive Kinder haben immer eine Sitzung und sind nie betroffen.
-- child_devices wird per on delete cascade mitgelöscht; Fortschritt und
-- Runden hängen an child_id und bleiben erhalten.

create extension if not exists pg_cron;

-- Eigenes Schema, damit die Funktion nicht über /rest/v1/rpc erreichbar ist
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.cleanup_anonymous_users()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  deleted integer;
begin
  delete from auth.users u
  where u.is_anonymous = true
    and u.created_at < now() - interval '1 day'
    and not exists (select 1 from auth.sessions s where s.user_id = u.id)
    -- Schutz: Anonyme Benutzer können keine Familie anlegen oder Eltern
    -- werden; falls doch, würde das Löschen die Familie mitnehmen.
    and not exists (select 1 from public.families f where f.created_by = u.id)
    and not exists (select 1 from public.family_members m where m.user_id = u.id);
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function private.cleanup_anonymous_users() from public, anon, authenticated;

-- Täglich um 03:17 UTC; unschedule vorher, damit die Datei wiederholbar ist
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-anonymous-users';
select cron.schedule(
  'cleanup-anonymous-users',
  '17 3 * * *',
  'select private.cleanup_anonymous_users()'
);
