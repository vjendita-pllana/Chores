-- To buy list + a small queue for one-off push notifications (e.g. "Ana assigned you 3 things")

create table public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  note         text check (length(note) <= 200),
  assignee_id  uuid references auth.users (id) on delete set null,
  bought_at    timestamptz,
  bought_by    uuid references auth.users (id) on delete set null,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index on public.shopping_items (household_id, bought_at);

alter table public.shopping_items enable row level security;

create policy "members read items" on public.shopping_items
  for select using (public.is_member(household_id));
create policy "members add items" on public.shopping_items
  for insert with check (public.is_member(household_id) and created_by = auth.uid());
create policy "members edit items" on public.shopping_items
  for update using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members delete items" on public.shopping_items
  for delete using (public.is_member(household_id));

create or replace function public.check_item_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.members m
    where m.household_id = new.household_id and m.user_id = new.assignee_id
  ) then
    raise exception 'Assignee is not in this household';
  end if;
  return new;
end;
$$;
create trigger shopping_items_check_assignee before insert or update on public.shopping_items
  for each row execute function public.check_item_assignee();

-- Outgoing pushes that aren't tied to a due time. Drained by the send-reminders function.
create table public.push_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text,
  url        text not null default '/',
  tag        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index push_queue_pending on public.push_queue (created_at) where sent_at is null;
alter table public.push_queue enable row level security; -- no policies: only the service role touches it

-- Assigns several items at once (null = unassign) and queues one notification for the assignee.
create or replace function public.assign_items(p_item_ids uuid[], p_assignee uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  n int;
  names text[];
  me text;
begin
  select household_id into hid from public.shopping_items where id = any(p_item_ids) limit 1;
  if hid is null or not public.is_member(hid) then raise exception 'Items not found'; end if;

  with upd as (
    update public.shopping_items set assignee_id = p_assignee
    where id = any(p_item_ids) and household_id = hid and bought_at is null
      and assignee_id is distinct from p_assignee
    returning name
  )
  select count(*), array_agg(name) into n, names from upd;

  if n > 0 and p_assignee is not null and p_assignee <> auth.uid() then
    select display_name into me from public.members where household_id = hid and user_id = auth.uid();
    insert into public.push_queue (user_id, title, body, url, tag)
    values (
      p_assignee,
      case when n = 1 then coalesce(me, 'Someone') || ' asked you to buy ' || names[1]
           else coalesce(me, 'Someone') || ' asked you to buy ' || n || ' things' end,
      case when n = 1 then null else array_to_string(names[1:5], ', ') || case when n > 5 then '…' else '' end end,
      '/?tab=buy',
      'buy-' || hid
    );
  end if;
  return n;
end;
$$;

create or replace function public.toggle_bought(p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.shopping_items
  set bought_at = case when bought_at is null then now() end,
      bought_by = case when bought_at is null then auth.uid() end
  where id = p_item_id and public.is_member(household_id);
end;
$$;

create or replace function public.claim_push_queue()
returns table (user_id uuid, title text, body text, url text, tag text)
language sql security definer set search_path = '' as $$
  update public.push_queue q set sent_at = now()
  where q.sent_at is null and q.created_at > now() - interval '1 day'
  returning q.user_id, q.title, q.body, q.url, q.tag;
$$;
revoke all on function public.claim_push_queue() from public, anon, authenticated;
grant execute on function public.claim_push_queue() to service_role;

alter publication supabase_realtime add table public.shopping_items;
