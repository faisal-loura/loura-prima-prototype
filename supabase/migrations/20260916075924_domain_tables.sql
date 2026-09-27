-- Convention: a nullable column is the SQL spelling of the TypeScript `Known<T>`
-- sentinel — NULL round-trips to the string "Unknown" in the app layer.
-- Each row carries the business id used by the engine ("wi-3", "mat-flour"), so
-- primary keys are (workspace_id, id).

create table public.materials (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  sku text not null,
  name text not null,
  uom text not null,
  unit_cost_sar numeric(12,2) not null,
  storage public.storage_condition not null,
  primary key (workspace_id, id)
);

create table public.demands (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  order_number text not null,
  customer text not null,
  channel text not null,
  format text not null,
  product text not null,
  required_date date,                    -- NULL = Sales has not established a date
  status public.demand_status not null,
  lines jsonb not null default '[]'::jsonb,   -- DemandLine[]
  evidence_id text not null,
  primary key (workspace_id, id)
);

create table public.inventory (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  material_id text not null,
  on_hand numeric,                       -- NULL = no reliable count
  quality_hold numeric not null default 0,
  expiry jsonb,                          -- { qty, date } for a lot near expiry
  evidence_id text not null,
  primary key (workspace_id, material_id)
);

create table public.purchase_orders (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  number text not null,
  supplier text not null,
  material_id text not null,
  qty numeric not null,
  expected_date date not null,
  status public.po_status not null,
  evidence_id text not null,
  primary key (workspace_id, id)
);

create table public.evidence (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  type public.evidence_type not null,
  label text not null,
  source text not null,
  occurred_at timestamptz not null,
  owner text not null,
  affected_fact text not null,
  related_work_item_ids text[] not null default '{}',
  conflicting boolean not null default false,
  note text,
  primary key (workspace_id, id)
);

-- An outcome is one customer order's readiness. Derived fields (state,
-- material_lines, recommended_next_step) are recomputed by the engine and
-- written back; rank / lifecycle / history are human state.
create table public.outcomes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  demand_source_id text not null,
  title text not null,
  required_date date,
  state public.readiness_state not null,
  lifecycle public.outcome_lifecycle not null default 'Open',
  owner_role public.app_role not null,
  rank integer not null default 0,
  last_calculated_at timestamptz not null,
  materials text[] not null default '{}',
  material_lines jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  child_work_item_ids text[] not null default '{}',
  recommended_next_step text not null default '',
  history jsonb not null default '[]'::jsonb,
  primary key (workspace_id, id)
);

create table public.work_items (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  outcome_id text not null,
  title text not null,
  whats_wrong text not null,
  type public.work_item_type not null,
  material_id text,
  state public.work_item_state not null,
  owner_role public.app_role not null,
  owner_person_id text,                  -- NULL = unassigned within the role
  required_by timestamptz not null,
  proposed_action jsonb not null,
  evidence text[] not null default '{}',
  manually_handled boolean not null default false,
  resolved_at timestamptz,
  waiver jsonb,
  history jsonb not null default '[]'::jsonb,
  primary key (workspace_id, id)
);

create table public.commitments (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  work_item_id text not null,
  kind public.commitment_kind not null,
  title text not null,
  requester text not null,               -- 'loura' or an app_role value
  performer_role public.app_role not null,
  contribution text not null,
  due_time timestamptz not null,
  state public.commitment_state not null,
  correction_target jsonb,
  response text,
  primary key (workspace_id, id)
);

create table public.agent_activity (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  outcome_id text not null,
  action text not null,
  status public.agent_action_status not null,
  occurred_at timestamptz not null,
  related_work_item_id text,
  primary key (workspace_id, id)
);

create index outcomes_workspace_state_idx on public.outcomes (workspace_id, state);
create index work_items_workspace_outcome_idx on public.work_items (workspace_id, outcome_id);
create index work_items_workspace_owner_idx on public.work_items (workspace_id, owner_role, state);
create index commitments_workspace_performer_idx on public.commitments (workspace_id, performer_role, state);
create index agent_activity_workspace_outcome_idx on public.agent_activity (workspace_id, outcome_id);;
