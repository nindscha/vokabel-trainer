-- Familien-Gruppen für den Vokabel-Trainer (Supabase / PostgreSQL)
--
-- Voraussetzungen (Supabase Dashboard):
--   * Authentication → Providers → Email aktiv
--   * Authentication → Sign In / Providers → "Allow anonymous sign-ins" aktivieren
--     (Kinder melden sich ohne Konto per Familiencode + Name an)
--
-- ACHTUNG: Dieses Skript ersetzt alle bestehenden RLS-Policies der Tabelle
-- "progress". Bisherige Zeilen ohne child_id bleiben erhalten, sind aber für
-- die App nicht mehr sichtbar.

-- ---------------------------------------------------------------- Tabellen

create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  child_code  text not null unique,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id   uuid not null references public.families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.children (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);
create unique index if not exists children_family_name_key
  on public.children (family_id, lower(name));

-- Anonyme Geräte-Sitzungen, die zu einem Kind gehören
create table if not exists public.child_devices (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.parent_invites (
  code        text primary key,
  family_id   uuid not null references public.families(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '7 days',
  used_at     timestamptz
);

-- progress: Zuordnung zu einem Kind
alter table public.progress
  add column if not exists child_id uuid references public.children(id) on delete cascade;
alter table public.progress alter column child_name drop not null;

-- Alte Unique-Constraints (z. B. child_name, week, word_en) entfernen
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.progress'::regclass and contype = 'u'
  loop
    execute format('alter table public.progress drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.progress
  add constraint progress_child_week_word_key unique (child_id, week, word_en);

-- ---------------------------------------------------------------- Hilfsfunktionen

create or replace function public.gen_code(len int)
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 Zeichen, ohne I/O/0/1
  result text := '';
  i int;
begin
  for i in 1..len loop
    result := result || substr(alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % 32) + 1, 1);
  end loop;
  return result;
end $$;

create or replace function public.is_anonymous_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.is_family_parent(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members where family_id = fid and user_id = auth.uid()
  );
$$;

create or replace function public.is_child_session(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from child_devices where child_id = cid and user_id = auth.uid()
  );
$$;

create or replace function public.is_child_parent(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from children c
    join family_members m on m.family_id = c.family_id
    where c.id = cid and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- RPCs

create or replace function public.create_family(p_name text)
returns public.families language plpgsql security definer set search_path = public as $$
declare
  f public.families;
  n text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or is_anonymous_user() then
    raise exception 'Bitte als Elternteil anmelden.';
  end if;
  if char_length(n) not between 1 and 60 then
    raise exception 'Bitte einen Familiennamen (1–60 Zeichen) eingeben.';
  end if;

  loop
    insert into families (name, child_code, created_by)
    values (n, gen_code(8), auth.uid())
    on conflict (child_code) do nothing
    returning * into f;
    exit when f.id is not null;
  end loop;

  insert into family_members (family_id, user_id) values (f.id, auth.uid());
  return f;
end $$;

create or replace function public.add_child(p_family_id uuid, p_name text)
returns public.children language plpgsql security definer set search_path = public as $$
declare
  c public.children;
  n text := btrim(coalesce(p_name, ''));
begin
  if not is_family_parent(p_family_id) then
    raise exception 'Keine Berechtigung.';
  end if;
  if char_length(n) not between 1 and 40 then
    raise exception 'Bitte einen Namen (1–40 Zeichen) eingeben.';
  end if;
  begin
    insert into children (family_id, name) values (p_family_id, n) returning * into c;
  exception when unique_violation then
    raise exception 'Ein Kind mit diesem Namen existiert bereits.';
  end;
  return c;
end $$;

create or replace function public.join_as_child(p_code text, p_name text)
returns table (child_id uuid, child_name text, family_name text)
language plpgsql security definer set search_path = public as $$
declare
  c children;
  f families;
begin
  if auth.uid() is null or not is_anonymous_user() then
    raise exception 'Nur für Kinder-Sitzungen.';
  end if;

  select * into f from families where child_code = upper(btrim(coalesce(p_code, '')));
  if f.id is not null then
    select * into c from children
    where family_id = f.id and lower(name) = lower(btrim(coalesce(p_name, '')));
  end if;
  if c.id is null then
    raise exception 'Familiencode oder Name ist nicht korrekt.';
  end if;

  insert into child_devices (user_id, child_id) values (auth.uid(), c.id)
  on conflict (user_id) do update set child_id = excluded.child_id;

  return query select c.id, c.name, f.name;
end $$;

create or replace function public.create_parent_invite(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not is_family_parent(p_family_id) then
    raise exception 'Keine Berechtigung.';
  end if;
  loop
    code := gen_code(10);
    begin
      insert into parent_invites (code, family_id, created_by)
      values (code, p_family_id, auth.uid());
      return code;
    exception when unique_violation then
      null;
    end;
  end loop;
end $$;

create or replace function public.accept_parent_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv parent_invites;
begin
  if auth.uid() is null or is_anonymous_user() then
    raise exception 'Bitte als Elternteil anmelden.';
  end if;

  select * into inv from parent_invites
  where code = upper(btrim(coalesce(p_code, '')))
    and used_at is null and expires_at > now()
  for update;
  if inv.code is null then
    raise exception 'Einladungscode ist ungültig oder abgelaufen.';
  end if;

  if not exists (
    select 1 from family_members where family_id = inv.family_id and user_id = auth.uid()
  ) then
    insert into family_members (family_id, user_id) values (inv.family_id, auth.uid());
    update parent_invites set used_at = now() where code = inv.code;
  end if;
  return inv.family_id;
end $$;

revoke all on function
  public.create_family(text), public.add_child(uuid, text), public.join_as_child(text, text),
  public.create_parent_invite(uuid), public.accept_parent_invite(text)
from public, anon;
grant execute on function
  public.create_family(text), public.add_child(uuid, text), public.join_as_child(text, text),
  public.create_parent_invite(uuid), public.accept_parent_invite(text)
to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.children       enable row level security;
alter table public.child_devices  enable row level security;
alter table public.parent_invites enable row level security;
alter table public.progress       enable row level security;

revoke all on public.families, public.family_members, public.children,
              public.child_devices, public.parent_invites, public.progress
from anon;
grant select on public.families, public.family_members, public.parent_invites to authenticated;
grant select, delete on public.children to authenticated;
grant select on public.child_devices to authenticated;
grant select, insert, update on public.progress to authenticated;

drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated
  using (public.is_family_parent(id));

drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members for select to authenticated
  using (public.is_family_parent(family_id));

drop policy if exists children_select on public.children;
create policy children_select on public.children for select to authenticated
  using (public.is_family_parent(family_id) or public.is_child_session(id));

drop policy if exists children_delete on public.children;
create policy children_delete on public.children for delete to authenticated
  using (public.is_family_parent(family_id));

drop policy if exists child_devices_select on public.child_devices;
create policy child_devices_select on public.child_devices for select to authenticated
  using (user_id = auth.uid());

drop policy if exists parent_invites_select on public.parent_invites;
create policy parent_invites_select on public.parent_invites for select to authenticated
  using (public.is_family_parent(family_id));

-- Bestehende progress-Policies ersetzen
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'progress'
  loop
    execute format('drop policy %I on public.progress', p.policyname);
  end loop;
end $$;

create policy progress_select on public.progress for select to authenticated
  using (public.is_child_session(child_id) or public.is_child_parent(child_id));
create policy progress_insert on public.progress for insert to authenticated
  with check (public.is_child_session(child_id));
create policy progress_update on public.progress for update to authenticated
  using (public.is_child_session(child_id))
  with check (public.is_child_session(child_id));
