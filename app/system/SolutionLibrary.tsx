"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, getSalesMaterialCatalog, updateSalesMaterialCatalog } from "./api-client";
import { downloadMicrosoftSharedFile, getMicrosoftSharedFilePreview } from "./auth-client";
import { useLanguage } from "./i18n";
import { IS_TEAM_TEST_MODE } from "./team-test-client";
import { Drawer, EmptyState, Icon, Pill } from "./ui";
import seedCatalog from "./data/sales-materials.json";
import { catalogChanges, parseSalesMaterialWorkbook, type SalesMaterial, type SalesMaterialCatalog } from "./sales-material-catalog";
import "./solution-library.css";

const copy = {
  TH: {
    expand: "ขยายทั้งหมด", collapse: "ย่อทั้งหมด", unspecified: "ไม่ระบุภาษา",
    label: "Solution และสื่อขาย", intro: "พรีเซนต์บริษัทและเอกสาร Solution สำหรับเตรียมพบลูกค้า",
    source: "เปิดรายการต้นฉบับ", search: "ค้นหา Solution ชื่อเอกสาร หรือชื่อไฟล์…", language: "ภาษาเอกสาร", format: "ประเภทไฟล์",
    allLanguages: "ทุกภาษา", allFormats: "ทุกประเภท", categories: "หมวด", files: "รายการ", view: "ดูเอกสาร", open: "เปิดไฟล์", close: "ปิด",
    empty: "ไม่พบเอกสารที่ตรงกัน", reset: "ล้างตัวกรอง", hint: "เลือก PDF สำหรับเปิดอ่าน หรือ PPTX สำหรับเตรียมพรีเซนต์",
    preview: "Preview", autoUpdate: "Auto update", updating: "กำลังตรวจรายการ…", updated: "อัปเดตล่าสุด", neverUpdated: "ยังไม่เคย Auto update",
    teamTestHint: "Team Test: เลือกไฟล์รายการ .xlsx ที่ดาวน์โหลดล่าสุด ระบบจะเทียบและเผยแพร่ให้ผู้ใช้ทุกคน",
    productionHint: "อ่านรายการล่าสุดจาก Microsoft 365 และเผยแพร่ให้ผู้ใช้ทุกคน (อาจขอสิทธิ์ Files.Read ครั้งแรก)",
    noChanges: "รายการเป็นปัจจุบันแล้ว", updateFailed: "Auto update ไม่สำเร็จ", added: "เพิ่ม", removed: "นำออก", totalNow: "รวม",
    previewLoading: "กำลังเตรียม Preview จาก Microsoft 365…", previewUnavailable: "ไม่สามารถแสดง Preview ในหน้านี้ได้ กรุณาเปิดไฟล์ใน Microsoft 365",
    previewHint: "Preview ใช้สิทธิ์ Microsoft 365 ของบัญชีบริษัท",
    note: "รายการส่วนกลางจากไฟล์ต้นฉบับ ผู้ดูแลสามารถกด Auto update เมื่อมีการเพิ่มหรือแก้ไขไฟล์",
    row: "แถวต้นฉบับ", filename: "ชื่อไฟล์", title: "เอกสาร", match: "เอกสารที่ตรงกับตัวกรอง", access: "เปิดผ่าน SharePoint ตามสิทธิ์ของบัญชีบริษัท", snapshot: "รายการสื่อขายของบริษัท",
  },
  EN: {
    expand: "Expand all", collapse: "Collapse all", unspecified: "Unspecified language",
    label: "Solutions & Sales Materials", intro: "Company presentations and solution documents for customer meetings",
    source: "Open source index", search: "Search solution, document or filename…", language: "Document language", format: "File type",
    allLanguages: "All languages", allFormats: "All formats", categories: "categories", files: "materials", view: "View materials", open: "Open file", close: "Close",
    empty: "No matching materials", reset: "Clear filters", hint: "Choose PDF to read or PPTX to prepare a presentation",
    preview: "Preview", autoUpdate: "Auto update", updating: "Checking the index…", updated: "Last updated", neverUpdated: "Not auto-updated yet",
    teamTestHint: "Team Test: select the latest downloaded XLSX index; it will be compared and published for all users.",
    productionHint: "Reads the latest index from Microsoft 365 and publishes it for all users (Files.Read may be requested once).",
    noChanges: "The catalog is already current", updateFailed: "Auto update failed", added: "added", removed: "removed", totalNow: "total",
    previewLoading: "Preparing the Microsoft 365 preview…", previewUnavailable: "This file cannot be previewed here. Open it in Microsoft 365 instead.",
    previewHint: "Preview uses your company Microsoft 365 permissions.",
    note: "Shared catalog from the source workbook. An administrator can run Auto update after files are added or changed.",
    row: "Source row", filename: "Filename", title: "Document", match: "materials matching filters", access: "Opens in SharePoint using your company account permissions", snapshot: "Company sales index",
  },
  JP: {
    expand: "すべて展開", collapse: "すべて折りたたむ", unspecified: "言語未指定",
    label: "ソリューション・営業資料", intro: "商談準備のための会社紹介・ソリューション資料",
    source: "元の一覧を開く", search: "ソリューション・資料名・ファイル名を検索…", language: "資料の言語", format: "ファイル形式",
    allLanguages: "すべての言語", allFormats: "すべての形式", categories: "カテゴリ", files: "件", view: "資料を見る", open: "ファイルを開く", close: "閉じる",
    empty: "該当する資料はありません", reset: "フィルターをクリア", hint: "閲覧にはPDF、プレゼン準備にはPPTXを選択",
    preview: "プレビュー", autoUpdate: "自動更新", updating: "一覧を確認中…", updated: "最終更新", neverUpdated: "自動更新は未実行",
    teamTestHint: "Team Test：ダウンロードした最新のXLSX一覧を選択すると、比較して全ユーザー向けに公開します。",
    productionHint: "Microsoft 365から最新一覧を読み込み、全ユーザー向けに公開します（初回にFiles.Readを求める場合があります）。",
    noChanges: "一覧は最新です", updateFailed: "自動更新できませんでした", added: "追加", removed: "削除", totalNow: "合計",
    previewLoading: "Microsoft 365プレビューを準備しています…", previewUnavailable: "このページではプレビューできません。Microsoft 365でファイルを開いてください。",
    previewHint: "プレビューには会社のMicrosoft 365権限が適用されます。",
    note: "元のファイルから作成した共有一覧です。ファイル追加・変更後に管理者が自動更新できます。",
    row: "元の行", filename: "ファイル名", title: "資料", match: "件の該当資料", access: "会社アカウントの権限でSharePointを開きます", snapshot: "会社の営業資料一覧",
  },
};

export function useSolutionLibraryLabel() {
  return copy[useLanguage().lang].label;
}

type SolutionLibraryProps = { canUpdate?: boolean; notify?: (message: string) => void };
type PreviewState = { item: SalesMaterial; status: "loading" | "ready" | "unavailable"; url?: string };

export function SolutionLibrary({ canUpdate = false, notify }: SolutionLibraryProps) {
  const { lang } = useLanguage();
  const c = copy[lang];
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [format, setFormat] = useState("");
  const [catalog, setCatalog] = useState<SalesMaterialCatalog>(seedCatalog as SalesMaterialCatalog);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [expansion, setExpansion] = useState<{ context: string; nodes: Record<string, boolean> }>({ context: "", nodes: {} });
  const filterContext = JSON.stringify([search.trim(), language, format]);
  const filtered = Boolean(search.trim() || language || format);
  const isExpanded = (id: string) => (expansion.context === filterContext ? expansion.nodes[id] : undefined) ?? filtered;
  const toggle = (id: string) => setExpansion(previous => ({
    context: filterContext,
    nodes: { ...(previous.context === filterContext ? previous.nodes : {}), [id]: !isExpanded(id) },
  }));
  const groups = useMemo(() => catalog.groups.map(group => ({ ...group, materials: group.materials.filter(item => {
    const term = search.trim().toLocaleLowerCase();
    return (!language || item.language === language) && (!format || item.format === format)
      && (!term || `${group.title} ${item.title} ${item.filename}`.toLocaleLowerCase().includes(term));
  }) })).filter(group => group.materials.length), [catalog, search, language, format]);
  const expandAll = (open: boolean) => setExpansion({ context: filterContext, nodes: Object.fromEntries(groups.flatMap(group => [
    [group.id, open],
    ...[...new Set(group.materials.map(item => item.language))].map(value => [`${group.id}-${value}`, open]),
  ])) });
  const count = groups.reduce((sum, group) => sum + group.materials.length, 0);
  const languages = [...new Set(catalog.groups.flatMap(group => group.materials.map(item => item.language)))];
  const formats = [...new Set(catalog.groups.flatMap(group => group.materials.map(item => item.format)))];
  const clear = () => { setSearch(""); setLanguage(""); setFormat(""); };

  const openPreview = (item: SalesMaterial) => {
    const fileUrl = item.url || catalog.sourceUrl;
    if (IS_TEAM_TEST_MODE) {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setPreviewState({ item, status: "loading" });
    void getMicrosoftSharedFilePreview(fileUrl)
      .then(url => setPreviewState(current => current?.item.row === item.row ? { item, status: "ready", url } : current))
      .catch(() => setPreviewState(current => current?.item.row === item.row ? { item, status: "unavailable" } : current));
  };

  useEffect(() => {
    void getSalesMaterialCatalog().then(setCatalog).catch((error: unknown) => {
      if (!(error instanceof ApiClientError && error.status === 404)) setSyncMessage(error instanceof Error ? error.message : c.updateFailed);
    });
  }, [c.updateFailed]);

  const publishWorkbook = async (file: File) => {
    setSyncing(true); setSyncMessage(c.updating);
    try {
      const next = await parseSalesMaterialWorkbook(file);
      const changes = catalogChanges(catalog, next);
      if (!changes.added && !changes.removed) {
        setSyncMessage(`${c.noChanges} · ${changes.total} ${c.files}`);
        return;
      }
      const stored = await updateSalesMaterialCatalog(next);
      setCatalog(stored);
      const message = `${c.added} ${changes.added} · ${c.removed} ${changes.removed} · ${c.totalNow} ${changes.total}`;
      setSyncMessage(message); notify?.(message);
    } catch (error) {
      const message = `${c.updateFailed}: ${error instanceof Error ? error.message : "Unknown error"}`;
      setSyncMessage(message); notify?.(message);
    } finally { setSyncing(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const autoUpdate = async () => {
    if (IS_TEAM_TEST_MODE) { fileInput.current?.click(); return; }
    setSyncing(true); setSyncMessage(c.updating);
    try {
      const blob = await downloadMicrosoftSharedFile(catalog.sourceUrl);
      await publishWorkbook(new File([blob], catalog.sourceFile || "Sales material.xlsx", { type: blob.type }));
    } catch (error) {
      const message = `${c.updateFailed}: ${error instanceof Error ? error.message : "Unknown error"}`;
      setSyncMessage(message); notify?.(message); setSyncing(false);
    }
  };

  return <section className="solution-library" aria-label={c.label}>
    <div className="solution-library-heading">
      <div><p className="solution-eyebrow">TOMAS TECH</p><h2>{c.label}</h2><p>{c.intro}</p></div>
      <div className="solution-heading-actions">
        {canUpdate ? <><input ref={fileInput} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { const file = event.target.files?.[0]; if (file) void publishWorkbook(file); }} />
          <button className="btn primary" type="button" disabled={syncing} onClick={() => { void autoUpdate(); }}><Icon name="refresh" />{syncing ? c.updating : c.autoUpdate}</button></> : null}
        <a className="btn secondary" href={catalog.sourceUrl} target="_blank" rel="noopener noreferrer"><Icon name="arrowRight" />{c.source}</a>
      </div>
    </div>
    {canUpdate ? <div className="solution-sync-status" role="status"><Icon name="refresh" /><div><strong>{syncMessage || (catalog.updatedAt ? `${c.updated}: ${new Date(catalog.updatedAt).toLocaleString()}` : c.neverUpdated)}</strong><span>{IS_TEAM_TEST_MODE ? c.teamTestHint : c.productionHint}</span></div></div> : null}
    <div className="solution-filters">
      <label className="solution-search"><span>{c.search}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={c.search} /></label>
      <label><span>{c.language}</span><select value={language} onChange={event => setLanguage(event.target.value)}><option value="">{c.allLanguages}</option>{languages.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>{c.format}</span><select value={format} onChange={event => setFormat(event.target.value)}><option value="">{c.allFormats}</option>{formats.map(value => <option key={value}>{value}</option>)}</select></label>
      {search || language || format ? <button type="button" className="btn ghost" onClick={clear}>{c.reset}</button> : null}
    </div>
    <div className="solution-result-summary" aria-live="polite"><strong>{groups.length} {c.categories} · {count} {c.files}</strong><span>{c.hint}</span></div>
    {groups.length ? <div className="solution-tree">
      <div className="solution-tree-toolbar"><span><Icon name="folder" /> TOMAS TECH</span><div>
        <button className="btn ghost sm" type="button" onClick={() => expandAll(true)}>{c.expand}</button>
        <button className="btn ghost sm" type="button" onClick={() => expandAll(false)}>{c.collapse}</button>
      </div></div>
      <ul className="solution-tree-root" aria-label={c.label}>{groups.map(group => <li key={group.id}>
        <button type="button" className="solution-tree-toggle solution-tree-category" aria-expanded={isExpanded(group.id)} aria-controls={`solution-children-${group.id}`} onClick={() => toggle(group.id)}>
          <Icon name={isExpanded(group.id) ? "chevronDown" : "chevronRight"} /><Icon name="folder" />
          <span className="solution-tree-name">{group.title}</span><span className="solution-tree-count">{group.materials.length} {c.files}</span>
        </button>
        <ul id={`solution-children-${group.id}`} hidden={!isExpanded(group.id)} className="solution-tree-branches">
          {[...new Set(group.materials.map(item => item.language))].map(value => {
            const id = `${group.id}-${value}`;
            const materials = group.materials.filter(item => item.language === value);
            return <li key={value}>
              <button type="button" className="solution-tree-toggle" aria-expanded={isExpanded(id)} aria-controls={`solution-children-${id}`} onClick={() => toggle(id)}>
                <Icon name={isExpanded(id) ? "chevronDown" : "chevronRight"} /><Icon name="globe" />
                <span className="solution-tree-name">{value === "—" ? c.unspecified : value}</span><span className="solution-tree-count">{materials.length} {c.files}</span>
              </button>
              <ul id={`solution-children-${id}`} hidden={!isExpanded(id)} className="solution-tree-branches">
                {materials.map(item => <li key={item.row} className="solution-tree-leaf">
                  <Icon name={item.format === "VIDEO" ? "play" : "file"} />
                  <button type="button" className="solution-preview-name" onClick={() => openPreview(item)} title={`${c.preview} · ${c.row} ${item.row}`}>
                    <span>{item.title}</span><small>{item.filename.startsWith("https://") ? `${c.row} ${item.row}` : item.filename}</small>
                  </button>
                  <Pill>{item.format}</Pill>
                  <button type="button" className="btn ghost sm solution-preview-action" onClick={() => openPreview(item)}><Icon name="play" />{c.preview}</button>
                </li>)}
              </ul>
            </li>;
          })}
        </ul>
      </li>)}</ul>
    </div> : <EmptyState icon="search" title={c.empty} message={c.search} action={<button className="btn ghost" type="button" onClick={clear}>{c.reset}</button>} />}
    <div className="solution-source"><Icon name="file" /><div><strong>{c.snapshot}</strong><span>{catalog.sourceFile}</span><p>{c.note}</p></div></div>
    {previewState ? <Drawer title={previewState.item.title} subtitle={`${previewState.item.language} · ${previewState.item.format} · ${previewState.item.filename}`} onClose={() => setPreviewState(null)} width={1120} footer={<><span className="muted">{c.previewHint}</span><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setPreviewState(null)}>{c.close}</button><a className="btn primary" href={previewState.item.url || catalog.sourceUrl} target="_blank" rel="noopener noreferrer"><Icon name="externalLink" />{previewState.item.url ? c.open : c.source}</a></>}>
      {previewState.status === "ready" && previewState.url
        ? <div className="solution-preview-frame"><iframe key={previewState.url} title={`${c.preview}: ${previewState.item.title}`} src={previewState.url} allow="fullscreen" /></div>
        : <div className={`solution-preview-message ${previewState.status}`} role="status"><Icon name={previewState.status === "loading" ? "refresh" : "file"} /><strong>{previewState.status === "loading" ? c.previewLoading : c.previewUnavailable}</strong>{previewState.status === "unavailable" ? <a className="btn primary" href={previewState.item.url || catalog.sourceUrl} target="_blank" rel="noopener noreferrer"><Icon name="externalLink" />{previewState.item.url ? c.open : c.source}</a> : null}</div>}
    </Drawer> : null}
  </section>;
}
