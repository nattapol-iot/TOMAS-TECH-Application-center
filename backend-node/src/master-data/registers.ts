import { MASTER_KEYS, MASTER_TOOLS, MASTER_KINDS, type MasterKind } from "../erp-master-data.js";
import type { ErpGateway, ErpResult } from "../erp-purchasing.js";
import { MasterDataError, type MasterDataClient } from "./client.js";
import { MASTER_DATA_PATHS } from "./constants.js";

const THAI = /[ก-๙]/;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/**
 * One master customer or supplier in the register shape the ERP answered customers_list / suppliers_list with, so
 * readMasterPage, the mirror tables and the matching keep working unchanged. Master keeps the ERP's ids, so links hold.
 */
export function registerRowOf(kind: MasterKind, row: Record<string, unknown>): Record<string, unknown> {
  const singular = kind === "customers" ? "customer" : "supplier";
  const name = text(row[`${singular}_name`]), nameTh = text(row[`${singular}_name_th`]);
  return {
    [MASTER_KEYS[kind]]: row.id,
    [`${singular}_code`]: row[`${singular}_code`],
    name_en: THAI.test(name) ? "" : name,
    name_th: nameTh || (THAI.test(name) ? name : ""),
    tax_id: row.tax_id, address: row.address, country: row.country, phone: row.phone, email: row.email,
    contact_name: row.contact_person,
    // A record deleted in master is closed here, the way the ERP's is_active=false was.
    is_active: row.deleted_at === null || row.deleted_at === undefined,
    updated_at: row.updated_at,
  };
}

/**
 * Answers the register sync's customers_list / suppliers_list calls from master data instead of the ERP. Master has no
 * change feed for these lists, so every round reads the whole register (a few hundred rows), deleted rows included.
 */
export function createMasterRegisterGateway(client: MasterDataClient): ErpGateway {
  const path: Readonly<Record<MasterKind, string>> = { customers: MASTER_DATA_PATHS.customers, suppliers: MASTER_DATA_PATHS.suppliers };
  return {
    async call<T>(_subject: string, tool: string): Promise<ErpResult<T>> {
      const kind = MASTER_KINDS.find((candidate) => MASTER_TOOLS[candidate] === tool);
      if (!kind) return { ok: false, kind: "error", message: `Master data has no register for ${tool}.` };
      try {
        const rows = await client.listAll(`${path[kind]}?presence=all`);
        const records = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object").map((row) => registerRowOf(kind, row));
        return { ok: true, data: { [kind]: records, next_cursor: null, server_time: null } as T };
      } catch (error) {
        const message = error instanceof MasterDataError ? error.message : "Master data could not be reached.";
        return { ok: false, kind: "unavailable", message };
      }
    },
  };
}
