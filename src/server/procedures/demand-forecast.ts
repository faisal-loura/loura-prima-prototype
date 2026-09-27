import "server-only";
import type { StepTemplate } from "./order-fulfilment";

/**
 * Prima's monthly demand forecast, as one case: seven stages, fourteen steps.
 *
 * Draft 0.1 prototype fixture. The work system analysis rates demand planning
 * "Low → Investigate", so most steps below are marked `unclear`: they are what a
 * planner would plausibly do, not what Prima has described. Every quantity is
 * fictional, and the arithmetic is ordinary software, never a model's guess.
 *
 * Two facts the walkthrough insists on, kept visible in the steps themselves:
 * nobody at Prima is named as the forecast approver, and the sales history has
 * never been described as cleaned of one-offs.
 */

const NONE: [] = [];

export const DEMAND_FORECAST_INSTRUCTIONS = `You carry one month's demand forecast for one product family through its stages.
- Each stage is prepared from the records and put to a person; you never decide a figure yourself.
- Arithmetic is done by the system. State which periods you compared and why.
- A quantity that rests on an unconfirmed commitment is shown on its own line, marked unconfirmed, and left out of the headline figure.
- Hijri-dated seasons (Ramadan, Eid) move about 11 days earlier each Gregorian year. Never compare them by calendar month without saying so.
- The forecast covers one product family. It never establishes the production plan.`;

export const DEMAND_FORECAST_STEPS: StepTemplate[] = [
  // Stage 1 — Open the cycle
  { step_no: 1, stage_no: 1, stage_name: "Open the cycle", title: "Planner opens the month's forecast for one product family", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },
  { step_no: 2, stage_no: 1, stage_name: "Open the cycle", title: "Select the records it will be built from, with their versions", owner_role: "Planning", tools: "Business Central, planning calendar", paths: NONE, confidence: "unclear" },

  // Stage 2 — Baseline
  { step_no: 3, stage_no: 2, stage_name: "Baseline", title: "Read the recent sales history for the item", owner_role: "Planning", tools: "Business Central", paths: NONE, confidence: "unclear" },
  { step_no: 4, stage_no: 2, stage_name: "Baseline", title: "Decide what in the history should not repeat, and compute the baseline", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },

  // Stage 3 — Calendar effects
  { step_no: 5, stage_no: 3, stage_name: "Calendar effects", title: "Identify holidays and seasons falling in the month", owner_role: "Planning", tools: "Planning calendar", paths: NONE, confidence: "known" },
  { step_no: 6, stage_no: 3, stage_name: "Calendar effects", title: "Confirm the adjustment and the periods it was compared against", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },

  // Stage 4 — Commercial intelligence
  { step_no: 7, stage_no: 4, stage_name: "Commercial intelligence", title: "Ask Sales what commitments are coming that the history cannot show", owner_role: "Planning", tools: "Phone, email, WhatsApp", paths: NONE, confidence: "unclear" },
  { step_no: 8, stage_no: 4, stage_name: "Commercial intelligence", title: "Sales confirms or cannot confirm; unconfirmed volume stays out of the figure", owner_role: "Sales", tools: "—", paths: NONE, confidence: "unclear" },

  // Stage 5 — Consolidate
  { step_no: 9, stage_no: 5, stage_name: "Consolidate", title: "Assemble the forecast line by line, each line traceable to a record", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },
  { step_no: 10, stage_no: 5, stage_name: "Consolidate", title: "State what is uncertain and what was not assessed", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },

  // Stage 6 — Approve for use
  { step_no: 11, stage_no: 6, stage_name: "Approve for use", title: "Review the version that will be used", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },
  { step_no: 12, stage_no: 6, stage_name: "Approve for use", title: "Approve the forecast for planning (Prima has not named an approver)", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },

  // Stage 7 — Hand off
  { step_no: 13, stage_no: 7, stage_name: "Hand off to planning", title: "Publish the approved forecast to the people who plan from it", owner_role: "Planning", tools: "—", paths: NONE, confidence: "unclear" },
  { step_no: 14, stage_no: 7, stage_name: "Hand off to planning", title: "Convert it to material requirements: forecast × BOM − stock − open POs", owner_role: "Planning", tools: "Business Central", paths: NONE, confidence: "known" },
];
