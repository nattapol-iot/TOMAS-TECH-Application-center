// The Pegasus ERP's customer and supplier registers (customers_list, suppliers_list) and how their records meet the app's
// own customers and suppliers. Pure: the database side is erp-master-sync.ts. See docs/PEGASUS_ERP_CUSTOMER_SUPPLIER_SYNC_TH.md.
import { createHash } from "node:crypto";
import { customerCodeFromName } from "./routes/sales-customers.js";

export type MasterKind = "customers" | "suppliers";
export const MASTER_KINDS: readonly MasterKind[] = ["customers", "suppliers"];
export const MASTER_TOOLS: Readonly<Record<MasterKind, string>> = { customers: "customers_list", suppliers: "suppliers_list" };
/** Records per page; the ERP's default in our request, and far below its 120 calls a minute per person. */
export const MASTER_PAGE_SIZE = 200;

/**
 * One ERP record, cut to the columns of dbo.erp_customers / dbo.erp_suppliers. key is customer_id or supplier_id, which never
 * change; code is customer_code or supplier_code, which the ERP lets people edit (ERP team, 2026-11-04). mergedInto is a key.
 */
export type ErpMasterRecord = {
  key: string; code: string; nameTh: string; nameEn: string; shortName: string; taxId: string; branch: string; address: string;
  province: string; postalCode: string; country: string; phone: string; email: string; website: string; contactName: string;
  approvalStatus: string; isActive: boolean; mergedInto: string | null; updatedAt: string | null; hash: string;
};
export type ErpMasterPage = { records: ErpMasterRecord[]; nextCursor: string | null; serverTime: string | null };

/** The ERP answered, but not with a register this code can read; nothing from the answer is stored. */
export class MasterShapeError extends Error {}

const text = (value: unknown, max: number) => {
  const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  const clean = raw.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
};
const active = (value: unknown) => !(value === false || value === 0 || value === "0" || value === "false" || value === "N");
const hashOf = (record: Omit<ErpMasterRecord, "hash">) => createHash("sha256").update(JSON.stringify(record)).digest("hex");

/** customers_list / suppliers_list arguments: everything at first, then what changed since the ERP's own time of the last round. */
export function masterListArguments(since: string | null, cursor: string | null): Record<string, unknown> {
  return {
    limit: MASTER_PAGE_SIZE,
    // Changes include closing and merging, which a full read leaves out.
    ...(since ? { updated_since: since, include_inactive: true } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

/** The field that keys each kind of record. */
export const MASTER_KEYS: Readonly<Record<MasterKind, string>> = { customers: "customer_id", suppliers: "supplier_id" };

/**
 * One page of a register. A record without its key is skipped; an answer without the list, or whose records all lack the
 * key, is refused whole, so a change on the ERP side shows on the screen instead of emptying the register.
 */
export function readMasterPage(kind: MasterKind, data: unknown): ErpMasterPage {
  const body = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const list = body[kind];
  if (!Array.isArray(list)) throw new MasterShapeError(`The ERP answered ${MASTER_TOOLS[kind]} without a "${kind}" list.`);
  const byKey = new Map<string, ErpMasterRecord>();
  let keyless = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = text(kind === "customers" ? row.customer_id : row.supplier_id ?? row.id, 50);
    if (!key) { keyless++; continue; }
    // suppliers_list may name a supplier the way purchasing_suppliers_list does.
    const name = text(row.name ?? row.supplier_name ?? row.customer_name, 300);
    let nameTh = text(row.name_th, 300), nameEn = text(row.name_en, 300);
    if (!nameTh && !nameEn && name) { if (/[ก-๙]/.test(name)) nameTh = name; else nameEn = name; }
    const merged = text(row.merged_into, 50);
    const record = {
      key, code: text(kind === "customers" ? row.customer_code : row.supplier_code, 50), nameTh, nameEn, shortName: text(row.short_name, 100),
      taxId: text(row.tax_id, 20), branch: text(row.branch, 100), address: text(row.address, 1000), province: text(row.province, 120),
      postalCode: text(row.postal_code, 20), country: text(row.country, 120), phone: text(row.phone, 100), email: text(row.email, 256),
      website: text(row.website, 500), contactName: text(row.contact_name, 200), approvalStatus: text(row.approval_status, 30),
      isActive: active(row.is_active), mergedInto: merged && merged !== key ? merged : null, updatedAt: text(row.updated_at, 40) || null,
    };
    byKey.set(key, { ...record, hash: hashOf(record) });
  }
  if (keyless && !byKey.size) throw new MasterShapeError(`The ERP answered ${MASTER_TOOLS[kind]} without ${MASTER_KEYS[kind]} on its records.`);
  const next = text(body.next_cursor, 1000);
  return { records: [...byKey.values()], nextCursor: next || null, serverTime: text(body.server_time, 40) || null };
}

// Built from NFKC forms, because NFKC splits "ำ" in "จำกัด" into two characters.
const LEGAL_TH = new RegExp(["ห้างหุ้นส่วนสามัญ", "ห้างหุ้นส่วน", "สำนักงานใหญ่", "บริษัท", "จำกัด", "มหาชน", "บจก", "บมจ", "หจก"]
  .map((word) => word.normalize("NFKC")).join("|"), "g");
const LEGAL_EN = new Set(["co", "company", "ltd", "limited", "public", "pcl", "plc", "inc", "incorporated", "corp", "corporation", "llc", "lp",
  "pte", "pvt", "private", "gmbh", "kk", "the", "head", "office"]);

/** A name as letters and digits only: "Daiichi Jitsugyo (Thailand) Co., Ltd." and "DAIICHI JITSUGYO (THAILAND) CO.,LTD" meet. */
export const nameKey = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
/** The same without legal-form words, so "ABC Co., Ltd." meets "ABC Company Limited" and "บริษัท เอบีซี จำกัด" meets "เอบีซี". */
export function coreKey(value: string): string {
  const words = value.normalize("NFKC").toLocaleLowerCase("en").replace(LEGAL_TH, " ").split(/[^\p{L}\p{M}\p{N}]+/u);
  return words.filter((word) => word && !LEGAL_EN.has(word)).join("");
}
/** A tax ID as its digits, when there are enough of them to identify a company. */
export const taxKey = (value: string | null | undefined) => { const digits = (value ?? "").replace(/\D/g, ""); return digits.length >= 10 ? digits : ""; };

/** An app customer or supplier as the matcher sees it. erpKey is the ERP record it is already linked to. */
export type AppParty = { id: number; erpKey: string | null; tax: string; cores: string[] };
export const appParty = (id: number, names: readonly (string | null | undefined)[], taxId: string | null | undefined, erpKey: string | null | undefined): AppParty =>
  ({ id, erpKey: erpKey || null, tax: taxKey(taxId), cores: [...new Set(names.map((name) => coreKey(name ?? "")).filter((core) => core.length >= 2))] });

export type MatchDecision = { kind: "link"; id: number } | { kind: "review"; ids: number[] } | { kind: "create" };
const MAX_CANDIDATES = 10;
const review = (parties: readonly AppParty[]): MatchDecision => ({ kind: "review", ids: parties.slice(0, MAX_CANDIDATES).map((party) => party.id) });

/**
 * Which app record an ERP record is (owner rule 2026-11-05): one tax ID or one name is a link, several or a doubtful one
 * waits for an Admin, and a record that resembles nothing is added. A name that only contains another ("ABC" in "ABC
 * Engineering") is doubtful, because the app has short names Sales typed by hand.
 */
export function matchParty(record: Pick<ErpMasterRecord, "key" | "nameTh" | "nameEn" | "taxId">, parties: readonly AppParty[]): MatchDecision {
  const tax = taxKey(record.taxId);
  const sure = (party: AppParty) => !party.erpKey || party.erpKey === record.key;
  if (tax) {
    const byTax = parties.filter((party) => party.tax === tax);
    if (byTax.length === 1) return sure(byTax[0]!) ? { kind: "link", id: byTax[0]!.id } : review(byTax);
    if (byTax.length > 1) return review(byTax);
  }
  const cores = new Set([record.nameTh, record.nameEn].map(coreKey).filter((core) => core.length >= 2));
  if (!cores.size) return { kind: "create" };
  const same = parties.filter((party) => party.cores.some((core) => cores.has(core)));
  if (same.length === 1) {
    const only = same[0]!;
    // Another tax ID under the same name is another company or another branch.
    return sure(only) && !(tax && only.tax && only.tax !== tax) ? { kind: "link", id: only.id } : review(same);
  }
  if (same.length > 1) return review(same);
  const near = parties.filter((party) => !party.erpKey && party.cores.some((core) => core.length >= 5
    && [...cores].some((wanted) => wanted.length >= 5 && (wanted.includes(core) || core.includes(wanted)))));
  return near.length ? review(near) : { kind: "create" };
}

/** The name the app shows: English first, as the app's own customer form does. */
export const displayName = (record: Pick<ErpMasterRecord, "nameEn" | "nameTh" | "shortName" | "code" | "key">) =>
  record.nameEn || record.nameTh || record.shortName || record.code || record.key;

/** The registered address as the app's one-line customer address (customers.site, 300 characters). */
export const addressLine = (record: Pick<ErpMasterRecord, "address" | "province" | "postalCode">) =>
  [record.address, record.province, record.postalCode].filter(Boolean).join(" ").slice(0, 300);

/** A website the customer screens accept (HTTP or HTTPS), or nothing. */
export const websiteOf = (value: string) => /^https?:\/\//i.test(value) ? value : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) ? `https://${value}`.slice(0, 500) : "";

const CODE_SHAPE = /^[A-Z0-9][A-Z0-9._/-]*$/;
const unique = (base: string, taken: Set<string>) => {
  let code = base.slice(0, 30), n = 2;
  while (taken.has(code)) code = `${base.slice(0, 30 - String(n).length - 1)}-${n++}`;
  taken.add(code);
  return code;
};

/** The app code for a customer added from the ERP: the ERP's own code when the app can hold it, else one from the name. */
export function customerCodeFor(record: Pick<ErpMasterRecord, "key" | "code" | "nameEn" | "nameTh">, taken: Set<string>): string {
  const own = (record.code || record.key).toUpperCase();
  if (own.length <= 30 && CODE_SHAPE.test(own) && !taken.has(own)) { taken.add(own); return own; }
  return unique(customerCodeFromName(record.nameEn) || `CUS-${own.replace(/[^A-Z0-9]/g, "").slice(0, 20) || "ERP"}`, taken);
}

/** The app code for a supplier added from the ERP: its supplier code, else the initials the quotation import uses. */
export function supplierCodeFor(record: Pick<ErpMasterRecord, "key" | "code" | "nameEn" | "nameTh">, taken: Set<string>): string {
  const own = record.code.toUpperCase();
  if (own && own.length <= 30 && CODE_SHAPE.test(own) && !taken.has(own)) { taken.add(own); return own; }
  const initials = (record.nameEn || record.nameTh).replace(/[^A-Za-zก-๙0-9]/g, " ").split(/\s+/).map((word) => word[0]?.toUpperCase() ?? "").join("").slice(0, 8);
  return unique(initials || `SUP-${record.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)}`, taken);
}
