"use client";

import { useEffect, useMemo, useState } from "react";
import { exportXlsx } from "../lib/export-xlsx";

type View = "dashboard" | "estimates" | "approvals" | "suppliers" | "rates" | "detail";
type Customer = { id: number; code: string; name: string; contact_name?: string; email?: string };
type Supplier = { id: number; code: string; name: string; category: string; contact_name?: string; email?: string; phone?: string; status?: string };
type User = { id: number; name: string; email: string; role: string };
type Estimate = { id: number; estimate_no: string; project_name: string; customer_name: string; customer_code: string; engineer_name: string; assigned_to: number; leader_id: number; manager_id: number; due_date: string; progress: number; status: string; selected_modules: string };
type Check = { id: number; label: string; completed: number; weight: number };
type CostItem = { id: number; category: string; module: string; model: string; description: string; supplier_name?: string; unit_price: number; quantity: number; unit: string };
type Rate = { id: number; workforce_type: string; discipline: string; work_type: string; unit: string; rate: number };
type Approval = { id: number; stage: string; sequence: number; approver_name: string; status: string; comment?: string };
type AppData = { customers: Customer[]; suppliers: Supplier[]; users: User[]; estimates: Estimate[]; checklist: Check[]; costItems: CostItem[]; laborRates: Rate[]; approvals: Approval[] };

type EstimateForm = { customerId: number; projectName: string; assignedTo: number; leaderId: number; managerId: number; dueDate: string; modules: string[] };
type SupplierForm = { code: string; name: string; category: string; contactName: string; email: string; phone: string };
type DetailTab = "cost" | "manpower" | "summary";
type Stage = "Leader" | "Manager";

const fallback: AppData = {
  customers:[{id:1,code:"SDM",name:"Siam DENSO Manufacturing"},{id:2,code:"MEJ",name:"Meiji Thailand"},{id:3,code:"AAP",name:"AAPICO Hitech"},{id:4,code:"TTC",name:"Thai Takagi Seiko"}],
  suppliers:[{id:1,code:"SUP-KEY",name:"Keyence Thailand",category:"Vision & PLC",contact_name:"Sales Team",email:"sales@keyence.example",phone:"02-000-0001",status:"Active"},{id:2,code:"SUP-MIS",name:"Mitsumi Electric",category:"Electrical",contact_name:"Account Team",email:"sales@mitsumi.example",phone:"02-000-0002",status:"Active"},{id:3,code:"SUP-LOC",name:"Local Fabrication Partner",category:"Mechanical",contact_name:"Somchai",email:"contact@localfab.example",phone:"081-000-0003",status:"Active"},{id:4,code:"SUP-AMR",name:"Hikrobot Logistics",category:"AMR / CTU",contact_name:"Regional Sales",email:"sales@hikrobot.example",phone:"02-000-0004",status:"Active"}],
  users:[{id:1,name:"Nattapol Poeam",email:"nattapol@tomas-tech.com",role:"Engineer"},{id:2,name:"Phatthadon",email:"phatthadon@tomas-tech.com",role:"Engineer"},{id:3,name:"Taweesak",email:"taweesak@tomas-tech.com",role:"Leader"},{id:4,name:"IoT Manager",email:"manager@tomas-tech.com",role:"Manager"}],
  estimates:[
    {id:1,estimate_no:"EST-SDM-2026-0001-R02",project_name:"Machine Learning Molding & Leak Predict System",customer_name:"Siam DENSO Manufacturing",customer_code:"SDM",engineer_name:"Nattapol Poeam",assigned_to:1,leader_id:3,manager_id:4,due_date:"2026-08-28",progress:78,status:"In progress",selected_modules:'["CTU","AMR"]'},
    {id:2,estimate_no:"EST-MEJ-2026-0004-R00",project_name:"Packing Line Vision Inspection",customer_name:"Meiji Thailand",customer_code:"MEJ",engineer_name:"Phatthadon",assigned_to:2,leader_id:3,manager_id:4,due_date:"2026-08-30",progress:52,status:"Draft",selected_modules:'["Server"]'},
    {id:3,estimate_no:"EST-AAP-2026-0012-R01",project_name:"AMR Material Transfer Phase 2",customer_name:"AAPICO Hitech",customer_code:"AAP",engineer_name:"Nattapol Poeam",assigned_to:1,leader_id:3,manager_id:4,due_date:"2026-08-24",progress:100,status:"Leader review",selected_modules:'["AMR","Infrastructure"]'},
    {id:4,estimate_no:"EST-TTC-2026-0018-R00",project_name:"IoT Energy Monitoring",customer_name:"Thai Takagi Seiko",customer_code:"TTC",engineer_name:"Nattapol Poeam",assigned_to:1,leader_id:3,manager_id:4,due_date:"2026-08-20",progress:100,status:"Approved",selected_modules:'["Server","Infrastructure"]'},
  ],
  checklist:[{id:1,label:"Project & customer information",completed:1,weight:15},{id:2,label:"Project modules selected",completed:1,weight:10},{id:3,label:"Equipment and supplier cost",completed:1,weight:30},{id:4,label:"Internal manpower plan",completed:1,weight:20},{id:5,label:"External manpower quotation",completed:0,weight:15},{id:6,label:"Final cost validation",completed:0,weight:10}],
  costItems:[{id:1,category:"Hardware",module:"Core",model:"KV-8000",description:"PLC",supplier_name:"Keyence Thailand",unit_price:250000,quantity:1,unit:"Set"},{id:2,category:"Hardware",module:"Core",model:"VS-L160MX",description:"Camera System",supplier_name:"Keyence Thailand",unit_price:350000,quantity:2,unit:"Set"},{id:3,category:"Electrical",module:"Core",model:"CP-SDM-01",description:"Control Panel",supplier_name:"Mitsumi Electric",unit_price:61190,quantity:1,unit:"Set"},{id:4,category:"Mechanical",module:"Core",model:"AL-FRAME",description:"Machine Base",supplier_name:"Local Fabrication Partner",unit_price:11500,quantity:2,unit:"Set"},{id:5,category:"Robot",module:"CTU",model:"MR-TP5-50DCH",description:"CTU Robot & Charger",supplier_name:"Hikrobot Logistics",unit_price:525000,quantity:1,unit:"Set"},{id:6,category:"Robot",module:"AMR",model:"MR-Q3-600LE-D",description:"AMR Robot",supplier_name:"Hikrobot Logistics",unit_price:385000,quantity:1,unit:"Set"},{id:7,category:"Software",module:"Core",model:"",description:"System implementation and test run",supplier_name:"TOMAS TECH",unit_price:3500,quantity:20,unit:"Day"}],
  laborRates:[{id:1,workforce_type:"Internal",discipline:"Mech",work_type:"Normal",unit:"day",rate:1800},{id:2,workforce_type:"Internal",discipline:"Mech",work_type:"OT",unit:"hour",rate:225},{id:3,workforce_type:"Internal",discipline:"Mech",work_type:"Holiday",unit:"day",rate:3600},{id:4,workforce_type:"Internal",discipline:"Software",work_type:"Normal",unit:"day",rate:3500},{id:5,workforce_type:"External",discipline:"Mech",work_type:"Normal",unit:"day",rate:1600},{id:6,workforce_type:"External",discipline:"Elec",work_type:"Normal",unit:"day",rate:1600}],
  approvals:[{id:1,stage:"Leader",sequence:1,approver_name:"Taweesak",status:"Pending"},{id:2,stage:"Manager",sequence:2,approver_name:"IoT Manager",status:"Waiting"}],
};

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });
const shortDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const labelTone = (status: string) => status.includes("Approved") ? "green" : status.includes("review") || status.includes("approval") ? "amber" : status === "Draft" ? "gray" : status === "Returned" ? "rose" : "blue";
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const isWaiting = (estimate: Estimate) => estimate.status.includes("review") || estimate.status.includes("approval");

/* ==========================================================================
   Icons — inline SVG so glyphs render identically on every platform.
   Feather-style 24x24, stroke follows currentColor, sized by font-size.
   ========================================================================== */

const ICON_PATHS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  truck: <><rect x="1" y="3" width="15" height="13" rx="1" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  currency: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  award: <><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></>,
  alertCircle: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  alertTriangle: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  chevronRight: <polyline points="9 18 15 12 9 6" />,
  arrowLeft: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
  arrowRight: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
} as const;

type IconName = keyof typeof ICON_PATHS;

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

function EmptyState({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

/* ==========================================================================
   Root
   ========================================================================== */

export default function EstimateApp() {
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<AppData>(fallback);
  const [selectedId, setSelectedId] = useState(1);
  const [newEstimate, setNewEstimate] = useState(false);
  const [newSupplier, setNewSupplier] = useState(false);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EstimateForm>({ customerId: 1, projectName: "", assignedTo: 1, leaderId: 3, managerId: 4, dueDate: "2026-09-15", modules: ["CTU"] });
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({ code: "", name: "", category: "General", contactName: "", email: "", phone: "" });
  const [detailTab, setDetailTab] = useState<DetailTab>("cost");
  const [manpowerQty, setManpowerQty] = useState<Record<number, number>>({ 1: 8, 2: 12, 3: 2, 4: 18, 5: 4, 6: 5 });

  const selected = data.estimates.find((e) => e.id === selectedId) ?? data.estimates[0];
  const totalCost = useMemo(() => data.costItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) + data.laborRates.reduce((sum, rate) => sum + rate.rate * (manpowerQty[rate.id] ?? 0), 0), [data.costItems, data.laborRates, manpowerQty]);
  const calculatedProgress = useMemo(() => data.checklist.reduce((sum, c) => sum + (c.completed ? c.weight : 0), 0), [data.checklist]);
  const waitingCount = useMemo(() => data.estimates.filter(isWaiting).length, [data.estimates]);

  useEffect(() => { fetch("/api/app-data").then((r) => r.ok ? r.json() : Promise.reject()).then((loaded: AppData) => setData(loaded)).catch(() => undefined); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  function openDetail(id: number) { setSelectedId(id); setDetailTab("cost"); setView("detail"); }
  async function refresh() { const response = await fetch("/api/app-data"); if (response.ok) setData(await response.json()); }

  async function createEstimate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setNewEstimate(false);
      setToast(`Created ${result.estimate.estimate_no}`);
      setView("estimates");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create estimate");
    } finally {
      setSaving(false);
    }
  }

  async function createSupplier(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(supplierForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setNewSupplier(false);
      setSupplierForm({ code: "", name: "", category: "General", contactName: "", email: "", phone: "" });
      setToast(`Added ${result.supplier.name}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create supplier");
    } finally {
      setSaving(false);
    }
  }

  async function workflow(action: "submit" | "approve" | "return", stage?: Stage) {
    const comment = action === "return" ? "Please verify supplier quotation and manpower scope." : "";
    const response = await fetch("/api/estimates/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estimateId: selected.id, action, stage, comment }) });
    if (response.ok) {
      await refresh();
      setToast(action === "return" ? "Estimate returned with a reason" : "Workflow updated");
    }
  }

  async function exportSummary() {
    const rows: (string | number | null)[][] = [
      ["ESTIMATE COST"],
      ["Project name", "", selected.project_name, "Estimate No.", selected.estimate_no],
      ["Customer", "", selected.customer_name, "Revision", selected.estimate_no.split("-R")[1]],
      ["Status", "", selected.status, "Date", new Date().toLocaleDateString("en-GB")],
      [],
      ["Item", "Model/Part Number", "Description/Detail", "Supplier", "Brand", "Lead Time", "Quote Rev.", "Unit price", "Quantity", "Total (BATH)", "Unit", "Remark"],
    ];
    data.costItems.forEach((item, index) => rows.push([index + 1, item.model, item.description, item.supplier_name ?? "", "", "", "", item.unit_price, item.quantity, item.unit_price * item.quantity, item.unit, item.module === "Core" ? "" : item.module]));
    rows.push([], [], ["", "", "", "", "", "", "", "Sub Total", "", totalCost]);
    exportXlsx(rows, `${selected.estimate_no}_Summary_cost.xlsx`);
    setToast("Exported Summary cost Excel");
  }

  return (
    <main className="app-shell">
      <Sidebar view={view} setView={setView} estimateCount={data.estimates.length} waitingCount={waitingCount} />
      <section className="workspace">
        {view === "dashboard" && <Dashboard data={data} progress={calculatedProgress} waitingCount={waitingCount} onNew={() => setNewEstimate(true)} onOpen={openDetail} setView={setView} />}
        {view === "estimates" && <EstimatesPage data={data} onNew={() => setNewEstimate(true)} onOpen={openDetail} />}
        {view === "detail" && <DetailPage estimate={selected} data={data} tab={detailTab} setTab={setDetailTab} total={totalCost} qty={manpowerQty} setQty={setManpowerQty} progress={calculatedProgress} onBack={() => setView("estimates")} onSubmit={() => workflow("submit")} onExport={exportSummary} />}
        {view === "approvals" && <ApprovalsPage data={data} onOpen={openDetail} onApprove={(stage) => workflow("approve", stage)} onReturn={(stage) => workflow("return", stage)} />}
        {view === "suppliers" && <SuppliersPage suppliers={data.suppliers} onNew={() => setNewSupplier(true)} />}
        {view === "rates" && <RatesPage rates={data.laborRates} />}
      </section>
      {newEstimate && <EstimateModal data={data} form={form} setForm={setForm} onClose={() => setNewEstimate(false)} onSubmit={createEstimate} saving={saving} />}
      {newSupplier && <SupplierModal form={supplierForm} setForm={setSupplierForm} onClose={() => setNewSupplier(false)} onSubmit={createSupplier} saving={saving} />}
      {toast && <div className="toast" role="status"><Icon name="checkCircle" />{toast}</div>}
    </main>
  );
}

/* ==========================================================================
   Chrome
   ========================================================================== */

function Sidebar({ view, setView, estimateCount, waitingCount }: { view: View; setView: (view: View) => void; estimateCount: number; waitingCount: number }) {
  const nav = (target: View, label: string, icon: IconName, count?: number) => (
    <button className={`nav-item ${view === target ? "active" : ""}`} onClick={() => setView(target)} aria-current={view === target ? "page" : undefined}>
      <Icon name={icon} />
      {label}
      {count ? <em>{count}</em> : null}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">T</div>
        <div>
          <strong>TOMAS TECH</strong>
          <span>Estimate Cost</span>
        </div>
      </div>
      <nav aria-label="เมนูหลัก">
        {nav("dashboard", "Dashboard", "grid")}
        {nav("estimates", "Estimates", "file", estimateCount)}
        {nav("approvals", "My approvals", "checkCircle", waitingCount)}
        <p className="nav-label">MASTER DATA</p>
        <button className="nav-item"><Icon name="users" />Customers</button>
        {nav("suppliers", "Suppliers", "truck")}
        {nav("rates", "Labor rates", "currency")}
        <button className="nav-item"><Icon name="package" />Equipment catalog</button>
      </nav>
      <div className="sidebar-profile">
        <div className="avatar">NP</div>
        <div>
          <strong>Nattapol Poeam</strong>
          <span>Engineer</span>
        </div>
        <button aria-label="เมนูผู้ใช้"><Icon name="more" /></button>
      </div>
    </aside>
  );
}

function Header({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="top-actions">{action}</div>
    </header>
  );
}

function Metric({ label, value, note, accent, icon }: { label: string; value: string; note: string; accent: string; icon: IconName }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${accent}`}><Icon name={icon} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </article>
  );
}

function EstimateTable({ estimates, onOpen }: { estimates: Estimate[]; onOpen: (id: number) => void }) {
  if (!estimates.length) {
    return <EmptyState icon="inbox" title="No estimates yet" message="Create an estimate to start tracking cost, manpower and approvals." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Estimate / Project</th>
            <th>Assigned to</th>
            <th>Due date</th>
            <th>Progress</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {estimates.map((e) => (
            <tr key={e.id}>
              <td>
                <strong>{e.project_name}</strong>
                <span>{e.estimate_no} · {e.customer_name}</span>
              </td>
              <td>
                <div className="person"><i>{initials(e.engineer_name)}</i>{e.engineer_name}</div>
              </td>
              <td>{shortDate(e.due_date)}</td>
              <td>
                <div className="progress-label">
                  <span>{e.progress}%</span>
                  <div className="progress"><b style={{ width: `${e.progress}%` }} /></div>
                </div>
              </td>
              <td><span className={`status ${labelTone(e.status)}`}>{e.status}</span></td>
              <td>
                <button className="row-action" onClick={() => onOpen(e.id)} aria-label={`Open ${e.estimate_no}`}><Icon name="chevronRight" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==========================================================================
   Pages
   ========================================================================== */

function Dashboard({ data, progress, waitingCount, onNew, onOpen, setView }: { data: AppData; progress: number; waitingCount: number; onNew: () => void; onOpen: (id: number) => void; setView: (v: View) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const active = data.estimates.filter((e) => e.status !== "Approved").length;
  const approved = data.estimates.filter((e) => e.status === "Approved").length;
  const overdue = data.estimates.filter((e) => e.status !== "Approved" && e.due_date < today).length;

  const attention = [
    { tone: "urgent", icon: "alertTriangle" as IconName, title: overdue === 1 ? "1 estimate is overdue" : `${overdue} estimates are overdue`, note: "Past the committed due date" },
    { tone: "waiting", icon: "clock" as IconName, title: `${waitingCount} waiting for your review`, note: "Leader and Manager queue" },
    { tone: "supplier", icon: "truck" as IconName, title: `${data.suppliers.length} suppliers on file`, note: "Reusable across every estimate" },
  ];

  return (
    <>
      <Header
        eyebrow="ESTIMATE COST WORKSPACE"
        title="Good morning, Nattapol"
        subtitle="Here’s what needs your attention today."
        action={
          <>
            <button className="icon-button" aria-label="การแจ้งเตือน">
              <Icon name="bell" />
              {waitingCount ? <b>{waitingCount}</b> : null}
            </button>
            <button className="primary-button" onClick={onNew}><Icon name="plus" />New estimate</button>
          </>
        }
      />
      <section className="metrics">
        <Metric label="Active estimates" value={String(active)} note="Not yet approved" accent="mint" icon="layers" />
        <Metric label="Waiting for review" value={String(waitingCount)} note="Leader action required" accent="sun" icon="clock" />
        <Metric label="Approved" value={String(approved)} note="Ready to export" accent="sky" icon="award" />
        <Metric label="Overdue" value={String(overdue)} note="Needs attention" accent="rose" icon="alertCircle" />
      </section>
      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Estimate pipeline</h2>
              <p>Current work across your team</p>
            </div>
            <button className="text-button" onClick={() => setView("estimates")}>View all<Icon name="arrowRight" /></button>
          </div>
          <EstimateTable estimates={data.estimates} onOpen={onOpen} />
        </article>
        <aside className="right-stack">
          <article className="panel attention-panel">
            <div className="panel-heading">
              <div>
                <h2>Needs attention</h2>
                <p>Reviews and deadlines</p>
              </div>
            </div>
            {attention.map((item) => (
              <div className="attention-item" key={item.title}>
                <span className={`attention-dot ${item.tone}`}><Icon name={item.icon} /></span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.note}</p>
                </div>
                <button onClick={() => setView("approvals")}>Open</button>
              </div>
            ))}
          </article>
          <article className="panel checklist-panel">
            <div className="panel-heading">
              <div>
                <h2>Estimate readiness</h2>
                <p>{data.estimates[0]?.estimate_no ?? "—"}</p>
              </div>
              <strong>{progress}%</strong>
            </div>
            <div className="big-progress"><b style={{ width: `${progress}%` }} /></div>
            <ul>
              {data.checklist.slice(0, 5).map((c, index) => (
                <li className={c.completed ? "done" : ""} key={c.id}>
                  <span>{c.completed ? <Icon name="check" /> : index + 1}</span>
                  {c.label}
                </li>
              ))}
            </ul>
            <button className="secondary-button" onClick={() => onOpen(data.estimates[0]?.id ?? 1)}>Continue estimate<Icon name="arrowRight" /></button>
          </article>
        </aside>
      </section>
    </>
  );
}

function EstimatesPage({ data, onNew, onOpen }: { data: AppData; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <>
      <Header
        eyebrow="ESTIMATES"
        title="All estimate costs"
        subtitle="Track assignments, progress, revisions and approvals."
        action={<button className="primary-button" onClick={onNew}><Icon name="plus" />New estimate</button>}
      />
      <div className="filter-bar">
        <input aria-label="Search estimates" placeholder="Search estimate, project or customer…" />
        <select aria-label="Status filter">
          <option>All status</option>
          <option>Draft</option>
          <option>Leader review</option>
          <option>Manager approval</option>
          <option>Approved</option>
        </select>
        <select aria-label="Assignee filter">
          <option>All assignees</option>
          {data.users.filter((u) => u.role === "Engineer").map((u) => <option key={u.id}>{u.name}</option>)}
        </select>
      </div>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>{data.estimates.length} estimates</h2>
            <p>Numbering is linked to customer and revision</p>
          </div>
        </div>
        <EstimateTable estimates={data.estimates} onOpen={onOpen} />
      </article>
    </>
  );
}

function DetailPage({ estimate, data, tab, setTab, total, qty, setQty, progress, onBack, onSubmit, onExport }: { estimate: Estimate; data: AppData; tab: DetailTab; setTab: (t: DetailTab) => void; total: number; qty: Record<number, number>; setQty: (q: Record<number, number>) => void; progress: number; onBack: () => void; onSubmit: () => void; onExport: () => void }) {
  const modules = JSON.parse(estimate.selected_modules || "[]") as string[];
  const equipmentTotal = data.costItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const manpowerTotal = data.laborRates.reduce((sum, rate) => sum + rate.rate * (qty[rate.id] ?? 0), 0);

  return (
    <>
      <button className="back-button" onClick={onBack}><Icon name="arrowLeft" />All estimates</button>
      <Header
        eyebrow={estimate.estimate_no}
        title={estimate.project_name}
        subtitle={`${estimate.customer_name} · Assigned to ${estimate.engineer_name}`}
        action={
          <>
            <span className={`status large ${labelTone(estimate.status)}`}>{estimate.status}</span>
            {estimate.status === "Approved"
              ? <button className="primary-button" onClick={onExport}><Icon name="download" />Export Excel</button>
              : <button className="primary-button" onClick={onSubmit}>Submit for review</button>}
          </>
        }
      />
      <section className="detail-summary">
        <div>
          <span>Progress</span>
          <strong>{progress}%</strong>
          <div className="progress wide"><b style={{ width: `${progress}%` }} /></div>
        </div>
        <div>
          <span>Due date</span>
          <strong>{shortDate(estimate.due_date)}</strong>
        </div>
        <div>
          <span>Modules</span>
          <p>{modules.length ? modules.map((m) => <em key={m}>{m}</em>) : <em>Core only</em>}</p>
        </div>
        <div>
          <span>Current cost</span>
          <strong>{money.format(total)}</strong>
        </div>
      </section>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "cost"} className={tab === "cost" ? "active" : ""} onClick={() => setTab("cost")}>Cost items</button>
        <button role="tab" aria-selected={tab === "manpower"} className={tab === "manpower" ? "active" : ""} onClick={() => setTab("manpower")}>Manpower</button>
        <button role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Summary &amp; export</button>
      </div>

      {tab === "cost" && (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Equipment and service cost</h2>
              <p>CTU and AMR models can be included in the same project</p>
            </div>
            <button className="secondary-small"><Icon name="plus" />Add item</button>
          </div>
          {data.costItems.length ? (
            <div className="table-wrap">
              <table className="cost-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Module / Model</th>
                    <th>Description</th>
                    <th>Supplier</th>
                    <th>Unit price</th>
                    <th>Qty.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.costItems.map((i) => (
                    <tr key={i.id}>
                      <td>{i.category}</td>
                      <td>
                        <span className="module-chip">{i.module}</span>
                        <strong>{i.model || "—"}</strong>
                      </td>
                      <td>{i.description}</td>
                      <td>{i.supplier_name || "—"}</td>
                      <td>{compactMoney.format(i.unit_price)}</td>
                      <td>{i.quantity} {i.unit}</td>
                      <td><strong>{compactMoney.format(i.unit_price * i.quantity)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="package" title="No cost items" message="Add equipment, electrical, mechanical or software lines to build the estimate." />
          )}
        </article>
      )}

      {tab === "manpower" && (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Manpower plan</h2>
              <p>Rates are locked by Admin; Engineer selects work type and quantity</p>
            </div>
            <span className="lock-badge"><Icon name="lock" />Rates locked</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workforce</th>
                  <th>Discipline</th>
                  <th>Work type</th>
                  <th>Locked rate</th>
                  <th>Quantity</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.laborRates.map((r) => (
                  <tr key={r.id}>
                    <td><span className={`status ${r.workforce_type === "Internal" ? "blue" : "amber"}`}>{r.workforce_type}</span></td>
                    <td>{r.discipline}</td>
                    <td>{r.work_type}</td>
                    <td>{compactMoney.format(r.rate)} / {r.unit}</td>
                    <td>
                      <input className="qty-input" type="number" min="0" value={qty[r.id] ?? 0} onChange={(e) => setQty({ ...qty, [r.id]: Number(e.target.value) })} aria-label={`Quantity for ${r.workforce_type} ${r.discipline} ${r.work_type}`} />
                    </td>
                    <td><strong>{money.format(r.rate * (qty[r.id] ?? 0))}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {tab === "summary" && (
        <section className="summary-grid">
          <article className="panel summary-card">
            <div className="panel-heading">
              <div>
                <h2>Internal estimate cost</h2>
                <p>Profit is not included</p>
              </div>
            </div>
            <div className="summary-line"><span>Equipment &amp; services</span><strong>{money.format(equipmentTotal)}</strong></div>
            <div className="summary-line"><span>Manpower</span><strong>{money.format(manpowerTotal)}</strong></div>
            <div className="summary-line total"><span>Grand total</span><strong>{money.format(total)}</strong></div>
            <button className="primary-button full" onClick={onExport}><Icon name="download" />Export Summary cost (.xlsx)</button>
          </article>
          <article className="panel">
            <div className="panel-heading">
              <div>
                <h2>Automatic checklist</h2>
                <p>Required before review</p>
              </div>
              <strong className="green-text">{progress}%</strong>
            </div>
            <ul className="full-checklist">
              {data.checklist.map((c) => (
                <li key={c.id} className={c.completed ? "done" : ""}>
                  <span>{c.completed ? <Icon name="check" /> : "○"}</span>
                  <div>
                    <strong>{c.label}</strong>
                    <small>Weight {c.weight}%</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}
    </>
  );
}

function ApprovalsPage({ data, onOpen, onApprove, onReturn }: { data: AppData; onOpen: (id: number) => void; onApprove: (s: Stage) => void; onReturn: (s: Stage) => void }) {
  const waiting = data.estimates.filter(isWaiting);

  return (
    <>
      <Header eyebrow="APPROVAL WORKFLOW" title="My approvals" subtitle="Leader approval must complete before Manager approval." />
      <section className="approval-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Waiting for action</h2>
              <p>{waiting.length === 1 ? "1 estimate needs review" : `${waiting.length} estimates need review`}</p>
            </div>
          </div>
          {waiting.length ? waiting.map((e) => (
            <div className="approval-row" key={e.id}>
              <div>
                <span className="code">{e.estimate_no}</span>
                <strong>{e.project_name}</strong>
                <p>{e.customer_name} · Due {shortDate(e.due_date)}</p>
              </div>
              <span className={`status ${labelTone(e.status)}`}>{e.status}</span>
              <button className="row-action" onClick={() => onOpen(e.id)} aria-label={`Open ${e.estimate_no}`}><Icon name="chevronRight" /></button>
            </div>
          )) : (
            <EmptyState icon="checkCircle" title="Nothing waiting" message="Every estimate assigned to you has been reviewed." />
          )}
        </article>
        <article className="panel workflow-card">
          <div className="panel-heading">
            <div>
              <h2>Approval chain</h2>
              <p>Selected for this estimate</p>
            </div>
          </div>
          {data.approvals.map((a, index) => (
            <div className="approval-step" key={a.id}>
              <span>{a.status === "Approved" ? <Icon name="check" /> : index + 1}</span>
              <div>
                <small>{a.stage}</small>
                <strong>{a.approver_name}</strong>
                <em>{a.status}</em>
              </div>
              {a.status === "Pending" && (
                <div className="approval-actions">
                  <button className="approve" onClick={() => onApprove(a.stage as Stage)}>Approve</button>
                  <button className="return" onClick={() => onReturn(a.stage as Stage)}>Return</button>
                </div>
              )}
            </div>
          ))}
        </article>
      </section>
    </>
  );
}

function SuppliersPage({ suppliers, onNew }: { suppliers: Supplier[]; onNew: () => void }) {
  return (
    <>
      <Header
        eyebrow="MASTER DATA"
        title="Suppliers"
        subtitle="Store contacts and categories for reuse across estimates."
        action={<button className="primary-button" onClick={onNew}><Icon name="plus" />Add supplier</button>}
      />
      {suppliers.length ? (
        <section className="supplier-grid">
          {suppliers.map((s) => (
            <article className="supplier-card" key={s.id}>
              <div className="supplier-top">
                <span>{s.name.slice(0, 2).toUpperCase()}</span>
                <em>{s.status || "Active"}</em>
              </div>
              <strong>{s.name}</strong>
              <p>{s.code} · {s.category}</p>
              <dl>
                <div><dt>Contact</dt><dd>{s.contact_name || "—"}</dd></div>
                <div><dt>Email</dt><dd>{s.email || "—"}</dd></div>
                <div><dt>Phone</dt><dd>{s.phone || "—"}</dd></div>
              </dl>
              <button>Edit supplier<Icon name="arrowRight" /></button>
            </article>
          ))}
        </section>
      ) : (
        <article className="panel">
          <EmptyState icon="truck" title="No suppliers yet" message="Add a supplier to reuse its contact details across every estimate." />
        </article>
      )}
    </>
  );
}

function RatesPage({ rates }: { rates: Rate[] }) {
  return (
    <>
      <Header
        eyebrow="ADMIN CONTROLLED"
        title="Labor rate master"
        subtitle="Engineers can use these rates but cannot edit them."
        action={<span className="lock-badge"><Icon name="lock" />Admin only</span>}
      />
      <article className="panel">
        {rates.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workforce type</th>
                  <th>Discipline</th>
                  <th>Work type</th>
                  <th>Unit</th>
                  <th>Rate (THB)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td><span className={`status ${r.workforce_type === "Internal" ? "blue" : "amber"}`}>{r.workforce_type}</span></td>
                    <td>{r.discipline}</td>
                    <td>{r.work_type}</td>
                    <td>{r.unit}</td>
                    <td><strong>{compactMoney.format(r.rate)}</strong></td>
                    <td><span className="status green">Active</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="currency" title="No labor rates" message="An admin needs to publish the internal and external rate table." />
        )}
      </article>
    </>
  );
}

/* ==========================================================================
   Modals
   ========================================================================== */

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EstimateModal({ data, form, setForm, onClose, onSubmit, saving }: { data: AppData; form: EstimateForm; setForm: (f: EstimateForm) => void; onClose: () => void; onSubmit: (e: React.FormEvent) => void; saving: boolean }) {
  const customer = data.customers.find((c) => c.id === Number(form.customerId)) ?? data.customers[0];
  const next = `EST-${customer.code}-${new Date().getFullYear()}-####-R00`;

  return (
    <Modal title="Create new estimate" subtitle="The number is generated automatically from the customer." onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="number-preview">
          <span>Estimate number</span>
          <strong>{next}</strong>
        </div>
        <div className="form-grid">
          <label className="span-2">Project name
            <input required value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder="e.g. Machine vision inspection system" />
          </label>
          <label>Customer
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: Number(e.target.value) })}>
              {data.customers.map((c) => <option value={c.id} key={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label>Due date
            <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </label>
          <label>Assigned Engineer
            <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: Number(e.target.value) })}>
              {data.users.filter((u) => u.role === "Engineer").map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label>Leader reviewer
            <select value={form.leaderId} onChange={(e) => setForm({ ...form, leaderId: Number(e.target.value) })}>
              {data.users.filter((u) => u.role === "Leader").map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label>Manager approver
            <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: Number(e.target.value) })}>
              {data.users.filter((u) => u.role === "Manager").map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Optional modules</legend>
          <div className="module-options">
            {["CTU", "AMR", "Server", "Infrastructure"].map((module) => (
              <label key={module}>
                <input
                  type="checkbox"
                  checked={form.modules.includes(module)}
                  onChange={() => setForm({ ...form, modules: form.modules.includes(module) ? form.modules.filter((m) => m !== module) : [...form.modules, module] })}
                />
                <span>{module}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create estimate"}</button>
        </div>
      </form>
    </Modal>
  );
}

function SupplierModal({ form, setForm, onClose, onSubmit, saving }: { form: SupplierForm; setForm: (f: SupplierForm) => void; onClose: () => void; onSubmit: (e: React.FormEvent) => void; saving: boolean }) {
  return (
    <Modal title="Add supplier" subtitle="Supplier data becomes available to every estimate." onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <label>Supplier code
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SUP-XXX" />
          </label>
          <label>Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>General</option>
              <option>Vision &amp; PLC</option>
              <option>Electrical</option>
              <option>Mechanical</option>
              <option>AMR / CTU</option>
            </select>
          </label>
          <label className="span-2">Supplier name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>Contact name
            <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </label>
          <label>Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="span-2">Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Add supplier"}</button>
        </div>
      </form>
    </Modal>
  );
}
