# Loura — platform prototype

A working prototype of Loura as a **platform**: people create, collaborate, and carry activities forward with
agents through one set of records and controls. It follows *Loura platform prototype — Brief 0.1* and the
prototype pack (product model, scenario flows, screen specification, build and evaluation plan) in the
Loura systems analysis pack.

It replaces the earlier material-readiness prototype. Material readiness survives as one test fixture
(journey C), not as the product's structure.

> Controlled prototype. The organization, people, proposals, deliveries, and supplier connection are fictional
> fixtures. External events come from a visible test harness. Nothing here is evidence of usability, agent
> quality, or production readiness until the evaluation plan is run.

## Running it

```bash
cp .env.example .env     # Supabase URL + publishable key, worker identity, optional Anthropic key
npm install
npm run dev              # http://localhost:3000
```

On first start the server seeds the fixtures and starts the worker. Sign in from the login page with one
of the test accounts (password `loura-prototype-2026`):

| Account | Role in the journeys |
| --- | --- |
| `sam@loura.test` — Sam Haddad | Initiator: asks, creates, starts Missions and assignments |
| `noura@loura.test` — Noura Saleh | Colleague: contributes, answers requests, comments |
| `lina@loura.test` — Lina Farouk | Reviewer, and approver of the sandbox action |
| `maya@loura.test` — Maya Idris | Creator (Studio), administrator, supervisor (Control Room), test harness |
| `omar@loura.test` — Omar Nasser | Outside the shared audience — for denied-access checks |

### Agents: real or simulated

With `ANTHROPIC_API_KEY` set, agent contributions call **Claude Opus 5** (`claude-opus-5`, adaptive thinking,
server-side refusal fallback). The model interprets and writes; a `calculate` tool does every piece of
arithmetic, and a strict submit tool returns the result.

Without a key, a deterministic **simulated** path runs so the journeys still work. Every message, run, and
test it produces is stored with `simulated = true` and labelled **Simulated agent** in the UI. It is not agent
evidence (brief §6).

## What you can do

**Journey A — investigate and create.** Home → Ask with the two proposals selected → the Analysis agent answers
in a private conversation and creates an editable comparison (SAR 12,000 difference; Clearline's support days
unknown) → edit with autosave → Share with Noura (can edit) → Noura comments. Omar gets "You can't open this".
Ask the agent to revise while you're editing: its result is kept as a proposal beside your newer version
rather than overwriting it.

**Journey B — pursue a shared outcome.** Create a Mission in Operations with Noura and Lina → add the proposals as
context and grant participants access from the source page → add three tasks (the recommendation depends on
the other two) → involve the Analysis and Drafting agents (this starts nothing) → Assign and start →
cost analysis runs while the recommendation waits → ask Noura for B's support days; she answers from Inbox
with evidence and completes her task → drafting starts → request Lina's review of version N → she requests
changes → revise → new version, new submission → accept → task Done → confirm conditions → complete Mission.

**Journey C — continue and respond to change.** Create → Agent assignment: Monitoring agent + Delivery monitoring
procedure following DEL-1042 (bottles: need 100 by 20 Sep, 80 available, 20 incoming due 19 Sep) → close the
browser → as Maya, Connections → harness → change the due date to 21 Sep → the worker reassesses (20 short) and
asks Lina to approve setting the sandbox risk flag to "At risk" → deliver the same event again (ignored as a
duplicate) → set the harness to lose the response, approve as Lina → outcome **uncertain** → Check current
record → state confirmed, cause unconfirmed, nothing re-sent → Pause (Pausing… → "Actions paused · Still
receiving updates") → inject another change (held) → Resume (reassesses; old approvals aren't replayed).

**Reuse check.** Start a second assignment with the same agent and procedure for DEL-2077 (caps: need 60,
40 available, 20 incoming). No code or screen differs; pausing one leaves the other running.

**Supporting paths.** Studio: save a new agent revision, test it, publish it (existing assignments keep their
revision; adopt it from the assignment). Connections: lose and restore observation (a gap isn't reported as
"no change"). Administration: change the action rule's approver after approval and watch dispatch get blocked
on recheck; remove a member; reset fixtures. Control Room: waits and exceptions across assignments.

## How it fits together

```
supabase/migrations/2026091614*   loura schema, RLS, helper functions (public schema untouched)
supabase/seed_test_identities.sql test accounts + Loura system identity

src/server/
  db.ts, context.ts               per-request user client (RLS) and the Loura system client (worker)
  domain/                         every state change: outputs, missions/tasks, requests, assignments,
                                  sandbox (events, dispatch, readback), knowledge (sources), admin
  worker.ts                       claims queued runs, applies pause/end/adoption at boundaries,
                                  dispatches approved actions, runs the monitoring procedure
  agent/                          Claude runtime, calculate tool, contributions + simulated fallbacks
  views/                          read models for each screen (all reads go through RLS)
  registry.ts                     the op and view names the API exposes
  seed.ts                         fixtures F-A…F-D
src/instrumentation.ts            seeds on first boot and starts the worker
src/app/api/{ops,views}/[name]    one POST per operation, one GET per view
src/lib/api.ts                    useView / useOp (TanStack Query, gentle polling)
src/app/…                         Home, Inbox, My Work, Spaces, Missions, tasks, conversations,
                                  documents, assignments, Control Room, Studio, Sources,
                                  Connections, Administration
```

### Enforcement

- **Record access is enforced by Postgres RLS** (`loura` schema): outputs by owner, grants, and Mission
  audience; sources by restriction and grants; conversations, tasks, requests, and assignments by their
  participants. A view for a record you can't read returns the same 404 as a record that doesn't exist.
- **Lifecycle and authority rules live in `src/server/domain`**: who may pause, complete, approve, or change
  rules; review and task transitions; circular dependency rejection; idempotent sends and event identity.
- **The worker is a member, not a bypass.** It signs in as `system@loura.test`; the `is_system` flag widens
  its reach through the same policies. No service-role key is used.
- **Concurrency**: runs and approved actions are claimed with conditional updates; document saves and applied
  agent revisions compare-and-set on the version number.

### Resetting

Administration → Reset prototype fixtures wipes all activity and restores the starting state for everyone.

## Not in this prototype

Commitments, Follow/Unfollow, personal planning, bulk intervention, a connector marketplace, general workflow
builders, invitations to people outside the organization, and live operational systems. The brief excludes
them; see its §4 and §7.
