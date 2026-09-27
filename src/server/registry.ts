import "server-only";
import type { Ctx } from "./context";
import * as outputs from "./domain/outputs";
import * as tasks from "./domain/tasks";
import * as requests from "./domain/requests";
import * as assignments from "./domain/assignments";
import * as sandbox from "./domain/sandbox";
import * as admin from "./domain/admin";
import * as knowledge from "./domain/knowledge";
import * as cases from "./domain/cases";
import * as hub from "./views/hub";
import * as work from "./views/work";
import * as ops from "./views/ops";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Op<A, R> = (ctx: Ctx, args: A) => Promise<R>;
const op = <A, R>(fn: Op<A, R>) => fn;

/**
 * Every state change goes through one of these operations. Each checks its own
 * authority and lifecycle rules; the database enforces record access underneath.
 */
export const OPS = {
  // Documents
  createOutput: op(outputs.createOutput),
  renameOutput: op(outputs.renameOutput),
  saveOutput: op(outputs.saveOutput),
  shareOutput: op(outputs.shareOutput),
  removeGrant: op(outputs.removeGrant),
  addComment: op(outputs.addComment),
  requestReview: op(outputs.requestReview),
  withdrawReview: op(outputs.withdrawReview),
  askAgentToRevise: op(outputs.askAgentToRevise),
  applyProposal: op(outputs.applyProposal),
  applyCombined: op(outputs.applyCombined),
  keepCurrentVersion: op(outputs.keepCurrentVersion),
  // Conversations
  ask: op(assignments.ask),
  // Cases (a case is a task that follows a procedure)
  openCase: op(cases.openCase),
  setCaseStep: op(cases.setCaseStep),
  setCasePath: op(cases.setCasePath),
  // Tasks
  updateTask: op(tasks.updateTask),
  completeTask: op(tasks.completeTask),
  cancelTask: op(tasks.cancelTask),
  reopenTask: op(tasks.reopenTask),
  // Requests
  createInformationRequest: op(requests.createInformationRequest),
  withdrawRequest: op(requests.withdrawRequest),
  respond: op(requests.respond),
  markUpdateRead: op(requests.markUpdateRead),
  // Agent assignments
  startOngoingAssignment: op(assignments.startOngoingAssignment),
  activateDraft: op(assignments.activateDraft),
  pauseAssignment: op(assignments.pauseAssignment),
  resumeAssignment: op(assignments.resumeAssignment),
  endAssignment: op(assignments.endAssignment),
  changeInstructions: op(assignments.changeInstructions),
  applyRevision: op(assignments.applyRevision),
  checkActionResult: op(assignments.checkActionResult),
  // Sandbox harness
  injectDeliveryDateChange: op(sandbox.injectDeliveryDateChange),
  replayEvent: op(sandbox.replayEvent),
  setObservation: op(sandbox.setObservation),
  setFailMode: op(sandbox.setFailMode),
  // Sources
  createSource: op(knowledge.createSource),
  updateSource: op(knowledge.updateSource),
  grantSourceAccess: op(knowledge.grantSourceAccess),
  revokeSourceAccess: op(knowledge.revokeSourceAccess),
  // Administration
  setMemberCapabilities: op(admin.setMemberCapabilities),
  setMembership: op(admin.setMembership),
  setActionRule: op(admin.setActionRule),
  resetFixtures: op((ctx: Ctx, args: Record<string, never>) => admin.resetFixtures(ctx, args)),
};

type Id = { id: string };

export const VIEWS = {
  shell: (ctx: Ctx) => hub.shell(ctx),
  home: (ctx: Ctx) => hub.home(ctx),
  inbox: (ctx: Ctx) => hub.inbox(ctx),
  request: (ctx: Ctx, p: Id) => hub.request(ctx, p.id),
  myWork: (ctx: Ctx) => hub.myWork(ctx),
  recents: (ctx: Ctx) => hub.recents(ctx),
  controlRoom: (ctx: Ctx) => hub.controlRoom(ctx),
  search: (ctx: Ctx, p: { q: string }) => hub.search(ctx, p.q ?? ""),
  task: (ctx: Ctx, p: Id) => work.task(ctx, p.id),
  conversation: (ctx: Ctx, p: Id) => work.conversation(ctx, p.id),
  output: (ctx: Ctx, p: Id & { version?: string }) => work.output(ctx, p.id, p.version ? Number(p.version) : undefined),
  assignment: (ctx: Ctx, p: Id) => ops.assignment(ctx, p.id),
  startOptions: (ctx: Ctx) => ops.startOptions(ctx),
  sources: (ctx: Ctx) => ops.sources(ctx),
  source: (ctx: Ctx, p: Id) => ops.source(ctx, p.id),
  caseProcedures: (ctx: Ctx) => ops.caseProcedures(ctx),
  connections: (ctx: Ctx) => ops.connections(ctx),
  connection: (ctx: Ctx, p: Id) => ops.connection(ctx, p.id),
  admin: (ctx: Ctx) => ops.admin(ctx),
};

export type OpName = keyof typeof OPS;
export type OpArgs<N extends OpName> = Parameters<(typeof OPS)[N]>[1];
export type OpResult<N extends OpName> = Awaited<ReturnType<(typeof OPS)[N]>>;
export type ViewName = keyof typeof VIEWS;
export type ViewParams<N extends ViewName> = Parameters<(typeof VIEWS)[N]> extends [Ctx, infer P] ? P : Record<string, never>;
export type ViewData<N extends ViewName> = Awaited<ReturnType<(typeof VIEWS)[N]>>;
