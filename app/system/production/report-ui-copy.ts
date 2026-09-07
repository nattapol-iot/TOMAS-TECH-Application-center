import { useLanguage, translate, type Lang } from "../i18n";
import { reportCopy } from "./report-locale";
export const REPORT_UI_COPY: Record<string, { th: string; en?: string; jp: string }> = {
  "Report workflow": {
    "th": "ขั้นตอนรายงาน",
    "en": "Report workflow",
    "jp": "レポート手順"
  },
  "Report access required": {
    "th": "ต้องมีสิทธิ์อ่านรายงาน",
    "en": "Report access required",
    "jp": "レポート閲覧権限が必要です"
  },
  "You need report.read to open this workspace.": {
    "th": "คุณยังไม่มีสิทธิ์อ่านรายงาน",
    "en": "You need report access to open this workspace.",
    "jp": "この画面を開くにはレポート閲覧権限が必要です。"
  },
  "CUSTOMER REPORTS": {
    "th": "รายงานลูกค้า",
    "en": "CUSTOMER REPORTS",
    "jp": "顧客レポート"
  },
  "ยังไม่มีรายงานในรายการนี้": {
    "th": "ยังไม่มีรายงานในรายการนี้",
    "en": "No reports in this list",
    "jp": "該当するレポートはありません"
  },
  "เลือกแบบฟอร์มด้านบนเพื่อเริ่มรายงาน หรือปรับตัวกรองเพื่อค้นหารายงานเดิม": {
    "th": "เลือกแบบฟอร์มด้านบนเพื่อเริ่มรายงาน หรือปรับตัวกรองเพื่อค้นหารายงานเดิม",
    "en": "Choose a form above to start, or adjust filters to find an existing report.",
    "jp": "上の様式から作成するか、検索条件を変更してください。"
  },
  "Reviewer (optional)": {
    "th": "ผู้ตรวจ (ถ้ามี)",
    "en": "Reviewer (optional)",
    "jp": "確認者（任意）"
  },
  "No review step": {
    "th": "ไม่ต้องมีขั้นตรวจ",
    "en": "No review step",
    "jp": "確認工程なし"
  },
  "Select approver": {
    "th": "เลือกผู้อนุมัติ",
    "en": "Select approver",
    "jp": "承認者を選択"
  },
  "1 เลือกแบบฟอร์ม": {
    "th": "1 เลือกแบบฟอร์ม",
    "en": "1 Choose form",
    "jp": "1 様式選択"
  },
  "2 เลือกงานและผู้อนุมัติ": {
    "th": "2 เลือกงานและผู้อนุมัติ",
    "en": "2 Choose work & approver",
    "jp": "2 作業・承認者選択"
  },
  "3 กรอกในแบบฟอร์ม": {
    "th": "3 กรอกในแบบฟอร์ม",
    "en": "3 Complete form",
    "jp": "3 様式入力"
  },
  "แบบฟอร์มรายงาน": {
    "th": "แบบฟอร์มรายงาน",
    "en": "Report form",
    "jp": "レポート様式"
  },
  "Report type": {
    "th": "ประเภทรายงาน",
    "en": "Report type",
    "jp": "レポート種別"
  },
  "เปลี่ยนแบบฟอร์ม": {
    "th": "เปลี่ยนแบบฟอร์ม",
    "en": "Change form",
    "jp": "様式を変更"
  },
  "รายงานนี้เป็นของงานใด": {
    "th": "รายงานนี้เป็นของงานใด",
    "en": "Which work is this report for?",
    "jp": "対象の作業を選択"
  },
  "เลือก Inquiry ที่ใช้ทดลองกับลูกค้า ยังไม่ต้องมี Project": {
    "th": "เลือก Inquiry ที่ใช้ทดลองกับลูกค้า ยังไม่ต้องมี Project",
    "en": "Select the trial inquiry. A project is not required.",
    "jp": "顧客試行の引合を選択してください。プロジェクトは不要です。"
  },
  "เลือก Inquiry หรือ Project ที่ต้องการตรวจสอบ": {
    "th": "เลือก Inquiry หรือ Project ที่ต้องการตรวจสอบ",
    "en": "Select the inquiry or project to inspect.",
    "jp": "検査対象の引合またはプロジェクトを選択してください。"
  },
  "เลือก Project ระบบจะแสดงชื่อลูกค้าและเลขที่งานบนรายงานให้": {
    "th": "เลือก Project ระบบจะแสดงชื่อลูกค้าและเลขที่งานบนรายงานให้",
    "en": "Select a project to include its customer and reference on the report.",
    "jp": "プロジェクトを選ぶと、顧客名と管理番号がレポートに表示されます。"
  },
  "ค้นหางาน": {
    "th": "ค้นหางาน",
    "en": "Find work",
    "jp": "作業を検索"
  },
  "Find source": {
    "th": "ค้นหางานอ้างอิง",
    "en": "Find source",
    "jp": "参照元を検索"
  },
  "เลข Inquiry / Project หรือชื่อโครงการ": {
    "th": "เลข Inquiry / Project หรือชื่อโครงการ",
    "en": "Inquiry / project number or title",
    "jp": "引合・プロジェクト番号または名称"
  },
  "Inquiry / Project *": {
    "th": "Inquiry / Project *",
    "en": "Inquiry / Project *",
    "jp": "引合 / プロジェクト *"
  },
  "เลือกงานอ้างอิง": {
    "th": "เลือกงานอ้างอิง",
    "en": "Select work reference",
    "jp": "参照する作業を選択"
  },
  "ชื่อรายงาน *": {
    "th": "ชื่อรายงาน *",
    "en": "Report title *",
    "jp": "レポート名 *"
  },
  "Report title": {
    "th": "ชื่อรายงาน",
    "en": "Report title",
    "jp": "レポート名"
  },
  "วันที่รายงาน *": {
    "th": "วันที่รายงาน *",
    "en": "Report date *",
    "jp": "報告日 *"
  },
  "Report date": {
    "th": "วันที่รายงาน",
    "en": "Report date",
    "jp": "報告日"
  },
  "กลับไปเลือกแบบฟอร์มและลองใหม่": {
    "th": "กลับไปเลือกแบบฟอร์มและลองใหม่",
    "en": "Go back to form selection and retry",
    "jp": "様式選択に戻って再試行"
  },
  "ทีมตรวจและอนุมัติ": {
    "th": "ทีมตรวจและอนุมัติ",
    "en": "Review & approval team",
    "jp": "確認・承認チーム"
  },
  "คุณเป็นผู้จัดทำรายงาน เลือกผู้อนุมัติ แล้วเพิ่มผู้ตรวจได้หากงานนี้ต้องตรวจอีกขั้น": {
    "th": "คุณเป็นผู้จัดทำรายงาน เลือกผู้อนุมัติ แล้วเพิ่มผู้ตรวจได้หากงานนี้ต้องตรวจอีกขั้น",
    "en": "You prepare this report. Choose an approver and optionally add a reviewer.",
    "jp": "あなたが作成者です。承認者と、必要に応じて確認者を選択してください。"
  },
  "ตัวเลือกเพิ่มเติม": {
    "th": "ตัวเลือกเพิ่มเติม",
    "en": "More options",
    "jp": "その他の設定"
  },
  "ภาษารายงาน": {
    "th": "ภาษารายงาน",
    "en": "Report language",
    "jp": "レポート言語"
  },
  "Report language": {
    "th": "ภาษารายงาน",
    "en": "Report language",
    "jp": "レポート言語"
  },
  "ยกเลิก": {
    "th": "ยกเลิก",
    "en": "Cancel",
    "jp": "キャンセル"
  },
  "ถัดไป: เลือกงาน →": {
    "th": "ถัดไป: เลือกงาน →",
    "en": "Next: choose work →",
    "jp": "次へ：作業選択 →"
  },
  "กำลังสร้าง…": {
    "th": "กำลังสร้าง…",
    "en": "Creating…",
    "jp": "作成中…"
  },
  "เปิดแบบฟอร์มเพื่อกรอก": {
    "th": "เปิดแบบฟอร์มเพื่อกรอก",
    "en": "Open form to complete",
    "jp": "入力画面を開く"
  },
  "Loading report…": {
    "th": "กำลังโหลดรายงาน…",
    "en": "Loading report…",
    "jp": "レポートを読み込み中…"
  },
  "Back to reports": {
    "th": "กลับไปรายงาน",
    "en": "Back to reports",
    "jp": "レポート一覧へ戻る"
  },
  "← Back to reports": {
    "th": "← กลับไปรายงาน",
    "en": "← Back to reports",
    "jp": "← レポート一覧へ戻る"
  },
  "Retry": {
    "th": "ลองใหม่",
    "en": "Retry",
    "jp": "再試行"
  },
  "Print / Save as PDF": {
    "th": "พิมพ์ / บันทึก PDF",
    "en": "Print / Save as PDF",
    "jp": "印刷 / PDF保存"
  },
  "From template:": {
    "th": "จาก Template:",
    "en": "From template:",
    "jp": "使用テンプレート："
  },
  "Unsaved changes. Save the draft before submitting or printing.": {
    "th": "มีข้อมูลยังไม่บันทึก กรุณาบันทึกฉบับร่างก่อนส่งหรือพิมพ์",
    "en": "Unsaved changes. Save the draft before submitting or printing.",
    "jp": "未保存の変更があります。提出・印刷前に下書きを保存してください。"
  },
  "Viewing an earlier revision.": {
    "th": "กำลังดูฉบับก่อนหน้า",
    "en": "Viewing an earlier revision.",
    "jp": "過去の改訂を表示中です。"
  },
  "Open current revision": {
    "th": "เปิดฉบับปัจจุบัน",
    "en": "Open current revision",
    "jp": "現在の改訂を開く"
  },
  "มุมมองเอกสาร": {
    "th": "มุมมองเอกสาร",
    "en": "Document view",
    "jp": "文書表示"
  },
  "กรอกในแบบฟอร์ม": {
    "th": "กรอกในแบบฟอร์ม",
    "en": "Fill in the form",
    "jp": "様式に入力"
  },
  "ช่อง * ต้องกรอกก่อนส่งอนุมัติ · บันทึกฉบับร่างไว้ก่อนได้": {
    "th": "ช่อง * ต้องกรอกก่อนส่งอนุมัติ · บันทึกฉบับร่างไว้ก่อนได้",
    "en": "Complete * fields before approval. You can save a draft first.",
    "jp": "* 項目は承認提出前に必須です。下書き保存できます。"
  },
  "รายงานฉบับนี้อ่านได้อย่างเดียว": {
    "th": "รายงานฉบับนี้อ่านได้อย่างเดียว",
    "en": "This report is read only.",
    "jp": "このレポートは閲覧専用です。"
  },
  "กลับไปกรอก": {
    "th": "กลับไปกรอก",
    "en": "Back to editing",
    "jp": "編集に戻る"
  },
  "ดูตัวอย่างเอกสาร": {
    "th": "ดูตัวอย่างเอกสาร",
    "en": "Preview document",
    "jp": "文書プレビュー"
  },
  "กำลังบันทึก…": {
    "th": "กำลังบันทึก…",
    "en": "Saving…",
    "jp": "保存中…"
  },
  "บันทึกฉบับร่าง": {
    "th": "บันทึกฉบับร่าง",
    "en": "Save draft",
    "jp": "下書きを保存"
  },
  "Team signatures & approval": {
    "th": "ลายเซ็นทีมและการอนุมัติ",
    "en": "Team signatures & approval",
    "jp": "チーム署名と承認"
  },
  "Preparation and approval use each person's own signature specimen. Review is optional; when assigned, it must finish before approval.": {
    "th": "ผู้จัดทำและผู้อนุมัติใช้ลายเซ็นของตนเอง ขั้นตรวจเป็นทางเลือก แต่เมื่อระบุผู้ตรวจต้องตรวจให้เสร็จก่อนอนุมัติ",
    "en": "Preparation and approval use each person's own signature specimen. Review is optional; when assigned, it must finish before approval.",
    "jp": "作成と承認には各自の署名を使用します。確認者を指定した場合は、確認完了後に承認できます。"
  },
  "Reviewed without signature": {
    "th": "ตรวจแล้วโดยไม่ลงนาม",
    "en": "Reviewed without signature",
    "jp": "署名なしで確認済み"
  },
  "Pending": {
    "th": "รอดำเนินการ",
    "en": "Pending",
    "jp": "対応待ち"
  },
  "Customer handoff": {
    "th": "ส่งมอบให้ลูกค้า",
    "en": "Customer handoff",
    "jp": "顧客への引渡し"
  },
  "The customer opens the exact approved revision and chooses acknowledgment or a drawn signature.": {
    "th": "ลูกค้าเปิดฉบับที่อนุมัติแล้ว และเลือกรับทราบหรือวาดลายเซ็น",
    "en": "The customer opens the exact approved revision and chooses acknowledgment or a drawn signature.",
    "jp": "顧客は承認済みの改訂を開き、確認または手書き署名を選択します。"
  },
  "Customer acknowledgment recorded": {
    "th": "บันทึกการรับทราบของลูกค้าแล้ว",
    "en": "Customer acknowledgment recorded",
    "jp": "顧客の確認を記録しました"
  },
  "Status:": {
    "th": "สถานะ:",
    "en": "Status:",
    "jp": "状態："
  },
  "Open customer signing page": {
    "th": "เปิดหน้าเซ็นของลูกค้า",
    "en": "Open customer signing page",
    "jp": "顧客署名画面を開く"
  },
  "Customer signing link": {
    "th": "ลิงก์เซ็นของลูกค้า",
    "en": "Customer signing link",
    "jp": "顧客署名リンク"
  },
  "Expires": {
    "th": "หมดอายุ",
    "en": "Expires",
    "jp": "有効期限"
  },
  "A customer link has been issued. Refresh to check its status. To issue a replacement, revoke the current link first.": {
    "th": "ออกลิงก์ลูกค้าแล้ว กดรีเฟรชเพื่อตรวจสถานะ หากต้องการลิงก์ใหม่ให้เพิกถอนลิงก์ปัจจุบันก่อน",
    "en": "A customer link has been issued. Refresh to check its status. To issue a replacement, revoke the current link first.",
    "jp": "顧客リンク発行済みです。更新して状態を確認してください。再発行する場合は現在のリンクを失効させてください。"
  },
  "Link valid for (hours)": {
    "th": "อายุลิงก์ (ชั่วโมง)",
    "en": "Link valid for (hours)",
    "jp": "リンク有効期間（時間）"
  },
  "Create customer link": {
    "th": "สร้างลิงก์ให้ลูกค้า",
    "en": "Create customer link",
    "jp": "顧客リンクを発行"
  },
  "Revoke customer link": {
    "th": "เพิกถอนลิงก์ลูกค้า",
    "en": "Revoke customer link",
    "jp": "顧客リンクを失効"
  },
  "Save as template": {
    "th": "บันทึกเป็น Template",
    "en": "Save as template",
    "jp": "テンプレートとして保存"
  },
  "Apply my signature to the review": {
    "th": "ใช้ลายเซ็นของฉันในการตรวจ",
    "en": "Apply my signature to the review",
    "jp": "確認に自分の署名を適用する"
  },
  "Reason / note": {
    "th": "เหตุผล / หมายเหตุ",
    "en": "Reason / note",
    "jp": "理由 / 備考"
  },
  "Confirm": {
    "th": "ยืนยัน",
    "en": "Confirm",
    "jp": "確定"
  },
  "Template:": {
    "th": "Template:",
    "en": "Template:",
    "jp": "テンプレート："
  },
  "REPORT TEMPLATES": {
    "th": "Template รายงาน",
    "en": "REPORT TEMPLATES",
    "jp": "レポートテンプレート"
  },
  "New template": {
    "th": "สร้าง Template",
    "en": "New template",
    "jp": "テンプレートを作成"
  },
  "Template report type": {
    "th": "ประเภทรายงานของ Template",
    "en": "Template report type",
    "jp": "テンプレートのレポート種別"
  },
  "Include archived": {
    "th": "รวมรายการที่เก็บแล้ว",
    "en": "Include archived",
    "jp": "アーカイブ済みも表示"
  },
  "Loading templates…": {
    "th": "กำลังโหลด Template…",
    "en": "Loading templates…",
    "jp": "テンプレートを読み込み中…"
  },
  "Version": {
    "th": "เวอร์ชัน",
    "en": "Version",
    "jp": "バージョン"
  },
  "Archived": {
    "th": "เก็บแล้ว",
    "en": "Archived",
    "jp": "アーカイブ済み"
  },
  "Use template": {
    "th": "ใช้ Template",
    "en": "Use template",
    "jp": "テンプレートを使用"
  },
  "Archive": {
    "th": "เก็บเข้าคลัง",
    "en": "Archive",
    "jp": "アーカイブ"
  },
  "No templates found": {
    "th": "ไม่พบ Template",
    "en": "No templates found",
    "jp": "テンプレートが見つかりません"
  },
  "Change the filters or create a reusable template.": {
    "th": "ปรับตัวกรองหรือสร้าง Template ไว้ใช้ซ้ำ",
    "en": "Change the filters or create a reusable template.",
    "jp": "検索条件を変更するか、再利用できるテンプレートを作成してください。"
  },
  "Archive report template": {
    "th": "เก็บ Template รายงาน",
    "en": "Archive report template",
    "jp": "レポートテンプレートをアーカイブ"
  },
  "This template will no longer be offered for new reports. Existing reports keep their saved content and template provenance.": {
    "th": "Template นี้จะไม่ปรากฏให้เลือกในรายงานใหม่ รายงานเดิมยังคงเนื้อหาและที่มาของ Template ไว้",
    "en": "This template will no longer be offered for new reports. Existing reports keep their saved content and template provenance.",
    "jp": "新規レポートでは選択できなくなります。既存レポートの内容とテンプレート情報は保持されます。"
  },
  "Archiving…": {
    "th": "กำลังเก็บ…",
    "en": "Archiving…",
    "jp": "アーカイブ中…"
  },
  "Archive template": {
    "th": "เก็บ Template",
    "en": "Archive template",
    "jp": "テンプレートをアーカイブ"
  },
  "New reusable report template": {
    "th": "สร้าง Template รายงานไว้ใช้ซ้ำ",
    "en": "New reusable report template",
    "jp": "再利用レポートテンプレートを作成"
  },
  "Keep standard instructions, equipment definitions, scenarios and expected results. Customer details, dates, team assignments, actual results, evidence and signatures belong to each report and are excluded.": {
    "th": "เก็บขั้นตอนมาตรฐาน อุปกรณ์ หัวข้อทดสอบและผลที่คาดหวัง ข้อมูลลูกค้า วันที่ ทีม ผลจริง หลักฐานและลายเซ็นต้องกรอกใหม่ในแต่ละรายงาน",
    "en": "Keep standard instructions, equipment definitions, scenarios and expected results. Customer details, dates, team assignments, actual results, evidence and signatures belong to each report and are excluded.",
    "jp": "標準手順、機器定義、試験項目、期待結果を保存します。顧客、日付、担当者、実際の結果、証拠、署名は各レポートで入力します。"
  },
  "Review retained objectives and steps before saving. Remove customer-specific names, details and past-work wording; field filtering cannot anonymize free text.": {
    "th": "ตรวจวัตถุประสงค์และขั้นตอนก่อนบันทึก ลบชื่อและรายละเอียดเฉพาะลูกค้าหรืองานครั้งก่อน ระบบไม่สามารถลบข้อมูลเฉพาะในข้อความอิสระได้",
    "en": "Review retained objectives and steps before saving. Remove customer-specific names, details and past-work wording; field filtering cannot anonymize free text.",
    "jp": "保存前に目的と手順を確認し、顧客固有情報や過去の作業記述を削除してください。自由記述は自動匿名化されません。"
  },
  "Template name": {
    "th": "ชื่อ Template",
    "en": "Template name",
    "jp": "テンプレート名"
  },
  "Template language": {
    "th": "ภาษา Template",
    "en": "Template language",
    "jp": "テンプレート言語"
  },
  "Save template": {
    "th": "บันทึก Template",
    "en": "Save template",
    "jp": "テンプレートを保存"
  },
  "ใช้ Template ที่เตรียมไว้ (ถ้ามี)": {
    "th": "ใช้ Template ที่เตรียมไว้ (ถ้ามี)",
    "en": "Use a prepared template (optional)",
    "jp": "作成済みテンプレートを使用（任意）"
  },
  "Refresh templates": {
    "th": "รีเฟรช Template",
    "en": "Refresh templates",
    "jp": "テンプレートを更新"
  },
  "Find template": {
    "th": "ค้นหา Template",
    "en": "Find template",
    "jp": "テンプレートを検索"
  },
  "Search template name…": {
    "th": "ค้นหาชื่อ Template…",
    "en": "Search template name…",
    "jp": "テンプレート名を検索…"
  },
  "Report template": {
    "th": "Template รายงาน",
    "en": "Report template",
    "jp": "レポートテンプレート"
  },
  "แบบฟอร์มมาตรฐาน — กรอกข้อมูลใหม่": {
    "th": "แบบฟอร์มมาตรฐาน — กรอกข้อมูลใหม่",
    "en": "Standard form — enter new details",
    "jp": "標準様式 — 新規入力"
  },
  "ดูตัวอย่าง:": {
    "th": "ดูตัวอย่าง:",
    "en": "Preview:",
    "jp": "プレビュー："
  },
  "เริ่มด้วยแบบฟอร์มมาตรฐานได้ทันที หรือเลือก Template เพื่อดึงรายการงานและขั้นตอนทดสอบที่ทีมเตรียมไว้ ผลการทำงานและลายเซ็นต้องบันทึกใหม่ในแต่ละรายงาน": {
    "th": "เริ่มด้วยแบบฟอร์มมาตรฐานได้ทันที หรือเลือก Template เพื่อดึงรายการงานและขั้นตอนทดสอบที่ทีมเตรียมไว้ ผลการทำงานและลายเซ็นต้องบันทึกใหม่ในแต่ละรายงาน",
    "en": "Start with the standard form or use a template for prepared work items and test steps. Record actual results and signatures for each report.",
    "jp": "標準様式から開始するか、テンプレートの作業項目と試験手順を使用できます。実際の結果と署名は毎回入力してください。"
  },
  "Discard unsaved report changes?": {
    "th": "ยังมีข้อมูลไม่บันทึก ต้องการทิ้งการแก้ไขหรือไม่?",
    "en": "Discard unsaved report changes?",
    "jp": "未保存のレポート変更を破棄しますか？"
  },
  "Report draft saved": {
    "th": "บันทึกฉบับร่างแล้ว",
    "en": "Report draft saved",
    "jp": "下書きを保存しました"
  },
  "Report updated": {
    "th": "อัปเดตรายงานแล้ว",
    "en": "Report updated",
    "jp": "レポートを更新しました"
  },
  "Customer link created. Copy it to share with the customer.": {
    "th": "สร้างลิงก์แล้ว คัดลอกเพื่อส่งให้ลูกค้า",
    "en": "Customer link created. Copy it to share with the customer.",
    "jp": "顧客リンクを作成しました。コピーして共有してください。"
  },
  "Customer link copied": {
    "th": "คัดลอกลิงก์ลูกค้าแล้ว",
    "en": "Customer link copied",
    "jp": "顧客リンクをコピーしました"
  },
  "Copy failed. Select the link above and copy it manually.": {
    "th": "คัดลอกไม่สำเร็จ เลือกลิงก์ด้านบนแล้วคัดลอกเอง",
    "en": "Copy failed. Select the link above and copy it manually.",
    "jp": "コピーできませんでした。上のリンクを選択して手動でコピーしてください。"
  },
  "Reusable report template saved": {
    "th": "บันทึก Template รายงานแล้ว",
    "en": "Reusable report template saved",
    "jp": "レポートテンプレートを保存しました"
  },
  "Content": {
    "th": "เนื้อหา",
    "en": "Content",
    "jp": "内容"
  },
  "Team & approvals": {
    "th": "ทีมและการอนุมัติ",
    "en": "Team & approvals",
    "jp": "チームと承認"
  },
  "Customer signing": {
    "th": "ลูกค้าเซ็น",
    "en": "Customer signing",
    "jp": "顧客署名"
  },
  "History": {
    "th": "ประวัติ",
    "en": "History",
    "jp": "履歴"
  },
  "Sign & submit": {
    "th": "ลงนามและส่งตรวจ",
    "en": "Sign & submit",
    "jp": "署名して提出"
  },
  "Review report": {
    "th": "ตรวจรายงาน",
    "en": "Review report",
    "jp": "レポートを確認"
  },
  "Sign & approve": {
    "th": "ลงนามและอนุมัติ",
    "en": "Sign & approve",
    "jp": "署名して承認"
  },
  "Request changes": {
    "th": "ขอแก้ไข",
    "en": "Request changes",
    "jp": "修正を依頼"
  },
  "Create revision": {
    "th": "สร้างฉบับแก้ไข",
    "en": "Create revision",
    "jp": "新しい改訂を作成"
  },
  "Void report": {
    "th": "ยกเลิกรายงาน",
    "en": "Void report",
    "jp": "レポートを無効化"
  },
  "Sign & submit report": {
    "th": "ลงนามและส่งรายงาน",
    "en": "Sign & submit report",
    "jp": "署名してレポートを提出"
  },
  "Sign & approve report": {
    "th": "ลงนามและอนุมัติรายงาน",
    "en": "Sign & approve report",
    "jp": "署名してレポートを承認"
  },
  "Create a new revision": {
    "th": "สร้างฉบับแก้ไขใหม่",
    "en": "Create a new revision",
    "jp": "新しい改訂を作成"
  },
  "Review optional": {
    "th": "ขั้นตรวจเป็นทางเลือก",
    "en": "Review optional",
    "jp": "確認は任意"
  },
  "I have reviewed this exact report revision and authorize use of my own signature specimen for this action.": {
    "th": "ฉันตรวจรายงานฉบับนี้แล้วและยินยอมใช้ลายเซ็นของฉันในการดำเนินการนี้",
    "en": "I have reviewed this exact report revision and authorize use of my own signature specimen for this action.",
    "jp": "この改訂の内容を確認し、この操作に自分の署名を使用することに同意します。"
  },
  "Opening report…": {
    "th": "กำลังเปิดรายงาน…",
    "jp": "レポートを開いています…"
  },
  "Customer report": {
    "th": "รายงานลูกค้า",
    "jp": "顧客レポート"
  },
  "Try again": {
    "th": "ลองใหม่",
    "jp": "再試行"
  },
  "End user:": {
    "th": "บริษัทผู้ใช้งานปลายทาง:",
    "jp": "エンドユーザー："
  },
  "Report date:": {
    "th": "วันที่รายงาน:",
    "jp": "報告日："
  },
  "Thank you — your": {
    "th": "ขอบคุณ บันทึก",
    "jp": "ありがとうございます。"
  },
  "signature": {
    "th": "ลายเซ็น",
    "jp": "署名"
  },
  "acknowledgment": {
    "th": "การรับทราบ",
    "jp": "確認"
  },
  "is recorded.": {
    "th": "ของคุณเรียบร้อยแล้ว",
    "jp": "を記録しました。"
  },
  "· Complete": {
    "th": "· เสร็จสมบูรณ์",
    "jp": "· 完了"
  },
  "You may close this page. This signing link cannot be used again.": {
    "th": "ปิดหน้านี้ได้ ลิงก์นี้ไม่สามารถใช้งานซ้ำได้",
    "jp": "この画面を閉じて構いません。この署名リンクは再利用できません。"
  },
  "Please read the report below before recording your acknowledgment or signature.": {
    "th": "กรุณาอ่านรายงานด้านล่างก่อนรับทราบหรือลงนาม",
    "jp": "確認・署名前に以下のレポートをお読みください。"
  },
  "Customer acknowledgment / signature": {
    "th": "การรับทราบ / ลายเซ็นลูกค้า",
    "jp": "顧客確認 / 署名"
  },
  "Your name, company, stated date and the time of submission will be recorded against this report revision.": {
    "th": "ชื่อ บริษัท วันที่ระบุ และเวลาที่ส่งจะถูกบันทึกกับรายงานฉบับนี้",
    "jp": "氏名、会社名、指定日、提出日時をこの改訂に記録します。"
  },
  "Full name": {
    "th": "ชื่อ-นามสกุล",
    "jp": "氏名"
  },
  "Title / position": {
    "th": "ตำแหน่ง",
    "jp": "役職"
  },
  "How would you like to respond?": {
    "th": "ต้องการตอบรับด้วยวิธีใด?",
    "jp": "回答方法を選択してください"
  },
  "Draw my signature": {
    "th": "วาดลายเซ็นของฉัน",
    "jp": "署名を手書きする"
  },
  "Record my acknowledgment": {
    "th": "บันทึกการรับทราบของฉัน",
    "jp": "確認を記録する"
  },
  "Draw your signature using your mouse, pen or finger. You can choose acknowledgment above without drawing.": {
    "th": "วาดลายเซ็นด้วยเมาส์ ปากกา หรือนิ้ว หรือเลือกบันทึกการรับทราบด้านบนโดยไม่ต้องวาด",
    "jp": "マウス・ペン・指で署名してください。手書きせずに確認を記録する方法も選べます。"
  },
  "Draw customer signature": {
    "th": "วาดลายเซ็นลูกค้า",
    "jp": "顧客署名を記入"
  },
  "Clear signature": {
    "th": "ล้างลายเซ็น",
    "jp": "署名を消去"
  },
  "Recording…": {
    "th": "กำลังบันทึก…",
    "jp": "記録中…"
  },
  "Submit my signature": {
    "th": "ส่งลายเซ็นของฉัน",
    "jp": "署名を提出"
  },
  "I have read this exact report revision and consent to record my acknowledgment or signature, identity and date against it.": {
    "th": "ฉันอ่านรายงานฉบับนี้แล้ว และยินยอมให้บันทึกการรับทราบหรือลายเซ็น ข้อมูลตัวตนและวันที่กับรายงานฉบับนี้",
    "jp": "この改訂を読み、確認または署名、本人情報、日付をこの改訂に記録することに同意します。"
  },
  "Select an approver with report approval and signing authority.": {
    "th": "เลือกผู้อนุมัติที่มีสิทธิ์อนุมัติรายงานและลงนาม",
    "jp": "レポート承認権限と署名権限を持つ承認者を選択してください。"
  },
  "Thank you. Your signature has been recorded.": {
    "th": "ขอบคุณ บันทึกลายเซ็นของคุณแล้ว",
    "en": "Thank you. Your signature has been recorded.",
    "jp": "ありがとうございます。署名を記録しました。"
  },
  "Thank you. Your acknowledgment has been recorded.": {
    "th": "ขอบคุณ บันทึกการรับทราบของคุณแล้ว",
    "en": "Thank you. Your acknowledgment has been recorded.",
    "jp": "ありがとうございます。確認を記録しました。"
  },
  "Report template archived": {
    "th": "เก็บ Template รายงานแล้ว",
    "en": "Report template archived",
    "jp": "レポートテンプレートをアーカイブしました"
  },
  "Report template saved": {
    "th": "บันทึก Template รายงานแล้ว",
    "en": "Report template saved",
    "jp": "レポートテンプレートを保存しました"
  },
  "Discard unsaved template changes?": {
    "th": "ต้องการทิ้งการแก้ไข Template ที่ยังไม่บันทึกหรือไม่?",
    "en": "Discard unsaved template changes?",
    "jp": "未保存のテンプレート変更を破棄しますか？"
  },
  "Changing report type clears the current template sections. Continue?": {
    "th": "การเปลี่ยนประเภทรายงานจะล้างส่วนของ Template ปัจจุบัน ต้องการดำเนินการต่อหรือไม่?",
    "en": "Changing report type clears the current template sections. Continue?",
    "jp": "レポート種別を変更すると現在のテンプレート項目が消去されます。続行しますか？"
  },
  "Templates": {
    "th": "Template",
    "jp": "テンプレート"
  },
  "Company": {
    "th": "บริษัท",
    "jp": "会社"
  },
  "Installation": {
    "th": "การติดตั้ง",
    "jp": "設置"
  },
  "UAT": {
    "th": "UAT",
    "jp": "UAT",
    "en": "UAT"
  },
  "Service": {
    "th": "บริการ",
    "jp": "サービス"
  },
  "Inspection": {
    "th": "ตรวจสอบ",
    "jp": "検査"
  },
  "POC": {
    "th": "POC",
    "jp": "POC",
    "en": "POC"
  },
  "Prepared by": {
    "th": "ผู้จัดทำ",
    "jp": "作成者"
  },
  "Reviewed by": {
    "th": "ผู้ตรวจ",
    "jp": "確認者"
  },
  "Approved by": {
    "th": "ผู้อนุมัติ",
    "jp": "承認者"
  },
  "Service Report Rev.00": {
    "th": "แบบรายงานบริการ Rev.00",
    "jp": "サービス報告書 Rev.00"
  },
  "UAT Report Rev.00": {
    "th": "แบบรายงาน UAT Rev.00",
    "jp": "UAT報告書 Rev.00"
  },
  "โครงแบบ Service Report": {
    "th": "โครงแบบ Service Report",
    "jp": "サービス報告書に基づく様式",
    "en": "Based on Service Report"
  },
  "แบบตรวจสอบ": {
    "th": "แบบตรวจสอบ",
    "jp": "検査様式",
    "en": "Inspection form"
  },
  "เชื่อมกับ Inquiry": {
    "th": "เชื่อมกับ Inquiry",
    "jp": "引合に連携",
    "en": "Linked to an inquiry"
  },
  "INSTALLATION": {
    "th": "การติดตั้ง",
    "jp": "設置",
    "en": "Installation"
  },
  "SERVICE": {
    "th": "บริการ",
    "jp": "サービス",
    "en": "Service"
  },
  "INSPECTION": {
    "th": "ตรวจสอบ",
    "jp": "検査",
    "en": "Inspection"
  }
};
export function reportUiText(text: string, lang: Lang) {
  const value = REPORT_UI_COPY[text];
  if (value) return lang === "TH" ? value.th : lang === "JP" ? value.jp : value.en ?? text;
  const documentCopy = reportCopy(lang === "TH" ? "th" : lang === "JP" ? "ja" : "en", text);
  return documentCopy === text ? translate(text, lang) : documentCopy;
}
export function useReportUiText() {
  const {lang} = useLanguage();
  return (text: string) => reportUiText(text, lang);
}
