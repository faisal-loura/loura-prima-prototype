-- Loura platform prototype (Brief 0.1). Everything lives in the `loura` schema;
-- the earlier material-readiness tables in `public` are untouched.
--
-- Record meanings follow "3. Information model and business rules". Columns are
-- prototype storage, not a prescribed production schema.

create schema if not exists loura;
grant usage on schema loura to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Organization and people
-- ---------------------------------------------------------------------------
create table loura.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table loura.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references loura.orgs (id) on delete cascade,
  full_name text not null,
  email text not null,
  title text not null default '',
  is_admin boolean not null default false,
  is_creator boolean not null default false,
  is_supervisor boolean not null default false,
  -- The worker identity that carries assignments forward between interactions.
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Spaces and Missions
-- ---------------------------------------------------------------------------
create table loura.spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  name text not null,
  purpose text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table loura.space_members (
  space_id uuid not null references loura.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table loura.missions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  space_id uuid references loura.spaces (id) on delete set null,
  title text not null,
  outcome text not null default '',
  status text not null default 'Active' check (status in ('Draft', 'Active', 'Completed', 'Cancelled')),
  responsible_id uuid references auth.users (id),
  created_by uuid references auth.users (id),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.mission_participants (
  mission_id uuid not null references loura.missions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Studio: reusable agents and procedures (saved revisions never change in place)
-- ---------------------------------------------------------------------------
create table loura.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  name text not null,
  purpose text not null default '',
  published_revision_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.agent_revisions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references loura.agents (id) on delete cascade,
  revision integer not null,
  purpose text not null default '',
  instructions text not null,
  tools text[] not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (agent_id, revision)
);

alter table loura.agents
  add constraint agents_published_revision_fk
  foreign key (published_revision_id) references loura.agent_revisions (id) on delete set null;

create table loura.procedures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  name text not null,
  purpose text not null default '',
  published_revision_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.procedure_revisions (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references loura.procedures (id) on delete cascade,
  revision integer not null,
  instructions text not null default '',
  config jsonb not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (procedure_id, revision)
);

alter table loura.procedures
  add constraint procedures_published_revision_fk
  foreign key (published_revision_id) references loura.procedure_revisions (id) on delete set null;

create table loura.definition_tests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  subject_kind text not null check (subject_kind in ('agent', 'procedure')),
  agent_revision_id uuid references loura.agent_revisions (id) on delete cascade,
  procedure_revision_id uuid references loura.procedure_revisions (id) on delete cascade,
  fixture text not null,
  input text not null default '',
  output text,
  status text not null default 'Running' check (status in ('Running', 'Completed', 'Interrupted', 'Failed')),
  simulated boolean not null default false,
  allowed_tools text[] not null default '{}',
  effects jsonb not null default '[]',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table loura.mission_agents (
  mission_id uuid not null references loura.missions (id) on delete cascade,
  agent_id uuid not null references loura.agents (id) on delete cascade,
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (mission_id, agent_id)
);

-- ---------------------------------------------------------------------------
-- Knowledge and connections
-- ---------------------------------------------------------------------------
create table loura.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  name text not null,
  description text not null default '',
  capabilities jsonb not null default '{}',
  reads_available boolean not null default true,
  events_available boolean not null default true,
  -- Sandbox behaviour for the next dispatched action.
  fail_mode text not null default 'none'
    check (fail_mode in ('none', 'reject', 'lost_response', 'lost_response_no_readback')),
  gap_started_at timestamptz,
  last_gap jsonb,
  last_observation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The sandbox application's own records. Loura reads and acts on them only
-- through the connection; it is not the authoritative system for them.
create table loura.sandbox_records (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references loura.connections (id) on delete cascade,
  external_id text not null,
  kind text not null,
  label text not null,
  data jsonb not null default '{}',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create table loura.sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  title text not null,
  kind text not null default 'document' check (kind in ('document', 'record')),
  origin text not null default '',
  content text not null default '',
  data jsonb not null default '{}',
  version integer not null default 1,
  observed_at timestamptz,
  restricted boolean not null default false,
  owner_id uuid references auth.users (id),
  space_id uuid references loura.spaces (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.source_grants (
  source_id uuid not null references loura.sources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (source_id, user_id)
);

create table loura.mission_sources (
  mission_id uuid not null references loura.missions (id) on delete cascade,
  source_id uuid not null references loura.sources (id) on delete cascade,
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (mission_id, source_id)
);

-- ---------------------------------------------------------------------------
-- Outputs, versions, sharing, review
-- ---------------------------------------------------------------------------
create table loura.outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  title text not null,
  owner_id uuid references auth.users (id),
  mission_id uuid references loura.missions (id) on delete set null,
  space_id uuid references loura.spaces (id) on delete set null,
  -- A narrower private draft inside a Mission is an explicit choice.
  private boolean not null default false,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.output_versions (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references loura.outputs (id) on delete cascade,
  version integer not null,
  content text not null default '',
  author_kind text not null check (author_kind in ('person', 'agent')),
  author_id uuid references auth.users (id),
  agent_id uuid references loura.agents (id),
  run_id uuid,
  based_on integer,
  note text not null default '',
  sources jsonb not null default '[]',
  -- Locked once reviewed or used as an agent's starting point: further edits
  -- create a new version instead of changing this one.
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (output_id, version)
);

create table loura.output_proposals (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references loura.outputs (id) on delete cascade,
  based_on integer not null,
  content text not null,
  instruction text not null default '',
  run_id uuid,
  agent_id uuid references loura.agents (id),
  status text not null default 'Open' check (status in ('Open', 'Applied', 'Kept')),
  applied_version integer,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table loura.output_grants (
  output_id uuid not null references loura.outputs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access text not null check (access in ('view', 'edit')),
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (output_id, user_id)
);

create table loura.output_comments (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references loura.outputs (id) on delete cascade,
  version integer not null,
  author_id uuid references auth.users (id),
  body text not null,
  created_at timestamptz not null default now()
);

create table loura.review_submissions (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references loura.outputs (id) on delete cascade,
  version integer not null,
  status text not null default 'Open'
    check (status in ('Open', 'Accepted', 'ChangesRequested', 'Withdrawn', 'Superseded')),
  reviewer_ids uuid[] not null,
  requested_by uuid references auth.users (id),
  note text not null default '',
  replaces_id uuid references loura.review_submissions (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Tasks and dependencies
-- ---------------------------------------------------------------------------
create table loura.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  mission_id uuid references loura.missions (id) on delete cascade,
  space_id uuid references loura.spaces (id) on delete set null,
  title text not null,
  expected_result text not null default '',
  status text not null default 'Open' check (status in ('Open', 'InProgress', 'InReview', 'Done', 'Cancelled')),
  performer_kind text check (performer_kind in ('person', 'agent')),
  performer_id uuid references auth.users (id),
  agent_id uuid references loura.agents (id),
  assignment_id uuid,
  responsible_id uuid references auth.users (id),
  requires_review boolean not null default false,
  output_id uuid references loura.outputs (id) on delete set null,
  review_submission_id uuid references loura.review_submissions (id) on delete set null,
  review_satisfied boolean not null default false,
  result_note text not null default '',
  position integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table loura.task_dependencies (
  task_id uuid not null references loura.tasks (id) on delete cascade,
  depends_on_id uuid not null references loura.tasks (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create table loura.mission_conditions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references loura.missions (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('task_done', 'manual')),
  task_id uuid references loura.tasks (id) on delete set null,
  satisfied boolean not null default false,
  satisfied_by uuid references auth.users (id),
  satisfied_at timestamptz,
  position integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table loura.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  owner_id uuid references auth.users (id),
  mission_id uuid references loura.missions (id) on delete cascade,
  title text not null default 'Conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.conversation_sources (
  conversation_id uuid not null references loura.conversations (id) on delete cascade,
  source_id uuid not null references loura.sources (id) on delete cascade,
  primary key (conversation_id, source_id)
);

create table loura.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references loura.conversations (id) on delete cascade,
  author_kind text not null check (author_kind in ('person', 'agent', 'system')),
  author_id uuid references auth.users (id),
  agent_id uuid references loura.agents (id),
  body text not null,
  output_id uuid references loura.outputs (id) on delete set null,
  run_id uuid,
  simulated boolean not null default false,
  -- Idempotency for a retried send: the client's attempt key.
  client_key text,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_key)
);

-- ---------------------------------------------------------------------------
-- Agent assignments and runs
-- ---------------------------------------------------------------------------
create table loura.assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  agent_id uuid not null references loura.agents (id),
  agent_revision_id uuid not null references loura.agent_revisions (id),
  procedure_revision_id uuid references loura.procedure_revisions (id),
  pending_agent_revision_id uuid references loura.agent_revisions (id),
  kind text not null check (kind in ('contribution', 'ongoing')),
  purpose text not null,
  instructions text not null default '',
  status text not null default 'Active'
    check (status in ('Draft', 'Active', 'Pausing', 'Paused', 'Ending', 'Ended')),
  condition text not null default '',
  responsible_id uuid references auth.users (id),
  created_by uuid references auth.users (id),
  mission_id uuid references loura.missions (id) on delete set null,
  task_id uuid references loura.tasks (id) on delete set null,
  space_id uuid references loura.spaces (id) on delete set null,
  conversation_id uuid references loura.conversations (id) on delete set null,
  output_id uuid references loura.outputs (id) on delete set null,
  connection_id uuid references loura.connections (id),
  watch_record_id uuid references loura.sandbox_records (id),
  scope jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table loura.tasks
  add constraint tasks_assignment_fk foreign key (assignment_id) references loura.assignments (id) on delete set null;

create table loura.assignment_sources (
  assignment_id uuid not null references loura.assignments (id) on delete cascade,
  source_id uuid not null references loura.sources (id) on delete cascade,
  primary key (assignment_id, source_id)
);

create table loura.runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  assignment_id uuid not null references loura.assignments (id) on delete cascade,
  status text not null default 'Queued'
    check (status in ('Queued', 'Running', 'Waiting', 'Succeeded', 'Failed', 'Stopped')),
  trigger text not null,
  instruction text not null default '',
  event_id uuid,
  inputs jsonb not null default '{}',
  result jsonb not null default '{}',
  summary text not null default '',
  model text,
  simulated boolean not null default false,
  tool_calls jsonb not null default '[]',
  usage jsonb not null default '{}',
  error text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table loura.source_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  connection_id uuid not null references loura.connections (id) on delete cascade,
  external_event_id text not null,
  record_id uuid references loura.sandbox_records (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  injected boolean not null default true,
  status text not null default 'Received'
    check (status in ('Received', 'Matched', 'Held', 'Irrelevant', 'Duplicate')),
  assignment_ids uuid[] not null default '{}',
  note text not null default '',
  unique (connection_id, external_event_id)
);

create table loura.action_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  operation text not null,
  rule text not null check (rule in ('allowed', 'approval', 'denied')),
  approver_id uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (org_id, operation)
);

create table loura.action_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  assignment_id uuid references loura.assignments (id) on delete set null,
  run_id uuid references loura.runs (id) on delete set null,
  request_id uuid,
  connection_id uuid references loura.connections (id),
  operation text not null,
  target_record_id uuid references loura.sandbox_records (id),
  target_label text not null,
  field text not null,
  current_value text,
  proposed_value text not null,
  reason text not null default '',
  evidence jsonb not null default '{}',
  status text not null default 'AwaitingAuthorization'
    check (status in ('AwaitingAuthorization', 'Declined', 'Dispatched', 'Confirmed', 'StateConfirmed',
                      'Failed', 'Uncertain', 'Superseded', 'Blocked')),
  authority_basis text not null default '',
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  dispatched_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loura.action_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references loura.action_attempts (id) on delete cascade,
  kind text not null check (kind in ('response', 'rejection', 'timeout', 'readback', 'readback_unavailable', 'recheck')),
  observed jsonb not null default '{}',
  establishes text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Requests and informational updates
-- ---------------------------------------------------------------------------
create table loura.requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  type text not null check (type in ('information', 'review', 'authorization')),
  status text not null default 'Open' check (status in ('Open', 'Resolved', 'Withdrawn', 'Superseded')),
  recipient_id uuid not null references auth.users (id),
  requester_kind text not null default 'person' check (requester_kind in ('person', 'agent')),
  requester_id uuid references auth.users (id),
  agent_id uuid references loura.agents (id),
  assignment_id uuid references loura.assignments (id) on delete set null,
  question text not null,
  reason text not null default '',
  context_excerpt text not null default '',
  mission_id uuid references loura.missions (id) on delete set null,
  task_id uuid references loura.tasks (id) on delete set null,
  output_id uuid references loura.outputs (id) on delete set null,
  output_version integer,
  review_submission_id uuid references loura.review_submissions (id) on delete set null,
  action_attempt_id uuid references loura.action_attempts (id) on delete set null,
  response_kind text check (response_kind in
    ('answer', 'dont_know', 'suggest', 'accept', 'request_changes', 'approve', 'decline')),
  response_text text,
  response_evidence_source_id uuid references loura.sources (id) on delete set null,
  suggested_user_id uuid references auth.users (id),
  responded_by uuid references auth.users (id),
  responded_at timestamptz,
  superseded_by uuid references loura.requests (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loura.action_attempts
  add constraint action_attempts_request_fk foreign key (request_id) references loura.requests (id) on delete set null;

create table loura.updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Attributable history of meaningful changes, decisions, and results.
create table loura.activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references loura.orgs (id) on delete cascade,
  actor_kind text not null check (actor_kind in ('person', 'agent', 'system')),
  actor_id uuid references auth.users (id),
  agent_id uuid references loura.agents (id),
  verb text not null,
  summary text not null,
  subject_kind text not null,
  subject_id uuid,
  mission_id uuid references loura.missions (id) on delete set null,
  space_id uuid references loura.spaces (id) on delete set null,
  assignment_id uuid references loura.assignments (id) on delete set null,
  run_id uuid references loura.runs (id) on delete set null,
  control boolean not null default false,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes on the hot foreign keys
-- ---------------------------------------------------------------------------
create index on loura.members (org_id);
create index on loura.missions (org_id);
create index on loura.missions (space_id);
create index on loura.tasks (mission_id);
create index on loura.tasks (performer_id);
create index on loura.outputs (mission_id);
create index on loura.outputs (owner_id);
create index on loura.output_versions (output_id);
create index on loura.output_proposals (output_id);
create index on loura.output_comments (output_id);
create index on loura.review_submissions (output_id);
create index on loura.messages (conversation_id);
create index on loura.conversations (owner_id);
create index on loura.assignments (responsible_id);
create index on loura.assignments (mission_id);
create index on loura.assignments (watch_record_id);
create index on loura.runs (assignment_id);
create index on loura.runs (status);
create index on loura.requests (recipient_id);
create index on loura.requests (mission_id);
create index on loura.requests (task_id);
create index on loura.requests (output_id);
create index on loura.updates (user_id);
create index on loura.activity (org_id, created_at desc);
create index on loura.activity (mission_id);
create index on loura.activity (assignment_id);
create index on loura.source_events (record_id);
create index on loura.action_attempts (assignment_id);
