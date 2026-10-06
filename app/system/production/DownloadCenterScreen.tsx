"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCenterFile, getDownloadCenter, type DownloadCenterCategory, type DownloadCenterFile } from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Icon, PageHeader, Panel, SearchInput, Toolbar } from "../ui";

type Notify = (message: string) => void;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function matches(file: DownloadCenterFile, category: DownloadCenterCategory, query: string): boolean {
  if (!query) return true;
  const haystack = `${file.title} ${file.name} ${file.description} ${file.version} ${category.title}`.toLocaleLowerCase();
  return haystack.includes(query);
}

/**
 * Department software and files published from the NAS share (download-center folder). Names,
 * titles and descriptions come from the share and are shown as written, never through the
 * dictionary.
 */
export function DownloadCenterScreen({ canManage, notify }: { canManage: boolean; notify: Notify }) {
  const t = useT();
  const { lang } = useLanguage();
  const [categories, setCategories] = useState<DownloadCenterCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDownloadCenter()
      .then((result) => { if (active) { setCategories(result.categories); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [revision]);

  const needle = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => (categories ?? [])
    .map((category) => ({ category, files: category.files.filter((file) => matches(file, category, needle)) }))
    .filter((entry) => entry.files.length > 0), [categories, needle]);
  const total = (categories ?? []).reduce((sum, category) => sum + category.files.length, 0);
  const dateFormat = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric" });

  const download = async (category: DownloadCenterCategory, file: DownloadCenterFile) => {
    const key = `${category.folder}/${file.name}`;
    setDownloading(key);
    try {
      await downloadCenterFile(category.folder, file.name);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="stack download-center">
      <PageHeader title="Download Center" subtitle="Downloads.subtitle"
        actions={<button className="btn default" type="button" onClick={() => { setCategories(null); setRevision((value) => value + 1); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />

      {canManage ? (
        <div className="download-center-note" role="note">
          <Icon name="folder" />
          <span><LocalizedText text={"Downloads.manageHint"} /> <code>IoT Department\IoT Team Center\download-center</code></span>
        </div>
      ) : null}

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Downloads.search" />
        {categories ? <span className="download-center-count">{total} <LocalizedText text={"Downloads.files"} /></span> : null}
      </Toolbar>

      {error ? (
        <Panel><EmptyState icon="alertTriangle" title="Could not load" message={error}
          action={<button className="btn default" type="button" onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} /></Panel>
      ) : categories === null ? (
        <Panel><EmptyState icon="clock" title="Loading…" message="Downloads.loading" /></Panel>
      ) : visible.length === 0 ? (
        <Panel><EmptyState icon="download" title={total === 0 ? "Downloads.emptyTitle" : "Downloads.noMatchTitle"}
          message={total === 0 ? "Downloads.emptyMessage" : "Downloads.noMatchMessage"} /></Panel>
      ) : visible.map(({ category, files }) => (
        <section className="panel" key={category.folder}>
          <div className="panel-head">
            <div>
              <h2>{category.title}</h2>
              {category.description ? <p>{category.description}</p> : null}
            </div>
          </div>
          <div className="panel-body flush">
            <div className="table-wrap">
              <table className="grid download-center-table">
                <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 100 }} /><col style={{ width: 130 }} /><col style={{ width: 150 }} /></colgroup>
                <thead>
                  <tr>
                    <th><LocalizedText text={"Downloads.file"} /></th>
                    <th><LocalizedText text={"Downloads.version"} /></th>
                    <th className="num"><LocalizedText text={"Downloads.size"} /></th>
                    <th><LocalizedText text={"Downloads.updated"} /></th>
                    <th aria-label={t("Downloads.action")} />
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const key = `${category.folder}/${file.name}`;
                    return (
                      <tr key={key}>
                        <td className="wrap">
                          <div className="cell-primary">
                            <strong title={file.title}>{file.title}{file.recommended ? <> <Badge tone="blue"><LocalizedText text={"Downloads.recommended"} /></Badge></> : null}</strong>
                            {file.title !== file.name ? <span title={file.name}>{file.name}</span> : null}
                            {file.description ? <span className="download-center-description">{file.description}</span> : null}
                          </div>
                        </td>
                        <td>{file.version || "—"}</td>
                        <td className="num">{formatSize(file.sizeBytes)}</td>
                        <td>{dateFormat.format(new Date(file.modifiedAt))}</td>
                        <td>
                          <button className="btn primary sm" type="button" disabled={downloading !== null} onClick={() => void download(category, file)}>
                            <Icon name="download" /><LocalizedText text={downloading === key ? "Downloads.downloading" : "Downloads.download"} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
