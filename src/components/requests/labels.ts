import type { IconName } from "@blueprintjs/icons";

export type RequestType = "information" | "review" | "authorization" | "task";

export const REQUEST_TYPE: Record<RequestType, { label: string; short: string; icon: IconName }> = {
  information: { label: "Information needed", short: "Information", icon: "help" },
  review: { label: "Review requested", short: "Review", icon: "eye-open" },
  authorization: { label: "Action approval", short: "Approval", icon: "key" },
  task: { label: "Task approval", short: "Task", icon: "tick-circle" },
};

export function requestTypeInfo(type: string) {
  return REQUEST_TYPE[type as RequestType] ?? { label: type, short: type, icon: "inbox" as IconName };
}

const RESPONSE_WORDS: Record<string, string> = {
  answer: "Answered",
  dont_know: "Didn't know — the information is still needed",
  suggest: "Suggested another person",
  accept: "Accepted the version",
  request_changes: "Requested changes",
  approve: "Approved",
  decline: "Declined",
};

export function responseWords(kind: string | null | undefined) {
  if (!kind) return "No response";
  return RESPONSE_WORDS[kind] ?? kind;
}
