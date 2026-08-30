"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandLockup, BrandMark } from "./Brand";
import { IS_ENTRA_CONFIGURED, restoreAccount, signInWithMicrosoft, signOutMicrosoft } from "./auth-client";
import { loadBootstrap, type BootstrapData } from "./api-client";
import { PRODUCT } from "./product";
import { Icon, Toast, type IconName } from "./ui";
import {
  ProductionDashboard,
  ProductionEstimates,
  ProductionInquiries,
  ProductionInventory,
  ProductionMasterData,
  ProductionProjects,
  ProductionTeam,
} from "./production/CoreScreens";

type View = "dashboard" | "inquiries" | "estimates" | "projects" | "inventory" | "master" | "team";

const NAV: { view: View; label: string; icon: IconName; permission?: string }[] = [
  { view: "dashboard", label: "Dashboard", icon: "grid" },
  { view: "inquiries", label: "Inquiry", icon: "inbox", permission: "inquiry.read" },
  { view: "estimates", label: "Estimate Cost", icon: "file", permission: "estimate.read" },
  { view: "projects", label: "Projects", icon: "folder", permission: "project.read" },
  { view: "inventory", label: "Inventory", icon: "database", permission: "inventory.read" },
  { view: "master", label: "Master Data", icon: "settings", permission: "master.read" },
  { view: "team", label: "Team & Access", icon: "users", permission: "master.read" },
];

export default function ProductionApp() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [busy, setBusy] = useState(IS_ENTRA_CONFIGURED);
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [userOpen, setUserOpen] = useState(false);

  const refreshBootstrap = async () => {
    setBootstrap(await loadBootstrap());
  };

  useEffect(() => {
    if (!IS_ENTRA_CONFIGURED) {
      return;
    }
    let cancelled = false;
    const restore = async () => {
      setBusy(true);
      try {
        const account = await restoreAccount();
        if (account && !cancelled) {
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

  const signIn = async () => {
    setBusy(true); setAuthError("");
    try { await signInWithMicrosoft(); setBootstrap(await loadBootstrap()); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to sign in with Microsoft."); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true); setAuthError("");
    try { await signOutMicrosoft(); setBootstrap(null); setView("dashboard"); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  };

  const allowedNav = useMemo(() => NAV.filter((item) => !item.permission || bootstrap?.permissions.includes(item.permission)), [bootstrap]);

  if (!bootstrap) return <ProductionLogin busy={busy} error={authError} entraConfigured={IS_ENTRA_CONFIGURED} onSignIn={signIn} />;

  const common = { bootstrap, notify: setToast, refreshBootstrap };
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><BrandMark size={34} tone="dark" /><div><strong>{PRODUCT.company}</strong><span>{PRODUCT.name}</span></div></div>
        <nav className="nav" aria-label="Main navigation">
          <p className="nav-label">PRODUCTION</p>
          {allowedNav.map((item) => <button key={item.view} type="button" className={view === item.view ? "nav-item active" : "nav-item"} aria-current={view === item.view ? "page" : undefined} onClick={() => { setView(item.view); window.scrollTo({ top: 0 }); }}><Icon name={item.icon} /><span>{item.label}</span>{badgeFor(item.view, bootstrap) ? <em>{badgeFor(item.view, bootstrap)}</em> : null}</button>)}
        </nav>
        <div className="sidebar-user"><span className="avatar sm">{initials(bootstrap.user.name)}</span><div><strong>{bootstrap.user.name}</strong><span>{bootstrap.user.department} · {bootstrap.user.role}</span></div><button type="button" aria-label="Sign out" onClick={() => { void signOut(); }}><Icon name="logout" /></button></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="production-indicator"><span className="status-dot online" /><strong>Production</strong><small>SQL Server API</small></div>
          <div className="topbar-right">
            <div className="menu-wrap">
              <button className="topbar-user" type="button" onClick={() => setUserOpen((value) => !value)}><span className="avatar sm">{initials(bootstrap.user.name)}</span><span>{bootstrap.user.name}<small>{bootstrap.user.role} · {bootstrap.user.department}</small></span><Icon name="chevronDown" /></button>
              {userOpen ? <div className="menu" role="menu"><button type="button" onClick={() => { setUserOpen(false); setView("team"); }}><Icon name="shield" />Permissions</button><button type="button" disabled={busy} onClick={() => { setUserOpen(false); void signOut(); }}><Icon name="logout" />Logout</button></div> : null}
            </div>
          </div>
        </header>
        <main className="page">
          {view === "dashboard" ? <ProductionDashboard bootstrap={bootstrap} /> : null}
          {view === "inquiries" ? <ProductionInquiries {...common} /> : null}
          {view === "estimates" ? <ProductionEstimates {...common} /> : null}
          {view === "projects" ? <ProductionProjects {...common} /> : null}
          {view === "inventory" ? <ProductionInventory bootstrap={bootstrap} /> : null}
          {view === "master" ? <ProductionMasterData {...common} /> : null}
          {view === "team" ? <ProductionTeam bootstrap={bootstrap} /> : null}
        </main>
        <footer className="app-footer">© 2026 {PRODUCT.company} · {PRODUCT.name} {PRODUCT.version} · Production</footer>
      </div>
      {toast ? <Toast message={toast} onDone={() => setToast("")} /> : null}
    </div>
  );
}

function ProductionLogin({ busy, error, entraConfigured, onSignIn }: { busy: boolean; error: string; entraConfigured: boolean; onSignIn: () => Promise<void> }) {
  return <div className="login">
    <aside className="login-aside">
      <div className="login-brand"><BrandLockup tone="dark" height={44} /><span>{PRODUCT.name}</span></div>
      <div><h2>{PRODUCT.name}</h2><p className="login-strap">Engineering Estimate Cost Management System</p><p>พื้นที่ทำงานจริงของทีม IoT สำหรับ Inquiry, Estimate, Project และ Material ที่มีสิทธิ์การเข้าถึงและ Audit trail</p><ul className="login-points"><li><Icon name="check" />Microsoft company account</li><li><Icon name="check" />SQL Server เป็นแหล่งข้อมูลกลางเพียงแห่งเดียว</li><li><Icon name="check" />Role-based access และ optimistic concurrency</li><li><Icon name="check" />เลขเอกสารไม่ซ้ำและตรวจสอบย้อนหลังได้</li></ul></div>
      <div className="login-stats"><div><strong>Entra</strong><span>Identity</span></div><div><strong>RBAC</strong><span>Access</span></div><div><strong>SQL</strong><span>System of record</span></div></div>
    </aside>
    <div className="login-form-wrap"><form className="login-form" onSubmit={(event) => { event.preventDefault(); if (entraConfigured) void onSignIn(); }}><h1>Sign in</h1><p>ใช้บัญชี Microsoft ของบริษัทเพื่อเข้าสู่ Production workspace</p>{error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}{entraConfigured ? <button className="btn primary block" type="submit" disabled={busy}><Icon name="user" />{busy ? "Connecting…" : "Continue with Microsoft"}</button> : <><div className="callout warning" role="status"><Icon name="alertTriangle" /><span>Production ยังล็อกอยู่ เพราะ Microsoft Entra เป็นค่าตัวอย่าง กรุณากำหนด Tenant ID, Client ID และ API scope จริงก่อนใช้งาน</span></div><a className="btn primary block" href="/demo"><Icon name="arrowRight" />เปิด Local Demo</a></>}<div className="login-role-hint"><strong>Production access</strong>บทบาทและสิทธิ์ถูกกำหนดโดยผู้ดูแล IoT Team Center ระบบนี้ไม่รับหรือจัดเก็บรหัสผ่าน Microsoft</div></form></div>
  </div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function badgeFor(view: View, bootstrap: BootstrapData) {
  if (view === "inquiries") return bootstrap.counts.inquiries;
  if (view === "estimates") return bootstrap.counts.estimates;
  if (view === "projects") return bootstrap.counts.activeProjects;
  return 0;
}
