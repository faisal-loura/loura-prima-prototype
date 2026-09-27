-- ---------------------------------------------------------------------------
-- Cases that follow a procedure.
--
-- A case is a task. Some cases run end to end through a published procedure with
-- several stages (Prima's sales-order fulfilment is the first): one case, many
-- steps, not one task per step. The procedure revision holds the step template in
-- its config; these rows hold the state of the steps for one case.
-- ---------------------------------------------------------------------------

alter table loura.tasks
  add column if not exists procedure_revision_id uuid references loura.procedure_revisions (id),
  -- The reference the business uses for the case, e.g. the sales order number.
  add column if not exists case_ref text not null default '',
  -- Which path through the procedure applies. Null until it is decided.
  add column if not exists case_path text,
  -- Facts the case is steered by (quantities, dates, promised date).
  add column if not exists case_facts jsonb not null default '{}';

alter table loura.tasks drop constraint if exists tasks_case_path_check;
alter table loura.tasks add constraint tasks_case_path_check
  check (case_path is null or case_path in ('A', 'B', 'C'));

create table if not exists loura.case_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  task_id uuid not null references loura.tasks (id) on delete cascade,
  stage_no integer not null,
  stage_name text not null,
  step_no integer not null,
  title text not null,
  owner_role text not null default '',
  tools text not null default '',
  -- Which paths this step belongs to; a step outside the case's path is not applicable.
  paths text[] not null default '{A,B,C}',
  status text not null default 'NotStarted'
    check (status in ('NotStarted', 'InProgress', 'Done', 'Blocked', 'Skipped')),
  -- How well the organization has described this step ('known') or not ('unclear').
  confidence text not null default 'known' check (confidence in ('known', 'unclear')),
  note text not null default '',
  -- The open question or approval holding this step, when there is one.
  request_id uuid references loura.requests (id) on delete set null,
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, step_no)
);

create index if not exists case_steps_task_idx on loura.case_steps (task_id);

grant select, insert, update, delete on loura.case_steps to authenticated;
alter table loura.case_steps enable row level security;

-- A case's steps are readable and writable by whoever can see the case itself.
drop policy if exists case_steps_read on loura.case_steps;
create policy case_steps_read on loura.case_steps for select to authenticated
  using (loura.can_see_task(task_id));

drop policy if exists case_steps_insert on loura.case_steps;
create policy case_steps_insert on loura.case_steps for insert to authenticated
  with check (org_id = loura.my_org() and loura.can_see_task(task_id));

drop policy if exists case_steps_update on loura.case_steps;
create policy case_steps_update on loura.case_steps for update to authenticated
  using (loura.can_see_task(task_id)) with check (org_id = loura.my_org());

drop policy if exists case_steps_delete on loura.case_steps;
create policy case_steps_delete on loura.case_steps for delete to authenticated
  using (loura.can_see_task(task_id));
