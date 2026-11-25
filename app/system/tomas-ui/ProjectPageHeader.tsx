"use client";
/*
 * The head of a project's page (task doc 5.2), on @tomas-tc/ui (owner 2026-11-25: "ใช้ Componance UI @tomas-tc/ui เป็นหลัก"):
 * back to the list, the number and name with the plan's health and the customer, the stage menu, Edit project and More,
 * the main facts, and the tabs. Everything it opens (Edit project, members, close, end user, delete) is the app's own
 * dialog, rendered by ProjectPage outside this island.
 */
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, NamedIcon, Tabs, TabsList, TabsTrigger } from "@tomas-tc/ui";
import type { ReactNode } from "react";
import { TomasUi } from "./TomasUi";

export type ProjectHeaderAction = { key: string; label: string; danger?: boolean; onSelect: () => void };

export type ProjectPageHeaderProps<Tab extends string> = {
  backLabel: string;
  onBack: () => void;
  title: string;
  health: { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" };
  customer: string;
  stage: { label: string; menuLabel: string; busy: boolean; options: { value: string; label: string; onSelect: () => void }[] } | null;
  edit: { label: string; onSelect: () => void } | null;
  more: { label: string; actions: ProjectHeaderAction[] };
  facts: { label: string; value: ReactNode }[];
  tabs: { id: Tab; label: string }[];
  activeTab: Tab;
  onTab: (tab: Tab) => void;
};

/** The plan's health in the Pegasus badge colours. */
const TONE_CLASS: Record<ProjectPageHeaderProps<string>["health"]["tone"], string> = {
  red: "border-transparent bg-red-100 text-red-700",
  amber: "border-transparent bg-amber-100 text-amber-800",
  blue: "border-transparent bg-sky-100 text-sky-800",
  green: "border-transparent bg-emerald-100 text-emerald-800",
  slate: "border-transparent bg-muted text-muted-foreground",
};

export function ProjectPageHeader<Tab extends string>(props: ProjectPageHeaderProps<Tab>) {
  return (
    <TomasUi className="project-page-head">
      <div className="grid gap-3" data-guide="projectPage.header">
        <div>
          <Button variant="outline" size="sm" onClick={props.onBack}>
            <NamedIcon name="chevron-left" />
            {props.backLabel}
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h1 className="truncate text-xl font-semibold text-foreground">{props.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className={TONE_CLASS[props.health.tone]}>
                {props.health.label}
              </Badge>
              {props.customer ? <span className="truncate">{props.customer}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.stage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={props.stage.busy} aria-label={props.stage.menuLabel} data-guide="projectPage.stage">
                    {props.stage.label}
                    <NamedIcon name="chevron-down" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {props.stage.options.map((option) => (
                    <DropdownMenuItem key={option.value} onSelect={option.onSelect}>
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {props.edit ? (
              <Button data-guide="projectPage.edit" onClick={props.edit.onSelect}>
                <NamedIcon name="pencil" />
                {props.edit.label}
              </Button>
            ) : null}
            {props.more.actions.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-guide="projectPage.more">
                    <NamedIcon name="ellipsis" />
                    {props.more.label}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {props.more.actions.map((action, index) => (
                    <div key={action.key}>
                      {action.danger && index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem variant={action.danger ? "destructive" : "default"} onSelect={action.onSelect}>
                        {action.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {props.facts.map((fact) => (
            <div key={fact.label} className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm font-medium text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <Tabs value={props.activeTab} onValueChange={(value) => props.onTab(value as Tab)}>
          <TabsList>
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} data-tab={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </TomasUi>
  );
}
