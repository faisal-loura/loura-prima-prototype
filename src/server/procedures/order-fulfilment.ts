import "server-only";

/**
 * Prima's sales-order fulfilment procedure: seven stages, twenty-five steps.
 *
 * The whole order is ONE case (one task). The steps below are the state inside that case —
 * they are never separate tasks. `paths` is internal bookkeeping for which steps apply when
 * the order is covered by stock (A), produced in full (B), or partly both (C). Those letters
 * decide which steps are skipped; they are never shown to anyone.
 *
 * `confidence: "unclear"` marks the steps the organization hasn't described yet. Those are the
 * steps the agent asks about instead of assuming.
 */

export type CasePath = "A" | "B" | "C";
export const CASE_PATHS: CasePath[] = ["A", "B", "C"];

export interface StepTemplate {
  step_no: number;
  stage_no: number;
  stage_name: string;
  title: string;
  owner_role: string;
  tools: string;
  paths: CasePath[];
  confidence: "known" | "unclear";
}

const ALL: CasePath[] = ["A", "B", "C"];
const MAKE: CasePath[] = ["B", "C"];

export const ORDER_FULFILMENT_STEPS: StepTemplate[] = [
  // Stage 1 — Order intake (Sales). Every order.
  { step_no: 1, stage_no: 1, stage_name: "Order intake", title: "Customer places an order", owner_role: "Sales", tools: "Phone, email, WhatsApp", paths: ALL, confidence: "unclear" },
  { step_no: 2, stage_no: 1, stage_name: "Order intake", title: "Sales order created", owner_role: "Sales admin", tools: "Business Central", paths: ALL, confidence: "unclear" },
  { step_no: 3, stage_no: 1, stage_name: "Order intake", title: "Check price, customer terms, and requested delivery date", owner_role: "Sales", tools: "Business Central", paths: ALL, confidence: "unclear" },

  // Stage 2 — Fulfilment decision (Sales + Planning). Every order.
  { step_no: 4, stage_no: 2, stage_name: "Fulfilment decision", title: "Check finished-goods stock", owner_role: "Planning", tools: "Business Central", paths: ALL, confidence: "unclear" },
  { step_no: 5, stage_no: 2, stage_name: "Fulfilment decision", title: "Decide how the order is fulfilled: from stock, produced, or both", owner_role: "Planning", tools: "—", paths: ALL, confidence: "unclear" },
  { step_no: 6, stage_no: 2, stage_name: "Fulfilment decision", title: "Reserve available stock for this sales order", owner_role: "Warehouse", tools: "Business Central", paths: ["A", "C"], confidence: "unclear" },
  { step_no: 7, stage_no: 2, stage_name: "Fulfilment decision", title: "Promise a delivery date to the customer", owner_role: "Sales", tools: "Phone, email", paths: ALL, confidence: "unclear" },

  // Stage 3 — Plan production (Planning). Paths B and C.
  { step_no: 8, stage_no: 3, stage_name: "Plan production", title: "Production order created for the quantity not in stock", owner_role: "Planning", tools: "Business Central production module", paths: MAKE, confidence: "known" },
  { step_no: 9, stage_no: 3, stage_name: "Plan production", title: "Schedule against facility capacity, other products, and shelf life", owner_role: "Production planning", tools: "Business Central + spreadsheets", paths: MAKE, confidence: "known" },
  { step_no: 10, stage_no: 3, stage_name: "Plan production", title: "Material check: does work in progress plus warehouse stock cover the recipe?", owner_role: "Planning", tools: "Business Central", paths: MAKE, confidence: "known" },

  // Stage 4 — Get missing materials (Procurement). Only on a shortage.
  { step_no: 11, stage_no: 4, stage_name: "Get missing materials", title: "Purchase order raised for the shortfall", owner_role: "Procurement", tools: "Business Central", paths: MAKE, confidence: "known" },
  { step_no: 12, stage_no: 4, stage_name: "Get missing materials", title: "Supplier follow-up: confirm, negotiate, chase, handle documents", owner_role: "Procurement", tools: "Phone, email", paths: MAKE, confidence: "known" },
  { step_no: 13, stage_no: 4, stage_name: "Get missing materials", title: "Transport, with temperature monitoring for sensitive materials", owner_role: "Logistics", tools: "—", paths: MAKE, confidence: "known" },
  { step_no: 14, stage_no: 4, stage_name: "Get missing materials", title: "Receive and inspect: temperature, weight, condition, count", owner_role: "Warehouse + Quality", tools: "—", paths: MAKE, confidence: "known" },
  { step_no: 15, stage_no: 4, stage_name: "Get missing materials", title: "Barcode, record, and assign a shelf location", owner_role: "Warehouse", tools: "Business Central", paths: MAKE, confidence: "known" },

  // Stage 5 — Produce (Production). Paths B and C.
  { step_no: 16, stage_no: 5, stage_name: "Produce", title: "Issue materials from the warehouse to production", owner_role: "Warehouse", tools: "Business Central", paths: MAKE, confidence: "known" },
  { step_no: 17, stage_no: 5, stage_name: "Produce", title: "Weigh ingredients and run the production cycle", owner_role: "Production", tools: "Weighing room", paths: MAKE, confidence: "known" },
  { step_no: 18, stage_no: 5, stage_name: "Produce", title: "Record actual output, wastage, and scrap", owner_role: "Production", tools: "Business Central", paths: MAKE, confidence: "known" },

  // Stage 6 — Finished goods (Quality + Warehouse). Paths B and C.
  { step_no: 19, stage_no: 6, stage_name: "Finished goods", title: "Quality release of the finished product", owner_role: "Quality", tools: "—", paths: MAKE, confidence: "unclear" },
  { step_no: 20, stage_no: 6, stage_name: "Finished goods", title: "Reconcile quantities, barcode, store in the warehouse", owner_role: "Warehouse", tools: "Business Central", paths: MAKE, confidence: "known" },
  { step_no: 21, stage_no: 6, stage_name: "Finished goods", title: "Allocate the newly produced goods to this sales order", owner_role: "Warehouse", tools: "Business Central", paths: MAKE, confidence: "unclear" },

  // Stage 7 — Deliver and close. Every order; all three paths meet here.
  { step_no: 22, stage_no: 7, stage_name: "Deliver and close", title: "Pick, pack, dispatch", owner_role: "Warehouse", tools: "Business Central", paths: ALL, confidence: "unclear" },
  { step_no: 23, stage_no: 7, stage_name: "Deliver and close", title: "Customer receives the goods (proof of delivery)", owner_role: "Logistics", tools: "—", paths: ALL, confidence: "unclear" },
  { step_no: 24, stage_no: 7, stage_name: "Deliver and close", title: "Invoice issued", owner_role: "Finance", tools: "Business Central", paths: ALL, confidence: "unclear" },
  { step_no: 25, stage_no: 7, stage_name: "Deliver and close", title: "Payment received, sales order closed", owner_role: "Finance", tools: "Business Central", paths: ALL, confidence: "unclear" },
];

export const ORDER_FULFILMENT_INSTRUCTIONS = `Carry one sales order from intake to payment as a single case.

The case has seven stages and twenty-five steps. Never split it into separate cases.

How the order is fulfilled follows from the finished-goods stock check:
- Covered by stock: it ships without production, and the production and procurement stages don't apply.
- Not covered: the shortfall is produced. Procurement only applies when the material check finds a shortage.
- Partly covered: the available quantity is reserved and the remainder is produced.

That is worked out from the stock records at the fulfilment check; until then, treat it as undecided and ask.

Two things matter most, because Prima has not described how they work:
- The promised delivery date. When anything has to be produced, it depends on production scheduling and on materials arriving in time. Never promise or confirm a date yourself; give the facts and ask Sales.
- A supplier delivery that slips. Planning has to reschedule and Sales has to tell the customer. When a date moves, say plainly which step is affected and who has to act.

Ask a person when a step's facts are not recorded. Ask the role that owns the step, one question at a time, and say why the answer is needed. Never invent a stock figure, a date, a price, or an approval, and never claim a step is done without a person recording it.`;

/** What a case's config holds, beside the step template. One per case kind. */
export interface CaseConfig {
  /** Which gates drive it: "order_fulfilment", "demand_forecast", … */
  kind: string;
  steps: StepTemplate[];
  /** Which member answers for each owner role. Filled in when the procedure is published. */
  role_directory: Record<string, string>;
}

/** @deprecated Use CaseConfig; kept so older imports keep compiling. */
export type OrderFulfilmentConfig = CaseConfig;
