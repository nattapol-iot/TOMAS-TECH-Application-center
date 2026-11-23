"use client";
import { useT as useStaticCopy } from "../i18n";
import { LocalizedText } from "../LocalizedText";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { countBusinessCardFields, type BusinessCardExtraction } from "../../../lib/business-card";
import { ApiClientError, scanBusinessCardViaBackend } from "../api-client";
import { currentAppPath, redirectToTmtIdLogin } from "../tmt-id-client";
import { Icon } from "../ui";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;
const IMAGE_PREPARATION_TIMEOUT_MS = 4_000;
const SENDABLE_TYPES = ["image/jpeg", "image/png"];

type Props = {
  disabled?: boolean;
  onApply: (result: BusinessCardExtraction) => string[];
};

/* Copilot reads JPEG and PNG only, so every photo is redrawn as a JPEG: that also turns HEIC and WebP from phones into
   something it accepts, and keeps large photos small enough to send quickly. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.92));
  } finally {
    bitmap.close();
  }
}

async function prepareImage(file: File): Promise<Blob> {
  let fallbackTimer: number | undefined;
  const originalAfterTimeout = new Promise<Blob>((resolve) => {
    fallbackTimer = window.setTimeout(() => resolve(file), IMAGE_PREPARATION_TIMEOUT_MS);
  });
  try {
    // Some mobile JPEG decoders leave createImageBitmap pending indefinitely; the original file is then sent as it is.
    return await Promise.race([toJpeg(file), originalAfterTimeout]);
  } finally {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
  }
}

const failureMessage = (reason: unknown) => {
  if (!(reason instanceof ApiClientError)) return "ส่งรูปให้ Copilot ไม่สำเร็จ กรุณาลองอีกครั้ง";
  if (reason.code === "copilot_sign_in_required") return "การ login TMT ID หมดอายุ ต้อง login ใหม่ก่อนจึงจะสแกนนามบัตรได้ ข้อมูลที่ยังไม่บันทึกในหน้านี้จะหาย";
  if (reason.code === "copilot_busy") return "Copilot มีงานรอคิวอยู่มาก ยังอ่านไม่เสร็จ กรุณาลองอีกครั้งในอีกสักครู่ หรือกรอกข้อมูลเอง";
  if (reason.code === "copilot_unreadable" || reason.code === "copilot_rejected") return "Copilot อ่านนามบัตรนี้ไม่ได้ ลองถ่ายให้บัตรเต็มกรอบ ตรง และมีแสงสว่างขึ้น";
  if (reason.code === "copilot_off" || reason.code === "copilot_unavailable") return "ตอนนี้ติดต่อ Copilot ไม่ได้ กรุณากรอกข้อมูลเอง หรือลองใหม่ภายหลัง";
  return reason.message || "อ่านนามบัตรไม่สำเร็จ กรุณาลองอีกครั้ง";
};

export function BusinessCardScanner({ disabled, onApply }: Props) {
  const localizeCopy = useStaticCopy();
  const importRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const [preview, setPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [result, setResult] = useState<BusinessCardExtraction | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [needsNameReview, setNeedsNameReview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [companyChoice, setCompanyChoice] = useState("");
  const [contactChoice, setContactChoice] = useState("");

  const applyResult = (parsed: BusinessCardExtraction) => {
    const changed = onApply(parsed);
    setApplied(changed);
    setNeedsNameReview(false);
    setStatus(changed.length ? `เติมข้อมูลให้แล้ว ${changed.length} ช่อง กรุณาตรวจความถูกต้อง` : "อ่านข้อความได้ แต่ฟอร์มมีข้อมูลอยู่แล้ว จึงไม่ได้เขียนทับ");
  };

  // A preview change only releases its old URL; it must not cancel the scan that created the new preview.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  // An answer arriving after unmount belongs to nobody.
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  const clearPicker = (event: ChangeEvent<HTMLInputElement>) => {
    event.target.value = "";
  };
  // Copilot finishes the scan anyway (it stays in the person's Document Scanner); this form just stops waiting for it.
  const cancel = () => {
    runRef.current += 1;
    setBusy(false);
    setStatus("ยกเลิกการรอผลแล้ว");
  };

  const scan = async (file: File) => {
    setError("");
    setSignInNeeded(false);
    setResult(null);
    setApplied([]);
    setNeedsNameReview(false);
    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพนามบัตร");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("รูปมีขนาดเกิน 12 MB กรุณาลดขนาดรูปแล้วลองอีกครั้ง");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name || "รูปจากกล้อง");
    setBusy(true);
    setStatus("กำลังเตรียมรูป…");
    const run = ++runRef.current;
    try {
      let image: Blob = file;
      try {
        image = await prepareImage(file);
      } catch {
        /* The original is sent when the browser cannot redraw it. */
      }
      if (run !== runRef.current) return;
      if (!SENDABLE_TYPES.includes(image.type)) {
        setError("เปิดรูปนี้ไม่ได้ กรุณาใช้รูป JPEG หรือ PNG");
        setStatus("");
        return;
      }
      setStatus("Copilot กำลังอ่านนามบัตร… ถ้ามีงานรอคิวอาจใช้เวลาสักครู่");
      const parsed = await scanBusinessCardViaBackend(image, image.type === "image/png" ? "business-card.png" : "business-card.jpg");
      if (run !== runRef.current) return;
      setResult(parsed);
      if (!countBusinessCardFields(parsed)) {
        setError("ยังแยกข้อมูลจากรูปนี้ไม่ได้ ลองถ่ายให้บัตรเต็มกรอบ ตรง และมีแสงสว่างขึ้น");
        setStatus("");
      } else {
        setCompanyChoice(parsed.companyName);
        setContactChoice(parsed.contactName);
        if ((parsed.companyNames?.length ?? 0) > 1 || (parsed.contactNames?.length ?? 0) > 1) {
          setNeedsNameReview(true);
          setStatus("พบชื่อหลายภาษา เลือกชื่อที่ต้องการใช้ก่อนเติมข้อมูล");
        } else applyResult(parsed);
      }
    } catch (reason) {
      if (run === runRef.current) {
        setError(failureMessage(reason));
        setSignInNeeded(reason instanceof ApiClientError && reason.code === "copilot_sign_in_required");
        setStatus("");
      }
    } finally {
      if (run === runRef.current) setBusy(false);
    }
  };

  const selected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void scan(file);
    clearPicker(event);
  };

  // Dropping a card is the same path as picking one; the browser only offers the file list, so the first image in it is the card.
  const dropped = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
    if (!file) {
      setError("ลากไฟล์รูปนามบัตรมาวาง (JPEG, PNG หรือ WebP)");
      return;
    }
    void scan(file);
  };

  const dragOver = (event: DragEvent<HTMLElement>) => {
    if (disabled || busy) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  // A drag that crosses a child element fires leave on the parent, so only a leave that actually exits the section clears the highlight.
  const dragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  return (
    <section className={dragging ? "business-card-scanner is-dragging" : "business-card-scanner"} aria-labelledby="business-card-title" onDragOver={dragOver} onDragLeave={dragLeave} onDrop={dropped}>
      <div className="business-card-heading">
        <div>
          <strong id="business-card-title">
            <LocalizedText text={"สแกนนามบัตร"} />
          </strong>
          <small>Copilot อ่านภาษาไทย อังกฤษ และญี่ปุ่น แล้วเติมช่องว่างให้ตรวจแก้ก่อนบันทึก · ลากรูปมาวางตรงนี้ได้</small>
        </div>
        <span className="business-card-private">
          <Icon name="upload" />
          <LocalizedText text={"ส่งรูปให้ Copilot"} />
        </span>
      </div>
      <div className="business-card-actions">
        <button className="btn default" type="button" disabled={disabled || busy} onClick={() => importRef.current?.click()}>
          <Icon name="upload" />
          <LocalizedText text={"เลือกรูปนามบัตร"} />
        </button>
        <button className="btn primary" type="button" disabled={disabled || busy} onClick={() => cameraRef.current?.click()}>
          <Icon name="eye" />
          <LocalizedText text={"ถ่ายรูปนามบัตร"} />
        </button>
        {busy ? (
          <button className="btn ghost" type="button" onClick={cancel}>
            <LocalizedText text={"ยกเลิก"} />
          </button>
        ) : null}
      </div>
      <input ref={importRef} data-business-card-source="import" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={selected} />
      <input ref={cameraRef} data-business-card-source="camera" type="file" accept="image/*" capture="environment" hidden onChange={selected} />
      {preview ? (
        <div className="business-card-progress">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob previews cannot use an image optimizer */}
          <img src={preview} alt={`ตัวอย่างนามบัตร ${fileName}`} />
          <div>
            {busy ? (
              <>
                <progress aria-label={localizeCopy("ความคืบหน้าการอ่านข้อความ")} />
                <p role="status" aria-live="polite">
                  {status || "Copilot กำลังอ่านนามบัตร…"}
                </p>
              </>
            ) : null}
            {!busy && status ? (
              <p className="business-card-success" role="status">
                <Icon name="checkCircle" />
                {status}
              </p>
            ) : null}
            {result && needsNameReview ? (
              <div className="business-card-names">
                <p>ชื่อที่พิมพ์บนนามบัตร · เลือกใช้ได้โดยไม่แปลหรือสร้างชื่อภาษาอื่นเพิ่ม</p>
                {(result.companyNames?.length ?? 0) > 1 ? (
                  <label className="field">
                    <span>
                      <LocalizedText text={"ชื่อบริษัทที่จะใช้"} />
                    </span>
                    <select aria-label={localizeCopy("ชื่อบริษัทที่จะใช้")} value={companyChoice} disabled={disabled || busy} onChange={(event) => setCompanyChoice(event.target.value)}>
                      {result.companyNames!.map((name) => (
                        <option key={`${name.language}:${name.value}`} value={name.value}>
                          {{ th: "ไทย", en: "English", ja: "日本語" }[name.language]} — {name.value}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {(result.contactNames?.length ?? 0) > 1 ? (
                  <label className="field">
                    <span>
                      <LocalizedText text={"ชื่อผู้ติดต่อที่จะใช้"} />
                    </span>
                    <select aria-label={localizeCopy("ชื่อผู้ติดต่อที่จะใช้")} value={contactChoice} disabled={disabled || busy} onChange={(event) => setContactChoice(event.target.value)}>
                      {result.contactNames!.map((name) => (
                        <option key={`${name.language}:${name.value}`} value={name.value}>
                          {{ th: "ไทย", en: "English", ja: "日本語" }[name.language]} — {name.value}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="btn primary" type="button" disabled={disabled || busy} onClick={() => applyResult({ ...result, companyName: companyChoice, contactName: contactChoice })}>
                  <LocalizedText text={"เติมข้อมูลที่เลือกในช่องว่าง"} />
                </button>
              </div>
            ) : null}
            {result ? (
              <p className="muted">
                {applied.length ? `เติม: ${applied.join(", ")}` : null}
                {result.documentUrl ? (
                  <>
                    {" "}
                    {applied.length ? "· " : ""}
                    <a href={result.documentUrl} target="_blank" rel="noreferrer">
                      <LocalizedText text={"เปิดใน Copilot"} />
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="callout danger business-card-error" role="alert">
          <Icon name="alertCircle" />
          <span>{error}</span>
          {signInNeeded ? (
            <button className="btn sm" type="button" onClick={() => redirectToTmtIdLogin(currentAppPath())}>
              <Icon name="user" />
              login TMT ID อีกครั้ง
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
