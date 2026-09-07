"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeamActivityScreen } from "./production/TeamActivityScreen";
import { ExecutiveDashboard } from "./production/ExecutiveDashboard";
import { DASHBOARD_ROLES } from "../../backend-node/src/executive-dashboard-model";
import { useActivityPresence } from "./use-activity-presence";
import { BrandLockup, BrandMark } from "./Brand";
import { IS_ENTRA_CONFIGURED, restoreAccount, signInWithMicrosoft, signOutMicrosoft } from "./auth-client";
import { apiRequest, IS_API_CONFIGURED, loadBootstrap, type BootstrapData } from "./api-client";
import { clearTeamTestSession, getTeamTestSession, IS_TEAM_TEST_MODE, saveTeamTestSession } from "./team-test-client";
import { PRODUCT } from "./product";
import { Icon, Tabs, Toast, type IconName } from "./ui";
import { LANGUAGES, LanguageContext, translate, applyDocumentLanguage, type Lang } from "./i18n";
import {
  ProductionDashboard,
  ProductionInventory,
  ProductionMasterData,
  ProductionProjects,
} from "./production/CoreScreens";
import { ProductionInquiries } from "./production/InquiryScreens";
import { ProductionResourcePlan } from "./production/ResourcePlanningScreen";
import { ProductionProjectTimeline } from "./production/ProjectTimelineScreen";
import { ResourceTaskWorkspace } from "./production/ResourceTaskWorkspace";
import { ReportScreens } from "./production/ReportScreens";
import { ProductionEstimates } from "./production/EstimateScreens";
import {
  ProductionApprovals,
  ProductionBoms,
  ProductionGoodsReceiving,
  ProductionInventoryOperations,
  ProductionMaterialIssues,
  ProductionProcurementDashboard,
  ProductionPurchaseOrders,
  ProductionPurchaseRequisitions,
} from "./production/MaterialScreens";
import {
  ProductionMyWork,
  ProductionPriceLibrary,
  ProductionProjectSchedule,
  ProductionSupplierQuotations,
  ProductionWaitingSupplierPrice,
} from "./production/PlanningPricingScreens";
import {
  ProductionCompanyStamps,
  ProductionMySignature,
  ProductionSignedDocuments,
  ProductionSignInbox,
} from "./production/SigningScreens";
import {
  ProductionAuditLog,
  ProductionCustomers,
  ProductionEngineeringRates,
  ProductionReports,
  ProductionSettings,
} from "./production/AdminAnalyticsScreens";
import { ProductionKnowledgeHub } from "./production/KnowledgeScreens";
import { ProductionModuleTemplates } from "./production/ModuleTemplateScreens";
import { ProductionProfile } from "./production/ProfileScreen";
import { SupportCenter, SupportCreateDialog } from "./production/SupportScreens";
import { EmployeeManualScreen, employeeManualLabel } from "./production/EmployeeManualScreen";
import { supportLabel } from "./support-copy";
import Performance from "./production/PerformanceScreen";
import {
  ProductionMyAssignments,
  ProductionSalesIntake,
  ProductionSiteVisits,
  ProductionVisitMasterData,
} from "./production/SiteVisitScreens";

type View =
  | "dashboard" | "my-work" | "inquiries" | "estimates" | "projects" | "knowledge"
  | "sales-intake" | "site-visits" | "my-assignments" | "visit-master"
  | "price" | "quotations" | "missing" | "project-timeline" | "resources"
  | "procurement" | "boms" | "purchase" | "pos" | "inventory" | "receiving" | "issues" | "approvals"
  | "signing" | "documents" | "signature" | "stamps"
  | "activity" | "customers" | "reports" | "performance" | "master" | "module-templates" | "rates" | "audit" | "settings" | "profile" | "manual" | "support";

type NavItem = { view: View; label: string; icon: IconName; permission?: string; permissions?: string[] };
type MyWorkUrgencyItem = {
  status: string;
  canUpdate: boolean;
  planFinish: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  updatedAt: string;
};
type AppNotification = {
  id: number;
  kind: string;
  title: string;
  detail: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  createdAt: string;
};
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [
    { view: "dashboard", label: "Dashboard", icon: "grid" },
    { view: "my-work", label: "My Work", icon: "user", permissions: ["schedule.read", "schedule.progress"] },
    { view: "inquiries", label: "Inquiry", icon: "inbox", permission: "inquiry.read" },
    { view: "estimates", label: "Estimate Cost", icon: "file", permission: "estimate.read" },
    { view: "projects", label: "Projects", icon: "folder", permission: "project.read" },
    { view: "knowledge", label: "Knowledge Hub", icon: "book", permission: "knowledge.view" },
  ] },
  { group: "SALES & SITE VISIT", items: [

    { view: "site-visits", label: "Site Visit", icon: "truck", permission: "visit.read" },
    { view: "my-assignments", label: "My Assignments", icon: "play", permission: "visit.read" },
  ] },
  { group: "PRICE & SUPPLIER", items: [
    { view: "price", label: "Price Library", icon: "book", permission: "estimate.read" },
    { view: "quotations", label: "Supplier Quotation", icon: "quote", permission: "estimate.read" },
    { view: "missing", label: "Waiting Supplier Price", icon: "clock", permission: "estimate.read" },
  ] },
  { group: "PLANNING", items: [
    { view: "project-timeline", label: "Project Timeline", icon: "chart", permissions: ["project.read", "schedule.read"] },
    { view: "resources", label: "Resource Plan", icon: "calendar", permissions: ["project.read", "schedule.read"] },
  ] },
  { group: "MATERIAL & PROCUREMENT", items: [
    { view: "procurement", label: "Procurement Dashboard", icon: "trendingUp", permission: "procurement.read" },
    { view: "boms", label: "BOM", icon: "layers", permission: "procurement.read" },
    { view: "purchase", label: "Purchase Requisition", icon: "package", permission: "procurement.read" },
    { view: "pos", label: "Purchase Orders", icon: "truck", permission: "procurement.read" },
    { view: "inventory", label: "Inventory", icon: "database", permission: "inventory.read" },
    { view: "receiving", label: "Goods Receiving", icon: "download", permission: "inventory.read" },
    { view: "issues", label: "Material Issues", icon: "upload", permission: "inventory.read" },
    { view: "approvals", label: "Approvals", icon: "checkCircle", permission: "procurement.approve" },
  ] },
  { group: "DOCUMENTS & SIGNING", items: [
    { view: "signing", label: "Sign Inbox", icon: "edit", permission: "signing.read" },
    { view: "documents", label: "Signed Documents", icon: "shield", permission: "signing.read" },
  ] },
  { group: "ORGANISATION", items: [
    { view: "activity", label: "Team Activity", icon: "chart", permission: "activity.read" },
    { view: "performance", label: "KPI & Growth", icon: "trendingUp", permission: "performance.read" },
    { view: "reports", label: "Reports", icon: "chart", permission: "report.read" },
  ] },
  { items: [
    { view: "manual", label: "Employee Manual", icon: "book" },
    { view: "support", label: "Support Center", icon: "inbox" },
  ] },
  { group: "ADMINISTRATION", items: [
    { view: "master", label: "Master Data", icon: "database", permission: "master.read" },
    { view: "module-templates", label: "Module Templates", icon: "package", permission: "estimate.read" },
    { view: "stamps", label: "Company Stamps", icon: "lock", permission: "signing.read" },
    { view: "audit", label: "Audit Log", icon: "shield", permission: "audit.read" },
    { view: "visit-master", label: "Visit Master Data", icon: "layers", permission: "visit.read" },
    { view: "settings", label: "Settings", icon: "settings", permission: "master.read" },
  ] },
];

const IS_AUTH_CONFIGURED = (IS_TEAM_TEST_MODE || IS_ENTRA_CONFIGURED) && IS_API_CONFIGURED;
const WORKSPACE_LABEL = IS_TEAM_TEST_MODE ? "TEAM TEST" : "PRODUCTION";
const LANGUAGE_STORAGE_KEY = "tomas-tech-language";
const NAV_GROUP_STORAGE_KEY = "tomas-tech-collapsed-nav-groups";
const SIDEBAR_STORAGE_KEY = "tomas-tech-sidebar-collapsed";

export default function ProductionApp({ initialVerifyCode }: { initialVerifyCode?: string } = {}) {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  // Arriving from a certificate's verification link lands on the signed
  // documents screen with the code already filled in, once the visitor has
  // signed in.
  const [view, setViewState] = useState<View>(initialVerifyCode ? "documents" : "dashboard");
  const [busy, setBusy] = useState(IS_AUTH_CONFIGURED);
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [userOpen, setUserOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [projectTab, setProjectTab] = useState<"portfolio" | "schedule" | "punchlist">("portfolio");
  const [myWorkTab, setMyWorkTab] = useState<"inbox" | "schedule">("inbox");
  const [inventoryTab, setInventoryTab] = useState<"balances" | "operations">("balances");
  const [reportTab, setReportTab] = useState<"workspace" | "analytics">("workspace");
  const [preferredScheduleProjectId, setPreferredScheduleProjectId] = useState<number | null>(null);
  const [preferredEstimateId, setPreferredEstimateId] = useState<number | null>(null);
  const [preferredSiteVisitId, setPreferredSiteVisitId] = useState<number | null>(null);
  const [myWorkUrgentCount, setMyWorkUrgentCount] = useState(0);
  const [taskAcknowledgmentCount, setTaskAcknowledgmentCount] = useState(0);
  const [taskInboxRevision, setTaskInboxRevision] = useState(0);
  const [language, setLanguageState] = useState<Lang>("EN");
  const setLanguage = useCallback((next: Lang) => { applyDocumentLanguage(next); setLanguageState(next); }, []);
  const reportDirty = useRef(false);
  const supportDirty = useRef(false);
  const onSupportDirtyChange = useCallback((dirty: boolean) => { supportDirty.current = dirty; }, []);
  const [supportTicketId, setSupportTicketId] = useState<number | null>(null);
  const [supportCreate, setSupportCreate] = useState(false);
  const [supportRevision, setSupportRevision] = useState(0);
  const onReportDirtyChange = useCallback((dirty: boolean) => { reportDirty.current = dirty; }, []);
  const [languageReady, setLanguageReady] = useState(false);
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<string[]>([]);
  const [navGroupsReady, setNavGroupsReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const canLoadMyWork = Boolean(bootstrap?.permissions.includes("schedule.read")
    && bootstrap.permissions.includes("schedule.progress"));
  const languageValue = useMemo(() => ({
    lang: language,
    setLang: setLanguage,
    t: (text: string) => text === "Support Center" ? supportLabel(text, language) : translate(text, language),
  }), [language, setLanguage]);
  const t = languageValue.t;
  useActivityPresence(bootstrap?.user.id, view, Boolean(bootstrap?.permissions.includes("activity.read")));
  const confirmReportNavigation = useCallback(() => (!reportDirty.current && !supportDirty.current) || window.confirm(supportDirty.current ? supportLabel("Discard changes?", language) : t("Discard unsaved report changes?")), [t, language]);
  const setView = useCallback((next: View) => {
    if (next !== view && !confirmReportNavigation()) return;
    if (next !== "support" && /^#support(?:\/|$)/.test(window.location.hash)) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (next !== "activity" && window.location.hash === "#activity") window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setViewState(next);
  }, [view, confirmReportNavigation]);

  useEffect(() => {
    const follow = () => { if (window.location.hash === "#activity" && bootstrap?.permissions.includes("activity.read")) setView("activity"); };
    follow(); window.addEventListener("hashchange", follow); return () => window.removeEventListener("hashchange", follow);
  }, [bootstrap, setView]);

  const openSupport = (id: number | null) => {
    if (!confirmReportNavigation()) return;
    setSupportTicketId(id); setSupportCreate(false); setViewState("support");
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (id ? `#support/${id}` : "#support"));
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const match = window.location.hash.match(/^#support(?:\/(\d+))?$/);
      if (match) { const id = Number(match[1]); setSupportTicketId(Number.isSafeInteger(id) && id > 0 ? id : null); setViewState("support"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const followSupportLink = () => {
      const match = window.location.hash.match(/^#support(?:\/(\d+))?$/);
      if (!match) return;
      if (!confirmReportNavigation()) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + (view === "support" ? supportTicketId ? `#support/${supportTicketId}` : "#support" : ""));
        return;
      }
      const id = Number(match[1]);
      setSupportTicketId(Number.isSafeInteger(id) && id > 0 ? id : null);
      setViewState("support");
    };
    window.addEventListener("hashchange", followSupportLink);
    return () => window.removeEventListener("hashchange", followSupportLink);
  }, [confirmReportNavigation, view, supportTicketId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (LANGUAGES.includes(saved as Lang)) setLanguage(saved as Lang);
      setLanguageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setLanguage]);

  useEffect(() => {
    if (!languageReady) return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === "TH" ? "th" : language === "JP" ? "ja" : "en";
  }, [language, languageReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(NAV_GROUP_STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved)) setCollapsedNavGroups(saved.filter((group): group is string => typeof group === "string"));
      } catch {
        window.localStorage.removeItem(NAV_GROUP_STORAGE_KEY);
      }
      setNavGroupsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!navGroupsReady) return;
    window.localStorage.setItem(NAV_GROUP_STORAGE_KEY, JSON.stringify(collapsedNavGroups));
  }, [collapsedNavGroups, navGroupsReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
      setSidebarReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sidebarReady) return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed, sidebarReady]);

  const refreshBootstrap = async () => {
    setBootstrap(await loadBootstrap());
  };

  useEffect(() => {
    if (!IS_AUTH_CONFIGURED) {
      return;
    }
    let cancelled = false;
    const restore = async () => {
      setBusy(true);
      try {
        const hasSession = IS_TEAM_TEST_MODE ? Boolean(getTeamTestSession()) : Boolean(await restoreAccount());
        if (hasSession && !cancelled) {
          const data = await loadBootstrap();
          if (!cancelled) setBootstrap(data);
        }
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : "Unable to restore the Microsoft session.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!bootstrap || !canLoadMyWork) return () => { cancelled = true; };
    void apiRequest<MyWorkUrgencyItem[]>("/api/v1/me/work")
      .then((items) => {
        if (!cancelled) setMyWorkUrgentCount(items.filter(myWorkNeedsAttention).length);
      })
      .catch(() => {
        if (!cancelled) setMyWorkUrgentCount(0);
    });
    return () => { cancelled = true; };
  }, [bootstrap, canLoadMyWork]);

  useEffect(() => {
    let cancelled = false;
    if (!bootstrap || !canLoadMyWork) return;
    const update = async () => {
      try {
        const result = await apiRequest<{ total: number }>("/api/v1/resource-tasks?mine=true&filter=Acknowledgment&pageSize=1");
        if (!cancelled) setTaskAcknowledgmentCount(result.total);
      } catch { /* Keep the last known inbox count during a temporary outage. */ }
    };
    void update();
    const timer = setInterval(() => { void update(); }, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [bootstrap, canLoadMyWork, taskInboxRevision]);

  const refreshNotifications = useCallback(async () => {
    if (!bootstrap) return;
    try {
      setNotifications(await apiRequest<AppNotification[]>("/api/v1/me/notifications/?limit=50"));
    } catch { /* Notifications must never block the operational workspace. */ }
  }, [bootstrap]);

  useEffect(() => {
    if (!bootstrap) return;
    const initialTimer = window.setTimeout(() => { void refreshNotifications(); }, 0);
    const timer = window.setInterval(() => { void refreshNotifications(); }, 30_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [bootstrap, refreshNotifications]);

  const markNotificationsRead = async () => {
    const unreadIds = notifications.filter((item) => !item.isRead).map((item) => item.id);
    if (!unreadIds.length) return;
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    try {
      await apiRequest("/api/v1/me/notifications/read", { method: "POST", body: JSON.stringify({ ids: unreadIds, all: false }) });
    } catch {
      void refreshNotifications();
    }
  };

  const openNotification = (item: AppNotification) => {
    setNotificationOpen(false);
    if (!item.isRead) {
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry));
      void apiRequest("/api/v1/me/notifications/read", { method: "POST", body: JSON.stringify({ ids: [item.id], all: false }) })
        .catch(() => { void refreshNotifications(); });
    }
    if (item.entityType === "GoodsReceipt") setView("receiving");
    if (item.entityType === "SupportTicket" && item.entityId) openSupport(item.entityId);
  };

  const signIn = async (teamTestEmail?: string, teamTestAccessCode?: string) => {
    setBusy(true); setAuthError(""); setMyWorkUrgentCount(0);
    try {
      if (IS_TEAM_TEST_MODE) {
        saveTeamTestSession(teamTestEmail ?? "", teamTestAccessCode ?? "");
        setBootstrap(await loadBootstrap());
      } else {
        // Navigates away to Microsoft's login page -- restoreAccount() picks the
        // session back up (and loads bootstrap data) once the redirect returns.
        await signInWithMicrosoft();
      }
    }
    catch (error) {
      if (IS_TEAM_TEST_MODE) clearTeamTestSession();
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    if (!confirmReportNavigation()) return;
    setBusy(true); setAuthError("");
    try {
      if (IS_TEAM_TEST_MODE) clearTeamTestSession();
      else await signOutMicrosoft();
      reportDirty.current = false;
      setBootstrap(null); setMyWorkUrgentCount(0); setViewState("dashboard");
    }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  };

  const allowedNav = useMemo(() => NAV
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (!item.permission || bootstrap?.permissions.includes(item.permission))
        && (!item.permissions || item.permissions.every((permission) => bootstrap?.permissions.includes(permission)))),
    }))
    .filter((section) => section.items.length > 0), [bootstrap]);

  const openProjectSchedule = useCallback((projectId: number) => {
    setPreferredScheduleProjectId(projectId);
    setProjectTab("schedule");
    setView("projects");
    window.scrollTo({ top: 0 });
  }, [setView]);
  const openSiteVisit = useCallback((visitId: number) => {
    setPreferredSiteVisitId(visitId);
    setView("site-visits");
    window.scrollTo({ top: 0 });
  }, [setView]);
  const openEstimate = useCallback((estimateId: number) => {
    setPreferredEstimateId(estimateId);
    setView("estimates");
    window.scrollTo({ top: 0 });
  }, [setView]);
  const [startInquiryCreate, setStartInquiryCreate] = useState(false);
  const [preferredInquiryId, setPreferredInquiryId] = useState<number | null>(null);
  const openInquiry = useCallback((id: number) => {
    setStartInquiryCreate(false);
    setPreferredInquiryId(id);
    setView("inquiries");
    window.scrollTo({top:0});
  }, [setView]);
  const startInquiry = () => { setStartInquiryCreate(true); setPreferredInquiryId(null); setView("inquiries"); };
  const toggleNavGroup = (group: string) => {
    setCollapsedNavGroups((current) => current.includes(group)
      ? current.filter((value) => value !== group)
      : [...current, group]);
  };

  if (!bootstrap) {
    return (
      <LanguageContext.Provider value={languageValue}>
        <ProductionLogin
          busy={busy}
          error={authError}
          teamTestMode={IS_TEAM_TEST_MODE}
          entraConfigured={IS_ENTRA_CONFIGURED}
          apiConfigured={IS_API_CONFIGURED}
          language={language}
          onLanguageChange={setLanguage}
          onSignIn={signIn}
        />
      </LanguageContext.Provider>
    );
  }

  const personalDashboard = <ProductionDashboard bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} teamTestMode={IS_TEAM_TEST_MODE} onNavigate={(destination) => { setView(destination); window.scrollTo({ top: 0 }); }} />;
  const common = { bootstrap, notify: setToast, refreshBootstrap };
  const moduleProps = {
    bootstrap,
    notify: setToast,
    openProjectSchedule,
    preferredProjectId: preferredScheduleProjectId,
    onMyWorkUrgentCountChange: setMyWorkUrgentCount,
  };
  return (
    <LanguageContext.Provider value={languageValue}>
    <div className={sidebarCollapsed ? "app sidebar-collapsed" : "app"}>
      <aside className="sidebar">
        <div className="brand"><BrandMark size={34} tone="dark" /><div><strong>{PRODUCT.company}</strong><span>{PRODUCT.name}</span></div></div>
        <nav className="nav" aria-label={t("Main navigation")}>
          <p className="nav-label">{t(WORKSPACE_LABEL)}</p>
          {allowedNav.map((section, sectionIndex) => {
            const collapsed = Boolean(section.group && collapsedNavGroups.includes(section.group));
            return (
              <div className="nav-group" key={section.group ?? `primary-${sectionIndex}`}>
                {section.group ? (
                  <button className="nav-label nav-group-toggle" type="button" aria-expanded={!collapsed} onClick={() => toggleNavGroup(section.group!)}>
                    <span>{t(section.group)}</span><Icon name="chevronDown" />
                  </button>
                ) : null}
                <div className="nav-group-items" hidden={collapsed}>
                  {section.items.map((item) => {
                    const label = item.view === "manual" ? employeeManualLabel(language) : t(item.label);
                    return <button key={item.view} type="button" className={view === item.view ? "nav-item active" : "nav-item"} aria-current={view === item.view ? "page" : undefined} title={sidebarCollapsed ? label : undefined} onClick={() => { if (item.view === "inquiries") { setPreferredInquiryId(null); setStartInquiryCreate(false); } if (item.view === "estimates") setPreferredEstimateId(null); if (item.view === "site-visits") setPreferredSiteVisitId(null); setView(item.view); window.scrollTo({ top: 0 }); }}><Icon name={item.icon} /><span>{label}</span>{badgeFor(item.view, bootstrap, myWorkUrgentCount + taskAcknowledgmentCount) ? <em>{badgeFor(item.view, bootstrap, myWorkUrgentCount + taskAcknowledgmentCount)}</em> : null}</button>;
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-user"><span className="avatar sm">{initials(bootstrap.user.name)}</span><div><strong>{bootstrap.user.name}</strong><span>{bootstrap.user.department} · {bootstrap.user.role}</span></div><button type="button" aria-label={t("Sign out")} onClick={() => { void signOut(); }}><Icon name="logout" /></button></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={t(sidebarCollapsed ? "Expand navigation" : "Collapse navigation")}
            aria-expanded={!sidebarCollapsed}
            title={t(sidebarCollapsed ? "Expand navigation" : "Collapse navigation")}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <Icon name={sidebarCollapsed ? "chevronRight" : "chevronLeft"} />
          </button>
          <div className="production-indicator"><span className="status-dot online" /><strong>{t(IS_TEAM_TEST_MODE ? "Team Test" : "Production")}</strong><small>{t("SQL Server API")}</small></div>
          <div className="topbar-right">
            <button className="btn default sm" type="button" onClick={() => setSupportCreate(true)}><Icon name="inbox" />{supportLabel("Report a problem", language)}</button>
            <div className="lang-switch" role="group" aria-label={t("Language")}>
              {LANGUAGES.map((code) => (
                <button key={code} type="button" className={language === code ? "active" : ""} aria-pressed={language === code} onClick={() => setLanguage(code)}>{code}</button>
              ))}
            </div>
            <div className="menu-wrap">
              <button className="icon-btn" type="button" aria-label={t("Notifications")} aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((value) => !value); setUserOpen(false); void refreshNotifications(); }}>
                <Icon name="bell" />
                {notifications.some((item) => !item.isRead) ? <b>{Math.min(99, notifications.filter((item) => !item.isRead).length)}</b> : null}
              </button>
              {notificationOpen ? <div className="notification-menu" role="dialog" aria-label={t("Notifications")}>
                <div className="notification-head"><span><strong>{t("Notifications")}</strong><small>{notifications.filter((item) => !item.isRead).length} {t("unread notifications")}</small></span><button type="button" disabled={!notifications.some((item) => !item.isRead)} onClick={() => { void markNotificationsRead(); }}>{t("Mark all as read")}</button></div>
                <div className="notification-list">
                  {notifications.length ? notifications.map((item) => <button key={item.id} type="button" className={item.isRead ? "notification-item" : "notification-item unread"} onClick={() => openNotification(item)}>
                    <span className={`notification-icon ${item.kind === "MATERIAL_RECEIVED" ? "material" : ""}`}><Icon name={item.kind === "MATERIAL_RECEIVED" ? "package" : "bell"} /></span>
                    <span><strong>{item.entityType === "SupportTicket" ? supportLabel(item.kind === "SUPPORT_RECOGNITION" ? "Support recognition" : "Support update", language) : item.title}</strong><small>{item.entityType === "SupportTicket" ? supportLabel("View ticket", language) : item.detail}</small><time>{new Intl.DateTimeFormat(language === "TH" ? "th-TH" : language === "JP" ? "ja-JP" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></span>
                  </button>) : <div className="notification-empty"><Icon name="checkCircle" /><span>{t("No new notifications")}</span></div>}
                </div>
              </div> : null}
            </div>
            <div className="menu-wrap">
              <button className="topbar-user" type="button" onClick={() => { setUserOpen((value) => !value); setNotificationOpen(false); }}><span className="avatar sm">{initials(bootstrap.user.name)}</span><span>{bootstrap.user.name}<small>{bootstrap.user.role} · {bootstrap.user.department}</small></span><Icon name="chevronDown" /></button>
              {userOpen ? <div className="menu" role="menu"><button type="button" onClick={() => { setUserOpen(false); setView("profile"); }}><Icon name="user" />{t("My Profile")}</button><button type="button" onClick={() => { setUserOpen(false); setView("signature"); }}><Icon name="edit" />{t("My signature")}</button><button type="button" onClick={() => { setUserOpen(false); setView("manual"); }}><Icon name="book" />{employeeManualLabel(language)}</button><button type="button" disabled={busy} onClick={() => { setUserOpen(false); void signOut(); }}><Icon name="logout" />{t("Logout")}</button></div> : null}
            </div>
          </div>
        </header>
        <main className="page">
          {view === "dashboard" ? DASHBOARD_ROLES.includes(bootstrap.user.role) ? <ExecutiveDashboard bootstrap={bootstrap} personal={personalDashboard} onOpen={(destination, id) => {
            if (id && destination === "inquiries") openInquiry(id);
            else if (id && destination === "estimates") openEstimate(id);
            else if (id && destination === "projects") openProjectSchedule(id);
            else { setView(destination); window.scrollTo({ top: 0 }); }
          }} /> : personalDashboard : null}
          {view === "my-work" ? <><button className="btn default" type="button" onClick={()=>setView("activity")}><Icon name="chart"/>{t("Team Activity")}</button>{bootstrap.permissions.includes("visit.read") ? <button className="btn default" type="button" onClick={() => setView("my-assignments")}><Icon name="truck" />{t("งานเข้าหน้างานของฉัน")}</button> : null}<Tabs tabs={[{id:"inbox",label:"Task inbox · ตอบรับงาน",count:taskAcknowledgmentCount},{id:"schedule",label:"Project schedule tasks"}]} active={myWorkTab} onChange={setMyWorkTab} />{myWorkTab === "inbox" ? <ResourceTaskWorkspace {...common} mine openProjectSchedule={openProjectSchedule} onChanged={() => setTaskInboxRevision(value => value + 1)} /> : <ProductionMyWork {...moduleProps} />}</> : null}
          {view === "inquiries" ? <ProductionInquiries key={preferredInquiryId ?? (startInquiryCreate ? "create" : "list")} {...common} openEstimate={openEstimate} openVisit={openSiteVisit} startWithCreate={startInquiryCreate} preferredInquiryId={preferredInquiryId} /> : null}
          {view === "estimates" ? <ProductionEstimates key={preferredEstimateId ?? "estimate-list"} {...common} initialEstimateId={preferredEstimateId} /> : null}
          {view === "projects" ? <>
            <Tabs tabs={[{ id: "portfolio", label: t("Project Portfolio") }, { id: "schedule", label: t("Project Schedule") }, {id:"punchlist",label:"Punchlist · Issue ลูกค้า"}]} active={projectTab} onChange={setProjectTab} />
            <div style={{ marginTop: 14 }}>
              {projectTab === "portfolio" ? <ProductionProjects {...common} teamTestMode={IS_TEAM_TEST_MODE} /> : projectTab === "punchlist" ? <ResourceTaskWorkspace {...common} issues openProjectSchedule={openProjectSchedule} /> : <ProductionProjectSchedule {...moduleProps} />}
            </div>
          </> : null}
          {view === "knowledge" ? <ProductionKnowledgeHub bootstrap={bootstrap} notify={setToast} /> : null}
          {view === "sales-intake" ? <ProductionSalesIntake {...common} openVisit={openSiteVisit} openInquiry={openInquiry} startInquiry={startInquiry} /> : null}
          {view === "site-visits" ? <ProductionSiteVisits key={preferredSiteVisitId ?? "site-visit-list"} {...common} initialVisitId={preferredSiteVisitId} openInquiry={openInquiry} startInquiry={startInquiry} /> : null}
          {view === "my-assignments" ? <ProductionMyAssignments {...common} /> : null}
          {view === "visit-master" ? <ProductionVisitMasterData {...common} /> : null}
          {view === "price" ? <ProductionPriceLibrary {...moduleProps} /> : null}
          {view === "quotations" ? <ProductionSupplierQuotations {...moduleProps} /> : null}
          {view === "missing" ? <ProductionWaitingSupplierPrice {...moduleProps} /> : null}
          {view === "project-timeline" ? <ProductionProjectTimeline openProjectSchedule={openProjectSchedule} /> : null}
          {view === "resources" ? <ProductionResourcePlan {...moduleProps} refreshBootstrap={refreshBootstrap} openInquiry={openInquiry} openEstimate={openEstimate} /> : null}
          {view === "procurement" ? <ProductionProcurementDashboard {...moduleProps} /> : null}
          {view === "boms" ? <ProductionBoms {...moduleProps} /> : null}
          {view === "purchase" ? <ProductionPurchaseRequisitions {...moduleProps} /> : null}
          {view === "pos" ? <ProductionPurchaseOrders {...moduleProps} /> : null}
          {view === "inventory" ? <>
            <Tabs tabs={[{ id: "balances", label: t("Stock Balances") }, { id: "operations", label: t("Adjustments & Quarantine") }]} active={inventoryTab} onChange={setInventoryTab} />
            <div style={{ marginTop: 14 }}>
              {inventoryTab === "balances" ? <ProductionInventory bootstrap={bootstrap} /> : <ProductionInventoryOperations {...moduleProps} />}
            </div>
          </> : null}
          {view === "receiving" ? <ProductionGoodsReceiving {...moduleProps} /> : null}
          {view === "issues" ? <ProductionMaterialIssues {...moduleProps} /> : null}
          {view === "approvals" ? <ProductionApprovals {...moduleProps} /> : null}
          {view === "signing" ? <ProductionSignInbox bootstrap={bootstrap} notify={setToast} /> : null}
          {view === "documents" ? <ProductionSignedDocuments bootstrap={bootstrap} notify={setToast} initialVerifyCode={initialVerifyCode} /> : null}
          {view === "stamps" ? <ProductionCompanyStamps bootstrap={bootstrap} notify={setToast} /> : null}
          {view === "signature" ? <ProductionMySignature bootstrap={bootstrap} notify={setToast} /> : null}
          {view === "profile" ? <ProductionProfile bootstrap={bootstrap} language={language} onLanguageChange={setLanguage} onOpenMyWork={() => setView("my-work")} onOpenSignature={() => setView("signature")} /> : null}
          {view === "customers" ? <ProductionCustomers {...common} onOpenInquiries={() => setView("inquiries")} /> : null}
          {view === "reports" ? reportTab === "workspace" ? <ReportScreens {...common} onDirtyChange={onReportDirtyChange} onOpenAnalytics={() => { if (confirmReportNavigation()) setReportTab("analytics"); }} /> : <><button className="btn ghost" type="button" onClick={() => setReportTab("workspace")}>{t("Back to reports")}</button><ProductionReports {...moduleProps} /></> : null}
          {view === "activity" && bootstrap.permissions.includes("activity.read") ? <TeamActivityScreen openSource={(type,id,projectId)=>{if(projectId)openProjectSchedule(projectId);else if(type==="Inquiry")openInquiry(id);else setView("my-work");}}/> : null}
          {view === "performance" ? <Performance team={bootstrap.team} currentUser={{ ...bootstrap.user, level: "" }} notify={setToast} apiBacked openProjectSchedule={openProjectSchedule} openInquiry={openInquiry} openMyWork={() => setView("my-work")} /> : null}
          {view === "master" ? <ProductionMasterData {...common} onOpenInquiries={bootstrap.permissions.includes("inquiry.read") ? () => setView("inquiries") : undefined} /> : null}
          {view === "module-templates" ? <ProductionModuleTemplates bootstrap={bootstrap} notify={setToast} /> : null}
          {view === "rates" ? <ProductionEngineeringRates {...common} /> : null}
          {view === "audit" ? <ProductionAuditLog {...moduleProps} /> : null}
          {view === "settings" ? <ProductionSettings {...moduleProps} teamTestMode={IS_TEAM_TEST_MODE} /> : null}
          {view === "manual" ? <EmployeeManualScreen /> : null}
          {view === "support" ? <SupportCenter externalRevision={supportRevision} ticketId={supportTicketId} onSelect={openSupport} onCreate={() => setSupportCreate(true)} notify={setToast} onDirtyChange={onSupportDirtyChange} /> : null}
        </main>
        <footer className="app-footer">© 2026 {PRODUCT.company} · {PRODUCT.name} {PRODUCT.version} · {t(IS_TEAM_TEST_MODE ? "Team Test" : "Production")}</footer>
      </div>
      {toast ? <Toast message={toast} onDone={() => setToast("")} /> : null}
      {supportCreate ? <SupportCreateDialog context={{ module: view === "manual" ? employeeManualLabel(language) : NAV.flatMap(group => group.items).find(item => item.view === view)?.label ?? view }} onClose={() => setSupportCreate(false)} onCreated={() => { setSupportRevision(value => value + 1); void refreshNotifications(); }} onOpen={openSupport} /> : null}
    </div>
    </LanguageContext.Provider>
  );
}

function ProductionLogin({
  busy,
  error,
  teamTestMode,
  entraConfigured,
  apiConfigured,
  language,
  onLanguageChange,
  onSignIn,
}: {
  busy: boolean;
  error: string;
  teamTestMode: boolean;
  entraConfigured: boolean;
  apiConfigured: boolean;
  language: Lang;
  onLanguageChange: (language: Lang) => void;
  onSignIn: (teamTestEmail?: string, teamTestAccessCode?: string) => Promise<void>;
}) {
  const [teamTestEmail, setTeamTestEmail] = useState("");
  const [teamTestAccessCode, setTeamTestAccessCode] = useState("");
  const configured = (teamTestMode || entraConfigured) && apiConfigured;
  const missing = [
    !teamTestMode && !entraConfigured ? "Microsoft Entra (Tenant ID, Client ID และ API scope)" : "",
    !apiConfigured ? "HTTPS API origin" : "",
  ].filter(Boolean).join(" และ ");

  const t = (text: string) => translate(text, language);

  return <div className="login">
    <aside className="login-aside">
      <div className="login-brand"><BrandLockup tone="dark" height={44} /><span>{PRODUCT.name}</span></div>
      <div><h2>{PRODUCT.name}</h2><p className="login-strap">{t("Engineering Estimate Cost Management System")}</p><p>{t("IoT team workspace for inquiries, estimates, projects and materials with controlled access and an audit trail.")}</p><ul className="login-points"><li><Icon name="check" />{t(teamTestMode ? "Temporary team-test access" : "Microsoft company account")}</li><li><Icon name="check" />{t("SQL Server is the single source of record.")}</li><li><Icon name="check" />{t("Role-based access and safe concurrent editing.")}</li><li><Icon name="check" />{t("Unique document numbers with a traceable history.")}</li></ul></div>
      <div className="login-stats"><div><strong>{teamTestMode ? "TEST" : "Entra"}</strong><span>{t("Identity")}</span></div><div><strong>RBAC</strong><span>{t("Access")}</span></div><div><strong>SQL</strong><span>{t("System of record")}</span></div></div>
    </aside>
    <div className="login-form-wrap">
      <form className="login-form" onSubmit={(event) => { event.preventDefault(); if (configured) void onSignIn(teamTestEmail, teamTestAccessCode); }}>
        <div className="lang-switch" role="group" aria-label={t("Language")}>
          {LANGUAGES.map((code) => <button key={code} type="button" className={language === code ? "active" : ""} aria-pressed={language === code} onClick={() => onLanguageChange(code)}>{code}</button>)}
        </div>
        <h1>{t(teamTestMode ? "Team test sign in" : "Sign in")}</h1>
        <p>{t(teamTestMode ? "Use your registered email and temporary test access code." : "Use your Microsoft company account to enter the Production workspace.")}</p>
        {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
        {teamTestMode && apiConfigured ? <><label className="field"><span>{t("Registered email")}</span><input required type="email" maxLength={256} autoComplete="email" value={teamTestEmail} onChange={(event) => setTeamTestEmail(event.target.value)} /></label><label className="field"><span>{t("Personal test access code")}</span><input required type="password" maxLength={256} autoComplete="current-password" value={teamTestAccessCode} onChange={(event) => setTeamTestAccessCode(event.target.value)} /></label></> : null}
        {configured
          ? <button className="btn primary block" type="submit" disabled={busy}><Icon name="user" />{t(busy ? "Connecting…" : teamTestMode ? "Enter team test" : "Continue with Microsoft")}</button>
          : <div className="callout warning" role="status"><Icon name="alertTriangle" /><span>{t(teamTestMode ? "Team Test is not ready" : "Production is locked")} {t("until these settings are configured:")} {missing}</span></div>}
        <div className="login-role-hint"><strong>{t(teamTestMode ? "Temporary test access" : "Production access")}</strong>{t(teamTestMode ? "For temporary UAT use. The access code stays only in this browser session, and Production does not enable this mode." : "Roles and permissions are managed by the IoT Team Center administrator. This system does not receive or store your Microsoft password.")}</div>
      </form>
    </div>
  </div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function myWorkNeedsAttention(item: MyWorkUrgencyItem) {
  if (!item.canUpdate || item.status === "Done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const effectiveFinish = item.actualFinish ?? item.forecastFinish ?? item.planFinish;
  const late = Boolean(effectiveFinish && new Date(`${effectiveFinish.slice(0, 10)}T00:00:00`) < today);
  const needsForecast = !item.actualFinish && !item.forecastFinish
    && Boolean(item.planFinish && new Date(`${item.planFinish.slice(0, 10)}T00:00:00`) < today);
  const stale = item.status === "In Progress"
    && Date.now() - Date.parse(item.updatedAt) > 5 * 86_400_000;
  return late || item.status === "Blocked" || needsForecast || stale;
}

function badgeFor(view: View, bootstrap: BootstrapData, myWorkUrgentCount = 0) {
  if (view === "my-work") return myWorkUrgentCount;
  if (view === "inquiries") return bootstrap.counts.inquiries;
  if (view === "estimates") return bootstrap.counts.estimates;
  if (view === "projects") return bootstrap.counts.activeProjects;
  if (view === "approvals") return bootstrap.counts.approvals;
  return 0;
}
