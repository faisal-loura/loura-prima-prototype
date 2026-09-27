-- A restore point for the whole board. The dataset is stored opaquely: a
-- snapshot is only ever written back wholesale, never queried field by field,
-- so one jsonb document beats re-normalising every table.
create table public.workspace_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  label text not null,
  -- 'initial' is the pristine seed, refreshed on every re-seed and not deletable.
  kind text not null default 'manual' check (kind in ('initial', 'manual')),
  dataset jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, label)
);

create index workspace_snapshots_workspace_idx on public.workspace_snapshots (workspace_id, created_at desc);

alter table public.workspace_snapshots enable row level security;

create policy workspace_snapshots_member_all on public.workspace_snapshots
  for all to authenticated
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

-- The pristine seed is the one restore point that must always be there.
create or replace function public.guard_initial_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and old.kind = 'initial' then
    raise exception 'the initial seed snapshot cannot be deleted';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_initial_snapshot() from public, anon, authenticated;

create trigger workspace_snapshots_guard_initial
  before delete on public.workspace_snapshots
  for each row execute function public.guard_initial_snapshot();;
