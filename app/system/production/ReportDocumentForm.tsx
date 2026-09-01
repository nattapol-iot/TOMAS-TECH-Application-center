"use client";

import { useState, type ReactNode } from "react";
import "./report-document.css";
import { reportCopy, reportFieldLabel, reportLocale } from "./report-locale";

export type InputField = { key: string; label: string; type?: "date" | "datetime-local" | "number" | "url" | "email" | "tel"; options?: string[] };
export type Section = { key: string; label: string; fields: InputField[]; repeat?: boolean };
type Body = Record<string, unknown>;
type Props = { locale?: string; reportType: string; body: Body; onChange?: (body: Body) => void; readOnly?: boolean; reusableOnly?: boolean; sections: Section[] };
const object = (value: unknown): Body => value && typeof value === "object" && !Array.isArray(value) ? value as Body : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const requiredFields: Record<string, string[]> = {
  context: ["start", "end"], overview: ["objective", "summary"], hardware: ["item", "action"], software: ["module", "action"],
  service: ["symptom", "action", "verification", "testResult"], commissioning: ["checkpoint", "expected", "observed", "result"],
  scenarios: ["scenario", "step", "expected", "actual", "result"], checkpoints: ["checkpoint", "expected", "observed", "result"],
  trials: ["hypothesis", "successCriteria", "trial", "result"], deliverables: ["item", "status"], issues: ["issue", "owner", "status"], punchlist: ["scenario", "step", "issue", "owner", "status"], evidence: ["description"],
};
const titles: Record<string, string> = { context: "ข้อมูลการปฏิบัติงาน / Work details", overview: "ขอบเขตและวัตถุประสงค์ / Scope & objective", hardware: "Hardware / อุปกรณ์", software: "Software / โปรแกรมและการตั้งค่า", scenarios: "รายการทดสอบ UAT / Test scenarios", uatSummary: "สรุปผล UAT / UAT summary", punchlist: "รายการปัญหา UAT / Punchlist", evidence: "รูปภาพและหลักฐาน / Evidence references", issues: "งานค้างและผู้รับผิดชอบ / Pending actions", deliverables: "เอกสารและงานส่งมอบ / Deliverables", closing: "หมายเหตุและคำขอ / Remarks", commissioning: "ตรวจสอบการติดตั้ง / Commissioning", checkpoints: "รายการตรวจสอบ / Inspection", trials: "รายการทดลอง / POC trials" };
const longFields = new Set(["objective", "summary", "symptom", "rootCause", "action", "verification", "remarks", "followUp", "rollback", "acceptance", "customerAcceptance", "pendingItems"]);

function FieldControl({ field, value, label, readOnly, onChange, locale }: { locale?: string; field: InputField; value: unknown; label: string; readOnly: boolean; onChange: (value: string) => void }) {
  const t = (value: string) => reportCopy(locale, value);
  const content = text(value);
  let href: string | undefined;
  if (field.type === "url") { try { const url = new URL(content); if (["http:", "https:"].includes(url.protocol)) href = url.href; } catch { /* Plain text remains visible for invalid references. */ } }
  if (readOnly) return <div className="report-document-value">{href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : (field.options?.includes(content) ? t(content) : content) || "—"}</div>;
  if (field.options) return <select aria-label={label} value={content} onChange={event => onChange(event.target.value)}><option value="">{t("ยังไม่ระบุ")}</option>{content && !field.options.includes(content) ? <option value={content}>{content}</option> : null}{field.options.map(option => <option key={option} value={option}>{t(option)}</option>)}</select>;
  if (field.type) return <input aria-label={label} type={field.type} value={content} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? "any" : undefined} onChange={event => onChange(event.target.value)} />;
  const resize = (node: HTMLTextAreaElement | null) => { if (node) { node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; } };
  return <textarea aria-label={label} rows={1} maxLength={10000} value={content} ref={resize} onChange={event => { resize(event.currentTarget); onChange(event.target.value); }} />;
}

export function ReportDocumentForm({ locale = "th", reportType, body, onChange, readOnly = false, reusableOnly = false, sections: passedSections }: Props) {
  const t = (value: string) => reportCopy(locale, value);
  // These optional document fields live in the existing report body; templates use only the caller's sanitized fields.
  const optionalFields: Record<string, InputField[]> = {
    context: [{ key: "visitType", label: "Visit type" }, { key: "ticket", label: "Ticket / CR no." }],
    service: [{ key: "followUpOwner", label: "Follow-up owner" }, { key: "nextActionDate", label: "Next action date", type: "date" }, { key: "revisionUsed", label: "Revision used" }],
    closing: [{ key: "pendingItems", label: "Remaining / pending items" }],
    uatSummary: [{ key: "remarks", label: "Summary remarks" }],
  };
  const sections = reusableOnly ? passedSections : passedSections.map(section => ({ ...section, fields: [...section.fields, ...(optionalFields[section.key] ?? []).filter(field => !section.fields.some(existing => existing.key === field.key))] }));
  const [sheet, setSheet] = useState("cover");
  const find = (key: string) => sections.find(section => section.key === key);
  const labelFor = (section: Section, field: InputField) => `${reportFieldLabel(locale, field.key, field.label)}${!reusableOnly && requiredFields[section.key]?.includes(field.key) ? " *" : ""}`;
  const renderFields = (section: Section, fields = section.fields) => {
    const row = object(body[section.key]);
    return <div className="report-document-fields">{fields.map(field => <label className={longFields.has(field.key) ? "report-document-field wide" : "report-document-field"} key={field.key}><span>{labelFor(section, field)}</span><FieldControl locale={locale} field={field} label={labelFor(section, field)} value={row[field.key]} readOnly={readOnly} onChange={value => onChange?.({ ...body, [section.key]: { ...row, [field.key]: value } })} /></label>)}</div>;
  };
  const renderTable = (section: Section) => {
    const stored: unknown[] = Array.isArray(body[section.key]) ? body[section.key] as unknown[] : [];
    const visible = stored.length ? stored : readOnly ? [] : [{}];
    const update = (index: number, key: string, value: string) => {
      const next = stored.length ? [...stored] : [{}];
      next[index] = { ...object(next[index]), [key]: value };
      onChange?.({ ...body, [section.key]: next });
    };
    // The scroll region is keyboard-focusable so wide tables remain accessible without a pointer.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    return <><div className="report-document-table-scroll" role="region" aria-label={t(titles[section.key] ?? section.label)} tabIndex={0}><table className={`report-document-table table-${section.key}`}><thead><tr><th className="report-document-row-number" scope="col">No.</th>{section.fields.map(field => <th scope="col" key={field.key} className={`column-${field.key}`}>{labelFor(section, field)}</th>)}{!readOnly ? <th className="report-document-row-action" scope="col"><span className="report-document-sr-only">{t("ลบรายการ")}</span></th> : null}</tr></thead><tbody>{visible.map((value, index) => <tr key={index}><th scope="row" className="report-document-row-number">{index + 1}</th>{section.fields.map(field => <td className={`column-${field.key}`} key={field.key}><FieldControl locale={locale} field={field} label={`${t(titles[section.key] ?? section.label)} · ${labelFor(section, field)} · ${t("Row")} ${index + 1}`} value={object(value)[field.key]} readOnly={readOnly} onChange={next => update(index, field.key, next)} /></td>)}{!readOnly ? <td className="report-document-row-action"><button type="button" aria-label={`${t("Delete")} ${t(titles[section.key] ?? section.label)} ${t("Row")} ${index + 1}`} disabled={!stored.length} onClick={() => onChange?.({ ...body, [section.key]: stored.filter((_, rowIndex) => rowIndex !== index) })}>×</button></td> : null}</tr>)}</tbody></table>{!visible.length ? <p className="report-document-empty">{t("ยังไม่มีรายการ / No entries recorded")}</p> : null}</div>{!readOnly ? <button className="report-document-add" type="button" onClick={() => onChange?.({ ...body, [section.key]: [...(stored.length ? stored : [{}]), {}] })}>{t("＋ เพิ่มแถว / Add row")}</button> : null}</>;
  };
  const block = (title: string, children: ReactNode, key: string) => <section className="report-document-section" key={key}><h3>{t(title)}</h3>{children}</section>;
  const renderSection = (key: string, title?: string) => { const section = find(key); return section ? block(title ?? titles[key] ?? section.label, <>{key === "evidence" && !readOnly ? <p className="report-document-evidence-note">{t("ระบุรูปภาพหรือเอกสารที่ใช้อ้างอิง โดยกรอกชื่อไฟล์ / เลขเอกสาร หรือลิงก์หลักฐานอย่างน้อยหนึ่งช่องต่อรายการ / File reference or evidence URL")}</p> : null}{section.repeat ? renderTable(section) : renderFields(section)}</>, key) : null; };
  const servicePart = (keys: string[], title: string, key: string) => { const section = find("service"); const fields = section?.fields.filter(field => keys.includes(field.key)); return section && fields?.length ? block(title, renderFields(section, fields), key) : null; };
  const knownService = ["symptom", "impact", "rootCause", "action", "downtime", "backup", "rollback", "verification", "testResult", "customerAcceptance", "followUp", "followUpOwner", "nextActionDate", "revisionUsed"];
  const used = reportType === "SERVICE" ? ["context", "overview", "hardware", "software", "service", "issues", "evidence", "deliverables", "closing"] : reportType === "UAT" ? ["context", "overview", "uatSummary", "deliverables", "closing", "scenarios", "punchlist", "evidence"] : [];
  const sheetNav = [{ key: "cover", name: "1. หน้ารายงาน", sub: "Report & summary", sections: ["context", "overview", "uatSummary", "deliverables", "closing"] }, { key: "tests", name: "2. รายการทดสอบ", sub: "UAT list", sections: ["scenarios"] }, { key: "punchlist", name: "3. ปัญหา / งานค้าง", sub: "Punchlist", sections: ["punchlist"] }, { key: "evidence", name: "4. หลักฐาน", sub: "Evidence", sections: ["evidence"] }].filter(item => item.sections.some(key => find(key)));
  const activeSheet = sheetNav.some(item => item.key === sheet) ? sheet : sheetNav[0]?.key;
  return <div lang={reportLocale(locale)} translate="no" className={`report-document-form${readOnly ? " is-readonly" : ""}${reusableOnly ? " is-template" : ""}`}>
    {!readOnly ? <p className="report-document-guide">{reusableOnly ? t("กำหนดหัวข้อ ขั้นตอน และผลที่คาดหวังไว้ใช้ซ้ำ / Reusable instructions & expected results") : t("กรอกในช่องของแบบฟอร์มได้เลย · * ต้องกรอกก่อนส่งตรวจ (สำหรับแถวที่ใช้งาน) · บันทึกฉบับร่างระหว่างทำได้")}</p> : null}
    {reportType === "UAT" ? <>{!readOnly ? <nav className="report-document-tabs" aria-label="UAT sheets">{sheetNav.map(item => <button type="button" key={item.key} aria-pressed={activeSheet === item.key} onClick={() => setSheet(item.key)}><strong>{t(item.name)}</strong><small>{t(item.sub)}</small></button>)}</nav> : null}{sheetNav.map(item => <div className={`report-document-sheet${activeSheet === item.key ? " is-active" : ""}`} key={item.key} hidden={!readOnly && activeSheet !== item.key}><div className="report-document-sheet-title">{t(item.name)} <span>{t(item.sub)}</span></div>{item.key === "cover" && !reusableOnly ? <div className="report-document-contents"><strong>{t("รายการเอกสาร / Report contents")}</strong><ol>{sheetNav.map(entry => <li key={entry.key}><span>{t(entry.sub)}</span><span>{entry.key === "cover" ? t("ข้อมูลและสรุปผล") : `${entry.sections.reduce((total, key) => total + (Array.isArray(body[key]) ? (body[key] as unknown[]).filter(row => Object.values(object(row)).some(value => text(value).trim())).length : 0), 0)} ${t("entries")}`}</span></li>)}</ol></div> : null}{item.sections.map(key => renderSection(key))}</div>)}</> : reportType === "SERVICE" ? <>
      {renderSection("context")}{renderSection("overview", "1) ขอบเขตและวัตถุประสงค์ / Scope & objective")}
      {find("hardware") || find("software") ? block("2) รายละเอียดการติดตั้งหรือเปลี่ยนแปลง / Installation & change detail", <div className="report-document-equipment">{["hardware", "software"].map(key => { const section = find(key); return section ? <div key={key}><h4>{t(titles[key] ?? key)}</h4>{renderTable(section)}</div> : null; })}</div>, "equipment") : null}
      {servicePart(["symptom", "impact", "rootCause", "action", "downtime"], "3) ปัญหาและการแก้ไข / Problem & resolution", "diagnosis")}
      {find("service")?.fields.some(field => ["backup", "rollback"].includes(field.key)) ? <details className="report-document-details" open={readOnly || undefined}><summary>{t("การสำรองข้อมูลและแผนย้อนกลับ / Backup & rollback")}</summary>{renderFields(find("service")!, find("service")!.fields.filter(field => ["backup", "rollback"].includes(field.key)))}</details> : null}
      {servicePart(["verification", "testResult", "customerAcceptance", "followUp", "followUpOwner", "nextActionDate", "revisionUsed"], "4) การทดสอบและส่งมอบ / Verification & handover", "verification")}{renderSection("deliverables")}{renderSection("evidence")}
      {renderSection("issues", "5) รายการคงค้าง / Pending items")}{renderSection("closing")}
      {find("service")?.fields.some(field => !knownService.includes(field.key)) ? renderFields(find("service")!, find("service")!.fields.filter(field => !knownService.includes(field.key))) : null}
    </> : sections.map(section => renderSection(section.key))}
    {used.length ? sections.filter(section => !used.includes(section.key)).map(section => renderSection(section.key)) : null}
  </div>;
}
