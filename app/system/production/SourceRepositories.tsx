"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  createSourceRepository, deleteRepositoryPath, deleteSourceRepository, downloadRepositoryArchive, downloadRepositoryFile,
  fetchRepositoryFileBlob, getRepositoryBlob, getRepositoryTree, getSourceRepository, listProjects, listSourceRepositories,
  updateSourceRepository, uploadRepositoryFile,
  type ProjectSummary, type RepositoryBlob, type RepositoryHub, type RepositoryTree, type SourceRepository, type SourceRepositoryDetail,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, Icon, Modal, Panel, SearchInput, Tabs, Toolbar } from "../ui";

type Notify = (message: string) => void;

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
};

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function formatRepositorySize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function projectLabel(project: SourceRepository["project"]): string {
  if (!project) return "";
  return [project.projectNo, project.name].filter(Boolean).join(" · ") || `#${project.id}`;
}

/** Repository list, then one repository's tree, file view and history. */
export function SourceRepositories({ canManage, notify }: { canManage: boolean; notify: Notify }) {
  const [items, setItems] = useState<SourceRepository[] | null>(null);
  const [hub, setHub] = useState<RepositoryHub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const t = useT();
  const { lang } = useLanguage();
  const dateFormat = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric" });

  useEffect(() => {
    let active = true;
    listSourceRepositories()
      .then((result) => { if (active) { setItems(result.items); setHub(result.hub ?? null); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [revision]);

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items ?? []) if (item.project) seen.set(String(item.project.id), projectLabel(item.project));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const needle = query.trim().toLocaleLowerCase();
  const visible = (items ?? []).filter((item) => (!project || String(item.project?.id ?? "") === project)
    && (!needle || `${item.name} ${item.description} ${projectLabel(item.project)}`.toLocaleLowerCase().includes(needle)));

  if (open) {
    return <RepositoryView name={open} notify={notify} dateFormat={dateFormat}
      onBack={() => { setOpen(null); setRevision((value) => value + 1); }} />;
  }

  return (
    <>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Repos.search" />
        <label className="select-field">
          <span className="sr-only">{t("Repos.project")}</span>
          <select value={project} onChange={(event) => setProject(event.target.value)}>
            <option value="">{t("Repos.allProjects")}</option>
            {projects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {items ? <span className="download-center-count">{visible.length} <LocalizedText text={"Repos.count"} /></span> : null}
        {hub ? (
          <a className="btn default" href={hub.orgUrl} target="_blank" rel="noopener noreferrer"><Icon name="externalLink" /><LocalizedText text={"Repos.openHub"} /></a>
        ) : null}
        {canManage ? (
          <button className="btn primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" /><LocalizedText text={"Repos.new"} /></button>
        ) : null}
      </Toolbar>

      {error ? (
        <Panel><EmptyState icon="alertTriangle" title="Could not load" message={error}
          action={<button className="btn default" type="button" onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} /></Panel>
      ) : items === null ? (
        <Panel><EmptyState icon="clock" title="Loading…" message="Repos.loading" /></Panel>
      ) : visible.length === 0 ? (
        <Panel><EmptyState icon="gitBranch" title={items.length === 0 ? "Repos.emptyTitle" : "Downloads.noMatchTitle"}
          message={items.length === 0 ? (canManage ? "Repos.emptyManage" : "Repos.emptyMessage") : "Downloads.noMatchMessage"} /></Panel>
      ) : (
        <section className="panel">
          <div className="panel-body flush">
            <div className="table-wrap">
              <table className="grid repo-table">
                <colgroup><col /><col style={{ width: 260 }} /><col style={{ width: 90 }} /><col style={{ width: 100 }} /><col style={{ width: 170 }} /></colgroup>
                <thead>
                  <tr>
                    <th><LocalizedText text={"Repos.repository"} /></th>
                    <th><LocalizedText text={"Repos.project"} /></th>
                    <th className="num"><LocalizedText text={"Repos.files"} /></th>
                    <th className="num"><LocalizedText text={"Downloads.size"} /></th>
                    <th><LocalizedText text={"Downloads.updated"} /></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.name} className="clickable" onClick={() => setOpen(item.name)}>
                      <td className="wrap">
                        <div className="cell-primary">
                          <strong className="repo-name"><Icon name="gitBranch" /> {item.name}</strong>
                          {item.description ? <span className="download-center-description">{item.description}</span> : null}
                        </div>
                      </td>
                      <td><span title={projectLabel(item.project)}>{projectLabel(item.project) || "—"}</span></td>
                      <td className="num">{item.fileCount ?? "—"}</td>
                      <td className="num">{formatRepositorySize(item.sizeBytes)}</td>
                      <td>
                        <div className="cell-primary">
                          <span>{item.updatedAt ? dateFormat.format(new Date(item.updatedAt)) : "—"}</span>
                          {item.updatedBy.name ? <span>{item.updatedBy.name}</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {creating ? (
        <CreateRepositoryModal onClose={() => setCreating(false)} notify={notify}
          onCreated={(created) => { setCreating(false); setOpen(created.name); }} />
      ) : null}
    </>
  );
}

function ProjectPicker({ value, onChange }: { value: ProjectSummary | null; onChange: (project: ProjectSummary | null) => void }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      listProjects({ page: 1, pageSize: 30, search: search.trim() || undefined })
        .then((result) => { if (active) setOptions(result.items); })
        .catch(() => { if (active) setOptions([]); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);
  const list = value && !options.some((item) => item.id === value.id) ? [value, ...options] : options;
  return (
    <div className="repo-project-picker">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Repos.projectSearch")} />
      <select value={value ? String(value.id) : ""} onChange={(event) => onChange(list.find((item) => String(item.id) === event.target.value) ?? null)}>
        <option value="">{t("Repos.chooseProject")}</option>
        {list.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.name}</option>)}
      </select>
    </div>
  );
}

function CreateRepositoryModal({ onClose, onCreated, notify }: { onClose: () => void; onCreated: (repo: SourceRepository) => void; notify: Notify }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) && !name.endsWith(".") && project !== null;
  const save = async () => {
    if (!valid || !project) return;
    setBusy(true);
    try {
      onCreated(await createSourceRepository({ name, projectId: project.id, description }));
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Repos.new" subtitle="Repos.newHint" onClose={onClose}
      footer={<>
        <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={!valid || busy} onClick={() => void save()}><Icon name="plus" /><LocalizedText text={"Repos.create"} /></button>
      </>}>
      <div className="form-grid two">
        <Field label="Repos.name" hint="Repos.nameHint" span={2}>
          <input value={name} maxLength={100} onChange={(event) => setName(event.target.value.replace(/\s+/g, "-"))} placeholder="tmt-gateway-firmware" />
        </Field>
        <Field label="Repos.project" span={2}><ProjectPicker value={project} onChange={setProject} /></Field>
        <Field label="Repos.description" span={2}>
          <textarea rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RepositoryView({ name, notify, dateFormat, onBack }: { name: string; notify: Notify; dateFormat: Intl.DateTimeFormat; onBack: () => void }) {
  const t = useT();
  const [detail, setDetail] = useState<SourceRepositoryDetail | null>(null);
  const [tab, setTab] = useState<"code" | "history">("code");
  const [path, setPath] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getSourceRepository(name)
      .then((result) => { if (active) { setDetail(result); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [name, revision]);

  const refresh = () => setRevision((value) => value + 1);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (reason) { notify(errorText(reason)); } finally { setBusy(false); }
  };
  const removeRepository = () => {
    if (!detail || !window.confirm(t("Repos.deleteConfirm").replace("{name}", detail.name))) return;
    void run(async () => { await deleteSourceRepository(detail.name); notify(t("Repos.deleted")); onBack(); });
  };
  const removePath = (target: string, isFolder: boolean) => {
    if (!window.confirm(t(isFolder ? "Repos.deleteFolderConfirm" : "Repos.deleteFileConfirm").replace("{path}", target))) return;
    void run(async () => {
      await deleteRepositoryPath(name, target, "");
      if (file === target) setFile(null);
      refresh();
    });
  };

  if (error) {
    return <Panel><EmptyState icon="alertTriangle" title="Could not load" message={error}
      action={<button className="btn default" type="button" onClick={onBack}><Icon name="arrowLeft" /><LocalizedText text={"Repos.back"} /></button>} /></Panel>;
  }
  if (!detail) return <Panel><EmptyState icon="clock" title="Loading…" message="Repos.loading" /></Panel>;

  return (
    <div className="stack repo-view">
      <section className="panel">
        <div className="panel-head repo-head">
          <div>
            <button className="btn ghost sm" type="button" onClick={onBack}><Icon name="arrowLeft" /><LocalizedText text={"Repos.back"} /></button>
            <h2 className="repo-title"><Icon name="gitBranch" /> {detail.name}</h2>
            <p className="repo-meta">
              {detail.project ? <Badge tone="blue">{projectLabel(detail.project)}</Badge> : null}
              {detail.defaultBranch ? <Badge tone="violet">{detail.defaultBranch}</Badge> : null}
              <span>{detail.fileCount !== null ? <>{detail.fileCount} <LocalizedText text={"Repos.files"} /> · </> : null}{formatRepositorySize(detail.sizeBytes)}</span>
              {detail.updatedAt ? <span><LocalizedText text={"Downloads.updated"} /> {dateFormat.format(new Date(detail.updatedAt))}{detail.updatedBy.name ? ` · ${detail.updatedBy.name}` : ""}</span> : null}
            </p>
            {detail.description ? <p className="download-center-description">{detail.description}</p> : null}
            {detail.cloneUrl ? <CloneBox url={detail.cloneUrl} notify={notify} /> : null}
          </div>
          <div className="repo-actions">
            {detail.webUrl ? (
              <a className="btn default" href={detail.webUrl} target="_blank" rel="noopener noreferrer"><Icon name="externalLink" /><LocalizedText text={"Repos.openInHub"} /></a>
            ) : null}
            <button className="btn primary" type="button" disabled={busy || detail.fileCount === 0 || detail.empty === true} onClick={() => void run(() => downloadRepositoryArchive(detail.name))}>
              <Icon name="download" /><LocalizedText text={"Repos.downloadZip"} />
            </button>
            {detail.canManage ? <>
              <button className="btn default" type="button" disabled={busy} onClick={() => setUploading(true)}><Icon name="upload" /><LocalizedText text={"Repos.upload"} /></button>
              <button className="btn default" type="button" disabled={busy} onClick={() => setEditing(true)}><Icon name="edit" /><LocalizedText text={"Edit"} /></button>
              <button className="btn danger" type="button" disabled={busy} onClick={removeRepository}><Icon name="trash" /><LocalizedText text={"Repos.delete"} /></button>
            </> : null}
          </div>
        </div>
      </section>

      <Tabs tabs={[{ id: "code", label: "Repos.code" }, { id: "history", label: "Repos.history", count: detail.history.length }]} active={tab} onChange={setTab} />

      {tab === "history" ? <HistoryPanel detail={detail} /> : file ? (
        <BlobPanel key={file} repo={name} path={file} canManage={detail.canManage} busy={busy} notify={notify}
          onNavigate={(next) => { setFile(null); setPath(next); }} onDelete={() => removePath(file, false)} />
      ) : (
        <TreePanel repo={name} path={path} revision={revision} canManage={detail.canManage} busy={busy} dateFormat={dateFormat} notify={notify}
          folderZip={!detail.cloneUrl}
          onNavigate={setPath} onOpenFile={setFile} onDelete={removePath} />
      )}

      {uploading ? (
        <UploadModal repo={name} path={path} maxBytes={detail.uploadMaxBytes ?? null} cloneUrl={detail.cloneUrl ?? null} notify={notify} onClose={() => setUploading(false)}
          onDone={() => { setUploading(false); setFile(null); refresh(); }} />
      ) : null}
      {editing ? (
        <EditRepositoryModal detail={detail} notify={notify} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
      ) : null}
    </div>
  );
}

function Breadcrumb({ repo, path, onNavigate }: { repo: string; path: string; onNavigate: (path: string) => void }) {
  const segments = path.split("/").filter(Boolean);
  return (
    <nav className="breadcrumb repo-breadcrumb" aria-label="path">
      <button type="button" onClick={() => onNavigate("")}>{repo}</button>
      {segments.map((segment, index) => (
        <Fragment key={`${index}-${segment}`}>
          <span>/</span>
          <button type="button" onClick={() => onNavigate(segments.slice(0, index + 1).join("/"))}>{segment}</button>
        </Fragment>
      ))}
    </nav>
  );
}

function TreePanel({ repo, path, revision, canManage, busy, dateFormat, notify, folderZip, onNavigate, onOpenFile, onDelete }: {
  repo: string; path: string; revision: number; canManage: boolean; busy: boolean; dateFormat: Intl.DateTimeFormat; notify: Notify;
  /** Folder ZIPs come from NAS folders only; a TMTHub repository downloads whole. */
  folderZip: boolean;
  onNavigate: (path: string) => void; onOpenFile: (path: string) => void; onDelete: (path: string, isFolder: boolean) => void;
}) {
  const t = useT();
  const [tree, setTree] = useState<RepositoryTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${repo}|${path}|${revision}`;
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    let active = true;
    getRepositoryTree(repo, path)
      .then((result) => { if (active) { setTree(result); setError(null); setLoadedKey(key); } })
      .catch((reason: unknown) => { if (active) { setError(errorText(reason)); setLoadedKey(key); } });
    return () => { active = false; };
  }, [repo, path, key]);
  const loading = loadedKey !== key;
  const parent = path.split("/").filter(Boolean).slice(0, -1).join("/");

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <Breadcrumb repo={repo} path={path} onNavigate={onNavigate} />
          {path && folderZip ? (
            <button className="btn default sm" type="button" disabled={busy} onClick={() => void downloadRepositoryArchive(repo, path).catch((reason: unknown) => notify(errorText(reason)))}>
              <Icon name="download" /><LocalizedText text={"Repos.downloadFolder"} />
            </button>
          ) : null}
        </div>
        <div className="panel-body flush">
          {error && !loading ? (
            <EmptyState icon="alertTriangle" title="Could not load" message={error} />
          ) : loading || !tree ? (
            <EmptyState icon="clock" title="Loading…" message="Repos.loading" />
          ) : tree.entries.length === 0 && !path ? (
            <EmptyState icon="folder" title="Repos.emptyTreeTitle" message={canManage ? "Repos.emptyTreeManage" : "Repos.emptyTreeMessage"} />
          ) : (
            <div className="table-wrap">
              <table className="grid repo-tree">
                <colgroup><col /><col style={{ width: 100 }} /><col style={{ width: 130 }} /><col style={{ width: canManage ? 96 : 52 }} /></colgroup>
                <tbody>
                  {path ? (
                    <tr className="clickable" onClick={() => onNavigate(parent)}>
                      <td colSpan={4}><span className="repo-entry"><Icon name="folder" /> ..</span></td>
                    </tr>
                  ) : null}
                  {tree.entries.map((entry) => (
                    <tr key={entry.path} className="clickable" onClick={() => (entry.type === "dir" ? onNavigate(entry.path) : onOpenFile(entry.path))}>
                      <td><span className={`repo-entry ${entry.type}`} title={entry.name}><Icon name={entry.type === "dir" ? "folder" : "file"} /> {entry.name}</span></td>
                      <td className="num">{entry.type === "file" ? formatRepositorySize(entry.sizeBytes) : ""}</td>
                      <td>{dateFormat.format(new Date(entry.modifiedAt))}</td>
                      <td className="repo-row-actions">
                        {entry.type === "file" ? (
                          <button className="icon-btn" type="button" aria-label={t("Downloads.download")} title={t("Downloads.download")}
                            onClick={(event) => { event.stopPropagation(); void downloadRepositoryFile(repo, entry.path).catch((reason: unknown) => notify(errorText(reason))); }}>
                            <Icon name="download" />
                          </button>
                        ) : folderZip ? (
                          <button className="icon-btn" type="button" aria-label={t("Repos.downloadFolder")} title={t("Repos.downloadFolder")}
                            onClick={(event) => { event.stopPropagation(); void downloadRepositoryArchive(repo, entry.path).catch((reason: unknown) => notify(errorText(reason))); }}>
                            <Icon name="download" />
                          </button>
                        ) : null}
                        {canManage ? (
                          <button className="icon-btn" type="button" disabled={busy} aria-label={t("Repos.delete")} title={t("Repos.delete")}
                            onClick={(event) => { event.stopPropagation(); onDelete(entry.path, entry.type === "dir"); }}>
                            <Icon name="trash" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {tree?.readme && !loading ? (
        <section className="panel">
          <div className="panel-head"><h2><Icon name="book" /> {tree.readme.name}</h2></div>
          <div className="panel-body">
            {/\.(md|markdown)$/i.test(tree.readme.name) ? <Markdown source={tree.readme.content} /> : <pre className="repo-readme-text">{tree.readme.content}</pre>}
          </div>
        </section>
      ) : null}
    </>
  );
}

function BlobPanel({ repo, path, canManage, busy, notify, onNavigate, onDelete }: {
  repo: string; path: string; canManage: boolean; busy: boolean; notify: Notify; onNavigate: (path: string) => void; onDelete: () => void;
}) {
  const t = useT();
  const [blob, setBlob] = useState<RepositoryBlob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  const imageType = IMAGE_TYPES[extension];
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    getRepositoryBlob(repo, path)
      .then((result) => { if (active) { setBlob(result); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    if (imageType) {
      fetchRepositoryFileBlob(repo, path, imageType)
        .then((data) => { if (active) { url = URL.createObjectURL(data); setImage(url); } })
        .catch(() => undefined);
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [repo, path, imageType]);
  const lines = useMemo(() => (blob?.content ?? "").replace(/\r\n/g, "\n").split("\n"), [blob]);
  const folder = path.split("/").slice(0, -1).join("/");

  return (
    <section className="panel">
      <div className="panel-head">
        <Breadcrumb repo={repo} path={path} onNavigate={onNavigate} />
        <div className="repo-actions">
          {blob ? <span className="download-center-count">{blob.content !== null ? `${lines.length} ${t("Repos.lines")} · ` : ""}{formatRepositorySize(blob.sizeBytes)}</span> : null}
          <button className="btn default sm" type="button" onClick={() => onNavigate(folder)}><Icon name="arrowLeft" /><LocalizedText text={"Repos.back"} /></button>
          <button className="btn primary sm" type="button" onClick={() => void downloadRepositoryFile(repo, path).catch((reason: unknown) => notify(errorText(reason)))}>
            <Icon name="download" /><LocalizedText text={"Downloads.download"} />
          </button>
          {canManage ? <button className="btn danger sm" type="button" disabled={busy} onClick={onDelete}><Icon name="trash" /><LocalizedText text={"Repos.delete"} /></button> : null}
        </div>
      </div>
      <div className="panel-body flush">
        {error ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
          : !blob ? <EmptyState icon="clock" title="Loading…" message="Repos.loading" />
          : imageType ? (image ? (
            <div className="repo-image">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob previews cannot use an image optimizer */}
              <img src={image} alt={blob.name} />
            </div>
          ) : <EmptyState icon="clock" title="Loading…" message="Repos.loading" />)
          : blob.content === null ? <EmptyState icon="file" title={blob.reason === "too_large" ? "Repos.tooLargeTitle" : "Repos.binaryTitle"} message="Repos.downloadInstead" />
          : (
            <div className="repo-code">
              <table>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index}><td className="repo-line-no">{index + 1}</td><td className="repo-line">{line || " "}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </section>
  );
}

/** The git remote of a TMTHub repository, ready to copy into "git clone". */
function CloneBox({ url, notify }: { url: string; notify: Notify }) {
  const t = useT();
  const command = `git clone ${url}`;
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => notify(t("Repos.cloneCopied")), () => notify(command));
  };
  return (
    <div className="repo-clone">
      <span><LocalizedText text={"Repos.clone"} /></span>
      <code title={command}>{command}</code>
      <button className="icon-btn" type="button" aria-label={t("Repos.copyClone")} title={t("Repos.copyClone")} onClick={copy}><Icon name="copy" /></button>
    </div>
  );
}

function HistoryPanel({ detail }: { detail: SourceRepositoryDetail }) {
  const { lang } = useLanguage();
  const format = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const actionKey = { create: "Repos.actionCreate", upload: "Repos.actionUpload", delete: "Repos.actionDelete", update: "Repos.actionUpdate", commit: "Repos.actionCommit" } as const;
  const tone = { create: "green", upload: "blue", delete: "red", update: "violet", commit: "blue" } as const;
  if (detail.history.length === 0) return <Panel><EmptyState icon="clock" title="Repos.noHistory" message="Repos.noHistoryMessage" /></Panel>;
  return (
    <section className="panel">
      <div className="panel-body flush">
        <ul className="repo-history">
          {detail.history.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <Badge tone={tone[entry.action]}><LocalizedText text={actionKey[entry.action]} /></Badge>
              <div>
                <strong>{entry.message || entry.path || "—"}</strong>
                <span>
                  {entry.by.name || "—"} · {entry.at ? format.format(new Date(entry.at)) : "—"}
                  {entry.files ? <> · {entry.files} <LocalizedText text={"Repos.files"} /></> : null}
                  {entry.path && entry.message ? <> · <code>{entry.path}</code></> : null}
                  {entry.sha ? <> · {entry.url
                    ? <a href={entry.url} target="_blank" rel="noopener noreferrer"><code>{entry.sha.slice(0, 8)}</code></a>
                    : <code>{entry.sha.slice(0, 8)}</code>}</> : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function UploadModal({ repo, path, maxBytes, cloneUrl, notify, onClose, onDone }: {
  repo: string; path: string; maxBytes: number | null; cloneUrl: string | null; notify: Notify; onClose: () => void; onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  // Checked before sending: a file over the ceiling would otherwise upload for minutes and then fail.
  const tooLarge = maxBytes ? files.filter((file) => file.size > maxBytes) : [];
  const [target, setTarget] = useState(path);
  const [message, setMessage] = useState("");
  const [extract, setExtract] = useState(true);
  const [replace, setReplace] = useState(false);
  const [stripRoot, setStripRoot] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const t = useT();
  const hasZip = files.some((file) => /\.zip$/i.test(file.name));
  const canReplace = hasZip && extract && files.length === 1 && !target.trim();

  const start = async () => {
    setProgress(0);
    let written = 0;
    let skipped = 0;
    try {
      for (const [index, file] of files.entries()) {
        const result = await uploadRepositoryFile(repo, file, {
          path: target.trim().replace(/^\/+|\/+$/g, ""), message, extract: extract && /\.zip$/i.test(file.name), replace: canReplace && replace, stripRoot,
        });
        written += result.written;
        skipped += result.skipped;
        setProgress(index + 1);
      }
      notify(`${t("Repos.uploaded")} ${written}${skipped ? ` · ${t("Repos.skipped")} ${skipped}` : ""}`);
      onDone();
    } catch (reason) {
      notify(errorText(reason));
      setProgress(null);
    }
  };

  return (
    <Modal title="Repos.upload" subtitle="Repos.uploadHint" onClose={progress === null ? onClose : () => undefined}
      footer={<>
        <button className="btn default" type="button" disabled={progress !== null} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={files.length === 0 || tooLarge.length > 0 || progress !== null} onClick={() => void start()}>
          <Icon name="upload" />{progress === null ? <LocalizedText text={"Repos.upload"} /> : <>{progress} / {files.length}</>}
        </button>
      </>}>
      <div className="form-grid two">
        <Field label="Repos.chooseFiles" span={2}>
          <input type="file" multiple onChange={(event) => setFiles([...(event.target.files ?? [])])} />
          {maxBytes ? (
            <small className="repo-upload-limit">
              <LocalizedText text={"Repos.uploadLimit"} /> {formatRepositorySize(maxBytes)} · <LocalizedText text={"Repos.uploadLimitGit"} />
            </small>
          ) : null}
        </Field>
        {tooLarge.length > 0 ? (
          <div className="span-2 repo-upload-too-large" role="alert">
            <strong><LocalizedText text={"Repos.tooLargeUpload"} /></strong>
            <ul>{tooLarge.map((file) => <li key={file.name}>{file.name} · {formatRepositorySize(file.size)}</li>)}</ul>
            <span><LocalizedText text={"Repos.useGitPush"} /></span>
            {cloneUrl ? <code>{`git clone ${cloneUrl}`}</code> : null}
          </div>
        ) : null}
        <Field label="Repos.targetFolder" hint="Repos.targetHint" span={2}>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="src/drivers" />
        </Field>
        <Field label="Repos.message" span={2}>
          <input value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} placeholder={t("Repos.messagePlaceholder")} />
        </Field>
        {hasZip ? (
          <div className="span-2 repo-options">
            <label className="checkbox-row"><input type="checkbox" checked={extract} onChange={(event) => setExtract(event.target.checked)} /><LocalizedText text={"Repos.extract"} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={stripRoot} disabled={!extract} onChange={(event) => setStripRoot(event.target.checked)} /><LocalizedText text={"Repos.stripRoot"} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={canReplace && replace} disabled={!canReplace} onChange={(event) => setReplace(event.target.checked)} /><LocalizedText text={"Repos.replace"} /></label>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function EditRepositoryModal({ detail, notify, onClose, onSaved }: { detail: SourceRepositoryDetail; notify: Notify; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState(detail.description);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await updateSourceRepository(detail.name, { description, ...(project ? { projectId: project.id } : {}) });
      onSaved();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Edit" subtitle={detail.name} onClose={onClose}
      footer={<>
        <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}><Icon name="check" /><LocalizedText text={"Save"} /></button>
      </>}>
      <div className="form-grid two">
        <Field label="Repos.project" hint="Repos.keepProject" span={2}>
          <p className="repo-current-project">{projectLabel(detail.project) || "—"}</p>
          <ProjectPicker value={project} onChange={setProject} />
        </Field>
        <Field label="Repos.description" span={2}>
          <textarea rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** A small, safe README renderer: headings, lists, code blocks, quotes and inline code. Never HTML. */
function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  const inline = (value: string, key: string) => value.split(/(`[^`]+`)/g).map((part, partIndex) => (
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <code key={`${key}-${partIndex}`}>{part.slice(1, -1)}</code>
      : <Fragment key={`${key}-${partIndex}`}>{part.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")}</Fragment>
  ));
  while (index < lines.length) {
    const line = lines[index]!;
    if (/^```/.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index]!)) { code.push(lines[index]!); index += 1; }
      index += 1;
      blocks.push(<pre key={blocks.length} className="repo-md-code">{code.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length + 1, 6);
      const Tag = `h${level}` as "h2";
      blocks.push(<Tag key={blocks.length}>{inline(heading[2]!, `h${index}`)}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index]!)) { items.push(lines[index]!.replace(/^\s*([-*+]|\d+\.)\s+/, "")); index += 1; }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={blocks.length}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, `l${index}-${itemIndex}`)}</li>)}</List>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]!)) { quote.push(lines[index]!.replace(/^>\s?/, "")); index += 1; }
      blocks.push(<blockquote key={blocks.length}>{inline(quote.join(" "), `q${index}`)}</blockquote>);
      continue;
    }
    if (!line.trim()) { index += 1; continue; }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !/^(```|#{1,6}\s|>|\s*([-*+]|\d+\.)\s)/.test(lines[index]!)) { paragraph.push(lines[index]!); index += 1; }
    blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "), `p${index}`)}</p>);
  }
  return <div className="repo-markdown">{blocks}</div>;
}
