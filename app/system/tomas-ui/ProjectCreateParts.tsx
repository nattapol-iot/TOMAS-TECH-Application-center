"use client";
/*
 * Create project as a page (task doc 5.4) on @tomas-tc/ui (owner 2026-11-25): the page head, the choice of where the
 * project comes from, and the right-hand column that says what is still missing and what Create does, with Cancel and
 * Create under it. The form between them (customer search, the ERP number lookup, end user, contacts, the starting plan)
 * stays the app's own: each part does its own lookups, and an app part never goes inside the kit's root.
 */
import { Button, NamedIcon } from "@tomas-tc/ui";
import { Segmented } from "./Segmented";
import { TomasUi } from "./TomasUi";

export function ProjectCreateHead({ backLabel, onBack, title, subtitle }: { backLabel: string; onBack: () => void; title: string; subtitle: string }) {
  return (
    <TomasUi>
      <div className="grid gap-3">
        <div>
          <Button variant="outline" size="sm" onClick={onBack}>
            <NamedIcon name="chevron-left" />
            {backLabel}
          </Button>
        </div>
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </TomasUi>
  );
}

/** From an approved estimate, or without one: shown only to those allowed both (CreateProjectModal canChooseSource). */
export function ProjectCreateSource({
  label,
  fromEstimate,
  withoutEstimate,
  standalone,
  disabled,
  onChange,
}: {
  label: string;
  fromEstimate: string;
  withoutEstimate: string;
  standalone: boolean;
  disabled: boolean;
  onChange: (standalone: boolean) => void;
}) {
  return (
    <TomasUi>
      <Segmented
        label={label}
        guide="project.source"
        disabled={disabled}
        options={[
          { value: false, label: fromEstimate },
          { value: true, label: withoutEstimate },
        ]}
        value={standalone}
        onChange={onChange}
      />
    </TomasUi>
  );
}

export type ProjectCreateAsideProps = {
  labels: { missing: string; loading: string; ready: string; after: string; draftKept: string; cancel: string; create: string; saving: string };
  loading: boolean;
  /** What still stops Create: required fields, plan rows and dates out of order, already translated. */
  missing: string[];
  /** What Create does, already translated. */
  after: string[];
  error: string;
  busy: boolean;
  disabled: boolean;
  onCancel: () => void;
  onCreate: () => void;
};

export function ProjectCreateAside({ labels, loading, missing, after, error, busy, disabled, onCancel, onCreate }: ProjectCreateAsideProps) {
  return (
    <TomasUi className="pcp-aside">
      <div className="grid gap-3" data-guide="projectCreate.aside">
        <section className="rounded-md border bg-card p-3">
          <h4 className="mb-1.5 text-sm font-semibold">{labels.missing}</h4>
          {loading ? (
            <p className="text-sm text-muted-foreground">{labels.loading}</p>
          ) : missing.length ? (
            <ul className="m-0 grid list-disc gap-0.5 pl-4 text-sm text-amber-800">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <NamedIcon name="check" className="size-4" />
              {labels.ready}
            </p>
          )}
        </section>
        <section className="rounded-md border bg-card p-3">
          <h4 className="mb-1.5 text-sm font-semibold">{labels.after}</h4>
          <ul className="m-0 grid list-disc gap-0.5 pl-4 text-sm">
            {after.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">{labels.draftKept}</p>
        </section>
        {error ? (
          <p role="alert" className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            <NamedIcon name="triangle-alert" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button data-guide="project.save" disabled={disabled} onClick={onCreate}>
            <NamedIcon name={busy ? "loader-circle" : "check"} className={busy ? "animate-spin" : undefined} />
            {busy ? labels.saving : labels.create}
          </Button>
        </div>
      </div>
    </TomasUi>
  );
}
