"use client";

import { useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { useT } from "./i18n";
import { Icon } from "./ui";

/*
 * A date typed and shown as dd/mm/yyyy (dd/mm/yyyy HH:mm with withTime), whatever language the browser runs in: a native
 * <input type="date"> follows the browser's locale, so Thai users on an English Chrome saw mm/dd/yyyy and misread it
 * (user report 2026-11-09). The value in and out stays ISO (yyyy-mm-dd, or yyyy-mm-ddTHH:mm), so a caller swaps
 * <input type="date"> for <DateInput> and keeps its props: onChange still gets an event whose target.value is the ISO
 * value. A hidden native input carries that value and opens the browser's calendar from the button.
 */

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  /** Controlled ISO value; leave it out (with defaultValue) for a form read through FormData by name. */
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  withTime?: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO to what is shown: 2026-12-10 → 10/12/2026, 2026-12-10T08:30 → 10/12/2026 08:30. */
export function displayDate(iso: string, withTime = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!match) return "";
  const date = `${match[3]}/${match[2]}/${match[1]}`;
  return withTime ? `${date} ${match[4] ?? "00"}:${match[5] ?? "00"}` : date;
}

/** What is typed to ISO, or null while it is not a real date: 10/12/2026, 10-12-2026, 10122026 (and HH:mm with time). */
export function parseDisplayDate(text: string, withTime = false): string | null {
  const match = withTime
    ? /^(\d{1,2})[/.-]?(\d{1,2})[/.-]?(\d{4})[ T]+(\d{1,2})[:.]?(\d{2})$/.exec(text.trim())
    : /^(\d{1,2})[/.-]?(\d{1,2})[/.-]?(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (!withTime) return date;
  const [hour, minute] = [Number(match[4]), Number(match[5])];
  return hour > 23 || minute > 59 ? null : `${date}T${pad(hour)}:${pad(minute)}`;
}

export function DateInput({ value: given, defaultValue = "", onChange, withTime = false, min, max, required, disabled, readOnly, className, name, form, ...rest }: Props) {
  const t = useT();
  const [own, setOwn] = useState(defaultValue);
  const value = given ?? own;
  const native = useRef<HTMLInputElement>(null);
  // What the person is typing, until it is a whole date; null shows the value as given.
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? displayDate(value, withTime);
  const parsed = typing === null ? value : typing.trim() ? parseDisplayDate(typing, withTime) : "";
  const low = typeof min === "string" ? min : "", high = typeof max === "string" ? max : "";
  const problem = parsed === null ? t("Date.format").replace("{format}", withTime ? "dd/mm/yyyy HH:mm" : "dd/mm/yyyy")
    : parsed && low && parsed < low ? t("Date.notBefore").replace("{date}", displayDate(low, withTime))
    : parsed && high && parsed > high ? t("Date.notAfter").replace("{date}", displayDate(high, withTime))
    : required && !parsed ? t("Date.required") : "";

  // The native input owns the value the caller sees; setting it and firing input runs the caller's onChange as before.
  const emit = (iso: string) => {
    const input = native.current;
    if (!input || iso === value) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, iso);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return <span className={`date-input${className ? ` ${className}` : ""}`}>
    <input {...rest} type="text" inputMode="numeric" autoComplete="off" placeholder={withTime ? "dd/mm/yyyy HH:mm" : "dd/mm/yyyy"}
      value={shown} disabled={disabled} readOnly={readOnly} required={required} aria-invalid={Boolean(problem) || rest["aria-invalid"] === true}
      title={problem || rest.title} maxLength={withTime ? 16 : 10}
      ref={(node) => { node?.setCustomValidity(problem); }}
      onChange={(event) => {
        const text = event.target.value;
        setTyping(text);
        const iso = text.trim() ? parseDisplayDate(text, withTime) : "";
        if (iso !== null) emit(iso);
      }}
      onBlur={(event) => { if (parsed !== null) setTyping(null); rest.onBlur?.(event); }} />
    <button type="button" className="date-input-pick" tabIndex={-1} disabled={disabled || readOnly} aria-label={t("Date.pick")} title={t("Date.pick")}
      onClick={() => { setTyping(null); try { native.current?.showPicker(); } catch { native.current?.focus(); } }}>
      <Icon name="calendar" />
    </button>
    <input ref={native} className="date-input-native" type={withTime ? "datetime-local" : "date"} tabIndex={-1} aria-hidden="true"
      name={name} form={form} value={value} min={low || undefined} max={high || undefined} disabled={disabled}
      onChange={(event) => { setTyping(null); if (given === undefined) setOwn(event.target.value); onChange?.(event); }} />
  </span>;
}
