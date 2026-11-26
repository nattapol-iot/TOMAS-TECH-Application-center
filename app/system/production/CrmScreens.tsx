"use client";

/*
 * CRM & Sales. The pages are built on @tomas-tc/ui in app/system/tomas-ui/CrmPages.tsx (owner 2026-11-26: the list and
 * detail pages move to the kit, the same for everyone), loaded when CRM is first opened so the kit stays off the first
 * load (lazy-screens.test.mjs). This module keeps the permission gate, the shared types and My Work's follow-up panel,
 * which renders on the landing page in the app's own look.
 */
import { lazy, Suspense, useState } from "react";
import type { BootstrapData } from "../api-client";
import { useLanguage, useT } from "../i18n";
import { EmptyState, Panel } from "../ui";
import "./crm.css";
import { crmRequest, formatDay, text, useCrmData, type CrmRecord } from "./crm-records";

export type { CrmRecord } from "./crm-records";
export { crmRequest, useCrmData } from "./crm-records";

export type CrmView = "crm-dashboard" | "crm-customers" | "crm-contacts" | "crm-opportunities" | "crm-activities" | "crm-pipeline";
type Props = {
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

const CrmPages = lazy(() => import("../tomas-ui/CrmPages").then((m) => ({ default: m.CrmPages })));

/* Loading, failed or nothing yet: three different things, said differently (CRM UX audit CRM-06). */
function Notice({ error, loading }: { error?: boolean; loading?: boolean }) {
  const t = useT();
  return error ? (
    <div role="alert" className="alert danger">
      {t("CRM.loadFailed")}
    </div>
  ) : loading ? (
    <p role="status" className="crm-muted">
      {t("CRM.loading")}
    </p>
  ) : null;
}

export function CrmScreen(props: Props) {
  const t = useT();
  if (!props.bootstrap.permissions.includes("crm.read")) return <p>{t("CRM.permissions")}</p>;
  return (
    <Suspense fallback={<Notice loading />}>
      <CrmPages {...props} />
    </Suspense>
  );
}

export function CrmMyWork({ openOpportunity }: { openOpportunity?: (id: number) => void }) {
  const t = useT(),
    { lang } = useLanguage(),
    state = useCrmData<{ actions: CrmRecord[]; attention: CrmRecord[] }>("/api/v1/crm/my-work"),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <Panel title={t("CRM.followups")}>
      <Notice error={state.error || error} loading={state.loading} />
      {state.data && !state.data.actions.length && !state.data.attention.length ? <EmptyState icon="checkCircle" title="CRM.noFollowups" message="CRM.myWorkClear" /> : null}
      {state.data?.actions.map((r) => (
        <div className="crm-action" key={text(r.id)}>
          <div>
            <button className="crm-link" onClick={() => openOpportunity?.(Number(r.opportunityId))}>
              {text(r.action)}
            </button>
            <p>
              {text(r.opportunityName)} · {formatDay(r.dueDate, lang)} · {t(`CRM.${r.status}`)}
            </p>
          </div>
          <button
            className="btn default"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(false);
              void crmRequest(`/api/v1/crm/opportunities/${r.opportunityId}/followups/${r.id}`, "PUT", { rowVersion: r.rowVersion, status: "Done" })
                .then(state.refresh)
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            {t("CRM.Done")}
          </button>
        </div>
      ))}
      {state.data?.attention.map((r) => (
        <div className="crm-action" key={`attention-${r.id}`}>
          <button className="crm-link" onClick={() => openOpportunity?.(Number(r.id))}>
            {text(r.name)}
          </button>
          <span>{(r.attention as string[]).map((a) => t(`CRM.${a}`)).join(" · ")}</span>
        </div>
      ))}
    </Panel>
  );
}
