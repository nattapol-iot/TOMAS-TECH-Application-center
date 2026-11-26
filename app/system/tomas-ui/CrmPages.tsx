"use client";
/*
 * The CRM screens on @tomas-tc/ui (owner 2026-11-26: list and detail pages move to the kit, the same for everyone; the
 * Sales V1/V2 switch no longer applies to CRM). CrmScreens.tsx loads this file lazily and keeps only the permission
 * gate and My Work's follow-up panel.
 *
 * Each part of a page is its own TomasUi root. The project hand-over panel (ProjectHandover), the company register
 * panel and the new-customer dialog are old app parts: they sit between the kit's roots, never inside one. The calls,
 * permissions, row versions and screen links are the old pages' own.
 */
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  NamedIcon,
  Notice,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@tomas-tc/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiClientError, assignmentDeliveryNote, type AssignmentNotificationResult, type BootstrapData } from "../api-client";
import { useLanguage, useT } from "../i18n";
import { idLink, useLinkedControl, useLinkedState } from "../screen-link";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { dealSummaryCells } from "../../../lib/sales-look";
import { ProjectHandover } from "../production/ProjectHandover";
import { CRM_COPY } from "../production/crm-copy";
import { crmRequest, formatDay, formatMoment, teamOptions, text, useCrmData, useCrmPages, type CrmOption, type CrmPage, type CrmRecord } from "../production/crm-records";
import { ConfigurationDialog, CrmFormDialog, EntityPicker, OpportunityDialog, type FieldSpec } from "./CrmForms";
import { Chips, EmptyBlock, FilterSelect, LoadError, LoadingRows, OpenLink, RecordTable, Section, StatusBadge, SummaryBar, Toolbar, money, toneOf, type Column } from "./CrmKitParts";
import { ActivitiesPanel, ActivityEditor, ActivityTimeline, ContactsPanel, CustomerListPage, CustomerPage, DocumentsPanel, useCodeLabel, useTableStates } from "./CrmPeoplePages";
import { TONE_BADGE } from "./tones";
import { TomasUi } from "./TomasUi";

import type { CrmView } from "../production/CrmScreens";
export type CrmPagesProps = {
  refreshBootstrap?: () => Promise<void>;
  notify?: (message: string) => void;
  bootstrap: BootstrapData;
  view: CrmView;
  onViewChange?: (view: CrmView) => void;
  preferredOpportunityId?: number | null;
  openInquiry: (id: number) => void;
  openEstimate: (id: number) => void;
  openProject: (id: number) => void;
};
type Detail = { opportunity: CrmRecord; activities: CrmRecord[]; followups: CrmRecord[]; history: CrmRecord[]; links: CrmRecord[] };

const STAGES = ["NEW", "QUALIFICATION", "REQUIREMENT", "ESTIMATING", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"];
/* Open stages in the order a deal travels through them; the summary bar, the board and the rail index off this list. */
const OPEN_STAGES = STAGES.filter((code) => !["WON", "LOST", "ON_HOLD"].includes(code));
/* What needs doing now, kept apart from deals that only lack data (CRM UX audit CRM-08). */
const ATTENTION_KEYS = ["Overdue", "DueToday", "NeedsFollowup", "EstimateDueSoon"];
const QUIET_KEYS = ["Waiting", "Incomplete"];
const ATTENTION_FILTERS = ["Actionable", ...ATTENTION_KEYS, "Waiting", "WaitingCustomer", "Incomplete", "NoNextAction", "NoActivity"];
const SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "due", label: "CRM.sortDue" },
  { value: "close", label: "CRM.expectedClose" },
];
/* The period of the deal views (owner 2026-11-26): deals whose expected close falls in it. The presets are the business
   calendar's month, quarter and year of today. */
const PERIODS = ["all", "month", "quarter", "year"] as const;
type Period = (typeof PERIODS)[number];
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
function periodRange(period: Period): { from: string; to: string } {
  if (period === "all") return { from: "", to: "" };
  const today = estimateBusinessDate(new Date(), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok"),
    year = Number(today.slice(0, 4)),
    month = Number(today.slice(5, 7));
  if (period === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  const first = period === "month" ? month : Math.floor((month - 1) / 3) * 3 + 1,
    last = period === "month" ? month : first + 2;
  return { from: `${year}-${String(first).padStart(2, "0")}-01`, to: lastDay(year, last) };
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const futureDate = (days: number) => estimateBusinessDate(new Date(Date.now() + days * 86_400_000), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const params = (values: Record<string, string>) => new URLSearchParams(Object.entries(values).filter(([, v]) => v !== ""));

function useOptions(options: CrmRecord[]) {
  const { lang } = useLanguage();
  return (kind: string): CrmOption[] =>
    options.filter((o) => o.kind === kind && o.isActive !== false).map((o) => ({ value: text(o.code), label: text(o[lang === "TH" ? "labelTh" : lang === "JP" ? "labelJa" : "labelEn"]) }));
}

/* ------------------------------------------------------------------ the screen */

export function CrmPages(props: CrmPagesProps) {
  const { bootstrap, view, preferredOpportunityId } = props,
    t = useT();
  // The open deal and customer are on the screen's link (screen-link.tsx); the screen remounts for each CRM view.
  const [opportunityId, setOpportunityId] = useLinkedState("opportunity", preferredOpportunityId ?? null, idLink, { remember: false }),
    [customerId, setCustomerId] = useLinkedState("customer", null, idLink, { remember: false }),
    [create, setCreate] = useState(false),
    [config, setConfig] = useState(false);
  const options = useCrmData<CrmRecord[]>("/api/v1/crm/options");
  // A deal opened from elsewhere replaces the one on show; the first pass keeps what the link opened.
  const shownDeal = useRef(preferredOpportunityId);
  useEffect(() => {
    if (shownDeal.current === preferredOpportunityId) return;
    shownDeal.current = preferredOpportunityId;
    const timer = setTimeout(() => {
      setOpportunityId(preferredOpportunityId ?? null);
      setCustomerId(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [preferredOpportunityId, setOpportunityId, setCustomerId]);
  const write = bootstrap.permissions.includes("crm.write");
  const list = !opportunityId && !customerId;
  const title = opportunityId
    ? "CRM Opportunities"
    : customerId
      ? "CRM Customers"
      : {
          "crm-dashboard": "CRM Dashboard",
          "crm-customers": "CRM Customers",
          "crm-contacts": "CRM Contacts",
          "crm-opportunities": "CRM Opportunities",
          "crm-activities": "CRM Activities",
          "crm-pipeline": "CRM Opportunities",
        }[view];
  const descriptions: Record<CrmView, string> = {
    "crm-dashboard": "CRM.introDashboard",
    "crm-customers": "CRM.introCustomers",
    "crm-contacts": "CRM.introContacts",
    "crm-opportunities": "CRM.introOpportunities",
    "crm-activities": "CRM.introActivities",
    "crm-pipeline": "CRM.introPipeline",
  };
  const showNew = list && ["crm-dashboard", "crm-opportunities", "crm-pipeline"].includes(view);
  const back = () => {
    setOpportunityId(null);
    setCustomerId(null);
  };
  return (
    <div className="crm-workspace">
      <TomasUi>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">CRM &amp; SALES</span>
              <h1 className="text-xl font-semibold text-foreground">{t(title)}</h1>
              {list ? <p className="text-sm text-muted-foreground">{t(descriptions[view])}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!list ? (
                <Button type="button" variant="outline" onClick={back}>
                  <NamedIcon name="chevron-left" className="size-4" />
                  {t("CRM.back")}
                </Button>
              ) : null}
              {bootstrap.permissions.includes("crm.configure") && view === "crm-dashboard" && list ? (
                <Button type="button" variant="outline" onClick={() => setConfig(true)}>
                  <NamedIcon name="settings" className="size-4" />
                  {t("CRM.configuration")}
                </Button>
              ) : null}
              {write && showNew ? (
                <Button type="button" data-guide="crm.new" onClick={() => setCreate(true)}>
                  <NamedIcon name="plus" className="size-4" />
                  {t("CRM.new")}
                </Button>
              ) : null}
            </div>
          </div>
          {list && props.onViewChange && (view === "crm-opportunities" || view === "crm-pipeline") ? (
            <div role="tablist" aria-label={t("CRM Opportunities")} className="inline-flex h-9 w-fit items-center gap-0.5 rounded-md bg-muted p-[3px]">
              {(["crm-opportunities", "crm-pipeline"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  data-tab={id}
                  aria-selected={view === id}
                  onClick={() => props.onViewChange?.(id)}
                  className="h-full rounded-[4px] px-3 text-sm font-medium text-muted-foreground transition-colors aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm"
                >
                  {t(id === "crm-opportunities" ? "CRM.listView" : "CRM.boardView")}
                </button>
              ))}
            </div>
          ) : null}
          {options.error ? (
            <div role="alert">
              <Notice tone="error">{t("CRM.loadFailed")}</Notice>
            </div>
          ) : null}
        </div>
      </TomasUi>
      {opportunityId ? (
        <DealPage
          {...props}
          id={opportunityId}
          options={options.data ?? []}
          openCustomer={(id) => {
            setCustomerId(id);
            setOpportunityId(null);
          }}
        />
      ) : customerId ? (
        <CustomerPage
          id={customerId}
          bootstrap={bootstrap}
          refreshBootstrap={props.refreshBootstrap}
          openOpportunity={setOpportunityId}
          openInquiry={props.openInquiry}
          openEstimate={props.openEstimate}
          openProject={props.openProject}
        />
      ) : view === "crm-customers" ? (
        <CustomerListPage bootstrap={bootstrap} refreshBootstrap={props.refreshBootstrap} open={setCustomerId} />
      ) : view === "crm-contacts" ? (
        <ContactsPanel bootstrap={bootstrap} />
      ) : view === "crm-activities" ? (
        <ActivitiesPanel bootstrap={bootstrap} openOpportunity={setOpportunityId} openCustomer={setCustomerId} />
      ) : (
        <DealListPage bootstrap={bootstrap} mode={view} options={options.data ?? []} open={setOpportunityId} openInquiry={props.openInquiry} onNew={write ? () => setCreate(true) : undefined} />
      )}
      {create ? <OpportunityEditor bootstrap={bootstrap} options={options.data ?? []} onClose={() => setCreate(false)} onSaved={(r) => setOpportunityId(Number(r.id))} /> : null}
      {config ? (
        <ConfigurationDialog
          options={options.data ?? []}
          onClose={() => setConfig(false)}
          onSave={async (v) => {
            await crmRequest(`/api/v1/crm/options/${v.kind}/${encodeURIComponent(text(v.code))}`, "PUT", v);
            options.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** The deal form (CrmForms OpportunityDialog); this side keeps the API call and the body it sends. */
function OpportunityEditor({
  bootstrap,
  options,
  initial,
  defaultStage,
  onClose,
  onSaved,
  onReload,
}: {
  bootstrap: BootstrapData;
  options: CrmRecord[];
  initial?: CrmRecord;
  defaultStage?: string;
  onClose: () => void;
  onSaved: (r: CrmRecord) => void;
  onReload?: () => void;
}) {
  const choice = useOptions(options);
  return (
    <OpportunityDialog
      bootstrap={bootstrap}
      choice={choice}
      initial={initial}
      defaultStage={defaultStage}
      onClose={onClose}
      onReload={
        onReload
          ? () => {
              onClose();
              onReload();
            }
          : undefined
      }
      onSave={async (v, create) => {
        const { nextActionText, nextActionDue, ...deal } = v,
          action = text(nextActionText).trim();
        // The first next action is saved with the deal, owned by the sales owner.
        const body = create && action ? { ...deal, nextAction: { action, ownerId: deal.salesOwnerId, dueDate: nextActionDue } } : deal;
        const result = await crmRequest<CrmRecord>(`/api/v1/crm/opportunities${initial ? `/${initial.id}` : ""}`, initial ? "PUT" : "POST", body);
        onSaved(result);
      }}
    />
  );
}

/* ------------------------------------------------------------------ deal list, dashboard and board */

function DealListPage({
  bootstrap,
  mode,
  options,
  open,
  openInquiry,
  onNew,
}: {
  bootstrap: BootstrapData;
  mode: CrmView;
  options: CrmRecord[];
  open: (id: number) => void;
  openInquiry: (id: number) => void;
  onNew?: () => void;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    states = useTableStates(),
    choice = useOptions(options),
    codeLabel = useCodeLabel();
  const [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [attention, setAttention] = useState(""),
    [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10),
    [owner, setOwner] = useState(""),
    [onlyOpen, setOnlyOpen] = useState(mode !== "crm-opportunities"),
    [sort, setSort] = useState("updated"),
    [edit, setEdit] = useState<CrmRecord | null>(null),
    [createStage, setCreateStage] = useState<string | null>(null);
  const write = bootstrap.permissions.includes("crm.write"),
    commercial = bootstrap.permissions.includes("crm.commercial.read"),
    board = mode === "crm-pipeline",
    me = String(bootstrap.user.id);
  // The search, the stage and the follow-up filter are on the screen's link; the follow-up filter is remembered.
  useLinkedControl("q", search, (v) => {
    setSearch(v);
    setPage(1);
  });
  useLinkedControl(
    "stage",
    stage,
    (v) => {
      setStage(v);
      setPage(1);
    },
    { valid: (v) => STAGES.includes(v) },
  );
  useLinkedControl(
    "attention",
    attention,
    (v) => {
      setAttention(v);
      setPage(1);
    },
    { remember: true, valid: (v) => ATTENTION_FILTERS.includes(v) },
  );
  // The period: deals expected to close between these dates, on the screen's link too (closeFrom, closeTo).
  const [closeFrom, setCloseFrom] = useState(""),
    [closeTo, setCloseTo] = useState("");
  useLinkedControl(
    "closeFrom",
    closeFrom,
    (v) => {
      setCloseFrom(v);
      setPage(1);
    },
    { valid: (v) => DAY.test(v) },
  );
  useLinkedControl(
    "closeTo",
    closeTo,
    (v) => {
      setCloseTo(v);
      setPage(1);
    },
    { valid: (v) => DAY.test(v) },
  );
  const pickPeriod = (period: Period) => {
    const range = periodRange(period);
    setCloseFrom(range.from);
    setCloseTo(range.to);
    setPage(1);
  };
  const period = PERIODS.find((key) => {
    const range = periodRange(key);
    return range.from === closeFrom && range.to === closeTo;
  });
  const [drag, setDrag] = useState<{ id: number; from: string } | null>(null),
    [over, setOver] = useState(""),
    [moved, setMoved] = useState<{ id: number; stage: string } | null>(null),
    [moveError, setMoveError] = useState("");
  const filters = { search, stage, attention, open: String(onlyOpen), ownerId: owner, sort, closeFrom, closeTo };
  const list = useCrmData<CrmPage>(board ? null : `/api/v1/crm/opportunities?${params({ ...filters, page: String(page), pageSize: String(perPage) })}`);
  // The board reads 100 cards a page and asks for the next 100 on request, so no deal is out of reach (CRM-05).
  const boardBase = board ? `/api/v1/crm/opportunities?${params({ ...filters, pageSize: "100" })}` : null,
    [boardPages, setBoardPages] = useState({ base: "", pages: 1 });
  const boardList = useCrmPages(boardBase, boardPages.base === boardBase ? boardPages.pages : 1);
  const dashboard = useCrmData<CrmRecord>(`/api/v1/crm/dashboard?${params({ closeFrom, closeTo })}`);
  const rows = board ? boardList.items : (list.shown?.items ?? []),
    loading = board ? boardList.loading : list.loading,
    failed = board ? boardList.error : list.error;
  const refresh = () => {
    if (board) boardList.refresh();
    else list.refresh();
    dashboard.refresh();
  };
  const label = (s: string) => choice("stage").find((o) => o.value === s)?.label ?? codeLabel(s);
  // The card sits in its new column from the moment it is dropped, and stays there until the refreshed list agrees.
  const pending = moved && !rows.some((r) => Number(r.id) === moved.id && text(r.stage) === moved.stage) ? moved : null;
  const boardRows = pending ? rows.map((r) => (Number(r.id) === pending.id ? { ...r, stage: pending.stage } : r)) : rows;
  /* Dropping a card is the same edit the dialog makes, so it takes the same PUT with the row version the card was drawn
     from: a board left open while someone else moved that deal is refused, never silently overwritten. */
  const moveTo = async (row: CrmRecord, next: string) => {
    const id = Number(row.id);
    if (!write || text(row.stage) === next) return;
    if (["PROPOSAL", "NEGOTIATION"].includes(next) && !row.proposalSentOn) {
      setEdit({ ...row, stage: next, previousStage: row.stage });
      return;
    }
    setMoveError("");
    setMoved({ id, stage: next });
    try {
      await crmRequest(`/api/v1/crm/opportunities/${id}`, "PUT", { stage: next, rowVersion: row.rowVersion });
      refresh();
    } catch (error) {
      setMoved(null);
      setMoveError(error instanceof ApiClientError && error.status === 409 ? "CRM.moveConflict" : "CRM.moveFailed");
    }
  };
  const dash = dashboard.data;
  const stageCounts = (dash?.stages as Record<string, number> | undefined) ?? {};
  const cells = dealSummaryCells(OPEN_STAGES, stageCounts, Number(dash?.open ?? 0));
  const pickCell = (key: string, pressed: boolean) => {
    const cell = pressed ? null : cells.find((c) => c.key === key);
    setSearch("");
    setOwner("");
    setAttention("");
    setStage(cell?.stage ?? "");
    setOnlyOpen(cell ? cell.open : mode !== "crm-opportunities");
    setPage(1);
  };
  const quick = owner === me && !attention ? "mine" : attention === "Actionable" ? "Actionable" : "";
  const pickQuick = (key: string) => {
    setSearch("");
    setStage("");
    setOwner(key === "mine" ? me : "");
    setAttention(key === "Actionable" ? "Actionable" : "");
    setOnlyOpen(true);
    setSort(key === "Actionable" ? "due" : "updated");
    setPage(1);
  };
  const pickAttention = (key: string) => {
    setSearch("");
    setOwner("");
    setStage("");
    setOnlyOpen(true);
    setAttention(key);
    setSort(key ? "due" : "updated");
    setPage(1);
  };
  // A period narrows the list as much as any filter: an empty list then says nothing matches, and Clear filters drops it too.
  const filtered = Boolean(search || stage || attention || owner || closeFrom || closeTo);
  const clear = (keepPeriod = false) => {
    setSearch("");
    setStage("");
    setAttention("");
    setOwner("");
    if (!keepPeriod) {
      setCloseFrom("");
      setCloseTo("");
    }
    setOnlyOpen(mode !== "crm-opportunities");
    setPage(1);
  };
  const empty = filtered ? (
    <EmptyBlock
      title={t("CRM.empty")}
      hint={t("CRM.emptyHint")}
      action={
        <Button type="button" variant="outline" size="sm" onClick={() => clear()}>
          {t("CRM.clearFilters")}
        </Button>
      }
    />
  ) : (
    <EmptyBlock
      icon="briefcase"
      title={t("CRM.noDeals")}
      hint={t("CRM.noDealsHint")}
      action={
        onNew ? (
          <Button type="button" size="sm" onClick={onNew}>
            <NamedIcon name="plus" className="size-4" />
            {t("CRM.new")}
          </Button>
        ) : null
      }
    />
  );
  const total = Number(dash?.totalOpportunities ?? 0);
  // Value and close date are two facts: each line says which one it is, and an empty one says "not specified" (CRM-15).
  const columns: Column<CrmRecord>[] = [
    ...(write
      ? [
          {
            key: "edit",
            label: t("Actions"),
            className: "w-10",
            render: (r: CrmRecord) => (
              <Button type="button" variant="ghost" size="icon-sm" title={t("Edit")} aria-label={`${t("Edit")}: ${text(r.name)}`} onClick={() => setEdit(r)}>
                <NamedIcon name="pencil" className="size-4" />
              </Button>
            ),
          },
        ]
      : []),
    {
      key: "stage",
      label: t("CRM.salesStage"),
      render: (r) => {
        const s = text(r.stage),
          status = text(r.inquiryStatus);
        return (
          <div className="grid justify-items-start gap-0.5">
            {s ? <StatusBadge code={s} label={label(s)} /> : "—"}
            {["PROPOSAL", "NEGOTIATION"].includes(s) && !r.proposalSentOn ? (
              <small className="text-xs text-amber-700">{t("CRM.unverifiedProposal")}</small>
            ) : s === "WON" && !r.wonOn ? (
              <small className="text-xs text-amber-700">{t("CRM.unverifiedWon")}</small>
            ) : null}
            {r.inquiryNo ? (
              <small className="text-xs text-muted-foreground">
                {r.inquiryId ? <OpenLink onOpen={() => openInquiry(Number(r.inquiryId))}>{text(r.inquiryNo)}</OpenLink> : text(r.inquiryNo)}
                {status ? ` · ${codeLabel(status)}` : ""}
              </small>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "deal",
      label: t("CRM.dealColumn"),
      className: "max-w-0 w-[30%]",
      render: (r) => (
        <div className="grid min-w-0 gap-0.5">
          <OpenLink className="crm-deal-name truncate" title={text(r.name)} onOpen={() => open(Number(r.id))}>
            {text(r.name) || "—"}
          </OpenLink>
          <small className="truncate font-mono text-xs text-muted-foreground">{text(r.opportunityNo)}</small>
        </div>
      ),
    },
    {
      key: "customer",
      label: t("CRM.customerName"),
      className: "max-w-0 w-[22%]",
      render: (r) => (
        <div className="grid min-w-0 gap-0.5" title={text(r.customerName)}>
          <span className="truncate">{text(r.customerName) || "—"}</span>
          <small className="truncate font-mono text-xs text-muted-foreground">{text(r.customerCode)}</small>
        </div>
      ),
    },
    {
      key: "value",
      label: t(commercial ? "CRM.valueCloseColumn" : "CRM.expectedClose"),
      className: "text-right",
      render: (r) =>
        commercial ? (
          <div className="grid justify-items-end gap-0.5">
            {r.expectedValue != null && r.expectedValue !== "" ? (
              <strong className="tabular-nums">{money(r.expectedValue)}</strong>
            ) : (
              <span className="text-xs text-muted-foreground">{t("CRM.valueNotSpecified")}</span>
            )}
            <small className="text-xs text-muted-foreground">
              {t("CRM.closeShort")} {formatDay(r.expectedClose, lang) || t("CRM.notSpecified")}
            </small>
          </div>
        ) : (
          <span className={r.expectedClose ? undefined : "text-muted-foreground"}>{formatDay(r.expectedClose, lang) || t("CRM.notSpecified")}</span>
        ),
    },
    {
      key: "owner",
      label: t("CRM.ownerNextColumn"),
      className: "max-w-0 w-[26%] max-[720px]:hidden",
      render: (r) => {
        const action = text(r.nextAction),
          flags = ((r.attention as string[]) ?? []).filter((a) => a !== "Scheduled" && a !== "DueSoon");
        return (
          <div className="grid min-w-0 gap-0.5">
            <span className="flex flex-wrap items-center gap-1">
              <span className="truncate">{text(r.salesOwnerName) || "—"}</span>
              {flags.slice(0, 2).map((a) => (
                <StatusBadge key={a} code={a} label={t(`CRM.${a}`)} />
              ))}
            </span>
            <small className="truncate text-xs text-muted-foreground" title={action || undefined}>
              {action ? `${action}${r.nextDue ? ` · ${formatDay(r.nextDue, lang)}` : ""}` : t("CRM.NoNextAction")}
            </small>
          </div>
        );
      },
    },
  ];
  return (
    <>
      <TomasUi>
        <div className="grid gap-3">
          {dashboard.error ? (
            <div role="alert">
              <Notice tone="error">{t("CRM.loadFailed")}</Notice>
            </div>
          ) : null}
          {/* The period every count and list below reads (CRM-16: the reference date is the expected close). */}
          <div className="grid gap-1.5" data-guide="crm.closeRange">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{t("CRM.closePeriod")}</span>
              <div role="radiogroup" aria-label={t("CRM.closePeriod")} className="inline-flex h-8 items-center gap-0.5 rounded-md bg-muted p-[3px]">
                {PERIODS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={period === key}
                    onClick={() => pickPeriod(key)}
                    className="h-full rounded-[4px] px-2.5 text-xs font-medium text-muted-foreground transition-colors aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm"
                  >
                    {t(`CRM.period_${key}`)}
                  </button>
                ))}
              </div>
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t("CRM.from")}
                <Input
                  type="date"
                  className="h-8 w-40"
                  value={closeFrom}
                  max={closeTo || undefined}
                  onChange={(e) => {
                    setCloseFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </Label>
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t("CRM.to")}
                <Input
                  type="date"
                  className="h-8 w-40"
                  value={closeTo}
                  min={closeFrom || undefined}
                  onChange={(e) => {
                    setCloseTo(e.target.value);
                    setPage(1);
                  }}
                />
              </Label>
            </div>
            {closeFrom || closeTo ? (
              <p role="status" className="text-xs text-muted-foreground">
                {t("CRM.periodScope")
                  .replace("{from}", formatDay(closeFrom, lang) || "…")
                  .replace("{to}", formatDay(closeTo, lang) || "…")}
                {Number(dash?.undated ?? 0) ? ` · ${t("CRM.periodUndated").replace("{n}", String(Number(dash?.undated ?? 0)))}` : ""}
              </p>
            ) : null}
          </div>
          <SummaryBar
            label={t("CRM.salesStage")}
            guide="crm.summary"
            cells={cells.map((cell) => ({
              key: cell.key,
              label: cell.stage ? label(cell.stage) : t("CRM.open"),
              value: cell.count,
              tone: cell.stage ? toneOf(cell.stage) : null,
              pressed: cell.stage === stage && (cell.stage !== "" || onlyOpen) && !attention && !owner,
            }))}
            onPick={pickCell}
          />
          <Chips
            label={t("CRM.pipelineOverview")}
            items={[
              { key: "mine", label: t("CRM.mine"), value: Number(dash?.mine ?? 0), tone: "blue" },
              { key: "Actionable", label: t("CRM.Actionable"), value: Number(dash?.actionable ?? 0), tone: "amber" },
            ]}
            active={quick}
            onPick={(key) => (key ? pickQuick(key) : clear(true))}
          />
          {mode === "crm-dashboard" ? (
            <Section title={t("CRM.pipelineOverview")} subtitle={t("CRM.allScopeHint")}>
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-guide="crm.attention">
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t("CRM.urgentGroup")}</span>
                  <Chips
                    label={t("CRM.urgentGroup")}
                    items={ATTENTION_KEYS.map((key) => ({ key, label: t(`CRM.${key}`), value: Number(dash?.[key] ?? 0), tone: toneOf(key) }))}
                    active={ATTENTION_KEYS.includes(attention) ? attention : ""}
                    onPick={pickAttention}
                  />
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t("CRM.notUrgentGroup")}</span>
                  <Chips
                    label={t("CRM.notUrgentGroup")}
                    quiet
                    items={QUIET_KEYS.map((key) => ({ key, label: t(`CRM.${key}`), value: Number(dash?.[key] ?? 0), tone: toneOf(key) }))}
                    active={QUIET_KEYS.includes(attention) ? attention : ""}
                    onPick={pickAttention}
                  />
                </div>
                {/* A funnel is only honest against a fixed denominator: each step is a share of every deal in scope. */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "CRM.convertedToInquiry", value: Number(dash?.convertedToInquiry ?? 0) },
                    { label: "CRM.convertedToEstimate", value: Number(dash?.convertedToEstimate ?? 0) },
                    { label: "CRM.convertedToProject", value: Number(dash?.convertedToProject ?? 0) },
                  ].map((step) => {
                    const share = total ? Math.round((step.value / total) * 100) : 0;
                    return (
                      <div key={step.label} className="grid gap-1.5">
                        <span className="text-xs text-muted-foreground">{t(step.label)}</span>
                        <strong className="flex items-baseline gap-2 text-lg font-semibold tabular-nums">
                          {step.value}
                          <em className="text-xs font-normal text-muted-foreground not-italic">{total ? `${share}%` : "—"}</em>
                        </strong>
                        <span className="h-1.5 rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{t("CRM.funnelBase").replace("{n}", String(total))}</p>
                <p className="text-xs text-muted-foreground">
                  {t("CRM.directInquiries")}: <strong className="text-foreground">{Number(dash?.directInquiries ?? 0)}</strong> · {t("CRM.directInquiriesHint")}
                </p>
              </div>
            </Section>
          ) : null}
          <Toolbar guide="crm.filters">
            <SearchInput
              className="w-72"
              value={search}
              placeholder={t("CRM.search")}
              aria-label={t("CRM.search")}
              onValueChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <FilterSelect
              label={t("CRM.stage")}
              allLabel={t("CRM.allStages")}
              value={stage}
              options={choice("stage")}
              onChange={(v) => {
                setStage(v);
                setPage(1);
              }}
            />
            <div className="w-52">
              <EntityPicker
                ariaLabel={t("CRM.ownerId")}
                placeholder={t("CRM.allOwners")}
                value={owner}
                options={teamOptions(bootstrap)}
                clearable
                onChange={(v) => {
                  setOwner(v);
                  setPage(1);
                }}
              />
            </div>
            <FilterSelect label={t("CRM.sort")} value={sort} options={SORTS.map((o) => ({ value: o.value, label: t(o.label) }))} onChange={(v) => setSort(v || "updated")} className="w-44" />
            <FilterSelect
              label={t("CRM.Actionable")}
              allLabel={t("CRM.allFollowups")}
              value={attention}
              options={ATTENTION_FILTERS.map((key) => ({ value: key, label: t(`CRM.${key}`) }))}
              onChange={(v) => {
                setAttention(v);
                setPage(1);
              }}
            />
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={onlyOpen}
                onCheckedChange={(checked) => {
                  setOnlyOpen(checked === true);
                  setPage(1);
                }}
              />
              {t("CRM.open")}
            </Label>
            {filtered ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => clear()}>
                {t("CRM.clearFilters")}
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button type="button" variant="outline" onClick={refresh}>
              <NamedIcon name="refresh-cw" className="size-4" />
              {t("Refresh")}
            </Button>
          </Toolbar>
          {board ? (
            <Board
              rows={boardRows}
              allRows={rows}
              total={boardList.total}
              loading={loading}
              failed={failed}
              onRetry={refresh}
              moveError={moveError}
              write={write}
              commercial={commercial}
              label={label}
              stageCounts={filtered ? null : stageCounts}
              drag={drag}
              over={over}
              setDrag={setDrag}
              setOver={setOver}
              onMove={(row, next) => void moveTo(row, next)}
              onOpen={(r) => open(Number(r.id))}
              onAdd={setCreateStage}
              onMore={() => setBoardPages({ base: boardBase ?? "", pages: (boardPages.base === boardBase ? boardPages.pages : 1) + 1 })}
              empty={empty}
            />
          ) : (
            <Section title={`${list.shown?.total ?? 0} ${t("CRM Opportunities")}`} subtitle={t("CRM.filteredResults")} guide="crm.deals" flush>
              <RecordTable
                label={t("CRM Opportunities")}
                columns={columns}
                rows={rows}
                rowKey={(r) => text(r.id)}
                loading={loading}
                failed={failed}
                onRetry={refresh}
                states={states}
                empty={empty}
                paging={
                  list.shown
                    ? {
                        page,
                        perPage,
                        total: list.shown.total,
                        onPage: setPage,
                        onPerPage: (n) => {
                          setPerPage(n);
                          setPage(1);
                        },
                      }
                    : null
                }
              />
            </Section>
          )}
        </div>
      </TomasUi>
      {edit ? <OpportunityEditor bootstrap={bootstrap} options={options} initial={edit} onClose={() => setEdit(null)} onSaved={refresh} onReload={refresh} /> : null}
      {createStage ? (
        <OpportunityEditor
          bootstrap={bootstrap}
          options={options}
          defaultStage={createStage}
          onClose={() => setCreateStage(null)}
          onSaved={(r) => {
            setCreateStage(null);
            open(Number(r.id));
          }}
        />
      ) : null}
    </>
  );
}

/* The board: one column per open stage, cards dragged between them (the same PUT the form makes). */
function Board({
  rows,
  allRows,
  total,
  loading,
  failed,
  onRetry,
  moveError,
  write,
  commercial,
  label,
  stageCounts,
  drag,
  over,
  setDrag,
  setOver,
  onMove,
  onOpen,
  onAdd,
  onMore,
  empty,
}: {
  rows: CrmRecord[];
  allRows: CrmRecord[];
  total: number;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  moveError: string;
  write: boolean;
  commercial: boolean;
  label: (code: string) => string;
  stageCounts: Record<string, number> | null;
  drag: { id: number; from: string } | null;
  over: string;
  setDrag: (drag: { id: number; from: string } | null) => void;
  setOver: (update: (current: string) => string) => void;
  onMove: (row: CrmRecord, stage: string) => void;
  onOpen: (row: CrmRecord) => void;
  onAdd: (stage: string) => void;
  onMore: () => void;
  empty: ReactNode;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    states = useTableStates();
  return (
    <div className="grid gap-2">
      {moveError ? (
        <div role="alert">
          <Notice tone="error">{t(moveError)}</Notice>
        </div>
      ) : null}
      {failed ? (
        <div role="alert">
          <Notice tone="error">
            {states.failed}{" "}
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
              {states.retry}
            </Button>
          </Notice>
        </div>
      ) : null}
      {total > allRows.length ? (
        <p role="status" className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground crm-board-count">
          {t("CRM.boardShowing").replace("{shown}", String(allRows.length)).replace("{total}", String(total))}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onMore}>
            {t("CRM.loadMore")}
          </Button>
        </p>
      ) : null}
      {!allRows.length && !loading ? (
        <Section flush>{empty}</Section>
      ) : (
        <div className="grid auto-cols-[minmax(13.5rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 max-[620px]:auto-cols-[86%]" data-guide="crm.deals">
          {OPEN_STAGES.map((s) => {
            const stageRows = rows.filter((r) => r.stage === s),
              all = stageCounts?.[s];
            return (
              <section
                key={s}
                data-stage={s}
                aria-label={label(s)}
                className={`grid content-start gap-2 rounded-md border bg-muted/30 p-2 ${over === s && drag && drag.from !== s ? "ring-2 ring-primary" : ""}`}
                onDragOver={(event) => {
                  if (!drag || drag.from === s) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(() => s);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === s ? "" : current));
                }}
                onDrop={(event) => {
                  if (!drag) return;
                  event.preventDefault();
                  const row = allRows.find((r) => Number(r.id) === drag.id);
                  setOver(() => "");
                  setDrag(null);
                  if (row) onMove(row, s);
                }}
              >
                <header className="flex items-center justify-between gap-2 px-1">
                  <h3 className="text-xs font-semibold text-foreground">{label(s)}</h3>
                  <Badge variant="outline" className={TONE_BADGE[toneOf(s)]}>
                    {all != null && all !== stageRows.length ? `${stageRows.length}/${all}` : stageRows.length}
                  </Badge>
                </header>
                {stageRows.map((r) => (
                  <button
                    key={text(r.id)}
                    type="button"
                    draggable={write}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", text(r.id));
                      setDrag({ id: Number(r.id), from: text(r.stage) });
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(() => "");
                    }}
                    onClick={() => onOpen(r)}
                    className={`crm-opportunity-card grid gap-1 rounded-md border bg-card p-2.5 text-left shadow-xs transition-colors hover:border-primary ${drag?.id === Number(r.id) ? "opacity-50" : ""}`}
                  >
                    <strong className="line-clamp-2 text-sm font-medium text-foreground">{text(r.name)}</strong>
                    <span className="truncate text-xs text-muted-foreground">{text(r.customerName)}</span>
                    {commercial ? <span className="text-xs tabular-nums">{money(r.expectedValue)}</span> : null}
                    <span className="text-xs text-muted-foreground">
                      {t("CRM.closeShort")} {formatDay(r.expectedClose, lang) || t("CRM.notSpecified")}
                    </span>
                    <small className="truncate text-xs text-muted-foreground">
                      {text(r.nextAction) || t("CRM.NoNextAction")} {formatDay(r.nextDue, lang)}
                    </small>
                    <span className="flex flex-wrap gap-1">
                      {((r.attention as string[]) ?? [])
                        .filter((a) => a !== "Scheduled" && a !== "DueSoon")
                        .map((a) => (
                          <StatusBadge key={a} code={a} label={t(`CRM.${a}`)} />
                        ))}
                    </span>
                  </button>
                ))}
                {write ? (
                  <Button type="button" variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => onAdd(s)}>
                    <NamedIcon name="plus" className="size-4" />
                    {t("CRM.new")}
                  </Button>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the deal */

/**
 * An audit row's before/after as changed fields in words (people and customers by name, options by their label); the raw
 * record stays behind "technical details". A record's creation lists nothing: its action already says it.
 */
function HistoryChanges({ before, after, describe }: { before: unknown; after: unknown; describe: (key: string, value: unknown) => string | null }) {
  const t = useT(),
    { lang } = useLanguage();
  const parse = (v: unknown): CrmRecord => {
    try {
      return typeof v === "string" && v ? (JSON.parse(v) as CrmRecord) : {};
    } catch {
      return {};
    }
  };
  const was = parse(before),
    now = parse(after),
    skip = ["rowVersion", "updatedAt", "updatedBy", "createdAt", "createdBy", "deletedAt", "deletedBy", "id", "stageChangedAt", "opportunityNo"];
  // Dates and moments read in the reader's language and the business clock, never as raw ISO text (CRM-17).
  const show = (key: string, v: unknown) => {
    if (v == null || v === "") return "—";
    const named = describe(key, v);
    if (named !== null) return named;
    if (/^\d{4}-\d{2}-\d{2}T/.test(text(v))) return formatMoment(v, lang);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text(v))) return formatDay(v, lang);
    return CRM_COPY[`CRM.${text(v)}`] ? t(`CRM.${text(v)}`) : text(v);
  };
  const changed = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((key) => !skip.includes(key) && JSON.stringify(was[key] ?? null) !== JSON.stringify(now[key] ?? null));
  if (!changed.length || !Object.keys(was).length) return null;
  return (
    <ul className="crm-history-changes grid gap-0.5 text-xs text-muted-foreground">
      {changed.slice(0, 12).map((key) => (
        <li key={key}>
          <span>{CRM_COPY[`CRM.${key}`] ? t(`CRM.${key}`) : key}</span>: <del>{show(key, was[key])}</del> → <strong className="text-foreground">{show(key, now[key])}</strong>
        </li>
      ))}
    </ul>
  );
}

/* The stage rail (CRM-14): the open stages in order, then the outcome, won or lost, as one end. On hold says so beside it. */
function StageRail({ stage, labelOf }: { stage: string; labelOf: (code: string) => string }) {
  const t = useT(),
    at = OPEN_STAGES.indexOf(stage),
    closed = stage === "WON" || stage === "LOST";
  return (
    <div className="flex min-w-0 items-center gap-2">
      {stage === "ON_HOLD" ? <StatusBadge code="ON_HOLD" label={labelOf("ON_HOLD")} /> : null}
      <ol className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" data-guide="crm.stagebar" aria-label={t("CRM.stage")}>
        {OPEN_STAGES.map((s, index) => (
          <li
            key={s}
            aria-current={index === at ? "step" : undefined}
            className={`min-w-24 flex-1 px-2 py-1.5 text-center text-[11px] font-semibold whitespace-nowrap first:rounded-l-md ${index === at ? "bg-primary text-primary-foreground" : closed || (at > -1 && index < at) ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {labelOf(s)}
          </li>
        ))}
        <li
          aria-current={closed ? "step" : undefined}
          className={`min-w-28 flex-1 rounded-r-md px-2 py-1.5 text-center text-[11px] font-semibold whitespace-nowrap ${stage === "WON" ? "bg-emerald-600 text-white" : stage === "LOST" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"}`}
        >
          {closed ? labelOf(stage) : `${labelOf("WON")} / ${labelOf("LOST")}`}
        </li>
      </ol>
    </div>
  );
}

const DEAL_TABS = ["overview", "contacts", "activities", "links", "documents", "history"];
type DealAction = { id: string; label: string; guide?: string; onSelect: () => void };

function DealPage({ id, options, openCustomer, ...props }: CrmPagesProps & { id: number; options: CrmRecord[]; openCustomer: (id: number) => void }) {
  const t = useT(),
    { lang } = useLanguage(),
    states = useTableStates(),
    choice = useOptions(options),
    codeLabel = useCodeLabel();
  const [tab, setTab] = useState("overview"),
    [editor, setEditor] = useState<string | null>(null),
    [action, setAction] = useState<CrmRecord | null>(null);
  const state = useCrmData<Detail>(`/api/v1/crm/opportunities/${id}`),
    o = state.shown?.opportunity,
    bootstrap = props.bootstrap,
    write = bootstrap.permissions.includes("crm.write");
  if (!o)
    return (
      <TomasUi>
        <Section flush>{state.error ? <LoadError message={states.failed} retryLabel={states.retry} onRetry={state.refresh} /> : <LoadingRows label={states.loading} />}</Section>
      </TomasUi>
    );
  const detail = state.shown!;
  const stage = text(o.stage),
    openDeal = !["WON", "LOST", "ON_HOLD"].includes(stage),
    labelOf = (s: string) => choice("stage").find((x) => x.value === s)?.label ?? codeLabel(s);
  const activeInquiry = detail.links.find((r) => !["Approved", "Cancelled"].includes(text(r.inquiryStatus)));
  const latestInquiry = activeInquiry ?? detail.links[0];
  const canConvert = bootstrap.permissions.includes("crm.convert") && openDeal;
  // One primary button, the step this stage calls for; every other action sits under "More" (CRM-09).
  const actions: Record<string, DealAction | null> = {
    convert: !activeInquiry && canConvert ? { id: "convert", label: t(latestInquiry ? "CRM.additionalInquiry" : "CRM.convert"), guide: "crm.convert", onSelect: () => setEditor("convert") } : null,
    proposal: write && openDeal ? { id: "proposal", label: t("CRM.recordProposal"), guide: "crm.recordProposal", onSelect: () => setEditor("proposal") } : null,
    won: write && openDeal ? { id: "won", label: t("CRM.recordWon"), guide: "crm.recordWon", onSelect: () => setEditor("won") } : null,
    inquiry: latestInquiry ? { id: "inquiry", label: t(activeInquiry ? "CRM.openInquiry" : "CRM.latestInquiry"), onSelect: () => props.openInquiry(Number(latestInquiry.inquiryId)) } : null,
    edit: write ? { id: "edit", label: t("CRM.editDeal"), guide: "crm.edit", onSelect: () => setEditor("opportunity") } : null,
    customer: { id: "customer", label: t("CRM.openCustomer360"), onSelect: () => openCustomer(Number(o.customerId)) },
  };
  const order = ["NEW", "QUALIFICATION", "REQUIREMENT"].includes(stage)
    ? ["convert", "inquiry", "proposal"]
    : stage === "ESTIMATING"
      ? o.proposalSentOn
        ? ["won", "inquiry"]
        : ["proposal", "inquiry", "convert"]
      : ["PROPOSAL", "NEGOTIATION"].includes(stage)
        ? ["won", "proposal"]
        : ["inquiry"];
  const primaryKey = order.find((key) => actions[key]);
  const primary = primaryKey ? actions[primaryKey]! : null;
  const others = Object.values(actions).filter((item): item is DealAction => Boolean(item) && item !== primary);
  const nextFollowup = detail.followups.find((f) => !["Done", "Cancelled"].includes(text(f.status)));
  const followupFields: FieldSpec[] = [
    { key: "action", required: true, wide: true, maxLength: 1000 },
    { key: "ownerId", required: true, searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(bootstrap) },
    { key: "dueDate", required: true, type: "date" },
    { key: "priority", options: ["Low", "Normal", "High", "Urgent"].map((s) => ({ value: s, label: t(s) })) },
    { key: "status", options: ["Open", "WaitingCustomer", "WaitingInternal", "WaitingSupplier", "Done", "Cancelled"].map((s) => ({ value: s, label: t(`CRM.${s}`) })) },
  ];
  const ownerName = (userId: unknown) => bootstrap.team.find((u) => u.id === Number(userId))?.name;
  const reload = () => {
    setEditor(null);
    state.refresh();
  };
  // History values: who and which customer by name, options and stages by their label, money as money.
  const describe = (key: string, value: unknown): string | null => {
    if (/ownerId$/i.test(key)) return ownerName(value) ?? `#${text(value)}`;
    if (key === "customerId" || key === "endUserCustomerId") return bootstrap.customers.find((c) => c.id === Number(value))?.name ?? `#${text(value)}`;
    if (key === "source" || key === "lostReason") return choice(key).find((option) => option.value === text(value))?.label ?? text(value);
    if (key === "stage") return labelOf(text(value));
    if (key === "priority") return t(text(value));
    if (key === "expectedValue") return money(value);
    return null;
  };
  const facts: { label: string; value: ReactNode }[] = [
    {
      label: t("CRM.customerId"),
      value: (
        <OpenLink onOpen={() => openCustomer(Number(o.customerId))}>
          {text(o.customerName)}
          {o.customerCode ? ` (${text(o.customerCode)})` : ""}
        </OpenLink>
      ),
    },
    { label: `${t("CRM.salesOwnerId")} / ${t("CRM.technicalOwnerId")}`, value: `${ownerName(o.salesOwnerId) ?? "—"} / ${ownerName(o.technicalOwnerId) ?? "—"}` },
    ...(bootstrap.permissions.includes("crm.commercial.read") ? [{ label: t("CRM.expectedValue"), value: o.expectedValue != null ? money(o.expectedValue) : t("CRM.notSpecified") }] : []),
    { label: t("CRM.expectedClose"), value: formatDay(o.expectedClose, lang) || t("CRM.notSpecified") },
  ];
  const evidence = o.proposalSentOn || o.wonOn;
  const writableActivity = bootstrap.permissions.includes("crm.activity.write");
  return (
    <>
      <TomasUi>
        <Section
          title={
            <span className="text-base">
              <span className="font-mono text-muted-foreground">{text(o.opportunityNo)}</span> · {text(o.name)}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2" data-guide="crm.actions">
              {others.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" data-guide="crm.more">
                      {t("CRM.moreActions")}
                      <NamedIcon name="chevron-down" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    {others.map((item) => (
                      <DropdownMenuItem key={item.id} data-guide={item.guide} onSelect={item.onSelect}>
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {primary ? (
                <Button type="button" data-guide={primary.guide} onClick={primary.onSelect}>
                  {primary.label}
                </Button>
              ) : null}
            </div>
          }
        >
          <div className="grid gap-4">
            <p className="text-sm" data-guide="crm.nextStep">
              <span className="text-xs font-semibold text-muted-foreground">{t("CRM.nextStep")}</span> <strong>{primary ? primary.label : openDeal ? t("CRM.nextStepNone") : labelOf(stage)}</strong>
              {nextFollowup ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {text(nextFollowup.action)} · {formatDay(nextFollowup.dueDate, lang)}
                </span>
              ) : openDeal ? (
                <span className="text-muted-foreground"> · {t("CRM.NoNextAction")}</span>
              ) : null}
            </p>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
              {facts.map((fact) => (
                <div key={fact.label} className="grid gap-0.5 rounded-md border bg-muted/20 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="truncate text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <StageRail stage={stage} labelOf={labelOf} />
            {["PROPOSAL", "NEGOTIATION"].includes(stage) && !o.proposalSentOn ? <Notice tone="warning">{t("CRM.unverifiedProposal")}</Notice> : null}
            {stage === "WON" && !o.wonOn ? <Notice tone="warning">{t("CRM.unverifiedWon")}</Notice> : null}
            {evidence ? (
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3 text-sm">
                {[
                  { label: t("CRM.proposalSentOn"), value: formatDay(o.proposalSentOn, lang) },
                  { label: t("CRM.proposalReference"), value: text(o.proposalReference) },
                  { label: t("CRM.wonOn"), value: formatDay(o.wonOn, lang) },
                  { label: t("CRM.wonReference"), value: text(o.wonReference) },
                ].map((fact) => (
                  <div key={fact.label} className="grid gap-0.5">
                    <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                    <dd>{fact.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </Section>
      </TomasUi>
      {latestInquiry && bootstrap.permissions.includes("inquiry.read") ? (
        <ProjectHandover
          key={`${id}:${text(o.rowVersion)}`}
          inquiryId={Number(latestInquiry.inquiryId)}
          bootstrap={bootstrap}
          refreshBootstrap={props.refreshBootstrap ?? (async () => {})}
          notify={props.notify ?? (() => {})}
          openProject={props.openProject}
        />
      ) : null}
      <TomasUi>
        <div className="grid gap-3">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="overflow-x-auto">
              <TabsList>
                {DEAL_TABS.map((k) => (
                  <TabsTrigger key={k} value={k} data-guide={`crm.tab.${k}`}>
                    {t(`CRM.${k}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          {tab === "overview" ? (
            <>
              <Section
                title={t("CRM.followups")}
                guide="crm.followups"
                actions={
                  write ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setAction(null);
                        setEditor("action");
                      }}
                    >
                      <NamedIcon name="plus" className="size-4" />
                      {t("CRM.addAction")}
                    </Button>
                  ) : null
                }
              >
                <div className="grid gap-2">
                  {!nextFollowup ? <Notice tone="warning">{t("CRM.NoNextAction")}</Notice> : null}
                  <ul className="grid divide-y">
                    {detail.followups.map((f) => (
                      <li key={text(f.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="grid gap-0.5">
                          <strong className="text-sm font-medium">{text(f.action)}</strong>
                          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {text(f.ownerName)} · {formatDay(f.dueDate, lang)} <StatusBadge code={text(f.status)} label={t(`CRM.${text(f.status)}`)} />
                          </span>
                        </div>
                        {write || Number(f.ownerId) === bootstrap.user.id ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAction(f);
                              setEditor("action");
                            }}
                          >
                            {t("Edit")}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
              <Section title={t("CRM.overview")}>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    { key: "endUser", label: t("CRM.endUserCustomerId"), value: text(o.endUserName) || t("CRM.notSpecified") },
                    { key: "last", label: t("CRM.lastActivity"), value: formatMoment(detail.activities[0]?.occurredAt, lang) || t("CRM.noActivitiesYet") },
                    ...["need", "scope", "internalNote"].map((k) => ({ key: k, label: t(`CRM.${k}`), value: text(o[k]) || t("CRM.notSpecified") })),
                  ].map((fact) => (
                    <div key={fact.key} className="grid gap-0.5">
                      <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                      <dd className="text-sm whitespace-pre-line">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            </>
          ) : null}
          {tab === "activities" ? (
            <Section
              title={t("CRM.activities")}
              flush
              actions={
                writableActivity ? (
                  <Button type="button" size="sm" data-guide="crm.addActivity" onClick={() => setEditor("activity")}>
                    <NamedIcon name="plus" className="size-4" />
                    {t("CRM.addActivity")}
                  </Button>
                ) : null
              }
            >
              <ActivityTimeline
                bootstrap={bootstrap}
                rows={detail.activities}
                empty={<EmptyBlock icon="calendar" title={t("CRM.noActivitiesDeal")} hint={t(writableActivity ? "CRM.noActivitiesHint" : "CRM.noActivitiesReadOnly")} />}
              />
            </Section>
          ) : null}
          {tab === "links" ? (
            detail.links.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {detail.links.map((r, i) => (
                  <Section key={i}>
                    <div className="grid gap-1.5 text-sm">
                      <OpenLink onOpen={() => props.openInquiry(Number(r.inquiryId))}>
                        {text(r.inquiryNo)} · {codeLabel(text(r.inquiryStatus))}
                      </OpenLink>
                      {r.estimateId && bootstrap.permissions.includes("estimate.read") ? (
                        <OpenLink onOpen={() => props.openEstimate(Number(r.estimateId))}>
                          {text(r.estimateNo)} · R{text(r.revision)} · {codeLabel(text(r.estimateStatus))}
                          {r.total != null ? ` · ${money(r.total)}` : ""}
                        </OpenLink>
                      ) : null}
                      {r.projectId && bootstrap.permissions.includes("project.read") ? (
                        <OpenLink onOpen={() => props.openProject(Number(r.projectId))}>
                          {text(r.projectNo)} · {codeLabel(text(r.projectStatus))}
                        </OpenLink>
                      ) : null}
                    </div>
                  </Section>
                ))}
              </div>
            ) : (
              <Section flush>
                <EmptyBlock icon="link" title={t("CRM.noLinks")} hint={t(canConvert ? "CRM.noLinksHint" : "CRM.noLinksReadOnly")} />
              </Section>
            )
          ) : null}
          {tab === "documents" ? <DocumentsPanel bootstrap={bootstrap} customerId={Number(o.customerId)} opportunityId={id} /> : null}
          {tab === "history" ? (
            <Section title={t("CRM.history")} flush>
              <ol className="crm-timeline grid divide-y">
                {detail.history.map((r) => (
                  <li key={text(r.id)} className="grid gap-1 px-4 py-3">
                    <strong className="text-sm font-medium">
                      {text(r.action)
                        .split(":")
                        .map((k) => (CRM_COPY[`CRM.${k}`] ? t(`CRM.${k}`) : k))
                        .join(" · ")}
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      {text(r.actorName)} · {formatMoment(r.occurredAt, lang)}
                    </p>
                    <HistoryChanges before={r.beforeJson} after={r.afterJson} describe={describe} />
                    {r.afterJson ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">{t("CRM.technicalDetails")}</summary>
                        <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 whitespace-pre-wrap">
                          {text(r.beforeJson)}
                          {"\n"}
                          {text(r.afterJson)}
                        </pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>
      </TomasUi>
      {tab === "contacts" ? <ContactsPanel bootstrap={bootstrap} customerId={Number(o.customerId)} /> : null}
      {editor === "opportunity" ? <OpportunityEditor bootstrap={bootstrap} options={options} initial={o} onClose={() => setEditor(null)} onSaved={state.refresh} onReload={state.refresh} /> : null}
      {editor === "action" ? (
        <CrmFormDialog
          title={action ? "CRM.editAction" : "CRM.addAction"}
          description={text(o.name)}
          initial={action ?? { ownerId: bootstrap.user.id, priority: "Normal", status: "Open" }}
          fields={followupFields}
          onClose={() => setEditor(null)}
          onReload={reload}
          onSave={async (v) => {
            await crmRequest(`/api/v1/crm/opportunities/${id}/followups${action ? `/${action.id}` : ""}`, action ? "PUT" : "POST", v);
            state.refresh();
          }}
        />
      ) : null}
      {editor === "activity" ? <ActivityEditor bootstrap={bootstrap} customerId={Number(o.customerId)} opportunityId={id} onClose={() => setEditor(null)} onSaved={state.refresh} /> : null}
      {editor === "proposal" || editor === "won" ? (
        <CrmFormDialog
          title={editor === "proposal" ? "CRM.recordProposal" : "CRM.recordWon"}
          description={`${text(o.opportunityNo)} · ${text(o.name)}`}
          initial={{ ...o, stage: editor === "won" ? "WON" : stage === "NEGOTIATION" ? "NEGOTIATION" : "PROPOSAL" }}
          intro={{ lines: ["CRM.evidenceHint"] }}
          guide="crm.evidence"
          fields={(v) => evidenceFieldsFor(v)}
          onClose={() => setEditor(null)}
          onReload={reload}
          onSave={async (v) => {
            await crmRequest(`/api/v1/crm/opportunities/${id}`, "PUT", v);
            state.refresh();
          }}
        />
      ) : null}
      {editor === "convert" ? (
        <CrmFormDialog
          title="CRM.convert"
          description={`${text(o.opportunityNo)} · ${text(o.name)}`}
          submitLabel="CRM.convertSubmit"
          initial={{ estimateOwnerId: o.technicalOwnerId ?? bootstrap.user.id, projectType: "IoT", dueDate: futureDate(14) }}
          intro={{ guide: "crm.convert.carry", title: t("CRM.pendingOpportunity"), lines: ["CRM.convertHint", "CRM.autoFilledHint", "CRM.filesInherited"] }}
          fields={[
            { key: "estimateOwnerId", required: true, searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(bootstrap), guide: "crm.convert.owner" },
            { key: "dueDate", required: true, type: "date", guide: "crm.convert.due" },
            {
              key: "projectType",
              required: true,
              guide: "crm.convert.type",
              options: ["IoT", "Automation", "Robot", "Software", "Electrical", "Machine", "IoT / Automation"].map((s) => ({ value: s, label: s })),
            },
          ]}
          onClose={() => setEditor(null)}
          onReload={reload}
          onSave={async (v) => {
            const result = await crmRequest<{ id: number; number: string; notification: AssignmentNotificationResult }>("/api/v1/inquiries", "POST", {
              ...v,
              opportunityId: id,
              opportunityRowVersion: o.rowVersion,
            });
            props.notify?.(`${result.number} created${assignmentDeliveryNote(result.notification)}`);
            state.refresh();
            props.openInquiry(result.id);
          }}
        />
      ) : null}
    </>
  );
}
/** The proposal and order evidence fields (as CrmForms evidenceFields: asked when the stage needs them). */
function evidenceFieldsFor(value: CrmRecord): FieldSpec[] {
  const fields: FieldSpec[] = [];
  if (["PROPOSAL", "NEGOTIATION"].includes(text(value.stage)) || value.proposalSentOn)
    fields.push({ key: "proposalSentOn", type: "date", required: true }, { key: "proposalReference", required: true });
  if (value.stage === "WON" || value.wonOn) fields.push({ key: "wonOn", type: "date", required: true }, { key: "wonReference", required: true });
  return fields;
}
