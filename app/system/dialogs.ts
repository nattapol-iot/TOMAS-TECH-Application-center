"use client";

import type { SweetAlertOptions } from "sweetalert2";

/*
 * The app's own confirm / prompt / alert windows, in place of the browser's (owner request 2026-11-09: SweetAlert2 looks
 * better and is easier to use). Each returns a promise, so `if (!window.confirm(x)) return;` becomes
 * `if (!(await confirmDialog(x))) return;`. Buttons follow the page language (<html lang>, set by applyDocumentLanguage).
 * SweetAlert2 (its main build injects its own CSS) loads on the first window, so no screen pays for it up front.
 */

type Copy = { ok: string; cancel: string; required: string };
const COPY: Record<string, Copy> = {
  th: { ok: "ตกลง", cancel: "ยกเลิก", required: "กรุณากรอกข้อมูล" },
  ja: { ok: "OK", cancel: "キャンセル", required: "入力してください" },
  en: { ok: "OK", cancel: "Cancel", required: "Please fill this in" },
};
const copy = () => COPY[typeof document === "undefined" ? "en" : document.documentElement.lang] ?? COPY.en!;

const BASE: SweetAlertOptions = {
  customClass: { popup: "app-dialog", confirmButton: "btn primary", cancelButton: "btn ghost", denyButton: "btn danger", input: "app-dialog-input" },
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: false,
  returnFocus: true,
};
const show = async (options: SweetAlertOptions) => {
  const { default: Swal } = await import("sweetalert2");
  // Spreading two option sets loses SweetAlertOptions' per-input union; the merged set is still one of them.
  return { result: await Swal.fire({ ...BASE, ...options } as SweetAlertOptions) };
};

type ConfirmOptions = { title?: string; confirmText?: string; cancelText?: string; danger?: boolean };

/** A yes/no question; resolves true only when the person confirms. */
export async function confirmDialog(text: string, options: ConfirmOptions = {}): Promise<boolean> {
  const words = copy();
  const { result } = await show({
    icon: options.danger ? "warning" : "question",
    ...(options.title ? { title: options.title, text } : { text }),
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? words.ok,
    cancelButtonText: options.cancelText ?? words.cancel,
    ...(options.danger ? { customClass: { popup: "app-dialog", confirmButton: "btn danger", cancelButton: "btn ghost" } } : {}),
  });
  return result.isConfirmed;
}

type PromptOptions = { title?: string; value?: string; required?: boolean; multiline?: boolean; readOnly?: boolean };

/** A line (or a box) of text; resolves null when cancelled, like window.prompt. */
export async function promptDialog(text: string, options: PromptOptions = {}): Promise<string | null> {
  const words = copy();
  const { result } = await show({
    ...(options.title ? { title: options.title, text } : { text }),
    input: options.multiline ? "textarea" : "text",
    inputValue: options.value ?? "",
    ...(options.readOnly ? { inputAttributes: { readonly: "true" }, didOpen: (popup: HTMLElement) => { popup.querySelector<HTMLInputElement>(".swal2-input")?.select(); } } : {}),
    showCancelButton: !options.readOnly,
    confirmButtonText: words.ok,
    cancelButtonText: words.cancel,
    ...(options.required ? { inputValidator: (value: string) => (value.trim() ? undefined : words.required) } : {}),
  });
  return result.isConfirmed ? String(result.value ?? "") : null;
}

/** A message with one button. */
export async function alertDialog(text: string, options: { title?: string; tone?: "info" | "success" | "warning" | "error" } = {}): Promise<void> {
  await show({ icon: options.tone ?? "info", ...(options.title ? { title: options.title, text } : { text }), confirmButtonText: copy().ok });
}
