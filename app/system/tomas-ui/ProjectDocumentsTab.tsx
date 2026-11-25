"use client";
/*
 * The Documents tab of a project's own page (task doc 5.5) on @tomas-tc/ui (owner 2026-11-25): the standard folders
 * 00-14 with how many files each holds, where each file came from (carried over from the Inquiry, the Site Visit or the
 * Estimate, or saved by the plan's customer export), a filter and a search, and many files dropped at once, each with its
 * folder and type. Who may upload or withdraw is the API's (routes/project-documents.ts).
 */
import {
  Badge,
  Button,
  EmptyState,
  Input,
  NamedIcon,
  Notice,
  ReasonDialog,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tomas-tc/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { downloadProjectDocument, listProjectDocuments, uploadProjectDocument, withdrawProjectDocument, type ProjectDocument, type ProjectSummary } from "../api-client";
import { useT } from "../i18n";
import { DOCUMENT_SOURCES as SOURCES, PROJECT_DOCUMENT_FOLDERS, documentSource, type DocumentSource } from "../../../lib/project-documents";
import { TONE_BADGE, type KitTone } from "./tones";
import { TomasUi } from "./TomasUi";

const MAX_BYTES = 50 * 1024 * 1024;
const sizeText = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
/** A guess at the folder from the file's name; the person can change it before uploading. */
function folderFor(file: File, fallback: string): string {
  const name = file.name.toLowerCase();
  if (/\.(dwg|dxf|step|stp|igs|iges)$/.test(name) || /drawing|dwg/.test(name)) return "02";
  if (/\.(jpe?g|png|gif|heic|mp4|mov)$/.test(name)) return "13";
  if (/\bpo\b|purchase.?order/.test(name)) return "05";
  if (/quot/.test(name)) return "04";
  if (/schedule|gantt/.test(name)) return "08";
  if (/report/.test(name)) return "10";
  return fallback;
}
/** Each source in its own colour, so a carried-over file stands out from an upload. */
const SOURCE_TONE: Record<DocumentSource, KitTone> = { inquiry: "blue", siteVisit: "violet", estimate: "green", plan: "amber", upload: "slate" };

type Staged = { key: number; file: File; folderCode: string; documentType: string; state: "ready" | "sending" | "done" | "failed"; error?: string };

export function ProjectDocumentsTab({ project, canWrite, notify }: { project: ProjectSummary; canWrite: boolean; notify: (message: string) => void }) {
  const t = useT();
  const [documents, setDocuments] = useState<ProjectDocument[] | null>(null);
  const [error, setError] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [source, setSource] = useState<DocumentSource | null>(null);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState<ProjectDocument | null>(null);
  const keys = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      setDocuments(await listProjectDocuments(project.id));
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not load"));
    }
  }, [project.id, t]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    for (const document of documents ?? []) byFolder.set(document.folderCode, (byFolder.get(document.folderCode) ?? 0) + 1);
    return byFolder;
  }, [documents]);
  const sourceCounts = useMemo(() => {
    const bySource = new Map<DocumentSource, number>();
    for (const document of documents ?? []) bySource.set(documentSource(document), (bySource.get(documentSource(document)) ?? 0) + 1);
    return bySource;
  }, [documents]);
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (documents ?? []).filter(
      (document) =>
        (folder === null || document.folderCode === folder) &&
        (source === null || documentSource(document) === source) &&
        (!words || `${document.fileName} ${document.documentType} ${document.remark ?? ""} ${document.uploadedByName}`.toLowerCase().includes(words)),
    );
  }, [documents, folder, source, search]);

  const stage = (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setStaged((current) => [
      ...current.filter((item) => item.state !== "done"),
      ...list.map((file) => ({
        key: ++keys.current,
        file,
        folderCode: folderFor(file, folder ?? "00"),
        documentType: "",
        state: file.size > MAX_BYTES ? ("failed" as const) : ("ready" as const),
        ...(file.size > MAX_BYTES ? { error: t("ProjectDocs.tooBig") } : {}),
      })),
    ]);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (canWrite) stage(event.dataTransfer.files);
  };
  const change = (key: number, patch: Partial<Staged>) => setStaged((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  // A file the API refused may be changed and sent again; one over the size limit never.
  const editable = (item: Staged) => !busy && (item.state === "ready" || (item.state === "failed" && item.file.size <= MAX_BYTES));
  const ready = staged.filter((item) => item.state === "ready" || (item.state === "failed" && item.file.size <= MAX_BYTES));
  const sendAll = async () => {
    if (busy || !ready.length || ready.some((item) => !item.documentType.trim())) return;
    setBusy(true);
    let sent = 0;
    // One at a time: the API scans and stores each file, and a refusal names the file it is about.
    for (const item of ready) {
      change(item.key, { state: "sending" });
      try {
        await uploadProjectDocument(project.id, { file: item.file, folderCode: item.folderCode, documentType: item.documentType.trim() });
        change(item.key, { state: "done" });
        sent += 1;
      } catch (failure) {
        change(item.key, { state: "failed", error: failure instanceof Error ? failure.message : t("ProjectDocs.uploadFailed") });
      }
    }
    setBusy(false);
    if (sent) notify(t("ProjectDocs.uploadedCount").replace("{n}", String(sent)));
    await load();
  };
  const download = async (document: ProjectDocument) => {
    try {
      const result = await downloadProjectDocument(project.id, document.id);
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = (result.fileName || document.fileName).replace(/[\\/:*?"<>|]/g, "_");
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : t("Could not load"));
    }
  };
  const withdraw = async (reason: string) => {
    if (!withdrawing || !reason.trim()) return;
    setBusy(true);
    try {
      await withdrawProjectDocument(project.id, withdrawing.id, { rowVersion: withdrawing.rowVersion, reason: reason.trim() });
      notify(`${withdrawing.fileName} · ${t("ProjectDocs.withdrawn")}`);
      setWithdrawing(null);
      await load();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : t("ProjectDocs.withdrawFailed"));
    } finally {
      setBusy(false);
    }
  };
  const folderName = (code: string) => PROJECT_DOCUMENT_FOLDERS.find(([value]) => value === code)?.[1] ?? code;

  return (
    <TomasUi>
      <div className="grid gap-3 md:grid-cols-[18rem_minmax(0,1fr)]">
        <nav
          aria-label={t("ProjectDocs.folders")}
          data-guide="projectDocs.folders"
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-0.5 rounded-md border bg-card p-1.5 max-md:max-h-56 max-md:overflow-y-auto"
        >
          <button
            type="button"
            aria-pressed={folder === null}
            onClick={() => setFolder(null)}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:font-medium aria-pressed:text-primary"
          >
            <span>{t("ProjectDocs.allFolders")}</span>
            <b className="font-mono text-xs tabular-nums">{documents?.length ?? 0}</b>
          </button>
          {PROJECT_DOCUMENT_FOLDERS.map(([code, name]) => (
            <button
              key={code}
              type="button"
              aria-pressed={folder === code}
              onClick={() => setFolder(folder === code ? null : code)}
              title={`${code} ${name}`}
              className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:font-medium aria-pressed:text-primary ${counts.get(code) ? "" : "text-muted-foreground"}`}
            >
              <span className="min-w-0 truncate">
                <span className="font-mono text-xs">{code}</span> {name}
              </span>
              <b className="font-mono text-xs tabular-nums">{counts.get(code) ?? 0}</b>
            </button>
          ))}
        </nav>
        <div className="grid min-w-0 content-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput className="w-64" value={search} placeholder={t("ProjectDocs.search")} aria-label={t("ProjectDocs.search")} onValueChange={setSearch} />
            <div role="group" aria-label={t("ProjectDocs.source")} data-guide="projectDocs.sources" className="flex flex-wrap gap-1.5">
              {SOURCES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={source === value}
                  onClick={() => setSource(source === value ? null : value)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs hover:bg-muted aria-pressed:ring-2 aria-pressed:ring-primary/40"
                >
                  <Badge variant="outline" className={TONE_BADGE[SOURCE_TONE[value]]}>
                    {t(`ProjectDocs.source.${value}`)}
                  </Badge>
                  <span className="font-mono tabular-nums">{sourceCounts.get(value) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          {canWrite ? (
            <div
              data-guide="projectDocs.drop"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-wrap items-center gap-3 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground ${dragging ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <NamedIcon name="upload" />
              <span className="flex-1">{t("ProjectDocs.dropHint")}</span>
              <Button variant="outline" size="sm" onClick={() => picker.current?.click()}>
                {t("ProjectDocs.pick")}
              </Button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) stage(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
          ) : null}
          {staged.length ? (
            <div className="grid gap-2 rounded-md border bg-card p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ProjectDocs.file")}</TableHead>
                    <TableHead>{t("ProjectDocs.folder")}</TableHead>
                    <TableHead>{t("ProjectDocs.type")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staged.map((item) => (
                    <TableRow key={item.key} className={item.state === "done" ? "text-muted-foreground" : undefined}>
                      <TableCell className="whitespace-normal">
                        {item.file.name} <small className="text-xs text-muted-foreground">{sizeText(item.file.size)}</small>
                        {item.error ? <small className="block text-xs text-destructive">{item.error}</small> : null}
                      </TableCell>
                      <TableCell>
                        <Select value={item.folderCode} disabled={!editable(item)} onValueChange={(value) => change(item.key, { folderCode: value, state: "ready", error: "" })}>
                          <SelectTrigger size="sm" aria-label={t("ProjectDocs.folder")} className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_DOCUMENT_FOLDERS.map(([code, name]) => (
                              <SelectItem key={code} value={code}>
                                {code} · {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.documentType}
                          maxLength={100}
                          disabled={!editable(item)}
                          placeholder={t("ProjectDocs.typeHint")}
                          aria-label={t("ProjectDocs.type")}
                          onChange={(event) => change(item.key, { documentType: event.target.value, state: "ready", error: "" })}
                        />
                      </TableCell>
                      <TableCell className="w-12 text-right">
                        {item.state === "done" ? (
                          <NamedIcon name="check" className="size-4 text-emerald-700" />
                        ) : item.state === "sending" ? (
                          <NamedIcon name="loader-circle" className="size-4 animate-spin text-muted-foreground" />
                        ) : null}
                        {!busy && (item.state === "ready" || item.state === "failed") ? (
                          <Button variant="ghost" size="icon-sm" aria-label={t("Remove")} onClick={() => setStaged((current) => current.filter((other) => other.key !== item.key))}>
                            <NamedIcon name="x" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStaged([])}>
                  {t("Cancel")}
                </Button>
                <Button size="sm" disabled={busy || !ready.length || ready.some((item) => !item.documentType.trim())} onClick={() => void sendAll()}>
                  <NamedIcon name="upload" />
                  {t("ProjectDocs.uploadAll").replace("{n}", String(ready.length))}
                </Button>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="flex flex-wrap items-center gap-3">
              <Notice tone="error" message={error} />
              <Button variant="outline" size="sm" onClick={() => void load()}>
                {t("Try again")}
              </Button>
            </div>
          ) : null}
          {documents === null && !error ? (
            <div className="grid gap-2 rounded-md border bg-card p-3" aria-busy="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : shown.length ? (
            <div className="rounded-md border bg-card px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ProjectDocs.file")}</TableHead>
                    <TableHead>{t("ProjectDocs.folder")}</TableHead>
                    <TableHead>{t("ProjectDocs.type")}</TableHead>
                    <TableHead>{t("ProjectDocs.source")}</TableHead>
                    <TableHead>{t("ProjectDocs.by")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((document) => {
                    const from = documentSource(document);
                    return (
                      <TableRow key={document.id}>
                        <TableCell className="whitespace-normal">
                          <button type="button" className="text-left font-medium text-primary hover:underline" onClick={() => void download(document)}>
                            {document.fileName}
                          </button>
                          <small className="block text-xs text-muted-foreground">{sizeText(document.sizeBytes)}</small>
                        </TableCell>
                        <TableCell title={folderName(document.folderCode)} className="font-mono">
                          {document.folderCode}
                        </TableCell>
                        <TableCell className="whitespace-normal">{document.documentType}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TONE_BADGE[SOURCE_TONE[from]]} title={document.remark ?? undefined}>
                            {t(`ProjectDocs.source.${from}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {document.uploadedByName}
                          <small className="block text-xs text-muted-foreground">{new Date(document.uploadedAt).toLocaleDateString()}</small>
                        </TableCell>
                        <TableCell className="w-12 text-right">
                          {document.canWithdraw ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${t("ProjectDocs.withdraw")} ${document.fileName}`}
                              title={t("ProjectDocs.withdraw")}
                              onClick={() => setWithdrawing(document)}
                            >
                              <NamedIcon name="trash-2" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState className="rounded-md border bg-card py-10 text-center">
              <p className="font-medium">{t(documents?.length ? "Portfolio.noMatch" : "ProjectDocs.none")}</p>
              <p className="text-sm text-muted-foreground">{t(documents?.length ? "ProjectDocs.noMatch" : canWrite ? "ProjectDocs.noneHint" : "ProjectDocs.noneRead")}</p>
            </EmptyState>
          )}
        </div>
      </div>
      <ReasonDialog
        open={withdrawing !== null}
        onOpenChange={(open) => {
          if (!open) setWithdrawing(null);
        }}
        title={t("ProjectDocs.withdraw")}
        {...(withdrawing ? { description: withdrawing.fileName } : {})}
        label={t("ProjectDocs.withdrawReason")}
        confirmLabel={t("ProjectDocs.withdraw")}
        processing={busy}
        destructive
        // The reason is the confirmation, as before; a typed word on top would only add a step.
        confirmWord={null}
        maxLength={500}
        onSubmit={(reason) => void withdraw(reason)}
      />
    </TomasUi>
  );
}
