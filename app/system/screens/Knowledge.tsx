"use client";

import { LocalizedText } from "../LocalizedText";
import { useT as useUiText } from "../i18n";
import { useMemo, useState } from "react";
import type { ScreenProps } from "../routes";
import { useT } from "../i18n";
import { SolutionLibrary, useSolutionLibraryLabel } from "../SolutionLibrary";
import {
  Avatar,
  Badge,
  Drawer,
  EmptyState,
  Icon,
  KpiCard,
  PageHeader,
  Panel,
  Pill,
  Progress,
  SearchInput,
  Select,
  Tabs,
  Toolbar,
  toneOf,
} from "../ui";

/**
 * Demo Knowledge Hub.
 *
 * The production module at app/system/production/KnowledgeScreens.tsx is the
 * real one — it talks to the API and SQL Server. This screen exists so the
 * /demo prototype shows the same menu and the same shape of workflow on
 * in-file sample data. The dataset lives here rather than in data.ts so the
 * demo library can change without touching the shared demo dataset.
 */

type DemoStatus =
  | "Draft" | "In Review" | "Pending Approval" | "Published"
  | "Review Due" | "Expired" | "Superseded" | "Archived";

type DemoRevision = {
  revision: string;
  status: DemoStatus;
  changeType: "Major" | "Minor";
  changeSummary: string;
  effectiveDate: string | null;
  createdBy: string;
};

type DemoDocument = {
  id: number;
  documentNumber: string;
  title: string;
  documentType: string;
  category: string;
  department: string;
  owner: string;
  approver: string;
  status: DemoStatus;
  language: "EN" | "TH" | "JA";
  confidentiality: string;
  effectiveDate: string | null;
  nextReviewDate: string | null;
  updatedAt: string;
  acknowledgedBy: number;
  assignedTo: number;
  tags: string;
  revisions: DemoRevision[];
  relatedRecords: Array<{ entityType: string; entityNumber: string }>;
};

const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    id: 1,
    documentNumber: "STD-EE-0001",
    title: "Control panel wiring and labelling standard",
    documentType: "Controlled Document",
    category: "Engineering Standard",
    department: "Electrical",
    owner: "K. Wichai",
    approver: "T. Anan",
    status: "Published",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2026-08-03",
    nextReviewDate: "2027-03-31",
    updatedAt: "2026-08-03",
    acknowledgedBy: 11,
    assignedTo: 14,
    tags: "electrical;panel;wiring",
    revisions: [
      { revision: "R01", status: "Published", changeType: "Major", changeSummary: "Added ferrule colour convention and torque table", effectiveDate: "2026-08-03", createdBy: "K. Wichai" },
      { revision: "R00", status: "Superseded", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2025-11-10", createdBy: "K. Wichai" },
    ],
    relatedRecords: [
      { entityType: "Project", entityNumber: "PJ260152" },
      { entityType: "Estimate", entityNumber: "EST-2608-0001" },
    ],
  },
  {
    id: 2,
    documentNumber: "STD-ME-0001",
    title: "Conveyor frame fabrication tolerance standard",
    documentType: "Controlled Document",
    category: "Engineering Standard",
    department: "Mechanical",
    owner: "N. Chai",
    approver: "T. Anan",
    status: "Review Due",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2025-09-01",
    nextReviewDate: "2026-09-01",
    updatedAt: "2025-09-01",
    acknowledgedBy: 9,
    assignedTo: 9,
    tags: "mechanical;fabrication;tolerance",
    revisions: [
      { revision: "R00", status: "Published", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2025-09-01", createdBy: "N. Chai" },
    ],
    relatedRecords: [{ entityType: "BOM", entityNumber: "BOM-2608-0001" }],
  },
  {
    id: 3,
    documentNumber: "SOP-PR-0001",
    title: "Raising and approving a purchase requisition",
    documentType: "Controlled Document",
    category: "Company Standard",
    department: "Purchasing",
    owner: "P. Wong",
    approver: "T. Anan",
    status: "Published",
    language: "TH",
    confidentiality: "Company",
    effectiveDate: "2026-02-01",
    nextReviewDate: "2027-01-31",
    updatedAt: "2026-02-01",
    acknowledgedBy: 14,
    assignedTo: 14,
    tags: "procurement;pr;approval",
    revisions: [
      { revision: "R00", status: "Published", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2026-02-01", createdBy: "P. Wong" },
    ],
    relatedRecords: [{ entityType: "PR", entityNumber: "PR-2608-0001" }],
  },
  {
    id: 4,
    documentNumber: "WI-WH-0001",
    title: "Goods receiving and quarantine work instruction",
    documentType: "Controlled Document",
    category: "Work Instruction",
    department: "Warehouse",
    owner: "K. Somsak",
    approver: "K. Wichai",
    status: "In Review",
    language: "TH",
    confidentiality: "Company",
    effectiveDate: null,
    nextReviewDate: "2027-09-30",
    updatedAt: "2026-08-28",
    acknowledgedBy: 0,
    assignedTo: 0,
    tags: "warehouse;receiving;quarantine",
    revisions: [
      { revision: "R00", status: "In Review", changeType: "Major", changeSummary: "Initial issue", effectiveDate: null, createdBy: "K. Somsak" },
    ],
    relatedRecords: [{ entityType: "GoodsReceipt", entityNumber: "GRN-2608-0012" }],
  },
  {
    id: 5,
    documentNumber: "TMP-QT-0001",
    title: "Standard estimate cost workbook",
    documentType: "Template",
    category: "Estimate Template",
    department: "Engineering",
    owner: "S. Prem",
    approver: "K. Wichai",
    status: "Published",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2026-06-15",
    nextReviewDate: null,
    updatedAt: "2026-06-15",
    acknowledgedBy: 0,
    assignedTo: 0,
    tags: "estimate;template",
    revisions: [
      { revision: "R02", status: "Published", changeType: "Minor", changeSummary: "Added installation cost block", effectiveDate: "2026-06-15", createdBy: "S. Prem" },
      { revision: "R01", status: "Superseded", changeType: "Major", changeSummary: "Split engineering and installation rates", effectiveDate: "2026-01-20", createdBy: "S. Prem" },
      { revision: "R00", status: "Superseded", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2025-07-01", createdBy: "S. Prem" },
    ],
    relatedRecords: [{ entityType: "Estimate", entityNumber: "EST-2608-0001" }],
  },
  {
    id: 6,
    documentNumber: "PRS-TECH-0001",
    title: "WMS and WCS solution overview",
    documentType: "Presentation",
    category: "Technical Presentation",
    department: "Engineering",
    owner: "T. Anan",
    approver: "T. Anan",
    status: "Published",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2026-07-02",
    nextReviewDate: null,
    updatedAt: "2026-07-02",
    acknowledgedBy: 0,
    assignedTo: 0,
    tags: "wms;wcs;presentation",
    revisions: [
      { revision: "R00", status: "Published", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2026-07-02", createdBy: "T. Anan" },
    ],
    relatedRecords: [],
  },
  {
    id: 7,
    documentNumber: "PRS-SALES-0001",
    title: "IoT team capability introduction",
    documentType: "Presentation",
    category: "Training Material",
    department: "Sales",
    owner: "S. Prem",
    approver: "K. Wichai",
    status: "Draft",
    language: "JA",
    confidentiality: "Company",
    effectiveDate: null,
    nextReviewDate: null,
    updatedAt: "2026-08-30",
    acknowledgedBy: 0,
    assignedTo: 0,
    tags: "training;introduction",
    revisions: [
      { revision: "R00", status: "Draft", changeType: "Major", changeSummary: "Initial issue", effectiveDate: null, createdBy: "S. Prem" },
    ],
    relatedRecords: [],
  },
  {
    id: 8,
    documentNumber: "KB-SW-0001",
    title: "KEYENCE scanner interface times out under sustained load",
    documentType: "Knowledge Article",
    category: "Troubleshooting",
    department: "Software",
    owner: "S. Prem",
    approver: "T. Anan",
    status: "Published",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2026-09-01",
    nextReviewDate: "2027-09-01",
    updatedAt: "2026-09-01",
    acknowledgedBy: 0,
    assignedTo: 0,
    tags: "keyence;scanner;timeout",
    revisions: [
      { revision: "R00", status: "Published", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2026-09-01", createdBy: "S. Prem" },
    ],
    relatedRecords: [{ entityType: "Project", entityNumber: "PJ260152" }],
  },
  {
    id: 9,
    documentNumber: "LL-PROJ-0001",
    title: "Commissioning effort is routinely underestimated on multi-CTU sites",
    documentType: "Knowledge Article",
    category: "Lessons Learned",
    department: "Engineering",
    owner: "K. Wichai",
    approver: "T. Anan",
    status: "Published",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2026-08-20",
    nextReviewDate: "2027-08-20",
    updatedAt: "2026-08-20",
    acknowledgedBy: 0,
    assignedTo: 0,
    tags: "lessons-learned;commissioning;estimate",
    revisions: [
      { revision: "R00", status: "Published", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2026-08-20", createdBy: "K. Wichai" },
    ],
    relatedRecords: [{ entityType: "Estimate", entityNumber: "EST-2608-0001" }],
  },
  {
    id: 10,
    documentNumber: "STD-QA-0001",
    title: "Legacy site acceptance checklist",
    documentType: "Controlled Document",
    category: "Safety & Quality",
    department: "Quality",
    owner: "P. Wong",
    approver: "T. Anan",
    status: "Expired",
    language: "EN",
    confidentiality: "Company",
    effectiveDate: "2023-01-05",
    nextReviewDate: "2025-01-05",
    updatedAt: "2023-01-05",
    acknowledgedBy: 6,
    assignedTo: 12,
    tags: "quality;acceptance;legacy",
    revisions: [
      { revision: "R00", status: "Published", changeType: "Major", changeSummary: "Initial issue", effectiveDate: "2023-01-05", createdBy: "P. Wong" },
    ],
    relatedRecords: [],
  },
];

const TYPE_FILTER = [
  "All types", "Controlled Document", "Working Document", "Knowledge Article",
  "Presentation", "Template", "Project Document", "Supplier Document",
];

const STATUS_OPTIONS = [
  "All statuses", "Draft", "In Review", "Pending Approval", "Published",
  "Review Due", "Expired", "Superseded", "Archived",
];

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

export default function KnowledgeHub({ notify }: ScreenProps) {
  const uiText = useUiText();
  const t = useT();
  const solutionLabel = useSolutionLibraryLabel();
  const [tab, setTab] = useState<"solutions" | "register" | "presentations" | "articles">("solutions");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("All types");
  const [status, setStatus] = useState("All statuses");
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => DEMO_DOCUMENTS.filter((document) => {
    const haystack = `${document.documentNumber} ${document.title} ${document.owner} ${document.category} ${document.tags}`.toLowerCase();
    return haystack.includes(search.toLowerCase())
      && (type === "All types" || document.documentType === type)
      && (status === "All statuses" || document.status === status);
  }), [search, status, type]);

  const published = DEMO_DOCUMENTS.filter((document) => document.status === "Published").length;
  const inWorkflow = DEMO_DOCUMENTS.filter((document) => ["In Review", "Pending Approval"].includes(document.status)).length;
  const attention = DEMO_DOCUMENTS.filter((document) => ["Review Due", "Expired"].includes(document.status)).length;
  const open = openId === null ? null : DEMO_DOCUMENTS.find((document) => document.id === openId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="KNOWLEDGE &amp; DOCUMENT HUB"
        title={uiText("Knowledge Hub")}
        subtitle="Controlled standards, templates, presentations and technical knowledge in one register"
        actions={
          <button className="btn primary" type="button" onClick={() => notify(t("The demo library is read-only. Use the production workspace to create a document."))}>
            <Icon name="plus" />{t("New Document")}
          </button>
        }
      />

      <div className="kpi-grid four">
        <KpiCard label="Documents" value={DEMO_DOCUMENTS.length} note={t("in the demo library")} tone="blue" icon="book" />
        <KpiCard label="Published" value={published} note={t("current revision in force")} tone="green" icon="checkCircle" />
        <KpiCard label="In workflow" value={inWorkflow} note={t("review or approval pending")} tone="amber" icon="clock" />
        <KpiCard label="Needs attention" value={attention} note={t("review due or expired")} tone={attention ? "red" : "green"} icon="alertTriangle" />
      </div>

      <Tabs
        active={tab}
        onChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { id: "register", label: "Standards Register", count: rows.length },
          { id: "solutions", label: solutionLabel },
          { id: "presentations", label: "Presentation Library" },
          { id: "articles", label: "Knowledge Base" },
        ]}
      />

      <div style={{ marginTop: 14 }}>
        {tab === "register" ? (
          <>
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} placeholder="Search document number, title, owner or tag…" />
              <Select label="Document type" value={type} onChange={setType} options={TYPE_FILTER} />
              <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </Toolbar>
            <Panel title={t("Standards register")} subtitle={t("One row per document; the revision shown is the current one")} flush>
              {rows.length === 0 ? (
                <EmptyState icon="book" title="No documents match" message="Adjust the search or the filters above." />
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
                        <th aria-label={t("Actions")} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((document) => {
                        const percent = document.assignedTo === 0
                          ? null
                          : Math.round((document.acknowledgedBy / document.assignedTo) * 100);
                        return (
                          <tr key={document.id}>
                            <td className="mono">{document.documentNumber}</td>
                            <td>
                              <button className="link-button" type="button" onClick={() => setOpenId(document.id)}>
                                {document.title}
                              </button>
                            </td>
                            <td>{document.category}</td>
                            <td>{document.department}</td>
                            <td><Avatar initials={initialsOf(document.owner)} name={document.owner} /></td>
                            <td className="mono">{document.revisions[0]?.revision ?? "—"}</td>
                            <td><Badge tone={toneOf(document.status)}>{t(document.status)}</Badge></td>
                            <td className="mono">{document.effectiveDate ?? "—"}</td>
                            <td className="mono">{document.nextReviewDate ?? "—"}</td>
                            <td style={{ minWidth: 120 }}>
                              {percent === null ? "—" : (
                                <>
                                  <Progress value={percent} tone={percent === 100 ? "green" : "amber"} />
                                  <small>{document.acknowledgedBy}<LocalizedText text={"of"} />{document.assignedTo}</small>
                                </>
                              )}
                            </td>
                            <td>
                              <button className="btn ghost sm" type="button" onClick={() => setOpenId(document.id)}>{t("Open")}</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        ) : null}

        {tab === "solutions" ? <SolutionLibrary /> : null}
        {tab === "presentations" ? (
          <div className="card-grid">
            {DEMO_DOCUMENTS.filter((document) => document.documentType === "Presentation").map((deck) => (
              <article className="doc-card" key={deck.id}>
                <div className="doc-card-thumb" aria-hidden="true"><Icon name="play" /></div>
                <div className="doc-card-body">
                  <p className="doc-card-category">{deck.category}</p>
                  <h3>
                    <button className="link-button" type="button" onClick={() => setOpenId(deck.id)}>{deck.title}</button>
                  </h3>
                  <p className="doc-card-meta mono">{deck.documentNumber} <LocalizedText text={"·"} /> {deck.revisions[0]?.revision}</p>
                  <div className="doc-card-foot">
                    <Badge tone={toneOf(deck.status)}>{t(deck.status)}</Badge>
                    <Pill>{deck.language}</Pill>
                    <span className="doc-card-owner">{deck.owner}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "articles" ? (
          <Panel title={t("Knowledge base")} subtitle={t("Troubleshooting notes, best practice and lessons learned")} flush>
            <ul className="link-list">
              {DEMO_DOCUMENTS.filter((document) => document.documentType === "Knowledge Article").map((article) => (
                <li key={article.id}>
                  <Pill>{article.category}</Pill>
                  <button className="link-button" type="button" onClick={() => setOpenId(article.id)}>{article.title}</button>
                  <span className="mono">{article.documentNumber}</span>
                  <small>{article.owner}</small>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>

      {open ? (
        <Drawer
          title={open.title}
          subtitle={`${open.documentNumber} · ${open.category}`}
          onClose={() => setOpenId(null)}
          width={680}
          footer={<button className="btn ghost" type="button" onClick={() => setOpenId(null)}>{t("Close")}</button>}
        >
          {open.status === "Superseded" || open.status === "Archived" ? (
            <div className="callout warning" role="status">
              <Icon name="alertTriangle" />
              <span>{t("This document is obsolete. Do not use it as a reference for new work.")}</span>
            </div>
          ) : null}
          {open.status === "Expired" ? (
            <div className="callout error" role="status">
              <Icon name="alertTriangle" />
              <span>{t("This document has passed its expiry date and must not be cited.")}</span>
            </div>
          ) : null}

          <div className="drawer-meta">
            <Badge tone={toneOf(open.status)}>{t(open.status)}</Badge>
            <Pill>{open.documentType}</Pill>
            <Pill>{open.confidentiality}</Pill>
            <Pill>{open.language}</Pill>
          </div>

          <div className="detail-grid">
            <div><span>{t("Owner")}</span><strong>{open.owner}</strong></div>
            <div><span>{t("Approver")}</span><strong>{open.approver}</strong></div>
            <div><span>{t("Department")}</span><strong>{open.department}</strong></div>
            <div><span>{t("Effective date")}</span><strong className="mono">{open.effectiveDate ?? "—"}</strong></div>
            <div><span>{t("Next review")}</span><strong className="mono">{open.nextReviewDate ?? "—"}</strong></div>
            <div><span>{t("Tags")}</span><strong>{open.tags}</strong></div>
          </div>

          <Panel title={t("Revision history")} flush>
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
                  </tr>
                </thead>
                <tbody>
                  {open.revisions.map((revision) => (
                    <tr key={revision.revision}>
                      <td className="mono">{revision.revision}</td>
                      <td><Badge tone={toneOf(revision.status)}>{t(revision.status)}</Badge></td>
                      <td>{t(revision.changeType)}</td>
                      <td>{revision.changeSummary}</td>
                      <td className="mono">{revision.effectiveDate ?? "—"}</td>
                      <td>{revision.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={t("Related records")} flush>
            {open.relatedRecords.length === 0 ? (
              <EmptyState icon="gitBranch" title="Not linked yet"
                message="Link this document to an inquiry, project, estimate, BOM, PR or PO to make it findable from that record." />
            ) : (
              <ul className="link-list">
                {open.relatedRecords.map((record) => (
                  <li key={`${record.entityType}-${record.entityNumber}`}>
                    <Pill>{record.entityType}</Pill>
                    <span className="mono">{record.entityNumber}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Drawer>
      ) : null}
    </>
  );
}
