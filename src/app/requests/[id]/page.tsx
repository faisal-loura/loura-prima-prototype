"use client";

import { useView } from "@/lib/api";
import { PageHeader } from "@/components/ui/layout";
import { RequestPanel } from "@/components/requests/request-panel";
import { requestTypeInfo } from "@/components/requests/labels";

export default function RequestPage({ params }: { params: { id: string } }) {
  const q = useView("request", { id: params.id });
  const type = q.data ? requestTypeInfo(q.data.request.type).label : "Request";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/inbox", label: "Inbox" }}
        eyebrow="Request"
        title={type}
        subtitle="This is the same request shown in your Inbox."
      />
      <div className="rounded-xl border bg-card p-5">
        <RequestPanel requestId={params.id} />
      </div>
    </div>
  );
}
