"use client";
/*
 * The Documents tab of a project's own page (task doc 5.5): the standard folders 00-14 with how many files each holds,
 * where each file came from (carried over from the Inquiry, the Site Visit or the Estimate, or saved by the plan's
 * customer export), a filter and a search, and many files dropped at once, each with its folder and type. Who may
 * upload or withdraw is the API's, as in the documents dialog it replaces (routes/project-documents.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { downloadProjectDocument, listProjectDocuments, uploadProjectDocument, withdrawProjectDocument, type ProjectDocument, type ProjectSummary } from "../api-client";
import { useT } from "../i18n";
import { EmptyState, Icon, Modal, SearchInput } from "../ui";
import { documentSource, DOCUMENT_SOURCES as SOURCES, type DocumentSource } from "../../../lib/project-documents";
import "./project-documents-tab.css";

/** The company's standard project folders; the API creates the same set for every project. */
export const PROJECT_DOCUMENT_FOLDERS = [
  ["00", "To do list"],
  ["01", "Concept Design and Proposal"],
  ["02", "Drawing"],
  ["03", "Estimate cost"],
  ["04", "Quote"],
  ["05", "PO"],
  ["06", "Specifications and Documentation"],
  ["07", "Development"],
  ["08", "Schedule"],
  ["09", "Installation"],
  ["10", "Report"],
  ["11", "Manual and Document"],
  ["12", "DATA & EXAMPLE"],
  ["13", "Pic and Video"],
  ["14", "Ref"],
] as const;

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
  const [reason, setReason] = useState("");
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
  const withdraw = async () => {
    if (!withdrawing || !reason.trim()) return;
    setBusy(true);
    try {
      await withdrawProjectDocument(project.id, withdrawing.id, { rowVersion: withdrawing.rowVersion, reason: reason.trim() });
      notify(`${withdrawing.fileName} · ${t("ProjectDocs.withdrawn")}`);
      setWithdrawing(null);
      setReason("");
      await load();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : t("ProjectDocs.withdrawFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pdt">
      <nav className="pdt-folders" aria-label={t("ProjectDocs.folders")} data-guide="projectDocs.folders">
        <button type="button" aria-pressed={folder === null} onClick={() => setFolder(null)}>
          <span>{t("ProjectDocs.allFolders")}</span>
          <b className="mono">{documents?.length ?? 0}</b>
        </button>
        {PROJECT_DOCUMENT_FOLDERS.map(([code, name]) => (
          <button key={code} type="button" aria-pressed={folder === code} className={counts.get(code) ? undefined : "is-empty"} onClick={() => setFolder(folder === code ? null : code)}>
            <span>
              <span className="mono">{code}</span> {name}
            </span>
            <b className="mono">{counts.get(code) ?? 0}</b>
          </button>
        ))}
      </nav>
      <div className="pdt-main">
        <div className="pdt-tools">
          <SearchInput value={search} onChange={setSearch} placeholder="ProjectDocs.search" />
          <div className="pdt-sources" role="group" aria-label={t("ProjectDocs.source")} data-guide="projectDocs.sources">
            {SOURCES.map((value) => (
              <button key={value} type="button" aria-pressed={source === value} onClick={() => setSource(source === value ? null : value)}>
                <span className={`pdt-tag ${value}`}>{t(`ProjectDocs.source.${value}`)}</span> <span className="mono">{sourceCounts.get(value) ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        {canWrite ? (
          <div
            className={`pdt-drop${dragging ? " over" : ""}`}
            data-guide="projectDocs.drop"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Icon name="upload" />
            <span>{t("ProjectDocs.dropHint")}</span>
            <button type="button" className="btn default sm" onClick={() => picker.current?.click()}>
              {t("ProjectDocs.pick")}
            </button>
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
          <div className="pdt-staged">
            <table>
              <thead>
                <tr>
                  <th>{t("ProjectDocs.file")}</th>
                  <th>{t("ProjectDocs.folder")}</th>
                  <th>{t("ProjectDocs.type")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staged.map((item) => (
                  <tr key={item.key} className={item.state}>
                    <td>
                      {item.file.name} <small className="muted">{sizeText(item.file.size)}</small>
                      {item.error ? <small className="pdt-error">{item.error}</small> : null}
                    </td>
                    <td>
                      <select
                        value={item.folderCode}
                        disabled={!editable(item)}
                        onChange={(event) => change(item.key, { folderCode: event.target.value, state: "ready", error: "" })}
                        aria-label={t("ProjectDocs.folder")}
                      >
                        {PROJECT_DOCUMENT_FOLDERS.map(([code, name]) => (
                          <option key={code} value={code}>
                            {code} · {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={item.documentType}
                        maxLength={100}
                        disabled={!editable(item)}
                        placeholder={t("ProjectDocs.typeHint")}
                        aria-label={t("ProjectDocs.type")}
                        onChange={(event) => change(item.key, { documentType: event.target.value, state: "ready", error: "" })}
                      />
                    </td>
                    <td className="pdt-state">
                      {item.state === "done" ? <Icon name="check" /> : item.state === "sending" ? <span className="spinner" /> : null}
                      {!busy && (item.state === "ready" || item.state === "failed") ? (
                        <button type="button" className="row-action" aria-label={t("Remove")} onClick={() => setStaged((current) => current.filter((other) => other.key !== item.key))}>
                          <Icon name="x" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pdt-staged-actions">
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setStaged([])}>
                {t("Cancel")}
              </button>
              <button type="button" className="btn primary sm" disabled={busy || !ready.length || ready.some((item) => !item.documentType.trim())} onClick={() => void sendAll()}>
                <Icon name="upload" />
                {t("ProjectDocs.uploadAll").replace("{n}", String(ready.length))}
              </button>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="callout danger" role="alert">
            <span>{error}</span>
            <button type="button" className="btn ghost sm" onClick={() => void load()}>
              {t("Try again")}
            </button>
          </div>
        ) : null}
        {documents === null && !error ? (
          <span className="spinner" />
        ) : shown.length ? (
          <table className="pdt-list">
            <thead>
              <tr>
                <th>{t("ProjectDocs.file")}</th>
                <th>{t("ProjectDocs.folder")}</th>
                <th>{t("ProjectDocs.type")}</th>
                <th>{t("ProjectDocs.source")}</th>
                <th>{t("ProjectDocs.by")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((document) => {
                const from = documentSource(document);
                return (
                  <tr key={document.id}>
                    <td>
                      <button type="button" className="pg-doclink" onClick={() => void download(document)}>
                        {document.fileName}
                      </button>
                      <small className="muted">{sizeText(document.sizeBytes)}</small>
                    </td>
                    <td className="mono">{document.folderCode}</td>
                    <td>{document.documentType}</td>
                    <td>
                      <span className={`pdt-tag ${from}`} title={document.remark ?? undefined}>
                        {t(`ProjectDocs.source.${from}`)}
                      </span>
                    </td>
                    <td>
                      {document.uploadedByName}
                      <small className="muted">{new Date(document.uploadedAt).toLocaleDateString()}</small>
                    </td>
                    <td>
                      {document.canWithdraw ? (
                        <button
                          type="button"
                          className="row-action"
                          aria-label={`${t("ProjectDocs.withdraw")} ${document.fileName}`}
                          title={t("ProjectDocs.withdraw")}
                          onClick={() => setWithdrawing(document)}
                        >
                          <Icon name="trash" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : documents?.length ? (
          <EmptyState icon="filter" title="Portfolio.noMatch" message="ProjectDocs.noMatch" />
        ) : (
          <EmptyState icon="folder" title="ProjectDocs.none" message={canWrite ? "ProjectDocs.noneHint" : "ProjectDocs.noneRead"} />
        )}
      </div>
      {withdrawing ? (
        <Modal
          title="ProjectDocs.withdraw"
          subtitle={withdrawing.fileName}
          onClose={() => {
            setWithdrawing(null);
            setReason("");
          }}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setWithdrawing(null);
                  setReason("");
                }}
              >
                {t("Cancel")}
              </button>
              <button type="button" className="btn danger" disabled={busy || !reason.trim()} onClick={() => void withdraw()}>
                {t("ProjectDocs.withdraw")}
              </button>
            </>
          }
        >
          <label className="field">
            <span>{t("ProjectDocs.withdrawReason")}</span>
            <textarea required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </Modal>
      ) : null}
    </div>
  );
}
