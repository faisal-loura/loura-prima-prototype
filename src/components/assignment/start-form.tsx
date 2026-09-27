"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormGroup, HTMLSelect, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote, Eyebrow, KeyValue, Panel } from "@/components/ui/layout";
import { Avatar } from "@/components/ui/content";
import { Pill } from "@/components/ui/status";
import { useShell } from "@/components/shell/shell-context";
import { CheckList, InlineError, sourceKeyData } from "@/components/ui/common";

type Options = ViewData<"startOptions">;
type Rec = Options["records"][number];

const itemOf = (data: unknown) => (data && typeof data === "object" ? ((data as Record<string, unknown>).item as string | undefined) : undefined);

const defaultInstructions = (r: Rec | undefined) =>
  r
    ? `Keep the ${r.data.item} assessment current as ${r.external_id} changes. You may propose the risk flag change; never place orders or change schedules.`
    : "";

export function StartAssignmentForm({ options }: { options: Options }) {
  const router = useRouter();
  const shell = useShell();
  const firstAgent = options.agents.find((a) => /monitor/i.test(a.name)) ?? options.agents[0];
  const [agentId, setAgentId] = useState(firstAgent?.id ?? "");
  const [procedureId, setProcedureId] = useState(options.procedures[0]?.id ?? "");
  const [recordId, setRecordId] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [instructionsEdited, setInstructionsEdited] = useState(false);
  const [pendingMode, setPendingMode] = useState<"start" | "draft" | null>(null);
  // Errors show inline next to the buttons; the form keeps its input.
  const start = useOp("startOngoingAssignment", { silent: true });

  const agent = options.agents.find((a) => a.id === agentId);
  const record = options.records.find((r) => r.id === recordId);
  const item = record?.data.item;

  function chooseRecord(id: string) {
    setRecordId(id);
    const r = options.records.find((x) => x.id === id);
    setSourceIds(r ? options.sources.filter((s) => itemOf(s.data) && itemOf(s.data) === r.data.item).map((s) => s.id) : []);
    if (!instructionsEdited) setInstructions(defaultInstructions(r));
  }

  // Sources for the chosen record's item first, then everything else.
  const sortedSources = useMemo(() => {
    const matches = (s: Options["sources"][number]) => (item && itemOf(s.data) === item ? 0 : 1);
    return [...options.sources].sort((a, b) => matches(a) - matches(b) || a.title.localeCompare(b.title));
  }, [options.sources, item]);

  async function submit(draft: boolean) {
    setPendingMode(draft ? "draft" : "start");
    const r = await start
      .mutateAsync({
        agent_id: agentId,
        procedure_id: procedureId || null,
        record_id: recordId,
        source_ids: sourceIds,
        instructions,
        draft,
      })
      .catch(() => null);
    if (!r) {
      setPendingMode(null);
      return;
    }
    router.push(`/assignments/${r.assignment_id}`);
  }

  const ready = Boolean(agentId && recordId && sourceIds.length && instructions.trim());

  return (
    <form
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <Panel title="Assignment">
        <div className="space-y-4">
          <FormGroup label="Agent" labelFor="start-agent" helperText={agent?.purpose} className="!mb-0">
            <HTMLSelect
              id="start-agent"
              fill
              value={agentId}
              onChange={(e) => setAgentId(e.currentTarget.value)}
              options={[{ value: "", label: "Choose an agent" }, ...options.agents.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </FormGroup>

          <FormGroup
            label="Procedure"
            labelFor="start-procedure"
            labelInfo="(optional)"
            helperText={options.procedures.find((p) => p.id === procedureId)?.purpose ?? "Without a procedure, the agent works from its instructions only."}
            className="!mb-0"
          >
            <HTMLSelect
              id="start-procedure"
              fill
              value={procedureId}
              onChange={(e) => setProcedureId(e.currentTarget.value)}
              options={[{ value: "", label: "No procedure" }, ...options.procedures.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </FormGroup>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm">Record to follow</legend>
            {!options.records.length && <p className="text-xs text-muted-foreground">No connected records are available to you.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {options.records.map((r) => (
                <label
                  key={r.id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted ${recordId === r.id ? "border-brand/60 bg-muted/60" : ""}`}
                >
                  <input
                    type="radio"
                    name="start-record"
                    className="mt-1 accent-[rgb(var(--ink))]"
                    checked={recordId === r.id}
                    onChange={() => chooseRecord(r.id)}
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">
                      <span className="font-mono">{r.external_id}</span> · {r.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{r.connection}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      <span>
                        Due <span className="font-mono">{r.data.due_date}</span>
                      </span>
                      <span>Qty {r.data.quantity}</span>
                      <span>Risk flag: {r.data.risk_flag}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <CheckList
            label="Sources this assessment relies on"
            options={sortedSources.map((s) => ({
              value: s.id,
              label: (
                <>
                  {s.title} <span className="text-xs text-muted-foreground">v{s.version}</span>
                </>
              ),
              detail: sourceKeyData(s.data as Record<string, unknown>) || (s.kind === "document" ? "Document" : undefined),
            }))}
            value={sourceIds}
            onChange={setSourceIds}
            empty="No sources are available to you."
          />
          {record && !sourceIds.length && <p className="text-xs text-risk">Select the plan and inventory sources for {item}.</p>}

          <FormGroup label="Instructions" labelFor="start-instructions" className="!mb-0">
            <TextArea
              id="start-instructions"
              fill
              rows={4}
              value={instructions}
              placeholder="Choose a record to prefill these instructions."
              onChange={(e) => {
                setInstructions(e.currentTarget.value);
                setInstructionsEdited(true);
              }}
            />
          </FormGroup>
        </div>
      </Panel>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Panel title="Summary">
          <div className="space-y-4 text-sm">
            <div>
              <Eyebrow>Purpose</Eyebrow>
              <p className="mt-1">{record ? `Keep the ${item} assessment current as ${record.external_id} changes` : "Choose a record to follow."}</p>
            </div>
            <KeyValue
              items={[
                {
                  label: "Agent",
                  value: agent ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={agent.name} kind="agent" size={18} /> {agent.name} <span className="text-xs text-muted-foreground">(agent)</span>
                    </span>
                  ) : (
                    "—"
                  ),
                },
                {
                  label: "Responsible",
                  value: (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={shell?.me.full_name ?? "You"} size={18} /> {shell?.me.full_name ?? "You"} (you)
                    </span>
                  ),
                },
              ]}
            />
            <div className="space-y-2">
              <div>
                <Pill tone="ok" icon="tick">May do</Pill>
                <p className="mt-1">Update the Loura assessment and propose the sandbox risk flag change</p>
              </div>
              <div>
                <Pill tone="warn" icon="hand">Needs approval</Pill>
                <p className="mt-1">Changing the risk flag follows the organization&apos;s action rule</p>
              </div>
              <div>
                <Pill tone="danger" icon="disable">Can&apos;t do</Pill>
                <p className="mt-1">Place orders or change production schedules</p>
              </div>
            </div>
            <EffectNote>Start assignment runs the first assessment now. Save as draft starts nothing until you activate it.</EffectNote>
            <InlineError error={start.error} />
            <div className="flex flex-wrap gap-2" aria-live="polite">
              <Button type="submit" intent="primary" text="Start assignment" disabled={!ready || start.isPending} loading={pendingMode === "start"} />
              <Button variant="outlined" text="Save as draft" disabled={!ready || start.isPending} loading={pendingMode === "draft"} onClick={() => submit(true)} />
            </div>
          </div>
        </Panel>
      </div>
    </form>
  );
}
