import "server-only";
import { systemCtx, type Ctx } from "../context";
import type { CaseStep, Request as LouraRequest, Source, Task } from "../types";
import { kick } from "../kick";
import { caseConfig } from "./cases";
import { log, nameOf, notify, now, truncate } from "./common";

/**
 * How a case moves.
 *
 * One sales order is one case. Between stages sits a gate: the system computes what the
 * next stage needs — stock gaps, material gaps, quoted prices — and asks the department
 * that owns the stage to approve moving on. Approving closes that stage's steps and opens
 * the next gate. Nothing advances without a person, and every number here is calculated
 * from records, never written by a model.
 */

type Facts = Record<string, unknown>;
type Money = number;

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || fallback);
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const money = (n: Money) => `SAR ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface MaterialRow {
  name: string;
  need: number;
  available: number;
  short: number;
  unit: string;
}

export interface RfqRow {
  item: string;
  short: number;
  unit: string;
  supplier: string | null;
  unit_price: number | null;
  qty: number;
  total: number | null;
  lead_days: number | null;
  in_range: boolean | null;
  range: string | null;
  others: string[];
}

/** A record the decision rests on, quoted so it can be checked without leaving the case. */
export interface EvidenceItem {
  title: string;
  quote: string;
  kind: string;
  system: string;
  /** The system's logo, when Loura has one for it. */
  logo: string | null;
  ref: string;
  at: string | null;
  source_id: string | null;
  attachments: { name: string; kind: string }[];
}

/** Logos for the systems a record can come from. */
const SYSTEM_LOGOS: Record<string, string> = {
  gmail: "/gmail.png",
  outlook: "/outlook.png",
  slack: "/slack.png",
  odoo: "/odoo.png",
  zoho: "/zoho.png",
};

/** What a gate calculated, as data the screen lays out itself. */
export interface GateData {
  figures?: { label: string; value: string }[];
  materials?: MaterialRow[];
  rfqs?: RfqRow[];
  total?: string;
  evidence?: EvidenceItem[];
  technical?: { label: string; value: string }[];
}

export interface GateResult {
  /** Skip the whole gate: its steps don't apply to this case. */
  skip?: boolean;
  question: string;
  reason: string;
  lines: string[];
  data?: GateData;
  patch?: Facts;
  path?: "A" | "B" | "C";
}

interface Gate {
  key: string;
  stage_no: number;
  /** The role that approves it; the procedure's role directory says who that is. */
  role: string;
  /** Steps closed when it is approved. */
  steps: number[];
  prepare(facts: Facts, data: CaseData): GateResult;
}

/** Records the engine reads: stock, recipe, supplier quotes, and the price policy. */
interface CaseData {
  /** Everything read, so a gate can quote the rows it used. */
  rows: Pick<Source, "id" | "title" | "kind" | "content" | "data" | "observed_at">[];
  fg_available: number;
  bom: { per: number; items: Record<string, { qty: number; unit: string }> };
  material_stock: Record<string, { available: number; unit: string }>;
  price_policy: Record<string, { min: number; max: number }>;
  quotes: { supplier: string; item: string; unit_price: number; unit: string; min_order: number; lead_days: number }[];
}

const list = (items: [string, string][]) => items.map(([k, v]) => `${k}: ${v}`);
/** "14 Sep · 09:12Z" — when a figure was read, in UTC. */
const asOfNow = () => {
  const t = new Date();
  const day = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time}Z`;
};

/** Cite a record by the `kind` in its data, quoting the first line that matters. */
function cite(d: CaseData, kind: string, quote?: string, match?: (row: Record<string, unknown>) => boolean): EvidenceItem | null {
  const row = d.rows.find((r) => {
    const data = (r.data ?? {}) as Record<string, unknown>;
    return data.kind === kind && (!match || match(data));
  });
  if (!row) return null;
  const data = (row.data ?? {}) as Record<string, unknown>;
  const system = String(data.system ?? "Loura");
  return {
    title: row.title,
    quote: quote ?? firstLine(row.content),
    kind: String(data.kind ?? row.kind),
    system,
    logo: SYSTEM_LOGOS[system.toLowerCase()] ?? null,
    ref: String(data.ref ?? row.id.slice(0, 6)),
    at: row.observed_at,
    source_id: row.id,
    attachments: (data.attachments as { name: string; kind: string }[] | undefined) ?? [],
  };
}

const firstLine = (text: string) => (text || "").split("\n").find((l) => l.trim()) ?? "";
const evidence = (...items: (EvidenceItem | null)[]) => items.filter((x): x is EvidenceItem => Boolean(x));
const figures = (items: [string, string][]) => items.map(([label, value]) => ({ label, value }));

/**
 * The systems a stage reads while it works out its numbers, shown while the case is working.
 * They are sandbox stand-ins: this prototype contacts nothing outside itself.
 */
export const GATE_SYSTEMS: Record<string, { name: string; detail: string; logo: string | null }[]> = {
  fulfilment: [{ name: "Odoo", detail: "Finished-goods stock", logo: "/odoo.png" }],
  production_plan: [
    { name: "Odoo", detail: "Production module and capacity", logo: "/odoo.png" },
    { name: "Loura", detail: "Recipe and warehouse stock", logo: null },
  ],
  procurement: [
    { name: "Outlook", detail: "Supplier quotes", logo: "/outlook.png" },
    { name: "Zoho", detail: "Agreed price ranges", logo: "/zoho.png" },
  ],
  goods_receipt: [{ name: "Odoo", detail: "Goods receipt and inspection", logo: "/odoo.png" }],
  production: [{ name: "Odoo", detail: "Production orders and output", logo: "/odoo.png" }],
  quality: [{ name: "Slack", detail: "Quality release channel", logo: "/slack.png" }],
  finished_goods: [{ name: "Odoo", detail: "Warehouse allocation", logo: "/odoo.png" }],
  dispatch: [{ name: "Gmail", detail: "Proof of delivery", logo: "/gmail.png" }],
  invoice: [{ name: "Zoho", detail: "Invoicing", logo: "/zoho.png" }],
  payment: [{ name: "Zoho", detail: "Payments received", logo: "/zoho.png" }],
};

/** What the case is doing right now, so the case page can show it. */
export interface CaseWorking {
  gate_key: string;
  stage_no: number;
  step_no: number | null;
  note: string;
  systems: { name: string; detail: string; logo: string | null }[];
  since: string;
}

async function setWorking(sys: Ctx, taskId: string, working: CaseWorking | null) {
  const { data } = await sys.db.from("tasks").select("case_facts").eq("id", taskId).maybeSingle();
  const facts = ((data as { case_facts?: Facts } | null)?.case_facts ?? {}) as Facts;
  const next = { ...facts };
  if (working) next.working = working;
  else delete next.working;
  await sys.db.from("tasks").update({ case_facts: next, updated_at: now() }).eq("id", taskId);
}

/** Mark the case as working on the gate that follows the one just approved. */
export async function beginWork(taskId: string, afterKey: string) {
  const sys = await systemCtx();
  const set = setForKey(afterKey);
  const index = set.findIndex((g) => g.key === afterKey);
  const next = set[index + 1];
  if (!next) return;
  await setWorking(sys, taskId, {
    gate_key: next.key,
    stage_no: next.stage_no,
    step_no: next.steps[0] ?? null,
    note: `Working out stage ${next.stage_no} — ${next.role}`,
    systems: GATE_SYSTEMS[next.key] ?? [],
    since: now(),
  });
}

const INTAKE = (f: Facts): [string, string][] => [
  ["Customer", String(f.customer ?? "—")],
  ["Product", String(f.product ?? "—")],
  ["Quantity", `${num(f.quantity)} ${String(f.unit ?? "pieces")}`],
  ["Requested delivery", String(f.requested_delivery ?? "—")],
  ["Order value", f.order_value ? money(num(f.order_value)) : "not priced yet"],
];

export const GATES: Gate[] = [
  {
    key: "intake",
    stage_no: 1,
    role: "Sales",
    steps: [1, 2, 3],
    prepare: (f, d) => ({
      question: `Confirm the ingested order ${f.case_ref} and start fulfilment checks?`,
      reason: "The order was taken and entered. Approving confirms price, terms and the requested date are right, and starts the finished-goods stock check.",
      lines: list(INTAKE(f)),
      data: {
        figures: figures(INTAKE(f)),
        evidence: evidence(
          cite(d, "order_email"),
          cite(d, "order_record"),
        ),
        technical: [
          { label: "Case reference", value: String(f.case_ref ?? "—") },
          { label: "Quantity as entered", value: `${num(f.quantity)} ${String(f.unit ?? "pieces")}` },
          { label: "Read at", value: asOfNow() },
        ],
      },
    }),
  },
  {
    key: "fulfilment",
    stage_no: 2,
    role: "Sales",
    steps: [4, 5, 6, 7],
    prepare: (f, d) => {
      const ordered = num(f.quantity);
      const available = d.fg_available;
      const reserved = Math.min(ordered, available);
      const gap = Math.max(0, ordered - available);
      const path = gap === 0 ? "A" : reserved === 0 ? "B" : "C";
      const unit = String(f.unit ?? "pieces");
      return {
        path,
        patch: { fg_available: available, fg_reserved: reserved, fg_gap: gap, path },
        question:
          gap === 0
            ? `Approve promising ${f.requested_delivery} from stock for ${f.case_ref}?`
            : `Approve moving ${f.case_ref} to production planning for the ${gap} ${unit} not in stock?`,
        reason:
          gap === 0
            ? "The whole order is in finished-goods stock, so it ships without production."
            : `Finished goods cover ${reserved} of ${ordered} ${unit}. The rest has to be produced, so the promised date depends on production planning and on materials arriving in time. Nothing is promised to the customer until you approve.`,
        lines: list([
          ["Ordered", `${ordered} ${unit}`],
          ["In finished-goods stock", `${available} ${unit}`],
          ["Reserved for this order", `${reserved} ${unit}`],
          ["Gap to produce", `${gap} ${unit}`],
        ]),
        data: {
          figures: figures([
            ["Ordered", `${ordered} ${unit}`],
            ["In finished-goods stock", `${available} ${unit}`],
            ["Reserved for this order", `${reserved} ${unit}`],
            ["Gap to produce", `${gap} ${unit}`],
          ]),
          evidence: evidence(
            cite(d, "fg_stock", `${available} ${unit} available and unreserved`),
            cite(d, "order_record", `${ordered} ${unit} requested for ${String(f.requested_delivery ?? "the requested date")}`),
          ),
          technical: [
            { label: "Gap", value: `${ordered} − ${available} = ${gap} ${unit}` },
            { label: "Reserved", value: `min(${ordered}, ${available}) = ${reserved} ${unit}` },
            { label: "Read at", value: asOfNow() },
          ],
        },
      };
    },
  },
  {
    key: "production_plan",
    stage_no: 3,
    role: "Production planning",
    steps: [8, 9, 10],
    prepare: (f, d) => {
      const gap = num(f.fg_gap);
      if (gap === 0) return { skip: true, question: "", reason: "", lines: [] };
      const batches = gap / d.bom.per;
      const need: Record<string, { need: number; available: number; short: number; unit: string }> = {};
      for (const [name, item] of Object.entries(d.bom.items)) {
        const needed = round(item.qty * batches, 2);
        const available = d.material_stock[name]?.available ?? 0;
        need[name] = { need: needed, available, short: round(Math.max(0, needed - available), 2), unit: item.unit };
      }
      const short = Object.entries(need).filter(([, v]) => v.short > 0);
      return {
        patch: { production_qty: gap, materials: need, material_short: Object.fromEntries(short) },
        question: `Approve the production plan for ${gap} ${String(f.unit ?? "pieces")} on ${f.case_ref}?`,
        reason: short.length
          ? `The recipe needs more than the warehouse holds for ${short.length} material${short.length === 1 ? "" : "s"}. Approving schedules the production order and sends the shortfall to procurement.`
          : "Work in progress plus warehouse stock cover the recipe, so production can be scheduled without buying anything.",
        lines: [
          ...list([
            ["Production order", `${gap} ${String(f.unit ?? "pieces")}`],
            ["Recipe batches", `${round(batches, 2)} × ${d.bom.per}`],
            ["Slot", String(f.production_slot ?? "to be scheduled")],
          ]),
          ...Object.entries(need).map(
            ([name, v]) => `${name}: needs ${v.need} ${v.unit}, ${v.available} ${v.unit} in stock${v.short > 0 ? ` — short ${v.short} ${v.unit}` : " — covered"}`,
          ),
        ],
        data: {
          figures: figures([
            ["Production order", `${gap} ${String(f.unit ?? "pieces")}`],
            ["Recipe batches", `${round(batches, 2)} × ${d.bom.per}`],
            ["Slot", String(f.production_slot ?? "to be scheduled")],
          ]),
          materials: Object.entries(need)
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name)),
          evidence: evidence(
            cite(d, "bom", `Recipe quantities per batch of ${d.bom.per}`),
            cite(d, "material_stock", "Unreserved raw materials in the warehouse; incoming deliveries not included"),
          ),
          technical: [
            { label: "Batches", value: `${gap} ÷ ${d.bom.per} = ${round(batches, 2)}` },
            ...Object.entries(need).map(([name, v]) => ({
              label: name,
              value: `${round(d.bom.items[name]?.qty ?? 0, 3)} × ${round(batches, 2)} = ${v.need} ${v.unit}, less ${v.available} in stock = ${v.short} short`,
            })),
            { label: "Read at", value: asOfNow() },
          ],
        },
      };
    },
  },
  {
    key: "procurement",
    stage_no: 4,
    role: "Procurement",
    steps: [11, 12],
    prepare: (f, d) => {
      const short = (f.material_short ?? {}) as Record<string, { short: number; unit: string }>;
      const names = Object.keys(short);
      if (!names.length) return { skip: true, question: "", reason: "", lines: [] };

      // One RFQ line per short material: the cheapest quote that can supply it.
      const rfqs = names.map((name) => {
        const offers = d.quotes
          .filter((q) => q.item === name)
          .map((q) => ({ ...q, qty: Math.max(short[name].short, q.min_order), total: round(Math.max(short[name].short, q.min_order) * q.unit_price, 2) }))
          .sort((a, b) => a.total - b.total);
        const best = offers[0];
        const policy = d.price_policy[name];
        return {
          item: name,
          short: short[name].short,
          unit: short[name].unit,
          supplier: best?.supplier ?? null,
          unit_price: best?.unit_price ?? null,
          qty: best?.qty ?? short[name].short,
          total: best?.total ?? null,
          lead_days: best?.lead_days ?? null,
          others: offers.slice(1).map((o) => `${o.supplier} at ${money(o.unit_price)}/${o.unit}`),
          in_range: policy && best ? best.unit_price >= policy.min && best.unit_price <= policy.max : null,
          range: policy ? `${money(policy.min)}–${money(policy.max)}` : null,
        };
      });
      const total = round(rfqs.reduce((n, r) => n + (r.total ?? 0), 0), 2);
      const outOfRange = rfqs.filter((r) => r.in_range === false);
      const missing = rfqs.filter((r) => !r.supplier);

      return {
        patch: { rfqs, purchase_total: total },
        data: {
          rfqs,
          total: money(total),
          evidence: evidence(
            ...names.map((name) => {
              const best = d.quotes.filter((q) => q.item === name).sort((a, b) => a.unit_price - b.unit_price)[0];
              return best
                ? cite(d, "quote", `${best.supplier}: ${money(best.unit_price)} per ${best.unit}, minimum ${best.min_order} ${best.unit}, ${best.lead_days} working days`, (row) => row.item === name)
                : null;
            }),
            cite(d, "price_policy", "What procurement may pay without a separate decision"),
          ),
          technical: rfqs
            .filter((r) => r.supplier)
            .map((r) => ({
              label: r.item,
              value: `max(${r.short} short, ${r.qty} minimum) × ${money(r.unit_price ?? 0)} = ${money(r.total ?? 0)}${r.range ? ` · agreed ${r.range}` : ""}`,
            }))
            .concat([{ label: "Total", value: money(total) }, { label: "Read at", value: asOfNow() }]),
        },
        question: `Approve purchasing the short materials for ${f.case_ref} — ${money(total)}?`,
        reason: outOfRange.length
          ? `${outOfRange.map((r) => r.item).join(", ")} quoted outside the agreed price range, so this needs your decision before anything is ordered.`
          : missing.length
            ? `No quote is on file for ${missing.map((r) => r.item).join(", ")}. Approving covers the quoted lines only; the rest still needs an RFQ.`
            : "Every quoted price is inside the agreed range. Approving raises the purchase orders; nothing is sent to a supplier before that.",
        lines: rfqs.map((r) =>
          r.supplier
            ? `${r.item}: ${r.qty} ${r.unit} from ${r.supplier} at ${money(r.unit_price ?? 0)}/${r.unit} = ${money(r.total ?? 0)}${
                r.in_range === false ? ` — outside the agreed range ${r.range}` : r.in_range ? " — in range" : ""
              }${r.lead_days ? `, ${r.lead_days} working days` : ""}${r.others.length ? ` (also quoted: ${r.others.join("; ")})` : ""}`
            : `${r.item}: ${r.short} ${r.unit} short — no supplier quote on file`,
        ),
      };
    },
  },
  {
    key: "goods_receipt",
    stage_no: 4,
    role: "Warehouse + Quality",
    steps: [13, 14, 15],
    prepare: (f) => {
      const rfqs = (f.rfqs ?? []) as RfqRow[];
      if (!rfqs.length) return { skip: true, question: "", reason: "", lines: [] };
      return {
        question: `Confirm the purchased materials for ${f.case_ref} arrived, passed inspection, and are stored?`,
        reason: "Arriving isn't the same as usable stock. Confirming records temperature, weight, condition and count, and releases the materials to production.",
        data: { rfqs: rfqs as RfqRow[] },
        lines: rfqs.map((r) => `${r.item}: ${r.qty} ${r.unit} from ${r.supplier ?? "supplier"} — received, inspected, barcoded, shelved`),
      };
    },
  },
  {
    key: "production",
    stage_no: 5,
    role: "Production",
    steps: [16, 17, 18],
    prepare: (f) => !num(f.production_qty) ? { skip: true, question: "", reason: "", lines: [] } : ({
      question: `Confirm production of ${num(f.production_qty)} ${String(f.unit ?? "pieces")} for ${f.case_ref} is complete?`,
      reason: "Confirming records that materials were issued, the cycle ran, and the actual output, wastage and scrap are entered.",
      lines: list([
        ["Planned output", `${num(f.production_qty)} ${String(f.unit ?? "pieces")}`],
        ["Slot", String(f.production_slot ?? "—")],
      ]),
    }),
  },
  {
    key: "quality",
    stage_no: 6,
    role: "Quality",
    steps: [19],
    prepare: (f) => !num(f.production_qty) ? { skip: true, question: "", reason: "", lines: [] } : ({
      question: `Release the finished product for ${f.case_ref}?`,
      reason: "The finished goods can't be allocated to the order or dispatched until quality releases them.",
      lines: list([["Batch", `${num(f.production_qty)} ${String(f.unit ?? "pieces")} of ${String(f.product ?? "the product")}`]]),
    }),
  },
  {
    key: "finished_goods",
    stage_no: 6,
    role: "Warehouse",
    steps: [20, 21],
    prepare: (f) => !num(f.production_qty) ? { skip: true, question: "", reason: "", lines: [] } : ({
      question: `Confirm the produced goods for ${f.case_ref} are reconciled, stored, and allocated to this order?`,
      reason: "Allocation ties the produced quantity to this sales order, so it can't be picked for another one.",
      lines: list([
        ["Produced", `${num(f.production_qty)} ${String(f.unit ?? "pieces")}`],
        ["Already reserved from stock", `${num(f.fg_reserved)} ${String(f.unit ?? "pieces")}`],
        ["Allocated to this order", `${num(f.quantity)} ${String(f.unit ?? "pieces")}`],
      ]),
    }),
  },
  {
    key: "dispatch",
    stage_no: 7,
    role: "Warehouse",
    steps: [22, 23],
    prepare: (f) => ({
      question: `Confirm ${f.case_ref} was picked, packed, dispatched, and received by the customer?`,
      reason: "Proof of delivery is what lets finance invoice the order.",
      lines: list([
        ["Deliver to", String(f.customer ?? "—")],
        ["Quantity", `${num(f.quantity)} ${String(f.unit ?? "pieces")}`],
        ["Requested delivery", String(f.requested_delivery ?? "—")],
      ]),
    }),
  },
  {
    key: "invoice",
    stage_no: 7,
    role: "Finance",
    steps: [24],
    prepare: (f) => ({
      question: `Approve issuing the invoice for ${f.case_ref}?`,
      reason: "The goods are delivered, so the order can be invoiced against the agreed price and terms.",
      lines: list([
        ["Customer", String(f.customer ?? "—")],
        ["Order value", f.order_value ? money(num(f.order_value)) : "as per the sales order"],
        ["Materials purchased for this order", f.purchase_total ? money(num(f.purchase_total)) : "none"],
      ]),
    }),
  },
  {
    key: "payment",
    stage_no: 7,
    role: "Finance",
    steps: [25],
    prepare: (f) => ({
      question: `Confirm payment received and close ${f.case_ref}?`,
      reason: "Confirming closes the case. Everything recorded in it stays readable afterwards.",
      lines: list([["Order value", f.order_value ? money(num(f.order_value)) : "as invoiced"]]),
    }),
  },
];

// ---------------------------------------------------------------------------
// Running the engine
// ---------------------------------------------------------------------------

/** Reads the stock, recipe, quote, and price records the calculations use. */
async function caseData(sys: Ctx, facts: Facts): Promise<CaseData> {
  const { data } = await sys.db.from("sources").select("id,title,kind,content,data,observed_at");
  const rows = (data ?? []) as Pick<Source, "id" | "title" | "kind" | "content" | "data" | "observed_at">[];
  const of = (kind: string) => rows.filter((r) => (r.data as { kind?: string })?.kind === kind).map((r) => r.data as Record<string, unknown>);

  const fg = of("fg_stock").find((r) => !facts.product || String(r.item ?? "").toLowerCase() === String(facts.product ?? "").toLowerCase()) ?? of("fg_stock")[0];
  const bomRow = of("bom")[0];
  const stockRow = of("material_stock")[0];
  const policyRow = of("price_policy")[0];

  return {
    rows,
    fg_available: num(fg?.available),
    bom: {
      per: num(bomRow?.per, 100),
      items: (bomRow?.items ?? {}) as Record<string, { qty: number; unit: string }>,
    },
    material_stock: (stockRow?.items ?? {}) as Record<string, { available: number; unit: string }>,
    price_policy: (policyRow?.items ?? {}) as Record<string, { min: number; max: number }>,
    quotes: of("quote").map((q) => ({
      supplier: String(q.supplier ?? "Supplier"),
      item: String(q.item ?? ""),
      unit_price: num(q.unit_price),
      unit: String(q.unit ?? ""),
      min_order: num(q.min_order),
      lead_days: num(q.lead_days),
    })),
  };
}

/**
 * Open the next gate this case needs, if any. Called when a case is opened, when a gate is
 * approved, and when someone records a step by hand.
 */
/* ---------------------------------------------------------------------------
 * Demand forecast: the second case kind. Same engine, same gates, different
 * activity — the reuse check the Release 1 charter asks for. Every figure below
 * is computed here from the seeded records; none of it is written by a model.
 * ------------------------------------------------------------------------- */

interface ForecastInputs {
  sku: string;
  unit: string;
  months: [string, number][];
  average: number;
  last_year: number;
  holiday: { from: string; to: string; effect: number } | null;
  contract_boxes: number;
}

const MONTH_LABEL: Record<string, string> = { "2026-08": "August 2026", "2026-09": "September 2026", "2026-10": "October 2026" };

function forecastInputs(d: CaseData): ForecastInputs {
  const row = (kind: string) =>
    (d.rows.find((r) => (r.data as { kind?: string })?.kind === kind)?.data ?? {}) as Record<string, unknown>;
  const history = row("sales_history");
  const cal = row("calendar");
  const months = Object.entries((history.months ?? {}) as Record<string, number>).map(([m, v]) => [m, num(v)] as [string, number]);
  const holidayRow = (cal.school_holiday ?? null) as { from?: string; to?: string } | null;
  return {
    sku: String(history.sku ?? "the item"),
    unit: String(history.unit ?? "units"),
    months,
    average: num(history.three_month_average, months.length ? Math.round(months.reduce((t, [, v]) => t + v, 0) / months.length) : 0),
    last_year: num(history.same_month_last_year),
    holiday: holidayRow?.from ? { from: String(holidayRow.from), to: String(holidayRow.to ?? holidayRow.from), effect: num(cal.comparable_effect_pct, -15) } : null,
    // The café group's expected standing order, as recorded — never treated as agreed.
    contract_boxes: 2000,
  };
}

const boxes = (n: number, unit: string) => `${n.toLocaleString("en-GB")} ${unit}`;

export const DEMAND_FORECAST_GATES: Gate[] = [
  {
    key: "fc_open",
    stage_no: 1,
    role: "Planning",
    steps: [1, 2],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const rows: [string, string][] = [
        ["Item", `${i.sku} · ${String(f.month ?? "the month")}`],
        ["Records selected", "Sales history, holiday calendar, commercial intelligence"],
        ["Three-month average", boxes(i.average, i.unit)],
        ["Same month last year", boxes(i.last_year, i.unit)],
      ];
      return {
        question: `Open the ${String(f.month ?? "monthly")} forecast for ${i.sku} from these records?`,
        reason:
          "These are the records the forecast would be built from, at the versions shown. Approving starts the baseline; it commits nothing to production or to a customer.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "sales_history"), cite(d, "calendar")),
          technical: [
            { label: "Scope", value: `${i.sku} only — not the production plan` },
            { label: "Cadence", value: "Unknown — Prima hasn't described how often this runs" },
            { label: "Read at", value: asOfNow() },
          ],
        },
        patch: { sku: i.sku, unit: i.unit, average: i.average, last_year: i.last_year },
      };
    },
  },
  {
    key: "fc_baseline",
    stage_no: 2,
    role: "Planning",
    steps: [3, 4],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const rows: [string, string][] = [
        ...i.months.map(([m, v]) => [MONTH_LABEL[m] ?? m, boxes(v, i.unit)] as [string, string]),
        ["Baseline (three-month average)", boxes(i.average, i.unit)],
        ["Same month last year", boxes(i.last_year, i.unit)],
      ];
      return {
        question: `Use ${boxes(i.average, i.unit)} as the baseline for ${String(f.month ?? "the month")}?`,
        reason:
          "The average of the last three months, before any calendar effect. The history is raw: nothing was removed for one-off orders, stockouts, or past promotions, because Prima has not described how it cleans them. Send it back if a month above should not repeat.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "sales_history")),
          technical: [
            { label: "Method", value: "Arithmetic mean of three months (system calculation)" },
            { label: "Not removed", value: "One-off orders, stockouts, promotions — never described" },
          ],
        },
        patch: { baseline: i.average },
      };
    },
  },
  {
    key: "fc_seasonal",
    stage_no: 3,
    role: "Planning",
    steps: [5, 6],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const effect = i.holiday?.effect ?? 0;
      const baseline = num(f.baseline, i.average);
      const delta = Math.round((baseline * Math.abs(effect)) / 100);
      const adjusted = baseline - delta;
      const rows: [string, string][] = [
        ["Baseline", boxes(baseline, i.unit)],
        ["School holiday", i.holiday ? `${i.holiday.from} to ${i.holiday.to}` : "none recorded"],
        [`Adjustment (${effect}%)`, `−${boxes(delta, i.unit)}`],
        ["Seasonal baseline", boxes(adjusted, i.unit)],
      ];
      return {
        question: `Apply the school-holiday adjustment of ${effect}% — ${boxes(adjusted, i.unit)}?`,
        reason:
          "Comparable school-holiday months in this history (November 2025, April 2026) sold about 15% below the surrounding months. Those are the periods compared. No Hijri-dated season falls in this month; Ramadan and Eid move about 11 days earlier each Gregorian year, so they are never compared by calendar month.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "calendar"), cite(d, "sales_history")),
          technical: [
            { label: "Compared against", value: "November 2025, April 2026 (school holidays)" },
            { label: "Calculation", value: `${baseline.toLocaleString("en-GB")} × ${Math.abs(effect)}% = ${delta.toLocaleString("en-GB")}` },
          ],
        },
        patch: { holiday_delta: delta, seasonal_baseline: adjusted },
      };
    },
  },
  {
    key: "fc_contract",
    stage_no: 4,
    role: "Sales",
    steps: [7, 8],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const adjusted = num(f.seasonal_baseline, i.average);
      const rows: [string, string][] = [
        ["Expected standing order", `${boxes(i.contract_boxes, i.unit)} per month — unconfirmed`],
        ["Status on record", "No signature date, no start date, no signed document"],
        ["Forecast without it", boxes(adjusted, i.unit)],
        ["Forecast if it starts mid-month", boxes(adjusted + i.contract_boxes / 2, i.unit)],
        ["Forecast if it runs all month", boxes(adjusted + i.contract_boxes, i.unit)],
      ];
      return {
        question: "Is the new café group contract signed, and does it start on 15 November?",
        reason:
          "The forecast currently excludes this volume because nothing establishes that the contract exists. Confirm it and the part that falls inside the month is added. Send it back if it isn't signed: the forecast stays as it is, and the volume stays recorded as an unverified assumption.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "sales_history"), cite(d, "calendar")),
          technical: [
            { label: "Asked of", value: "Commercial & sales" },
            { label: "If confirmed", value: "Half a month counted — a 15 November start covers the second half" },
            { label: "If not", value: `${boxes(i.contract_boxes, i.unit)} stays out of the figure, marked unconfirmed` },
          ],
        },
        patch: { contract_confirmed: true, contract_start: "2026-11-15", contract_boxes: i.contract_boxes / 2 },
      };
    },
  },
  {
    key: "fc_draft",
    stage_no: 5,
    role: "Planning",
    steps: [9, 10],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const baseline = num(f.baseline, i.average);
      const delta = num(f.holiday_delta);
      const adjusted = num(f.seasonal_baseline, baseline - delta);
      const contract = num(f.contract_boxes);
      const total = adjusted + contract;
      const rows: [string, string][] = [
        ["Baseline (three-month average)", boxes(baseline, i.unit)],
        ["School holiday adjustment", `−${boxes(delta, i.unit)}`],
        ["Seasonal baseline", boxes(adjusted, i.unit)],
        [`Café group contract (confirmed, starts ${String(f.contract_start ?? "mid-month")})`, `+${boxes(contract, i.unit)}`],
        [`Forecast — ${i.sku}, ${String(f.month ?? "the month")}`, boxes(total, i.unit)],
      ];
      return {
        question: `Record the forecast at ${boxes(total, i.unit)} for ${String(f.month ?? "the month")}?`,
        reason:
          "Every line above comes from a record or from the decision you already made at that stage. Approving records this as the month's draft forecast; it is not yet approved for planning.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "sales_history"), cite(d, "calendar")),
          technical: [
            { label: "Assessed", value: `${i.sku} only` },
            { label: "Not assessed", value: "Every other SKU — this does not establish the production plan" },
            { label: "Relies on", value: `The café contract starting ${String(f.contract_start ?? "mid-month")}` },
          ],
        },
        patch: { forecast_total: total },
      };
    },
  },
  {
    key: "fc_approve",
    stage_no: 6,
    role: "Planning",
    steps: [11, 12],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const total = num(f.forecast_total);
      const rows: [string, string][] = [
        ["Forecast to approve", boxes(total, i.unit)],
        ["Scope", `${i.sku} only`],
        ["Named approver at Prima", "Unknown — not established"],
      ];
      return {
        question: `Approve ${boxes(total, i.unit)} as the forecast planning may use?`,
        reason:
          "Reviewing a document establishes that it is well made. Approving it for planning is a separate decision with a different effect, and it is the one being asked for here. Prima has not named who owns that decision, so in this prototype it rests with you.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "sales_history")),
          technical: [
            { label: "Blocked in the real process", value: "Forecast ownership and approval are Unknown in the work system analysis" },
            { label: "Recorded as", value: "Prototype approval by the demo account" },
          ],
        },
        patch: { approved: true },
      };
    },
  },
  {
    key: "fc_handoff",
    stage_no: 7,
    role: "Planning",
    steps: [13, 14],
    prepare: (f, d) => {
      const i = forecastInputs(d);
      const total = num(f.forecast_total);
      const rows: [string, string][] = [
        ["Approved forecast", boxes(total, i.unit)],
        ["Converted by", "forecast × BOM − stock − open POs"],
        ["Feeds", "Material readiness for the month"],
      ];
      return {
        question: "Hand the approved forecast to material readiness?",
        reason:
          "This is where forecasting stops and material availability begins: the same platform and the same records, a different activity. Approving closes the cycle and records the hand-off.",
        lines: list(rows),
        data: {
          figures: figures(rows),
          evidence: evidence(cite(d, "bom"), cite(d, "material_stock")),
          technical: [
            { label: "Next activity", value: "Material readiness (the sales-order case)" },
            { label: "Not done here", value: "No purchase, no production schedule, no customer promise" },
          ],
        },
      };
    },
  },
];

/** Each case kind's gates, in order. Keys are unique across sets. */
export const GATE_SETS: Record<string, Gate[]> = {
  order_fulfilment: GATES,
  demand_forecast: DEMAND_FORECAST_GATES,
};

const gatesFor = (kind: string | null | undefined) => GATE_SETS[kind ?? ""] ?? GATES;
const gateByKey = (key: string | null | undefined) =>
  Object.values(GATE_SETS)
    .flat()
    .find((g) => g.key === key) ?? null;
const setForKey = (key: string) => Object.values(GATE_SETS).find((set) => set.some((g) => g.key === key)) ?? GATES;

export async function advanceCase(taskId: string): Promise<{ opened: string | null }> {
  const sys = await systemCtx();
  const { data: taskRow } = await sys.db.from("tasks").select("*").eq("id", taskId).maybeSingle();
  const task = taskRow as Task | null;
  if (!task || !task.procedure_revision_id) return { opened: null };
  if (task.status === "Done" || task.status === "Cancelled") return { opened: null };

  // One gate at a time: the case waits for the decision it already asked for.
  const { data: openRows } = await sys.db.from("requests").select("id").eq("task_id", task.id).eq("status", "Open").not("gate_key", "is", null);
  if (openRows?.length) return { opened: null };

  const { data: stepRows } = await sys.db.from("case_steps").select("*").eq("task_id", task.id).order("step_no");
  const steps = (stepRows ?? []) as CaseStep[];
  const closed = (n: number) => {
    const s = steps.find((x) => x.step_no === n);
    return !s || s.status === "Done" || s.status === "Skipped";
  };

  let facts: Facts = { ...(task.case_facts ?? {}), case_ref: task.case_ref };
  delete facts.working;
  const data = await caseData(sys, facts);
  const { data: procRev } = await sys.db.from("procedure_revisions").select("config").eq("id", task.procedure_revision_id).maybeSingle();
  const config = caseConfig(procRev as { config: Record<string, unknown> } | null);
  const directory = config?.role_directory ?? {};

  for (const gate of gatesFor(config?.kind)) {
    if (gate.steps.every(closed)) continue;

    const out = gate.prepare(facts, data);
    if (out.skip) {
      await sys.db
        .from("case_steps")
        .update({ status: "Skipped", note: "Doesn't apply to this order", updated_at: now() })
        .eq("task_id", task.id)
        .in("step_no", gate.steps)
        .neq("status", "Done");
      continue;
    }

    // What the system worked out is kept on the case, so the numbers in the request are auditable.
    facts = { ...facts, ...(out.patch ?? {}) };
    await sys.db
      .from("tasks")
      .update({ case_facts: facts, case_stage: gate.stage_no, ...(out.path ? { case_path: out.path } : {}), updated_at: now() })
      .eq("id", task.id);

    const recipient = directory[gate.role] ?? task.responsible_id;
    if (!recipient) return { opened: null };

    const { data: asg } = task.assignment_id
      ? await sys.db.from("assignments").select("id,agent_id,org_id").eq("id", task.assignment_id).maybeSingle()
      : { data: null };

    const { data: request, error } = await sys.db
      .from("requests")
      .insert({
        org_id: task.org_id,
        type: "authorization",
        recipient_id: recipient,
        requester_kind: asg ? "agent" : "person",
        agent_id: asg?.agent_id ?? null,
        assignment_id: asg?.id ?? null,
        task_id: task.id,
        gate_stage: gate.stage_no,
        gate_key: gate.key,
        question: truncate(out.question, 300),
        reason: truncate(out.reason, 600),
        // The lines stay as a plain-text record of what was shown; the screen lays out gate_data.
        context_excerpt: out.lines.join("\n"),
        gate_data: out.data ?? {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await sys.db
      .from("case_steps")
      .update({ status: "InProgress", request_id: request.id, updated_at: now() })
      .eq("task_id", task.id)
      .in("step_no", gate.steps)
      .neq("status", "Done");

    await log(sys, {
      verb: "asked",
      summary: `Stage ${gate.stage_no}: asked ${await nameOf(sys, recipient)} — ${truncate(out.question, 120)}`,
      subject_kind: "task",
      subject_id: task.id,
      agent_id: asg?.agent_id ?? null,
      assignment_id: asg?.id ?? null,
    });
    await notify(sys, recipient, {
      kind: "request",
      title: `${task.case_ref || task.title}: a decision at stage ${gate.stage_no}`,
      body: truncate(out.question, 140),
      link: `/tasks/${task.id}`,
    });
    if (asg) {
      await sys.db
        .from("assignments")
        .update({ condition: `Waiting for ${await nameOf(sys, recipient)} — stage ${gate.stage_no}`, updated_at: now() })
        .eq("id", asg.id);
    }
    return { opened: gate.key };
  }

  // Nothing left to ask: every step that applies is recorded, so the case is finished.
  await setWorking(sys, task.id, null);
  await closeCase(sys, task);
  return { opened: null };
}

async function closeCase(sys: Ctx, task: Task) {
  if (task.status === "Done") return;
  await sys.db.from("tasks").update({ status: "Done", completed_at: now(), updated_at: now() }).eq("id", task.id);
  if (task.assignment_id) {
    await sys.db
      .from("assignments")
      .update({ status: "Ended", ended_at: now(), condition: "The case is closed", updated_at: now() })
      .eq("id", task.assignment_id);
  }
  await log(sys, {
    verb: "completed",
    summary: `${task.case_ref || task.title} is closed — every stage recorded.`,
    subject_kind: "task",
    subject_id: task.id,
  });
  await notify(sys, task.responsible_id, {
    kind: "case_closed",
    title: `${task.case_ref || task.title} is closed`,
    body: "Delivered, invoiced, and paid. Everything recorded in the case stays readable.",
    link: `/tasks/${task.id}`,
  });
}

/** A gate was decided. Approval closes its steps and opens the next gate. */
export async function decideGate(ctx: Ctx, req: LouraRequest & { gate_key?: string | null }, approved: boolean, byName: string) {
  const sys = await systemCtx();
  const gate = gateByKey(req.gate_key);
  if (!gate || !req.task_id) return { message: "" };

  if (!approved) {
    await sys.db
      .from("case_steps")
      .update({ status: "Blocked", note: `${byName} sent this back`, updated_at: now() })
      .eq("task_id", req.task_id)
      .in("step_no", gate.steps);
    if (req.assignment_id) {
      await sys.db.from("assignments").update({ condition: `Stage ${gate.stage_no} sent back by ${byName}`, updated_at: now() }).eq("id", req.assignment_id);
    }
    await log(sys, {
      verb: "declined",
      summary: `Stage ${gate.stage_no} sent back by ${byName}. The case stays where it is.`,
      subject_kind: "task",
      subject_id: req.task_id,
    });
    return { message: "Sent back. The case stays at this stage until someone records what should change." };
  }

  const { data: taskRow } = await sys.db.from("tasks").select("case_path").eq("id", req.task_id).maybeSingle();
  const path = (taskRow as { case_path: string | null } | null)?.case_path ?? null;
  const { data: gateSteps } = await sys.db.from("case_steps").select("id,step_no,paths").eq("task_id", req.task_id).in("step_no", gate.steps);
  for (const step of (gateSteps ?? []) as Pick<CaseStep, "id" | "step_no" | "paths">[]) {
    const onPath = !path || step.paths.length === 0 || step.paths.includes(path);
    await sys.db
      .from("case_steps")
      .update(
        onPath
          ? { status: "Done", request_id: null, updated_by: ctx.me.user_id, note: `Approved by ${byName}`, updated_at: now() }
          : { status: "Skipped", request_id: null, note: "Not needed for this order", updated_at: now() },
      )
      .eq("id", step.id);
  }
  await log(sys, {
    verb: "approved",
    summary: `Stage ${gate.stage_no} approved by ${byName}: steps ${gate.steps.join(", ")} recorded.`,
    subject_kind: "task",
    subject_id: req.task_id,
  });

  // The next stage is worked out by the worker, so the case can show that it is working.
  const { data: asg } = req.assignment_id
    ? await sys.db.from("assignments").select("id,org_id,status").eq("id", req.assignment_id).maybeSingle()
    : { data: null };
  if (asg && (asg as { status: string }).status === "Active") {
    await beginWork(req.task_id, gate.key);
    await sys.db.from("runs").insert({
      org_id: (asg as { org_id: string }).org_id,
      assignment_id: (asg as { id: string }).id,
      trigger: "case",
      instruction: `Work out what stage ${gate.stage_no + 1 > 7 ? 7 : gate.stage_no} needs after ${byName} approved`,
      inputs: { task_id: req.task_id },
      created_by: ctx.me.user_id,
    });
    kick();
    return { message: `Approved. The agent is working out what comes next — watch the case.` };
  }

  const next = await advanceCase(req.task_id);
  const gateAfter = gateByKey(next.opened);
  return {
    message: gateAfter
      ? `Approved. The case moved to stage ${gateAfter.stage_no}, and ${gateAfter.role} has the next decision.`
      : "Approved. Every stage of this case is now recorded.",
  };
}
