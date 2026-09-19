import { registerEstimatePriceSetRoutes } from "./routes/estimate-price-sets.js";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { registerExecutiveDashboardRoutes } from "./routes/executive-dashboard.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerSupportRoutes } from "./routes/support.js";
import { registerEstimateExcelImportRoutes } from "./routes/estimate-excel-import.js";
import { registerHistoricalPrRoutes } from "./routes/historical-pr.js";
import { registerUnifiedReportRoutes } from "./routes/unified-reports.js";
import { registerReportTemplateRoutes } from "./routes/report-templates.js";
import { registerPerformanceRoutes } from "./routes/performance.js";
import { registerResourcePlanningRoutes } from "./routes/resource-planning.js";
import { registerResourceTaskRoutes } from "./routes/resource-tasks.js";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { registerAuthentication } from "./auth.js";
import { createTmtIdRuntime } from "./tmt-id/runtime.js";
import { registerTmtIdAuthRoutes } from "./routes/auth-tmt-id.js";
import { createUserProvisioning } from "./tmt-id/user-provisioning.js";
import { Database } from "./db.js";
import { EmailService } from "./email.js";
import { ApiError, registerErrorHandler } from "./errors.js";
import { registerEstimateRoutes } from "./routes/estimates.js";
import { registerEstimateErpRoutes } from "./routes/estimate-erp.js";
import { registerOverheadPolicyRoutes } from "./routes/overhead-policies.js";
import { registerEstimateWorkspaceReadRoute } from "./routes/estimate-workspace-read.js";
import { registerEstimateOrderRoutes } from "./routes/estimate-order.js";
import { registerEstimateCostWriteRoutes } from "./routes/estimate-cost-write.js";
import { registerEstimateWorkspaceWriteRoutes } from "./routes/estimate-workspace-write.js";
import { registerEstimateCopyRoutes } from "./routes/estimate-copy.js";
import { registerEstimateAssignmentReadRoutes } from "./routes/estimate-assignments-read.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerBootstrapRoutes } from "./routes/bootstrap.js";
import { registerBomRoutes } from "./routes/boms.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerGoodsReceiptRoutes } from "./routes/goods-receipts.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerInquiryRoutes } from "./routes/inquiries.js";
import { registerCrmRoutes } from "./routes/crm.js";
import { registerCrmCustomerRoutes } from "./routes/crm-customers.js";
import { registerCrmDocumentRoutes } from "./routes/crm-documents.js";
import { registerInquiryAttachmentRoutes } from "./routes/inquiry-attachments.js";
import { registerKnowledgeAdminRoutes } from "./routes/knowledge-admin.js";
import { registerKnowledgeArticleRoutes } from "./routes/knowledge-articles.js";
import { registerKnowledgeCollaborationRoutes } from "./routes/knowledge-collaboration.js";
import { registerKnowledgeDocumentRoutes } from "./routes/knowledge-documents.js";
import { registerKnowledgeWorkflowRoutes } from "./routes/knowledge-workflow.js";
import { registerKnowledgeSalesMaterialRoutes } from "./routes/knowledge-sales-materials.js";
import { registerLaborPackageRoutes } from "./routes/labor-packages.js";
import { registerLaborRateRoutes } from "./routes/labor-rates.js";
import { registerMasterRoutes } from "./routes/master.js";
import { registerSalesCustomerRoutes } from "./routes/sales-customers.js";
import { registerModuleTemplateRoutes } from "./routes/module-templates.js";
import { registerMaterialIssueRoutes } from "./routes/material-issues.js";
import { registerPricingRoutes } from "./routes/pricing.js";
import { registerEstimateCostLookupRoutes } from "./routes/estimate-cost-lookup.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerProjectDocumentRoutes } from "./routes/project-documents.js";
import { registerPurchaseRequisitionRoutes } from "./routes/purchase-requisitions.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerScheduleRoutes } from "./routes/schedule.js";
import { registerSalesIntakeRoutes } from "./routes/sales-intakes.js";
import { registerSignatureMasterRoutes } from "./routes/signature-master.js";
import { registerSigningRoutes } from "./routes/signing.js";
import { registerSiteVisitReadRoutes } from "./routes/site-visits-read.js";
import { registerSiteVisitReportRoutes } from "./routes/site-visit-reports.js";
import { registerSiteVisitWorkflowRoutes } from "./routes/site-visits-workflow.js";
import { registerStockControlRoutes } from "./routes/stock-control.js";
import { registerSupplierQuotationRoutes } from "./routes/supplier-quotations.js";
import { registerVisitMasterRoutes } from "./routes/visit-master.js";
import { CurrentUserService } from "./users.js";

export type Application = { app: FastifyInstance; database: Database };

export async function buildApp(config: AppConfig): Promise<Application> {
  const app = Fastify({
    logger: true,
    // Existing frontend collection URLs end in '/', as supported by the
    // previous API. Normalize before matching routes such as inquiries/:id.
    routerOptions: { ignoreTrailingSlash: true },
    trustProxy: false,
    bodyLimit: config.documentStorage.maxFileSizeBytes + 1_048_576,
  });
  const database = new Database(config.database);
  const users = new CurrentUserService(database);
  const email = new EmailService(config.email, fetch, (error) => app.log.error({ error }, "Email delivery failed"));

  registerErrorHandler(app);
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: config.documentStorage.maxFileSizeBytes,
      fields: 30,
      parts: 31,
    },
    throwFileSizeLimit: true,
  });
  const tmtId = createTmtIdRuntime(config, app.log);
  if (tmtId) await app.register(cookie);
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || config.corsOrigins.includes(origin)),
    // A split-origin deployment sends the session cookie cross-origin, which
    // the browser only does when the API also allows credentials.
    credentials: config.auth.mode === "TmtId",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Team-Test-Email",
      "X-Team-Test-Code",
      "X-Dev-User-Id",
      "X-Dev-User-Email",
      "If-Match",
    ],
    maxAge: 3600,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.identity?.partitionKey ?? request.ip,
  });

  app.addHook("onRequest", async (request) => {
    if (
      config.database.readOnly === true &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      throw new ApiError(
        403,
        "local_read_only",
        "This local API is connected in read-only mode. Database changes are disabled.",
      );
    }
    const host = request.hostname;
    if (
      config.environment !== "development" &&
      !config.allowedHosts.includes(host)
    ) {
      throw Object.assign(new Error("Host is not allowed."), {
        statusCode: 400,
      });
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  registerAuthentication(app, config, tmtId);
  if (tmtId) registerTmtIdAuthRoutes(app, tmtId, createUserProvisioning(database, tmtId.settings.defaultRoleCode));
  registerHealthRoutes(app, config, database);
  registerGoodsReceiptRoutes(app, config, database, users);
  registerBootstrapRoutes(app, database, users);
  registerExecutiveDashboardRoutes(app, database, users);
  registerBomRoutes(app, config, database, users);
  registerPricingRoutes(app, database, users);
  registerEstimateCostLookupRoutes(app, database, users);
  registerEstimateRoutes(app, config, database, users);
  registerEstimateErpRoutes(app, database, users);
  registerOverheadPolicyRoutes(app, config, database, users);
  registerEstimateWorkspaceReadRoute(app, config, database, users);
  registerEstimateCostWriteRoutes(app, database, users);
  registerEstimateOrderRoutes(app, database, users);
  registerEstimatePriceSetRoutes(app, database, users);
  registerEstimateExcelImportRoutes(app, database, users, config);
  registerEstimateWorkspaceWriteRoutes(app, config, database, users, email);
  registerEstimateCopyRoutes(app, config, database, users);
  registerEstimateAssignmentReadRoutes(app, database, users);
  registerInventoryRoutes(app, database, users);
  registerInquiryRoutes(app, config, database, users);
  registerCrmRoutes(app, config, database, users);
  registerCrmCustomerRoutes(app, database, users);
  registerCrmDocumentRoutes(app, config, database, users);
  registerInquiryAttachmentRoutes(app, config, database, users);
  registerKnowledgeAdminRoutes(app, config, database, users);
  registerKnowledgeArticleRoutes(app, database, users);
  registerKnowledgeCollaborationRoutes(app, config, database, users);
  registerKnowledgeDocumentRoutes(app, config, database, users);
  registerKnowledgeWorkflowRoutes(app, config, database, users);
  registerKnowledgeSalesMaterialRoutes(app, config, database, users);
  registerMasterRoutes(app, database, users);
  registerLaborRateRoutes(app, config, database, users);
  registerLaborPackageRoutes(app, config, database, users);
  registerSalesCustomerRoutes(app, database, users);
  registerModuleTemplateRoutes(app, database, users);
  registerMaterialIssueRoutes(app, config, database, users);
  registerProjectRoutes(app, config, database, users);
  registerProjectDocumentRoutes(app, config, database, users);
  registerSigningRoutes(app, config, database, users);
  registerSignatureMasterRoutes(app, config, database, users);
  registerPurchaseRequisitionRoutes(app, config, database, users);
  registerHistoricalPrRoutes(app, database, users);
  registerReportRoutes(app, config, database, users);
  registerScheduleRoutes(app, database, users);
  registerResourcePlanningRoutes(app, database, users);
  registerResourceTaskRoutes(app, database, users);
  registerSalesIntakeRoutes(app, config, database, users);
  registerSiteVisitReadRoutes(app, config, database, users);
  registerSiteVisitWorkflowRoutes(app, config, database, users);
  registerSiteVisitReportRoutes(app, config, database, users);
  registerStockControlRoutes(app, config, database, users);
  registerSupplierQuotationRoutes(app, config, database, users);
  registerVisitMasterRoutes(app, database, users);
  registerAdminRoutes(app, config, database, users);
  registerUnifiedReportRoutes(app, config, database, users);
  registerReportTemplateRoutes(app, database, users);
  registerPerformanceRoutes(app, database, users);
  registerSupportRoutes(app, config, database, users, email);
  registerActivityRoutes(app, database, users);
  app.addHook("onClose", async () => database.close());
  return { app, database };
}
