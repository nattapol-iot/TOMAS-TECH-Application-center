export const LABOR_PACKAGE_COPY: Record<string, { th: string; jp: string }> = {
  "Install standard library": {
    "th": "เพิ่มชุดมาตรฐานจาก Excel",
    "jp": "Excel標準ライブラリを追加"
  },
  "Install Excel labor cost masters": {
    "th": "เพิ่ม Labor Cost Master จาก Excel",
    "jp": "Excel工数マスターを追加"
  },
  "This adds 11 labor packages and 8 companion support-cost templates. Existing masters with the same code are kept unchanged.": {
    "th": "ระบบจะเพิ่มชุดค่าแรง 11 ชุด และแม่แบบค่าใช้จ่ายประกอบ 8 ชุด โดยจะเก็บ Master เดิมที่มีรหัสเดียวกันไว้โดยไม่เขียนทับ",
    "jp": "工数パッケージ11件と付随費用テンプレート8件を追加します。同じコードの既存マスターは上書きしません。"
  },
  "Install 19 masters": {
    "th": "เพิ่ม Master ทั้ง 19 ชุด",
    "jp": "19件のマスターを追加"
  },
  "Cancel": {
    "th": "ยกเลิก",
    "jp": "キャンセル"
  },
  "Installing…": {
    "th": "กำลังเพิ่มข้อมูล…",
    "jp": "追加中…"
  },
  "Install the standard labor library?": {
    "th": "เพิ่มชุดค่าแรงและค่าใช้จ่ายประกอบมาตรฐานจากไฟล์ Excel ใช่หรือไม่? ข้อมูลเดิมที่มีรหัสเดียวกันจะไม่ถูกเขียนทับ",
    "jp": "Excelから標準工数と付随費用を追加しますか？同じコードの既存データは上書きされません。"
  },
  "Standard library installed": {
    "th": "เพิ่มคลังมาตรฐานแล้ว",
    "jp": "標準ライブラリを追加しました"
  },
  "labor packages": {
    "th": "ชุดค่าแรง",
    "jp": "工数パッケージ"
  },
  "support-cost templates": {
    "th": "แม่แบบค่าใช้จ่ายประกอบ",
    "jp": "付随費用テンプレート"
  },
  "The standard library is already installed.": {
    "th": "คลังมาตรฐานถูกเพิ่มไว้แล้ว ไม่มีข้อมูลถูกเขียนทับ",
    "jp": "標準ライブラリは追加済みです。上書きはありません。"
  },
  "Labor packages use person-days. Travel, accommodation, tools and safety are installed as companion templates in Module Templates.": {
    "th": "ชุดค่าแรงคำนวณด้วยคน-วัน ส่วนค่าเดินทาง ที่พัก เครื่องมือ และ Safety Cost จะอยู่ในแม่แบบโมดูล เพื่อไม่ให้ถูกคิดเป็นค่าแรงซ้ำ",
    "jp": "工数は人日で計算します。交通費・宿泊費・工具費・安全費は工数との二重計上を防ぐため、モジュールテンプレートに分けて登録します。"
  },
  "Discard changes": { "th": "ยกเลิกการแก้ไข", "jp": "変更を破棄" },
  "Labor Packages": {
    "th": "ชุดค่าแรง",
    "jp": "工数パッケージ"
  },
  "Save time with reusable activities, staffing and durations.": {
    "th": "ใช้กิจกรรม จำนวนคน และระยะเวลาซ้ำได้ เพื่อทำประมาณราคาได้เร็วขึ้น",
    "jp": "作業・人数・期間を再利用して見積時間を短縮します。"
  },
  "Refresh": {
    "th": "รีเฟรช",
    "jp": "更新"
  },
  "How to create and use a package": {
    "th": "วิธีสร้างและนำชุดค่าแรงไปใช้",
    "jp": "作成・利用方法"
  },
  "Create from an estimate": {
    "th": "สร้างจาก Estimate",
    "jp": "見積から作成"
  },
  "Use Save as labor package on an existing estimate work package. It will appear here as a draft.": {
    "th": "ใช้ Save as labor package จากชุดงานใน Estimate ที่มีอยู่ แล้วชุดค่าแรงจะปรากฏที่นี่เป็นฉบับร่าง",
    "jp": "見積の作業パッケージで Save as labor package を選ぶと、下書きがここに表示されます。"
  },
  "Review and publish": {
    "th": "ตรวจสอบและเผยแพร่",
    "jp": "確認して公開"
  },
  "Check activities and defaults. An authorized master-data editor can publish the draft.": {
    "th": "ตรวจสอบกิจกรรมและค่าเริ่มต้น จากนั้นให้ผู้มีสิทธิ์ดูแลข้อมูลหลักเผยแพร่",
    "jp": "作業と初期値を確認し、権限のある担当者が下書きを公開します。"
  },
  "Reuse in Estimate Cost": {
    "th": "นำไปใช้ใน Estimate Cost",
    "jp": "見積で再利用"
  },
  "Open a labor package picker in your estimate and select a ready-to-use package. Internal rates use the current rate master.": {
    "th": "เปิดตัวเลือกชุดค่าแรงใน Estimate แล้วเลือกชุดที่พร้อมใช้งาน อัตราค่าแรงภายในจะใช้ข้อมูลหลักล่าสุด",
    "jp": "見積のパッケージ選択画面で公開済みのものを選択します。社内単価は最新のマスタを使用します。"
  },
  "All": {
    "th": "ทั้งหมด",
    "jp": "すべて"
  },
  "Ready to use": {
    "th": "พร้อมใช้งาน",
    "jp": "利用可能"
  },
  "Draft": {
    "th": "ฉบับร่าง",
    "jp": "下書き"
  },
  "Retired": {
    "th": "เลิกใช้งาน",
    "jp": "廃止"
  },
  "Search name, code or activity": {
    "th": "ค้นหาชื่อ รหัส หรือกิจกรรม",
    "jp": "名前・コード・作業を検索"
  },
  "packages found": {
    "th": "ชุดที่พบ",
    "jp": "件のパッケージ"
  },
  "activities": {
    "th": "กิจกรรม",
    "jp": "作業"
  },
  "Revision": {
    "th": "ฉบับที่",
    "jp": "版"
  },
  "Loading packages…": {
    "th": "กำลังโหลดชุดค่าแรง…",
    "jp": "パッケージを読込中…"
  },
  "No matching packages": {
    "th": "ไม่พบชุดค่าแรงที่ค้นหา",
    "jp": "一致するパッケージがありません"
  },
  "Try another search or clear the filters.": {
    "th": "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง",
    "jp": "検索条件を変更するか解除してください。"
  },
  "Clear filters": {
    "th": "ล้างตัวกรอง",
    "jp": "絞り込みを解除"
  },
  "No labor packages yet": {
    "th": "ยังไม่มีชุดค่าแรง",
    "jp": "パッケージはまだありません"
  },
  "Select a package to get started": {
    "th": "เลือกชุดค่าแรงเพื่อเริ่มต้น",
    "jp": "パッケージを選択"
  },
  "Choose a package from the list to review its activities, edit a draft or make a copy.": {
    "th": "เลือกชุดจากรายการเพื่อดูกิจกรรม แก้ไขฉบับร่าง หรือสร้างสำเนา",
    "jp": "一覧から選択して作業を確認し、下書きの編集やコピーを作成できます。"
  },
  "Package details": {
    "th": "รายละเอียดชุดค่าแรง",
    "jp": "パッケージ詳細"
  },
  "New draft copy": {
    "th": "สำเนาฉบับร่างใหม่",
    "jp": "新しい下書きコピー"
  },
  "Close": {
    "th": "ปิด",
    "jp": "閉じる"
  },
  "Loading details…": {
    "th": "กำลังโหลดรายละเอียด…",
    "jp": "詳細を読込中…"
  },
  "This package is ready to use. Make a draft copy to change it.": {
    "th": "ชุดนี้พร้อมนำไปใช้แล้ว หากต้องการแก้ไขให้สร้างสำเนาฉบับร่าง",
    "jp": "利用可能です。変更する場合は下書きコピーを作成してください。"
  },
  "This package is retired and is available for reference only.": {
    "th": "ชุดนี้เลิกใช้งานแล้ว เปิดดูเพื่ออ้างอิงได้เท่านั้น",
    "jp": "廃止済みです。参照のみ可能です。"
  },
  "Review the activities, then save your draft or publish it for the team.": {
    "th": "ตรวจสอบกิจกรรม แล้วบันทึกฉบับร่างหรือเผยแพร่ให้ทีมใช้งาน",
    "jp": "作業を確認して下書きを保存するか、チームに公開してください。"
  },
  "Package information": {
    "th": "ข้อมูลชุดค่าแรง",
    "jp": "パッケージ情報"
  },
  "Package code": {
    "th": "รหัสชุดค่าแรง",
    "jp": "パッケージコード"
  },
  "Package name": {
    "th": "ชื่อชุดค่าแรง",
    "jp": "パッケージ名"
  },
  "Description": {
    "th": "คำอธิบาย",
    "jp": "説明"
  },
  "No description provided": {
    "th": "ยังไม่มีคำอธิบาย",
    "jp": "説明はありません"
  },
  "All departments": {
    "th": "ทุกแผนก",
    "jp": "全部門"
  },
  "All project types": {
    "th": "ทุกประเภทโครงการ",
    "jp": "すべての案件種類"
  },
  "Activity defaults": {
    "th": "ค่าเริ่มต้นของกิจกรรม",
    "jp": "作業の初期値"
  },
  "Defaults can be adjusted when applying this package to an estimate.": {
    "th": "ปรับค่าเริ่มต้นเหล่านี้ได้เมื่อนำชุดไปใช้ใน Estimate",
    "jp": "見積に適用する際に初期値を調整できます。"
  },
  "Activity": {
    "th": "กิจกรรม",
    "jp": "作業"
  },
  "People": {
    "th": "จำนวนคน",
    "jp": "人数"
  },
  "Duration": {
    "th": "ระยะเวลา",
    "jp": "期間"
  },
  "ERP category": {
    "th": "หมวด ERP",
    "jp": "ERP分類"
  },
  "Hours": {
    "th": "ชั่วโมง",
    "jp": "時間"
  },
  "Man-days": {
    "th": "คน-วัน",
    "jp": "人日"
  },
  "Choose a category": {
    "th": "เลือกหมวด",
    "jp": "分類を選択"
  },
  "Create draft copy": {
    "th": "สร้างสำเนาเพื่อแก้ไข",
    "jp": "編集用のコピーを作成"
  },
  "Cancel copy": {
    "th": "ยกเลิกสำเนา",
    "jp": "コピーを取消"
  },
  "Save draft": {
    "th": "บันทึกฉบับร่าง",
    "jp": "下書きを保存"
  },
  "Publish for team": {
    "th": "เผยแพร่ให้ทีมใช้งาน",
    "jp": "チームに公開"
  },
  "Saving…": {
    "th": "กำลังบันทึก…",
    "jp": "保存中…"
  },
  "Unsaved changes": {
    "th": "มีการแก้ไขที่ยังไม่บันทึก",
    "jp": "未保存の変更"
  },
  "Ask a master-data editor to review and publish this draft.": {
    "th": "ให้ผู้มีสิทธิ์ดูแลข้อมูลหลักตรวจสอบและเผยแพร่ฉบับร่างนี้",
    "jp": "権限のある担当者に確認と公開を依頼してください。"
  },
  "View only — you can review packages but cannot edit them.": {
    "th": "ดูได้อย่างเดียว — บัญชีนี้ยังไม่มีสิทธิ์แก้ไขชุดค่าแรง",
    "jp": "参照のみ — パッケージを編集する権限がありません。"
  },
  "Labor packages are unavailable": {
    "th": "ยังไม่พร้อมใช้งานชุดค่าแรง",
    "jp": "パッケージを利用できません"
  },
  "Discard unsaved changes?": {
    "th": "ต้องการออกโดยไม่บันทึกการแก้ไขหรือไม่?",
    "jp": "未保存の変更を破棄しますか？"
  },
  "Package published": {
    "th": "เผยแพร่ชุดค่าแรงแล้ว",
    "jp": "パッケージを公開しました"
  },
  "Draft saved": {
    "th": "บันทึกฉบับร่างแล้ว",
    "jp": "下書きを保存しました"
  },
  "Draft copy created": {
    "th": "สร้างสำเนาฉบับร่างแล้ว",
    "jp": "下書きコピーを作成しました"
  },
  "Your changes are preserved. Refresh to review the latest version.": {
    "th": "ข้อมูลที่กรอกยังอยู่ กดรีเฟรชเพื่อตรวจสอบฉบับล่าสุด",
    "jp": "入力内容は保持されています。更新して最新版を確認してください。"
  },
  "Copy": {
    "th": "สำเนา",
    "jp": "コピー"
  }
};
