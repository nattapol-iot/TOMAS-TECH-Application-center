"use client";

import { LocalizedText } from "../LocalizedText";
import { useT as useUiText } from "../i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  acknowledgeKnowledge,
  assignKnowledgeAcknowledgement,
  archiveKnowledgeDocument,
  createKnowledgeArticle,
  createKnowledgeCategory,
  createKnowledgeComment,
  createKnowledgeNumberSequence,
  createKnowledgeDocument,
  decideKnowledgeVersion,
  downloadKnowledgeVersion,
  getKnowledgeDocument,
  getKnowledgeArticle,
  getKnowledgeDashboard,
  grantKnowledgePermission,
  listKnowledgeAudit,
  listKnowledgeArticles,
  listKnowledgeCategories,
  listKnowledgeComments,
  listKnowledgeDocuments,
  listKnowledgeNumberSequences,
  listKnowledgePermissions,
  listMyKnowledgeAcknowledgements,
  linkKnowledgeDocument,
  publishKnowledgeVersion,
  previewKnowledgeVersion,
  restoreKnowledgeDocument,
  revokeKnowledgePermission,
  sendKnowledgeArticleFeedback,
  setKnowledgeCommentResolution,
  setKnowledgeWorkingStatus,
  submitKnowledgeReview,
  uploadKnowledgeVersion,
  updateKnowledgeArticle,
  updateKnowledgeCategory,
  updateKnowledgeNumberSequence,
  unlinkKnowledgeDocument,
  type BootstrapData,
  type KnowledgeAcknowledgement,
  type KnowledgeArticleDetail,
  type KnowledgeArticleRow,
  type KnowledgeAuditEvent,
  type KnowledgeCategory,
  type KnowledgeComment,
  type KnowledgeDocumentDetail,
  type KnowledgeDocumentRow,
  type KnowledgeDashboard,
  type KnowledgeNumberSequence,
  type KnowledgePermission,
} from "../api-client";
import { useT } from "../i18n";
import { SolutionLibrary, useSolutionLibraryLabel } from "../SolutionLibrary";
import {
  Avatar,
  Badge,
  Drawer,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  Pill,
  Progress,
  SearchInput,
  Select,
  TablePageSize,
  Tabs,
  Toolbar,
  toneOf,
} from "../ui";

type KnowledgeProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
};

type HubTab = "solutions" | "register" | "presentations" | "articles" | "shared" | "acknowledgements" | "admin";

const DOCUMENT_TYPE_FILTER = [
  "All types", "Controlled Document", "Working Document", "Knowledge Article",
  "Presentation", "Template", "Project Document", "Supplier Document", "External Reference",
];

const STATUS_FILTER = [
  "All statuses", "Draft", "In Review", "Request Changes", "Pending Approval",
  "Approved", "Published", "Review Due", "Expired", "Superseded", "Archived",
];

const ARTICLE_TYPES = [
  "All article types", "How-to", "Troubleshooting", "FAQ", "Technical Note", "Best Practice",
  "Design Guideline", "Lessons Learned", "Root Cause Analysis", "Training Note",
];


const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

const errorText = (error: unknown) =>
  error instanceof ApiClientError || error instanceof Error ? error.message : "Something went wrong.";

export function ProductionKnowledgeHub({ bootstrap, notify }: KnowledgeProps) {
  const uiText = useUiText();
  const t = useT();
  const solutionLabel = useSolutionLibraryLabel();
  const canView = bootstrap.permissions.includes("knowledge.view");
  const canUpload = bootstrap.permissions.includes("knowledge.upload");
  const canPublish = bootstrap.permissions.includes("knowledge.publish");
  const canArchive = bootstrap.permissions.includes("knowledge.archive");
  const canManagePermissions = bootstrap.permissions.includes("knowledge.manage_permissions");
  const canManageCategories = bootstrap.permissions.includes("knowledge.manage_categories");

  const [tab, setTab] = useState<HubTab>("solutions");
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [rows, setRows] = useState<KnowledgeDocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState("All types");
  const [status, setStatus] = useState("All statuses");
  const [categoryName, setCategoryName] = useState("All categories");
  const [confidentiality, setConfidentiality] = useState("All confidentiality");
  const [language, setLanguage] = useState("All languages");
  const [reviewDue, setReviewDue] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openDocumentId, setOpenDocumentId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [acknowledgements, setAcknowledgements] = useState<KnowledgeAcknowledgement[]>([]);
  const [dashboard, setDashboard] = useState<KnowledgeDashboard | null>(null);

  const categoryOptions = useMemo(
    () => ["All categories", ...categories.map((category) => category.nameEn)],
    [categories]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const selectedCategory = categories.find((category) => category.nameEn === categoryName);
      const result = await listKnowledgeDocuments({
        search: search || undefined,
        documentType: tab === "presentations" ? "Presentation"
          : tab === "register" && documentType !== "All types" ? documentType : undefined,
        status: status === "All statuses" ? undefined : status,
        categoryId: selectedCategory?.id,
        confidentiality: confidentiality === "All confidentiality" ? undefined : confidentiality,
        language: language === "All languages" ? undefined : language,
        reviewDue: reviewDue || undefined,
        includeArchived: status === "Archived" || undefined,
        workspace: tab === "shared" || undefined,
        page,
        pageSize,
      });
      setRows(result.items);
      setTotal(result.total);
      void getKnowledgeDashboard().then(setDashboard).catch(() => undefined);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [canView, categories, categoryName, confidentiality, documentType, language, page, pageSize, reviewDue, search, status, tab]);

  useEffect(() => {
    if (!canView) return;
    void listKnowledgeCategories()
      .then((result) => setCategories(result.items))
      .catch(() => setCategories([]));
    void listMyKnowledgeAcknowledgements()
      .then((result) => setAcknowledgements(result.items))
      .catch(() => setAcknowledgements([]));
    void getKnowledgeDashboard().then(setDashboard).catch(() => setDashboard(null));
  }, [canView]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!canView) {
    return (
      <>
        <PageHeader eyebrow="KNOWLEDGE" title={uiText("Knowledge Hub")} subtitle="Standards, SOP, templates and technical knowledge" />
        <EmptyState
          icon="lock"
          title="No access to the knowledge library"
          message="An administrator must grant the knowledge.view permission to your role."
        />
      </>
    );
  }

  const published = dashboard?.published ?? rows.filter((row) => row.status === "Published").length;
  const inWorkflow = dashboard?.inWorkflow ?? rows.filter((row) => ["In Review", "Pending Approval", "Request Changes"].includes(row.status)).length;
  const needsReview = dashboard ? dashboard.expired + dashboard.reviewDueWithin90Days : rows.filter((row) => row.status === "Review Due" || row.status === "Expired").length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <>
      <PageHeader
        eyebrow="KNOWLEDGE &amp; DOCUMENT HUB"
        title={uiText("Knowledge Hub")}
        subtitle="Controlled standards, templates, presentations and technical knowledge in one register"
        actions={
          <>
            <button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}>
              <Icon name="refresh" />{t("Refresh")}
            </button>
            {canUpload ? (
              <button className="btn primary" type="button" onClick={() => setCreating(true)}>
                <Icon name="plus" />{t("New Document")}
              </button>
            ) : null}
          </>
        }
      />

      <div className="kpi-grid four">
        <KpiCard label="Knowledge documents" value={dashboard?.totalDocuments ?? total} note={t("permission-filtered library")} tone="blue" icon="book" />
        <KpiCard label="Published" value={published} note={t("current revision in force")} tone="green" icon="checkCircle" />
        <KpiCard label="In workflow" value={inWorkflow} note={t("review or approval pending")} tone="amber" icon="clock" />
        <KpiCard
          label="Needs attention"
          value={needsReview}
          note={t("review due or expired")}
          tone={needsReview ? "red" : "green"}
          icon="alertTriangle"
        />
      </div>

      <Tabs
        active={tab}
        onChange={(value) => { setTab(value as HubTab); setPage(1); }}
        tabs={[
          { id: "solutions", label: solutionLabel },
          { id: "register", label: "Standards Register", count: total },
          { id: "presentations", label: "Presentation Library" },
          { id: "articles", label: "Technical Knowledge" },
          { id: "shared", label: "Shared & Project" },
          { id: "acknowledgements", label: "My Acknowledgements", count: acknowledgements.length },
          ...(canManageCategories ? [{ id: "admin", label: "Knowledge Admin" }] : []),
        ]}
      />

      <div style={{ marginTop: 14 }}>
        {tab === "solutions" ? <SolutionLibrary canUpdate={canManageCategories} notify={notify} /> : null}
        {tab === "register" ? (
          <>
            <Toolbar>
              <SearchInput
                value={search}
                onChange={(value) => { setSearch(value); setPage(1); }}
                placeholder="Search document number, title, tag, owner or category…"
              />
              <Select label="Document type" value={documentType}
                onChange={(value) => { setDocumentType(value); setPage(1); }} options={DOCUMENT_TYPE_FILTER} />
              <Select label="Status" value={status}
                onChange={(value) => { setStatus(value); setPage(1); }} options={STATUS_FILTER} />
              <Select label="Category" value={categoryName}
                onChange={(value) => { setCategoryName(value); setPage(1); }} options={categoryOptions} />
              <Select label="Confidentiality" value={confidentiality}
                onChange={(value) => { setConfidentiality(value); setPage(1); }} options={["All confidentiality", "Company", "Department Only", "Project Team Only", "Management Only", "Confidential", "Restricted"]} />
              <Select label="Language" value={language}
                onChange={(value) => { setLanguage(value); setPage(1); }} options={["All languages", "EN", "TH", "JA"]} />
              <label className="check-inline">
                <input type="checkbox" checked={reviewDue}
                  onChange={(event) => { setReviewDue(event.target.checked); setPage(1); }} />
                <span>{t("Review due only")}</span>
              </label>
              <TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
            </Toolbar>

            {error ? (
              <div className="callout error" role="alert">
                <Icon name="alertTriangle" /><span>{error}</span>
                <button className="btn ghost" type="button" onClick={() => { void load(); }}>{t("Retry")}</button>
              </div>
            ) : null}

            <Panel title={t("Standards register")} subtitle={t("One row per document; the revision shown is the current one")} flush>
              {rows.length === 0 && !loading ? (
                <EmptyState
                  icon="book"
                  title="No documents yet"
                  message="Create a standard, SOP or template to start the register."
                  action={canUpload ? (
                    <button className="btn primary" type="button" onClick={() => setCreating(true)}>
                      <Icon name="plus" />{t("New Document")}
                    </button>
                  ) : undefined}
                />
              ) : (
                <div className="table-wrap">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>{t("Document No.")}</th>
                        <th>{t("Title")}</th>
                        <th>{t("Category")}</th>
                        <th>{t("Department")}</th>
                        <th>{t("Owner")}</th>
                        <th>{t("Rev")}</th>
                        <th>{t("Status")}</th>
                        <th>{t("Effective")}</th>
                        <th>{t("Next Review")}</th>
                        <th>{t("Acknowledged")}</th>
                        <th>{t("Updated")}</th>
                        <th aria-label={t("Actions")} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const ackPercent = row.acknowledgementTotal === 0
                          ? null
                          : Math.round((row.acknowledgementDone / row.acknowledgementTotal) * 100);
                        return (
                          <tr key={row.id}>
                            <td className="mono">{row.documentNumber}</td>
                            <td>
                              <button className="link-button" type="button" onClick={() => setOpenDocumentId(row.id)}>
                                {row.title}
                              </button>
                            </td>
                            <td>{row.categoryName}</td>
                            <td>{row.department || "—"}</td>
                            <td><Avatar initials={initialsOf(row.ownerName)} name={row.ownerName} /></td>
                            <td className="mono">{row.currentRevision ?? "—"}</td>
                            <td><Badge tone={toneOf(row.status)}>{t(row.status)}</Badge></td>
                            <td className="mono">{row.effectiveDate ?? "—"}</td>
                            <td className="mono">{row.nextReviewDate ?? "—"}</td>
                            <td style={{ minWidth: 120 }}>
                              {ackPercent === null ? "—" : (
                                <>
                                  <Progress value={ackPercent} tone={ackPercent === 100 ? "green" : "amber"} />
                                  <small>{row.acknowledgementDone}<LocalizedText text={"of"} />{row.acknowledgementTotal}</small>
                                </>
                              )}
                            </td>
                            <td className="mono">{row.updatedAt.slice(0, 10)}</td>
                            <td>
                              <button className="btn ghost sm" type="button" onClick={() => setOpenDocumentId(row.id)}>
                                {t("Open")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {total > 0 ? (
                <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total} onPage={setPage} />
              ) : null}
            </Panel>
          </>
        ) : null}

        {tab === "presentations" ? (
          <PresentationLibrary rows={rows} loading={loading} onOpen={setOpenDocumentId} />
        ) : null}

        {tab === "articles" ? (
          <ArticleLibrary categories={categories} bootstrap={bootstrap} canUpload={canUpload} notify={notify} />
        ) : null}

        {tab === "shared" ? <SharedWorkspace rows={rows} loading={loading} onOpen={setOpenDocumentId} /> : null}

        {tab === "acknowledgements" ? (
          <AcknowledgementList
            items={acknowledgements}
            notify={notify}
            onDone={() => {
              void listMyKnowledgeAcknowledgements()
                .then((result) => setAcknowledgements(result.items))
                .catch(() => undefined);
              void load();
            }}
          />
        ) : null}

        {tab === "admin" && canManageCategories ? (
          <KnowledgeAdmin categories={categories} notify={notify} onChanged={() => {
            void listKnowledgeCategories().then((result) => setCategories(result.items));
          }} />
        ) : null}
      </div>

      {creating ? (
        <CreateDocumentModal
          categories={categories}
          bootstrap={bootstrap}
          onClose={() => setCreating(false)}
          onCreated={(documentNumber, id) => {
            setCreating(false);
            notify(`${documentNumber} created`);
            setOpenDocumentId(id);
            void load();
          }}
        />
      ) : null}

      {openDocumentId !== null ? (
        <DocumentDrawer
          documentId={openDocumentId}
          bootstrap={bootstrap}
          canPublish={canPublish}
          canUpload={canUpload}
          canArchive={canArchive}
          canManagePermissions={canManagePermissions}
          notify={notify}
          onClose={() => setOpenDocumentId(null)}
          onChanged={() => { void load(); }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Presentation library — the same records, presented as cards rather than rows
// because a slide deck is chosen by looking at it, not by reading a table.
// ---------------------------------------------------------------------------
function PresentationLibrary({
  rows, loading, onOpen,
}: { rows: KnowledgeDocumentRow[]; loading: boolean; onOpen: (id: number) => void }) {
  const t = useT();
  const decks = rows.filter((row) => row.documentType === "Presentation");

  if (decks.length === 0 && !loading) {
    return (
      <EmptyState
        icon="play"
        title="No presentations yet"
        message="Upload a company, sales or technical presentation to build the library."
      />
    );
  }

  return (
    <div className="card-grid">
      {decks.map((deck) => (
        <article className="doc-card" key={deck.id}>
          <div className="doc-card-thumb" aria-hidden="true"><Icon name="play" /></div>
          <div className="doc-card-body">
            <p className="doc-card-category">{deck.categoryName}</p>
            <h3>
              <button className="link-button" type="button" onClick={() => onOpen(deck.id)}>{deck.title}</button>
            </h3>
            <p className="doc-card-meta mono">{deck.documentNumber} <LocalizedText text={"·"} /> {deck.currentRevision ?? "—"}</p>
            <div className="doc-card-foot">
              <Badge tone={toneOf(deck.status)}>{t(deck.status)}</Badge>
              <Pill>{deck.language}</Pill>
              <span className="doc-card-owner">{deck.ownerName}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function SharedWorkspace({ rows, loading, onOpen }: {
  rows: KnowledgeDocumentRow[]; loading: boolean; onOpen: (id: number) => void;
}) {
  const t = useT();
  if (rows.length === 0 && !loading) return <EmptyState icon="users" title="No shared documents" message="Working, project and supplier documents shared with you will appear here." />;
  return <Panel title={t("Team shared workspace")} subtitle={t("Working, project and supplier documents visible to you")} flush>
    <div className="table-wrap"><table className="grid"><thead><tr><th>{t("Document No.")}</th><th>{t("Title")}</th><th>{t("Type")}</th><th>{t("Category")}</th><th>{t("Owner")}</th><th>{t("Rev")}</th><th>{t("Status")}</th><th>{t("Updated")}</th><th /></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}><td className="mono">{row.documentNumber}</td><td><button className="link-button" type="button" onClick={() => onOpen(row.id)}>{row.title}</button></td><td>{row.documentType}</td><td>{row.categoryName}</td><td><Avatar initials={initialsOf(row.ownerName)} name={row.ownerName} /></td><td className="mono">{row.currentRevision}</td><td><Badge tone={toneOf(row.status)}>{row.status}</Badge></td><td className="mono">{row.updatedAt.slice(0, 10)}</td><td><button className="btn ghost sm" type="button" onClick={() => onOpen(row.id)}>{t("Open")}</button></td></tr>)}</tbody></table></div>
  </Panel>;
}

// ---------------------------------------------------------------------------
// Read acknowledgement
// ---------------------------------------------------------------------------
function AcknowledgementList({
  items, notify, onDone,
}: { items: KnowledgeAcknowledgement[]; notify: (message: string) => void; onDone: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(0);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="checkCircle"
        title="Nothing waiting for you"
        message="Standards assigned to you for reading will appear here until you confirm them."
      />
    );
  }

  return (
    <Panel title={t("Documents requiring your acknowledgement")} subtitle={t("Confirming records that you have read this exact revision")} flush>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{t("Document No.")}</th>
              <th>{t("Title")}</th>
              <th>{t("Rev")}</th>
              <th>{t("Assigned")}</th>
              <th>{t("Due")}</th>
              <th aria-label={t("Actions")} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.documentNumber}</td>
                <td>{item.title}</td>
                <td className="mono">{item.revision}</td>
                <td className="mono">{item.assignedAt.slice(0, 10)}</td>
                <td className="mono">
                  {item.dueAt ?? "—"}
                  {item.overdue ? <Badge tone="red">{t("Overdue")}</Badge> : null}
                </td>
                <td>
                  <button
                    className="btn primary sm"
                    type="button"
                    disabled={busy === item.id}
                    onClick={async () => {
                      setBusy(item.id);
                      try {
                        await acknowledgeKnowledge(item.id);
                        notify(`${item.documentNumber} acknowledged`);
                        onDone();
                      } catch (error) {
                        notify(errorText(error));
                      } finally {
                        setBusy(0);
                      }
                    }}
                  >
                    <Icon name="check" />{t("I have read this")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
function ArticleLibrary({
  categories, bootstrap, canUpload, notify,
}: {
  categories: KnowledgeCategory[];
  bootstrap: BootstrapData;
  canUpload: boolean;
  notify: (message: string) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<KnowledgeArticleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [articleType, setArticleType] = useState("All article types");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listKnowledgeArticles({
        search: search || undefined,
        articleType: articleType === "All article types" ? undefined : articleType,
        page, pageSize,
      });
      setItems(result.items); setTotal(result.total);
    } catch (error) { notify(errorText(error)); }
    finally { setLoading(false); }
  }, [articleType, notify, page, pageSize, search]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="stack">
      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search how-to, troubleshooting, lessons learned…" />
        <Select label="Article type" value={articleType} options={ARTICLE_TYPES} onChange={(value) => { setArticleType(value); setPage(1); }} />
        <TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
        {canUpload ? <button className="btn primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" />{t("New article")}</button> : null}
      </Toolbar>
      <Panel title={t("Technical knowledge")} subtitle={t("How-to, troubleshooting, best practices and lessons learned")} flush>
        {items.length === 0 && !loading ? <EmptyState icon="book" title="No knowledge article found" message="Create the first technical article for the team." /> : (
          <div className="table-wrap"><table className="grid"><thead><tr><th>{t("Title")}</th><th>{t("Type")}</th><th>{t("Category")}</th><th>{t("Owner")}</th><th>{t("Status")}</th><th>{t("Helpful")}</th><th>{t("Views")}</th><th>{t("Updated")}</th><th /></tr></thead>
            <tbody>{items.map((article) => <tr key={article.id}><td><button className="link-button" type="button" onClick={() => setOpenId(article.id)}>{article.title}</button><div className="muted">{article.summary}</div></td>
              <td>{article.articleType}</td><td>{article.categoryName}</td><td><Avatar initials={initialsOf(article.ownerName)} name={article.ownerName} /></td>
              <td><Badge tone={toneOf(article.status)}>{article.status}</Badge></td><td>{article.helpfulCount}<LocalizedText text={"of"} />{article.helpfulCount + article.notHelpfulCount}</td>
              <td>{article.viewCount}</td><td className="mono">{article.updatedAt.slice(0, 10)}</td><td><button className="btn ghost sm" type="button" onClick={() => setOpenId(article.id)}>{t("Open")}</button></td></tr>)}</tbody></table></div>
        )}
        {total > 0 ? <Pagination page={page} pageCount={pageCount} from={(page - 1) * pageSize + 1} to={Math.min(page * pageSize, total)} total={total} onPage={setPage} /> : null}
      </Panel>
      {creating ? <ArticleEditorModal categories={categories} bootstrap={bootstrap} onClose={() => setCreating(false)} onSaved={(id) => {
        setCreating(false); setOpenId(id); notify("Knowledge article created"); void load();
      }} /> : null}
      {openId !== null ? <ArticleDrawer articleId={openId} categories={categories} bootstrap={bootstrap} canEdit={bootstrap.permissions.includes("knowledge.edit")}
        notify={notify} onClose={() => setOpenId(null)} onChanged={() => { void load(); }} /> : null}
    </div>
  );
}

function ArticleEditorModal({ categories, bootstrap, article, onClose, onSaved }: {
  categories: KnowledgeCategory[];
  bootstrap: BootstrapData;
  article?: KnowledgeArticleDetail;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(article?.title ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [articleType, setArticleType] = useState(article?.articleType ?? "Technical Note");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? categories[0]?.id ?? 0);
  const [status, setStatus] = useState(article?.status ?? "Draft");
  const [confidentiality, setConfidentiality] = useState(article?.confidentiality ?? "Company");
  const [language, setLanguage] = useState(article?.language ?? "EN");
  const [tags, setTags] = useState(article?.tags ?? "");
  const [reviewDate, setReviewDate] = useState(article?.reviewDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!title.trim() || !content.trim() || !categoryId) { setError("Title, content and category are required."); return; }
    setBusy(true); setError("");
    const input = { title: title.trim(), summary: summary.trim(), content: content.trim(), articleType, categoryId,
      ownerId: article?.ownerId ?? bootstrap.user.id, status, confidentiality, language, tags: tags.trim(), reviewDate: reviewDate || undefined };
    try {
      if (article) { await updateKnowledgeArticle(article.id, input); onSaved(article.id); }
      else { const created = await createKnowledgeArticle(input); onSaved(created.id); }
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={article ? t("Edit knowledge article") : t("New knowledge article")} subtitle={t("Content is stored as safe plain text/Markdown; HTML is never injected")}
    onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}>{t("Cancel")}</button><button className="btn primary" type="button" disabled={busy} onClick={() => { void save(); }}>{busy ? t("Saving…") : t("Save article")}</button></>}>
    {error ? <div className="callout error" role="alert">{error}</div> : null}
    <div className="form-grid">
      <Field label={t("Title")} span={2}><input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label={t("Article type")}><select value={articleType} onChange={(event) => setArticleType(event.target.value)}>{ARTICLE_TYPES.slice(1).map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={t("Category")}><select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameEn}</option>)}</select></Field>
      <Field label={t("Summary")} span={2}><textarea rows={2} value={summary} maxLength={1000} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Field label={t("Content")} span={2} hint={t("Headings, lists, links, tables and code blocks can be written in Markdown")}><textarea rows={14} value={content} onChange={(event) => setContent(event.target.value)} /></Field>
      <Field label={t("Status")}><select value={status} onChange={(event) => setStatus(event.target.value)}>{["Draft", "In Review", "Published", "Archived"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={t("Confidentiality")}><select value={confidentiality} onChange={(event) => setConfidentiality(event.target.value)}>{["Company", "Department Only", "Project Team Only", "Management Only", "Confidential", "Restricted"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={t("Language")}><select value={language} onChange={(event) => setLanguage(event.target.value)}>{["EN", "TH", "JA"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={t("Review date")}><input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /></Field>
      <Field label={t("Tags")} span={2}><input value={tags} maxLength={500} onChange={(event) => setTags(event.target.value)} /></Field>
    </div>
  </Modal>;
}

function ArticleDrawer({ articleId, categories, bootstrap, canEdit, notify, onClose, onChanged }: {
  articleId: number; categories: KnowledgeCategory[]; bootstrap: BootstrapData; canEdit: boolean;
  notify: (message: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const t = useT();
  const [article, setArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const reload = useCallback(() => { void getKnowledgeArticle(articleId).then(setArticle).catch((error) => notify(errorText(error))); }, [articleId, notify]);
  useEffect(() => { const timer = window.setTimeout(reload, 0); return () => window.clearTimeout(timer); }, [reload]);
  if (!article) return <Drawer title={t("Loading…")} onClose={onClose}><span className="spinner" /></Drawer>;
  return <>
    <Drawer title={article.title} subtitle={`${article.articleType} · ${article.categoryName}`} onClose={onClose} width={760}
      footer={<><button className="btn ghost" type="button" onClick={onClose}>{t("Close")}</button>{canEdit && (article.ownerId === bootstrap.user.id || bootstrap.permissions.includes("knowledge.manage_permissions")) ? <button className="btn primary" type="button" onClick={() => setEditing(true)}><Icon name="edit" />{t("Edit")}</button> : null}</>}>
      <div className="drawer-meta"><Badge tone={toneOf(article.status)}>{article.status}</Badge><Pill>{article.language}</Pill><Pill>{article.confidentiality}</Pill><span>{article.ownerName}</span></div>
      {article.summary ? <p className="lead">{article.summary}</p> : null}
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65 }}>{article.content}</pre>
      <div className="button-row">
        <span>{t("Was this helpful?")}</span>
        <button className="btn ghost sm" type="button" onClick={async () => { try { await sendKnowledgeArticleFeedback(article.id, true); notify("Thank you for the feedback"); reload(); } catch (error) { notify(errorText(error)); } }}>👍 {article.helpfulCount}</button>
        <button className="btn ghost sm" type="button" onClick={async () => { try { await sendKnowledgeArticleFeedback(article.id, false); notify("Feedback recorded"); reload(); } catch (error) { notify(errorText(error)); } }}>👎 {article.notHelpfulCount}</button>
      </div>
    </Drawer>
    {editing ? <ArticleEditorModal categories={categories} bootstrap={bootstrap} article={article} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); notify("Article updated"); reload(); onChanged(); }} /> : null}
  </>;
}

function KnowledgeAdmin({ categories: activeCategories, notify, onChanged }: {
  categories: KnowledgeCategory[]; notify: (message: string) => void; onChanged: () => void;
}) {
  const t = useT();
  const [categories, setCategories] = useState<KnowledgeCategory[]>(activeCategories);
  const [sequences, setSequences] = useState<KnowledgeNumberSequence[]>([]);
  const [categoryEditor, setCategoryEditor] = useState<KnowledgeCategory | "new" | null>(null);
  const [sequenceEditor, setSequenceEditor] = useState<KnowledgeNumberSequence | "new" | null>(null);
  const load = useCallback(async () => {
    try {
      const [categoryResult, sequenceResult] = await Promise.all([listKnowledgeCategories(true), listKnowledgeNumberSequences()]);
      setCategories(categoryResult.items); setSequences(sequenceResult.items);
    } catch (error) { notify(errorText(error)); }
  }, [notify]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  return <div className="stack">
    <Panel title={t("Category administration")} subtitle={t("Maintain hierarchy, display order, defaults and availability")} actions={<button className="btn primary" type="button" onClick={() => setCategoryEditor("new")}><Icon name="plus" />{t("New category")}</button>} flush>
      <div className="table-wrap"><table className="grid"><thead><tr><th>{t("Order")}</th><th>{t("Code")}</th><th>{t("Category")}</th><th>{t("Parent")}</th><th>{t("Default type")}</th><th>{t("Documents")}</th><th>{t("Status")}</th><th /></tr></thead>
        <tbody>{categories.map((category) => <tr key={category.id}><td>{category.sortOrder}</td><td className="mono">{category.code}</td><td>{category.nameEn}<div className="muted">{category.nameTh || category.nameJa}</div></td>
          <td>{categories.find((item) => item.id === category.parentId)?.nameEn ?? "—"}</td><td>{category.defaultDocumentType ?? "—"}</td><td>{category.documentCount}</td>
          <td><Badge tone={category.isActive ? "green" : "slate"}>{category.isActive ? t("Active") : t("Inactive")}</Badge></td><td><button className="btn ghost sm" type="button" onClick={() => setCategoryEditor(category)}><Icon name="edit" />{t("Edit")}</button></td></tr>)}</tbody></table></div>
    </Panel>
    <Panel title={t("Document number sequences")} subtitle={t("Concurrency-safe prefix and scope counters; existing counters can only move forward")} actions={<button className="btn primary" type="button" onClick={() => setSequenceEditor("new")}><Icon name="plus" />{t("New sequence")}</button>} flush>
      <div className="table-wrap"><table className="grid"><thead><tr><th>{t("Prefix")}</th><th>{t("Scope")}</th><th>{t("Description")}</th><th>{t("Last number")}</th><th>{t("Padding")}</th><th>{t("Status")}</th><th /></tr></thead>
        <tbody>{sequences.map((sequence) => <tr key={sequence.id}><td className="mono">{sequence.prefix}</td><td className="mono">{sequence.scopeCode}</td><td>{sequence.scopeName}</td><td className="mono">{sequence.lastNumber}</td><td>{sequence.padding}</td>
          <td><Badge tone={sequence.isActive ? "green" : "slate"}>{sequence.isActive ? t("Active") : t("Inactive")}</Badge></td><td><button className="btn ghost sm" type="button" onClick={() => setSequenceEditor(sequence)}><Icon name="edit" />{t("Edit")}</button></td></tr>)}</tbody></table></div>
    </Panel>
    {categoryEditor ? <CategoryEditorModal category={categoryEditor === "new" ? undefined : categoryEditor} categories={categories} onClose={() => setCategoryEditor(null)} onSaved={() => { setCategoryEditor(null); notify("Category saved"); void load(); onChanged(); }} /> : null}
    {sequenceEditor ? <SequenceEditorModal sequence={sequenceEditor === "new" ? undefined : sequenceEditor} onClose={() => setSequenceEditor(null)} onSaved={() => { setSequenceEditor(null); notify("Number sequence saved"); void load(); }} /> : null}
  </div>;
}

function CategoryEditorModal({ category, categories, onClose, onSaved }: {
  category?: KnowledgeCategory; categories: KnowledgeCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState(category?.code ?? "");
  const [nameEn, setNameEn] = useState(category?.nameEn ?? "");
  const [nameTh, setNameTh] = useState(category?.nameTh ?? "");
  const [nameJa, setNameJa] = useState(category?.nameJa ?? "");
  const [parentId, setParentId] = useState(category?.parentId ?? 0);
  const [documentType, setDocumentType] = useState(category?.defaultDocumentType ?? "");
  const [confidentiality, setConfidentiality] = useState(category?.defaultConfidentiality ?? "Company");
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 100);
  const [active, setActive] = useState(category?.isActive ?? true);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      const input = { parentId: parentId || undefined, code: code.trim().toUpperCase(), nameEn: nameEn.trim(), nameTh: nameTh.trim(), nameJa: nameJa.trim(),
        defaultDocumentType: documentType || undefined, defaultConfidentiality: confidentiality, sortOrder, isActive: active };
      if (category) await updateKnowledgeCategory(category.id, input); else await createKnowledgeCategory(input);
      onSaved();
    } catch (requestError) { setError(errorText(requestError)); }
  };
  return <Modal title={category ? t("Edit category") : t("New category")} onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}>{t("Cancel")}</button><button className="btn primary" type="button" onClick={() => { void save(); }}>{t("Save")}</button></>}>
    {error ? <div className="callout error">{error}</div> : null}<div className="form-grid">
      <Field label={t("Code")}><input value={code} maxLength={40} onChange={(event) => setCode(event.target.value)} /></Field>
      <Field label={t("Display order")}><input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></Field>
      <Field label={t("English name")} span={2}><input value={nameEn} maxLength={200} onChange={(event) => setNameEn(event.target.value)} /></Field>
      <Field label={t("Thai name")}><input value={nameTh} maxLength={200} onChange={(event) => setNameTh(event.target.value)} /></Field>
      <Field label={t("Japanese name")}><input value={nameJa} maxLength={200} onChange={(event) => setNameJa(event.target.value)} /></Field>
      <Field label={t("Parent category")}><select value={parentId} onChange={(event) => setParentId(Number(event.target.value))}><option value={0}>—</option>{categories.filter((item) => item.id !== category?.id).map((item) => <option key={item.id} value={item.id}>{item.nameEn}</option>)}</select></Field>
      <Field label={t("Default document type")}><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="">—</option>{DOCUMENT_TYPE_FILTER.slice(1).map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label={t("Default confidentiality")}><select value={confidentiality} onChange={(event) => setConfidentiality(event.target.value)}>{["Company", "Department Only", "Project Team Only", "Management Only", "Confidential", "Restricted"].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label={t("Availability")}><label className="check-inline"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>{t("Active")}</span></label></Field>
    </div>
  </Modal>;
}

function SequenceEditorModal({ sequence, onClose, onSaved }: {
  sequence?: KnowledgeNumberSequence; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [prefix, setPrefix] = useState(sequence?.prefix ?? "STD");
  const [scopeCode, setScopeCode] = useState(sequence?.scopeCode ?? "EE");
  const [scopeName, setScopeName] = useState(sequence?.scopeName ?? "");
  const [lastNumber, setLastNumber] = useState(sequence?.lastNumber ?? 0);
  const [padding, setPadding] = useState(sequence?.padding ?? 4);
  const [active, setActive] = useState(sequence?.isActive ?? true);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      const input = { prefix: prefix.trim().toUpperCase(), scopeCode: scopeCode.trim().toUpperCase(), scopeName: scopeName.trim(), lastNumber, padding, isActive: active };
      if (sequence) await updateKnowledgeNumberSequence(sequence.id, input); else await createKnowledgeNumberSequence(input);
      onSaved();
    } catch (requestError) { setError(errorText(requestError)); }
  };
  return <Modal title={sequence ? t("Edit number sequence") : t("New number sequence")} subtitle={t("The last number cannot move backwards")} onClose={onClose}
    footer={<><button className="btn ghost" type="button" onClick={onClose}>{t("Cancel")}</button><button className="btn primary" type="button" onClick={() => { void save(); }}>{t("Save")}</button></>}>
    {error ? <div className="callout error">{error}</div> : null}<div className="form-grid">
      <Field label={t("Prefix")}><input value={prefix} disabled={Boolean(sequence)} maxLength={10} onChange={(event) => setPrefix(event.target.value)} /></Field>
      <Field label={t("Scope code")}><input value={scopeCode} disabled={Boolean(sequence)} maxLength={20} onChange={(event) => setScopeCode(event.target.value)} /></Field>
      <Field label={t("Scope description")} span={2}><input value={scopeName} maxLength={200} onChange={(event) => setScopeName(event.target.value)} /></Field>
      <Field label={t("Last number")}><input type="number" min={sequence?.lastNumber ?? 0} max={999999} value={lastNumber} onChange={(event) => setLastNumber(Number(event.target.value))} /></Field>
      <Field label={t("Padding")}><input type="number" min={3} max={6} value={padding} onChange={(event) => setPadding(Number(event.target.value))} /></Field>
      <Field label={t("Availability")}><label className="check-inline"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>{t("Active")}</span></label></Field>
    </div>
  </Modal>;
}

function CreateDocumentModal({
  categories, bootstrap, onClose, onCreated,
}: {
  categories: KnowledgeCategory[];
  bootstrap: BootstrapData;
  onClose: () => void;
  onCreated: (documentNumber: string, id: number) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("Controlled Document");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 0);
  const [prefix, setPrefix] = useState("STD");
  const [scope, setScope] = useState("EE");
  const [confidentiality, setConfidentiality] = useState("Company");
  const [language, setLanguage] = useState("EN");
  const [nextReviewDate, setNextReviewDate] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requiresReviewDate = documentType === "Controlled Document";

  const submit = async () => {
    setError("");
    if (!title.trim()) { setError("A title is required."); return; }
    if (!categoryId) { setError("A category is required."); return; }
    if (requiresReviewDate && !nextReviewDate) {
      setError("A controlled document needs a next review date.");
      return;
    }
    setBusy(true);
    try {
      const created = await createKnowledgeDocument({
        title: title.trim(),
        documentType,
        categoryId,
        numberPrefix: prefix.trim(),
        numberScope: scope.trim(),
        confidentiality,
        language,
        department: bootstrap.user.department,
        tags: tags.trim() || undefined,
        nextReviewDate: nextReviewDate || undefined,
        file: file ?? undefined,
      });
      onCreated(created.documentNumber, created.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("New document")}
      subtitle={t("The document number is issued by the server when you create it")}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => { void submit(); }}>
            {busy ? t("Creating…") : t("Create document")}
          </button>
        </>
      }
    >
      {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
      <div className="form-grid">
        <Field label={t("Title")} span={2}>
          <input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label={t("Document type")}>
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
            {DOCUMENT_TYPE_FILTER.slice(1).map((option) => <option key={option} value={option}>{t(option)}</option>)}
          </select>
        </Field>
        <Field label={t("Category")}>
          <select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.nameEn}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Number prefix")} hint={t("STD, SOP, WI, TMP, PRS, KB, LL")}>
          <input value={prefix} maxLength={10} onChange={(event) => setPrefix(event.target.value.toUpperCase())} />
        </Field>
        <Field label={t("Number scope")} hint={t("Department segment, e.g. EE, ME, SW, PR")}>
          <input value={scope} maxLength={20} onChange={(event) => setScope(event.target.value.toUpperCase())} />
        </Field>
        <Field label={t("Confidentiality")}>
          <select value={confidentiality} onChange={(event) => setConfidentiality(event.target.value)}>
            {["Company", "Department Only", "Project Team Only", "Management Only", "Confidential", "Restricted"]
              .map((option) => <option key={option} value={option}>{t(option)}</option>)}
          </select>
        </Field>
        <Field label={t("Language")}>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {["EN", "TH", "JA"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field
          label={t("Next review date")}
          hint={requiresReviewDate ? t("Required for a controlled document") : t("Optional")}
        >
          <input type="date" value={nextReviewDate} onChange={(event) => setNextReviewDate(event.target.value)} />
        </Field>
        <Field label={t("Tags")} span={2} hint={t("Separate with semicolons")}>
          <input value={tags} maxLength={500} onChange={(event) => setTags(event.target.value)} />
        </Field>
        <Field label={t("File")} span={2} hint={t("Optional. PDF, Word, Excel, PowerPoint, text, CSV, PNG or JPG")}>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer: revisions, workflow, related records and audit
// ---------------------------------------------------------------------------
function DocumentDrawer({
  documentId, bootstrap, canPublish, canUpload, canArchive, canManagePermissions, notify, onClose, onChanged,
}: {
  documentId: number;
  bootstrap: BootstrapData;
  canPublish: boolean;
  canUpload: boolean;
  canArchive: boolean;
  canManagePermissions: boolean;
  notify: (message: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [detail, setDetail] = useState<KnowledgeDocumentDetail | null>(null);
  const [audit, setAudit] = useState<KnowledgeAuditEvent[]>([]);
  const [tab, setTab] = useState<"overview" | "revisions" | "related" | "comments" | "access" | "audit">("overview");
  const [comments, setComments] = useState<KnowledgeComment[]>([]);
  const [permissions, setPermissions] = useState<KnowledgePermission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setDetail(await getKnowledgeDocument(documentId));
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }, [documentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  useEffect(() => {
    if (tab !== "audit") return;
    void listKnowledgeAudit(documentId).then((result) => setAudit(result.items)).catch(() => setAudit([]));
  }, [tab, documentId]);
  useEffect(() => {
    if (tab !== "comments") return;
    void listKnowledgeComments(documentId).then((result) => setComments(result.items)).catch(() => setComments([]));
  }, [tab, documentId]);
  useEffect(() => {
    if (tab !== "access" || !canManagePermissions) return;
    void listKnowledgePermissions(documentId).then((result) => setPermissions(result.items)).catch(() => setPermissions([]));
  }, [tab, documentId, canManagePermissions]);

  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
      notify(message);
      await reload();
      onChanged();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  };

  if (!detail) {
    return (
      <Drawer title={t("Loading…")} onClose={onClose}>
        <p>{error || t("Loading document…")}</p>
      </Drawer>
    );
  }

  const document = detail.document;
  const latest = detail.versions[0];
  const publishedVersion = detail.versions.find((version) => version.status === "Published");
  const myPendingStep = detail.approvals.find(
    (step) => step.status === "Pending" && step.approverId === bootstrap.user.id);
  const workingNext: Array<"Shared" | "Editing" | "Final"> = document.documentType !== "Working Document" ? []
    : document.workflowStatus === "Draft" ? ["Shared"]
      : document.workflowStatus === "Shared" ? ["Editing", "Final"]
        : document.workflowStatus === "Editing" ? ["Shared", "Final"] : [];

  return (
    <Drawer
      title={document.title}
      subtitle={`${document.documentNumber} · ${document.categoryName}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>{t("Close")}</button>
          {latest?.fileName ? (
            <>
              {latest.mimeType && (latest.mimeType === "application/pdf" || latest.mimeType.startsWith("image/") || latest.mimeType.startsWith("text/")) ? (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => { void previewKnowledgeVersion(latest.id).catch((e) => notify(errorText(e))); }}><Icon name="eye" />{t("Preview")}</button>
              ) : null}
              <button className="btn ghost" type="button" disabled={busy}
                onClick={() => { void downloadKnowledgeVersion(latest.id).catch((e) => notify(errorText(e))); }}>
                <Icon name="download" />{t("Download")}
              </button>
            </>
          ) : null}
          {myPendingStep ? (
            <>
              <button className="btn ghost" type="button" disabled={busy}
                onClick={() => {
                  const comment = window.prompt(t("Why are changes needed?")) ?? "";
                  if (!comment.trim()) return;
                  void act(() => decideKnowledgeVersion(myPendingStep.versionId,
                    { decision: "Request Changes", comment }), "Changes requested");
                }}>
                {t("Request changes")}
              </button>
              <button className="btn primary" type="button" disabled={busy}
                onClick={() => void act(
                  () => decideKnowledgeVersion(myPendingStep.versionId, { decision: "Approved" }),
                  myPendingStep.stepType === "Approve" ? "Approved" : "Review complete")}>
                <Icon name="check" />
                {myPendingStep.stepType === "Approve" ? t("Approve") : t("Complete review")}
              </button>
            </>
          ) : null}
          {canPublish && latest?.status === "Approved" ? (
            <button className="btn primary" type="button" disabled={busy}
              onClick={() => void act(() => publishKnowledgeVersion(latest.id, {}), "Published")}>
              <Icon name="send" />{t("Publish")}
            </button>
          ) : null}
          {canUpload ? workingNext.map((status) => (
            <button key={status} className={status === "Final" ? "btn primary" : "btn ghost"} type="button" disabled={busy}
              onClick={() => void act(() => setKnowledgeWorkingStatus(documentId, status), `Working document moved to ${status}`)}>
              <Icon name={status === "Final" ? "check" : status === "Editing" ? "edit" : "users"} />{t(status)}
            </button>
          )) : null}
          {canArchive ? (
            <button className="btn ghost" type="button" disabled={busy} onClick={() => {
              const reason = window.prompt(document.archivedAt ? t("Reason for restoring this document") : t("Reason for archiving this document")) ?? "";
              if (!reason.trim()) return;
              void act(
                () => document.archivedAt
                  ? restoreKnowledgeDocument(documentId, reason.trim())
                  : archiveKnowledgeDocument(documentId, reason.trim()),
                document.archivedAt ? "Document restored" : "Document archived");
            }}>
              <Icon name={document.archivedAt ? "refresh" : "folder"} />
              {document.archivedAt ? t("Restore") : t("Archive")}
            </button>
          ) : null}
        </>
      }
    >
      {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}

      {/* Rule 8: an obsolete revision must say so, loudly, wherever it is read. */}
      {document.status === "Superseded" || document.status === "Archived" ? (
        <div className="callout warning" role="status">
          <Icon name="alertTriangle" />
          <span>{t("This document is obsolete. Do not use it as a reference for new work.")}</span>
        </div>
      ) : null}
      {document.status === "Expired" ? (
        <div className="callout error" role="status">
          <Icon name="alertTriangle" />
          <span>{t("This document has passed its expiry date and must not be cited.")}</span>
        </div>
      ) : null}

      <div className="drawer-meta">
        <Badge tone={toneOf(document.status)}>{t(document.status)}</Badge>
        <Pill>{document.documentType}</Pill>
        <Pill>{document.confidentiality}</Pill>
        <Pill>{document.language}</Pill>
      </div>

      <Tabs
        active={tab}
        onChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "revisions", label: "Revisions", count: detail.versions.length },
          { id: "related", label: "Related records", count: detail.relations.length },
          { id: "comments", label: "Comments" },
          ...(canManagePermissions ? [{ id: "access", label: "Access" }] : []),
          { id: "audit", label: "Audit" },
        ]}
      />

      {tab === "overview" ? (
        <div className="detail-grid">
          <div><span>{t("Owner")}</span><strong>{document.ownerName}</strong></div>
          <div><span>{t("Department")}</span><strong>{document.department || "—"}</strong></div>
          <div><span>{t("Current revision")}</span><strong className="mono">{publishedVersion?.revision ?? latest?.revision ?? "—"}</strong></div>
          <div><span>{t("Effective date")}</span><strong className="mono">{publishedVersion?.effectiveDate ?? "—"}</strong></div>
          <div><span>{t("Next review")}</span><strong className="mono">{document.nextReviewDate ?? "—"}</strong></div>
          <div><span>{t("Tags")}</span><strong>{document.tags || "—"}</strong></div>
          {document.description ? (
            <div className="detail-full"><span>{t("Description")}</span><p>{document.description}</p></div>
          ) : null}

          {detail.approvals.length > 0 ? (
            <div className="detail-full">
              <span>{t("Approval route")}</span>
              <ol className="timeline">
                {detail.approvals.map((step) => (
                  <li key={step.id}>
                    <Badge tone={step.status === "Approved" ? "green" : step.status === "Pending" ? "slate" : "amber"}>
                      {t(step.status)}
                    </Badge>
                    <strong>{step.stepType === "Approve" ? t("Approver") : t("Reviewer")}</strong>
                    <span>{step.approverName}</span>
                    {step.comment ? <em>{step.comment}</em> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {canUpload && latest && ["Draft", "Request Changes"].includes(latest.status) ? (
            <div className="detail-full">
              <SubmitForReviewForm
                versionId={latest.id}
                bootstrap={bootstrap}
                busy={busy}
                onSubmit={(input) => act(() => submitKnowledgeReview(latest.id, input), "Submitted for review")}
              />
            </div>
          ) : null}
          {canPublish && publishedVersion ? (
            <div className="detail-full">
              <AcknowledgementAssignment versionId={publishedVersion.id} bootstrap={bootstrap} notify={notify} onChanged={() => { void reload(); onChanged(); }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "revisions" ? (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>{t("Rev")}</th>
                <th>{t("Status")}</th>
                <th>{t("Change")}</th>
                <th>{t("Summary")}</th>
                <th>{t("Effective")}</th>
                <th>{t("By")}</th>
                <th aria-label={t("Actions")} />
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((version) => (
                <tr key={version.id}>
                  <td className="mono">{version.revision}</td>
                  <td><Badge tone={toneOf(version.status)}>{t(version.status)}</Badge></td>
                  <td>{t(version.changeType)}</td>
                  <td>{version.changeSummary}</td>
                  <td className="mono">{version.effectiveDate ?? "—"}</td>
                  <td>{version.createdByName}</td>
                  <td>
                    {version.fileName ? (
                      <button className="btn ghost sm" type="button"
                        onClick={() => { void downloadKnowledgeVersion(version.id).catch((e) => notify(errorText(e))); }}>
                        <Icon name="download" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canUpload ? (
            <UploadRevisionForm
              documentId={documentId}
              busy={busy}
              onUpload={(input) => act(() => uploadKnowledgeVersion(documentId, { ...input, baseVersionId: latest?.id }), "New revision uploaded")}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "related" ? (
        <DocumentRelations documentId={documentId} relations={detail.relations} canEdit={canUpload}
          notify={notify} onChanged={() => { void reload(); onChanged(); }} />
      ) : null}

      {tab === "comments" ? (
        <DocumentComments
          documentId={documentId}
          versionId={latest?.id}
          comments={comments}
          busy={busy}
          onChanged={() => void listKnowledgeComments(documentId).then((result) => setComments(result.items))}
          notify={notify}
        />
      ) : null}

      {tab === "access" && canManagePermissions ? (
        <DocumentPermissions
          documentId={documentId}
          permissions={permissions}
          bootstrap={bootstrap}
          busy={busy}
          onChanged={() => void listKnowledgePermissions(documentId).then((result) => setPermissions(result.items))}
          notify={notify}
        />
      ) : null}

      {tab === "audit" ? (
        audit.length === 0 ? (
          <EmptyState icon="shield" title="No audit events" message="Activity on this document will appear here." />
        ) : (
          <ol className="timeline">
            {audit.map((event) => (
              <li key={event.id}>
                <span className="mono">{event.occurredAt.slice(0, 16).replace("T", " ")}</span>
                <strong>{t(event.action)}</strong>
                <span>{event.actorName} <LocalizedText text={"·"} /> {event.actorRole}</span>
                {event.revision ? <Pill>{event.revision}</Pill> : null}
                {event.reason ? <em>{event.reason}</em> : null}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Drawer>
  );
}

function AcknowledgementAssignment({ versionId, bootstrap, notify, onChanged }: {
  versionId: number; bootstrap: BootstrapData; notify: (message: string) => void; onChanged: () => void;
}) {
  const t = useT();
  const team = bootstrap.team ?? [];
  const [selected, setSelected] = useState<number[]>([]);
  const [dueAt, setDueAt] = useState("");
  return <Panel title={t("Read acknowledgement")} subtitle={t("Assignments are bound to this exact published revision")}>
    <div className="form-grid">
      <Field label={t("Members")} span={2}><div className="check-grid">{team.map((member) => <label className="check-inline" key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span>{member.name}</span></label>)}</div></Field>
      <Field label={t("Due date")}><input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field>
    </div>
    <button className="btn primary" type="button" disabled={selected.length === 0} onClick={async () => {
      try { const result = await assignKnowledgeAcknowledgement(versionId, { userIds: selected, dueAt: dueAt || undefined }); notify(`${result.assigned} acknowledgement assignment(s) added`); setSelected([]); onChanged(); }
      catch (error) { notify(errorText(error)); }
    }}><Icon name="checkCircle" />{t("Assign acknowledgement")}</button>
  </Panel>;
}

function DocumentRelations({ documentId, relations, canEdit, notify, onChanged }: {
  documentId: number; relations: KnowledgeDocumentDetail["relations"]; canEdit: boolean;
  notify: (message: string) => void; onChanged: () => void;
}) {
  const t = useT();
  const [entityType, setEntityType] = useState("Project");
  const [entityId, setEntityId] = useState("");
  const [relationType, setRelationType] = useState("Reference");
  return <div className="stack">
    {canEdit ? <Panel title={t("Link document")} subtitle={t("Link one document to many records without copying the file")}>
      <div className="form-grid">
        <Field label={t("Record type")}><select value={entityType} onChange={(event) => setEntityType(event.target.value)}>{["Inquiry", "Project", "Estimate", "BOM", "PR", "PO", "GoodsReceipt", "MaterialIssue", "ItemMaster", "Supplier", "Customer"].map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label={t("Record ID")}><input type="number" min={1} value={entityId} onChange={(event) => setEntityId(event.target.value)} /></Field>
        <Field label={t("Relation type")}><select value={relationType} onChange={(event) => setRelationType(event.target.value)}>{["Reference", "Attachment", "Deliverable", "Standard Applied", "Supersedes", "Related"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      </div>
      <button className="btn primary" type="button" disabled={!Number(entityId)} onClick={async () => { try { await linkKnowledgeDocument(documentId, { entityType, entityId: Number(entityId), relationType }); setEntityId(""); notify("Document linked"); onChanged(); } catch (error) { notify(errorText(error)); } }}><Icon name="gitBranch" />{t("Link record")}</button>
    </Panel> : null}
    {relations.length === 0 ? <EmptyState icon="gitBranch" title="Not linked yet" message="Link this document to an inquiry, project, estimate, BOM, PR or PO to make it findable from that record." /> : <ul className="link-list">{relations.map((relation) => <li key={relation.id}><Pill>{relation.entityType}</Pill><span className="mono">#{relation.entityId}</span><span>{relation.relationType}</span><small>{relation.createdByName}</small>{canEdit ? <button className="btn ghost sm" type="button" onClick={async () => { try { await unlinkKnowledgeDocument(documentId, relation.id); notify("Document unlinked"); onChanged(); } catch (error) { notify(errorText(error)); } }}><Icon name="trash" /></button> : null}</li>)}</ul>}
  </div>;
}

function DocumentComments({
  documentId, versionId, comments, busy, onChanged, notify,
}: {
  documentId: number;
  versionId?: number;
  comments: KnowledgeComment[];
  busy: boolean;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const t = useT();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<number | undefined>();
  const submit = async () => {
    if (!content.trim()) return;
    try {
      await createKnowledgeComment(documentId, { content: content.trim(), versionId, parentCommentId: replyTo });
      setContent(""); setReplyTo(undefined); notify("Comment added"); onChanged();
    } catch (error) { notify(errorText(error)); }
  };
  return (
    <div className="stack">
      <Panel title={replyTo ? t("Reply to comment") : t("Add comment")} subtitle={t("Comments stay linked to this document revision")}>
        <textarea rows={3} maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)}
          placeholder={t("Write a comment or review note…")} />
        <div className="button-row">
          {replyTo ? <button className="btn ghost" type="button" onClick={() => setReplyTo(undefined)}>{t("Cancel reply")}</button> : null}
          <button className="btn primary" type="button" disabled={busy || !content.trim()} onClick={() => { void submit(); }}>
            <Icon name="send" />{t("Post comment")}
          </button>
        </div>
      </Panel>
      {comments.length === 0 ? <EmptyState icon="quote" title="No comments" message="Review discussions will appear here." /> : (
        <ol className="timeline">
          {comments.map((comment) => (
            <li key={comment.id} style={{ marginLeft: comment.parentCommentId ? 24 : 0 }}>
              <Avatar initials={initialsOf(comment.authorName)} name={comment.authorName} />
              <span className="mono">{comment.createdAt.slice(0, 16).replace("T", " ")}</span>
              {comment.versionId ? <Pill>v#{comment.versionId}</Pill> : null}
              {comment.resolvedAt ? <Badge tone="green">{t("Resolved")}</Badge> : null}
              <p>{comment.content}</p>
              <div className="button-row">
                <button className="btn ghost sm" type="button" onClick={() => setReplyTo(comment.id)}>{t("Reply")}</button>
                <button className="btn ghost sm" type="button" onClick={async () => {
                  try { await setKnowledgeCommentResolution(comment.id, !comment.resolvedAt); onChanged(); }
                  catch (error) { notify(errorText(error)); }
                }}>{comment.resolvedAt ? t("Reopen") : t("Resolve")}</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DocumentPermissions({
  documentId, permissions, bootstrap, busy, onChanged, notify,
}: {
  documentId: number;
  permissions: KnowledgePermission[];
  bootstrap: BootstrapData;
  busy: boolean;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const t = useT();
  const team = bootstrap.team ?? [];
  const [subjectType, setSubjectType] = useState("User");
  const [subjectId, setSubjectId] = useState(team[0]?.id ?? 0);
  const [department, setDepartment] = useState(bootstrap.user.department);
  const [level, setLevel] = useState("View");
  return (
    <div className="stack">
      <Panel title={t("Permission summary")} subtitle={t("Server-side authorization is checked again on every read and download")}>
        <div className="form-grid">
          <Field label={t("Subject type")}>
            <select value={subjectType} onChange={(event) => setSubjectType(event.target.value)}>
              <option value="User">{t("User")}</option><option value="Department">{t("Department")}</option>
              <option value="Project">{t("Project")}</option>
            </select>
          </Field>
          {subjectType === "User" ? <Field label={t("User")}><select value={subjectId} onChange={(event) => setSubjectId(Number(event.target.value))}>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select></Field> : subjectType === "Department" ? <Field label={t("Department")}><input value={department} maxLength={200} onChange={(event) => setDepartment(event.target.value)} /></Field>
            : <Field label={t("Project ID")}><input type="number" min={1} value={subjectId || ""} onChange={(event) => setSubjectId(Number(event.target.value))} /></Field>}
          <Field label={t("Permission level")}><select value={level} onChange={(event) => setLevel(event.target.value)}>
            {["View", "Download", "Comment", "Edit", "Review", "Approve", "Manage"].map((value) => <option key={value}>{value}</option>)}
          </select></Field>
        </div>
        <button className="btn primary" type="button" disabled={busy} onClick={async () => {
          try {
            await grantKnowledgePermission(documentId, {
              subjectType, subjectId: subjectType === "Department" ? undefined : subjectId,
              department: subjectType === "Department" ? department.trim() : undefined, permissionLevel: level,
            }); notify("Permission granted"); onChanged();
          } catch (error) { notify(errorText(error)); }
        }}><Icon name="plus" />{t("Grant access")}</button>
      </Panel>
      <div className="table-wrap"><table className="grid"><thead><tr><th>{t("Subject")}</th><th>{t("Type")}</th><th>{t("Level")}</th><th>{t("Granted by")}</th><th /></tr></thead>
        <tbody>{permissions.map((permission) => <tr key={permission.id}><td>{permission.subjectName || permission.department || `#${permission.subjectId}`}</td>
          <td>{permission.subjectType}</td><td><Badge tone="blue">{permission.permissionLevel}</Badge></td><td>{permission.grantedByName}</td><td>
            <button className="btn ghost sm" type="button" onClick={async () => { try { await revokeKnowledgePermission(documentId, permission.id); notify("Permission revoked"); onChanged(); } catch (error) { notify(errorText(error)); } }}>
              <Icon name="trash" />
            </button></td></tr>)}</tbody></table></div>
    </div>
  );
}

function SubmitForReviewForm({
  versionId, bootstrap, busy, onSubmit,
}: {
  versionId: number;
  bootstrap: BootstrapData;
  busy: boolean;
  onSubmit: (input: { reviewerIds: number[]; approverId: number; comment?: string }) => void;
}) {
  const t = useT();
  const team = bootstrap.team ?? [];
  const others = team.filter((member) => member.id !== bootstrap.user.id);
  const [reviewerId, setReviewerId] = useState(others[0]?.id ?? 0);
  const [approverId, setApproverId] = useState(others[1]?.id ?? others[0]?.id ?? 0);

  if (others.length === 0) {
    return (
      <div className="callout warning" role="status">
        <Icon name="alertTriangle" />
        <span>{t("At least one other team member is needed before this can be submitted, because the author cannot approve their own document.")}</span>
      </div>
    );
  }

  return (
    <Panel title={t("Submit for review")} subtitle={t("The author cannot be the final approver")}>
      <div className="form-grid">
        <Field label={t("Reviewer")}>
          <select value={reviewerId} onChange={(event) => setReviewerId(Number(event.target.value))}>
            {others.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </Field>
        <Field label={t("Approver")}>
          <select value={approverId} onChange={(event) => setApproverId(Number(event.target.value))}>
            {others.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </Field>
      </div>
      <button
        className="btn primary"
        type="button"
        disabled={busy || !reviewerId || !approverId}
        onClick={() => onSubmit({ reviewerIds: [reviewerId], approverId })}
      >
        <Icon name="send" />{t("Submit for review")}
      </button>
      <input type="hidden" value={versionId} readOnly />
    </Panel>
  );
}

function UploadRevisionForm({
  documentId, busy, onUpload,
}: {
  documentId: number;
  busy: boolean;
  onUpload: (input: { file: File; changeSummary: string; changeType: "Major" | "Minor" }) => void;
}) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [changeType, setChangeType] = useState<"Major" | "Minor">("Major");

  return (
    <Panel title={t("Upload a new revision")} subtitle={t("A published revision is never overwritten; this creates the next one")}>
      <div className="form-grid">
        <Field label={t("Change type")}>
          <select value={changeType} onChange={(event) => setChangeType(event.target.value as "Major" | "Minor")}>
            <option value="Major">{t("Major")}</option>
            <option value="Minor">{t("Minor")}</option>
          </select>
        </Field>
        <Field label={t("File")}>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label={t("Change summary")} span={2} hint={t("Required — it becomes part of the revision history")}>
          <input value={summary} maxLength={2000} onChange={(event) => setSummary(event.target.value)} />
        </Field>
      </div>
      <button
        className="btn primary"
        type="button"
        disabled={busy || !file || !summary.trim()}
        onClick={() => file && onUpload({ file, changeSummary: summary.trim(), changeType })}
      >
        <Icon name="upload" />{t("Upload revision")}
      </button>
      <input type="hidden" value={documentId} readOnly />
    </Panel>
  );
}
