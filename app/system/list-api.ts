import { apiRequest, type EmployeeRecord } from "./api-client";

/*
 * The lists of the Pegasus screens that are searched, filtered and paged on the server (DESIGN.md 0.3): Suppliers and
 * Employees. Each page carries the values its header funnels offer (ColumnFilter.tsx), counted over the whole register.
 */

/** One value a header funnel offers, with how many records carry it. */
export type FacetValue = { value: string; count: number };
/** One page of a server list, with the values each column filter offers. */
export type ListPage<T, F extends string> = { items: T[]; total: number; page: number; pageSize: number; facets: Record<F, FacetValue[]> };

/** A column filter is sent as repeated parameters (?category=A&category=B); an empty one is left out. */
export const listQuery = (values: Record<string, string | number | readonly string[] | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
};

export type SupplierListItem = {
  id: number;
  code: string;
  name: string;
  category: string;
  contact: string;
  email: string;
  phone: string;
  brands: string[];
  erpCode: string | null;
};

/** The Suppliers screen's list (GET /api/v1/master/suppliers); source is erp (from Pegasus ERP) or local (added in the app). */
export const listSuppliersPage = (query: { search?: string; category?: readonly string[]; source?: readonly string[]; page: number; pageSize: number }) =>
  apiRequest<ListPage<SupplierListItem, "category" | "source">>(`/api/v1/master/suppliers${listQuery(query)}`);

/** The Employees screen's list: the route listEmployees reads, one page at a time; status is active or inactive, account linked or none. */
export const listEmployeesPage = (query: { search?: string; status?: readonly string[]; department?: readonly string[]; position?: readonly string[]; page: number; pageSize: number }) =>
  apiRequest<ListPage<EmployeeRecord, "status" | "department" | "position" | "account">>(`/api/v1/master/employees${listQuery(query)}`);
