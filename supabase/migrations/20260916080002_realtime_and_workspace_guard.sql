-- Members may only advance the demo clock / sequence, not rename or re-key the workspace.
create or replace function public.guard_workspace_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if new.id is distinct from old.id
       or new.slug is distinct from old.slug
       or new.name is distinct from old.name then
      raise exception 'only clock, seq and seeded_at may be updated by members';
    end if;
  end if;
  return new;
end;
$$;

create trigger workspaces_guard_update
  before update on public.workspaces
  for each row execute function public.guard_workspace_update();

-- Live collaboration: a change by one role shows up on the other roles' boards.
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','materials','demands','inventory','purchase_orders','evidence',
    'outcomes','work_items','commitments','agent_activity'
  ] loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;;
