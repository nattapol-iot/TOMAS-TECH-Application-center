"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CURRENT_USER, ESTIMATES, INQUIRIES, MISSING_PRICES, NOTIFICATIONS,
  MAT_PRS, MIRS, PRICE_LIBRARY, PRODUCT, PROJECT_DOCS, PROJECT_FOLDERS, PROJECTS,
  QUOTATIONS, STOCK_ADJUSTMENTS, USERS,
} from "./data";
import { money } from "./calc";
import { Badge, Icon, Toast, type IconName } from "./ui";
import { BrandLockup, BrandMark } from "./Brand";
import { LANGUAGES, LanguageContext, translate, type Lang } from "./i18n";
import { SessionContext, sessionForRole, sessionFromApiUser, type Session } from "./session";
import { restoreAccount, signInWithMicrosoft, signOutMicrosoft } from "./auth-client";
import { loadBootstrap, type BootstrapData } from "./api-client";
import { useScheduleStore } from "./store";
import type { Route } from "./routes";
import Dashboard from "./screens/Dashboard";
import { InquiryCreate, InquiryDetail, InquiryList } from "./screens/Inquiry";
import EstimateList from "./screens/EstimateList";
import Workspace from "./screens/Workspace";
import { MissingPrices, PriceHistory, PriceLibrary, Quotations } from "./screens/Price";
import ResourcePlan from "./screens/Resource";
import { BomList, BomWorkspace } from "./screens/Bom";
import { PrCreate, PrDetail, PrList } from "./screens/Requisition";
import { GrnDetail, GrnList, PoList } from "./screens/Receiving";
import { MirDetail, MirList } from "./screens/Issue";
import Inventory from "./screens/Inventory";
import MatDashboard from "./screens/MatDashboard";
import MatApprovals from "./screens/MatApprovals";
import { ProjectDetail, ProjectList } from "./screens/Project";
import ProjectSchedule from "./screens/Schedule";
import MyWork, { myRows } from "./screens/MyWork";
import { AuditLogScreen, Customers, MasterData, RateMaster, Reports, Settings } from "./screens/Admin";

const IS_PRODUCTION_MODE = process.env.NEXT_PUBLIC_APP_MODE === "production";

const NAV: { group?: string; items: { route: Route; label: string; icon: IconName; badge?: number; hot?: boolean }[] }[] = [
  {
    items: [
      { route: { name: "dashboard" }, label: "Dashboard", icon: "grid" },
      { route: { name: "my-work" }, label: "My Work", icon: "user" },
      { route: { name: "inquiries" }, label: "Inquiry", icon: "inbox", badge: INQUIRIES.length },
      { route: { name: "estimates" }, label: "Estimate Cost", icon: "file", badge: ESTIMATES.length },
      { route: { name: "projects" }, label: "Projects", icon: "folder", badge: PROJECTS.filter((project) => project.status !== "Closed").length },
    ],
  },
  {
    group: "PRICE & SUPPLIER",
    items: [
      { route: { name: "price" }, label: "Price Library", icon: "book" },
      { route: { name: "quotations" }, label: "Supplier Quotation", icon: "quote" },
      { route: { name: "missing" }, label: "Waiting Supplier Price", icon: "clock", badge: MISSING_PRICES.filter((m) => m.status !== "Price Updated").length, hot: true },
    ],
  },
  {
    group: "PLANNING",
    items: [
      { route: { name: "resources" }, label: "Resource Plan", icon: "calendar" },
    ],
  },
  {
    group: "MATERIAL & PROCUREMENT",
    items: [
      { route: { name: "procurement" }, label: "Procurement Dashboard", icon: "trendingUp" },
      { route: { name: "boms" }, label: "BOM", icon: "layers" },
      { route: { name: "purchase" }, label: "Purchase Requisition", icon: "package", badge: MAT_PRS.filter((pr) => pr.status === "Draft" || pr.status === "In Approval").length },
      { route: { name: "pos" }, label: "Purchase Orders", icon: "truck" },
      { route: { name: "inventory" }, label: "Inventory", icon: "database" },
      { route: { name: "receiving" }, label: "Goods Receiving", icon: "download" },
      { route: { name: "issues" }, label: "Material Issues", icon: "upload" },
      { route: { name: "mat-approvals" }, label: "Approvals", icon: "checkCircle", badge: MAT_PRS.filter((pr) => pr.status === "In Approval").length + MIRS.filter((mir) => mir.status === "Pending Approval").length + STOCK_ADJUSTMENTS.filter((adj) => adj.status === "Pending Approval").length, hot: true },
    ],
  },
  {
    group: "ORGANISATION",
    items: [
      { route: { name: "customers" }, label: "Customers", icon: "users" },
      { route: { name: "reports" }, label: "Reports", icon: "chart" },
    ],
  },
  {
    group: "ADMINISTRATION",
    items: [
      { route: { name: "master" }, label: "Master Data", icon: "database" },
      { route: { name: "rates" }, label: "Engineering Rate", icon: "table" },
      { route: { name: "audit" }, label: "Audit Log", icon: "shield" },
      { route: { name: "settings" }, label: "Settings", icon: "settings" },
    ],
  },
];

export default function App({ forceDemo = false }: { forceDemo?: boolean }) {
  const productionMode = IS_PRODUCTION_MODE && !forceDemo;
  const [signedIn, setSignedIn] = useState(false);
  const [session, setSession] = useState<Session>(sessionForRole("Engineer"));
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [authBusy, setAuthBusy] = useState(productionMode);
  const [authError, setAuthError] = useState("");
  const [route, setRoute] = useState<Route>({ name: "dashboard" });
  const [toast, setToast] = useState("");
  const [language, setLanguage] = useState<Lang>("EN");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (next: Route) => {
    setRoute(next);
    setSearchOpen(false);
    setQuery("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  const notify = (message: string) => setToast(message);

  const finishProductionSignIn = async () => {
    const data = await loadBootstrap();
    setBootstrap(data);
    setSession(sessionFromApiUser(data.user));
    setSignedIn(true);
  };

  const handleMicrosoftSignIn = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInWithMicrosoft();
      await finishProductionSignIn();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in with Microsoft.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSignedIn(false);
    setBootstrap(null);
    if (productionMode) {
      try { await signOutMicrosoft(); }
      catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to sign out."); }
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!productionMode) return;
    let cancelled = false;
    const restore = async () => {
      setAuthBusy(true);
      try {
        const account = await restoreAccount();
        if (account && !cancelled) await finishProductionSignIn();
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : "Unable to restore the Microsoft session.");
      } finally {
        if (!cancelled) setAuthBusy(false);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [productionMode]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useGlobalSearch(query);
  const unread = NOTIFICATIONS.filter((entry) => entry.unread).length;
  const schedule = useScheduleStore();
  const myUrgent = useMemo(() => {
    const rows = myRows(schedule.tasks, schedule.updates, session.user.id);
    return rows.filter((row) => row.status !== "Done" && (row.isLate || row.status === "Blocked" || row.needsForecast || row.isStale)).length;
  }, [schedule.version, session.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const language$ = useMemo(
    () => ({ lang: language, setLang: setLanguage, t: (text: string) => translate(text, language) }),
    [language],
  );
  const t = language$.t;

  if (!signedIn) {
    return (
      <LanguageContext.Provider value={language$}>
        <Login
          production={productionMode}
          busy={authBusy}
          error={authError}
          onMicrosoftSignIn={handleMicrosoftSignIn}
          onDemoSignIn={(role) => { setSession(sessionForRole(role)); setSignedIn(true); }}
        />
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={language$}>
    <SessionContext.Provider value={session}>
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark size={34} tone="dark" />
          <div>
            <strong>{PRODUCT.company}</strong>
            <span>{PRODUCT.name}</span>
          </div>
        </div>

        <nav className="nav" aria-label={t("Main navigation")}>
          {NAV.map((section, index) => (
            <div key={section.group ?? index}>
              {section.group ? <p className="nav-label">{t(section.group)}</p> : null}
              {section.items.map((item) => {
                const active = isActive(route, item.route);
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={active ? "nav-item active" : "nav-item"}
                    aria-current={active ? "page" : undefined}
                    onClick={() => go(item.route)}
                  >
                    <Icon name={item.icon} />
                    <span>{t(item.label)}</span>
                    {item.route.name === "my-work" && myUrgent
                      ? <em className="hot">{myUrgent}</em>
                      : badgeForRoute(item.route, item.badge, bootstrap) ? <em className={item.hot ? "hot" : undefined}>{badgeForRoute(item.route, item.badge, bootstrap)}</em> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <span className="avatar sm">{session.user.initials}</span>
          <div>
            <strong>{session.user.name}</strong>
            <span>{session.user.department} · {session.role}</span>
          </div>
          <button type="button" aria-label={t("Sign out")} onClick={() => { void handleSignOut(); }}><Icon name="logout" /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="global-search" ref={searchRef}>
            <Icon name="search" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder={t("Search inquiry, estimate, customer, project, brand, model, supplier or engineer…")}
              aria-label={t("Global search")}
            />
            <span className="kbd"><b>Ctrl</b><b>K</b></span>
            {searchOpen && query ? (
              <div className="search-results">
                {results.length ? results.map((group) => (
                  <div key={group.label}>
                    <p className="search-group-label">{group.label}</p>
                    {group.items.map((item) => (
                      <button key={item.key} type="button" className="search-result" onClick={() => go(item.route)}>
                        <Icon name={item.icon} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </span>
                        {item.badge ? <Badge tone="slate">{item.badge}</Badge> : null}
                      </button>
                    ))}
                  </div>
                )) : (
                  <p className="search-group-label">No result for “{query}”</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="topbar-right">
            <div className="menu-wrap">
              <button className="icon-btn" type="button" aria-label={t("Notifications")} onClick={() => setNotifOpen((value) => !value)}>
                <Icon name="bell" />
                {unread ? <b>{unread}</b> : null}
              </button>
              {notifOpen ? (
                <div className="menu notif-list" role="menu">
                  <p className="search-group-label">Notifications</p>
                  {NOTIFICATIONS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={entry.unread ? "notif-item unread" : "notif-item"}
                      onClick={() => {
                        setNotifOpen(false);
                        if (entry.kind === "supplier") go({ name: "missing" });
                        else if (entry.kind === "assign") go({ name: "inquiries" });
                        else go({ name: "estimates" });
                      }}
                    >
                      <Icon name={notifIcon(entry.kind)} className={notifTone(entry.kind)} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong>{entry.title}</strong>
                        <p>{entry.detail}</p>
                        <time>{entry.at}</time>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="lang-switch" role="group" aria-label="Language">
              {LANGUAGES.map((code) => (
                <button key={code} type="button" className={language === code ? "active" : ""} onClick={() => setLanguage(code)}>{code}</button>
              ))}
            </div>

            <div className="menu-wrap">
              <button className="topbar-user" type="button" onClick={() => setUserOpen((value) => !value)}>
                <span className="avatar sm">{session.user.initials}</span>
                <span>
                  {session.user.name}
                  <small>{session.role} · {session.user.department}</small>
                </span>
                <Icon name="chevronDown" />
              </button>
              {userOpen ? (
                <div className="menu" role="menu">
                  <button type="button" onClick={() => { setUserOpen(false); go({ name: "settings" }); }}><Icon name="user" />{t("Profile & department")}</button>
                  <button type="button" onClick={() => { setUserOpen(false); go({ name: "settings" }); }}><Icon name="settings" />{t("Settings")}</button>
                  <button type="button" onClick={() => { setUserOpen(false); void handleSignOut(); }}><Icon name="logout" />{t("Logout")}</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className={route.name === "estimate" ? "page workspace-page" : "page"}>
          {route.name === "dashboard" ? <Dashboard go={go} notify={notify} /> : null}
          {route.name === "inquiries" ? <InquiryList go={go} notify={notify} /> : null}
          {route.name === "inquiry-new" ? <InquiryCreate go={go} notify={notify} /> : null}
          {route.name === "inquiry" ? <InquiryDetail key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "estimates" ? <EstimateList go={go} notify={notify} /> : null}
          {route.name === "estimate" ? <Workspace key={route.id} estimateId={route.id} initialTab={route.tab} go={go} notify={notify} /> : null}
          {route.name === "price" ? <PriceLibrary go={go} notify={notify} /> : null}
          {route.name === "price-history" ? <PriceHistory key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "quotations" ? <Quotations go={go} notify={notify} /> : null}
          {route.name === "missing" ? <MissingPrices go={go} notify={notify} /> : null}
          {route.name === "resources" ? <ResourcePlan go={go} notify={notify} /> : null}
          {route.name === "procurement" ? <MatDashboard go={go} notify={notify} /> : null}
          {route.name === "boms" ? <BomList go={go} notify={notify} /> : null}
          {route.name === "bom" ? <BomWorkspace key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "purchase" ? <PrList go={go} notify={notify} /> : null}
          {route.name === "pr" ? <PrDetail key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "pr-new" ? <PrCreate bomId={route.bomId} go={go} notify={notify} /> : null}
          {route.name === "pos" ? <PoList go={go} notify={notify} /> : null}
          {route.name === "inventory" ? <Inventory go={go} notify={notify} /> : null}
          {route.name === "receiving" ? <GrnList go={go} notify={notify} /> : null}
          {route.name === "grn" ? <GrnDetail key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "issues" ? <MirList go={go} notify={notify} /> : null}
          {route.name === "mir" ? <MirDetail key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "mat-approvals" ? <MatApprovals go={go} notify={notify} /> : null}
          {route.name === "customers" ? <Customers go={go} notify={notify} /> : null}
          {route.name === "projects" ? <ProjectList go={go} notify={notify} /> : null}
          {route.name === "project" ? <ProjectDetail key={route.id} id={route.id} go={go} notify={notify} /> : null}
          {route.name === "schedule" ? <ProjectSchedule key={route.id} id={route.id} initialView={route.view} go={go} notify={notify} /> : null}
          {route.name === "my-work" ? <MyWork go={go} notify={notify} /> : null}
          {route.name === "reports" ? <Reports go={go} notify={notify} /> : null}
          {route.name === "master" ? <MasterData go={go} notify={notify} /> : null}
          {route.name === "rates" ? <RateMaster go={go} notify={notify} /> : null}
          {route.name === "audit" ? <AuditLogScreen go={go} notify={notify} /> : null}
          {route.name === "settings" ? <Settings go={go} notify={notify} /> : null}
        </main>

        <footer className="app-footer">© 2026 {PRODUCT.company} · {PRODUCT.name} {PRODUCT.version}</footer>
      </div>

      {toast ? <Toast message={toast} onDone={() => setToast("")} /> : null}
    </div>
    </SessionContext.Provider>
    </LanguageContext.Provider>
  );
}

/* --------------------------------------------------------------------------
   Global search
   -------------------------------------------------------------------------- */

type SearchItem = { key: string; title: string; detail: string; icon: IconName; route: Route; badge?: string };

function useGlobalSearch(query: string) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const groups: { label: string; items: SearchItem[] }[] = [];

    const inquiries = INQUIRIES.filter((inquiry) => `${inquiry.no} ${inquiry.projectName} ${inquiry.rfqNo}`.toLowerCase().includes(needle));
    if (inquiries.length) {
      groups.push({
        label: "Inquiry",
        items: inquiries.slice(0, 4).map((inquiry) => ({
          key: inquiry.id, title: `${inquiry.no} — ${inquiry.projectName}`,
          detail: `${inquiry.projectType} · due ${inquiry.dueDate}`, icon: "inbox",
          route: { name: "inquiry", id: inquiry.id }, badge: inquiry.status,
        })),
      });
    }

    // A project matches on its number, its name and on any document filed in
    // one of its folders, so searching a drawing number opens the project.
    const projects = PROJECTS.filter((project) =>
      `${project.no} ${project.name} ${project.poNo} ${project.inquiryNo} ${project.site}`.toLowerCase().includes(needle)
      || PROJECT_DOCS.some((doc) => doc.projectId === project.id && doc.name.toLowerCase().includes(needle)));
    if (projects.length) {
      groups.push({
        label: "Project",
        items: projects.slice(0, 4).map((project) => {
          const hit = PROJECT_DOCS.find((doc) => doc.projectId === project.id && doc.name.toLowerCase().includes(needle));
          const folder = hit ? PROJECT_FOLDERS.find((entry) => entry.code === hit.folder) : undefined;
          return {
            key: project.id, title: `${project.no} — ${project.name}`,
            detail: hit ? `${hit.name} · ${folder?.code}. ${folder?.name}` : `${project.projectType} · ${project.site}`,
            icon: "folder" as const, route: { name: "project" as const, id: project.id }, badge: project.status,
          };
        }),
      });
    }
    // An estimate matches on its own identifiers and on any equipment inside
    // it — searching "KV-8000" has to surface the estimates that used it.
    const estimates = ESTIMATES.filter((estimate) =>
      `${estimate.no} ${estimate.projectName} ${estimate.inquiryNo}`.toLowerCase().includes(needle)
      || estimate.items.some((item) => `${item.itemCode} ${item.description} ${item.brand} ${item.model} ${item.supplier}`.toLowerCase().includes(needle)));
    if (estimates.length) {
      groups.push({
        label: "Previous Estimate",
        items: estimates.slice(0, 4).map((estimate) => ({
          key: estimate.id, title: `${estimate.no} ${estimate.revision} — ${estimate.projectName}`,
          detail: `${estimate.projectType} · ${estimate.status}`, icon: "file",
          route: { name: "estimate", id: estimate.id },
        })),
      });
    }

    const prices = PRICE_LIBRARY.filter((record) => `${record.itemCode} ${record.description} ${record.brand} ${record.model} ${record.supplier}`.toLowerCase().includes(needle));
    if (prices.length) {
      groups.push({
        label: "Price Library",
        items: prices.slice(0, 5).map((record) => ({
          key: record.id, title: `${record.model || record.itemCode} — ${record.description}`,
          detail: `${record.brand} · ${record.supplier} · ${money(record.price)}`, icon: "book",
          route: { name: "price-history", id: record.id },
        })),
      });
    }

    // Quotations also match through the price records that reference them, so
    // a model number finds the document its price came from.
    const referenced = new Set(prices.map((record) => record.reference));
    const quotations = QUOTATIONS.filter((quotation) =>
      `${quotation.no} ${quotation.supplier} ${quotation.project}`.toLowerCase().includes(needle)
      || referenced.has(quotation.no));
    if (quotations.length) {
      groups.push({
        label: "Supplier Quotation",
        items: quotations.slice(0, 4).map((quotation) => ({
          key: quotation.id, title: `${quotation.no} — ${quotation.supplier}`,
          detail: `${quotation.project} · valid until ${quotation.validUntil}`, icon: "quote",
          route: { name: "quotations" }, badge: quotation.status,
        })),
      });
    }

    const engineers = USERS.filter((user) => user.name.toLowerCase().includes(needle));
    if (engineers.length) {
      groups.push({
        label: "Engineer",
        items: engineers.slice(0, 3).map((user) => ({
          key: user.id, title: user.name, detail: `${user.department} · ${user.level}`,
          icon: "user", route: { name: "estimates" },
        })),
      });
    }

    return groups;
  }, [query]);
}

function isActive(route: Route, target: Route) {
  if (route.name === target.name) return true;
  if (target.name === "inquiries" && (route.name === "inquiry" || route.name === "inquiry-new")) return true;
  if (target.name === "estimates" && route.name === "estimate") return true;
  if (target.name === "price" && route.name === "price-history") return true;
  if (target.name === "purchase" && (route.name === "pr" || route.name === "pr-new")) return true;
  if (target.name === "boms" && route.name === "bom") return true;
  if (target.name === "receiving" && route.name === "grn") return true;
  if (target.name === "issues" && route.name === "mir") return true;
  if (target.name === "projects" && (route.name === "project" || route.name === "schedule")) return true;
  return false;
}

function badgeForRoute(route: Route, fallback: number | undefined, bootstrap: BootstrapData | null) {
  if (!bootstrap) return fallback ?? 0;
  if (route.name === "inquiries") return bootstrap.counts.inquiries;
  if (route.name === "estimates") return bootstrap.counts.estimates;
  if (route.name === "projects") return bootstrap.counts.activeProjects;
  if (route.name === "mat-approvals") return bootstrap.counts.approvals;
  return fallback ?? 0;
}

const notifIcon = (kind: string): IconName =>
  kind === "overdue" ? "alertTriangle" : kind === "supplier" ? "truck"
    : kind === "review" ? "checkCircle" : kind === "approved" ? "check"
      : kind === "assign" ? "inbox" : "clock";

const notifTone = (kind: string) =>
  kind === "overdue" ? "red-text" : kind === "supplier" ? "amber-text"
    : kind === "approved" ? "green-text" : "blue-text";

/* --------------------------------------------------------------------------
   Login
   -------------------------------------------------------------------------- */

function Login({
  production,
  busy,
  error,
  onMicrosoftSignIn,
  onDemoSignIn,
}: {
  production: boolean;
  busy: boolean;
  error: string;
  onMicrosoftSignIn: () => Promise<void>;
  onDemoSignIn: (role: string) => void;
}) {
  const { t } = useContext(LanguageContext);
  const [email, setEmail] = useState(CURRENT_USER.email);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Engineer");

  return (
    <div className="login">
      <aside className="login-aside">
        <div className="login-brand">
          <BrandLockup tone="dark" height={44} />
          <span>{PRODUCT.name}</span>
        </div>

        <div>
          <h2>{PRODUCT.name}</h2>
          <p className="login-strap">{t("Engineering Estimate Cost Management System")}</p>
          <p>Engineers should spend their time estimating engineering work — not searching old Excel files, copying prices, checking formulas or combining costs by hand.</p>
          <ul className="login-points">
            <li><Icon name="check" />One inquiry number, one estimate number, no duplication</li>
            <li><Icon name="check" />Price library with supplier reference and price age</li>
            <li><Icon name="check" />Man-hour cost from the engineering rate master</li>
            <li><Icon name="check" />Revision control, validation and full audit trail</li>
          </ul>
        </div>

        <div className="login-stats">
          <div><strong>{INQUIRIES.length}</strong><span>Open inquiries</span></div>
          <div><strong>{ESTIMATES.length}</strong><span>Active estimates</span></div>
          <div><strong>{PRICE_LIBRARY.length}</strong><span>Price records</span></div>
        </div>
      </aside>

      <div className="login-form-wrap">
        <form className="login-form" onSubmit={(event) => {
          event.preventDefault();
          if (production) void onMicrosoftSignIn();
          else onDemoSignIn(role);
        }}>
          <h1>{t("Sign in")}</h1>
          <p>{production ? t("Use your Microsoft company account to open the production workspace.") : t("Use your company account to open the estimate workspace.")}</p>

          {production ? (
            <>
              {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
              <button className="btn primary block" type="submit" disabled={busy}>
                <Icon name="user" />{busy ? t("Connecting to Microsoft…") : t("Continue with Microsoft")}
              </button>
              <div className="login-role-hint">
                <strong>{t("Production access")}</strong>
                {t("Your role and permissions are assigned by the IoT Team administrator. Passwords are handled by Microsoft and are never stored in this application.")}
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="login-email">{t("Email")}</label>
                <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
              </div>
              <div className="field">
                <label htmlFor="login-password">{t("Password")}</label>
                <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="••••••••" />
              </div>
              <div className="field">
                <label htmlFor="login-role">{t("Sign in as")}</label>
                <select id="login-role" value={role} onChange={(event) => setRole(event.target.value)}>
                  {["Engineer", "Engineering Manager", "Project Manager", "Purchasing", "Warehouse", "Inventory Controller", "Sales Engineer", "Admin", "Viewer"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </div>
              <label className="checkbox-row" style={{ margin: "4px 0 10px" }}>
                <input type="checkbox" defaultChecked />
                <span>{t("Keep me signed in on this workstation")}</span>
              </label>
              <button className="btn primary block" type="submit"><Icon name="arrowRight" />{t("Sign in")}</button>
              <div className="login-role-hint">
                <strong>Demonstration account</strong>
                Signing in as <strong>{role}</strong> opens the same workspace with that role&apos;s permissions. Engineers prepare estimates; the Engineering Manager approves cost, scope and effort — there is no margin approval in this system.
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
