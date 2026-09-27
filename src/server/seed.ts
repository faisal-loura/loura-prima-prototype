import "server-only";
import type { Ctx } from "./context";
import type { ProcedureConfig } from "./types";
import { ORDER_FULFILMENT_INSTRUCTIONS, ORDER_FULFILMENT_STEPS } from "./procedures/order-fulfilment";
import { advanceCase } from "./domain/case-engine";
import { seedForecastCase } from "./seed-forecast";
import { DEMAND_FORECAST_INSTRUCTIONS, DEMAND_FORECAST_STEPS } from "./procedures/demand-forecast";

/*
 * Prima International demo data for the MVP. Everything here is fictional.
 *
 * One story, told through the product's single flow — ask in the composer, the
 * agent proposes a task, a person approves it, the agent does the work:
 *   SO-4912: 2,000 butter croissants for Al Waha Hotels, delivered 25 September.
 * The seeded conversations show a task at each stage (awaiting approval, blocked
 * by a question, done) plus a quick question that never becomes a task.
 */

const ORDER_SO_4912 = `Customer order SO-4912

Customer: Al Waha Hotels (fictional)
Product: Butter croissant, 80 g, baked and packed
Quantity: 2,000 pieces
Packing: 50 pieces per carton — 40 cartons
Delivery: 25 September 2026, before 06:00, Al Waha Riyadh central kitchen
Production slot: croissant line, 24 September 2026 (night shift)`;

const RECIPE_CROISSANT = `Recipe card — butter croissant (batch of 100 pieces)

Flour (T45): 10.0 kg
Lamination butter (82% fat): 5.5 kg
Sugar: 1.1 kg
Yeast: 0.4 kg
Salt: 0.2 kg
Milk: 5.0 L

For 2,000 pieces: multiply by 20 (butter 110 kg, flour 200 kg).`;

const QUOTE_GULF = `Supplier quote — lamination butter

Supplier: Gulf Dairy (fictional)
Product: Lamination butter sheets, 82% fat, 2 kg sheets
Price: SAR 38 per kg, excluding VAT
Minimum order: 50 kg
Lead time: 3 working days
Delivery support: weekdays, 07:00–15:00.
Quote validity: 30 days.`;

const QUOTE_ALNOOR = `Supplier quote — lamination butter

Supplier: Al Noor Dairy (fictional)
Product: Lamination butter block, 82% fat, 10 kg blocks
Price: SAR 41 per kg, excluding VAT
Minimum order: 100 kg
Lead time: 2 working days
Quote validity: 14 days.`;

const ANALYSIS_INSTRUCTIONS = `You compare and analyse the material people supply, and you chase the facts you are missing.
- Lay out the facts side by side and calculate differences with the calculate tool.
- Make missing or unconfirmed terms explicit. A lower price alone does not make an option more suitable.
- Name the sources you relied on.
- When a fact you need belongs to a colleague — a contract status, a date, a commitment — ask them instead of assuming it. A number that rests on an unconfirmed fact is not a result.`;

const DRAFTING_INSTRUCTIONS = `You prepare recommendations and other documents from completed contributions.
- Base conclusions only on supplied sources, completed contributions, and colleagues' answers; cite each.
- If a required input is still missing, say the recommendation can't be made yet and name what's missing.
- A recommendation never authorizes a purchase or a change to any record.`;

const MONITORING_INSTRUCTIONS = `You keep an assessment of expected supply current as a connected delivery record changes.
- Use the quantities calculated by the system as given.
- Explain what changed, the consequence for the need date, and what remains uncertain.
- Stay within the item assessed; never claim the whole plan is ready. Never place orders or change schedules.`;

const PROCEDURE_CONFIG: ProcedureConfig = {
  trigger: "delivery_date_changed",
  watched_field: "due_date",
  on_shortfall: { operation: "set_risk_flag", value: "At risk" },
  ending: "When the responsible person ends the assignment, or the need date has passed.",
  human_involvement:
    "Changing the delivery record's risk flag follows the organization's action rule for set_risk_flag (currently approval by a named person).",
  steps: [
    "Read the production plan, inventory snapshot, and the delivery record.",
    "Calculate expected quantity by the need date with ordinary arithmetic.",
    "Write or revise the assessment, noting what changed and what is uncertain.",
    "If there is a shortfall and the risk flag doesn't already say so, propose setting it to “At risk”.",
    "Ignore duplicate events and routine changes that don't alter the assessment.",
  ],
};

/** The action rule is written last, so its presence means a complete seed. */
export async function isSeeded(sys: Ctx) {
  const { count } = await sys.db.from("action_rules").select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

export async function seedFixtures(sys: Ctx) {
  // Start clean, so a partial earlier seed can't leave duplicates behind.
  const wipe = await sys.db.rpc("wipe_fixture_data");
  if (wipe.error) throw new Error(`seed wipe: ${wipe.error.message}`);
  const org = sys.me.org_id;
  await sys.db.from("orgs").update({ name: "Prima International" }).eq("id", org);
  const { data: people } = await sys.db.from("members").select("user_id,email");
  const id = (email: string) => (people ?? []).find((p) => p.email === email)?.user_id as string;
  const sam = id("sam@loura.test");
  const noura = id("noura@loura.test");
  const lina = id("lina@loura.test");
  const maya = id("maya@loura.test");
  const omar = id("omar@loura.test");
  // The demo account holds every role, so one person can show a whole case end to end.
  const faisal = id("faisal@loura.test") ?? sam;
  const titles: [string, string][] = [
    [sam, "Production planning lead"],
    [noura, "Procurement buyer"],
    [lina, "Finance controller"],
    [maya, "Platform administrator"],
    [omar, "Commercial & sales"],
    [faisal, "All roles (demo)"],
  ];
  for (const [uid, title] of titles) if (uid) await sys.db.from("members").update({ title }).eq("user_id", uid);
  // The presenting identity: reads every record so one account can show a whole walkthrough.
  if (faisal) await sys.db.from("members").update({ is_demo: true }).eq("user_id", faisal);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must = (res: { data: unknown; error: { message: string } | null }, what: string): Record<string, any> => {
    if (res.error) throw new Error(`seed ${what}: ${res.error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.data as Record<string, any>;
  };
  // Timestamps relative to now, so response windows and "updated" times read naturally.
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

  // Agents and the delivery-monitoring procedure, each published at revision 1 ----
  const agentSpecs = [
    { name: "Analysis agent", purpose: "Answer questions and prepare documents from Prima's sources, making gaps explicit.", instructions: ANALYSIS_INSTRUCTIONS, tools: ["read_sources", "calculate"] },
    { name: "Drafting agent", purpose: "Prepare recommendations and customer-facing drafts.", instructions: DRAFTING_INSTRUCTIONS, tools: ["read_sources", "calculate"] },
    { name: "Monitoring agent", purpose: "Follow a supplier delivery and keep the material assessment current.", instructions: MONITORING_INSTRUCTIONS, tools: ["read_connection", "calculate", "propose_action"] },
  ];
  const agents: Record<string, { id: string; rev: string }> = {};
  for (const spec of agentSpecs) {
    const agent = must(
      await sys.db.from("agents").insert({ org_id: org, name: spec.name, purpose: spec.purpose, created_by: maya }).select().single(),
      "agent",
    );
    const rev = must(
      await sys.db
        .from("agent_revisions")
        .insert({ agent_id: agent.id, revision: 1, purpose: spec.purpose, instructions: spec.instructions, tools: spec.tools, created_by: maya })
        .select()
        .single(),
      "agent revision",
    );
    must(await sys.db.from("agents").update({ published_revision_id: rev.id }).eq("id", agent.id), "publish agent");
    agents[spec.name] = { id: agent.id, rev: rev.id };
  }
  const analyst = agents["Analysis agent"];

  const proc = must(
    await sys.db
      .from("procedures")
      .insert({ org_id: org, name: "Delivery monitoring", purpose: "Keep a material assessment current as a supplier delivery changes.", created_by: maya })
      .select()
      .single(),
    "procedure",
  );
  const procRev = must(
    await sys.db
      .from("procedure_revisions")
      .insert({
        procedure_id: proc.id,
        revision: 1,
        instructions: "Follow one delivery record for one planned material requirement. Involve a person only when a decision is needed.",
        config: PROCEDURE_CONFIG,
        created_by: maya,
      })
      .select()
      .single(),
    "procedure revision",
  );
  must(await sys.db.from("procedures").update({ published_revision_id: procRev.id }).eq("id", proc.id), "publish procedure");

  // Order fulfilment: one sales order is one case, seven stages, twenty-five steps ----
  const orderProc = must(
    await sys.db
      .from("procedures")
      .insert({
        org_id: org,
        name: "Order fulfilment (sales order)",
        purpose: "Carry one sales order from intake to payment as a single case, across sales, planning, procurement, production, quality, warehouse, and finance.",
        created_by: maya,
      })
      .select()
      .single(),
    "order procedure",
  );
  const orderProcRev = must(
    await sys.db
      .from("procedure_revisions")
      .insert({
        procedure_id: orderProc.id,
        revision: 1,
        instructions: ORDER_FULFILMENT_INSTRUCTIONS,
        config: {
          kind: "order_fulfilment",
          steps: ORDER_FULFILMENT_STEPS,
          // Who answers for each role that owns a step.
          // The demo account holds every role, so one person can approve each stage in turn
          // while showing the case. Swap an entry for a real member to route that stage to them.
          role_directory: {
            Sales: faisal,
            "Sales admin": faisal,
            Planning: faisal,
            "Production planning": faisal,
            Production: faisal,
            Warehouse: faisal,
            "Warehouse + Quality": faisal,
            Quality: faisal,
            Procurement: faisal,
            Logistics: faisal,
            Finance: faisal,
          },
        },
        created_by: maya,
      })
      .select()
      .single(),
    "order procedure revision",
  );
  must(await sys.db.from("procedures").update({ published_revision_id: orderProcRev.id }).eq("id", orderProc.id), "publish order procedure");

  // Sources: the order, the recipe, plans, stock, and two butter quotes -------------
  const observed = ago(20);
  const sourceSpecs: Record<string, unknown>[] = [
    {
      title: "Customer order SO-4912 — Al Waha Hotels", kind: "document", origin: "Sales order system export", content: ORDER_SO_4912,
      data: { kind: "order_record", system: "Odoo", ref: "SO-4912", attachments: [] }, owner_id: sam,
    },
    {
      title: "Email — order request from Al Waha Hotels", kind: "document", origin: "Gmail · purchasing@alwaha.example",
      content: `From: purchasing@alwaha.example\nTo: sales@prima.example\nSubject: Croissant order for the 25th\n\nGood morning,\n\nPlease supply 2,000 butter croissants (80 g) for delivery to the Riyadh central kitchen on 25 September, before 06:00.\nSame packing as last time — 50 per carton.\n\nThank you,\nPurchasing, Al Waha Hotels`,
      data: {
        kind: "order_email", system: "Gmail", ref: "MSG-8841",
        attachments: [{ name: "Al Waha purchase order 88-231.pdf", kind: "pdf" }, { name: "Delivery address — Riyadh central kitchen.pdf", kind: "pdf" }],
      },
      owner_id: sam,
    },
    { title: "Recipe card — butter croissant", kind: "document", origin: "Product development", content: RECIPE_CROISSANT, data: {}, owner_id: sam },
    {
      title: "Production plan — 24 Sep · butter", kind: "record", origin: "Planning export",
      content: "SO-4912 needs 110 kg of lamination butter on the croissant line by 24 September 2026.",
      data: { kind: "production_plan", item: "butter", unit: "kg", need_qty: 110, need_date: "2026-09-24" }, owner_id: sam,
    },
    {
      title: "Inventory snapshot — butter", kind: "record", origin: "Warehouse export",
      content: "60 kg of lamination butter available and unreserved in cold store 2. Incoming deliveries are not included.",
      data: { kind: "inventory", item: "butter", unit: "kg", available: 60, reserved: 0 }, owner_id: sam,
    },
    {
      title: "Production plan — 24 Sep · cartons", kind: "record", origin: "Planning export",
      content: "SO-4912 needs 40 printed croissant cartons (50 pieces each) by 24 September 2026.",
      data: { kind: "production_plan", item: "cartons", unit: "cartons", need_qty: 40, need_date: "2026-09-24" }, owner_id: sam,
    },
    {
      title: "Inventory snapshot — cartons", kind: "record", origin: "Warehouse export",
      content: "15 printed croissant cartons available. Incoming deliveries are not included.",
      data: { kind: "inventory", item: "cartons", unit: "cartons", available: 15, reserved: 0 }, owner_id: sam,
    },
    {
      title: "Supplier quote — Gulf Dairy (butter)", kind: "document", origin: "Uploaded by Noura Saleh", content: QUOTE_GULF,
      data: { kind: "quote", supplier: "Gulf Dairy (fictional)", item: "Lamination butter", unit_price: 38, unit: "kg", min_order: 50, lead_days: 3 }, owner_id: noura,
    },
    {
      title: "Supplier quote — Al Noor Dairy (butter)", kind: "document", origin: "Uploaded by Noura Saleh", content: QUOTE_ALNOOR,
      data: { kind: "quote", supplier: "Al Noor Dairy (fictional)", item: "Lamination butter", unit_price: 41, unit: "kg", min_order: 100, lead_days: 2 }, owner_id: noura,
    },
    {
      title: "Supplier quote — Delta Mills (flour)", kind: "document", origin: "Uploaded by Noura Saleh",
      content: "Supplier quote — flour T45\n\nSupplier: Delta Mills (fictional)\nPrice: SAR 6.20 / kg\nMinimum order: 100 kg\nLead time: 2 working days",
      data: { kind: "quote", supplier: "Delta Mills (fictional)", item: "Flour T45", unit_price: 6.2, unit: "kg", min_order: 100, lead_days: 2 }, owner_id: noura,
    },
    {
      title: "Supplier quote — Riyadh Dairy Co (milk)", kind: "document", origin: "Uploaded by Noura Saleh",
      content: "Supplier quote — fresh milk\n\nSupplier: Riyadh Dairy Co (fictional)\nPrice: SAR 9.80 / L\nMinimum order: 50 L\nLead time: 1 working day\n\nNote: above the agreed ceiling of SAR 8.50 / L.",
      data: { kind: "quote", supplier: "Riyadh Dairy Co (fictional)", item: "Milk", unit_price: 9.8, unit: "L", min_order: 50, lead_days: 1 }, owner_id: noura,
    },
    {
      title: "Finished-goods stock — butter croissant", kind: "record", origin: "Warehouse export",
      content: "600 baked butter croissants (80 g) available and unreserved in the finished-goods store.",
      data: { kind: "fg_stock", item: "Butter croissant, 80 g", unit: "pieces", available: 600 }, owner_id: sam,
    },
    {
      title: "Bill of materials — butter croissant", kind: "record", origin: "Product development",
      content: "Recipe quantities per batch of 100 baked croissants.",
      data: {
        kind: "bom", per: 100, item: "Butter croissant, 80 g",
        items: {
          "Flour T45": { qty: 10, unit: "kg" },
          "Lamination butter": { qty: 5.5, unit: "kg" },
          Sugar: { qty: 1.1, unit: "kg" },
          Yeast: { qty: 0.4, unit: "kg" },
          Salt: { qty: 0.2, unit: "kg" },
          Milk: { qty: 5, unit: "L" },
        },
      },
      owner_id: sam,
    },
    {
      title: "Material stock snapshot", kind: "record", origin: "Warehouse export",
      content: "Unreserved raw materials in the warehouse. Incoming deliveries are not included.",
      data: {
        kind: "material_stock",
        items: {
          "Flour T45": { available: 120, unit: "kg" },
          "Lamination butter": { available: 60, unit: "kg" },
          Sugar: { available: 40, unit: "kg" },
          Yeast: { available: 12, unit: "kg" },
          Salt: { available: 25, unit: "kg" },
          Milk: { available: 40, unit: "L" },
        },
      },
      owner_id: sam,
    },
    {
      title: "Agreed price ranges — raw materials", kind: "record", origin: "Procurement policy",
      content: "What procurement may pay without a separate decision. A quote outside the range needs an explicit approval.",
      data: {
        kind: "price_policy",
        items: {
          "Flour T45": { min: 4.5, max: 7.5 },
          "Lamination butter": { min: 30, max: 42 },
          Sugar: { min: 3, max: 6 },
          Yeast: { min: 15, max: 28 },
          Salt: { min: 1, max: 3 },
          Milk: { min: 6, max: 8.5 },
        },
      },
      owner_id: noura,
    },
  ];
  const src: Record<string, string> = {};
  // One insert per row: bulk inserts send absent columns as null rather than their defaults.
  for (const row of sourceSpecs) {
    const created = must(
      await sys.db.from("sources").insert({ org_id: org, restricted: false, observed_at: observed, ...row }).select("id,title").single(),
      "source",
    );
    src[created.title as string] = created.id as string;
  }
  const allSources = Object.values(src);
  const ref = (title: string) => ({ source_id: src[title], title, version: 1 });

  // Sandbox supplier connection -------------------------------------------------------
  const conn = must(
    await sys.db
      .from("connections")
      .insert({
        org_id: org,
        name: "Supplier deliveries (sandbox)",
        description: "A controlled stand-in for Prima's supplier delivery system. Events are injected by the test harness; the one action is reversible.",
        capabilities: { reads: ["Delivery records"], events: ["Delivery date changed"], actions: ["Set delivery risk flag"] },
        last_observation_at: observed,
      })
      .select()
      .single(),
    "connection",
  );
  must(
    await sys.db.from("sandbox_records").insert([
      { connection_id: conn.id, external_id: "PO-2217", kind: "delivery", label: "Lamination butter from Gulf Dairy", data: { item: "butter", unit: "kg", quantity: 50, due_date: "2026-09-23", risk_flag: "On track", supplier: "Gulf Dairy (fictional)" } },
      { connection_id: conn.id, external_id: "PO-2240", kind: "delivery", label: "Printed cartons from Gulf Packaging", data: { item: "cartons", unit: "cartons", quantity: 30, due_date: "2026-09-22", risk_flag: "On track", supplier: "Gulf Packaging (fictional)" } },
    ]),
    "records",
  );

  // Activity: Sam's conversations with the agent, one per stage of a task ------------
  const activity = (row: Record<string, unknown>) =>
    sys.db.from("activity").insert({ org_id: org, actor_kind: "agent", agent_id: analyst.id, control: false, data: {}, ...row });

  async function conversation(title: string, at: number, turns: { who: "sam" | "agent"; body: string; hoursAgo: number; output_id?: string }[]) {
    const conv = must(
      await sys.db.from("conversations").insert({ org_id: org, owner_id: sam, title, created_at: ago(at), updated_at: ago(turns[turns.length - 1].hoursAgo) }).select().single(),
      "conversation",
    );
    must(await sys.db.from("conversation_sources").insert(allSources.map((source_id) => ({ conversation_id: conv.id, source_id }))), "conversation sources");
    for (const t of turns) {
      must(
        await sys.db.from("messages").insert({
          conversation_id: conv.id,
          author_kind: t.who === "sam" ? "person" : "agent",
          author_id: t.who === "sam" ? sam : null,
          agent_id: t.who === "agent" ? analyst.id : null,
          body: t.body,
          output_id: t.output_id ?? null,
          created_at: ago(t.hoursAgo),
        }),
        "message",
      );
    }
    const asg = must(
      await sys.db
        .from("assignments")
        .insert({
          org_id: org, agent_id: analyst.id, agent_revision_id: analyst.rev, kind: "contribution",
          purpose: `Help with: ${title}`, instructions: turns[0].body, status: "Active",
          condition: "Idle — responds when you send a message",
          responsible_id: sam, created_by: sam, conversation_id: conv.id, created_at: ago(at), updated_at: ago(at),
        })
        .select()
        .single(),
      "conversation assignment",
    );
    return { conv: conv.id as string, asg: asg.id as string };
  }

  async function task(spec: { title: string; expected: string; status: string; hoursAgo: number; output_id?: string; result_note?: string }) {
    return must(
      await sys.db
        .from("tasks")
        .insert({
          org_id: org, title: spec.title, expected_result: spec.expected, status: spec.status,
          performer_kind: "agent", agent_id: analyst.id, responsible_id: sam,
          output_id: spec.output_id ?? null, result_note: spec.result_note ?? "",
          created_at: ago(spec.hoursAgo), updated_at: ago(spec.hoursAgo),
          completed_at: spec.status === "Done" ? ago(spec.hoursAgo) : null,
        })
        .select()
        .single(),
      "task",
    );
  }

  async function taskAssignment(t: Record<string, unknown>, status: "Active" | "Ended", condition: string, at: number) {
    const a = must(
      await sys.db
        .from("assignments")
        .insert({
          org_id: org, agent_id: analyst.id, agent_revision_id: analyst.rev, kind: "contribution",
          purpose: t.title, instructions: t.expected_result, status, condition,
          responsible_id: sam, created_by: sam, task_id: t.id, created_at: ago(at), updated_at: ago(at),
          ended_at: status === "Ended" ? ago(at) : null,
        })
        .select()
        .single(),
      "task assignment",
    );
    must(await sys.db.from("assignment_sources").insert(allSources.map((source_id) => ({ assignment_id: a.id, source_id }))), "assignment sources");
    must(await sys.db.from("tasks").update({ assignment_id: a.id }).eq("id", t.id), "link assignment");
    return a.id as string;
  }

  async function document(title: string, content: string, sources: string[], at: number) {
    const o = must(
      await sys.db.from("outputs").insert({ org_id: org, title, owner_id: sam, private: false, current_version: 1, created_at: ago(at), updated_at: ago(at) }).select().single(),
      "output",
    );
    must(
      await sys.db.from("output_versions").insert({
        output_id: o.id, version: 1, content, author_kind: "agent", agent_id: analyst.id,
        sources: sources.map(ref), note: "Created by the agent", created_at: ago(at),
      }),
      "output version",
    );
    return o.id as string;
  }

  function approval(t: Record<string, unknown>, asg: string, ask: string, hoursAgo: number, decided?: number) {
    return sys.db.from("requests").insert({
      org_id: org, type: "authorization", recipient_id: sam, requester_kind: "agent", agent_id: analyst.id,
      assignment_id: asg, task_id: t.id, question: `Start the task “${t.title}”?`,
      reason: t.expected_result, context_excerpt: ask, created_at: ago(hoursAgo),
      ...(decided !== undefined
        ? { status: "Resolved", response_kind: "approve", responded_by: sam, responded_at: ago(decided), updated_at: ago(decided) }
        : {}),
    });
  }

  // 1. Done — the customer confirmation draft. -------------------------------------
  {
    const ask = "Draft a delivery confirmation for Al Waha Hotels for SO-4912.";
    const c = await conversation("Delivery confirmation for SO-4912", 30, [
      { who: "sam", body: ask, hoursAgo: 30 },
      {
        who: "agent", hoursAgo: 29.9,
        body: "I can draft the confirmation from the order: 2,000 butter croissants in 40 cartons, delivered 25 September before 06:00. I've proposed this as a task — it starts once you approve it in your Inbox.",
      },
    ]);
    const t = await task({
      title: "Draft delivery confirmation for Al Waha Hotels (SO-4912)",
      expected: "A short, ready-to-send confirmation of quantity, packing, delivery date and time, and delivery address.",
      status: "Done", hoursAgo: 26,
      result_note: "Sent to Al Waha Hotels' purchasing team.",
    });
    must(await sys.db.from("assignments").update({ task_id: t.id }).eq("id", c.asg), "link conversation");
    must(await approval(t, c.asg, ask, 29.9, 29), "approval");
    const doc = await document(
      "Delivery confirmation — SO-4912",
      `## Delivery confirmation — SO-4912

Dear Al Waha Hotels purchasing team,

We confirm your order **SO-4912**:

- **Product:** butter croissant, 80 g, baked and packed
- **Quantity:** 2,000 pieces, packed 50 per carton (40 cartons)
- **Delivery:** 25 September 2026, before 06:00
- **Address:** Al Waha Riyadh central kitchen

Please let us know if the receiving window changes.

Kind regards,
Prima International — Production Planning

## Sources

- Customer order SO-4912 — Al Waha Hotels
`,
      ["Customer order SO-4912 — Al Waha Hotels"], 28,
    );
    must(await sys.db.from("tasks").update({ output_id: doc }).eq("id", t.id), "link output");
    await taskAssignment(t, "Ended", "Task done", 26);
    await activity({ verb: "proposed", summary: `Proposed the task “${t.title}” from the conversation.`, subject_kind: "task", subject_id: t.id, created_at: ago(29.9) });
    await activity({ actor_kind: "person", actor_id: sam, agent_id: null, verb: "approved", summary: `Approved the task “${t.title}”.`, subject_kind: "task", subject_id: t.id, created_at: ago(29) });
    await activity({ verb: "created", summary: "Created “Delivery confirmation — SO-4912”.", subject_kind: "task", subject_id: t.id, created_at: ago(28) });
    await activity({ actor_kind: "person", actor_id: sam, agent_id: null, verb: "completed", summary: `Completed “${t.title}”: Sent to Al Waha Hotels' purchasing team.`, subject_kind: "task", subject_id: t.id, created_at: ago(26) });
  }

  // 2. Blocked — butter supplier comparison waits on Noura's answer. ------------------
  {
    const ask = "Compare the butter quotes from Gulf Dairy and Al Noor Dairy for SO-4912. We need 50 kg more by the 23rd.";
    const c = await conversation("Butter quotes for SO-4912", 9, [
      { who: "sam", body: ask, hoursAgo: 9 },
      {
        who: "agent", hoursAgo: 8.9,
        body: "I can compare price, minimum order, and lead time for the 50 kg you're short. I've proposed this as a task — it starts once you approve it in your Inbox.",
      },
    ]);
    const t = await task({
      title: "Compare butter quotes for SO-4912",
      expected: "A side-by-side comparison of Gulf Dairy and Al Noor Dairy for the 50 kg shortfall, with a recommendation and anything still unconfirmed.",
      status: "InProgress", hoursAgo: 6,
    });
    must(await sys.db.from("assignments").update({ task_id: t.id }).eq("id", c.asg), "link conversation");
    must(await approval(t, c.asg, ask, 8.9, 8.5), "approval");
    const doc = await document(
      "Butter supplier comparison — SO-4912",
      `## Summary

For the 50 kg shortfall, **Gulf Dairy** costs SAR 1,900 against Al Noor Dairy's SAR 4,100 — Al Noor's 100 kg minimum order doubles the quantity. Gulf Dairy is the better fit **if** it can deliver by 23 September. That isn't confirmed yet, so I've asked Noura Saleh.

## Comparison

| | Gulf Dairy | Al Noor Dairy |
| --- | --- | --- |
| Price | SAR 38 / kg | SAR 41 / kg |
| Minimum order | 50 kg | 100 kg |
| Cost for this order | SAR 1,900 (50 kg) | SAR 4,100 (100 kg minimum) |
| Lead time | 3 working days | 2 working days |
| Delivery by 23 Sep | **Unconfirmed** | Likely (2-day lead time) |

## Unknown or missing

- Whether Gulf Dairy can deliver 50 kg by 23 September — asked Noura Saleh (procurement).
- Al Noor Dairy's delivery support hours aren't stated.

## Sources

- Supplier quote — Gulf Dairy (butter)
- Supplier quote — Al Noor Dairy (butter)
- Production plan — 24 Sep · butter
- Inventory snapshot — butter
`,
      ["Supplier quote — Gulf Dairy (butter)", "Supplier quote — Al Noor Dairy (butter)", "Production plan — 24 Sep · butter", "Inventory snapshot — butter"], 7,
    );
    must(await sys.db.from("tasks").update({ output_id: doc }).eq("id", t.id), "link output");
    const a = await taskAssignment(t, "Active", "Waiting for Noura Saleh to confirm Gulf Dairy's delivery date", 6);
    must(
      await sys.db.from("requests").insert({
        org_id: org, type: "information", recipient_id: noura, requester_kind: "agent", agent_id: analyst.id,
        assignment_id: a, task_id: t.id,
        question: "Can Gulf Dairy deliver 50 kg of lamination butter by 23 September?",
        reason: "Gulf Dairy is the cheaper option for SO-4912, but its quote only states a 3-working-day lead time. The recommendation depends on this date.",
        context_excerpt: "SO-4912 needs 110 kg of butter by 24 September. 60 kg is in stock; 50 kg must arrive by the 23rd.",
        created_at: ago(6),
      }),
      "information request",
    );
    await activity({ verb: "proposed", summary: `Proposed the task “${t.title}” from the conversation.`, subject_kind: "task", subject_id: t.id, created_at: ago(8.9) });
    await activity({ actor_kind: "person", actor_id: sam, agent_id: null, verb: "approved", summary: `Approved the task “${t.title}”.`, subject_kind: "task", subject_id: t.id, created_at: ago(8.5) });
    await activity({ verb: "created", summary: "Created “Butter supplier comparison — SO-4912”.", subject_kind: "task", subject_id: t.id, created_at: ago(7) });
    await activity({ verb: "asked", summary: "Asked Noura Saleh whether Gulf Dairy can deliver 50 kg by 23 September.", subject_kind: "task", subject_id: t.id, created_at: ago(6) });
  }

  // 3. Awaiting approval — the material readiness summary. ----------------------------
  {
    const ask = "Are we ready for SO-4912? Check butter and cartons for the 24 September run.";
    const c = await conversation("Material readiness for SO-4912", 2, [
      { who: "sam", body: ask, hoursAgo: 2 },
      {
        who: "agent", hoursAgo: 1.9,
        body: "I can check butter and cartons against the plan and stock and list what depends on open deliveries (PO-2217 and PO-2240). I've proposed this as a task — it starts once you approve it in your Inbox.",
      },
    ]);
    const t = await task({
      title: "Prepare material readiness summary for SO-4912",
      expected: "A summary of butter and carton needs for 24 September against stock and open deliveries, with any shortfall and what it depends on.",
      status: "Open", hoursAgo: 1.9,
    });
    must(await sys.db.from("assignments").update({ task_id: t.id }).eq("id", c.asg), "link conversation");
    must(await approval(t, c.asg, ask, 1.9), "approval");
    await activity({ verb: "proposed", summary: `Proposed the task “${t.title}” from the conversation. Waiting for Sam Haddad to approve.`, subject_kind: "task", subject_id: t.id, created_at: ago(1.9) });
  }

  // 5. The sales order as one case: SO-4912 from intake to payment. ------------------
  {
    const c = must(
      await sys.db
        .from("tasks")
        .insert({
          org_id: org,
          title: "Sales order SO-4912 — Al Waha Hotels",
          expected_result:
            "2,000 butter croissants delivered to Al Waha Riyadh by 25 September 2026, invoiced and paid, with every stage of the order recorded in this one case.",
          status: "InProgress",
          performer_kind: "agent",
          agent_id: analyst.id,
          responsible_id: faisal,
          created_by: faisal,
          procedure_revision_id: orderProcRev.id,
          case_ref: "SO-4912",
          case_stage: 1,
          case_facts: {
            customer: "Al Waha Hotels (fictional)",
            product: "Butter croissant, 80 g",
            quantity: 2000,
            unit: "pieces",
            packing: "50 per carton — 40 cartons",
            requested_delivery: "2026-09-25 before 06:00",
            production_slot: "croissant line, 2026-09-24 night shift",
            order_value: 19000,
          },
          created_at: ago(2),
          updated_at: ago(2),
        })
        .select()
        .single(),
      "order case",
    );

    must(
      await sys.db.from("case_steps").insert(
        ORDER_FULFILMENT_STEPS.map((step) => ({
          org_id: org,
          task_id: c.id,
          stage_no: step.stage_no,
          stage_name: step.stage_name,
          step_no: step.step_no,
          title: step.title,
          owner_role: step.owner_role,
          tools: step.tools,
          paths: step.paths,
          confidence: step.confidence,
          created_at: ago(2),
          updated_at: ago(2),
        })),
      ),
      "case steps",
    );

    const a = must(
      await sys.db
        .from("assignments")
        .insert({
          org_id: org, agent_id: analyst.id, agent_revision_id: analyst.rev, procedure_revision_id: orderProcRev.id,
          kind: "ongoing", purpose: "Carry SO-4912 through order fulfilment",
          instructions: ORDER_FULFILMENT_INSTRUCTIONS, status: "Active",
          condition: "Opening the case", responsible_id: faisal, created_by: faisal,
          task_id: c.id, created_at: ago(2), updated_at: ago(2),
        })
        .select()
        .single(),
      "case assignment",
    );
    must(await sys.db.from("tasks").update({ assignment_id: a.id }).eq("id", c.id), "link case assignment");
    for (const title of [
      "Customer order SO-4912 — Al Waha Hotels",
      "Bill of materials — butter croissant",
      "Finished-goods stock — butter croissant",
      "Material stock snapshot",
      "Agreed price ranges — raw materials",
    ]) {
      if (src[title]) must(await sys.db.from("assignment_sources").insert({ assignment_id: a.id, source_id: src[title] }), "case assignment source");
    }
    await activity({
      actor_kind: "person", actor_id: faisal, agent_id: null, verb: "created",
      summary: "Order SO-4912 ingested from Al Waha Hotels and opened as one case following Order fulfilment (sales order).",
      subject_kind: "task", subject_id: c.id, created_at: ago(2),
    });
    // The first gate: Sales confirms the ingested order before any check runs.
    await advanceCase(c.id as string);
  }

  // 4. A quick question — answered, no task. -------------------------------------------
  await conversation("Cartons for 2,000 croissants", 1, [
    { who: "sam", body: "How many cartons do we need for 2,000 croissants?", hoursAgo: 1 },
    { who: "agent", body: "40 cartons — the order packs 50 croissants per carton (2,000 ÷ 50). There are 15 in stock, so 25 depend on PO-2240.", hoursAgo: 0.95 },
  ]);

  // Second fixture: the monthly demand forecast (same platform, different activity).
  await seedForecastCase(sys);

  // The forecast as a case: same engine and gates as the sales order, seven stages.
  {
    const proc = must(
      await sys.db
        .from("procedures")
        .insert({
          org_id: org,
          name: "Demand forecast (monthly)",
          purpose: "Build one month's demand forecast for one product family: baseline, calendar effects, commercial intelligence, and approval for planning.",
          created_by: maya,
        })
        .select()
        .single(),
      "forecast procedure",
    );
    const rev = must(
      await sys.db
        .from("procedure_revisions")
        .insert({
          procedure_id: proc.id,
          revision: 1,
          instructions: DEMAND_FORECAST_INSTRUCTIONS,
          config: {
            kind: "demand_forecast",
            steps: DEMAND_FORECAST_STEPS,
            // The demo account holds every role, so one person can walk the whole case.
            role_directory: { Planning: faisal, Sales: faisal, Finance: faisal },
          },
          created_by: maya,
        })
        .select()
        .single(),
      "forecast procedure revision",
    );
    must(await sys.db.from("procedures").update({ published_revision_id: rev.id }).eq("id", proc.id), "publish forecast procedure");

    const c = must(
      await sys.db
        .from("tasks")
        .insert({
          org_id: org,
          title: "November demand forecast — CRS-10",
          expected_result:
            "A November forecast for CRS-10 croissant boxes, every line traceable to a record, unknowns kept as unknowns, approved for planning and handed to material readiness.",
          status: "InProgress",
          performer_kind: "agent",
          agent_id: analyst.id,
          responsible_id: faisal,
          created_by: faisal,
          procedure_revision_id: rev.id,
          case_ref: "CRS-10 · Nov 2026",
          case_stage: 1,
          case_facts: { sku: "CRS-10", month: "November 2026", unit: "boxes" },
          created_at: ago(1),
          updated_at: ago(1),
        })
        .select()
        .single(),
      "forecast case",
    );
    must(
      await sys.db.from("case_steps").insert(
        DEMAND_FORECAST_STEPS.map((step) => ({
          org_id: org, task_id: c.id, stage_no: step.stage_no, stage_name: step.stage_name, step_no: step.step_no,
          title: step.title, owner_role: step.owner_role, tools: step.tools, paths: step.paths, confidence: step.confidence,
          created_at: ago(1), updated_at: ago(1),
        })),
      ),
      "forecast case steps",
    );
    const a = must(
      await sys.db
        .from("assignments")
        .insert({
          org_id: org, agent_id: analyst.id, agent_revision_id: analyst.rev, procedure_revision_id: rev.id,
          kind: "ongoing", purpose: "Carry the November CRS-10 forecast through its stages",
          instructions: DEMAND_FORECAST_INSTRUCTIONS, status: "Active",
          condition: "Opening the cycle", responsible_id: faisal, created_by: faisal,
          task_id: c.id, created_at: ago(1), updated_at: ago(1),
        })
        .select()
        .single(),
      "forecast case assignment",
    );
    must(await sys.db.from("tasks").update({ assignment_id: a.id }).eq("id", c.id), "link forecast assignment");
    const { data: fcSources } = await sys.db
      .from("sources")
      .select("id,title")
      .in("title", [
        "Sales history — CRS-10 croissant boxes",
        "Holiday calendar — November 2026",
        "Sales intelligence — new café group contract",
        "Forecast vs actual — CRS-10, October 2026",
      ]);
    for (const row of fcSources ?? []) {
      must(await sys.db.from("assignment_sources").insert({ assignment_id: a.id, source_id: row.id }), "forecast assignment source");
    }
    await activity({
      actor_kind: "person", actor_id: faisal, agent_id: null, verb: "created",
      summary: "Opened the November CRS-10 demand forecast as one case following Demand forecast (monthly).",
      subject_kind: "task", subject_id: c.id, created_at: ago(1),
    });
    // The first gate: the planner confirms the records the forecast is built from.
    await advanceCase(c.id as string);
  }

  // The action rule is written last: its presence marks a complete seed.
  must(
    await sys.db.from("action_rules").insert({ org_id: org, operation: "set_risk_flag", rule: "approval", approver_id: lina, updated_by: maya }),
    "rule",
  );
}
