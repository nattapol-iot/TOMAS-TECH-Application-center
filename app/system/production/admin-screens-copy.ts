/**
 * Copy for System Settings, Summary Reports, Audit Log and the supplier dialog (AdminAnalyticsScreens.tsx, CoreScreens.tsx);
 * merged into DICTIONARY (i18n.ts). Namespaced keys, so no shared label changes. A "{name}" in a value is filled in by the screen.
 */
export const ADMIN_SCREENS_COPY: Record<string, { en: string; th: string; jp: string }> = Object.fromEntries(
  [
    // System Settings
    ["Settings.subtitle", "System status and where documents are stored on the NAS", "สถานะระบบและที่เก็บเอกสารบน NAS", "システムの状態とNAS上の文書保存先"],
    [
      "Settings.nasSubtitle",
      "Set the destination in one place, then test the server before document storage uses it.",
      "กำหนดปลายทางไว้ที่เดียว แล้วทดสอบ Server ก่อนให้ที่เก็บเอกสารใช้",
      "保存先を一か所で設定し、文書ストレージで使う前にサーバーをテストします。",
    ],
    ["Settings.server", "NAS server / IP", "Server / IP ของ NAS", "NASサーバー / IP"],
    ["Settings.pathHint", "A folder under the share, such as IoT Team Center/Projects", "โฟลเดอร์ใต้ Share เช่น IoT Team Center/Projects", "共有の下のフォルダー（例：IoT Team Center/Projects）"],
    ["Settings.passwordValue", "Kept as a server secret", "เก็บเป็น Server Secret", "サーバーシークレットで管理"],
    ["Settings.passwordLabel", "The NAS password is kept on the server", "รหัสผ่าน NAS เก็บไว้ที่ Server", "NASのパスワードはサーバーで管理されます"],
    ["Settings.target", "Destination to use", "ปลายทางที่จะใช้", "使用する保存先"],
    ["Settings.testing", "Testing…", "กำลังทดสอบ…", "テスト中…"],
    ["Settings.testServer", "Test server", "ทดสอบ Server", "サーバーをテスト"],
    ["Settings.saveSettings", "Save settings", "บันทึกการตั้งค่า", "設定を保存"],
    ["Settings.saved", "NAS settings saved", "บันทึกการตั้งค่า NAS แล้ว", "NAS設定を保存しました"],
    ["Settings.connected", "Connected to SMB port 445 in {ms} ms", "เชื่อมต่อ SMB port 445 สำเร็จใน {ms} ms", "SMBポート445に{ms} msで接続しました"],
    ["Settings.draftSaved", "Saved as a draft", "บันทึกเป็นฉบับร่างแล้ว", "下書きとして保存済み"],
    [
      "Settings.draftBy",
      "Last saved by {name} · {when}. It becomes active once the server applies or deploys it.",
      "บันทึกล่าสุดโดย {name} · {when} ค่านี้จะใช้งานจริงหลัง Server apply หรือ deploy สำเร็จ",
      "最終保存：{name} · {when}。サーバーで適用またはデプロイされると有効になります。",
    ],
    [
      "Settings.passwordNote",
      "The password is never sent back to the browser; it stays a server secret.",
      "รหัสผ่านไม่ถูกส่งกลับมาที่ Browser และยังเก็บเป็น Server Secret",
      "パスワードはブラウザーに返されず、サーバーシークレットのまま管理されます。",
    ],
    [
      "Settings.storageSubtitle",
      "Writes, reads and deletes a real file on the storage path the backend uses.",
      "เขียน อ่าน และลบไฟล์จริงบน storage path ที่ backend ใช้อยู่",
      "バックエンドが使うストレージパスで実ファイルを書き込み・読み取り・削除します。",
    ],
    ["Settings.runTest", "Run storage test", "ทดสอบที่เก็บเอกสาร", "ストレージをテスト"],
    ["Settings.modeNas", "NAS (network share)", "NAS (Network Share)", "NAS（ネットワーク共有）"],
    ["Settings.modeLocal", "Local disk", "ดิสก์ในเครื่อง", "ローカルディスク"],
    ["Settings.ok", "OK · {ms} ms", "ผ่าน · {ms} ms", "正常 · {ms} ms"],
    ["Settings.failed", "Failed", "ไม่ผ่าน", "失敗"],
    ["Settings.notTested", "Not tested yet", "ยังไม่ได้ทดสอบ", "未テスト"],
    [
      "Settings.notTestedHint",
      "Run storage test writes, reads and deletes a test file on the storage in use.",
      "กด 'ทดสอบที่เก็บเอกสาร' เพื่อเขียน อ่าน และลบไฟล์ทดสอบบน storage ที่ใช้งานจริง",
      "「ストレージをテスト」で、使用中のストレージにテストファイルを書き込み・読み取り・削除します。",
    ],
    ["Settings.notConfigured", "Not configured", "ยังไม่ได้ตั้งค่า", "未設定"],
    ["Settings.accountDisabled", "Disabled", "ปิดใช้งาน", "無効"],
    ["Settings.authTeamTest", "Temporary LAN Team Test session", "Session ทดสอบทีมชั่วคราวในวง LAN", "LAN内の一時的なチームテストセッション"],
    ["Settings.authTmtId", "TMT ID sign-in, kept in a session cookie", "เข้าสู่ระบบด้วย TMT ID เก็บไว้ใน session cookie", "TMT IDでサインイン（セッションCookieで保持）"],
    ["Settings.authEntra", "Microsoft Entra ID access token", "Access token ของ Microsoft Entra ID", "Microsoft Entra IDのアクセストークン"],
    ["Settings.badgeTeamTest", "UAT only", "ใช้ทดสอบเท่านั้น", "UAT専用"],
    ["Settings.badgeTmtId", "TMT ID", "TMT ID", "TMT ID"],
    ["Settings.badgeEntra", "Entra", "Entra", "Entra"],
    ["Settings.permissions", "Permissions ({n})", "สิทธิ์ ({n})", "権限（{n}）"],
    ["Settings.permissionsSubtitle", "RBAC permissions the API grants the signed-in account", "สิทธิ์ RBAC ที่ API ให้บัญชีที่เข้าสู่ระบบอยู่", "APIがサインイン中のアカウントに付与しているRBAC権限"],
    [
      "Settings.ownership",
      "Connection strings, sign-in, CORS and hosts are managed in the server environment, so no browser can change Production's security.",
      "ค่า connection string การเข้าสู่ระบบ CORS และ host จัดการที่ server environment เพื่อไม่ให้ browser แก้ความปลอดภัยของ Production ได้",
      "接続文字列、サインイン、CORS、ホストはサーバー環境で管理され、ブラウザーから本番のセキュリティは変更できません。",
    ],

    // Summary Reports
    ["Reports.asOf", "As of {date}", "ณ วันที่ {date}", "{date}時点"],
    ["Reports.items", "{n} items", "{n} รายการ", "{n}品目"],
    ["Reports.itemsDays", "{n} items · {days} days", "{n} รายการ · {days} วัน", "{n}品目 · {days}日"],
    ["Reports.days", "{n} days", "{n} วัน", "{n}日"],
    ["Reports.moving", "Moving", "เคลื่อนไหวปกติ", "動きあり"],
    ["Reports.hours", "{n} h", "{n} ชม.", "{n}時間"],
    ["Reports.estimate", "Estimate {number}", "Estimate {number}", "見積 {number}"],
    ["Reports.budgetMaterial", "Material", "วัสดุ/อุปกรณ์", "材料費"],
    ["Reports.budgetEngineering", "Engineering", "วิศวกรรม", "技術費"],
    ["Reports.budgetOutsource", "Outsource", "จ้างภายนอก", "外注費"],
    ["Reports.budgetTransportation", "Transportation", "ค่าเดินทาง", "交通費"],
    ["Reports.budgetAccommodation", "Accommodation", "ค่าที่พัก", "宿泊費"],
    ["Reports.budgetOther", "Other", "อื่น ๆ", "その他"],
    ["Reports.budgetContingency", "Contingency", "เงินเผื่อสำรอง", "予備費"],
    ["Reports.budgetTotal", "Approved estimate total", "รวมประมาณการที่อนุมัติ", "承認済み見積合計"],
    ["Reports.poCommitted", "PO committed", "ยอดสั่งซื้อตาม PO", "PO発注済み"],
    ["Reports.receivedAtPoPrice", "Received at PO price", "รับของแล้ว (ราคา PO)", "入荷済み（PO単価）"],
    ["Reports.openPoCommitment", "Open PO commitment", "PO ที่ยังรับของไม่ครบ", "未入荷のPO"],
    ["Reports.openPr", "Open purchase requests", "ใบขอซื้อที่ยังเปิดอยู่", "未完了の購買申請"],
    ["Reports.reserved", "Reserved stock", "สต็อกที่จองไว้", "引当在庫"],

    // Audit Log
    ["Audit.events", "{n} audit events", "{n} เหตุการณ์", "{n}件の監査イベント"],

    // Suppliers
    ["Supplier.new", "New supplier", "ผู้ขายรายใหม่", "新規仕入先"],
    // The Suppliers list's Source filter: from Pegasus ERP, or added in this app.
    ["Supplier.source", "Source", "แหล่งข้อมูล", "データ元"],
    ["Supplier.sourceErp", "From Pegasus ERP", "จาก Pegasus ERP", "Pegasus ERPから"],
    ["Supplier.sourceLocal", "Added in this app", "เพิ่มในแอปนี้", "このアプリで追加"],
  ].map(([key, en, th, jp]) => [key, { en, th, jp }]),
);
