-- Chores app: schema, row level security, RPCs

create extension if not exists pgcrypto;

-- ─── Tables ──────────────────────────────────────────────────────────────

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'Europe/Belgrade',
  invite_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6)),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on public.members (user_id);

create table public.chores (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  title              text not null check (length(title) between 1 and 120),
  notes              text,
  assignee_id        uuid references auth.users (id) on delete set null,
  due_at             timestamptz not null,
  remind_before_min  int not null default 0 check (remind_before_min between 0 and 1440),
  repeat             text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  rotate             boolean not null default false,
  done_at            timestamptz,
  done_by            uuid references auth.users (id) on delete set null,
  reminded_at        timestamptz,
  overdue_nudged_at  timestamptz,
  created_by         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now()
);
create index on public.chores (household_id, done_at, due_at);
create index chores_pending_reminders on public.chores (due_at) where done_at is null;

-- History of completions (recurring chores reuse the same row)
create table public.chore_log (
  id           bigint generated always as identity primary key,
  chore_id     uuid not null references public.chores (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  done_by      uuid references auth.users (id) on delete set null,
  done_at      timestamptz not null default now()
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

-- ─── Helpers ─────────────────────────────────────────────────────────────

create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ─── Row level security ──────────────────────────────────────────────────

alter table public.households         enable row level security;
alter table public.members            enable row level security;
alter table public.chores             enable row level security;
alter table public.chore_log          enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "members read household" on public.households
  for select using (public.is_member(id));
create policy "owner updates household" on public.households
  for update using (public.is_owner(id));

create policy "members read members" on public.members
  for select using (public.is_member(household_id));
create policy "update own member row" on public.members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner removes members" on public.members
  for delete using (public.is_owner(household_id) or user_id = auth.uid());

create policy "members read chores" on public.chores
  for select using (public.is_member(household_id));
create policy "members add chores" on public.chores
  for insert with check (public.is_member(household_id) and created_by = auth.uid());
create policy "members edit chores" on public.chores
  for update using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "creator or owner deletes chores" on public.chores
  for delete using (created_by = auth.uid() or public.is_owner(household_id));

create policy "members read log" on public.chore_log
  for select using (public.is_member(household_id));

create policy "own subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- An assignee must belong to the chore's household
create or replace function public.check_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.members m
    where m.household_id = new.household_id and m.user_id = new.assignee_id
  ) then
    raise exception 'Assignee is not in this household';
  end if;
  -- moving the due date or assignee re-arms the reminder
  if tg_op = 'UPDATE' and (new.due_at is distinct from old.due_at
     or new.assignee_id is distinct from old.assignee_id
     or new.remind_before_min is distinct from old.remind_before_min) then
    new.reminded_at := null;
    new.overdue_nudged_at := null;
  end if;
  return new;
end;
$$;
create trigger chores_check_assignee before insert or update on public.chores
  for each row execute function public.check_assignee();

-- ─── RPCs used by the app ────────────────────────────────────────────────

create or replace function public.create_household(p_name text, p_display_name text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.households (name, created_by) values (p_name, auth.uid()) returning * into h;
  insert into public.members (household_id, user_id, display_name, role)
    values (h.id, auth.uid(), p_display_name, 'owner');
  return h;
end;
$$;

create or replace function public.join_household(p_code text, p_display_name text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if not found then raise exception 'Invite code not found'; end if;
  insert into public.members (household_id, user_id, display_name)
    values (h.id, auth.uid(), p_display_name)
    on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end;
$$;

-- Marks a chore done. Recurring chores move to their next due date
-- (computed in the household's time zone so DST doesn't shift the hour)
-- and, if rotate is on, pass to the next member.
create or replace function public.complete_chore(p_chore_id uuid)
returns public.chores language plpgsql security definer set search_path = '' as $$
declare
  c public.chores;
  tz text;
  step interval;
  next_due timestamptz;
  next_assignee uuid;
begin
  select * into c from public.chores where id = p_chore_id for update;
  if not found or not public.is_member(c.household_id) then
    raise exception 'Chore not found';
  end if;

  insert into public.chore_log (chore_id, household_id, done_by)
    values (c.id, c.household_id, auth.uid());

  if c.repeat = 'none' then
    update public.chores set done_at = now(), done_by = auth.uid()
      where id = c.id returning * into c;
    return c;
  end if;

  select timezone into tz from public.households where id = c.household_id;
  step := case c.repeat when 'daily' then interval '1 day'
                        when 'weekly' then interval '1 week'
                        else interval '1 month' end;

  -- next occurrence in the future (skips missed ones)
  next_due := c.due_at;
  loop
    next_due := ((next_due at time zone tz) + step) at time zone tz;
    exit when next_due > now();
  end loop;

  next_assignee := c.assignee_id;
  if c.rotate then
    select m.user_id into next_assignee
    from public.members m
    where m.household_id = c.household_id
    order by (m.joined_at <= coalesce(
                (select joined_at from public.members
                  where household_id = c.household_id and user_id = c.assignee_id),
                '-infinity')), m.joined_at
    limit 1;
  end if;

  update public.chores
    set due_at = next_due, assignee_id = next_assignee,
        done_at = null, done_by = null
    where id = c.id returning * into c;
  return c;
end;
$$;

create or replace function public.reopen_chore(p_chore_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.chores set done_at = null, done_by = null
  where id = p_chore_id and public.is_member(household_id);
end;
$$;

-- ─── Used only by the send-reminders edge function (service role) ───────

-- Atomically claims due reminders so overlapping cron runs never double-send.
create or replace function public.claim_due_reminders()
returns table (chore_id uuid, user_id uuid, title text, due_at timestamptz, kind text, household_tz text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    update public.chores c set reminded_at = now()
    where c.done_at is null and c.reminded_at is null and c.assignee_id is not null
      and c.due_at - make_interval(mins => c.remind_before_min) <= now()
      and c.due_at > now() - interval '1 day'
    returning c.id, c.assignee_id, c.title, c.due_at, c.household_id, 'due'::text as kind
  ),
  overdue as (
    update public.chores c set overdue_nudged_at = now()
    where c.done_at is null and c.overdue_nudged_at is null and c.assignee_id is not null
      and c.reminded_at is not null and c.reminded_at < now() - interval '30 minutes'
      and c.due_at <= now() - interval '1 day'
    returning c.id, c.assignee_id, c.title, c.due_at, c.household_id, 'overdue'::text as kind
  ),
  allr as (select * from due union all select * from overdue)
  select a.id, a.assignee_id, a.title, a.due_at, a.kind, h.timezone
  from allr a join public.households h on h.id = a.household_id;
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

-- ─── Realtime ────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.chores, public.members;
