from pathlib import Path

path = Path('app/system/production/ReportScreens.tsx')
code = path.read_text(encoding='utf-8')
start = code.index('function evidenceUrl(')
end = code.index('export function ReportWorkflow', start)
code = code[:start] + '''export function ReportBodyEditor({ reportType, body, onChange, readOnly = false, reusableOnly = false }: { reportType: string; body: ReportBody; onChange?: (value: ReportBody) => void; readOnly?: boolean; reusableOnly?: boolean }) {
  const sections = reusableOnly ? reportSections(reportType).filter(section => REPORT_TEMPLATE_SECTIONS_BY_TYPE[reportType]?.includes(section.key)).map(section => ({ ...section, fields: section.fields.filter(definition => REPORT_TEMPLATE_FIELDS[section.key]?.fields.includes(definition.key)) })).filter(section => section.fields.length > 0) : reportSections(reportType);
  return <ReportDocumentForm reportType={reportType} body={body} onChange={onChange} readOnly={readOnly} reusableOnly={reusableOnly} sections={sections} />;
}

''' + code[end:]
code = code.replace('export function ReportScreens({ bootstrap, notify }: { bootstrap: BootstrapData; notify: (message: string) => void })', 'export function ReportScreens({ bootstrap, notify, onOpenAnalytics }: { bootstrap: BootstrapData; notify: (message: string) => void; onOpenAnalytics?: () => void })')
code = code.replace('  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);', '  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);\n  const [newType, setNewType] = useState<ReportType>("SERVICE");')
start = code.index('  return <div className="report-workspace">', code.index('export function ReportScreens'))
end = code.index('\nfunction useReportSigners', start)
code = code[:start] + '''  const begin = (type: ReportType) => { setNewType(type); setSelectedTemplate(null); setCreating(true); };
  return <div className="report-workspace">
    <PageHeader eyebrow="CUSTOMER REPORTS" title="รายงานลูกค้า" subtitle="เลือกแบบฟอร์ม กรอกผลการทำงาน แล้วส่งตรวจและให้ลูกค้าเซ็น" actions={onOpenAnalytics ? <button className="btn ghost" type="button" onClick={onOpenAnalytics}>ดูสถิติรายงาน</button> : undefined} />
    <Tabs tabs={[{ id: "reports", label: "รายงานทั้งหมด" }, { id: "templates", label: "Template ของทีม" }]} active={workspaceTab} onChange={setWorkspaceTab} />
    {workspaceTab === "templates" ? <ReportTemplateLibrary bootstrap={bootstrap} notify={notify} onUse={template => { setNewType(template.reportType); setSelectedTemplate(template); setCreating(true); }} /> : <>
      {bootstrap.permissions.includes("report.write") ? <section className="report-start" aria-label="สร้างรายงานจากแบบฟอร์ม">
        <div className="report-start-heading"><h2>สร้างรายงานใหม่</h2><span>เลือกแบบฟอร์มที่ตรงกับงาน</span></div>
        <div className="report-form-choices">{reportForms.map((form, index) => <button className={`report-form-choice${index < 2 ? " featured" : ""}`} key={form.type} type="button" onClick={() => begin(form.type)}><Icon name="file" /><strong>{form.title}</strong><span>{form.subtitle}</span><small>{form.reference}</small><span className="report-choice-link">ใช้แบบฟอร์มนี้ →</span></button>)}</div>
      </section> : null}
      <div className="report-list-heading"><h2>รายงานที่บันทึกไว้ <span>{result.total}</span></h2><p>เปิดรายงานเพื่อกรอกต่อ ตรวจผล หรือส่งให้ลูกค้าเซ็น</p></div>
      <Toolbar><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="ค้นหาเลขที่รายงานหรือชื่อเรื่อง…" /><select aria-label="ประเภทรายงาน" value={reportType} onChange={event => { setReportType(event.target.value); setPage(1); }}><option value="">ทุกประเภท</option>{REPORT_TYPES.map(type => <option key={type} value={type}>{labels[type]}</option>)}</select><select aria-label="สถานะรายงาน" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">ทุกสถานะ</option>{REPORT_STATUSES.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select><button className="btn ghost" type="button" disabled={loading} onClick={() => void load()}><Icon name="refresh" />รีเฟรช</button></Toolbar>
      {error ? <div className="callout danger" role="alert">{error}</div> : null}
      <Panel flush>{loading ? <div className="empty" role="status">กำลังโหลดรายงาน…</div> : result.items.length ? <div className="table-wrap"><table><thead><tr><th>รายงาน</th><th>ประเภท</th><th>ลูกค้า / งานอ้างอิง</th><th>วันที่</th><th>สถานะ</th><th /></tr></thead><tbody>{result.items.map(report => <tr key={report.id}><td><button type="button" className="report-open-title" onClick={() => setSelectedId(report.id)}>{report.title}</button><small className="report-meta">{report.number} · R{report.revision}</small></td><td>{labels[report.reportType]}</td><td>{report.customer}<small className="report-meta">{report.sourceReference}</small></td><td>{report.reportDate}</td><td><Badge tone={report.status === "COMPLETED" ? "green" : report.status === "CHANGES_REQUESTED" ? "red" : "blue"}>{labels[report.status] ?? report.status}</Badge></td><td><button className="btn default sm" type="button" onClick={() => setSelectedId(report.id)}>{report.status === "DRAFT" ? "กรอกต่อ" : "เปิดรายงาน"}</button></td></tr>)}</tbody></table></div> : !error ? <EmptyState icon="file" title="ยังไม่มีรายงานในรายการนี้" message="เลือกแบบฟอร์มด้านบนเพื่อเริ่มรายงาน หรือปรับตัวกรองเพื่อค้นหารายงานเดิม" /> : null}<div className="report-table-footer"><TablePageSize value={pageSize} onChange={value => { setPageSize(value); setPage(1); }} /><Pagination page={result.page} pageCount={Math.max(1, Math.ceil(result.total / result.pageSize))} from={result.total ? (result.page - 1) * result.pageSize + 1 : 0} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div></Panel>
    </>}
    {creating ? <NewReportModal bootstrap={bootstrap} initialType={newType} initialTemplate={selectedTemplate} onClose={() => { setCreating(false); setSelectedTemplate(null); }} onCreated={report => { setCreating(false); setSelectedTemplate(null); setWorkspaceTab("reports"); setSelectedId(report.id); notify(`${report.number} created`); }} /> : null}
  </div>;
}
''' + code[end:]
path.write_text(code, encoding='utf-8')

path = Path('app/system/ProductionApp.tsx')
code = path.read_text(encoding='utf-8')
old = '{view === "reports" ? <><Tabs tabs={[{ id: "workspace", label: "Report workspace" }, { id: "analytics", label: "Analytics" }]} active={reportTab} onChange={setReportTab} /><div style={{ marginTop: 20 }}>{reportTab === "workspace" ? <ReportScreens {...common} /> : <ProductionReports {...moduleProps} />}</div></> : null}'
new = '{view === "reports" ? reportTab === "workspace" ? <ReportScreens {...common} onOpenAnalytics={() => setReportTab("analytics")} /> : <><button className="btn ghost" type="button" onClick={() => setReportTab("workspace")}>← กลับไปหน้ารายงาน</button><ProductionReports {...moduleProps} /></> : null}'
assert old in code
path.write_text(code.replace(old, new), encoding='utf-8')
