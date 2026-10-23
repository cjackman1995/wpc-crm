-- Sales CRM schema for Supabase.
-- Visibility rules live in the database (row-level security), not in the app:
--   * reps see and edit only leads and tasks they own
--   * managers see and edit everything and get the company-wide reports
--   * the first account created becomes a manager; everyone after that starts as a rep


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('rep', 'manager');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'rep',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.stages (
  id          serial primary key,
  name        text not null unique,
  sort_order  int not null,
  probability numeric(4, 3) not null check (probability between 0 and 1),
  is_closed   boolean not null default false,
  is_won      boolean not null default false,
  check (not is_won or is_closed)
);

create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  company          text not null check (length(trim(company)) > 0),
  contact_name     text,
  email            text,
  phone            text,
  equipment        text,
  amount           numeric(14, 2) check (amount is null or amount >= 0),
  probability      numeric(4, 3) check (probability is null or probability between 0 and 1),
  expected_close   date,
  quote_number     text,
  source           text,
  notes            text,
  lost_reason      text,
  stage_id         int not null references public.stages (id),
  owner_id         uuid not null default auth.uid() references public.profiles (id),
  stage_entered_at timestamptz not null default now(),
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index leads_owner_idx on public.leads (owner_id);
create index leads_stage_idx on public.leads (stage_id);
create index leads_email_idx on public.leads (lower(email));
create index leads_company_idx on public.leads (lower(company));

create table public.stage_changes (
  id            bigserial primary key,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  from_stage_id int references public.stages (id),
  to_stage_id   int not null references public.stages (id),
  changed_by    uuid references public.profiles (id),
  changed_at    timestamptz not null default now()
);
create index stage_changes_lead_idx on public.stage_changes (lead_id, changed_at);

create table public.activities (
  id         bigserial primary key,
  lead_id    uuid not null references public.leads (id) on delete cascade,
  user_id    uuid default auth.uid() references public.profiles (id),
  type       text not null check (type in ('note', 'call', 'email', 'meeting', 'stage_change', 'system')),
  body       text not null,
  created_at timestamptz not null default now()
);
create index activities_lead_idx on public.activities (lead_id, created_at desc);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  notes        text,
  due_date     date,
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status       text not null default 'open' check (status in ('open', 'done')),
  lead_id      uuid references public.leads (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references public.profiles (id),
  created_by   uuid default auth.uid() references public.profiles (id),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index tasks_owner_idx on public.tasks (owner_id, status, due_date);
create index tasks_lead_idx on public.tasks (lead_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can read profiles safely)
-- ---------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'manager');
$$;

-- New sign-ups get a profile. The very first account becomes the manager.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    case when exists (select 1 from public.profiles where role = 'manager')
         then 'rep'::public.user_role else 'manager'::public.user_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only managers can change role, active flag or email; nobody can change their own role.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email) then
    if not public.is_manager() then
      raise exception 'Only managers can change roles or deactivate users';
    end if;
    if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'You cannot change your own role or deactivate yourself';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Keep stage bookkeeping consistent no matter how a lead is edited.
create or replace function public.leads_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  s public.stages;
begin
  new.updated_at := now();
  select * into s from public.stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, now());
    new.closed_at := case when s.is_closed then coalesce(new.closed_at, now()) else null end;
  elsif new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
    -- moving stages resets a manual probability back to the stage default
    if new.probability is not distinct from old.probability then
      new.probability := null;
    end if;
    new.closed_at := case when s.is_closed then now() else null end;
  end if;
  return new;
end;
$$;

create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

create or replace function public.leads_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := coalesce(auth.uid(), new.owner_id);
  from_name text;
  to_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.stage_changes (lead_id, from_stage_id, to_stage_id, changed_by, changed_at)
    values (new.id, null, new.stage_id, actor, new.created_at);
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.stage_changes (lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, old.stage_id, new.stage_id, actor);
    select name into from_name from public.stages where id = old.stage_id;
    select name into to_name from public.stages where id = new.stage_id;
    insert into public.activities (lead_id, user_id, type, body)
    values (new.id, actor, 'stage_change', 'Stage changed from ' || from_name || ' to ' || to_name);
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    insert into public.activities (lead_id, user_id, type, body)
    values (new.id, actor, 'system', 'Owner changed to '
      || coalesce((select nullif(full_name, '') from public.profiles where id = new.owner_id), 'another user'));
  end if;
  return null;
end;
$$;

create trigger leads_after_write after insert or update on public.leads
  for each row execute function public.leads_after_write();

create or replace function public.tasks_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status = 'open' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Import duplicate check. Reps can't read other reps' leads, so this reports only
-- which emails / company names already exist and who owns them, nothing else.
create or replace function public.find_existing_leads(emails text[], companies text[])
returns table (match_key text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select distinct on (k) k, coalesce(nullif(p.full_name, ''), p.email)
  from (
    select 'email:' || lower(l.email) as k, l.owner_id from public.leads l
      where l.email is not null and lower(l.email) = any (select lower(e) from unnest(emails) e)
    union all
    select 'company:' || lower(trim(l.company)), l.owner_id from public.leads l
      where lower(trim(l.company)) = any (select lower(trim(c)) from unnest(companies) c)
  ) m
  join public.profiles p on p.id = m.owner_id
  where public.is_active_user()
  order by k;
$$;

-- Move every lead and open task from one rep to another (managers only).
create or replace function public.transfer_book(from_user uuid, to_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.is_manager() then
    raise exception 'Only managers can transfer leads';
  end if;
  if not exists (select 1 from public.profiles where id = to_user and active) then
    raise exception 'Target user is not active';
  end if;
  update public.leads set owner_id = to_user where owner_id = from_user;
  get diagnostics n = row_count;
  update public.tasks set owner_id = to_user where owner_id = from_user and status = 'open';
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.stages        enable row level security;
alter table public.leads         enable row level security;
alter table public.stage_changes enable row level security;
alter table public.activities    enable row level security;
alter table public.tasks         enable row level security;

-- Nothing is available without signing in.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_active_user(), public.is_manager(),
  public.find_existing_leads(text[], text[]), public.transfer_book(uuid, uuid) to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- profiles: everyone signed in can see the team list (names on records); managers manage people
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

-- stages: readable by all, editable by managers
create policy stages_select on public.stages for select to authenticated using (public.is_active_user());
create policy stages_insert on public.stages for insert to authenticated with check (public.is_manager());
create policy stages_update on public.stages for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy stages_delete on public.stages for delete to authenticated using (public.is_manager());

-- leads: reps own theirs, managers see all. A rep cannot hand a lead to someone else.
create policy leads_select on public.leads for select to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_manager()));
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_active_user() and (owner_id = auth.uid() or public.is_manager()));
create policy leads_update on public.leads for update to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_manager()))
  with check (owner_id = auth.uid() or public.is_manager());
create policy leads_delete on public.leads for delete to authenticated
  using (public.is_manager());

-- stage history: visible when the lead is visible; written only by the trigger
create policy stage_changes_select on public.stage_changes for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

-- activity timeline: visible with the lead; people log their own notes/calls
create policy activities_select on public.activities for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (
    user_id = auth.uid()
    and type in ('note', 'call', 'email', 'meeting')
    and exists (select 1 from public.leads l where l.id = lead_id)
  );
create policy activities_delete on public.activities for delete to authenticated
  using ((user_id = auth.uid() and type in ('note', 'call', 'email', 'meeting')) or public.is_manager());

-- tasks: your own, or all of them for managers (who can also assign tasks to reps)
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_manager()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.is_active_user()
    and (owner_id = auth.uid() or public.is_manager())
    and (lead_id is null or exists (select 1 from public.leads l where l.id = lead_id))
  );
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_manager()))
  with check (owner_id = auth.uid() or public.is_manager());
create policy tasks_delete on public.tasks for delete to authenticated
  using (owner_id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------------------
-- Default pipeline stages (from the Cooper Jackman pipeline tracker)
-- ---------------------------------------------------------------------------

insert into public.stages (name, sort_order, probability, is_closed, is_won) values
  ('Lead / Inquiry',   1, 0.05, false, false),
  ('Discovery',        2, 0.10, false, false),
  ('Qualified',        3, 0.20, false, false),
  ('Proposal Sent',    4, 0.35, false, false),
  ('Testing Complete', 5, 0.50, false, false),
  ('Negotiation',      6, 0.75, false, false),
  ('Verbal Commit',    7, 0.90, false, false),
  ('Closed Won',       8, 1.00, true,  true),
  ('Closed Lost',      9, 0.00, true,  false);
