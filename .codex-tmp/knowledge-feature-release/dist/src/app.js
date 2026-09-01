import cors from "@fastify/cors";
import { registerResourcePlanningRoutes } from "./routes/resource-planning.js";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { registerAuthentication } from "./auth.js";
import { Database } from "./db.js";
import { registerErrorHandler } from "./errors.js";
import { registerEstimateRoutes } from "./routes/estimates.js";
import { registerEstimateWorkspaceReadRoute } from "./routes/estimate-workspace-read.js";
import { registerEstimateCostWriteRoutes } from "./routes/estimate-cost-write.js";
import { registerEstimateWorkspaceWriteRoutes } from "./routes/estimate-workspace-write.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerBootstrapRoutes } from "./routes/bootstrap.js";
import { registerBomRoutes } from "./routes/boms.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerGoodsReceiptRoutes } from "./routes/goods-receipts.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerInquiryRoutes } from "./routes/inquiries.js";
import { registerInquiryAttachmentRoutes } from "./routes/inquiry-attachments.js";
import { registerKnowledgeAdminRoutes } from "./routes/knowledge-admin.js";
import { registerKnowledgeArticleRoutes } from "./routes/knowledge-articles.js";
import { registerKnowledgeCollaborationRoutes } from "./routes/knowledge-collaboration.js";
import { registerKnowledgeDocumentRoutes } from "./routes/knowledge-documents.js";
import { registerKnowledgeWorkflowRoutes } from "./routes/knowledge-workflow.js";
import { registerKnowledgeSalesMaterialRoutes } from "./routes/knowledge-sales-materials.js";
import { registerMasterRoutes } from "./routes/master.js";
import { registerModuleTemplateRoutes } from "./routes/module-templates.js";
import { registerMaterialIssueRoutes } from "./routes/material-issues.js";
import { registerPricingRoutes } from "./routes/pricing.js";
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
export async function buildApp(config) {
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
    await app.register(cors, {
        origin: (origin, callback) => callback(null, !origin || config.corsOrigins.includes(origin)),
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
        const host = request.hostname;
        if (config.environment !== "development" &&
            !config.allowedHosts.includes(host)) {
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
    registerAuthentication(app, config);
    registerHealthRoutes(app, config, database);
    registerGoodsReceiptRoutes(app, config, database, users);
    registerBootstrapRoutes(app, database, users);
    registerBomRoutes(app, config, database, users);
    registerPricingRoutes(app, database, users);
    registerEstimateRoutes(app, config, database, users);
    registerEstimateWorkspaceReadRoute(app, config, database, users);
    registerEstimateCostWriteRoutes(app, database, users);
    registerEstimateWorkspaceWriteRoutes(app, config, database, users);
    registerInventoryRoutes(app, database, users);
    registerInquiryRoutes(app, config, database, users);
    registerInquiryAttachmentRoutes(app, config, database, users);
    registerKnowledgeAdminRoutes(app, config, database, users);
    registerKnowledgeArticleRoutes(app, database, users);
    registerKnowledgeCollaborationRoutes(app, config, database, users);
    registerKnowledgeDocumentRoutes(app, config, database, users);
    registerKnowledgeWorkflowRoutes(app, config, database, users);
    registerKnowledgeSalesMaterialRoutes(app, config, database, users);
    registerMasterRoutes(app, database, users);
    registerModuleTemplateRoutes(app, database, users);
    registerMaterialIssueRoutes(app, config, database, users);
    registerProjectRoutes(app, config, database, users);
    registerProjectDocumentRoutes(app, config, database, users);
    registerSigningRoutes(app, config, database, users);
    registerSignatureMasterRoutes(app, config, database, users);
    registerPurchaseRequisitionRoutes(app, config, database, users);
    registerReportRoutes(app, config, database, users);
    registerScheduleRoutes(app, database, users);
    registerResourcePlanningRoutes(app, database, users);
    registerSalesIntakeRoutes(app, config, database, users);
    registerSiteVisitReadRoutes(app, config, database, users);
    registerSiteVisitWorkflowRoutes(app, config, database, users);
    registerSiteVisitReportRoutes(app, config, database, users);
    registerStockControlRoutes(app, config, database, users);
    registerSupplierQuotationRoutes(app, config, database, users);
    registerVisitMasterRoutes(app, database, users);
    registerAdminRoutes(app, database, users);
    app.addHook("onClose", async () => database.close());
    return { app, database };
}
//# sourceMappingURL=app.js.map
