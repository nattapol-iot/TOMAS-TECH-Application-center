from pathlib import Path
path=Path('app/system/production/ReportScreens.tsx')
code=path.read_text(encoding='utf-8')
start=code.index('function NewReportModal(')
end=code.index('\nfunction ReportDetail(',start)
code=code[:start]+'''function NewReportModal({ bootstrap, initialType = "SERVICE", initialTemplate = null, onClose, onCreated }: { bootstrap: BootstrapData; initialType?: ReportType; initialTemplate?: ReportTemplate | null; onClose: () => void; onCreated: (report: ReportRecord) => void }) {
  const [step, setStep] = useState(initialTemplate ? 2 : 1);
  const [reportType, setReportType] = useState<ReportType>(initialTemplate?.reportType ?? initialType), [source, setSource] = useState("");
  const [template, setTemplate] = useState<ReportTemplate | null>(initialTemplate);
  const [templateReady, setTemplateReady] = useState(!initialTemplate);
  const [search, setSearch] = useState(""), [sources, setSources] = useState<ReportSource[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState("");
  const [title, setTitle] = useState(""), [reportDate, setReportDate] = useState(today), [locale, setLocale] = useState(initialTemplate?.locale ?? "th");
  const [reviewerId, setReviewerId] = useState<number | null>(null), [approverId, setApproverId] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [sourceKind = "", rawId = ""] = source.split(":");
  const signers = useReportSigners(sourceKind, Number(rawId));
  useEffect(() => {
    let cancelled = false;
    if (step !== 2) return;
    const timer = setTimeout(() => {
      setSourceLoading(true); setSourceError("");
      void (async () => {
        const all: ReportSource[] = []; let next = 1; let total = 1;
        while (all.length < total && !cancelled) { const response = await apiRequest<PagedResult<ReportSource>>(`${BASE}/sources?${new URLSearchParams({ page: String(next++), pageSize: "100", search })}`); total = response.total; all.push(...response.items); if (!response.items.length) break; }
        if (!cancelled) setSources(all);
      })().catch(failure => { if (!cancelled) setSourceError(errorText(failure)); }).finally(() => { if (!cancelled) setSourceLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, step]);
  const permitted = (kind: string) => reportType === "POC" ? kind === "INQUIRY" : reportType === "INSPECTION" || kind === "PROJECT";
  const resetSource = (value: string) => {
    setSource(value); setReviewerId(null); setApproverId(0);
    const chosen = sources.find(item => `${item.sourceKind}:${item.id}` === value);
    if (chosen && !title.trim()) setTitle(`${labels[reportType]} report — ${chosen.title}`.slice(0, 500));
  };
  const selectedForm = reportForms.find(form => form.type === reportType)!;
  return <Modal title="สร้างรายงานใหม่" size="lg" onClose={() => { if (!busy) onClose(); }}>
    <ol className="report-entry-steps"><li className={step === 1 ? "active" : ""}>1 เลือกแบบฟอร์ม</li><li className={step === 2 ? "active" : ""}>2 เลือกงานและผู้อนุมัติ</li><li>3 กรอกในแบบฟอร์ม</li></ol>
    <form onSubmit={event => {
      event.preventDefault(); if (step !== 2 || busy) return;
      setBusy(true); setError("");
      void apiRequest<ReportRecord>(BASE, json({ reportType, sourceKind, sourceId: Number(rawId), title, reportDate, locale, reviewerId, approverId, body: {}, ...(template ? { templateId: template.id, templateVersion: template.version } : {}) })).then(onCreated).catch(failure => setError(errorText(failure))).finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} className="report-entry-fieldset">
        <div hidden={step !== 1}>
          <div className="report-fields"><Field label="แบบฟอร์มรายงาน"><select aria-label="Report type" value={reportType} onChange={event => { setReportType(event.target.value as ReportType); setTemplate(null); setTemplateReady(false); resetSource(""); setTitle(""); }}>{reportForms.map(form => <option key={form.type} value={form.type}>{form.title}</option>)}</select></Field><div className="report-entry-reference"><strong>{selectedForm.reference}</strong><p>{selectedForm.subtitle}</p></div></div>
          <ReportTemplatePicker key={reportType} reportType={reportType} selected={template} disabled={busy} onReady={setTemplateReady} onChange={value => { setTemplate(value); if (value) setLocale(value.locale); }} />
        </div>
        <div hidden={step !== 2}>
          <div className="report-selected-form"><Icon name="file" /><div><strong>{selectedForm.title}</strong><small>{template ? `${template.name} · V${template.version}` : selectedForm.reference}</small></div><button className="btn ghost sm" type="button" onClick={() => setStep(1)}>เปลี่ยนแบบฟอร์ม</button></div>
          <h3 className="report-entry-heading">รายงานนี้เป็นของงานใด</h3>
          <p className="muted">{reportType === "POC" ? "เลือก Inquiry ที่ใช้ทดลองกับลูกค้า ยังไม่ต้องมี Project" : reportType === "INSPECTION" ? "เลือก Inquiry หรือ Project ที่ต้องการตรวจสอบ" : "เลือก Project ระบบจะแสดงชื่อลูกค้าและเลขที่งานบนรายงานให้"}</p>
          <div className="report-fields"><Field label="ค้นหางาน"><input aria-label="Find source" value={search} onChange={event => { setSearch(event.target.value); setSourceLoading(true); resetSource(""); }} placeholder="เลข Inquiry / Project หรือชื่อโครงการ" /></Field><Field label="Inquiry / Project *"><select required={step === 2} disabled={sourceLoading} aria-label="Inquiry / Project" value={source} onChange={event => resetSource(event.target.value)}><option value="">{sourceLoading ? "กำลังโหลดงาน…" : "เลือกงานอ้างอิง"}</option>{sources.filter(item => permitted(item.sourceKind)).map(item => <option key={`${item.sourceKind}:${item.id}`} value={`${item.sourceKind}:${item.id}`}>{item.reference} · {item.title}</option>)}</select></Field><Field label="ชื่อรายงาน *"><input required={step === 2} maxLength={500} aria-label="Report title" value={title} onChange={event => setTitle(event.target.value)} /></Field><Field label="วันที่รายงาน *"><input type="date" required={step === 2} aria-label="Report date" value={reportDate} onChange={event => setReportDate(event.target.value)} /></Field></div>
          {sourceError ? <div className="callout danger" role="alert">{sourceError}<button className="btn ghost" type="button" onClick={() => { setStep(1); }}>กลับไปเลือกแบบฟอร์มและลองใหม่</button></div> : null}
          <h3 className="report-entry-heading">ทีมตรวจและอนุมัติ</h3><p className="muted">คุณเป็นผู้จัดทำรายงาน เลือกผู้อนุมัติ แล้วเพิ่มผู้ตรวจได้หากงานนี้ต้องตรวจอีกขั้น</p>
          <div className="report-fields"><ParticipantFields reviewerId={reviewerId} approverId={approverId} onReviewer={setReviewerId} onApprover={setApproverId} reviewers={signers.reviewers} approvers={signers.approvers} authorId={bootstrap.user.id} /></div>
          <details className="report-entry-options"><summary>ตัวเลือกเพิ่มเติม</summary><Field label="ภาษารายงาน"><select aria-label="Report language" value={locale} onChange={event => setLocale(event.target.value)}><option value="th">ไทย</option><option value="en">English</option><option value="ja">日本語</option></select></Field></details>
        </div>
      </fieldset>
      {error || signers.error ? <div className="callout danger" role="alert">{error || signers.error}</div> : null}
      <div className="report-actions"><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>ยกเลิก</button>{step === 1 ? <button className="btn primary" type="button" disabled={!!template && !templateReady} onClick={() => { setStep(2); setSourceLoading(true); }}>ถัดไป: เลือกงาน →</button> : <button className="btn primary" type="submit" disabled={busy || !source || sourceLoading || !title.trim() || !approverId || !!signers.error || !!template && !templateReady}>{busy ? "กำลังสร้าง…" : "เปิดแบบฟอร์มเพื่อกรอก"}</button>}</div>
    </form>
  </Modal>;
}
''' + code[end:]
path.write_text(code,encoding='utf-8')

path=Path('app/system/production/ReportTemplateLibrary.tsx')
code=path.read_text(encoding='utf-8')
code=code.replace('<details open><summary>Preview:', '<details><summary>ดูตัวอย่าง:')
code=code.replace('Start from a template (optional)', 'ใช้ Template ที่เตรียมไว้ (ถ้ามี)')
code=code.replace('Blank report</option>', 'แบบฟอร์มมาตรฐาน — กรอกข้อมูลใหม่</option>')
code=code.replace('A blank report starts with empty sections. A template copies reusable content into the new report; future template edits do not update existing reports.', 'เริ่มด้วยแบบฟอร์มมาตรฐานได้ทันที หรือเลือก Template เพื่อดึงรายการงานและขั้นตอนทดสอบที่ทีมเตรียมไว้ ผลการทำงานและลายเซ็นต้องบันทึกใหม่ในแต่ละรายงาน')
path.write_text(code,encoding='utf-8')
