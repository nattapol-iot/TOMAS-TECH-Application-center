"use client";
import { useT as useStaticCopy } from "../i18n";
import { LocalizedText } from "../LocalizedText";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Worker as TesseractWorker } from "tesseract.js";
import { countBusinessCardFields, parseBusinessCard, type BusinessCardExtraction } from "../../../lib/business-card";
import { Icon } from "../ui";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;
const IMAGE_PREPARATION_TIMEOUT_MS = 4_000;
const SCAN_TIMEOUT_MS = 120_000;

function stopWorker(worker: TesseractWorker | null) {
  if (worker) void worker.terminate().catch(() => undefined);
}

type Props = {
  disabled?: boolean;
  onApply: (result: BusinessCardExtraction) => string[];
};

type OcrLog = { status?: string; progress?: number };

const progressLabel = (status: string) => {
  if (/loading tesseract core/i.test(status)) return "กำลังเตรียมตัวอ่านข้อความ…";
  if (/initializing tesseract/i.test(status)) return "กำลังเริ่มระบบอ่านภาษาไทย อังกฤษ และญี่ปุ่น…";
  if (/loading language traineddata/i.test(status)) return "กำลังโหลดชุดภาษา…";
  if (/initializing api/i.test(status)) return "กำลังเตรียมตัววิเคราะห์นามบัตร…";
  if (/recognizing text/i.test(status)) return "กำลังอ่านข้อความบนบัตร…";
  return "กำลังประมวลผลรูป…";
};

async function resizeForOcr(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.94));
  } finally {
    bitmap.close();
  }
}

async function prepareImageForOcr(file: File): Promise<Blob> {
  let fallbackTimer: number | undefined;
  const originalAfterTimeout = new Promise<Blob>((resolve) => {
    fallbackTimer = window.setTimeout(() => resolve(file), IMAGE_PREPARATION_TIMEOUT_MS);
  });
  try {
    // Some mobile JPEG decoders leave createImageBitmap pending indefinitely.
    // Tesseract accepts the original File, so preparation must remain optional.
    return await Promise.race([resizeForOcr(file), originalAfterTimeout]);
  } finally {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
  }
}

export function BusinessCardScanner({ disabled, onApply }: Props) {
  const localizeCopy = useStaticCopy();
  const importRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<TesseractWorker | null>(null);
  const runRef = useRef(0);
  const [preview, setPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<BusinessCardExtraction | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [needsNameReview, setNeedsNameReview] = useState(false);
  const [companyChoice, setCompanyChoice] = useState("");
  const [contactChoice, setContactChoice] = useState("");

  const applyResult = (parsed: BusinessCardExtraction) => {
    const changed = onApply(parsed);
    setApplied(changed); setNeedsNameReview(false);
    setStatus(changed.length ? `เติมข้อมูลให้แล้ว ${changed.length} ช่อง กรุณาตรวจความถูกต้อง` : "อ่านข้อความได้ แต่ฟอร์มมีข้อมูลอยู่แล้ว จึงไม่ได้เขียนทับ");
  };

  // A preview change only releases its old URL; it must not cancel the scan
  // that created the new preview.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => {
    runRef.current += 1;
    stopWorker(workerRef.current);
    workerRef.current = null;
  }, []);

  const clearPicker = (event: ChangeEvent<HTMLInputElement>) => { event.target.value = ""; };
  const cancel = () => {
    runRef.current += 1;
    stopWorker(workerRef.current);
    workerRef.current = null;
    setBusy(false);
    setStatus("ยกเลิกการอ่านแล้ว");
  };

  const scan = async (file: File) => {
    setError(""); setResult(null); setApplied([]); setNeedsNameReview(false);
    if (!file.type.startsWith("image/")) { setError("กรุณาเลือกไฟล์รูปภาพนามบัตร"); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError("รูปมีขนาดเกิน 12 MB กรุณาลดขนาดรูปแล้วลองอีกครั้ง"); return; }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name || "รูปจากกล้อง");
    setBusy(true); setProgress(0); setStatus("กำลังเตรียมรูป…");
    const run = ++runRef.current;
    let ownedWorker: TesseractWorker | null = null;
    const deadline = window.setTimeout(() => {
      if (run !== runRef.current) return;
      runRef.current += 1;
      stopWorker(ownedWorker);
      if (workerRef.current === ownedWorker) workerRef.current = null;
      setBusy(false); setStatus("");
      setError("การอ่านนามบัตรใช้เวลานานเกิน 2 นาที กรุณาลองใหม่ หรือกรอกข้อมูลเองได้ ข้อมูลในฟอร์มยังอยู่ครบ");
    }, SCAN_TIMEOUT_MS);
    try {
      let source: Blob = file;
      try { source = await prepareImageForOcr(file); } catch { /* Tesseract can still read the original image. */ }
      if (run !== runRef.current) return;
      setStatus("กำลังโหลดระบบอ่านข้อความ…");
      const { createWorker, OEM, PSM } = await import("tesseract.js");
      if (run !== runRef.current) return;
      setStatus("กำลังเริ่มระบบอ่านภาษาไทย อังกฤษ และญี่ปุ่น…");
      const origin = window.location.origin;
      const worker = ownedWorker = await createWorker(["tha", "eng", "jpn"], OEM.LSTM_ONLY, {
        workerPath: `${origin}/ocr/worker.min.js`,
        corePath: `${origin}/ocr/core`,
        langPath: `${origin}/ocr`,
        gzip: false,
        // The awaited job rejects into the form's catch handler. Suppress the
        // library's additional throw from its worker-message event handler.
        errorHandler: () => undefined,
        logger: (message: OcrLog) => {
          if (run !== runRef.current) return;
          setStatus(progressLabel(message.status ?? ""));
          if (typeof message.progress === "number") setProgress(Math.round(message.progress * 100));
        },
      });
      if (run !== runRef.current) return;
      workerRef.current = worker;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
      if (run !== runRef.current) return;
      const response = await worker.recognize(source);
      if (run !== runRef.current) return;
      const parsed = parseBusinessCard(response.data.text, response.data.confidence);
      setResult(parsed);
      const fieldCount = countBusinessCardFields(parsed);
      if (!fieldCount) {
        setError("ยังแยกข้อมูลจากรูปนี้ไม่ได้ ลองถ่ายให้บัตรเต็มกรอบ ตรง และมีแสงสว่างขึ้น");
        setStatus("");
      } else {
        setProgress(100);
        setCompanyChoice(parsed.companyName); setContactChoice(parsed.contactName);
        if ((parsed.companyNames?.length ?? 0) > 1 || (parsed.contactNames?.length ?? 0) > 1) {
          setNeedsNameReview(true);
          setStatus("พบชื่อหลายภาษา เลือกชื่อที่ต้องการใช้ก่อนเติมข้อมูล");
        } else applyResult(parsed);
      }
    } catch (reason) {
      if (run === runRef.current) {
        setError(reason instanceof Error && /image|format|decode/i.test(reason.message)
          ? "เปิดรูปนี้ไม่ได้ กรุณาใช้รูป JPEG, PNG หรือ WebP"
          : "อ่านข้อความไม่สำเร็จ กรุณาลองรูปที่ชัดและมีแสงสม่ำเสมอ");
        setStatus("");
      }
    } finally {
      window.clearTimeout(deadline);
      // Each invocation owns its worker. An older canceled run must never
      // clear or terminate the worker belonging to a newer scan.
      if (workerRef.current === ownedWorker) workerRef.current = null;
      stopWorker(ownedWorker);
      if (run === runRef.current) setBusy(false);
    }
  };

  const selected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void scan(file);
    clearPicker(event);
  };

  return <section className="business-card-scanner" aria-labelledby="business-card-title">
    <div className="business-card-heading">
      <div><strong id="business-card-title"><LocalizedText text={"สแกนนามบัตร"} /></strong><small>อ่านภาษาไทย อังกฤษ และญี่ปุ่นบนเครื่องนี้ แล้วเติมช่องว่างให้ตรวจแก้ก่อนบันทึก</small></div>
      <span className="business-card-private"><Icon name="lock" /><LocalizedText text={"ไม่อัปโหลดรูป"} /></span>
    </div>
    <div className="business-card-actions">
      <button className="btn default" type="button" disabled={disabled || busy} onClick={() => importRef.current?.click()}><Icon name="upload" /><LocalizedText text={"เลือกรูปนามบัตร"} /></button>
      <button className="btn primary" type="button" disabled={disabled || busy} onClick={() => cameraRef.current?.click()}><Icon name="eye" /><LocalizedText text={"ถ่ายรูปนามบัตร"} /></button>
      {busy ? <button className="btn ghost" type="button" onClick={cancel}><LocalizedText text={"ยกเลิก"} /></button> : null}
    </div>
    <input ref={importRef} data-business-card-source="import" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={selected} />
    <input ref={cameraRef} data-business-card-source="camera" type="file" accept="image/*" capture="environment" hidden onChange={selected} />
    {preview ? <div className="business-card-progress">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob previews cannot use an image optimizer */}
      <img src={preview} alt={`ตัวอย่างนามบัตร ${fileName}`} /><div>
      {busy ? <><progress max={100} value={progress} aria-label={localizeCopy("ความคืบหน้าการอ่านข้อความ")} /><p role="status" aria-live="polite">{status || "กำลังอ่านข้อความ…"} {progress > 0 ? `${progress}%` : ""}</p></> : null}
      {!busy && status ? <p className="business-card-success" role="status"><Icon name="checkCircle" />{status}</p> : null}
      {result && needsNameReview ? <div className="business-card-names">
        <p>ชื่อที่พิมพ์บนนามบัตร · เลือกใช้ได้โดยไม่แปลหรือสร้างชื่อภาษาอื่นเพิ่ม</p>
        {(result.companyNames?.length ?? 0) > 1 ? <label className="field"><span><LocalizedText text={"ชื่อบริษัทที่จะใช้"} /></span><select aria-label={localizeCopy("ชื่อบริษัทที่จะใช้")} value={companyChoice} disabled={disabled || busy} onChange={event => setCompanyChoice(event.target.value)}>{result.companyNames!.map(name => <option key={`${name.language}:${name.value}`} value={name.value}>{({ th: "ไทย", en: "English", ja: "日本語" })[name.language]} — {name.value}</option>)}</select></label> : null}
        {(result.contactNames?.length ?? 0) > 1 ? <label className="field"><span><LocalizedText text={"ชื่อผู้ติดต่อที่จะใช้"} /></span><select aria-label={localizeCopy("ชื่อผู้ติดต่อที่จะใช้")} value={contactChoice} disabled={disabled || busy} onChange={event => setContactChoice(event.target.value)}>{result.contactNames!.map(name => <option key={`${name.language}:${name.value}`} value={name.value}>{({ th: "ไทย", en: "English", ja: "日本語" })[name.language]} — {name.value}</option>)}</select></label> : null}
        <button className="btn primary" type="button" disabled={disabled || busy} onClick={() => applyResult({ ...result, companyName: companyChoice, contactName: contactChoice })}><LocalizedText text={"เติมข้อมูลที่เลือกในช่องว่าง"} /></button>
      </div> : null}
      {result ? <><p className="muted"><LocalizedText text={"ความชัดเจนจาก OCR"} /> {result.confidence}%{applied.length ? ` · เติม: ${applied.join(", ")}` : ""}</p><details><summary><LocalizedText text={"ดูข้อความที่อ่านได้"} /></summary><pre>{result.rawText}</pre></details></> : null}
    </div></div> : null}
    {error ? <div className="callout danger business-card-error" role="alert"><Icon name="alertCircle" /><span>{error}</span></div> : null}
  </section>;
}
