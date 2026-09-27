"use client";

import { useEffect, useState } from "react";
import { BlueprintProvider, FocusStyleManager } from "@blueprintjs/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoticeProvider } from "@/lib/notices";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 1000 } },
      }),
  );

  useEffect(() => {
    FocusStyleManager.onlyShowFocusOnTabs();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BlueprintProvider>
        <NoticeProvider>{children}</NoticeProvider>
      </BlueprintProvider>
    </QueryClientProvider>
  );
}
