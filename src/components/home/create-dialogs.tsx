"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect, InputGroup } from "@blueprintjs/core";
import { useOp, useView } from "@/lib/api";
import { EffectNote } from "@/components/ui/layout";

type DialogProps = { isOpen: boolean; onClose: () => void };

export function CreateDocumentDialog({ isOpen, onClose }: DialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const create = useOp("createOutput", { silent: true });

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const r = await create.mutateAsync({ title: title.trim() || "Untitled document" }).catch(() => null);
    if (r) {
      setTitle("");
      onClose();
      router.push(`/outputs/${r.output_id}`);
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New document" icon="document">
      <form onSubmit={submit}>
        <DialogBody>
          <FormGroup label="Title" labelFor="new-doc-title">
            <InputGroup id="new-doc-title" autoFocus value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Untitled document" />
          </FormGroup>
          <EffectNote>The document is private to you until you share it.</EffectNote>
          {create.error && (
            <Callout intent="danger" className="mt-3" compact>
              {create.error.message}
            </Callout>
          )}
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Cancel" onClick={onClose} />
              <Button type="submit" intent="primary" text="Create document" loading={create.isPending} />
            </>
          }
        />
      </form>
    </Dialog>
  );
}



/**
 * Open a case: one record that carries a whole piece of work — a sales order, say —
 * through every stage of a published procedure. The stages are steps inside this one
 * case, never separate tasks.
 */
export function CreateCaseDialog({ isOpen, onClose }: DialogProps) {
  const router = useRouter();
  const procedures = useView("caseProcedures", undefined, { enabled: isOpen, poll: false });
  const [procedureId, setProcedureId] = useState("");
  const [ref, setRef] = useState("");
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("Butter croissant, 80 g");
  const [quantity, setQuantity] = useState("");
  const [requested, setRequested] = useState("");
  const [value, setValue] = useState("");
  const open = useOp("openCase", { silent: true });

  const list = procedures.data?.procedures ?? [];
  const chosen = list.find((p) => p.id === procedureId) ?? list[0];

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chosen) return;
    const r = await open
      .mutateAsync({
        procedure_id: chosen.id,
        case_ref: ref.trim(),
        title: title.trim() || `Sales order ${ref.trim()}${customer.trim() ? ` — ${customer.trim()}` : ""}`,
        // What the stages calculate from: stock gap, recipe explosion, quoted prices.
        facts: {
          customer: customer.trim(),
          product: product.trim(),
          quantity: Number(quantity) || 0,
          unit: "pieces",
          requested_delivery: requested.trim(),
          ...(Number(value) ? { order_value: Number(value) } : {}),
        },
      })
      .catch(() => null);
    if (r) {
      setRef("");
      setTitle("");
      setCustomer("");
      setQuantity("");
      setRequested("");
      setValue("");
      onClose();
      router.push(`/tasks/${r.task_id}`);
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Open a case" icon="flow-linear">
      <form onSubmit={submit}>
        <DialogBody>
          {procedures.isPending ? (
            <p className="text-sm text-muted-foreground">Loading procedures…</p>
          ) : !list.length ? (
            <p className="text-sm text-muted-foreground">No procedure with stages is published yet.</p>
          ) : (
            <>
              <FormGroup label="Procedure" labelFor="case-procedure">
                <HTMLSelect
                  id="case-procedure"
                  fill
                  value={chosen?.id}
                  onChange={(e) => setProcedureId(e.currentTarget.value)}
                  options={list.map((p) => ({ value: p.id, label: `${p.name} · ${p.steps} steps` }))}
                />
              </FormGroup>
              <FormGroup label="Reference" labelFor="case-ref" helperText="The number the business uses, for example the sales order number.">
                <InputGroup id="case-ref" autoFocus value={ref} onChange={(e) => setRef(e.currentTarget.value)} placeholder="SO-4913" />
              </FormGroup>
              <FormGroup label="Customer" labelFor="case-customer">
                <InputGroup id="case-customer" value={customer} onChange={(e) => setCustomer(e.currentTarget.value)} placeholder="Al Waha Hotels" />
              </FormGroup>
              <FormGroup label="Product" labelFor="case-product" helperText="Matched against the finished-goods stock record and the recipe.">
                <InputGroup id="case-product" value={product} onChange={(e) => setProduct(e.currentTarget.value)} />
              </FormGroup>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormGroup label="Quantity (pieces)" labelFor="case-qty">
                  <InputGroup id="case-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.currentTarget.value)} placeholder="2000" />
                </FormGroup>
                <FormGroup label="Requested delivery" labelFor="case-date">
                  <InputGroup id="case-date" type="date" value={requested} onChange={(e) => setRequested(e.currentTarget.value)} />
                </FormGroup>
              </div>
              <FormGroup label="Order value (SAR, optional)" labelFor="case-value">
                <InputGroup id="case-value" type="number" value={value} onChange={(e) => setValue(e.currentTarget.value)} placeholder="19000" />
              </FormGroup>
              <FormGroup label="Title" labelFor="case-title" helperText="Leave empty to name it after the reference and customer.">
                <InputGroup id="case-title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Sales order SO-4913 — Al Waha Hotels" />
              </FormGroup>
              <EffectNote>
                {chosen?.purpose} The whole order stays one case: every stage is recorded as steps inside it.
              </EffectNote>
            </>
          )}
          {open.error && (
            <Callout intent="danger" className="mt-3" compact>
              {open.error.message}
            </Callout>
          )}
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Cancel" onClick={onClose} />
              <Button type="submit" intent="primary" text="Open case" loading={open.isPending} disabled={!chosen || !ref.trim() || !Number(quantity)} />
            </>
          }
        />
      </form>
    </Dialog>
  );
}
