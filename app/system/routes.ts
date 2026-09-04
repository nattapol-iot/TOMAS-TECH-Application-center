/* Navigation contract shared by the shell and every screen. */

export type Route =
  | { name: "dashboard" }
  | { name: "inquiries" }
  | { name: "inquiry-new" }
  | { name: "inquiry"; id: string; tab?: string }
  | { name: "estimates" }
  | { name: "estimate"; id: string; tab?: string }
  | { name: "price" }
  | { name: "price-history"; id: string }
  | { name: "quotations" }
  | { name: "missing" }
  | { name: "resources" }
  | { name: "procurement" }
  | { name: "boms" }
  | { name: "bom"; id: string }
  | { name: "purchase" }
  | { name: "pr"; id: string }
  | { name: "pr-new"; bomId?: string }
  | { name: "pos" }
  | { name: "inventory" }
  | { name: "receiving" }
  | { name: "grn"; id: string }
  | { name: "issues" }
  | { name: "mir"; id: string }
  | { name: "mat-approvals" }
  | { name: "customers" }
  | { name: "projects" }
  | { name: "project"; id: string }
  | { name: "schedule"; id: string; view?: string }
  | { name: "my-work" }
  | { name: "reports" }
  | { name: "master" }
  | { name: "rates" }
  | { name: "audit" }
  | { name: "settings" };

export type ScreenProps = {
  go: (route: Route) => void;
  notify: (message: string) => void;
};
