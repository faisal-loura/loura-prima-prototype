"use client";

import { ConversationView } from "@/components/conversation/conversation-view";

export default function ConversationPage({ params }: { params: { id: string } }) {
  return <ConversationView id={params.id} />;
}
