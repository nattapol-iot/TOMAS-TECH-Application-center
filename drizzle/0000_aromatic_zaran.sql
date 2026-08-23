CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`estimate_id` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`estimate_id` integer NOT NULL,
	`stage` text NOT NULL,
	`sequence` integer NOT NULL,
	`approver_id` integer NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`acted_at` text
);
--> statement-breakpoint
CREATE TABLE `estimate_checklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`estimate_id` integer NOT NULL,
	`checklist_key` text NOT NULL,
	`label` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`weight` integer DEFAULT 20 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cost_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`estimate_id` integer NOT NULL,
	`category` text NOT NULL,
	`module` text DEFAULT 'Core' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`supplier_id` integer,
	`unit_price` real DEFAULT 0 NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'Set' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_code_unique` ON `customers` (`code`);--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`estimate_no` text NOT NULL,
	`customer_id` integer NOT NULL,
	`running_no` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`project_name` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`assigned_to` integer NOT NULL,
	`leader_id` integer NOT NULL,
	`manager_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`selected_modules` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estimates_estimate_no_unique` ON `estimates` (`estimate_no`);--> statement-breakpoint
CREATE TABLE `labor_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workforce_type` text NOT NULL,
	`discipline` text NOT NULL,
	`work_type` text NOT NULL,
	`unit` text NOT NULL,
	`rate` real NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_code_unique` ON `suppliers` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);