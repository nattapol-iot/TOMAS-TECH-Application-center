"use client";
/*
 * The CEO cost summary (task doc 6.3) on @tomas-tc/ui (owner 2026-11-25). CeoSummaryScreen loads the figures, writes the
 * things to know and saves the PM's note; this draws them: the page head with PDF, Excel and the project picker, then one
 * card per project, most at risk on its budget first. The class names ceo-* stay as hooks for the print rules in
 * production/ceo-summary.css (the page as it is on screen, on A4 landscape).
 */
import { Badge, Button, Card, EmptyState, NamedIcon, Notice, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from "@tomas-tc/ui";
import { useState } from "react";
import { TONE_BADGE, TONE_TEXT, type KitTone } from "./tones";
import { TomasUi } from "./TomasUi";

export type CeoFactLine = { key: string; text: string; tone: KitTone | "muted" };
export type CeoCard = {
  id: number;
  key: string;
  number: string;
  name: string;
  meta: string;
  health: { label: string; tone: KitTone } | null;
  /** How the worst of its budgets stands: the card's edge and its badge. */
  state: { label: string; tone: KitTone };
  figures: { label: string; value: string }[];
  facts: CeoFactLine[];
  note: { text: string; by: string; at: string } | null;
  canEditNote: boolean;
};

export type CeoSummaryProps = {
  labels: {
    back: string;
    title: string;
    subtitle: string;
    pdf: string;
    excel: string;
    exporting: string;
    show: string;
    allProjects: string;
    toKnow: string;
    nothing: string;
    pmNote: string;
    noNote: string;
    addNote: string;
    editNote: string;
    open: string;
    cancel: string;
    save: string;
    retry: string;
    none: string;
    noneHint: string;
  };
  loading: boolean;
  error: string;
  onRetry: () => void;
  onBack: () => void;
  exporting: boolean;
  canExport: boolean;
  onPdf: () => void;
  onExcel: () => void;
  focus: string | null;
  choices: { key: string; label: string }[];
  onFocus: (key: string | null) => void;
  cards: CeoCard[];
  onOpen: (key: string) => void;
  /** Saves a project's note; true once it is saved, so the editor closes. */
  onSaveNote: (id: number, text: string) => Promise<boolean>;
};

const ALL = "all";
/** The card's left edge, coloured as its budget stands; important, as the Pegasus card sets its own border colour. */
const EDGE: Record<KitTone, string> = {
  red: "border-l-red-600!",
  amber: "border-l-amber-500!",
  green: "border-l-emerald-600!",
  blue: "border-l-sky-600!",
  slate: "border-l-border!",
  violet: "border-l-violet-600!",
};

export function CeoSummary(props: CeoSummaryProps) {
  const { labels } = props;
  return (
    <TomasUi className="ceo-summary">
      <div className="grid gap-3" data-guide="ceo.summary">
        <div className="ceo-back">
          <Button variant="outline" size="sm" onClick={props.onBack}>
            <NamedIcon name="chevron-left" />
            {labels.back}
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h1 className="text-xl font-semibold text-foreground">{labels.title}</h1>
            <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
          </div>
          <div className="ceo-actions flex flex-wrap items-center gap-2">
            <Button variant="outline" data-guide="ceo.downloads" disabled={!props.canExport} onClick={props.onPdf}>
              <NamedIcon name="download" />
              {labels.pdf}
            </Button>
            <Button variant="outline" disabled={!props.canExport || props.exporting} onClick={props.onExcel}>
              <NamedIcon name={props.exporting ? "loader-circle" : "download"} className={props.exporting ? "animate-spin" : undefined} />
              {props.exporting ? labels.exporting : labels.excel}
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {labels.show}
              <Select value={props.focus ?? ALL} onValueChange={(value) => props.onFocus(value === ALL ? null : value)}>
                <SelectTrigger aria-label={labels.show} data-guide="ceo.focus" className="w-72 max-w-[70vw] text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{labels.allProjects}</SelectItem>
                  {props.choices.map((choice) => (
                    <SelectItem key={choice.key} value={choice.key}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
        {props.error ? (
          <div className="flex flex-wrap items-center gap-3">
            <Notice tone="error" message={props.error} />
            <Button variant="outline" size="sm" onClick={props.onRetry}>
              {labels.retry}
            </Button>
          </div>
        ) : null}
        {props.loading ? (
          <Card className="grid gap-2 p-4" aria-busy="true">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ) : null}
        {!props.loading && !props.error && !props.cards.length ? (
          <EmptyState className="rounded-md border bg-card py-10 text-center">
            <p className="font-medium">{labels.none}</p>
            <p className="text-sm text-muted-foreground">{labels.noneHint}</p>
          </EmptyState>
        ) : null}
        <div className="ceo-list grid gap-2.5">
          {props.cards.map((card) => (
            <CeoProjectCard key={card.id} card={card} labels={labels} onOpen={() => props.onOpen(card.key)} onSaveNote={(text) => props.onSaveNote(card.id, text)} />
          ))}
        </div>
      </div>
    </TomasUi>
  );
}

function CeoProjectCard({ card, labels, onOpen, onSaveNote }: { card: CeoCard; labels: CeoSummaryProps["labels"]; onOpen: () => void; onSaveNote: (text: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (await onSaveNote(draft)) setEditing(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={`ceo-item grid gap-2 border-l-4 px-4 py-3 ${EDGE[card.state.tone]}`}>
      <div className="ceo-item-head flex flex-wrap items-center gap-2">
        <button type="button" className="text-left font-semibold text-primary hover:underline" title={labels.open} onClick={onOpen}>
          <span className="font-mono">{card.number}</span> {card.name}
        </button>
        {card.health ? (
          <Badge variant="outline" className={TONE_BADGE[card.health.tone]}>
            {card.health.label}
          </Badge>
        ) : null}
        <Badge variant="outline" className={TONE_BADGE[card.state.tone]}>
          {card.state.label}
        </Badge>
        <span className="text-xs text-muted-foreground sm:ml-auto">{card.meta}</span>
      </div>
      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1">
        {card.figures.map((figure) => (
          <div key={figure.label}>
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className="m-0 font-mono font-semibold tabular-nums">{figure.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(220px,2fr)]">
        <section>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">{labels.toKnow}</h4>
          {card.facts.length ? (
            <ul className="m-0 grid list-disc gap-0.5 pl-4 text-sm">
              {card.facts.map((fact) => (
                <li key={fact.key} className={fact.tone === "muted" ? "text-muted-foreground" : TONE_TEXT[fact.tone]}>
                  {fact.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{labels.nothing}</p>
          )}
        </section>
        <section className="ceo-note" data-guide="ceo.note">
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">{labels.pmNote}</h4>
          {editing ? (
            <div className="grid gap-1.5">
              <Textarea rows={3} maxLength={2000} value={draft} disabled={busy} aria-label={labels.pmNote} onChange={(event) => setDraft(event.target.value)} />
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
                  {labels.cancel}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void save()}>
                  {labels.save}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid justify-items-start gap-1">
              {card.note ? (
                <p className="m-0 text-sm whitespace-pre-wrap">
                  {card.note.text}
                  <small className="text-xs text-muted-foreground">
                    {" "}
                    · {card.note.by} · {card.note.at}
                  </small>
                </p>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">{labels.noNote}</p>
              )}
              {card.canEditNote ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(card.note?.text ?? "");
                    setEditing(true);
                  }}
                >
                  <NamedIcon name="pencil" />
                  {card.note ? labels.editNote : labels.addNote}
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}
