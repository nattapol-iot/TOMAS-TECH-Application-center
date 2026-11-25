"use client";
/*
 * Historical import (owner request 2026-11-25): an old Excel Estimate Cost, from a job that already runs as a project
 * without an estimate, becomes that project's estimate. The person picks the project, checks the workbook's rows and
 * totals, and the server writes a Draft R00 dated from the workbook, linked to the project, that can still be changed and
 * goes through review and approval like any other estimate. The workbook is read by the same parser as the import into an
 * open estimate, and the server reads the uploaded file again before it saves anything.
 */
import { useEffect, useState } from "react";
import { importHistoricalEstimate, listHistoricalImportProjects, type BootstrapData, type HistoricalImportProject, type HistoricalImportResult } from "../api-client";
import { currentLocale } from "../i18n";
import { Field, Icon, Modal } from "../ui";
import { DateInput } from "../DateInput";
import { readWorkbookSheets } from "../../../lib/import-spreadsheet";
import { parseEstimateWorkbook, suggestedImportProject, type EstimateImportPreview } from "../../../lib/estimate-excel-import";
import { estimateUxCopy } from "../../../lib/estimate-ux";
import { EstimateImportPreviewDetails } from "./EstimateExcelImport";

const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
/** The office's calendar date, as the server checks it (an import made early in the morning is still dated today). */
const businessDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
export function HistoricalEstimateImportModal({
  bootstrap,
  owners,
  onClose,
  onImported,
}: {
  bootstrap: BootstrapData;
  /** The people this person may name as the estimate's owner: everyone who can own one for a manager, otherwise themself. */
  owners: readonly { id: number; name: string; department: string }[];
  onClose: () => void;
  onImported: (result: HistoricalImportResult) => Promise<void>;
}) {
  const today = businessDate();
  const [projects, setProjects] = useState<HistoricalImportProject[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [projectId, setProjectId] = useState(0);
  const [ownerId, setOwnerId] = useState(() => owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0);
  const [dueDate, setDueDate] = useState(() => businessDate(new Date(Date.now() + 7 * 86_400_000)));
  const [contingency, setContingency] = useState(0);
  const [hours, setHours] = useState(8);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EstimateImportPreview | null>(null);
  const [sourceDate, setSourceDate] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void listHistoricalImportProjects()
      .then((rows) => {
        if (alive) setProjects(rows);
      })
      .catch((requestError: unknown) => {
        if (alive) {
          setProjects([]);
          setLoadError(requestError instanceof Error ? requestError.message : String(requestError));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const project = projects?.find((item) => item.id === projectId);
  const choose = async (chosen?: File) => {
    if (!chosen) return;
    setReading(true);
    setError("");
    setPreview(null);
    setFile(null);
    setSourceDate("");
    try {
      if (!/\.xlsx$/i.test(chosen.name))
        throw new Error(copy("เลือกไฟล์ .xlsx ของฟอร์ม Estimate Cost บริษัท", "Choose the company Estimate Cost workbook (.xlsx).", "会社のEstimate Costブック(.xlsx)を選択してください。"));
      const parsed = parseEstimateWorkbook(await readWorkbookSheets(chosen), chosen.name);
      if (!parsed)
        throw new Error(copy("ไม่พบชีต Summary cost ของฟอร์มบริษัทในไฟล์นี้", "This file has no Summary cost sheet of the company form.", "このファイルに会社フォームのSummary costシートがありません。"));
      for (const line of parsed.lines) {
        const supplier = bootstrap.suppliers.find((item) => [item.name, item.code].some((value) => value.trim().toLowerCase() === line.supplierName.toLowerCase()));
        if (supplier) line.supplierId = supplier.id;
      }
      setPreview(parsed);
      setFile(chosen);
      setSourceDate(parsed.sourceDate);
      if (!projectId && projects) {
        const match = suggestedImportProject(projects, chosen.name, parsed.project);
        if (match) setProjectId(match.id);
      }
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    } finally {
      setReading(false);
    }
  };

  // The workbook's own date (Summary cost L3) is fixed; a workbook without one needs the date typed here.
  const dateFromWorkbook = Boolean(preview?.sourceDate);
  const dateOk = Boolean(sourceDate) && sourceDate <= today;
  const ready = Boolean(
    preview && file && project && ownerId && dueDate >= today && dateOk && hours > 0 && hours <= 24 && contingency >= 0 && contingency <= 100 && !preview.errors.length && preview.lines.length,
  );
  const submit = async () => {
    if (!ready || !preview || !file || !project) return;
    setBusy(true);
    setError("");
    try {
      const result = await importHistoricalEstimate(
        {
          projectId: project.id,
          ownerId,
          dueDate,
          contingencyRate: contingency,
          sourceName: file.name,
          sourceRevision: preview.sourceRevision,
          sourceDate,
          sourceTotal: preview.sourceTotal,
          hoursPerDay: hours,
          lines: preview.lines,
        },
        file,
      );
      await onImported(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import old estimate"
      subtitle="An old Excel Estimate Cost becomes a Draft estimate of its project"
      size="wide"
      onClose={() => {
        if (!busy && !reading) onClose();
      }}
      footer={
        <>
          <button type="button" className="btn default" disabled={busy || reading} onClick={onClose}>
            {copy("ยกเลิก", "Cancel", "キャンセル")}
          </button>
          <button
            type="button"
            className="btn primary"
            data-guide="estimate.historical-save"
            disabled={!ready || busy || reading}
            onClick={() => {
              void submit();
            }}
          >
            <Icon name="upload" />
            {busy
              ? copy("กำลังบันทึก…", "Saving…", "保存中…")
              : copy(`นำเข้า ${preview?.lines.length ?? 0} รายการ`, `Import ${preview?.lines.length ?? 0} rows`, `${preview?.lines.length ?? 0} 行を取り込む`)}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Project without an estimate *" span={2} guide="estimate.historical-project">
          <select value={projectId} disabled={busy || projects === null} onChange={(event) => setProjectId(Number(event.target.value))}>
            <option value={0}>{projects === null ? copy("กำลังโหลด…", "Loading…", "読み込み中…") : copy("— เลือก Project —", "— Choose a project —", "— 案件を選択 —")}</option>
            {(projects ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.projectNo} · {item.name}
                {item.customerName ? ` · ${item.customerName}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimate owner *">
          <select value={ownerId} disabled={busy} onChange={(event) => setOwnerId(Number(event.target.value))}>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
                {owner.department ? ` · ${owner.department}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date *" hint="Today through five years">
          <DateInput min={today} value={dueDate} disabled={busy} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
      {loadError ? (
        <div className="callout danger" role="alert">
          {loadError}
        </div>
      ) : null}
      {projects !== null && !projects.length && !loadError ? (
        <div className="callout warning">
          {copy(
            "ไม่มี Project ที่ยังไม่มี Estimate ที่คุณนำเข้าได้ (ต้องเป็น PM หรือ Lead ของ Project หรือ Engineering Manager / Admin)",
            "There is no project without an estimate that you can import for. You need to be its manager or lead engineer, or an engineering manager or admin.",
            "取り込める見積のない案件がありません。案件のマネージャーかリードエンジニア、またはエンジニアリングマネージャー/管理者である必要があります。",
          )}
        </div>
      ) : null}
      {project && !project.hasInquiry ? (
        <div className="info-strip">
          <Icon name="alertCircle" />
          <span>
            {copy(
              "Project นี้ไม่มี Inquiry ระบบจะสร้าง Inquiry ย้อนหลังให้ 1 รายการ (ใช้ลูกค้า ชื่องาน และประเภทงานของ Project) เพื่อผูกกับ Estimate",
              "This project has no inquiry. One is recorded for it (with the project's customer, name and type) so the estimate can be linked.",
              "この案件には引合がありません。見積を紐付けるため、案件の顧客・名称・種別で引合を1件記録します。",
            )}
          </span>
        </div>
      ) : null}
      <div className="form-grid" style={{ margin: "16px 0" }}>
        <Field label="Old Estimate Cost workbook (.xlsx) *" span={2} guide="estimate.historical-file">
          <input
            type="file"
            accept=".xlsx"
            aria-label={copy("ไฟล์ Estimate Cost เดิม", "Old Estimate Cost workbook", "旧Estimate Costブック")}
            disabled={busy || reading}
            onChange={(event) => {
              void choose(event.target.files?.[0]);
            }}
          />
        </Field>
        {reading ? (
          <span role="status" style={{ alignSelf: "end" }}>
            {copy("กำลังอ่าน Summary และชีตรายละเอียด…", "Reading the Summary and detail sheets…", "Summaryと明細シートを読み込み中…")}
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="callout danger" role="alert">
          {error}
        </div>
      ) : null}
      {preview ? (
        <div data-guide="estimate.historical-preview">
          <h3>{preview.project || file?.name}</h3>
          <p>
            {preview.customer}
            {preview.sourceRevision ? ` · ${preview.sourceRevision}` : ""}
          </p>
          <div className="form-grid">
            <Field label="Date of the old estimate *">
              <DateInput max={today} value={sourceDate} disabled={busy || dateFromWorkbook} onChange={(event) => setSourceDate(event.target.value)} />
            </Field>
            <Field label="Hours per labor day">
              <input type="number" min="0.01" max="24" step="0.01" value={hours} disabled={busy} onChange={(event) => setHours(Number(event.target.value))} />
            </Field>
            <Field label="Contingency %">
              <input type="number" min="0" max="100" step="0.01" value={contingency} disabled={busy} onChange={(event) => setContingency(Number(event.target.value))} />
            </Field>
          </div>
          {!dateOk ? (
            <div className="callout warning">{copy("ใส่วันที่ของ Estimate เดิม (ต้องไม่เกินวันนี้)", "Enter the old estimate's date (today or earlier).", "旧見積の日付(今日以前)を入力してください。")}</div>
          ) : null}
          <EstimateImportPreviewDetails preview={preview} />
          <p className="muted">
            {copy(
              "หลังนำเข้า Estimate จะเป็นสถานะร่าง (R00) แก้ไขต่อได้ แล้วส่งตรวจและอนุมัติตามปกติ และผูกกับ Project ที่เลือกทันที",
              "After the import the estimate is a Draft (R00) that can still be changed, then goes for review and approval as usual. It is linked to the chosen project at once.",
              "取り込み後の見積は下書き(R00)で、続けて編集でき、通常どおりレビューと承認に進みます。選んだ案件にすぐ紐付きます。",
            )}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
