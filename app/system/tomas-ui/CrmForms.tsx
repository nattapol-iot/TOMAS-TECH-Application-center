"use client";
/*
 * The CRM forms on @tomas-tc/ui (CRM UX audit 2026-11-26, CRM-01/02/10/11/12; owner: "ใช้ @tomas-tc/ui เป็นมาตรฐานจริง").
 *
 * One dialog shell for every CRM form: the kit's Dialog, one Save and one Cancel, Save runs once at a time, a refused save
 * keeps what was typed and says what to fix (and next to which field), and Cancel, X, Escape or a click outside a form
 * that was changed asks before throwing the changes away. One picker for every long list: the kit's ComboboxControl, a
 * search box inside the list, two lines per entry, keyboard, clear, loading, empty and error with retry. Enter picks an
 * entry without saving the form: the list sits in the kit's portal, outside the form, and the kit stops the key.
 *
 * CrmScreens.tsx loads this file lazily (the kit stays off the first load) and keeps the business calls: each dialog
 * gets `onSave` and only shapes the values. No old app component is rendered in here.
 */
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ComboboxControl,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  NamedIcon,
  Notice,
  OptionSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  UnsavedChangesDialog,
} from "@tomas-tc/ui";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClientError, apiRequest, type BootstrapData } from "../api-client";
import { useLanguage, useT } from "../i18n";
import {
  crmFailure,
  crmRequest,
  customerOptions,
  isDirty,
  missingFields,
  matchesSearch,
  teamOptions,
  text,
  useCrmData,
  useDebounced,
  type CrmFailure,
  type CrmOption,
  type CrmPage,
  type CrmRecord,
  type CustomerDetail,
} from "../production/crm-records";
import { TomasUi } from "./TomasUi";

type Translate = (key: string) => string;

/* ------------------------------------------------------------------ picker */

export type PickerProps = {
  id?: string;
  value: string;
  options: CrmOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Optional lists can be emptied again; a required one cannot. */
  clearable?: boolean;
  /** A first row that does something other than pick, such as adding a contact. */
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  /** The list could not be read: said under the box, with a retry. */
  failed?: boolean;
  onRetry?: () => void;
  /** Server lists: called with what is typed, so the caller can ask the API (debounced, latest answer only). */
  onSearch?: (term: string) => void;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
};

/**
 * Pick one entry from a long list by typing in the list's own search box. Every typed word must appear somewhere in the
 * name, the second line or the entry's other names and codes, in any order, case and spacing ignored.
 */
export function EntityPicker({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  required,
  disabled,
  clearable,
  actionLabel,
  onAction,
  loading,
  failed,
  onRetry,
  onSearch,
  invalid,
  describedBy,
  className,
}: PickerProps) {
  const t = useT();
  const [term, setTerm] = useState("");
  // The kit filters on the typed text as one substring. An entry that matches word by word carries the typed text as a
  // keyword, so the kit keeps it too.
  const kitOptions = useMemo(() => {
    const typed = term.toLocaleLowerCase();
    return options.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.detail || undefined,
      keywords: typed && matchesSearch(option, term) ? `${option.keywords ?? ""} ${typed}` : option.keywords,
    }));
  }, [options, term]);
  const selected = options.find((option) => option.value === value);
  return (
    <div className={className ? `grid gap-1 ${className}` : "grid gap-1"}>
      <ComboboxControl
        id={id}
        ariaLabel={ariaLabel}
        ariaInvalid={invalid || undefined}
        ariaDescribedBy={describedBy}
        value={value || null}
        options={kitOptions}
        clearable={clearable ?? !required}
        required={required}
        disabled={disabled}
        placeholder={placeholder ?? t("CRM.choose")}
        searchPlaceholder={t("CRM.searchList")}
        // The list is as wide as its box (the kit's own width class is the Tailwind 3 spelling), never wider than the screen.
        contentClassName="w-(--radix-popover-trigger-width) min-w-64 max-w-[calc(100vw-2rem)]"
        actionLabel={actionLabel}
        onAction={onAction}
        loading={loading}
        busy={loading && !options.length}
        renderSelected={() => (
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-start">
            <span className="truncate">{selected?.label}</span>
            {selected?.detail ? <span className="text-muted-foreground truncate text-xs">{selected.detail}</span> : null}
          </span>
        )}
        onSearch={(typed) => {
          setTerm(typed);
          onSearch?.(typed);
        }}
        onChange={(next) => {
          setTerm("");
          onChange(next ?? "");
        }}
      />
      {failed ? (
        <p role="alert" className="text-destructive flex flex-wrap items-center gap-2 text-xs">
          {t("CRM.listFailed")}
          {onRetry ? (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
              {t("CRM.retry")}
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** The picker on an old screen's toolbar (a filter): its own island, so its list portals into the kit's layer. */
export function PickerIsland(props: PickerProps & { guide?: string }) {
  return (
    <TomasUi className="crm-picker-island">
      <div className="min-w-56" data-guide={props.guide}>
        <EntityPicker {...props} />
      </div>
    </TomasUi>
  );
}

/* ------------------------------------------------------------------ fields */

export type FieldSpec = {
  key: string;
  label?: string;
  type?: "text" | "email" | "url" | "tel" | "number" | "date" | "datetime-local" | "textarea" | "checkbox";
  options?: CrmOption[];
  required?: boolean;
  wide?: boolean;
  disabled?: boolean;
  /** A long list: searched inside its own popup (EntityPicker); a short one is a plain select. */
  searchable?: boolean;
  placeholder?: string;
  /** One line under the field that says what it wants (e.g. which names are enough). */
  hint?: string;
  guide?: string;
  maxLength?: number;
  /** A one-click shortcut under the field, such as "Use customer as End User". */
  link?: { label: string; onClick: () => void };
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  onSearch?: (term: string) => void;
};

const fieldValue = (field: FieldSpec, raw: string) => (field.key.endsWith("Id") && raw ? Number(raw) : raw);

export function FieldGrid({
  fields,
  value,
  onChange,
  errors,
  formId,
  guide,
}: {
  fields: FieldSpec[];
  value: CrmRecord;
  onChange: (key: string, next: unknown) => void;
  errors: Record<string, string>;
  formId: string;
  guide?: string;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2" data-guide={guide}>
      {fields.map((field) => {
        const id = `${formId}-${field.key}`,
          label = t(field.label ?? `CRM.${field.key}`),
          error = errors[field.key],
          errorId = error ? `${id}-error` : undefined,
          hintId = field.hint ? `${id}-hint` : undefined,
          describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
        const current = text(value[field.key]);
        let control: ReactNode;
        if (field.type === "checkbox")
          control = (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id={id} disabled={field.disabled} checked={value[field.key] !== false} onCheckedChange={(checked) => onChange(field.key, checked === true)} />
              <Label htmlFor={id} className="font-normal">
                {label}
              </Label>
            </div>
          );
        else if (field.options && (field.searchable || field.options.length > 8))
          control = (
            <EntityPicker
              id={id}
              value={current}
              options={field.options}
              ariaLabel={label}
              placeholder={field.placeholder ? t(field.placeholder) : undefined}
              required={field.required}
              disabled={field.disabled}
              actionLabel={field.actionLabel}
              onAction={field.onAction}
              loading={field.loading}
              failed={field.failed}
              onRetry={field.onRetry}
              onSearch={field.onSearch}
              invalid={Boolean(error)}
              describedBy={describedBy}
              onChange={(next) => onChange(field.key, fieldValue(field, next))}
            />
          );
        else if (field.options)
          control = (
            <OptionSelect
              id={id}
              ariaLabel={label}
              ariaInvalid={Boolean(error) || undefined}
              ariaDescribedBy={describedBy}
              value={current || null}
              options={field.options.map((option) => ({ value: option.value, label: option.label, description: option.detail }))}
              clearable={!field.required}
              required={field.required}
              disabled={field.disabled}
              placeholder={t("CRM.choose")}
              onChange={(next) => onChange(field.key, fieldValue(field, next == null ? "" : String(next)))}
            />
          );
        else if (field.type === "textarea")
          control = (
            <Textarea
              id={id}
              rows={3}
              disabled={field.disabled}
              maxLength={field.maxLength}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={describedBy}
              value={current}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          );
        else
          control = (
            <Input
              id={id}
              type={field.type ?? "text"}
              disabled={field.disabled}
              maxLength={field.maxLength}
              min={field.type === "number" ? 0 : undefined}
              step={field.type === "number" ? "any" : undefined}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={describedBy}
              value={field.type === "date" ? current.slice(0, 10) : current}
              onChange={(event) => onChange(field.key, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
            />
          );
        return (
          <div key={field.key} className={field.wide ? "grid min-w-0 content-start gap-1.5 sm:col-span-2" : "grid min-w-0 content-start gap-1.5"} data-guide={field.guide}>
            {field.type === "checkbox" ? null : (
              <Label htmlFor={id}>
                {label}
                {field.required ? (
                  <span aria-hidden="true" className="text-destructive">
                    {" "}
                    *
                  </span>
                ) : null}
              </Label>
            )}
            {control}
            {field.hint ? (
              <p id={hintId} className="text-muted-foreground text-xs">
                {t(field.hint)}
              </p>
            ) : null}
            {error ? (
              <p id={errorId} role="alert" className="text-destructive text-xs">
                {t(error)}
              </p>
            ) : null}
            {field.link ? (
              <Button type="button" variant="link" size="sm" className="h-auto justify-self-start p-0 text-xs" onClick={field.link.onClick}>
                {t(field.link.label)}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ form state */

export function useCrmForm(initial: CrmRecord) {
  const [start] = useState(initial);
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const patch = (next: CrmRecord) => {
    setValue((current) => ({ ...current, ...next }));
    // Typing into a field clears what was said about it.
    setErrors((current) => (Object.keys(next).some((key) => current[key]) ? Object.fromEntries(Object.entries(current).filter(([key]) => !(key in next))) : current));
  };
  return { value, setValue, patch, errors, setErrors, dirty: isDirty(start, value) };
}

/* ------------------------------------------------------------------ dialog shell */

/** The Save mark every CRM form shares: the guides' last step ("crm.save" in guide-catalog.ts). */
const DEFAULT_SAVE = { guide: "crm.save" } as const;
const SIZE: Record<string, string> = { sm: "sm:max-w-md", md: "sm:max-w-2xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };
/** A click on the click-through guide's card is not a click outside the dialog (GuideLayer.tsx). */
const onGuide = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(".guide-pop, .guide-card, .guide-layer"));

export type DialogShellProps = {
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  dirty: boolean;
  busy: boolean;
  failure: CrmFailure | null;
  /** A 409: offer to close and read the record again; what was typed stays until then. */
  onReload?: () => void;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel?: string;
  destructive?: boolean;
  /** Save cannot run (e.g. a primary contact cannot be removed); the reason is the failure shown. */
  submitDisabled?: boolean;
  /** Marks Save for the click-through guides (guide-catalog.ts). */
  saveGuide?: string;
  formId: string;
  children: ReactNode;
};

export function CrmDialog({
  title,
  description,
  size = "md",
  dirty,
  busy,
  failure,
  onReload,
  onSubmit,
  onClose,
  submitLabel,
  destructive,
  submitDisabled,
  saveGuide = DEFAULT_SAVE.guide,
  formId,
  children,
}: DialogShellProps) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);
  // Cancel, X, Escape and a click outside all come here; a changed form asks first, a running save is never left.
  const requestClose = () => {
    if (busy) return;
    if (dirty) setAsking(true);
    else onClose();
  };
  return (
    <TomasUi>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          className={`${SIZE[size]} flex max-h-[min(92vh,900px)] flex-col gap-0 p-0`}
          onInteractOutside={(event) => {
            if (onGuide(event.target)) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b px-6 pt-5 pb-3 pr-12">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </DialogHeader>
          <form
            id={formId}
            noValidate
            className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && !submitDisabled) onSubmit();
            }}
          >
            {failure ? (
              <div ref={failureRef} role="alert" className="grid gap-1">
                <Notice tone="error">
                  <span>{t(failure.key)}</span>
                  {failure.detail ? <span className="text-muted-foreground block text-xs">{failure.detail}</span> : null}
                  {failure.conflict && onReload ? (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onReload}>
                      {t("CRM.reloadLatest")}
                    </Button>
                  ) : null}
                </Notice>
              </div>
            ) : null}
            {children}
          </form>
          <DialogFooter className="border-t px-6 py-3">
            <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" form={formId} variant={destructive ? "destructive" : "default"} disabled={busy || submitDisabled} aria-busy={busy || undefined} data-guide={saveGuide}>
              {busy ? <NamedIcon name="loader-circle" className="size-4 animate-spin" /> : null}
              {t(submitLabel ?? "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog
        open={asking}
        description={t("CRM.unsavedHint")}
        onStay={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false);
          onClose();
        }}
      />
    </TomasUi>
  );
}

/**
 * The save path every form shares: required fields first (focus goes to the first one left empty), then the caller's
 * own checks, then one request at a time; a refusal stays on screen next to the field it names.
 */
function useSave(formId: string, form: ReturnType<typeof useCrmForm>, onSave: (value: CrmRecord) => Promise<void>, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CrmFailure | null>(null);
  const running = useRef(false);
  const submit = (fields: FieldSpec[], check?: (value: CrmRecord) => Record<string, string>) => {
    if (running.current) return;
    const problems = { ...missingFields(fields, form.value), ...(check?.(form.value) ?? {}) };
    if (Object.keys(problems).length) {
      form.setErrors(problems);
      setFailure({ key: "CRM.checkFields" });
      const first = fields.find((field) => problems[field.key])?.key ?? Object.keys(problems)[0];
      setTimeout(() => document.getElementById(`${formId}-${first}`)?.focus(), 0);
      return;
    }
    running.current = true;
    setBusy(true);
    setFailure(null);
    void onSave(form.value)
      .then(() => {
        running.current = false;
        onClose();
      })
      .catch((error: unknown) => {
        running.current = false;
        const next = crmFailure(error);
        setFailure(next);
        if (next.field) form.setErrors({ [next.field]: next.key });
        setBusy(false);
      });
  };
  return { busy, failure, submit };
}

/** One form in the shell: fields, the save path and the close guard, for the forms that are only a list of fields. */
export function CrmFormDialog({
  title,
  description,
  size,
  initial,
  fields,
  onSave,
  onClose,
  onReload,
  check,
  intro,
  guide,
  submitLabel,
}: {
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  initial: CrmRecord;
  fields: FieldSpec[] | ((value: CrmRecord) => FieldSpec[]);
  onSave: (value: CrmRecord) => Promise<void>;
  onClose: () => void;
  onReload?: () => void;
  check?: (value: CrmRecord) => Record<string, string>;
  /** Lines (translation keys) said above the fields, e.g. what the form carries forward. */
  intro?: { lines: string[]; title?: string; guide?: string; tone?: "info" | "warning" };
  /** Marks the field grid for a guide step. */
  guide?: string;
  submitLabel?: string;
}) {
  const t = useT(),
    formId = useId(),
    form = useCrmForm(initial),
    list = typeof fields === "function" ? fields(form.value) : fields,
    save = useSave(formId, form, onSave, onClose);
  return (
    <CrmDialog
      title={t(title)}
      description={description}
      size={size}
      dirty={form.dirty}
      busy={save.busy}
      failure={save.failure}
      onReload={onReload}
      onClose={onClose}
      formId={formId}
      submitLabel={submitLabel}
      onSubmit={() => save.submit(list, check)}
    >
      {intro ? (
        <div data-guide={intro.guide}>
          <Note tone={intro.tone}>
            {intro.title ? <strong className="block">{intro.title}</strong> : null}
            {intro.lines.map((line) => (
              <span key={line} className="block">
                {t(line)}
              </span>
            ))}
          </Note>
        </div>
      ) : null}
      <FieldGrid fields={list} value={form.value} errors={form.errors} formId={formId} guide={guide} onChange={(key, next) => form.patch({ [key]: next })} />
    </CrmDialog>
  );
}

/* ------------------------------------------------------------------ shared bits */

function Section({ title, guide, children, defaultOpen = false }: { title: string; guide?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-md border" data-guide={guide}>
      <CollapsibleTrigger asChild>
        <button type="button" className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm font-medium">
          {title}
          <NamedIcon name="chevron-down" className="text-muted-foreground size-4" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
const Note = ({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) => (
  <div role="status">
    <Notice tone={tone}>{children}</Notice>
  </div>
);
const priorityOptions = (t: Translate): CrmOption[] => ["Low", "Normal", "High", "Urgent"].map((s) => ({ value: s, label: t(s) }));
export const FOLLOWUP_STATUSES = ["Open", "WaitingCustomer", "WaitingInternal", "WaitingSupplier", "Done", "Cancelled"];

/** The proposal and order dates with their references, asked when the stage needs them (crm-sales-evidence.ts). */
export function evidenceFields(value: CrmRecord, requireMilestones = true): FieldSpec[] {
  const fields: FieldSpec[] = [];
  const proposal = requireMilestones || Boolean(value.proposalSentOn || value.proposalReference);
  const won = requireMilestones || Boolean(value.wonOn || value.wonReference);
  if (["PROPOSAL", "NEGOTIATION"].includes(text(value.stage)) || value.proposalSentOn)
    fields.push({ key: "proposalSentOn", type: "date", required: proposal }, { key: "proposalReference", required: proposal });
  if (value.stage === "WON" || value.wonOn) fields.push({ key: "wonOn", type: "date", required: won }, { key: "wonReference", required: won });
  return fields;
}

/* ------------------------------------------------------------------ the deal */

type Choice = (kind: string) => CrmOption[];
export type OpportunityDialogProps = {
  bootstrap: BootstrapData;
  choice: Choice;
  initial?: CrmRecord;
  defaultStage?: string;
  onSave: (value: CrmRecord, create: boolean) => Promise<void>;
  onClose: () => void;
  onReload?: () => void;
};

/** New or edited deal: what matters first (customer, end user, name), the rest folded (owner rule 2026-10-18). */
export function OpportunityDialog({ bootstrap, choice, initial, defaultStage, onSave, onClose, onReload }: OpportunityDialogProps) {
  const t = useT(),
    formId = useId();
  // A new deal starts at New: the stage is asked only when editing, or when a board column chose another one.
  const create = !initial,
    showStage = !create || Boolean(defaultStage && defaultStage !== "NEW");
  const form = useCrmForm(initial ?? { customerId: "", salesOwnerId: bootstrap.user.id, stage: defaultStage ?? "NEW", source: "DirectInquiry", priority: "Normal" });
  const value = form.value;
  const customer = useCrmData<CustomerDetail>(value.customerId ? `/api/v1/crm/customers/${value.customerId}` : null);
  const companies = useMemo(() => customerOptions(bootstrap), [bootstrap]),
    people = useMemo(() => teamOptions(bootstrap), [bootstrap]);
  // adding holds the name typed in the contact search when "add a new contact" was chosen.
  const [adding, setAdding] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const sites = (customer.data?.sites ?? []).filter((r) => r.isActive !== false);
  const canAddContact = ["intake.write", "master.write", "crm.contact.write"].some((code) => bootstrap.permissions.includes(code));
  // Two lines per contact: the name, then position · department · site (the site only when there are several).
  const contactOptions = (customer.data?.contacts ?? [])
    .filter((r) => r.isActive !== false && (!value.siteId || String(r.siteId) === String(value.siteId)))
    .map((r) => ({
      value: text(r.id),
      label: text(r.name),
      detail: [text(r.position), text(r.department), sites.length > 1 ? text(r.siteName) : ""].filter(Boolean).join(" · "),
      keywords: `${text(r.email)} ${text(r.phone)}`,
    }));
  // The customer heads the end-user list: most jobs are for the customer's own plant.
  const own = companies.find((c) => c.value === text(value.customerId));
  const endUsers = own ? [{ ...own, detail: `${own.detail} · ${t("CRM.sameAsCustomer")}` }, ...companies.filter((c) => c !== own)] : companies;
  // While a new deal is typed, show this customer's open deals with a similar name (instead of a pop-up on save).
  const typedName = useDebounced(create && value.customerId ? text(value.name).trim() : "", 450);
  const similar = useCrmData<CrmRecord[]>(typedName.length >= 3 ? `/api/v1/crm/opportunity-duplicates?customerId=${value.customerId}&name=${encodeURIComponent(typedName)}` : null);
  // Another customer empties the site and contact, which belong to the first one; said once, briefly (spec 8).
  const change = (key: string, next: unknown) => {
    if (key === "customerId" && String(next ?? "") !== String(value.customerId ?? "")) {
      const cleared = Boolean(value.siteId || value.contactId);
      setAdding(null);
      setNotice(cleared ? "CRM.referencesCleared" : "");
      form.patch({ customerId: next, siteId: "", contactId: "" });
      return;
    }
    if (key === "siteId" && String(next ?? "") !== String(value.siteId ?? "")) {
      const contact = (customer.data?.contacts ?? []).find((r) => String(r.id) === String(value.contactId));
      form.patch({ siteId: next, ...(contact && next && String(contact.siteId) !== String(next) ? { contactId: "" } : {}) });
      return;
    }
    form.patch({ [key]: next });
  };
  const main: FieldSpec[] = [
    {
      key: "customerId",
      required: true,
      searchable: true,
      disabled: Boolean(value.id),
      placeholder: "CRM.searchCustomer",
      options: companies,
      guide: "crm.deal.customer",
      hint: value.id ? "CRM.customerLocked" : undefined,
    },
    {
      key: "endUserCustomerId",
      searchable: true,
      placeholder: "CRM.searchEndUser",
      options: endUsers,
      ...(value.customerId && String(value.endUserCustomerId ?? "") !== String(value.customerId)
        ? { link: { label: "CRM.useCustomerAsEndUser", onClick: () => form.patch({ endUserCustomerId: Number(value.customerId) }) } }
        : {}),
    },
    { key: "name", required: true, wide: true, guide: "crm.deal.name", maxLength: 300 },
  ];
  const contactAndOwners: FieldSpec[] = [
    {
      key: "siteId",
      options: sites.map((r) => ({ value: text(r.id), label: text(r.name), detail: text(r.code) })),
      disabled: !value.customerId,
      loading: customer.loading && Boolean(value.customerId),
    },
    {
      key: "contactId",
      searchable: true,
      disabled: !value.customerId,
      placeholder: value.customerId ? "CRM.searchContact" : "CRM.pickCustomerFirst",
      options: contactOptions,
      guide: "crm.deal.contact",
      loading: customer.loading && Boolean(value.customerId),
      failed: customer.error,
      onRetry: customer.refresh,
      // A link under the box, not a row in the list: Enter after typing a name must pick that person, never open the add form.
      ...(canAddContact && value.customerId ? { link: { label: "CRM.addContact", onClick: () => setAdding("") } } : {}),
    },
    { key: "salesOwnerId", required: true, searchable: true, placeholder: "CRM.searchPerson", options: people, guide: "crm.deal.owner" },
    { key: "technicalOwnerId", searchable: true, placeholder: "CRM.searchPerson", options: people },
    { key: "expectedClose", type: "date", guide: "crm.deal.close" },
    ...(bootstrap.permissions.includes("crm.commercial.read") ? [{ key: "expectedValue", type: "number" as const }] : []),
    ...(showStage ? [{ key: "stage", options: choice("stage"), required: true }] : []),
  ];
  const nextAction: FieldSpec[] = create
    ? [
        { key: "nextActionText", label: "CRM.action", maxLength: 1000 },
        { key: "nextActionDue", label: "CRM.dueDate", type: "date", required: Boolean(text(value.nextActionText).trim()) },
      ]
    : [];
  const more: FieldSpec[] = [
    { key: "source", options: choice("source") },
    { key: "priority", options: priorityOptions(t) },
    { key: "probability", type: "number" },
    { key: "competitor", maxLength: 300 },
    { key: "need", type: "textarea", wide: true },
    { key: "scope", type: "textarea", wide: true },
    { key: "internalNote", type: "textarea", wide: true },
  ];
  const evidence = evidenceFields(value, !initial || value.stage !== (initial.previousStage ?? initial.stage));
  const lost: FieldSpec[] =
    value.stage === "LOST"
      ? [
          { key: "lostReason", required: true, options: choice("lostReason") },
          { key: "lostDetail", required: value.lostReason === "Other", type: "textarea" },
        ]
      : [];
  const save = useSave(formId, form, (v) => onSave(v, create), onClose);
  const grid = (fields: FieldSpec[], mark?: { guide: string }) => <FieldGrid fields={fields} value={value} errors={form.errors} formId={formId} onChange={change} guide={mark?.guide} />;
  return (
    <CrmDialog
      title={t(initial ? "CRM.editDeal" : "CRM.new")}
      description={initial ? `${text(initial.opportunityNo)} · ${text(initial.name)}` : t("CRM.newDealHint")}
      size="lg"
      dirty={form.dirty}
      busy={save.busy}
      failure={save.failure}
      onReload={onReload}
      onClose={onClose}
      formId={formId}
      onSubmit={() => save.submit([...main, ...contactAndOwners, ...nextAction, ...more, ...evidence, ...lost])}
    >
      {grid(main)}
      {notice ? <Note>{t(notice)}</Note> : null}
      {similar.data?.length ? (
        <Note tone="warning">
          <strong>{t("CRM.duplicateInline")}</strong>
          <ul className="mt-1 grid gap-0.5">
            {similar.data.map((r) => (
              <li key={text(r.id)}>
                <span className="font-mono">{text(r.opportunityNo)}</span> · {text(r.name)} · {t(`CRM.${text(r.stage)}`)}
              </li>
            ))}
          </ul>
        </Note>
      ) : null}
      {grid(contactAndOwners)}
      {adding !== null && value.customerId ? (
        <ContactQuickAdd
          key={adding}
          customerId={Number(value.customerId)}
          sites={sites}
          siteId={text(value.siteId)}
          initialName={adding}
          onClose={() => setAdding(null)}
          onAdded={(contact, existing) => {
            setAdding(null);
            setNotice(existing ? "CRM.contactExisting" : "CRM.contactAdded");
            customer.refresh();
            form.patch({ contactId: contact.id, siteId: value.siteId && String(value.siteId) !== String(contact.siteId) ? contact.siteId : value.siteId });
          }}
        />
      ) : null}
      {nextAction.length ? grid(nextAction, { guide: "crm.deal.nextAction" }) : null}
      {evidence.length ? (
        <>
          <Note>{t("CRM.evidenceHint")}</Note>
          {grid(evidence, { guide: "crm.evidence" })}
        </>
      ) : null}
      {lost.length ? grid(lost) : null}
      <Section title={t("CRM.optionalDetails")} guide="crm.deal.more">
        {grid(more)}
      </Section>
    </CrmDialog>
  );
}

/** Adds a contact for the deal's customer without leaving the form; a name or email that already exists is selected instead of duplicated. */
function ContactQuickAdd({
  customerId,
  sites,
  siteId,
  initialName = "",
  onAdded,
  onClose,
}: {
  customerId: number;
  sites: CrmRecord[];
  siteId: string;
  initialName?: string;
  onAdded: (contact: { id: number; siteId: number }, existing: boolean) => void;
  onClose: () => void;
}) {
  const t = useT(),
    main = sites.find((r) => r.code === "MAIN") ?? sites[0],
    id = useId(),
    nameRef = useRef<HTMLInputElement>(null);
  // The name box takes the focus when the section opens, so the typed name can be finished at once.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  const [draft, setDraft] = useState({ name: initialName, position: "", email: "", phone: "", siteId: siteId || (main ? text(main.id) : "") }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const add = () => {
    if (busy) return;
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (!name) {
      setError("CRM.contactNameRequired");
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    // The contact API keeps a name per language: file it under the language it is written in.
    const nameKey = /[฀-๿]/.test(name) ? "nameTh" : /[぀-ヿ一-鿿]/.test(name) ? "nameJa" : "nameEn";
    setBusy(true);
    setError("");
    void crmRequest<{ id: number; siteId: number }>(`/api/v1/sales/customers/${customerId}/contacts`, "POST", {
      [nameKey]: name,
      position: draft.position,
      email: draft.email,
      phone: draft.phone,
      siteId: draft.siteId ? Number(draft.siteId) : undefined,
    })
      .then((contact) => onAdded(contact, false))
      .catch(async (failure: unknown) => {
        if (failure instanceof ApiClientError && failure.code === "duplicate_contact") {
          const detail = await apiRequest<CustomerDetail>(`/api/v1/crm/customers/${customerId}`).catch(() => null);
          const same = (field: unknown, typed: string) => Boolean(typed.trim()) && text(field).trim().toLocaleLowerCase() === typed.trim().toLocaleLowerCase();
          const match = detail?.contacts.find((r) => (same(r.name, name) || same(r.email, draft.email)) && (!draft.siteId || String(r.siteId) === draft.siteId));
          if (match) {
            onAdded({ id: Number(match.id), siteId: Number(match.siteId) }, true);
            return;
          }
        }
        setError(failure instanceof ApiClientError && failure.code === "validation_failed" ? "CRM.contactCheckFields" : "CRM.error");
      })
      .finally(() => setBusy(false));
  };
  // Enter adds the contact here instead of submitting the deal form around it.
  const enter = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };
  const input = (key: "name" | "position" | "email" | "phone", label: string, type = "text", max = 200) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${key}`}>
        {t(label)}
        {key === "name" ? (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      <Input
        id={`${id}-${key}`}
        type={type}
        maxLength={max}
        autoComplete="off"
        ref={key === "name" ? nameRef : undefined}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        onKeyDown={enter}
      />
    </div>
  );
  return (
    <section className="bg-muted/30 grid gap-3 rounded-md border p-3" aria-label={t("CRM.addContact")}>
      <strong className="text-sm">{t("CRM.addContact")}</strong>
      {error ? (
        <div role="alert">
          <Notice tone="error">{t(error)}</Notice>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {input("name", "CRM.contactName")}
        {input("position", "CRM.position")}
        {input("email", "CRM.email", "email", 256)}
        {input("phone", "CRM.phone", "tel", 100)}
        {sites.length > 1 ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-site`}>{t("CRM.siteId")}</Label>
            <OptionSelect
              id={`${id}-site`}
              value={draft.siteId || null}
              options={sites.map((r) => ({ value: text(r.id), label: text(r.name) }))}
              onChange={(next) => setDraft({ ...draft, siteId: next == null ? "" : String(next) })}
            />
          </div>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={add}>
          <NamedIcon name="plus" className="size-4" />
          {t("CRM.newContact")}
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ activity */

const ACTIVITY_TYPES = ["Meeting", "Call", "Email", "SiteVisit", "CustomerUpdate", "InternalDiscussion", "MessageLINE", "Note", "Other"];
const REFERENCE_KEYS = ["opportunityId", "contactId", "inquiryId", "estimateId", "projectId"];

/** A meeting, call or note with the customer, the records it concerns and, on a deal, the next action. */
export function ActivityDialog({
  bootstrap,
  customerId,
  opportunityId,
  onSave,
  onClose,
}: {
  bootstrap: BootstrapData;
  customerId?: number;
  opportunityId?: number;
  onSave: (value: CrmRecord) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT(),
    formId = useId();
  const [occurredAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const form = useCrmForm({ customerId: customerId ?? "", opportunityId: opportunityId ?? "", activityType: "Meeting", nextOwnerId: bootstrap.user.id, ownerId: bootstrap.user.id, occurredAt });
  const value = form.value,
    [notice, setNotice] = useState("");
  const people = useMemo(() => teamOptions(bootstrap), [bootstrap]);
  const customer = useCrmData<CustomerDetail>(value.customerId ? `/api/v1/crm/customers/${value.customerId}` : null);
  // The customer's deals come from the API by what is typed, so every deal is reachable, not the first 100 (CRM-05).
  const [dealTerm, setDealTerm] = useState("");
  const typed = useDebounced(dealTerm.trim(), 300);
  const deals = useCrmData<CrmPage>(
    value.customerId ? `/api/v1/crm/opportunities?${new URLSearchParams({ customerId: text(value.customerId), search: typed, pageSize: "50", sort: "updated" })}` : null,
  );
  const chosenDeal = useCrmData<{ opportunity: CrmRecord }>(value.opportunityId && opportunityId == null ? `/api/v1/crm/opportunities/${value.opportunityId}` : null);
  const dealOptions = (() => {
    const rows = deals.shown?.items ?? [];
    const options = rows.map((r) => ({ value: text(r.id), label: text(r.name), detail: [text(r.opportunityNo), t(`CRM.${text(r.stage)}`)].filter(Boolean).join(" · ") }));
    const chosen = chosenDeal.data?.opportunity;
    return chosen && !options.some((o) => o.value === text(chosen.id)) ? [{ value: text(chosen.id), label: text(chosen.name), detail: text(chosen.opportunityNo) }, ...options] : options;
  })();
  const pick = (rows: CrmRecord[] | undefined, label: string, detail: (r: CrmRecord) => string) => (rows ?? []).map((r) => ({ value: text(r.id), label: text(r[label]), detail: detail(r) }));
  // A new customer or deal empties the records that belonged to the old one, so nothing of customer A is sent with B (CRM-04).
  const change = (key: string, next: unknown) => {
    if (key === "customerId" && String(next ?? "") !== String(value.customerId ?? "")) {
      const cleared = REFERENCE_KEYS.some((k) => value[k]);
      setNotice(cleared ? "CRM.referencesCleared" : "");
      setDealTerm("");
      form.patch({ customerId: next, ...Object.fromEntries(REFERENCE_KEYS.map((k) => [k, ""])) });
      return;
    }
    if (key === "opportunityId" && String(next ?? "") !== String(value.opportunityId ?? "")) {
      const cleared = ["inquiryId", "estimateId", "projectId"].some((k) => value[k]);
      setNotice(cleared ? "CRM.referencesCleared" : "");
      form.patch({ opportunityId: next, inquiryId: "", estimateId: "", projectId: "" });
      return;
    }
    form.patch({ [key]: next });
  };
  const main: FieldSpec[] = [
    ...(customerId ? [] : [{ key: "customerId", required: true, searchable: true, placeholder: "CRM.searchCustomer", options: customerOptions(bootstrap) }]),
    { key: "activityType", required: true, options: ACTIVITY_TYPES.map((s) => ({ value: s, label: t(`CRM.${s}`) })), guide: "crm.activity.type" },
    { key: "occurredAt", required: true, type: "datetime-local" },
    { key: "ownerId", required: true, searchable: true, placeholder: "CRM.searchPerson", options: people },
    { key: "participants", maxLength: 2000 },
    { key: "summary", required: true, wide: true, guide: "crm.activity.summary", maxLength: 4000 },
    { key: "decision", type: "textarea" },
    { key: "actionItems", type: "textarea" },
  ];
  const waiting = customer.loading && Boolean(value.customerId);
  const references: FieldSpec[] = [
    ...(opportunityId
      ? []
      : [
          {
            key: "opportunityId",
            label: "CRM.sourceOpportunity",
            searchable: true,
            disabled: !value.customerId,
            placeholder: value.customerId ? "CRM.searchDeal" : "CRM.pickCustomerFirst",
            options: dealOptions,
            loading: deals.loading,
            failed: deals.error,
            onRetry: deals.refresh,
            onSearch: setDealTerm,
          },
        ]),
    {
      key: "contactId",
      searchable: true,
      disabled: !value.customerId,
      options: pick(
        customer.data?.contacts.filter((r) => r.isActive !== false),
        "name",
        (r) => [text(r.position), text(r.siteName)].filter(Boolean).join(" · "),
      ),
      loading: waiting,
      failed: customer.error,
      onRetry: customer.refresh,
    },
    {
      key: "inquiryId",
      searchable: true,
      disabled: !value.customerId,
      options: pick(
        customer.data?.inquiries.filter((r) => !value.opportunityId || Number(r.opportunityId) === Number(value.opportunityId)),
        "inquiryNo",
        (r) => text(r.projectName),
      ),
      loading: waiting,
    },
    { key: "estimateId", searchable: true, disabled: !value.customerId, options: pick(customer.data?.estimates, "estimateNo", (r) => `R${text(r.revision)} · ${t(text(r.status))}`), loading: waiting },
    { key: "projectId", searchable: true, disabled: !value.customerId, options: pick(customer.data?.projects, "projectNo", (r) => text(r.name)), loading: waiting },
  ];
  const next: FieldSpec[] = value.opportunityId
    ? [
        { key: "action", wide: true, maxLength: 1000 },
        { key: "nextOwnerId", label: "CRM.ownerId", searchable: true, placeholder: "CRM.searchPerson", options: people },
        { key: "dueDate", type: "date", required: Boolean(text(value.action).trim()) },
      ]
    : [];
  const save = useSave(formId, form, onSave, onClose);
  const grid = (fields: FieldSpec[]) => <FieldGrid fields={fields} value={value} errors={form.errors} formId={formId} onChange={change} />;
  return (
    <CrmDialog
      title={t("CRM.addActivity")}
      size="lg"
      dirty={form.dirty}
      busy={save.busy}
      failure={save.failure}
      onClose={onClose}
      formId={formId}
      onSubmit={() => save.submit([...main, ...references, ...next])}
    >
      {grid(main)}
      {notice ? <Note>{t(notice)}</Note> : null}
      <Section title={t("CRM.links")} defaultOpen={Boolean(opportunityId)}>
        <p className="text-muted-foreground mb-2 text-xs">{t("CRM.linksHint")}</p>
        {grid(references)}
      </Section>
      {next.length ? (
        <Section title={t("CRM.addAction")} guide="crm.activity.next">
          {grid(next)}
        </Section>
      ) : null}
    </CrmDialog>
  );
}

/* ------------------------------------------------------------------ contact */

/** A new or edited contact; one name in any language is enough, and the form says so (CRM-19). */
export function ContactDialog({
  bootstrap,
  initial,
  onSave,
  onClose,
  onReload,
}: {
  bootstrap: BootstrapData;
  initial: CrmRecord;
  onSave: (value: CrmRecord) => Promise<void>;
  onClose: () => void;
  onReload?: () => void;
}) {
  const editing = Boolean(initial.id),
    t = useT(),
    formId = useId(),
    form = useCrmForm(initial),
    value = form.value;
  const customer = useCrmData<CustomerDetail>(!editing && value.customerId ? `/api/v1/crm/customers/${value.customerId}` : null);
  const fields: FieldSpec[] = [
    { key: "customerId", required: true, searchable: true, disabled: editing, placeholder: "CRM.searchCustomer", options: customerOptions(bootstrap), wide: true },
    { key: "nameTh", hint: "CRM.contactNameRule", maxLength: 200 },
    { key: "nameEn", maxLength: 200 },
    { key: "nameJa", maxLength: 200 },
    { key: "email", type: "email", maxLength: 256 },
    { key: "phone", type: "tel", maxLength: 100 },
    { key: "department", maxLength: 200 },
    { key: "position", maxLength: 200 },
    ...(editing
      ? [{ key: "isPrimary", type: "checkbox" as const }]
      : [{ key: "siteId", options: (customer.data?.sites ?? []).map((r) => ({ value: text(r.id), label: text(r.name) })), disabled: !value.customerId, loading: customer.loading }]),
  ];
  const check = (v: CrmRecord): Record<string, string> => (["nameTh", "nameEn", "nameJa"].some((key) => text(v[key]).trim()) ? {} : { nameTh: "CRM.contactNameRequired" });
  const save = useSave(formId, form, onSave, onClose);
  return (
    <CrmDialog
      title={t(editing ? "CRM.editContact" : "CRM.newContact")}
      size="md"
      dirty={form.dirty}
      busy={save.busy}
      failure={save.failure}
      onReload={onReload}
      onClose={onClose}
      formId={formId}
      onSubmit={() => save.submit(fields, check)}
    >
      <FieldGrid
        fields={fields}
        value={value}
        errors={form.errors}
        formId={formId}
        onChange={(key, next) => {
          // The site belongs to the customer; any one name answers the "a name is needed" note on the Thai name.
          form.patch(key === "customerId" ? { customerId: next, siteId: "" } : { [key]: next });
          if (key.startsWith("name")) form.setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== "nameTh")));
        }}
      />
    </CrmDialog>
  );
}

/* ------------------------------------------------------------------ configuration */

/**
 * The option lists (sources, lost reasons, contact roles, stage labels) in one dialog: the table, and a row's form in the
 * same dialog instead of a second dialog over it (CRM UX audit: nested dialogs confused focus and Escape).
 */
export function ConfigurationDialog({ options, onSave, onClose }: { options: CrmRecord[]; onSave: (value: CrmRecord) => Promise<void>; onClose: () => void }) {
  const t = useT(),
    { lang } = useLanguage(),
    [edit, setEdit] = useState<CrmRecord | null>(null);
  if (edit)
    return (
      <CrmFormDialog
        title={edit.rowVersion ? "CRM.editOption" : "CRM.addOption"}
        description={edit.rowVersion ? `${t(`CRM.${text(edit.kind)}`)} · ${text(edit.code)}` : undefined}
        initial={edit}
        fields={[
          ...(!edit.rowVersion
            ? [
                { key: "kind", required: true, options: ["source", "lostReason", "contactRole"].map((k) => ({ value: k, label: t(`CRM.${k}`) })) },
                { key: "code", required: true, maxLength: 40 },
              ]
            : []),
          { key: "labelTh", required: true, maxLength: 200 },
          { key: "labelEn", required: true, maxLength: 200 },
          { key: "labelJa", required: true, maxLength: 200 },
          ...(edit.kind === "stage" ? [{ key: "quietDays", type: "number" as const, hint: "CRM.quietDaysHint" }] : [{ key: "isActive", type: "checkbox" as const }]),
        ]}
        onSave={onSave}
        onClose={() => setEdit(null)}
      />
    );
  const label = (r: CrmRecord) => text(r[lang === "TH" ? "labelTh" : lang === "JP" ? "labelJa" : "labelEn"]) || text(r.labelEn);
  return (
    <TomasUi>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,900px)] flex-col gap-0 p-0 sm:max-w-4xl" onInteractOutside={(event) => onGuide(event.target) && event.preventDefault()}>
          <DialogHeader className="border-b px-6 pt-5 pb-3 pr-12">
            <DialogTitle>{t("CRM.configuration")}</DialogTitle>
            <DialogDescription>{t("CRM.configurationHint")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("CRM.kind")}</TableHead>
                  <TableHead>{t("CRM.code")}</TableHead>
                  <TableHead>{t("CRM.optionLabel")}</TableHead>
                  <TableHead className="text-end">{t("CRM.quietDays")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {options.map((r) => (
                  <TableRow key={`${text(r.kind)}:${text(r.code)}`}>
                    <TableCell>{t(`CRM.${text(r.kind)}`)}</TableCell>
                    <TableCell className="font-mono text-xs">{text(r.code)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setEdit(r)}>
                        {label(r)}
                      </Button>
                    </TableCell>
                    <TableCell className="text-end">{text(r.quietDays) || "—"}</TableCell>
                    <TableCell>{t(r.isActive === false ? "CRM.optionInactive" : "CRM.optionActive")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="border-t px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Close")}
            </Button>
            <Button type="button" onClick={() => setEdit({ kind: "source", isActive: true })}>
              <NamedIcon name="plus" className="size-4" />
              {t("CRM.addOption")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TomasUi>
  );
}

/* ------------------------------------------------------------------ remove */

export function RemoveDialog({ title, name, hint, blocked, onRemove, onClose }: { title: string; name: string; hint: string; blocked?: string; onRemove: () => Promise<void>; onClose: () => void }) {
  const t = useT(),
    formId = useId(),
    form = useCrmForm({}),
    save = useSave(formId, form, onRemove, onClose);
  return (
    <CrmDialog
      title={t(title)}
      size="sm"
      dirty={false}
      busy={save.busy}
      failure={save.failure ?? (blocked ? { key: blocked } : null)}
      onClose={onClose}
      formId={formId}
      submitLabel="CRM.remove"
      destructive
      submitDisabled={Boolean(blocked)}
      saveGuide="crm.remove"
      onSubmit={() => save.submit([])}
    >
      <strong className="text-sm">{name}</strong>
      <p className="text-muted-foreground text-sm">{t(hint)}</p>
    </CrmDialog>
  );
}

/* ------------------------------------------------------------------ deal actions */

export type DealAction = { id: string; label: string; guide?: string; onSelect: () => void };

/**
 * The deal's buttons (CRM-09): one primary button, the step the deal's stage calls for, and every other action under
 * "More", so the business step never competes with Edit. A guide step finds an action in the menu by its mark.
 */
export function DealActions({ primary, others, moreLabel }: { primary: DealAction | null; others: DealAction[]; moreLabel: string }) {
  return (
    <TomasUi>
      <div className="flex flex-wrap items-center justify-end gap-2" data-guide="crm.actions">
        {others.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" data-guide="crm.more">
                {moreLabel}
                <NamedIcon name="chevron-down" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {others.map((action) => (
                <DropdownMenuItem key={action.id} data-guide={action.guide} onSelect={action.onSelect}>
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {primary ? (
          <Button type="button" data-guide={primary.guide} onClick={primary.onSelect}>
            {primary.label}
          </Button>
        ) : null}
      </div>
    </TomasUi>
  );
}
