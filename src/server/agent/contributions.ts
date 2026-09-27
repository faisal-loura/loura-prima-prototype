import "server-only";
import { calculate } from "./calc";
import { runAgent } from "./runtime";

export interface SourceInput {
  id: string;
  title: string;
  version: number;
  kind: string;
  content: string;
  data: Record<string, unknown>;
  observed_at: string | null;
}

const renderSources = (sources: SourceInput[]) =>
  sources.length
    ? sources
        .map(
          (s, i) =>
            `<source index="${i + 1}" title="${s.title}" version="${s.version}"${s.observed_at ? ` observed="${s.observed_at}"` : ""}>\n${
              s.kind === "record" ? JSON.stringify(s.data, null, 2) : s.content
            }\n</source>`,
        )
        .join("\n\n")
    : "(No sources were selected.)";

const money = (n: number) => `SAR ${n.toLocaleString("en-US")}`;

/** Extract "SAR 120,000"-style annual prices from supplied text. Simulation only. */
function priceIn(text: string): number | null {
  const m = text.match(/SAR\s*([\d,]+)/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function supportIn(text: string): string | null {
  const m = text.match(/support[^.\n]*?(weekdays?[^.\n]*|24\/7[^.\n]*|seven days[^.\n]*|weekends?[^.\n]*)/i);
  return m ? m[0].trim() : null;
}

function nameOf(source: SourceInput) {
  return source.title.replace(/^Proposal\s+[A-Z]\s+—\s+/i, "").trim() || source.title;
}

// ---------------------------------------------------------------------------
// Conversation contribution (journey A)
// ---------------------------------------------------------------------------

export interface ConverseOutput {
  reply: string;
  create_document: boolean;
  document_title: string;
  document_markdown: string;
  unknowns: string[];
  create_task: boolean;
  task_title: string;
  task_expected_result: string;
}

export function converse(args: {
  instructions: string;
  question: string;
  history: { author: string; body: string }[];
  sources: SourceInput[];
  /** Title of the task this conversation already produced, if any. */
  existing_task?: string | null;
}) {
  const decide = args.existing_task
    ? `This conversation already has a task: "${args.existing_task}". Don't propose another one. Answer questions about it or take instructions for it in "reply" (a few sentences). Set create_task false, create_document false, and leave the task and document fields empty.`
    : `First decide which kind of message this is.

CHAT — a greeting, thanks, small talk, or a message too vague to act on (for example "hi", "thanks", "can you help me?"). Reply naturally in one or two sentences and, if useful, ask what they need. Set create_task false and create_document false, and leave the task and document fields empty.

QUICK ANSWER — a factual question you can answer in a few sentences from the sources (for example "how much butter is in stock?"). Answer it in "reply". Set create_task false and create_document false, and leave the task and document fields empty.

WORK — the person clearly asks you to compare, analyse, recommend, draft, prepare, write, check, or follow up on something. Do NOT do the work now: work only starts after the person approves it. Set create_task true, give a short imperative task_title (for example "Compare butter quotes for SO-4912"), and describe in task_expected_result what should exist when it's done. Set create_document false and leave the document fields empty. In "reply", say in one or two sentences what you'll do, and that it starts once they approve the task in their Inbox.

Only propose a task when you can name a concrete result it will produce. If you can't tell what they want, it's CHAT: ask them.`;

  const task = `A colleague sent a message in a private conversation.

<conversation_so_far>
${args.history.map((m) => `${m.author}: ${m.body}`).join("\n") || "(none)"}
</conversation_so_far>

<available_sources>
${renderSources(args.sources)}
</available_sources>

<message>${args.question}</message>

${decide}

Use only the available sources that are relevant. List every material fact you could not establish in "unknowns".`;

  return runAgent<ConverseOutput>({
    instructions: args.instructions,
    task,
    submit: {
      name: "submit_response",
      description: "Submit the reply and, when useful, an editable document.",
      properties: {
        reply: { type: "string" },
        create_document: { type: "boolean" },
        document_title: { type: "string" },
        document_markdown: { type: "string" },
        unknowns: { type: "array", items: { type: "string" } },
        create_task: { type: "boolean" },
        task_title: { type: "string" },
        task_expected_result: { type: "string" },
      },
      required: ["reply", "create_document", "document_title", "document_markdown", "unknowns", "create_task", "task_title", "task_expected_result"],
    },
    simulate: () => simulateComparison(args.sources, args.question),
  });
}

function simulateComparison(sources: SourceInput[], question: string): ConverseOutput {
  const docs = sources.filter((s) => s.kind === "document");
  if (docs.length < 2) {
    return {
      reply: `I can only work from the sources available to you. ${docs.length ? "Only one document is available" : "No documents are available"}, so I can't compare anything yet. Add the documents in Sources and ask again.`,
      create_document: false,
      document_title: "",
      document_markdown: "",
      unknowns: ["Documents to compare"],
      create_task: false,
      task_title: "",
      task_expected_result: "",
    };
  }
  const rows = docs.map((d) => ({ name: nameOf(d), title: d.title, price: priceIn(d.content), support: supportIn(d.content) }));
  const priced = rows.filter((r) => r.price !== null);
  const unknowns: string[] = [];
  for (const r of rows) {
    if (r.price === null) unknowns.push(`${r.name}: annual price not stated`);
    if (!r.support) unknowns.push(`${r.name}: support days not specified`);
  }
  let diffLine = "Price difference: can't be calculated — a price is missing.";
  let cheaper = "";
  if (priced.length >= 2) {
    const [a, b] = priced;
    const diff = calculate(`${Math.max(a.price!, b.price!)} - ${Math.min(a.price!, b.price!)}`);
    cheaper = a.price! < b.price! ? a.name : b.name;
    diffLine = `Price difference: ${money(diff)} annually (${cheaper} is lower).`;
  }
  const table = [
    "| Proposal | Annual price (excl. tax) | Support coverage |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.name} | ${r.price !== null ? money(r.price) : "**Unknown**"} | ${r.support ?? "**Unknown — not specified**"} |`),
  ].join("\n");
  const markdown = `## Summary

${diffLine}

${unknowns.length ? `A lower price alone doesn't establish which proposal is more suitable: ${unknowns.join("; ")}.` : "Both proposals state price and support coverage."}

## Comparison

${table}

## Unknown or missing

${unknowns.length ? unknowns.map((u) => `- ${u}`).join("\n") : "- Nothing material identified."}

## Sources

${rows.map((r) => `- ${r.title}`).join("\n")}
`;
  const isWork = /compar|analy|document|table|recommend|differ|versus|vs\b|prepare|draft|review|check/i.test(question);
  return {
    reply: isWork
      ? "I can compare the proposals' price and support coverage in an editable document. I've proposed this as a task — it starts once you approve it in your Inbox."
      : `${diffLine} ${unknowns.length ? `Still unknown: ${unknowns.join("; ")}. ` : ""}`.trim(),
    create_document: false,
    document_title: "Service proposal comparison",
    document_markdown: markdown,
    unknowns,
    create_task: isWork,
    task_title: "Compare service proposals",
    task_expected_result: "A comparison of the proposals' price and support coverage, with unknowns called out.",
  };
}

// ---------------------------------------------------------------------------
// Task performed by an agent after its proposal is approved (journey B)
// ---------------------------------------------------------------------------

export interface ContributionOutput {
  summary: string;
  document_title: string;
  document_markdown: string;
  missing_information: string[];
  /** One colleague the agent wants to ask; empty when nothing is worth asking. */
  ask_colleague: string;
  question: string;
  question_reason: string;
}

export function contribute(args: {
  instructions: string;
  task: { title: string; expected_result: string; instruction: string };
  sources: SourceInput[];
  contributions: { title: string; by: string; content: string }[];
  answers: { question: string; answer: string; by: string }[];
  /** Who may be asked, and who has already been asked what. */
  colleagues?: { name: string; title: string }[];
  asked?: string[];
}) {
  const task = `You are performing a task the responsible person approved.

<your_task title="${args.task.title}">
Expected result: ${args.task.expected_result || "(not specified)"}
Instruction from the responsible person: ${args.task.instruction || "(none)"}
</your_task>

<sources>
${renderSources(args.sources)}
</sources>

<completed_contributions>
${args.contributions.map((c) => `<contribution title="${c.title}" by="${c.by}">\n${c.content}\n</contribution>`).join("\n") || "(none)"}
</completed_contributions>

<answers_from_colleagues>
${args.answers.map((a) => `Q: ${a.question}\nA (${a.by}): ${a.answer}`).join("\n\n") || "(none)"}
</answers_from_colleagues>

<colleagues_you_may_ask>
${args.colleagues?.map((c) => `- ${c.name} — ${c.title}`).join("\n") || "(nobody is available to ask)"}
</colleagues_you_may_ask>

<already_asked>
${args.asked?.length ? args.asked.map((q) => `- ${q}`).join("\n") : "(nothing)"}
</already_asked>

Produce the expected result as an editable Markdown document. Cite source titles and colleague answers you relied on. List anything still missing in missing_information.

A missing fact stays missing: keep it out of your headline figure, never present an assumption as established, and keep the word "unconfirmed" on anything a colleague hasn't confirmed.

Then chase the facts. Take your first missing_information entry that a person could answer — a contract status, a date, a price, a quantity, an intention — and find the colleague above whose role covers it. Ask them: put their exact name in "ask_colleague", one specific question in "question", and in "question_reason" name the line of the document that depends on the answer. Ask whenever such an unknown remains, even though your draft is otherwise finished; the work is not done while it rests on an unconfirmed fact. Leave the three fields empty only when every remaining unknown is one no colleague listed could settle, or it repeats something in already_asked, or the sources already answer it.`;

  return runAgent<ContributionOutput>({
    instructions: args.instructions,
    task,
    submit: {
      name: "submit_contribution",
      description: "Submit the contribution document.",
      properties: {
        summary: { type: "string" },
        document_title: { type: "string" },
        document_markdown: { type: "string" },
        missing_information: { type: "array", items: { type: "string" } },
        ask_colleague: { type: "string" },
        question: { type: "string" },
        question_reason: { type: "string" },
      },
      required: ["summary", "document_title", "document_markdown", "missing_information", "ask_colleague", "question", "question_reason"],
    },
    simulate: () => simulateContribution(args),
  });
}

function simulateContribution(args: Parameters<typeof contribute>[0]): ContributionOutput {
  if (args.sources.some((s) => s.data.kind === "production_plan")) return simulateReadinessSummary(args);
  const isRecommendation = /recommend/i.test(args.task.title + args.task.expected_result);
  const docs = args.sources.filter((s) => s.kind === "document");
  const rows = docs
    .filter((d) => priceIn(d.content) !== null)
    .map((d) => ({ name: nameOf(d), price: priceIn(d.content)!, support: supportIn(d.content) }));

  if (!isRecommendation) {
    const cmp = simulateComparison(docs, "");
    return {
      summary: cmp.reply,
      document_title: "Annual cost comparison",
      document_markdown: cmp.document_markdown,
      missing_information: cmp.unknowns,
      ask_colleague: "",
      question: "",
      question_reason: "",
    };
  }

  const support = args.answers.map((a) => `${a.answer} (confirmed by ${a.by})`);
  const missing: string[] = [];
  if (!support.length) missing.push("Written confirmation of support coverage");
  const sorted = [...rows].sort((a, b) => a.price - b.price);
  const diff = sorted.length >= 2 ? calculate(`${sorted[1].price} - ${sorted[0].price}`) : null;
  const cheaper = sorted[0];
  const markdown = `## Recommendation

${
  cheaper && diff !== null && support.length
    ? `Recommend **${cheaper.name}**. It costs ${money(diff)} less per year, and the support coverage question has been answered: ${support.join("; ")}.`
    : "A recommendation can't be made yet: required inputs are missing."
}

## Basis

${sorted.map((r) => `- ${r.name}: ${money(r.price)} annually; support: ${r.support ?? "not stated in the proposal"}`).join("\n")}
${args.answers.map((a) => `- Clarification from ${a.by}: ${a.answer}`).join("\n")}
${args.contributions.map((c) => `- Used contribution: ${c.title} (${c.by})`).join("\n")}

## Limits

- Neither proposal states weekend support unless noted above.
- This recommendation doesn't authorize a purchase or any change to supplier records.
`;
  return {
    summary: missing.length ? "Drafted with missing inputs." : `Recommend ${cheaper?.name ?? "—"}.`,
    document_title: "Provider recommendation",
    document_markdown: markdown,
    missing_information: missing,
    ask_colleague: "",
    question: "",
    question_reason: "",
  };
}

/** Material readiness summary from requirement and stock records. Simulation only. */
function simulateReadinessSummary(args: Parameters<typeof contribute>[0]): ContributionOutput {
  const plans = args.sources.filter((s) => s.data.kind === "production_plan");
  const stock = args.sources.filter((s) => s.data.kind === "inventory");
  const rows = plans.map((p) => {
    const item = String(p.data.item);
    const unit = p.data.unit ? ` ${p.data.unit}` : "";
    const need = Number(p.data.need_qty);
    const inv = stock.find((s) => s.data.item === item);
    const available = inv ? Number(inv.data.available) : null;
    const gap = available === null ? null : calculate(`${need} - ${available}`);
    return {
      item,
      text: `| ${item} | ${need}${unit} by ${p.data.need_date} | ${available === null ? "**Unknown**" : `${available}${unit}`} | ${
        gap === null ? "**Unknown**" : gap <= 0 ? "Covered from stock" : `${gap}${unit} depends on open supply`
      } |`,
      dependsOnSupply: gap === null || gap > 0,
    };
  });
  const open = rows.filter((r) => r.dependsOnSupply).map((r) => r.item);
  const answers = args.answers.map((a) => `- ${a.question} — ${a.by}: ${a.answer}`);
  const markdown = `## Material readiness summary

${open.length ? `**Not ready yet.** ${open.length} material${open.length > 1 ? "s" : ""} depend on supply that isn't in stock: ${open.join(", ")}.` : "**All assessed materials are covered from current stock.**"}

| Material | Needed | In stock | Position |
| --- | --- | --- | --- |
${rows.map((r) => r.text).join("\n")}

## Supplier confirmations

${answers.length ? answers.join("\n") : "- No written supplier confirmations have been recorded yet."}

## Open decisions

- Whether to expedite, substitute, or re-plan any material still short belongs to the responsible buyer and manager.
- Arrival isn't usable stock: receiving and quality release still apply.

## Sources

${args.sources.map((s) => `- ${s.title} (version ${s.version})`).join("\n")}
${args.contributions.map((c) => `- Contribution: ${c.title} (${c.by})`).join("\n")}

_Simulated agent output from supplied records. Quantities are fictional demo data._
`;
  return {
    summary: open.length ? `Not ready yet: ${open.join(", ")} depend on open supply.` : "All assessed materials covered from stock.",
    document_title: "Material readiness summary",
    document_markdown: markdown,
    missing_information: open.map((o) => `Confirmed supply for ${o}`),
    ask_colleague: "",
    question: "",
    question_reason: "",
  };
}

// ---------------------------------------------------------------------------
// Revise an existing document
// ---------------------------------------------------------------------------

export interface ReviseOutput {
  summary: string;
  revised_markdown: string;
}

export function revise(args: { instructions: string; title: string; content: string; instruction: string; sources: SourceInput[] }) {
  const task = `Revise the document below according to the instruction. Keep everything that the instruction doesn't ask to change. Return the full revised document.

<document title="${args.title}">
${args.content}
</document>

<sources>
${renderSources(args.sources)}
</sources>

<instruction>${args.instruction}</instruction>`;
  return runAgent<ReviseOutput>({
    instructions: args.instructions,
    task,
    submit: {
      name: "submit_revision",
      description: "Submit the full revised document.",
      properties: { summary: { type: "string" }, revised_markdown: { type: "string" } },
      required: ["summary", "revised_markdown"],
    },
    simulate: () => ({
      summary: `Revised per instruction: ${args.instruction}`,
      revised_markdown: `${args.content.trimEnd()}\n\n## Revision note\n\n${args.instruction}\n\n_This section was added by the simulated agent; review and edit it._\n`,
    }),
  });
}

// ---------------------------------------------------------------------------
// Delivery assessment (journey C) — quantities come from the system, not the model
// ---------------------------------------------------------------------------

export interface DeliveryFacts {
  item: string;
  /** Unit of measure, e.g. "kg". Empty for counted items described by name. */
  unit?: string;
  record: string;
  supplier: string;
  need_qty: number;
  need_date: string;
  available: number;
  incoming: number;
  due_date: string;
  arrives_in_time: boolean;
  expected_by_need_date: number;
  shortfall: number;
  risk_flag: string;
  record_version: number;
  change?: string | null;
  gap_note?: string | null;
}

export interface AssessOutput {
  summary: string;
  assessment_markdown: string;
}

export function assessDelivery(args: { instructions: string; procedure: string; facts: DeliveryFacts; trigger: string }) {
  const f = args.facts;
  const task = `Write the current delivery assessment. The quantities below were calculated by the system from the supplied records; use them as given.

<facts>
${JSON.stringify(f, null, 2)}
</facts>

<procedure>
${args.procedure || "(none)"}
</procedure>

<why_now>${args.trigger}</why_now>

Explain what is available, what is short, what remains uncertain, and what changed (if anything). State clearly that this covers ${f.item} only and does not establish that the whole production plan is ready. Do not recommend placing orders or changing schedules. Include a "Sources" section naming the production plan, inventory snapshot, and delivery record ${f.record} (version ${f.record_version}).`;

  return runAgent<AssessOutput>({
    instructions: args.instructions,
    task,
    submit: {
      name: "submit_assessment",
      description: "Submit the assessment document.",
      properties: { summary: { type: "string" }, assessment_markdown: { type: "string" } },
      required: ["summary", "assessment_markdown"],
    },
    simulate: () => simulateAssessment(f),
  });
}

export function simulateAssessment(f: DeliveryFacts): AssessOutput {
  const q = (n: number) => (f.unit ? `${n} ${f.unit}` : String(n));
  const what = f.unit ? `of ${f.item}` : f.item;
  const headline =
    f.shortfall > 0
      ? `${q(f.shortfall)} ${what} short by ${f.need_date}`
      : `${q(f.need_qty)} ${what} expected by ${f.need_date}, if ${f.record} arrives as scheduled`;
  const md = `## Current assessment

**${headline.charAt(0).toUpperCase()}${headline.slice(1)}.**

| | Quantity |
| --- | --- |
| Needed by ${f.need_date} | ${q(f.need_qty)} |
| Available now (unreserved) | ${q(f.available)} |
| Incoming on ${f.record}, due ${f.due_date} | ${q(f.incoming)} |
| Expected by ${f.need_date} | ${q(f.expected_by_need_date)} |
| Shortfall | ${q(f.shortfall)} |

${
  f.arrives_in_time
    ? `The result relies on ${f.record} arriving by ${f.due_date}. Without it, current stock covers ${q(f.available)} of ${q(f.need_qty)}.`
    : `${f.record} is due ${f.due_date}, after the ${f.need_date} need date, so its ${q(f.incoming)} don't count toward this requirement.`
}
${f.change ? `\n**What changed:** ${f.change}\n` : ""}${f.gap_note ? `\n**Observation gap:** ${f.gap_note}\n` : ""}
## Limits

- This assesses ${f.item} only. It doesn't establish that the whole production plan is ready.
- Arrival isn't the same as usable stock: receiving and quality checks still apply.
- No order has been placed, no supplier contacted, and no schedule changed.

## Sources

- Material requirement (need ${q(f.need_qty)} by ${f.need_date})
- Stock position (${q(f.available)} available)
- ${f.record} from ${f.supplier} (version ${f.record_version}; risk flag “${f.risk_flag}”)
`;
  return { summary: headline, assessment_markdown: md };
}
