"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsProvider, ConfirmActionsContext, CrossFilterProvider, PageStateProvider, Toaster, UiIntlProvider, WriteReachProvider } from "@tomas-tc/ui";
import { useState } from "react";
import { TOMAS_PAGE_STATE, TOMAS_VIEWER_ROLES } from "./config/tomas-ui.constants";
import { ROWS_ANALYTICS } from "./fixtures/tomas-ui.backend";
import { SAMPLE_WRITE_REACH } from "./fixtures/tomas-ui.screens";
import type { TomasUiProvidersProps } from "./types/tomas-ui.types";

export function TomasUiProviders({ locale, children }: TomasUiProvidersProps) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }));
  return (
    <QueryClientProvider client={client}>
      <UiIntlProvider locale={locale}>
        <ConfirmActionsContext.Provider value={false}>
          <WriteReachProvider reach={SAMPLE_WRITE_REACH}>
            <PageStateProvider state={TOMAS_PAGE_STATE} roles={TOMAS_VIEWER_ROLES}>
              <AnalyticsProvider source={ROWS_ANALYTICS}>
                <CrossFilterProvider>
                  {children}
                  <Toaster position="bottom-right" richColors />
                </CrossFilterProvider>
              </AnalyticsProvider>
            </PageStateProvider>
          </WriteReachProvider>
        </ConfirmActionsContext.Provider>
      </UiIntlProvider>
    </QueryClientProvider>
  );
}
