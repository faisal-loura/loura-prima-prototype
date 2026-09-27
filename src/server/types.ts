/**
 * Row shapes for the `loura` schema. Meanings follow "3. Information model and
 * business rules"; state names follow "4. Behavior and coordination models".
 */

export type TaskStatus = "Open" | "InProgress" | "InReview" | "Done" | "Cancelled";
export type RequestType = "information" | "review" | "authorization";
export type RequestStatus = "Open" | "Resolved" | "Withdrawn" | "Superseded";
export type ResponseKind = "answer" | "dont_know" | "suggest" | "accept" | "request_changes" | "approve" | "decline";
export type SubmissionStatus = "Open" | "Accepted" | "ChangesRequested" | "Withdrawn" | "Superseded";
export type AssignmentStatus = "Draft" | "Active" | "Pausing" | "Paused" | "Ending" | "Ended";
export type RunStatus = "Queued" | "Running" | "Waiting" | "Succeeded" | "Failed" | "Stopped";
export type AttemptStatus =
  | "AwaitingAuthorization"
  | "Declined"
  | "Dispatched"
  | "Confirmed"
  | "StateConfirmed"
  | "Failed"
  | "Uncertain"
  | "Superseded"
  | "Blocked";
export type FailMode = "none" | "reject" | "lost_response" | "lost_response_no_readback";

export interface Member {
  user_id: string;
  org_id: string;
  full_name: string;
  email: string;
  title: string;
  is_admin: boolean;
  is_creator: boolean;
  is_supervisor: boolean;
  is_system: boolean;
  /** The prototype's presenting identity: reads every record in the org. */
  is_demo: boolean;
  status: "active" | "removed";
}

export interface Space {
  id: string;
  org_id: string;
  name: string;
  purpose: string;
  created_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  org_id: string;
  mission_id: string | null;
  space_id: string | null;
  title: string;
  expected_result: string;
  status: TaskStatus;
  performer_kind: "person" | "agent" | null;
  performer_id: string | null;
  agent_id: string | null;
  assignment_id: string | null;
  responsible_id: string | null;
  requires_review: boolean;
  output_id: string | null;
  review_submission_id: string | null;
  review_satisfied: boolean;
  result_note: string;
  /** Set when the task is a case that follows a published procedure. */
  procedure_revision_id: string | null;
  /** The reference the business uses, e.g. a sales order number. */
  case_ref: string;
  case_path: "A" | "B" | "C" | null;
  case_facts: Record<string, unknown>;
  case_stage: number;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type CaseStepStatus = "NotStarted" | "InProgress" | "Done" | "Blocked" | "Skipped";

/** One step inside a case. Steps are state within a single task, never tasks of their own. */
export interface CaseStep {
  id: string;
  org_id: string;
  task_id: string;
  stage_no: number;
  stage_name: string;
  step_no: number;
  title: string;
  owner_role: string;
  tools: string;
  paths: string[];
  status: CaseStepStatus;
  confidence: "known" | "unclear";
  note: string;
  request_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRef {
  source_id: string;
  title: string;
  version: number;
  observed_at?: string | null;
  kind?: string;
}

export interface Output {
  id: string;
  org_id: string;
  title: string;
  owner_id: string | null;
  mission_id: string | null;
  space_id: string | null;
  private: boolean;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface OutputVersion {
  id: string;
  output_id: string;
  version: number;
  content: string;
  author_kind: "person" | "agent";
  author_id: string | null;
  agent_id: string | null;
  run_id: string | null;
  based_on: number | null;
  note: string;
  sources: SourceRef[];
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface OutputProposal {
  id: string;
  output_id: string;
  based_on: number;
  content: string;
  instruction: string;
  run_id: string | null;
  agent_id: string | null;
  status: "Open" | "Applied" | "Kept";
  applied_version: number | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface OutputGrant {
  output_id: string;
  user_id: string;
  access: "view" | "edit";
  granted_by: string | null;
  created_at: string;
}

export interface OutputComment {
  id: string;
  output_id: string;
  version: number;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface ReviewSubmission {
  id: string;
  output_id: string;
  version: number;
  status: SubmissionStatus;
  reviewer_ids: string[];
  requested_by: string | null;
  note: string;
  replaces_id: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface Conversation {
  id: string;
  org_id: string;
  owner_id: string | null;
  mission_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  author_kind: "person" | "agent" | "system";
  author_id: string | null;
  agent_id: string | null;
  body: string;
  output_id: string | null;
  run_id: string | null;
  simulated: boolean;
  client_key: string | null;
  created_at: string;
}

export interface Source {
  id: string;
  org_id: string;
  title: string;
  kind: "document" | "record";
  origin: string;
  content: string;
  data: Record<string, unknown>;
  version: number;
  observed_at: string | null;
  restricted: boolean;
  owner_id: string | null;
  space_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  org_id: string;
  name: string;
  purpose: string;
  published_revision_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRevision {
  id: string;
  agent_id: string;
  revision: number;
  purpose: string;
  instructions: string;
  tools: string[];
  created_by: string | null;
  created_at: string;
}

export interface ProcedureConfig {
  /** The event this procedure responds to. */
  trigger: "delivery_date_changed";
  /** Field on the watched record whose change matters. */
  watched_field: string;
  /** Proposed operation when a shortfall is established. */
  on_shortfall: { operation: "set_risk_flag"; value: string } | null;
  /** When the assignment ends. */
  ending: string;
  /** Human involvement for the proposed operation (enforced by action rules, not prose). */
  human_involvement: string;
  steps: string[];
}

export interface Procedure {
  id: string;
  org_id: string;
  name: string;
  purpose: string;
  published_revision_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcedureRevision {
  id: string;
  procedure_id: string;
  revision: number;
  instructions: string;
  /** Monitoring procedures carry ProcedureConfig; a case procedure carries a step template. */
  config: ProcedureConfig;
  created_by: string | null;
  created_at: string;
}

export interface DefinitionTest {
  id: string;
  org_id: string;
  subject_kind: "agent" | "procedure";
  agent_revision_id: string | null;
  procedure_revision_id: string | null;
  fixture: string;
  input: string;
  output: string | null;
  status: "Running" | "Completed" | "Interrupted" | "Failed";
  simulated: boolean;
  allowed_tools: string[];
  effects: { kind: string; description: string; simulated: boolean }[];
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface AssignmentScope {
  /** Fixture C/D quantities, supplied by the person starting the assignment. */
  need_qty?: number;
  need_date?: string;
  item?: string;
  /** Operations this assignment may propose. Authority still comes from action rules. */
  allowed_operations?: string[];
  base_version?: number;
}

export interface Assignment {
  id: string;
  org_id: string;
  agent_id: string;
  agent_revision_id: string;
  procedure_revision_id: string | null;
  pending_agent_revision_id: string | null;
  kind: "contribution" | "ongoing";
  purpose: string;
  instructions: string;
  status: AssignmentStatus;
  condition: string;
  responsible_id: string | null;
  created_by: string | null;
  mission_id: string | null;
  task_id: string | null;
  space_id: string | null;
  conversation_id: string | null;
  output_id: string | null;
  connection_id: string | null;
  watch_record_id: string | null;
  scope: AssignmentScope;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface Run {
  id: string;
  org_id: string;
  assignment_id: string;
  status: RunStatus;
  trigger: string;
  instruction: string;
  event_id: string | null;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  summary: string;
  model: string | null;
  simulated: boolean;
  tool_calls: { name: string; input: unknown; output: unknown }[];
  usage: Record<string, unknown>;
  error: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Connection {
  id: string;
  org_id: string;
  name: string;
  description: string;
  capabilities: { reads: string[]; events: string[]; actions: string[] };
  reads_available: boolean;
  events_available: boolean;
  fail_mode: FailMode;
  gap_started_at: string | null;
  last_gap: { from: string; to: string; missed_event_ids: string[] } | null;
  last_observation_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryData {
  item: string;
  quantity: number;
  due_date: string;
  risk_flag: string;
  supplier: string;
  [key: string]: unknown;
}

export interface SandboxRecord {
  id: string;
  connection_id: string;
  external_id: string;
  kind: string;
  label: string;
  data: DeliveryData;
  version: number;
  updated_at: string;
}

export interface SourceEvent {
  id: string;
  org_id: string;
  connection_id: string;
  external_event_id: string;
  record_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
  injected: boolean;
  status: "Received" | "Matched" | "Held" | "Irrelevant" | "Duplicate";
  assignment_ids: string[];
  note: string;
}

export interface ActionRule {
  id: string;
  org_id: string;
  operation: string;
  rule: "allowed" | "approval" | "denied";
  approver_id: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ActionAttempt {
  id: string;
  org_id: string;
  assignment_id: string | null;
  run_id: string | null;
  request_id: string | null;
  connection_id: string | null;
  operation: string;
  target_record_id: string | null;
  target_label: string;
  field: string;
  current_value: string | null;
  proposed_value: string;
  reason: string;
  evidence: Record<string, unknown>;
  status: AttemptStatus;
  authority_basis: string;
  decided_by: string | null;
  decided_at: string | null;
  dispatched_at: string | null;
  idempotency_key: string;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionEvidence {
  id: string;
  attempt_id: string;
  kind: "response" | "rejection" | "timeout" | "readback" | "readback_unavailable" | "recheck";
  observed: Record<string, unknown>;
  establishes: string;
  created_by: string | null;
  created_at: string;
}

export interface Request {
  id: string;
  org_id: string;
  type: RequestType;
  status: RequestStatus;
  recipient_id: string;
  requester_kind: "person" | "agent";
  requester_id: string | null;
  agent_id: string | null;
  assignment_id: string | null;
  question: string;
  reason: string;
  context_excerpt: string;
  mission_id: string | null;
  task_id: string | null;
  output_id: string | null;
  output_version: number | null;
  review_submission_id: string | null;
  action_attempt_id: string | null;
  /** Set when this approval is a case gate: the stage it moves, and which gate it is. */
  gate_stage: number | null;
  gate_key: string | null;
  /** What the gate calculated: figures, material rows, supplier quotes. */
  gate_data: Record<string, unknown>;
  response_kind: ResponseKind | null;
  response_text: string | null;
  response_evidence_source_id: string | null;
  suggested_user_id: string | null;
  responded_by: string | null;
  responded_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Update {
  id: string;
  org_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

export interface Activity {
  id: string;
  org_id: string;
  actor_kind: "person" | "agent" | "system";
  actor_id: string | null;
  agent_id: string | null;
  verb: string;
  summary: string;
  subject_kind: string;
  subject_id: string | null;
  mission_id: string | null;
  space_id: string | null;
  assignment_id: string | null;
  run_id: string | null;
  control: boolean;
  data: Record<string, unknown>;
  created_at: string;
}
