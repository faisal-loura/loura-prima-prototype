-- Domain enums mirror the closed TypeScript unions in src/lib/dataset.ts.
create type public.app_role as enum ('Sales','PurchasingManager','FinanceApprover','Warehouse','Quality');
create type public.readiness_state as enum ('Ready','AtRisk','Blocked','Unknown');
create type public.confidence_level as enum ('high','medium','low','Unknown');
create type public.work_item_state as enum ('Detected','Investigating','ActionRequired','Waiting','Resolved','Verified','Closed');
create type public.work_item_type as enum ('demand','inventory','supply','approval','quality');
create type public.commitment_state as enum ('Requested','Accepted','Declined','Renegotiated','Completed','Verified');
create type public.commitment_kind as enum ('request','approval','question','review','escalation');
create type public.po_status as enum ('confirmed','unconfirmed','delayed','received','cancelled');
create type public.evidence_type as enum ('PO_status','inventory_snapshot','sales_order','quality_disposition','supplier_note','certificate','customer_email','human_confirmation');
create type public.storage_condition as enum ('ambient','chilled','frozen');
create type public.agent_action_status as enum ('planned','in-progress','done','failed');
create type public.outcome_lifecycle as enum ('Open','Closed');
create type public.demand_status as enum ('open','fulfilled','cancelled');

-- A workspace is one shared readiness board. Every operational row belongs to one.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Deterministic demo clock and id counter, mirroring Dataset.clock / Dataset.seq.
  clock timestamptz not null default now(),
  seq integer not null default 1000,
  seeded_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per authenticated user. `role` drives the §6 permission matrix.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text,
  full_name text not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_workspace_idx on public.profiles (workspace_id);

insert into public.workspaces (slug, name, clock)
values ('prima-demo', 'Prima — Material Readiness (demo)', '2026-09-16T08:00:00Z');;
