// Report document language is saved with each revision; never translate customer-entered values.
export type ReportLocale = "th" | "en" | "ja";
export const reportLocale = (value?: string): ReportLocale => value === "en" || value === "ja" ? value : "th";
const fields: Record<string, { th: string; ja: string }> = {
  "site": {
    "th": "สถานที่",
    "ja": "現場 / 所在地"
  },
  "requestedBy": {
    "th": "ผู้ร้องขอ",
    "ja": "依頼者"
  },
  "contact": {
    "th": "ผู้ประสานงาน",
    "ja": "顧客担当者"
  },
  "contactPhone": {
    "th": "โทรศัพท์",
    "ja": "電話番号"
  },
  "contactEmail": {
    "th": "อีเมล",
    "ja": "メールアドレス"
  },
  "team": {
    "th": "ทีมปฏิบัติงาน",
    "ja": "作業チーム"
  },
  "start": {
    "th": "เริ่มงาน",
    "ja": "開始日時"
  },
  "end": {
    "th": "สิ้นสุดงาน",
    "ja": "終了日時"
  },
  "environment": {
    "th": "สภาพแวดล้อม",
    "ja": "環境"
  },
  "mode": {
    "th": "รูปแบบงาน",
    "ja": "運転モード"
  },
  "objective": {
    "th": "วัตถุประสงค์",
    "ja": "目的"
  },
  "summary": {
    "th": "สรุปงาน",
    "ja": "概要"
  },
  "item": {
    "th": "รายการ",
    "ja": "項目"
  },
  "model": {
    "th": "รุ่น",
    "ja": "型式"
  },
  "serial": {
    "th": "หมายเลขเครื่อง",
    "ja": "製造番号"
  },
  "quantity": {
    "th": "จำนวน",
    "ja": "数量"
  },
  "action": {
    "th": "งานที่ทำ",
    "ja": "実施内容"
  },
  "status": {
    "th": "สถานะ",
    "ja": "状態"
  },
  "module": {
    "th": "ระบบ / โมดูล",
    "ja": "システム / モジュール"
  },
  "versionBefore": {
    "th": "เวอร์ชันเดิม",
    "ja": "変更前バージョン"
  },
  "versionAfter": {
    "th": "เวอร์ชันใหม่",
    "ja": "変更後バージョン"
  },
  "configurationLicense": {
    "th": "การตั้งค่า / License",
    "ja": "設定 / ライセンス"
  },
  "symptom": {
    "th": "อาการ / ปัญหา",
    "ja": "症状 / 問題"
  },
  "impact": {
    "th": "ผลกระทบ",
    "ja": "影響"
  },
  "rootCause": {
    "th": "สาเหตุ",
    "ja": "原因"
  },
  "downtime": {
    "th": "ระยะเวลาหยุดระบบ",
    "ja": "停止時間"
  },
  "backup": {
    "th": "การสำรองข้อมูล",
    "ja": "バックアップ"
  },
  "rollback": {
    "th": "แผนย้อนกลับ",
    "ja": "復旧計画"
  },
  "verification": {
    "th": "การทดสอบที่ดำเนินการ",
    "ja": "実施した検証"
  },
  "testResult": {
    "th": "ผลการทดสอบ",
    "ja": "試験結果"
  },
  "customerAcceptance": {
    "th": "ข้อสรุปการรับมอบ",
    "ja": "顧客検収結果"
  },
  "followUp": {
    "th": "งานติดตาม",
    "ja": "フォローアップ"
  },
  "scenario": {
    "th": "หัวข้อทดสอบ",
    "ja": "試験項目"
  },
  "step": {
    "th": "ขั้นตอนทดสอบ",
    "ja": "試験手順"
  },
  "input": {
    "th": "ข้อมูลนำเข้า",
    "ja": "入力値"
  },
  "expected": {
    "th": "ผลที่คาดหวัง",
    "ja": "期待結果"
  },
  "actual": {
    "th": "ผลที่เกิดขึ้นจริง",
    "ja": "実際の結果"
  },
  "result": {
    "th": "ผลทดสอบ",
    "ja": "結果"
  },
  "remark": {
    "th": "หมายเหตุ",
    "ja": "備考"
  },
  "remarks": {
    "th": "หมายเหตุ / คำขอเพิ่มเติม",
    "ja": "備考 / 追加依頼"
  },
  "evidence": {
    "th": "หลักฐานอ้างอิง",
    "ja": "証拠資料"
  },
  "issue": {
    "th": "ปัญหา / งานค้าง",
    "ja": "問題 / 残作業"
  },
  "owner": {
    "th": "ผู้รับผิดชอบ",
    "ja": "担当者"
  },
  "dueDate": {
    "th": "กำหนดเสร็จ",
    "ja": "期限"
  },
  "updatedDate": {
    "th": "วันที่อัปเดต",
    "ja": "更新日"
  },
  "correctiveResult": {
    "th": "ผลการแก้ไข",
    "ja": "是正結果"
  },
  "resultStatus": {
    "th": "ผลตรวจซ้ำ",
    "ja": "再確認結果"
  },
  "testFrom": {
    "th": "วันเริ่มทดสอบ",
    "ja": "試験開始日"
  },
  "testTo": {
    "th": "วันสิ้นสุดทดสอบ",
    "ja": "試験終了日"
  },
  "overallResult": {
    "th": "สรุปผลทดสอบ",
    "ja": "総合結果"
  },
  "issueCount": {
    "th": "จำนวนปัญหา",
    "ja": "問題件数"
  },
  "correctiveCount": {
    "th": "จำนวนที่แก้ไข",
    "ja": "是正件数"
  },
  "followUpOwner": {
    "th": "ผู้ติดตามงาน",
    "ja": "フォロー担当者"
  },
  "acceptance": {
    "th": "ข้อสรุปการรับมอบ",
    "ja": "検収結果"
  },
  "revisionEvidence": {
    "th": "ฉบับเอกสารอ้างอิง",
    "ja": "参照改訂"
  },
  "description": {
    "th": "คำอธิบาย",
    "ja": "説明"
  },
  "reference": {
    "th": "เอกสาร / ไฟล์อ้างอิง",
    "ja": "参照文書 / ファイル"
  },
  "url": {
    "th": "ลิงก์หลักฐาน",
    "ja": "証拠リンク"
  },
  "checkpoint": {
    "th": "รายการตรวจสอบ",
    "ja": "確認項目"
  },
  "observed": {
    "th": "ผลที่ตรวจพบ",
    "ja": "確認結果"
  },
  "unit": {
    "th": "หน่วย",
    "ja": "単位"
  },
  "corrective": {
    "th": "การแก้ไข",
    "ja": "是正処置"
  },
  "hypothesis": {
    "th": "สมมติฐาน",
    "ja": "仮説"
  },
  "successCriteria": {
    "th": "เกณฑ์สำเร็จ",
    "ja": "成功基準"
  },
  "baseline": {
    "th": "ค่าก่อนทดสอบ",
    "ja": "試験前の値"
  },
  "trial": {
    "th": "วิธีทดสอบ",
    "ja": "試験方法"
  },
  "limitations": {
    "th": "ข้อจำกัด",
    "ja": "制約"
  },
  "visitType": {
    "th": "ประเภทงาน",
    "ja": "作業区分"
  },
  "ticket": {
    "th": "เลขที่ Ticket / CR",
    "ja": "チケット / 変更要求番号"
  },
  "nextActionDate": {
    "th": "วันดำเนินการถัดไป",
    "ja": "次回実施日"
  },
  "revisionUsed": {
    "th": "ฉบับที่ใช้อ้างอิง",
    "ja": "使用した改訂"
  },
  "pendingItems": {
    "th": "รายการวัสดุ / งานคงค้าง",
    "ja": "残品 / 残作業"
  }
};
export function reportFieldLabel(locale: string | undefined, key: string, english: string) {
 const language = reportLocale(locale);
 return language === "en" ? english : fields[key]?.[language] ?? english;
}
const copy: Record<string, [string, string, string]> = {
  "ข้อมูลการปฏิบัติงาน / Work details": [
    "ข้อมูลการปฏิบัติงาน",
    "Work details",
    "作業情報"
  ],
  "ขอบเขตและวัตถุประสงค์ / Scope & objective": [
    "ขอบเขตและวัตถุประสงค์",
    "Scope & objective",
    "範囲と目的"
  ],
  "Hardware / อุปกรณ์": [
    "อุปกรณ์",
    "Hardware",
    "ハードウェア"
  ],
  "Software / โปรแกรมและการตั้งค่า": [
    "โปรแกรมและการตั้งค่า",
    "Software & configuration",
    "ソフトウェアと設定"
  ],
  "รายการทดสอบ UAT / Test scenarios": [
    "รายการทดสอบ UAT",
    "UAT test scenarios",
    "UAT試験項目"
  ],
  "สรุปผล UAT / UAT summary": [
    "สรุปผล UAT",
    "UAT summary",
    "UAT結果概要"
  ],
  "รายการปัญหา UAT / Punchlist": [
    "รายการปัญหา UAT",
    "Punchlist",
    "パンチリスト"
  ],
  "รูปภาพและหลักฐาน / Evidence references": [
    "รูปภาพและหลักฐาน",
    "Evidence references",
    "写真と証拠資料"
  ],
  "งานค้างและผู้รับผิดชอบ / Pending actions": [
    "งานค้างและผู้รับผิดชอบ",
    "Pending actions",
    "残作業と担当者"
  ],
  "เอกสารและงานส่งมอบ / Deliverables": [
    "เอกสารและงานส่งมอบ",
    "Deliverables",
    "成果物"
  ],
  "หมายเหตุและคำขอ / Remarks": [
    "หมายเหตุและคำขอ",
    "Remarks",
    "備考と依頼"
  ],
  "ตรวจสอบการติดตั้ง / Commissioning": [
    "ตรวจสอบการติดตั้ง",
    "Commissioning",
    "設置確認"
  ],
  "รายการตรวจสอบ / Inspection": [
    "รายการตรวจสอบ",
    "Inspection",
    "検査項目"
  ],
  "รายการทดลอง / POC trials": [
    "รายการทดลอง",
    "POC trials",
    "POC試験"
  ],
  "1) ขอบเขตและวัตถุประสงค์ / Scope & objective": [
    "1) ขอบเขตและวัตถุประสงค์",
    "1) Scope & objective",
    "1) 範囲と目的"
  ],
  "2) รายละเอียดการติดตั้งหรือเปลี่ยนแปลง / Installation & change detail": [
    "2) รายละเอียดการติดตั้งหรือเปลี่ยนแปลง",
    "2) Installation & change detail",
    "2) 設置・変更内容"
  ],
  "3) ปัญหาและการแก้ไข / Problem & resolution": [
    "3) ปัญหาและการแก้ไข",
    "3) Problem & resolution",
    "3) 問題と解決内容"
  ],
  "4) การทดสอบและส่งมอบ / Verification & handover": [
    "4) การทดสอบและส่งมอบ",
    "4) Verification & handover",
    "4) 検証と引渡し"
  ],
  "5) รายการคงค้าง / Pending items": [
    "5) รายการคงค้าง",
    "5) Pending items",
    "5) 残作業"
  ],
  "การสำรองข้อมูลและแผนย้อนกลับ / Backup & rollback": [
    "การสำรองข้อมูลและแผนย้อนกลับ",
    "Backup & rollback",
    "バックアップと復旧計画"
  ],
  "1. หน้ารายงาน": [
    "1. หน้ารายงาน",
    "1. Report cover",
    "1. レポート表紙"
  ],
  "2. รายการทดสอบ": [
    "2. รายการทดสอบ",
    "2. Test cases",
    "2. 試験項目"
  ],
  "3. ปัญหา / งานค้าง": [
    "3. ปัญหา / งานค้าง",
    "3. Punchlist",
    "3. 問題・残作業"
  ],
  "4. หลักฐาน": [
    "4. หลักฐาน",
    "4. Evidence",
    "4. 証拠資料"
  ],
  "Report & summary": [
    "รายงานและสรุปผล",
    "Report & summary",
    "レポートと概要"
  ],
  "UAT list": [
    "รายการทดสอบ UAT",
    "UAT list",
    "UAT試験一覧"
  ],
  "Punchlist": [
    "ปัญหา / งานค้าง",
    "Punchlist",
    "パンチリスト"
  ],
  "Evidence": [
    "หลักฐาน",
    "Evidence",
    "証拠資料"
  ],
  "รายการเอกสาร / Report contents": [
    "รายการเอกสาร",
    "Report contents",
    "レポート目次"
  ],
  "ข้อมูลและสรุปผล": [
    "ข้อมูลและสรุปผล",
    "Details & summary",
    "詳細と概要"
  ],
  "entries": [
    "รายการ",
    "entries",
    "件"
  ],
  "Row": [
    "แถว",
    "Row",
    "行"
  ],
  "Delete": [
    "ลบ",
    "Delete",
    "削除"
  ],
  "ลบรายการ": [
    "ลบรายการ",
    "Delete row",
    "行を削除"
  ],
  "ยังไม่ระบุ": [
    "ยังไม่ระบุ",
    "Not specified",
    "未指定"
  ],
  "ยังไม่มีรายการ / No entries recorded": [
    "ยังไม่มีรายการ",
    "No entries recorded",
    "記録なし"
  ],
  "＋ เพิ่มแถว / Add row": [
    "＋ เพิ่มแถว",
    "＋ Add row",
    "＋ 行を追加"
  ],
  "PASS": [
    "ผ่าน",
    "PASS",
    "合格"
  ],
  "FAIL": [
    "ไม่ผ่าน",
    "FAIL",
    "不合格"
  ],
  "PARTIAL": [
    "ผ่านบางส่วน",
    "PARTIAL",
    "一部合格"
  ],
  "กำหนดหัวข้อ ขั้นตอน และผลที่คาดหวังไว้ใช้ซ้ำ / Reusable instructions & expected results": [
    "กำหนดหัวข้อ ขั้นตอน และผลที่คาดหวังไว้ใช้ซ้ำ",
    "Define reusable instructions and expected results.",
    "再利用する手順と期待結果を入力してください。"
  ],
  "กรอกในช่องของแบบฟอร์มได้เลย · * ต้องกรอกก่อนส่งตรวจ (สำหรับแถวที่ใช้งาน) · บันทึกฉบับร่างระหว่างทำได้": [
    "กรอกในช่องของแบบฟอร์มได้เลย · * ต้องกรอกก่อนส่งตรวจ (สำหรับแถวที่ใช้งาน) · บันทึกฉบับร่างระหว่างทำได้",
    "Fill in the form. Fields marked * are required before review for each used row. Save drafts as you work.",
    "様式に直接入力できます。使用する行の * 項目は提出前に必須です。作業中に下書きを保存できます。"
  ],
  "ระบุรูปภาพหรือเอกสารที่ใช้อ้างอิง โดยกรอกชื่อไฟล์ / เลขเอกสาร หรือลิงก์หลักฐานอย่างน้อยหนึ่งช่องต่อรายการ / File reference or evidence URL": [
    "ระบุชื่อไฟล์ / เลขเอกสาร หรือลิงก์หลักฐานอย่างน้อยหนึ่งช่องต่อรายการ",
    "Provide at least one file/document reference or evidence URL per entry.",
    "各行に参照ファイル・文書番号または証拠URLを入力してください。"
  ],
  "REPORT NO. / เลขที่": [
    "เลขที่รายงาน",
    "REPORT NO.",
    "レポート番号"
  ],
  "REPORT DATE / วันที่": [
    "วันที่รายงาน",
    "REPORT DATE",
    "報告日"
  ],
  "STATUS / สถานะ": [
    "สถานะ",
    "STATUS",
    "状態"
  ],
  "CUSTOMER / บริษัทผู้ว่าจ้าง": [
    "บริษัทผู้ว่าจ้าง",
    "CUSTOMER",
    "契約顧客"
  ],
  "PROJECT / INQUIRY NO.": [
    "เลข Project / Inquiry",
    "PROJECT / INQUIRY NO.",
    "プロジェクト / 引合番号"
  ],
  "END USER / บริษัทผู้ใช้งานปลายทาง": [
    "บริษัทผู้ใช้งานปลายทาง",
    "END USER",
    "エンドユーザー"
  ],
  "PROJECT / SITE / โครงการ": [
    "โครงการ / สถานที่",
    "PROJECT / SITE",
    "プロジェクト / 現場"
  ],
  "REPORT TITLE / เรื่อง": [
    "เรื่อง",
    "REPORT TITLE",
    "件名"
  ],
  "ใบรายงานการทดสอบและตรวจรับงาน": [
    "ใบรายงานการทดสอบและตรวจรับงาน",
    "User acceptance test report",
    "ユーザー受入試験報告書"
  ],
  "ใบรายงานการให้บริการ": [
    "ใบรายงานการให้บริการ",
    "Service report",
    "サービス報告書"
  ],
  "ใบรายงานผลการดำเนินงาน": [
    "ใบรายงานผลการดำเนินงาน",
    "Work completion report",
    "作業報告書"
  ],
  "อ้างอิง TT-FRM-UAT-001 · Rev.00": [
    "อ้างอิง TT-FRM-UAT-001 · Rev.00",
    "Reference TT-FRM-UAT-001 · Rev.00",
    "参照 TT-FRM-UAT-001 · Rev.00"
  ],
  "อ้างอิง TT-FRM-SRV-001 · Rev.00": [
    "อ้างอิง TT-FRM-SRV-001 · Rev.00",
    "Reference TT-FRM-SRV-001 · Rev.00",
    "参照 TT-FRM-SRV-001 · Rev.00"
  ],
  "แบบรายงานมาตรฐานทีม": [
    "แบบรายงานมาตรฐานทีม",
    "Team standard report",
    "チーム標準レポート"
  ],
  "ผู้จัดทำ / Prepared by": [
    "ผู้จัดทำ",
    "Prepared by",
    "作成者"
  ],
  "ผู้ตรวจ / Reviewed by": [
    "ผู้ตรวจ",
    "Reviewed by",
    "確認者"
  ],
  "ผู้อนุมัติ / Approved by": [
    "ผู้อนุมัติ",
    "Approved by",
    "承認者"
  ],
  "ACKNOWLEDGEMENT / การลงนามและรับทราบ": [
    "การลงนามและรับทราบ",
    "SIGNATURES & ACKNOWLEDGMENT",
    "署名と確認"
  ],
  "ตัวแทนลูกค้า / Customer": [
    "ตัวแทนลูกค้า",
    "Customer representative",
    "顧客担当者"
  ],
  "ลงนามในระบบแล้ว": [
    "ลงนามในระบบแล้ว",
    "Signed electronically",
    "電子署名済み"
  ],
  "ตรวจแล้ว (ไม่ได้ลงนาม)": [
    "ตรวจแล้ว (ไม่ได้ลงนาม)",
    "Reviewed without signature",
    "署名なしで確認済み"
  ],
  "ยังไม่ได้ลงนาม": [
    "ยังไม่ได้ลงนาม",
    "Not signed",
    "未署名"
  ],
  "รอลูกค้ารับทราบ": [
    "รอลูกค้ารับทราบ",
    "Awaiting customer acknowledgment",
    "顧客確認待ち"
  ],
  "ส่งลิงก์ให้ลูกค้าหลังอนุมัติรายงาน": [
    "ส่งลิงก์ให้ลูกค้าหลังอนุมัติรายงาน",
    "Share the customer link after report approval.",
    "レポート承認後に顧客用リンクを共有してください。"
  ],
  "วันที่: —": [
    "วันที่: —",
    "Date: —",
    "日付：—"
  ],
  "ลายเซ็นและการรับทราบในส่วนนี้มาจากขั้นตอนลงนามของรายงานฉบับนี้": [
    "ลายเซ็นและการรับทราบในส่วนนี้มาจากขั้นตอนลงนามของรายงานฉบับนี้",
    "Signatures and acknowledgment belong to this report revision.",
    "署名と確認はこのレポート改訂に紐づいています。"
  ],
  "Draft": [
    "ฉบับร่าง",
    "Draft",
    "下書き"
  ],
  "Team review": [
    "รอทีมตรวจ",
    "Team review",
    "チーム確認"
  ],
  "Awaiting approval": [
    "รออนุมัติ",
    "Awaiting approval",
    "承認待ち"
  ],
  "Approved": [
    "อนุมัติแล้ว",
    "Approved",
    "承認済み"
  ],
  "Customer signature": [
    "รอลูกค้าเซ็น",
    "Customer signature",
    "顧客署名待ち"
  ],
  "Complete": [
    "เสร็จสมบูรณ์",
    "Complete",
    "完了"
  ],
  "Changes requested": [
    "ขอแก้ไข",
    "Changes requested",
    "修正依頼"
  ],
  "Void": [
    "ยกเลิก",
    "Void",
    "無効"
  ],
  "Signed": [
    "ลงนามแล้ว",
    "Signed",
    "署名済み"
  ],
  "Acknowledged": [
    "รับทราบแล้ว",
    "Acknowledged",
    "確認済み"
  ],
  "INSTALLATION REPORT": [
    "รายงานการติดตั้ง",
    "INSTALLATION REPORT",
    "設置報告書"
  ],
  "UAT REPORT": [
    "รายงาน UAT",
    "UAT REPORT",
    "UAT試験報告書"
  ],
  "SERVICE REPORT": [
    "รายงานการให้บริการ",
    "SERVICE REPORT",
    "サービス報告書"
  ],
  "INSPECTION REPORT": [
    "รายงานการตรวจสอบ",
    "INSPECTION REPORT",
    "検査報告書"
  ],
  "POC REPORT": [
    "รายงาน POC",
    "POC REPORT",
    "POC試験報告書"
  ],
  "Report date": [
    "วันที่รายงาน",
    "Report date",
    "報告日"
  ],
  "Report title": [
    "ชื่อรายงาน",
    "Report title",
    "レポート名"
  ]
};
export function reportCopy(locale: string | undefined, source: string) {
 const entry = copy[source];
 return entry ? entry[reportLocale(locale) === "th" ? 0 : reportLocale(locale) === "en" ? 1 : 2] : source;
}
export function reportTimestamp(locale: string | undefined, value: string) {
 return new Intl.DateTimeFormat(reportLocale(locale) === "th" ? "th-TH" : reportLocale(locale) === "ja" ? "ja-JP" : "en-GB", {dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Bangkok"}).format(new Date(value));
}
