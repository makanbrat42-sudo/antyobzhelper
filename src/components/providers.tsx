"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiClientError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        toastOptions={{ style: { background: "#12121C", border: "1px solid #26263a", color: "#ececf4" } }}
      />
    </QueryClientProvider>
  );
}
