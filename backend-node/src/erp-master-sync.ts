// Reads the Pegasus ERP's customer and supplier registers into dbo.erp_customers / dbo.erp_suppliers (migrations 099 and 100) and
// applies them to the app's customers and suppliers. The ERP forbids background jobs and service accounts, so a round runs
// when someone opens those screens, with their own TMT ID token, and at most once per 15 minutes for the whole app.
import sql from "mssql";
import type { Transaction } from "mssql";
import { insertAudit } from "./audit.js";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import { describeErpFailure, type ErpGateway } from "./erp-purchasing.js";
import { addressLine, appParty, customerCodeFor, displayName, masterListArguments, MasterShapeError, matchParty, MASTER_TOOLS, readMasterPage,
  supplierCodeFor, websiteOf, type AppParty, type ErpMasterRecord, type MasterKind } from "./erp-master-data.js";
import type { CurrentUser } from "./types.js";

const FRESH_MINUTES = 15;
const LEASE_MINUTES = 10;
/** After a failed round, the next person to open the screen waits this long before the ERP is asked again. */
const RETRY_MINUTES = 2;
/** Pages read in one request; a longer register continues from its cursor the next time the screen is opened. */
const PAGES_PER_ROUND = 25;

export type MasterCounts = { read: number; created: number; linked: number; updated: number; review: number; closed: number };
export type MasterSyncOutcome = { kind: MasterKind; state: "synced" | "partial" | "fresh" | "busy" | "failed" | "signed_out" | "off"; changed: boolean;
  message?: string; counts?: MasterCounts };
export type MasterStatus = { kind: MasterKind; finishedAt: string | null; attemptedAt: string | null; running: boolean; continuing: boolean;
  error: string | null; counts: MasterCounts | null; erpActive: number; linked: number; appOnly: number; review: number };
export type MasterReviewItem = { key: string; code: string; nameTh: string; nameEn: string; shortName: string; taxId: string; branch: string; address: string; candidateIds: number[] };
export type MasterCandidate = { id: number; code: string; name: string; nameTh: string; nameEn: string; taxId: string; address: string; erpKey: string | null;
  erpCode: string | null; isActive: boolean };

// Customers link by customer_id (migration 100); erp_customer_code is the ERP code people see. Suppliers have one column for both.
const TABLE = {
  customers: { mirror: "dbo.erp_customers", mirrorKey: "customer_id", app: "dbo.customers", link: "erp_customer_id", shown: "erp_customer_code", entity: "Customer" },
  suppliers: { mirror: "dbo.erp_suppliers", mirrorKey: "supplier_id", app: "dbo.suppliers", link: "erp_supplier_id", shown: "erp_supplier_id", entity: "Supplier" },
} as const;

/** erp_code: a customer linked under migration 099 by code only, until a read gives it the id of the record carrying that code. */
type AppRow = { id: number; code: string; name: string; name_th: string; name_en: string; name_ja: string; tax_id: string; erp_key: string | null;
  erp_code: string | null; is_active: boolean };
type MirrorRow = Record<string, unknown>;
type Apply = { row: AppRow; record: ErpMasterRecord; erpKey: string; active: boolean };

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;
const str = (value: unknown) => typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);

/** A mirror row back into the shape readMasterPage gives. */
function recordOf(kind: MasterKind, row: MirrorRow): ErpMasterRecord {
  const key = str(row[TABLE[kind].mirrorKey]);
  return { key, code: str(kind === "customers" ? row.customer_code : row.supplier_code), nameTh: str(row.name_th), nameEn: str(row.name_en), shortName: str(row.short_name),
    taxId: str(row.tax_id), branch: str(row.branch), address: str(row.address), province: str(row.province), postalCode: str(row.postal_code),
    country: str(row.country), phone: str(row.phone), email: str(row.email), website: str(row.website), contactName: str(row.contact_name),
    approvalStatus: str(row.approval_status), isActive: Boolean(row.is_active), mergedInto: row.merged_into ? str(row.merged_into) : null,
    updatedAt: row.erp_updated_at ? str(row.erp_updated_at) : null, hash: str(row.content_hash) };
}

// A customer linked by code only is not free to match another record: it waits for its own, or for an Admin.
const partyOf = (row: AppRow): AppParty => appParty(row.id, [row.name, row.name_th, row.name_en], row.tax_id, row.erp_key ?? (row.erp_code ? `code:${row.erp_code}` : null));

async function loadApp(transaction: Transaction, kind: MasterKind): Promise<{ rows: AppRow[]; codes: Set<string> }> {
  const request = new sql.Request(transaction);
  const rows = kind === "customers"
    ? await request.query<AppRow>(`SELECT id,code,name,name_th,name_en,name_ja,N'' tax_id,erp_customer_id erp_key,
        CASE WHEN erp_customer_id IS NULL THEN erp_customer_code END erp_code,is_active
        FROM dbo.customers WITH (UPDLOCK) WHERE deleted_at IS NULL; SELECT code FROM dbo.customers;`)
    : await request.query<AppRow>(`SELECT id,code,name,N'' name_th,N'' name_en,N'' name_ja,tax_id,erp_supplier_id erp_key,NULL erp_code,is_active
        FROM dbo.suppliers WITH (UPDLOCK) WHERE deleted_at IS NULL; SELECT code FROM dbo.suppliers;`);
  const sets = rows.recordsets as unknown as [AppRow[], { code: string }[]];
  return { rows: sets[0].map((row) => ({ ...row, id: Number(row.id) })), codes: new Set(sets[1].map((row) => row.code.toUpperCase())) };
}

/** Writes the ERP's names and address onto linked app records. Returns the ids written; a record linked meanwhile is left alone. */
async function applyToApp(transaction: Transaction, kind: MasterKind, actorId: number, items: Apply[]): Promise<Set<number>> {
  if (!items.length) return new Set();
  const request = new sql.Request(transaction); request.input("actor", sql.BigInt, actorId);
  if (kind === "customers") {
    request.input("rows", sql.NVarChar(sql.MAX), JSON.stringify(items.map(({ row, record, erpKey, active }) => {
      const nameTh = record.nameTh || row.name_th, nameEn = record.nameEn || row.name_en;
      return { id: row.id, prev: row.erp_key, erpKey, erpCode: record.code, name: nameEn || nameTh || row.name_ja || row.name, nameTh, nameEn,
        shortName: record.shortName, country: record.country, website: websiteOf(record.website), site: addressLine(record), active };
    })));
    // A record without a code (a merge whose surviving record is not read yet) keeps the code shown until it is.
    const done = await request.query<{ id: number }>(`
      UPDATE c SET name=j.name,name_th=j.nameTh,name_en=j.nameEn,
        short_name=CASE WHEN j.shortName<>N'' THEN j.shortName ELSE c.short_name END,
        country=CASE WHEN j.country<>N'' THEN j.country ELSE c.country END,
        website=CASE WHEN j.website<>N'' THEN j.website ELSE c.website END,
        site=CASE WHEN j.site<>N'' THEN j.site ELSE c.site END,
        is_active=j.active,erp_customer_id=j.erpKey,erp_customer_code=CASE WHEN j.erpCode<>N'' THEN j.erpCode ELSE ISNULL(c.erp_customer_code,j.erpKey) END,
        updated_by=@actor,updated_at=SYSUTCDATETIME()
      OUTPUT inserted.id
      FROM dbo.customers c JOIN OPENJSON(@rows) WITH (id bigint '$.id', prev nvarchar(50) '$.prev', erpKey nvarchar(50) '$.erpKey', erpCode nvarchar(50) '$.erpCode',
        name nvarchar(300) '$.name', nameTh nvarchar(300) '$.nameTh', nameEn nvarchar(300) '$.nameEn', shortName nvarchar(100) '$.shortName',
        country nvarchar(120) '$.country', website nvarchar(500) '$.website', site nvarchar(300) '$.site', active bit '$.active') j ON j.id=c.id
      WHERE c.deleted_at IS NULL AND (c.erp_customer_id=j.prev OR (c.erp_customer_id IS NULL AND j.prev IS NULL));`);
    return new Set(done.recordset.map((row) => Number(row.id)));
  }
  request.input("rows", sql.NVarChar(sql.MAX), JSON.stringify(items.map(({ row, record, erpKey, active }) => ({
    id: row.id, prev: row.erp_key, erpKey, name: record.nameEn || record.nameTh || row.name, taxId: record.taxId, contact: record.contactName,
    email: record.email, phone: record.phone, active }))));
  const done = await request.query<{ id: number }>(`
    UPDATE s SET name=j.name,tax_id=CASE WHEN j.taxId<>N'' THEN j.taxId ELSE s.tax_id END,
      contact=CASE WHEN s.contact=N'' THEN j.contact ELSE s.contact END,email=CASE WHEN s.email=N'' THEN j.email ELSE s.email END,
      phone=CASE WHEN s.phone=N'' THEN j.phone ELSE s.phone END,is_active=j.active,erp_supplier_id=j.erpKey,updated_by=@actor,updated_at=SYSUTCDATETIME()
    OUTPUT inserted.id
    FROM dbo.suppliers s JOIN OPENJSON(@rows) WITH (id bigint '$.id', prev nvarchar(50) '$.prev', erpKey nvarchar(50) '$.erpKey',
      name nvarchar(300) '$.name', taxId nvarchar(20) '$.taxId', contact nvarchar(200) '$.contact', email nvarchar(256) '$.email',
      phone nvarchar(100) '$.phone', active bit '$.active') j ON j.id=s.id
    WHERE s.deleted_at IS NULL AND (s.erp_supplier_id=j.prev OR (s.erp_supplier_id IS NULL AND j.prev IS NULL));`);
  return new Set(done.recordset.map((row) => Number(row.id)));
}

/** Adds ERP records the app does not have. Returns the new app record for each ERP key. */
async function createInApp(transaction: Transaction, kind: MasterKind, actorId: number, records: ErpMasterRecord[], codes: Set<string>)
  : Promise<Map<string, { id: number; code: string }>> {
  if (!records.length) return new Map();
  const request = new sql.Request(transaction); request.input("actor", sql.BigInt, actorId);
  let created: { id: number; code: string; erp_key: string }[];
  if (kind === "customers") {
    request.input("rows", sql.NVarChar(sql.MAX), JSON.stringify(records.map((record) => ({ erpKey: record.key, erpCode: record.code || record.key,
      code: customerCodeFor(record, codes), name: displayName(record).slice(0, 300), nameTh: record.nameTh, nameEn: record.nameEn, shortName: record.shortName,
      country: record.country || "Thailand", website: websiteOf(record.website), site: addressLine(record) }))));
    created = (await request.query<{ id: number; code: string; erp_key: string }>(`
      INSERT dbo.customers (code,name,name_th,name_en,short_name,country,website,site,is_active,erp_customer_id,erp_customer_code,created_by,updated_by)
      OUTPUT inserted.id,inserted.code,inserted.erp_customer_id erp_key
      SELECT j.code,j.name,j.nameTh,j.nameEn,j.shortName,j.country,j.website,j.site,1,j.erpKey,j.erpCode,@actor,@actor
      FROM OPENJSON(@rows) WITH (erpKey nvarchar(50) '$.erpKey', erpCode nvarchar(50) '$.erpCode', code nvarchar(30) '$.code', name nvarchar(300) '$.name', nameTh nvarchar(300) '$.nameTh',
        nameEn nvarchar(300) '$.nameEn', shortName nvarchar(100) '$.shortName', country nvarchar(120) '$.country', website nvarchar(500) '$.website',
        site nvarchar(300) '$.site') j;`)).recordset;
  } else {
    request.input("rows", sql.NVarChar(sql.MAX), JSON.stringify(records.map((record) => ({ erpKey: record.key, code: supplierCodeFor(record, codes),
      name: displayName(record).slice(0, 300), taxId: record.taxId, contact: record.contactName, email: record.email, phone: record.phone }))));
    created = (await request.query<{ id: number; code: string; erp_key: string }>(`
      INSERT dbo.suppliers (code,name,tax_id,category,contact,email,phone,brands_json,is_active,erp_supplier_id,created_by,updated_by)
      OUTPUT inserted.id,inserted.code,inserted.erp_supplier_id erp_key
      SELECT j.code,j.name,j.taxId,N'General',j.contact,j.email,j.phone,N'[]',1,j.erpKey,@actor,@actor
      FROM OPENJSON(@rows) WITH (erpKey nvarchar(50) '$.erpKey', code nvarchar(30) '$.code', name nvarchar(300) '$.name', taxId nvarchar(20) '$.taxId',
        contact nvarchar(200) '$.contact', email nvarchar(256) '$.email', phone nvarchar(100) '$.phone') j;`)).recordset;
  }
  return new Map(created.map((row) => [row.erp_key, { id: Number(row.id), code: row.code }]));
}

async function setMatchStates(transaction: Transaction, kind: MasterKind, states: { erpKey: string; state: "PENDING" | "DONE" | "REVIEW"; ids: string | null }[]) {
  if (!states.length) return;
  const { mirror, mirrorKey } = TABLE[kind];
  const request = new sql.Request(transaction); request.input("rows", sql.NVarChar(sql.MAX), JSON.stringify(states));
  await request.query(`UPDATE m SET match_state=j.state,review_ids=j.ids FROM ${mirror} m
    JOIN OPENJSON(@rows) WITH (erpKey nvarchar(50) '$.erpKey', state nvarchar(10) '$.state', ids nvarchar(400) '$.ids') j ON m.${mirrorKey}=j.erpKey;`);
}

async function upsertMirror(database: Database, kind: MasterKind, records: ErpMasterRecord[]): Promise<void> {
  if (!records.length) return;
  const rows = JSON.stringify(records);
  const columns = kind === "customers"
    ? { key: "customer_id", list: "customer_code,name_th,name_en,short_name,tax_id,branch,address,province,postal_code,country,phone,email,website,is_active,merged_into,erp_updated_at",
      shape: "customer_code nvarchar(50) '$.code', short_name nvarchar(100) '$.shortName'," }
    : { key: "supplier_id", list: "supplier_code,name_th,name_en,tax_id,branch,address,province,postal_code,country,phone,email,website,contact_name,approval_status,is_active,merged_into,erp_updated_at",
      shape: "supplier_code nvarchar(50) '$.code', contact_name nvarchar(200) '$.contactName', approval_status nvarchar(30) '$.approvalStatus'," };
  const names = columns.list.split(",");
  await database.query(`
    MERGE ${TABLE[kind].mirror} WITH (HOLDLOCK) AS t
    USING (SELECT * FROM OPENJSON(@rows) WITH (${columns.key} nvarchar(50) '$.key', ${columns.shape}
      name_th nvarchar(300) '$.nameTh', name_en nvarchar(300) '$.nameEn', tax_id nvarchar(20) '$.taxId', branch nvarchar(100) '$.branch',
      address nvarchar(1000) '$.address', province nvarchar(120) '$.province', postal_code nvarchar(20) '$.postalCode', country nvarchar(120) '$.country',
      phone nvarchar(100) '$.phone', email nvarchar(256) '$.email', website nvarchar(500) '$.website', is_active bit '$.isActive',
      merged_into nvarchar(50) '$.mergedInto', erp_updated_at nvarchar(40) '$.updatedAt', content_hash char(64) '$.hash')) AS s
    ON t.${columns.key}=s.${columns.key}
    -- A changed record is matched again, even one that waited for an Admin: what it resembles may have changed.
    WHEN MATCHED AND t.content_hash<>s.content_hash THEN UPDATE SET ${names.map((name) => `${name}=s.${name}`).join(",")},
      content_hash=s.content_hash,match_state=N'PENDING',review_ids=NULL,synced_at=SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (${columns.key},${columns.list},content_hash) VALUES (s.${columns.key},${names.map((name) => `s.${name}`).join(",")},s.content_hash);`,
  (request) => request.input("rows", sql.NVarChar(sql.MAX), rows));
}

/**
 * Applies every record read but not yet applied: a linked one updates its app record, closed or merged ones close theirs,
 * and the rest are matched (erp-master-data.ts matchParty) to be linked, added, or left for an Admin.
 */
async function reconcile(database: Database, kind: MasterKind, actorId: number): Promise<Omit<MasterCounts, "read">> {
  const { mirror } = TABLE[kind];
  return database.transaction(async (transaction) => {
    const pending = (await new sql.Request(transaction).query<MirrorRow>(`SELECT * FROM ${mirror} WITH (UPDLOCK) WHERE match_state=N'PENDING';`)).recordset
      .map((row) => recordOf(kind, row));
    const counts = { created: 0, linked: 0, updated: 0, review: 0, closed: 0 };
    if (!pending.length) return counts;
    const app = await loadApp(transaction, kind);
    const byId = new Map(app.rows.map((row) => [row.id, row]));
    const parties = app.rows.map(partyOf);
    const partyById = new Map(parties.map((party) => [party.id, party]));
    const linked = new Map(app.rows.filter((row) => row.erp_key).map((row) => [row.erp_key!, row.id]));
    // One write per app record: a merge that moves a record to the surviving ERP record is followed by that record's details.
    const applies = new Map<number, Apply>(), creates: ErpMasterRecord[] = [];
    const states: { erpKey: string; state: "PENDING" | "DONE" | "REVIEW"; ids: string | null }[] = [];
    const link = (id: number, record: ErpMasterRecord, active: boolean, erpKey = record.key) => {
      const row = byId.get(id)!;
      applies.set(id, { row: applies.get(id)?.row ?? { ...row }, record, erpKey, active });
      if (row.erp_key) linked.delete(row.erp_key);
      linked.set(erpKey, id); row.erp_key = erpKey; partyById.get(id)!.erpKey = erpKey;
    };
    // Customers linked under migration 099 carry only the ERP code: each takes the id of the record carrying it, unmatched.
    const byCode = new Map(app.rows.filter((row) => !row.erp_key && row.erp_code).map((row) => [row.erp_code!, row.id]));
    for (const record of pending) {
      const id = record.code && !linked.has(record.key) ? byCode.get(record.code) : undefined;
      if (id === undefined) continue;
      byCode.delete(record.code); linked.set(record.key, id); partyById.get(id)!.erpKey = record.key;
    }
    // Merges first, so the record a merge points at finds the app record it now owns.
    for (const record of [...pending].sort((a, b) => Number(Boolean(b.mergedInto)) - Number(Boolean(a.mergedInto)))) {
      const own = linked.get(record.key);
      if (record.mergedInto && own !== undefined) {
        const target = linked.get(record.mergedInto);
        if (target === undefined) {
          // The app record follows the merge; the surviving record's own details arrive when it is read again.
          link(own, { ...record, code: "", nameTh: "", nameEn: "", shortName: "", country: "", website: "", address: "", province: "", postalCode: "", taxId: "",
            contactName: "", email: "", phone: "" }, byId.get(own)!.is_active, record.mergedInto);
          states.push({ erpKey: record.mergedInto, state: "PENDING", ids: null });
        } else if (target !== own) { link(own, record, false); counts.closed++; }
        states.push({ erpKey: record.key, state: "DONE", ids: null });
        continue;
      }
      const open = record.isActive && !record.mergedInto;
      if (own !== undefined) {
        if (!open && byId.get(own)!.is_active) counts.closed++; else counts.updated++;
        link(own, record, open); states.push({ erpKey: record.key, state: "DONE", ids: null });
        continue;
      }
      if (!open) { states.push({ erpKey: record.key, state: "DONE", ids: null }); continue; }
      const decision = matchParty(record, parties);
      if (decision.kind === "link") { link(decision.id, record, true); counts.linked++; states.push({ erpKey: record.key, state: "DONE", ids: null }); }
      else if (decision.kind === "review") { counts.review++; states.push({ erpKey: record.key, state: "REVIEW", ids: decision.ids.join(",") }); }
      else { creates.push(record); states.push({ erpKey: record.key, state: "DONE", ids: null }); }
    }
    const written = await applyToApp(transaction, kind, actorId, [...applies.values()]);
    // An app record an Admin linked meanwhile was not written; its ERP record is matched again next round.
    const missed = new Set([...applies.values()].filter((item) => !written.has(item.row.id)).map((item) => item.record.key));
    const created = await createInApp(transaction, kind, actorId, creates, app.codes);
    counts.created = created.size;
    // A merge asks for the surviving record again only when it was settled earlier; one read in this round was just applied.
    const read = new Set(pending.map((record) => record.key));
    await setMatchStates(transaction, kind, [
      ...states.filter((item) => !missed.has(item.erpKey) && !(item.state === "PENDING" && read.has(item.erpKey))),
      ...[...missed].map((erpKey) => ({ erpKey, state: "PENDING" as const, ids: null })),
    ]);
    await insertAudit(transaction, actorId, "ErpMasterData", 0, kind, "Synced from ERP", null, { ...counts, read: pending.length,
      created: [...created.values()].slice(0, 200).map((item) => item.code),
      linked: [...applies.values()].filter((item) => written.has(item.row.id)).slice(0, 200).map((item) => `${item.row.code}=${item.erpKey}`) });
    return counts;
  }, sql.ISOLATION_LEVEL.READ_COMMITTED);
}

export type ErpMasterSync = {
  enabled: boolean;
  sync: (kind: MasterKind, actor: CurrentUser, force: boolean) => Promise<MasterSyncOutcome>;
  status: () => Promise<MasterStatus[]>;
  reviewList: (kind: MasterKind) => Promise<{ items: MasterReviewItem[]; candidates: MasterCandidate[] }>;
  resolve: (kind: MasterKind, erpKey: string, choice: { action: "link"; id: number } | { action: "create" }, actor: CurrentUser) => Promise<{ id: number; code: string }>;
};

export function createErpMasterSync(database: Database, gateway: ErpGateway | null): ErpMasterSync {
  const release = (kind: MasterKind, set: string, bind: (request: sql.Request) => void = () => {}) =>
    database.query(`UPDATE dbo.erp_master_sync SET running_since=NULL${set ? `,${set}` : ""} WHERE kind=@kind;`, (request) => { request.input("kind", sql.NVarChar(20), kind); bind(request); });

  async function sync(kind: MasterKind, actor: CurrentUser, force: boolean): Promise<MasterSyncOutcome> {
    if (!gateway) return { kind, state: "off", changed: false, message: "The ERP link is not configured on this server." };
    const claimed = (await database.query<{ updated_since: string | null; round_server_time: string | null; page_cursor: string | null }>(`
      UPDATE dbo.erp_master_sync SET running_since=SYSUTCDATETIME(),attempted_at=SYSUTCDATETIME(),attempted_by=@actor
      OUTPUT inserted.updated_since,inserted.round_server_time,inserted.page_cursor
      WHERE kind=@kind AND (running_since IS NULL OR running_since<DATEADD(minute,-${LEASE_MINUTES},SYSUTCDATETIME()))
        AND (@force=1 OR ((page_cursor IS NOT NULL OR finished_at IS NULL OR finished_at<DATEADD(minute,-${FRESH_MINUTES},SYSUTCDATETIME()))
          AND (error IS NULL OR attempted_at IS NULL OR attempted_at<DATEADD(minute,-${RETRY_MINUTES},SYSUTCDATETIME()))));`,
    (request) => request.input("kind", sql.NVarChar(20), kind).input("actor", sql.BigInt, actor.id).input("force", sql.Bit, force))).recordset[0];
    if (!claimed) {
      const running = (await database.query<{ running: number }>(`SELECT CASE WHEN running_since>=DATEADD(minute,-${LEASE_MINUTES},SYSUTCDATETIME()) THEN 1 ELSE 0 END running
        FROM dbo.erp_master_sync WHERE kind=@kind;`, (request) => request.input("kind", sql.NVarChar(20), kind))).recordset[0];
      return { kind, state: running?.running ? "busy" : "fresh", changed: false };
    }
    const since = claimed.updated_since;
    let roundTime = claimed.round_server_time, cursor = claimed.page_cursor, read = 0;
    try {
      for (let page = 0; page < PAGES_PER_ROUND; page++) {
        const answer = await gateway.call<unknown>(actor.entraObjectId, MASTER_TOOLS[kind], masterListArguments(since, cursor));
        if (!answer.ok) {
          if (answer.kind === "signed_out") { await release(kind, ""); return { kind, state: "signed_out", changed: false, message: answer.message }; }
          // An expired cursor starts the round again rather than failing on every visit.
          const stale = Boolean(cursor && answer.kind === "validation" && answer.errors?.cursor);
          const message = describeErpFailure(answer);
          await release(kind, `error=@error${stale ? ",page_cursor=NULL,round_server_time=NULL" : ""}`, (request) => request.input("error", sql.NVarChar(500), message));
          return { kind, state: "failed", changed: false, message };
        }
        const content = readMasterPage(kind, answer.data);
        roundTime ??= content.serverTime;
        await upsertMirror(database, kind, content.records);
        read += content.records.length;
        cursor = content.nextCursor && content.nextCursor !== cursor ? content.nextCursor : null;
        if (!cursor) break;
        await database.query(`UPDATE dbo.erp_master_sync SET page_cursor=@cursor,round_server_time=@round,error=NULL WHERE kind=@kind;`, (request) =>
          request.input("kind", sql.NVarChar(20), kind).input("cursor", sql.NVarChar(1000), cursor).input("round", sql.NVarChar(40), roundTime));
      }
      const counts = { read, ...await reconcile(database, kind, actor.id) };
      await release(kind, `error=NULL,last_counts=@counts,${cursor
        ? "page_cursor=@cursor,round_server_time=@round"
        : "updated_since=@round,page_cursor=NULL,round_server_time=NULL,finished_at=SYSUTCDATETIME()"}`, (request) => request
        .input("counts", sql.NVarChar(400), JSON.stringify(counts)).input("cursor", sql.NVarChar(1000), cursor).input("round", sql.NVarChar(40), roundTime));
      const changed = counts.created + counts.linked + counts.updated + counts.closed > 0;
      return { kind, state: cursor ? "partial" : "synced", changed, counts };
    } catch (error) {
      const message = error instanceof MasterShapeError ? error.message : "The ERP register could not be stored. Try again later, or tell the Engineering Center team.";
      await release(kind, "error=@error", (request) => request.input("error", sql.NVarChar(500), message)).catch(() => undefined);
      if (error instanceof MasterShapeError) return { kind, state: "failed", changed: false, message };
      throw error;
    }
  }

  async function status(): Promise<MasterStatus[]> {
    const result = await database.query(`
      SELECT kind,finished_at,attempted_at,error,last_counts,CASE WHEN page_cursor IS NULL THEN 0 ELSE 1 END continuing,
        CASE WHEN running_since>=DATEADD(minute,-${LEASE_MINUTES},SYSUTCDATETIME()) THEN 1 ELSE 0 END running FROM dbo.erp_master_sync;
      SELECT N'customers' kind,
        (SELECT COUNT(*) FROM dbo.erp_customers WHERE is_active=1 AND merged_into IS NULL) erp_active,
        (SELECT COUNT(*) FROM dbo.customers WHERE deleted_at IS NULL AND erp_customer_code IS NOT NULL) linked,
        (SELECT COUNT(*) FROM dbo.customers WHERE deleted_at IS NULL AND is_active=1 AND erp_customer_code IS NULL) app_only,
        (SELECT COUNT(*) FROM dbo.erp_customers WHERE match_state=N'REVIEW') review
      UNION ALL SELECT N'suppliers',
        (SELECT COUNT(*) FROM dbo.erp_suppliers WHERE is_active=1 AND merged_into IS NULL),
        (SELECT COUNT(*) FROM dbo.suppliers WHERE deleted_at IS NULL AND erp_supplier_id IS NOT NULL),
        (SELECT COUNT(*) FROM dbo.suppliers WHERE deleted_at IS NULL AND is_active=1 AND erp_supplier_id IS NULL),
        (SELECT COUNT(*) FROM dbo.erp_suppliers WHERE match_state=N'REVIEW');`);
    const [states, totals] = result.recordsets as unknown as [Record<string, unknown>[], Record<string, unknown>[]];
    return (["customers", "suppliers"] as const).map((kind) => {
      const state = states.find((row) => row.kind === kind) ?? {}, total = totals.find((row) => row.kind === kind) ?? {};
      return { kind, finishedAt: iso(state.finished_at), attemptedAt: iso(state.attempted_at), running: Boolean(state.running), continuing: Boolean(state.continuing),
        error: state.error ? String(state.error) : null, counts: state.last_counts ? JSON.parse(String(state.last_counts)) as MasterCounts : null,
        erpActive: Number(total.erp_active ?? 0), linked: Number(total.linked ?? 0), appOnly: Number(total.app_only ?? 0), review: Number(total.review ?? 0) };
    });
  }

  async function reviewList(kind: MasterKind): Promise<{ items: MasterReviewItem[]; candidates: MasterCandidate[] }> {
    const { mirror, app, link, shown } = TABLE[kind];
    const items = (await database.query<MirrorRow>(`SELECT TOP (200) * FROM ${mirror} WHERE match_state=N'REVIEW' ORDER BY name_en,name_th;`)).recordset;
    const ids = [...new Set(items.flatMap((row) => str(row.review_ids).split(",").filter(Boolean).map(Number)))];
    const candidates = ids.length ? (await database.query<Record<string, unknown>>(`
      SELECT a.id,a.code,a.name,${kind === "customers" ? "a.name_th,a.name_en,N'' tax_id,a.site address" : "N'' name_th,N'' name_en,a.tax_id,N'' address"},
        a.${link} erp_key,a.${shown} erp_code,a.is_active
      FROM ${app} a WHERE a.deleted_at IS NULL AND a.id IN (SELECT CONVERT(bigint,value) FROM OPENJSON(@ids));`,
    (request) => request.input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)))).recordset : [];
    return {
      items: items.map((row) => { const record = recordOf(kind, row); return { key: record.key, code: record.code, nameTh: record.nameTh, nameEn: record.nameEn,
        shortName: record.shortName, taxId: record.taxId, branch: record.branch, address: addressLine(record), candidateIds: str(row.review_ids).split(",").filter(Boolean).map(Number) }; }),
      candidates: candidates.map((row) => ({ id: Number(row.id), code: str(row.code), name: str(row.name), nameTh: str(row.name_th), nameEn: str(row.name_en),
        taxId: str(row.tax_id), address: str(row.address), erpKey: row.erp_key ? str(row.erp_key) : null, erpCode: row.erp_code ? str(row.erp_code) : null,
        isActive: Boolean(row.is_active) })),
    };
  }

  /** An Admin's answer to a record that waited: it is this app record, or it is a new one. */
  async function resolve(kind: MasterKind, erpKey: string, choice: { action: "link"; id: number } | { action: "create" }, actor: CurrentUser) {
    const { mirror, mirrorKey, entity } = TABLE[kind];
    return database.transaction(async (transaction) => {
      const request = new sql.Request(transaction); request.input("key", sql.NVarChar(50), erpKey);
      const row = (await request.query<MirrorRow>(`SELECT * FROM ${mirror} WITH (UPDLOCK,HOLDLOCK) WHERE ${mirrorKey}=@key AND match_state=N'REVIEW';`)).recordset[0];
      if (!row) throw new ApiError(409, "erp_review_settled", "This ERP record has already been settled. Refresh the list.");
      const record = recordOf(kind, row);
      const app = await loadApp(transaction, kind);
      if (app.rows.some((item) => item.erp_key === record.key)) throw new ApiError(409, "erp_review_settled", "This ERP record is already linked. Refresh the list.");
      let result: { id: number; code: string };
      if (choice.action === "link") {
        const target = app.rows.find((item) => item.id === choice.id);
        if (!target) throw new ApiError(404, "erp_link_target_missing", "That record is no longer in the app.");
        if (target.erp_key) throw new ApiError(409, "erp_link_target_taken", "That record is already linked to another ERP record.");
        const written = await applyToApp(transaction, kind, actor.id, [{ row: target, record, erpKey: record.key, active: true }]);
        if (!written.has(target.id)) throw new ApiError(409, "erp_link_target_taken", "That record changed. Refresh the list.");
        result = { id: target.id, code: target.code };
      } else {
        const created = (await createInApp(transaction, kind, actor.id, [record], app.codes)).get(record.key)!;
        result = created;
      }
      await setMatchStates(transaction, kind, [{ erpKey: record.key, state: "DONE", ids: null }]);
      await insertAudit(transaction, actor.id, entity, result.id, result.code, choice.action === "link" ? "Linked to ERP" : "Added from ERP", null,
        { erpKey: record.key, name: displayName(record), taxId: record.taxId });
      return result;
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  }

  return { enabled: Boolean(gateway), sync, status, reviewList, resolve };
}
