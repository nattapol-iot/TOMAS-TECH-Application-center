import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }), code: text("code").notNull().unique(), name: text("name").notNull(),
  contactName: text("contact_name").notNull().default(""), email: text("email").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }), code: text("code").notNull().unique(), name: text("name").notNull(),
  category: text("category").notNull().default("General"), contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""), phone: text("phone").notNull().default(""), status: text("status").notNull().default("Active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const users = sqliteTable("users", { id: integer("id").primaryKey({ autoIncrement: true }), name: text("name").notNull(), email: text("email").notNull().unique(), role: text("role").notNull() });
export const estimates = sqliteTable("estimates", {
  id: integer("id").primaryKey({ autoIncrement: true }), estimateNo: text("estimate_no").notNull().unique(), customerId: integer("customer_id").notNull(),
  runningNo: integer("running_no").notNull(), revision: integer("revision").notNull().default(0), projectName: text("project_name").notNull(),
  status: text("status").notNull().default("Draft"), assignedTo: integer("assigned_to").notNull(), leaderId: integer("leader_id").notNull(),
  managerId: integer("manager_id").notNull(), dueDate: text("due_date").notNull(), progress: integer("progress").notNull().default(0),
  selectedModules: text("selected_modules").notNull().default("[]"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const checklist = sqliteTable("estimate_checklist", {
  id: integer("id").primaryKey({ autoIncrement: true }), estimateId: integer("estimate_id").notNull(), checklistKey: text("checklist_key").notNull(),
  label: text("label").notNull(), completed: integer("completed", { mode: "boolean" }).notNull().default(false), weight: integer("weight").notNull().default(20),
});
export const costItems = sqliteTable("cost_items", {
  id: integer("id").primaryKey({ autoIncrement: true }), estimateId: integer("estimate_id").notNull(), category: text("category").notNull(), module: text("module").notNull().default("Core"),
  model: text("model").notNull().default(""), description: text("description").notNull(), supplierId: integer("supplier_id"), unitPrice: real("unit_price").notNull().default(0),
  quantity: real("quantity").notNull().default(0), unit: text("unit").notNull().default("Set"), sortOrder: integer("sort_order").notNull().default(0),
});
export const laborRates = sqliteTable("labor_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }), workforceType: text("workforce_type").notNull(), discipline: text("discipline").notNull(),
  workType: text("work_type").notNull(), unit: text("unit").notNull(), rate: real("rate").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const approvals = sqliteTable("approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }), estimateId: integer("estimate_id").notNull(), stage: text("stage").notNull(), sequence: integer("sequence").notNull(),
  approverId: integer("approver_id").notNull(), status: text("status").notNull().default("Pending"), comment: text("comment").notNull().default(""), actedAt: text("acted_at"),
});
export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }), estimateId: integer("estimate_id").notNull(), actor: text("actor").notNull(), action: text("action").notNull(),
  detail: text("detail").notNull().default(""), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
