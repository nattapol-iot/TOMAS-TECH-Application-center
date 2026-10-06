"use client";

import dynamic, { type DynamicOptionsLoadingProps } from "next/dynamic";
import { LocalizedText } from "../LocalizedText";
import { EmptyState, Icon, Panel } from "../ui";

/*
 * Screens that are not on the page a person lands on. Each becomes its own chunk, fetched the
 * first time its view renders, so "/" no longer downloads the report export stack (pdf-lib, the
 * PPTX builder and its embedded logo), Estimate Cost, Site Visit, procurement and the rest before
 * anyone has signed in. The exported names are the components they stand for, so ProductionApp
 * renders them unchanged.
 *
 * Not here on purpose: CoreScreens and PlanningPricingScreens (Dashboard and My Work, the two
 * landings) and what they import statically (CrmScreens, SigningScreens, AdminAnalyticsScreens,
 * ResourceTaskWorkspace). Lazy-loading a module the eager graph already imports saves nothing, and
 * a static import of one of the modules below from an eager screen silently puts it back on the
 * first load (tests/lazy-screens.test.mjs).
 *
 * No `ssr: false`: the workspace never renders on the server (ProductionApp shows the session or
 * login screen until bootstrap arrives in the browser), and vinext's ssr:false path shows the
 * loading state for one commit on every mount, cached chunk or not.
 */
/** Chrome, Firefox and Safari wording for a module or its CSS that could not be fetched. */
const CHUNK_FAILURE = /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i;

function ScreenLoading({ error, retry }: DynamicOptionsLoadingProps) {
  // vinext's boundary also catches errors thrown while the screen renders. Those are not a
  // stale deploy, and reloading would only reopen the same view, so they get a retry instead.
  if (error && !CHUNK_FAILURE.test(error.message)) {
    return (
      <div role="alert">
        <Panel>
          <EmptyState icon="alertTriangle" title="Unexpected error" message={error.message || "Unexpected error"}
            action={<button className="btn default" type="button" onClick={() => retry?.()}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} />
        </Panel>
      </div>
    );
  }
  // A chunk that fails is almost always a tab opened before a deploy: the old file is gone, so
  // only a reload helps, and the remembered view brings the reader back to this screen.
  if (error) {
    return (
      <div role="alert">
        <Panel>
          <EmptyState icon="alertTriangle" title="Could not load" message="This screen could not be opened. Refresh the page to load the latest version."
            action={<button className="btn default" type="button" onClick={() => window.location.reload()}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />
        </Panel>
      </div>
    );
  }
  return <div role="status" aria-live="polite" aria-busy="true"><Panel><EmptyState icon="clock" title="Loading…" message="Opening this screen…" /></Panel></div>;
}

const screen = { loading: ScreenLoading };

export const ProductionInquiries = dynamic(() => import("./InquiryScreens").then((m) => m.ProductionInquiries), screen);
export const ProductionResourcePlan = dynamic(() => import("./ResourcePlanningScreen").then((m) => m.ProductionResourcePlan), screen);
export const ProductionProjectTimeline = dynamic(() => import("./ProjectTimelineScreen").then((m) => m.ProductionProjectTimeline), screen);
export const ReportScreens = dynamic(() => import("./ReportScreens").then((m) => m.ReportScreens), screen);
export const ProductionEstimates = dynamic(() => import("./EstimateScreens").then((m) => m.ProductionEstimates), screen);
export const ProductionApprovals = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionApprovals), screen);
export const ProductionBoms = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionBoms), screen);
export const ProductionGoodsReceiving = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionGoodsReceiving), screen);
export const ProductionInventoryOperations = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionInventoryOperations), screen);
export const ProductionMaterialIssues = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionMaterialIssues), screen);
export const ProductionProcurementDashboard = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionProcurementDashboard), screen);
export const ProductionPurchaseOrders = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionPurchaseOrders), screen);
export const ProductionPurchaseRequisitions = dynamic(() => import("./MaterialScreens").then((m) => m.ProductionPurchaseRequisitions), screen);
export const ProductionKnowledgeHub = dynamic(() => import("./KnowledgeScreens").then((m) => m.ProductionKnowledgeHub), screen);
export const ProductionModuleTemplates = dynamic(() => import("./ModuleTemplateScreens").then((m) => m.ProductionModuleTemplates), screen);
export const LaborPackageMaster = dynamic(() => import("./LaborPackageMaster").then((m) => m.LaborPackageMaster), screen);
export const ScheduleTemplateMaster = dynamic(() => import("./ScheduleTemplateMaster").then((m) => m.ScheduleTemplateMaster), screen);
export const Performance = dynamic(() => import("./PerformanceScreen"), screen);
export const ProductionMyAssignments = dynamic(() => import("./SiteVisitScreens").then((m) => m.ProductionMyAssignments), screen);
export const ProductionSalesIntake = dynamic(() => import("./SiteVisitScreens").then((m) => m.ProductionSalesIntake), screen);
export const ProductionSiteVisits = dynamic(() => import("./SiteVisitScreens").then((m) => m.ProductionSiteVisits), screen);
export const ProductionVisitMasterData = dynamic(() => import("./SiteVisitScreens").then((m) => m.ProductionVisitMasterData), screen);
export const TeamActivityScreen = dynamic(() => import("./TeamActivityScreen").then((m) => m.TeamActivityScreen), screen);
