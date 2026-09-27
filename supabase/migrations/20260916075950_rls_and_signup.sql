-- The caller's workspace. SECURITY DEFINER so policies on `profiles` can use it
-- without recursing through their own RLS.
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select workspace_id from public.profiles where id = auth.uid() $$;

-- The caller's operational role, used by policies that gate writes.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select role from public.profiles where id = auth.uid() $$;

-- New signups land in the demo workspace with the role they picked on the
-- login screen (passed through auth metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chosen public.app_role;
  ws uuid;
begin
  begin
    chosen := (new.raw_user_meta_data ->> 'role')::public.app_role;
  exception when others then
    chosen := null;
  end;
  if chosen is null then
    chosen := 'Sales';
  end if;

  select id into ws from public.workspaces
   where slug = coalesce(new.raw_user_meta_data ->> 'workspace_slug', 'prima-demo');
  if ws is null then
    select id into ws from public.workspaces order by created_at limit 1;
  end if;

  insert into public.profiles (id, workspace_id, email, full_name, role)
  values (
    new.id,
    ws,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    chosen
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A user may edit their display name but never grant themselves another role
-- or move workspace: that would sidestep the whole permission matrix.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.role() = 'authenticated' then
    if new.role is distinct from old.role then
      raise exception 'role is assigned at sign-up and cannot be changed by the account holder';
    end if;
    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'workspace cannot be changed by the account holder';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workspaces     enable row level security;
alter table public.profiles       enable row level security;
alter table public.materials      enable row level security;
alter table public.demands        enable row level security;
alter table public.inventory      enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.evidence       enable row level security;
alter table public.outcomes       enable row level security;
alter table public.work_items     enable row level security;
alter table public.commitments    enable row level security;
alter table public.agent_activity enable row level security;

create policy workspaces_read on public.workspaces
  for select to authenticated using (id = public.current_workspace_id());
-- Members advance the shared demo clock / id sequence.
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (id = public.current_workspace_id())
  with check (id = public.current_workspace_id());

create policy profiles_read_workspace on public.profiles
  for select to authenticated using (workspace_id = public.current_workspace_id());
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Operational tables: the readiness board is shared by the whole workspace, so
-- every member reads and writes it. Which *actions* a role may take is enforced
-- by the permission matrix in src/lib/permissions.ts before any write happens.
do $$
declare t text;
begin
  foreach t in array array[
    'materials','demands','inventory','purchase_orders','evidence',
    'outcomes','work_items','commitments','agent_activity'
  ] loop
    execute format($f$
      create policy %1$I_member_all on public.%1$I
        for all to authenticated
        using (workspace_id = public.current_workspace_id())
        with check (workspace_id = public.current_workspace_id());
    $f$, t);
  end loop;
end $$;;
