"use client";

import { alertDialog } from "../dialogs";

/*
 * Pegasus form validation (DESIGN.md 0.5 and D.2), shared by the screens drawn in the Pegasus look. A save button is never
 * disabled because the form is incomplete: pressing it runs checkFields, which puts a bubble on every invalid field, shakes
 * it once, scrolls to the first one and announces it. Any focus or pointer-down inside the form, or Escape, dismisses the
 * bubbles. A failed action that belongs to no field opens the error dialog (failureDialog) instead of red text on the page.
 *
 * The browser's own constraints do most of the work (required, type="email", maxLength, min and max, and the custom
 * messages DateInput sets), so a form adds noValidate and keeps its attributes. A rule the browser cannot check is a
 * FieldRule. Bubbles are a data-invalid attribute on the field's wrapper, drawn by pegasus-screens.css, so React keeps
 * owning every element: no node is added inside a component.
 */

/** A check the browser cannot make: when `invalid`, a bubble with `message` shows on the element `at` selects in the form. */
export type FieldRule = { invalid: boolean; at: string; message: string };

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The element a field's bubble hangs from: its wrapper, so the bubble sits under the whole field. */
const ANCHORS = "[data-bubble-anchor], .field, .activity-field, .performance-area-evidence, .performance-comment";
const dismissers = new WeakMap<Element, AbortController>();

function messageFor(control: Control, t: (key: string) => string): string {
  const validity = control.validity;
  const type = control instanceof HTMLInputElement ? control.type : control instanceof HTMLSelectElement ? "select" : "textarea";
  if (validity.customError) return control.validationMessage;
  if (validity.valueMissing) return t(["select", "checkbox", "radio", "file"].includes(type) ? "Form.choose" : "Form.required");
  if (validity.typeMismatch) return t(type === "email" ? "Form.email" : "Form.invalid");
  if (validity.tooLong && !(control instanceof HTMLSelectElement)) return t("Form.tooLong").replace("{n}", String(control.maxLength));
  if (validity.tooShort && !(control instanceof HTMLSelectElement)) return t("Form.tooShort").replace("{n}", String(control.minLength));
  if (validity.rangeUnderflow && control instanceof HTMLInputElement) return t("Form.min").replace("{n}", control.min);
  if (validity.rangeOverflow && control instanceof HTMLInputElement) return t("Form.max").replace("{n}", control.max);
  if (validity.patternMismatch) return t("Form.pattern");
  return t("Form.invalid");
}

/** Removes every bubble in the container and stops listening for the gesture that dismisses them. */
export function clearBubbles(container: Element) {
  for (const anchor of container.querySelectorAll("[data-invalid]")) anchor.removeAttribute("data-invalid");
  for (const control of container.querySelectorAll("[data-bubble-control]")) { control.removeAttribute("aria-invalid"); control.removeAttribute("data-bubble-control"); }
  dismissers.get(container)?.abort();
  dismissers.delete(container);
}

function announce(text: string) {
  let region = document.getElementById("pg-bubble-live");
  if (!region) {
    region = document.createElement("div");
    region.id = "pg-bubble-live";
    region.className = "sr-only";
    region.setAttribute("role", "alert");
    document.body.appendChild(region);
  }
  region.textContent = "";
  region.textContent = text;
}

/**
 * Checks the form (or dialog body) and shows a bubble on each field that fails; true when nothing does. Without a container
 * (a test that renders without a DOM) only the rules count.
 */
export function checkFields(container: Element | null | undefined, t: (key: string) => string, rules: FieldRule[] = []): boolean {
  const found: { anchor: Element | null; control: Control | null; message: string }[] = [];
  const live = Boolean(container) && typeof document !== "undefined";
  if (live) {
    clearBubbles(container!);
    for (const element of container!.querySelectorAll("input, select, textarea")) {
      const control = element as Control;
      // A hidden helper input (DateInput's calendar) repeats the visible field's check, so it is skipped.
      if (control.disabled || !control.willValidate || control.getAttribute("aria-hidden") === "true") continue;
      if (!control.validity.valid) found.push({ control, anchor: control.closest(ANCHORS) ?? control.parentElement, message: messageFor(control, t) });
    }
  }
  for (const rule of rules) {
    if (!rule.invalid) continue;
    const target = live ? container!.querySelector(rule.at) : null;
    // A control cannot draw a bubble itself (an input has no ::after), so it hangs from the control's wrapper or parent.
    const control = target?.matches("input, select, textarea") ? target as Control : null;
    const anchor = target ? target.closest(ANCHORS) ?? (control ? control.parentElement : target) : null;
    found.push({ control, anchor, message: rule.message });
  }
  if (!found.length) return true;
  if (!live) return false;

  const shown = new Set<Element>();
  for (const { anchor, control, message } of found) {
    if (control) { control.setAttribute("aria-invalid", "true"); control.setAttribute("data-bubble-control", ""); }
    if (!anchor || shown.has(anchor)) continue;
    shown.add(anchor);
    anchor.setAttribute("data-invalid", message);
    anchor.setAttribute("data-shake", "");
    window.setTimeout(() => anchor.removeAttribute("data-shake"), 320);
  }
  const first = found.find((item) => item.anchor)?.anchor;
  const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  first?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  announce(found[0]!.message);

  // The next focus, pointer-down or Escape inside the form dismisses every bubble (D.2).
  const controller = new AbortController();
  dismissers.set(container!, controller);
  const dismiss = () => clearBubbles(container!);
  container!.addEventListener("focusin", dismiss, { signal: controller.signal });
  container!.addEventListener("pointerdown", dismiss, { signal: controller.signal });
  container!.addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Escape") dismiss(); }, { signal: controller.signal });
  return false;
}

/** A failed action that belongs to no field: the shared error dialog (0.5), never red text on the page. */
export function failureDialog(message: string, title: string): Promise<void> {
  return alertDialog(message, { tone: "error", title });
}
