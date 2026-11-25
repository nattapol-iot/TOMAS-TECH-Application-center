"use client";

import { DashboardPageDemo } from "./DashboardPageDemo";
import { ListPageDemo } from "./ListPageDemo";
import { PageHeaderDemo } from "./PageHeaderDemo";

export function PagesSection() {
  return (
    <>
      <PageHeaderDemo />
      <ListPageDemo />
      <DashboardPageDemo />
    </>
  );
}
