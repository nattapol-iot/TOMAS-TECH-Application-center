"use client";

/* ==========================================================================
   Language

   The dictionary is keyed by the English phrase itself, so a screen only has
   to wrap its text in t("…") and an untranslated phrase still renders — in
   English — instead of showing a missing key. Add a Thai and a Japanese entry
   to translate it.
   ========================================================================== */

import { createContext, useContext } from "react";

export type Lang = "TH" | "EN" | "JP";

export const LANGUAGES: Lang[] = ["TH", "EN", "JP"];

type Entry = { th: string; jp: string };

export const DICTIONARY: Record<string, Entry> = {
  /* Navigation */
  "Dashboard": { th: "แดชบอร์ด", jp: "ダッシュボード" },
  "Inquiry": { th: "งานสอบถามราคา", jp: "引合" },
  "Estimate Cost": { th: "ประมาณการต้นทุน", jp: "見積原価" },
  "Price Library": { th: "คลังราคา", jp: "価格ライブラリ" },
  "Supplier Quotation": { th: "ใบเสนอราคาผู้ขาย", jp: "仕入先見積" },
  "Waiting Supplier Price": { th: "รอราคาจากผู้ขาย", jp: "仕入先価格待ち" },
  "Resource Plan": { th: "แผนกำลังคน", jp: "リソース計画" },
  "Purchase Requisition": { th: "ใบขอซื้อ", jp: "購買申請" },
  "Customers": { th: "ลูกค้า", jp: "顧客" },
  "Projects": { th: "โปรเจกต์", jp: "プロジェクト" },
  "Reports": { th: "รายงาน", jp: "レポート" },
  "Master Data": { th: "ข้อมูลหลัก", jp: "マスタデータ" },
  "Engineering Rate": { th: "อัตราค่าแรงวิศวกรรม", jp: "技術単価" },
  "Audit Log": { th: "บันทึกการเปลี่ยนแปลง", jp: "監査ログ" },
  "Settings": { th: "ตั้งค่า", jp: "設定" },
  "PRICE & SUPPLIER": { th: "ราคาและผู้ขาย", jp: "価格・仕入先" },
  "PLANNING": { th: "การวางแผน", jp: "計画" },
  "ORGANISATION": { th: "องค์กร", jp: "組織" },
  "ADMINISTRATION": { th: "ผู้ดูแลระบบ", jp: "管理" },

  /* Shell */
  "Search inquiry, estimate, customer, project, brand, model, supplier or engineer…":
    { th: "ค้นหางานสอบถามราคา ประมาณการ ลูกค้า โปรเจกต์ ยี่ห้อ รุ่น ผู้ขาย หรือวิศวกร…", jp: "引合・見積・顧客・プロジェクト・ブランド・型式・仕入先・技術者を検索…" },
  "Global search": { th: "ค้นหาทั้งระบบ", jp: "全体検索" },
  "Notifications": { th: "การแจ้งเตือน", jp: "通知" },
  "Profile & department": { th: "โปรไฟล์และแผนก", jp: "プロフィール・部署" },
  "Logout": { th: "ออกจากระบบ", jp: "ログアウト" },
  "Sign out": { th: "ออกจากระบบ", jp: "ログアウト" },
  "Main navigation": { th: "เมนูหลัก", jp: "メインメニュー" },

  /* Login */
  "Sign in": { th: "เข้าสู่ระบบ", jp: "サインイン" },
  "Use your company account to open the estimate workspace.":
    { th: "ใช้บัญชีบริษัทเพื่อเข้าใช้งานพื้นที่ทำประมาณการ", jp: "会社アカウントで見積ワークスペースを開きます。" },
  "Email": { th: "อีเมล", jp: "メールアドレス" },
  "Password": { th: "รหัสผ่าน", jp: "パスワード" },
  "Sign in as": { th: "เข้าใช้งานในบทบาท", jp: "ロールを選択" },
  "Keep me signed in on this workstation": { th: "จดจำการเข้าสู่ระบบบนเครื่องนี้", jp: "この端末でログイン状態を保持する" },
  "Engineering Estimate Cost Management System": { th: "ระบบบริหารต้นทุนประมาณการงานวิศวกรรม", jp: "エンジニアリング見積原価管理システム" },

  /* Common actions */
  "Save": { th: "บันทึก", jp: "保存" },
  "Saved": { th: "บันทึกแล้ว", jp: "保存済み" },
  "Cancel": { th: "ยกเลิก", jp: "キャンセル" },
  "Search": { th: "ค้นหา", jp: "検索" },
  "Reset": { th: "ล้างค่า", jp: "リセット" },
  "Add": { th: "เพิ่ม", jp: "追加" },
  "Edit": { th: "แก้ไข", jp: "編集" },
  "Delete": { th: "ลบ", jp: "削除" },
  "Rename": { th: "เปลี่ยนชื่อ", jp: "名称変更" },
  "Export": { th: "ส่งออก", jp: "エクスポート" },
  "Export Excel": { th: "ส่งออก Excel", jp: "Excel出力" },
  "Import Excel": { th: "นำเข้า Excel", jp: "Excel取込" },
  "Approve": { th: "อนุมัติ", jp: "承認" },
  "Reject": { th: "ไม่อนุมัติ", jp: "却下" },
  "Submit": { th: "ส่ง", jp: "提出" },
  "Validate": { th: "ตรวจสอบ", jp: "検証" },
  "Close": { th: "ปิด", jp: "閉じる" },
  "New Inquiry": { th: "สร้างงานสอบถามราคา", jp: "引合を新規作成" },
  "New estimate from inquiry": { th: "สร้างประมาณการจากงานสอบถามราคา", jp: "引合から見積を作成" },
  "Create Revision": { th: "สร้างรีวิชัน", jp: "リビジョン作成" },
  "Compare Revision": { th: "เปรียบเทียบรีวิชัน", jp: "リビジョン比較" },
  "Request Revision": { th: "ขอให้แก้ไข", jp: "修正依頼" },
  "Submit Review": { th: "ส่งให้ตรวจสอบ", jp: "レビュー依頼" },

  /* Grid */
  "Show": { th: "แสดง", jp: "表示件数" },
  "entries": { th: "แถว", jp: "件" },
  "Search in this grid…": { th: "ค้นหาในตารางนี้…", jp: "この表を検索…" },
  "Rows per page": { th: "จำนวนแถวต่อหน้า", jp: "1ページあたりの行数" },
  "Showing": { th: "แสดง", jp: "表示" },
  "to": { th: "ถึง", jp: "〜" },
  "of": { th: "จาก", jp: "/" },
  "Previous": { th: "ก่อนหน้า", jp: "前へ" },
  "Next": { th: "ถัดไป", jp: "次へ" },
  "Page": { th: "หน้า", jp: "ページ" },
  "No data": { th: "ไม่มีข้อมูล", jp: "データなし" },
  "INFO Status Color:": { th: "สีสถานะ:", jp: "ステータス色:" },

  /* Inquiry list */
  "Inquiry Management": { th: "จัดการงานสอบถามราคา", jp: "引合管理" },
  "SALES TO ENGINEERING": { th: "จากฝ่ายขายถึงวิศวกรรม", jp: "営業から技術へ" },
  "Every customer inquiry is registered here and receives a unique inquiry number automatically.":
    { th: "งานสอบถามราคาทุกงานถูกบันทึกที่นี่ และได้รับเลขที่อัตโนมัติโดยไม่ซ้ำกัน", jp: "すべての引合をここで登録し、重複しない引合番号が自動採番されます。" },
  "Inquiry No.": { th: "เลขที่งานสอบถามราคา", jp: "引合番号" },
  "Inquiry Date": { th: "วันที่รับงาน", jp: "引合日" },
  "Customer": { th: "ลูกค้า", jp: "顧客" },
  "Project Name": { th: "ชื่อโปรเจกต์", jp: "案件名" },
  "Project Type": { th: "ประเภทงาน", jp: "案件区分" },
  "Sales Owner": { th: "ผู้ดูแลฝ่ายขาย", jp: "営業担当" },
  "Estimate Owner": { th: "ผู้จัดทำประมาณการ", jp: "見積担当" },
  "Estimate Due": { th: "กำหนดส่งประมาณการ", jp: "見積期限" },
  "Progress": { th: "ความคืบหน้า", jp: "進捗" },
  "Priority": { th: "ความเร่งด่วน", jp: "優先度" },
  "Status": { th: "สถานะ", jp: "ステータス" },
  "Last Updated": { th: "อัปเดตล่าสุด", jp: "最終更新" },
  "Rev.": { th: "รีวิชัน", jp: "版" },

  /* Estimate list */
  "ENGINEERING COST": { th: "ต้นทุนงานวิศวกรรม", jp: "技術原価" },
  "Every estimate, its revision, its owner and its cost — one source of truth instead of many Excel files.":
    { th: "ทุกประมาณการ พร้อมรีวิชัน ผู้รับผิดชอบ และต้นทุน รวมไว้ที่เดียว แทนไฟล์ Excel หลายไฟล์", jp: "すべての見積・リビジョン・担当者・原価を一元管理し、複数のExcelを置き換えます。" },
  "Estimate No.": { th: "เลขที่ประมาณการ", jp: "見積番号" },
  "Project": { th: "โปรเจกต์", jp: "案件" },
  "Created": { th: "วันที่สร้าง", jp: "作成日" },
  "Due Date": { th: "กำหนดส่ง", jp: "期限" },
  "Material": { th: "วัสดุ/อุปกรณ์", jp: "材料費" },
  "Engineering": { th: "วิศวกรรม", jp: "技術費" },
  "Outsource": { th: "จ้างภายนอก", jp: "外注費" },
  "Other": { th: "อื่น ๆ", jp: "その他" },
  "Total Cost": { th: "ต้นทุนรวม", jp: "合計原価" },
  "estimates": { th: "รายการประมาณการ", jp: "件の見積" },
  "inquiries": { th: "รายการสอบถามราคา", jp: "件の引合" },

  /* Dashboard */
  "Engineering Estimate Dashboard": { th: "แดชบอร์ดประมาณการงานวิศวกรรม", jp: "見積ダッシュボード" },
  "Monitor inquiry workload, estimate progress, due dates, missing costs, and engineering resources.":
    { th: "ติดตามปริมาณงาน ความคืบหน้าของประมาณการ กำหนดส่ง ต้นทุนที่ยังขาด และกำลังคนวิศวกรรม", jp: "引合の負荷、見積の進捗、期限、未確定原価、技術リソースを把握します。" },
  "Open Inquiry": { th: "งานสอบถามราคาที่เปิดอยู่", jp: "進行中の引合" },
  "Estimate In Progress": { th: "ประมาณการที่กำลังทำ", jp: "作成中の見積" },
  "Waiting Engineer Input": { th: "รอวิศวกรกรอกข้อมูล", jp: "技術者入力待ち" },
  "Waiting Review": { th: "รอตรวจสอบ", jp: "レビュー待ち" },
  "Due This Week": { th: "ครบกำหนดสัปดาห์นี้", jp: "今週期限" },
  "Overdue Estimate": { th: "ประมาณการเลยกำหนด", jp: "期限超過の見積" },
  "Completed This Month": { th: "เสร็จในเดือนนี้", jp: "今月完了" },
  "Recent Estimate Cost": { th: "ประมาณการล่าสุด", jp: "最近の見積原価" },

  /* Status values */
  "New": { th: "ใหม่", jp: "新規" },
  "Estimating": { th: "กำลังประมาณการ", jp: "見積中" },
  "Estimate Completed": { th: "ประมาณการเสร็จ", jp: "見積完了" },
  "Engineering Review": { th: "อยู่ระหว่างตรวจสอบ", jp: "技術レビュー" },
  "Approved": { th: "อนุมัติแล้ว", jp: "承認済" },
  "Draft": { th: "ฉบับร่าง", jp: "下書き" },
  "Engineering Input": { th: "วิศวกรกำลังกรอก", jp: "技術入力中" },
  "Revision Required": { th: "ต้องแก้ไข", jp: "要修正" },
  "Locked": { th: "ล็อกแล้ว", jp: "ロック済" },
  "Overdue": { th: "เลยกำหนด", jp: "期限超過" },
};

export function translate(text: string, lang: Lang) {
  if (lang === "EN") return text;
  const entry = DICTIONARY[text];
  if (!entry) return text;
  return lang === "TH" ? entry.th : entry.jp;
}

export type Translator = (text: string) => string;

export const LanguageContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: Translator }>({
  lang: "EN",
  setLang: () => undefined,
  t: (text) => text,
});

export const useLanguage = () => useContext(LanguageContext);

/** Shorthand for screens: const t = useT(); … t("Save") */
export const useT = (): Translator => useContext(LanguageContext).t;
