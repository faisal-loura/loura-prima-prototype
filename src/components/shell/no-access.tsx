"use client";

import { Button, NonIdealState } from "@blueprintjs/core";

/** Effective organization removal blocks all access, including earlier individual grants. */
export function NoAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <NonIdealState
        icon="lock"
        title="You don't have access to this organization"
        description="Your membership was removed or isn't active. Earlier shares don't provide access on their own."
        action={
          <form action="/auth/signout" method="post">
            <Button type="submit" text="Sign out" />
          </form>
        }
      />
    </div>
  );
}
