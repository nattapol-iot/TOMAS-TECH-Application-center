"use client";

import { BlockStyleDemo } from "./BlockStyleDemo";
import { DataHooksDemo } from "./DataHooksDemo";
import { IntlDemo } from "./IntlDemo";
import { PageScopeDemo } from "./PageScopeDemo";
import { PortalDemo } from "./PortalDemo";
import { StockMediaDemo } from "./StockMediaDemo";

export function UtilitiesSection() {
  return (
    <>
      <IntlDemo />
      <PageScopeDemo />
      <BlockStyleDemo />
      <DataHooksDemo />
      <PortalDemo />
      <StockMediaDemo />
    </>
  );
}
