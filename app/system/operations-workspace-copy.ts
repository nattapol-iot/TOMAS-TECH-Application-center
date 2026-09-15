/** Static planning, pricing, knowledge, administration and core workspace copy. */
export const OPERATIONS_WORKSPACE_COPY: Record<string, { th: string; en: string; jp: string }> = {
  "active user accounts": {
    "th": "บัญชีผู้ใช้ที่ใช้งานอยู่",
    "en": "active user accounts",
    "jp": "有効なユーザーアカウント"
  },
  "System accounts and permission roles, separate from the employee register in Employees": {
    "th": "บัญชีที่ใช้เข้าสู่ระบบและบทบาทสิทธิ์ แยกจากทะเบียนพนักงานในแท็บ Employees",
    "en": "System accounts and permission roles, separate from the employee register in Employees",
    "jp": "システムアカウントと権限ロールです。Employeesの従業員台帳とは別に管理されます"
  },
  "Current account": {
    "th": "บัญชีปัจจุบัน",
    "en": "Current account",
    "jp": "現在のアカウント"
  },
  "Additional roles": {
    "th": "Role เพิ่มเติม",
    "en": "Additional roles",
    "jp": "追加ロール"
  },
  "Each additional role grants that role's full permissions on top of the primary role": {
    "th": "Role ที่เพิ่มให้สิทธิ์ทั้งหมดของ Role นั้น เพิ่มจาก Role หลัก",
    "en": "Each additional role grants that role's full permissions on top of the primary role",
    "jp": "追加ロールは主ロールに加えて、そのロールの全権限を付与します"
  },
  "This account holds its primary role only.": {
    "th": "บัญชีนี้มีเฉพาะ Role หลัก",
    "en": "This account holds its primary role only.",
    "jp": "このアカウントは主ロールのみです"
  },
  "Add another role": {
    "th": "เพิ่ม Role อีกหนึ่ง",
    "en": "Add another role",
    "jp": "ロールを追加"
  },
  "Select a role": {
    "th": "เลือก Role",
    "en": "Select a role",
    "jp": "ロールを選択"
  },
  "Grant role": {
    "th": "ให้สิทธิ์ Role",
    "en": "Grant role",
    "jp": "ロールを付与"
  },
  "Remove role": {
    "th": "ถอด Role",
    "en": "Remove role",
    "jp": "ロールを解除"
  },
  "Removing…": {
    "th": "กำลังถอด…",
    "en": "Removing…",
    "jp": "解除中…"
  },
  "Edit role": {
    "th": "แก้ไข Role",
    "en": "Edit role",
    "jp": "ロールを変更"
  },
  "Edit application role": {
    "th": "แก้ไข Role ของบัญชีผู้ใช้",
    "en": "Edit application role",
    "jp": "アプリケーションロールを変更"
  },
  "Role changes update system permissions, not employee profile data": {
    "th": "การเปลี่ยน Role จะเปลี่ยนสิทธิ์ในระบบ แต่ไม่แก้ข้อมูลประวัติพนักงาน",
    "en": "Role changes update system permissions, not employee profile data",
    "jp": "ロール変更はシステム権限を更新しますが、従業員プロフィールは変更しません"
  },
  "New application role": {
    "th": "Role ใหม่",
    "en": "New application role",
    "jp": "新しいアプリケーションロール"
  },
  "Loading roles…": {
    "th": "กำลังโหลด Role…",
    "en": "Loading roles…",
    "jp": "ロールを読み込み中…"
  },
  "Save role": {
    "th": "บันทึก Role",
    "en": "Save role",
    "jp": "ロールを保存"
  },
  "Changing your own role refreshes your navigation and permissions immediately after saving.": {
    "th": "หากเปลี่ยน Role ของตนเอง เมนูและสิทธิ์ของบัญชีนี้จะรีเฟรชทันทีหลังบันทึก",
    "en": "Changing your own role refreshes your navigation and permissions immediately after saving.",
    "jp": "自分のロールを変更すると、保存後すぐにナビゲーションと権限が更新されます。"
  },
  "The employee will receive the new permissions on their next request.": {
    "th": "พนักงานจะได้รับสิทธิ์ใหม่ตั้งแต่คำขอครั้งถัดไป",
    "en": "The employee will receive the new permissions on their next request.",
    "jp": "従業員には次回のリクエストから新しい権限が適用されます。"
  },
  "Application role updated to {role}": {
    "th": "อัปเดต Role เป็น {role} แล้ว",
    "en": "Application role updated to {role}",
    "jp": "アプリケーションロールを{role}に更新しました"
  },
  "ไม่พบสิทธิ์เข้าถึง": {
    "th": "ไม่พบสิทธิ์เข้าถึง",
    "en": "Access not available",
    "jp": "アクセス権がありません"
  },
  "รายการนี้ถูกจำกัดตามบทบาท": {
    "th": "รายการนี้ถูกจำกัดตามบทบาท",
    "en": "This item is restricted by role",
    "jp": "この項目はロールによって制限されています"
  },
  "What you reported, in order — loaded from the append-only SQL audit trail": {
    "th": "สิ่งที่คุณรายงานตามลำดับ — จากประวัติ SQL ที่แก้ย้อนหลังไม่ได้",
    "en": "What you reported, in order — loaded from the append-only SQL audit trail",
    "jp": "報告内容を順番に表示・変更できないSQL監査履歴から取得"
  },
  "Phase เป็นแถวสรุป": {
    "th": "Phase เป็นแถวสรุป",
    "en": "Phase is a summary row",
    "jp": "フェーズは集計行です"
  },
  "วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจาก Task ใต้ Phase": {
    "th": "วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจาก Task ใต้ Phase",
    "en": "Dates, duration and progress are calculated from tasks within the phase",
    "jp": "日付・期間・進捗はフェーズ内のタスクから計算します"
  },
  "requested. Accepting extends the task duration and recalculates the project schedule.": {
    "th": "ที่ร้องขอ การยอมรับจะเพิ่มระยะเวลางานและคำนวณตารางโครงการใหม่",
    "en": "requested. Accepting extends the task duration and recalculates the project schedule.",
    "jp": "が申請されています。承認するとタスク期間を延長し、工程を再計算します。"
  },
  "Accepting extends the task plan; rejecting leaves the dates unchanged": {
    "th": "ยอมรับเพื่อขยายแผนงาน ปฏิเสธเพื่อคงวันที่เดิม",
    "en": "Accepting extends the task plan; rejecting leaves the dates unchanged",
    "jp": "承認するとタスク計画を延長します。却下すると元の日付を維持します"
  },
  "100 รายการล่าสุดจาก audit trail ของ Schedule": {
    "th": "100 รายการล่าสุดจาก audit trail ของ Schedule",
    "en": "Latest 100 schedule audit entries",
    "jp": "工程の監査履歴・最新100件"
  },
  "สร้าง Project หรือขอสิทธิ์เข้าถึงโครงการก่อนเปิด Schedule": {
    "th": "สร้าง Project หรือขอสิทธิ์เข้าถึงโครงการก่อนเปิด Schedule",
    "en": "Create a project or request project access before opening its schedule",
    "jp": "工程を開く前にプロジェクトを作成するか、アクセス権を申請してください"
  },
  "บางโครงการไม่ถูกนำมารวม": {
    "th": "บางโครงการไม่ถูกนำมารวม",
    "en": "Some projects are excluded",
    "jp": "一部のプロジェクトは含まれていません"
  },
  "โหลด Schedule ไม่สำเร็จหรือไม่มีสิทธิ์": {
    "th": "โหลด Schedule ไม่สำเร็จหรือไม่มีสิทธิ์",
    "en": "Schedule could not be loaded or access is unavailable",
    "jp": "工程を読み込めないか、アクセス権がありません"
  },
  "โครงการจาก": {
    "th": "โครงการจาก",
    "en": "projects out of",
    "jp": "件のプロジェクト／全"
  },
  "โครงการ": {
    "th": "โครงการ",
    "en": "projects",
    "jp": "プロジェクト"
  },
  "Effort แบ่งเท่ากันเมื่อ Task มี PIC หลายคน": {
    "th": "Effort แบ่งเท่ากันเมื่อ Task มี PIC หลายคน",
    "en": "Effort is divided equally when a task has multiple owners",
    "jp": "複数の担当者がいるタスクは工数を均等に配分します"
  },
  "Provision users before assigning schedule work": {
    "th": "สร้างบัญชีผู้ใช้ก่อนมอบหมายงานในตาราง",
    "en": "Provision users before assigning schedule work",
    "jp": "工程の作業を割り当てる前にユーザーを登録してください"
  },
  "ข้อมูลที่ใช้คำนวณ Resource Plan": {
    "th": "ข้อมูลที่ใช้คำนวณ Resource Plan",
    "en": "Data used to calculate the resource plan",
    "jp": "リソース計画の計算に使用する情報"
  },
  "สร้าง Schedule ในโครงการเพื่อเริ่ม Resource Plan": {
    "th": "สร้าง Schedule ในโครงการเพื่อเริ่ม Resource Plan",
    "en": "Create a project schedule to start the resource plan",
    "jp": "プロジェクトに工程を作成してリソース計画を開始します"
  },
  "Price view บางส่วนไม่ถูกโหลด": {
    "th": "Price view บางส่วนไม่ถูกโหลด",
    "en": "Some price views could not be loaded",
    "jp": "価格表示の一部を読み込めませんでした"
  },
  "ไม่สามารถอ่าน Cost workspace": {
    "th": "ไม่สามารถอ่าน Cost workspace",
    "en": "Cannot read the cost workspace for",
    "jp": "原価ワークスペースを読み込めません："
  },
  "estimates ได้ รายการที่แสดงยังคงเป็นข้อมูลจริงที่โหลดสำเร็จเท่านั้น": {
    "th": "estimates ได้ รายการที่แสดงยังคงเป็นข้อมูลจริงที่โหลดสำเร็จเท่านั้น",
    "en": "estimates. Only actual data loaded successfully is shown",
    "jp": "件の見積。正常に読み込めた実データのみを表示しています"
  },
  "ไม่พบข้อมูลตามตัวกรอง หรือยังไม่มี Unit cost ใน Estimate": {
    "th": "ไม่พบข้อมูลตามตัวกรอง หรือยังไม่มี Unit cost ใน Estimate",
    "en": "No data matches the filters, or the estimate has no unit cost",
    "jp": "条件に一致するデータがないか、見積に単価がありません"
  },
  "อัปโหลด PDF, Excel หรือรูปใบเสนอราคาผู้ขายเพื่อสร้างรายการแรก": {
    "th": "อัปโหลด PDF, Excel หรือรูปใบเสนอราคาผู้ขายเพื่อสร้างรายการแรก",
    "en": "Upload a supplier quotation PDF, Excel or image to create the first record",
    "jp": "仕入先見積のPDF・Excel・画像をアップロードして最初の項目を作成します"
  },
  "ไม่พบ Cost item ที่มี Supplier และเข้าเกณฑ์ราคาไม่พร้อมใช้งาน": {
    "th": "ไม่พบ Cost item ที่มี Supplier และเข้าเกณฑ์ราคาไม่พร้อมใช้งาน",
    "en": "No cost item with a supplier meets the unavailable-price criteria",
    "jp": "仕入先が設定され、価格未確定の条件に該当する原価明細はありません"
  },
  "An administrator must grant the knowledge.view permission to your role.": {
    "th": "ผู้ดูแลต้องเพิ่มสิทธิ์ knowledge.view ให้บทบาทของคุณ",
    "en": "An administrator must grant the knowledge.view permission to your role.",
    "jp": "管理者がこのロールにknowledge.view権限を付与する必要があります。"
  },
  "One row per document; the revision shown is the current one": {
    "th": "หนึ่งแถวต่อเอกสาร โดยแสดงรุ่นปัจจุบัน",
    "en": "One row per document; the revision shown is the current one",
    "jp": "文書ごとに1行で、現在の版を表示します"
  },
  "Create a standard, SOP or template to start the register.": {
    "th": "สร้างมาตรฐาน SOP หรือเทมเพลตเพื่อเริ่มทะเบียน",
    "en": "Create a standard, SOP or template to start the register.",
    "jp": "標準・SOP・テンプレートを作成して登録を始めます。"
  },
  "Upload a company, sales or technical presentation to build the library.": {
    "th": "อัปโหลดงานนำเสนอบริษัท ฝ่ายขาย หรือด้านเทคนิคเพื่อสร้างคลัง",
    "en": "Upload a company, sales or technical presentation to build the library.",
    "jp": "会社・営業・技術のプレゼン資料をアップロードしてライブラリを作成します。"
  },
  "Working, project and supplier documents shared with you will appear here.": {
    "th": "เอกสารทำงาน โครงการ และผู้ขายที่แชร์กับคุณจะแสดงที่นี่",
    "en": "Working, project and supplier documents shared with you will appear here.",
    "jp": "共有された作業・プロジェクト・仕入先の文書がここに表示されます。"
  },
  "Working, project and supplier documents visible to you": {
    "th": "เอกสารทำงาน โครงการ และผู้ขายที่คุณเข้าถึงได้",
    "en": "Working, project and supplier documents visible to you",
    "jp": "閲覧可能な作業・プロジェクト・仕入先の文書"
  },
  "Standards assigned to you for reading will appear here until you confirm them.": {
    "th": "มาตรฐานที่มอบหมายให้คุณอ่านจะแสดงที่นี่จนกว่าคุณจะยืนยัน",
    "en": "Standards assigned to you for reading will appear here until you confirm them.",
    "jp": "閲読を依頼された標準は、確認するまでここに表示されます。"
  },
  "Documents requiring your acknowledgement": {
    "th": "เอกสารที่คุณต้องตอบรับทราบ",
    "en": "Documents requiring your acknowledgement",
    "jp": "確認が必要な文書"
  },
  "Confirming records that you have read this exact revision": {
    "th": "การยืนยันบันทึกว่าคุณอ่านเอกสารรุ่นนี้แล้ว",
    "en": "Confirming records that you have read this exact revision",
    "jp": "この版を閲読したことを記録します"
  },
  "How-to, troubleshooting, best practices and lessons learned": {
    "th": "วิธีใช้งาน การแก้ปัญหา แนวปฏิบัติ และบทเรียน",
    "en": "How-to, troubleshooting, best practices and lessons learned",
    "jp": "手順・トラブル対応・推奨実践・教訓"
  },
  "Create the first technical article for the team.": {
    "th": "สร้างบทความด้านเทคนิคแรกให้ทีม",
    "en": "Create the first technical article for the team.",
    "jp": "チーム向けの最初の技術記事を作成します。"
  },
  "Content is stored as safe plain text/Markdown; HTML is never injected": {
    "th": "จัดเก็บเป็นข้อความหรือ Markdown ที่ปลอดภัย โดยไม่แทรก HTML",
    "en": "Content is stored as safe plain text/Markdown; HTML is never injected",
    "jp": "安全なプレーンテキスト・Markdownで保存し、HTMLは挿入しません"
  },
  "Headings, lists, links, tables and code blocks can be written in Markdown": {
    "th": "เขียนหัวข้อ รายการ ลิงก์ ตาราง และโค้ดด้วย Markdown ได้",
    "en": "Headings, lists, links, tables and code blocks can be written in Markdown",
    "jp": "見出し・リスト・リンク・表・コードブロックをMarkdownで記述できます"
  },
  "Maintain hierarchy, display order, defaults and availability": {
    "th": "จัดการลำดับชั้น ลำดับแสดง ค่าเริ่มต้น และสถานะใช้งาน",
    "en": "Maintain hierarchy, display order, defaults and availability",
    "jp": "階層・表示順・既定値・利用可否を管理します"
  },
  "Concurrency-safe prefix and scope counters; existing counters can only move forward": {
    "th": "ตัวนับตามคำนำหน้าและขอบเขตรองรับการใช้งานพร้อมกัน และปรับได้เฉพาะเพิ่มขึ้น",
    "en": "Concurrency-safe prefix and scope counters; existing counters can only move forward",
    "jp": "接頭辞・範囲別の採番は同時操作に対応し、既存番号は増加のみ可能です"
  },
  "The document number is issued by the server when you create it": {
    "th": "ระบบกำหนดเลขเอกสารให้เมื่อสร้าง",
    "en": "The document number is issued by the server when you create it",
    "jp": "作成時にサーバーが文書番号を発行します"
  },
  "Department segment, e.g. EE, ME, SW, PR": {
    "th": "รหัสแผนก เช่น EE, ME, SW, PR",
    "en": "Department segment, e.g. EE, ME, SW, PR",
    "jp": "部門コード（例：EE・ME・SW・PR）"
  },
  "Optional. PDF, Word, Excel, PowerPoint, text, CSV, PNG or JPG": {
    "th": "ไม่บังคับ รองรับ PDF, Word, Excel, PowerPoint, text, CSV, PNG หรือ JPG",
    "en": "Optional. PDF, Word, Excel, PowerPoint, text, CSV, PNG or JPG",
    "jp": "任意。PDF・Word・Excel・PowerPoint・テキスト・CSV・PNG・JPG"
  },
  "This document is obsolete. Do not use it as a reference for new work.": {
    "th": "เอกสารนี้เลิกใช้แล้ว ห้ามใช้เป็นข้อมูลอ้างอิงสำหรับงานใหม่",
    "en": "This document is obsolete. Do not use it as a reference for new work.",
    "jp": "この文書は廃止済みです。新しい作業の参照に使用しないでください。"
  },
  "This document has passed its expiry date and must not be cited.": {
    "th": "เอกสารนี้หมดอายุแล้ว ห้ามใช้อ้างอิง",
    "en": "This document has passed its expiry date and must not be cited.",
    "jp": "この文書は有効期限を過ぎています。引用しないでください。"
  },
  "Activity on this document will appear here.": {
    "th": "กิจกรรมของเอกสารนี้จะแสดงที่นี่",
    "en": "Activity on this document will appear here.",
    "jp": "この文書の操作履歴がここに表示されます。"
  },
  "Assignments are bound to this exact published revision": {
    "th": "การมอบหมายผูกกับเอกสารที่เผยแพร่รุ่นนี้เท่านั้น",
    "en": "Assignments are bound to this exact published revision",
    "jp": "割当はこの公開済みの版に紐付きます"
  },
  "Link one document to many records without copying the file": {
    "th": "เชื่อมเอกสารเดียวกับหลายรายการโดยไม่คัดลอกไฟล์",
    "en": "Link one document to many records without copying the file",
    "jp": "ファイルを複製せず、1つの文書を複数の記録に連携します"
  },
  "Link this document to an inquiry, project, estimate, BOM, PR or PO to make it findable from that record.": {
    "th": "เชื่อมเอกสารกับ Inquiry, Project, Estimate, BOM, PR หรือ PO เพื่อค้นเจอจากรายการนั้น",
    "en": "Link this document to an inquiry, project, estimate, BOM, PR or PO to make it findable from that record.",
    "jp": "引合・プロジェクト・見積・BOM・PR・POに文書を連携すると、その記録から見つけられます。"
  },
  "Comments stay linked to this document revision": {
    "th": "ความคิดเห็นผูกกับเอกสารรุ่นนี้",
    "en": "Comments stay linked to this document revision",
    "jp": "コメントはこの文書の版に紐付きます"
  },
  "Review discussions will appear here.": {
    "th": "บทสนทนาการตรวจสอบจะแสดงที่นี่",
    "en": "Review discussions will appear here.",
    "jp": "レビューのやり取りがここに表示されます。"
  },
  "Server-side authorization is checked again on every read and download": {
    "th": "ตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุกครั้งที่อ่านหรือดาวน์โหลด",
    "en": "Server-side authorization is checked again on every read and download",
    "jp": "閲覧・ダウンロードのたびにサーバーで権限を確認します"
  },
  "At least one other team member is needed before this can be submitted, because the author cannot approve their own document.": {
    "th": "ต้องมีสมาชิกทีมคนอื่นอย่างน้อยหนึ่งคนก่อนส่ง เพราะผู้เขียนอนุมัติเอกสารตัวเองไม่ได้",
    "en": "At least one other team member is needed before this can be submitted, because the author cannot approve their own document.",
    "jp": "提出には他のメンバーが最低1人必要です。作成者は自分の文書を承認できません。"
  },
  "A published revision is never overwritten; this creates the next one": {
    "th": "ไม่เขียนทับรุ่นที่เผยแพร่แล้ว การดำเนินการนี้สร้างรุ่นถัดไป",
    "en": "A published revision is never overwritten; this creates the next one",
    "jp": "公開済みの版は上書きせず、次の版を作成します"
  },
  "Required — it becomes part of the revision history": {
    "th": "จำเป็น — บันทึกเป็นส่วนหนึ่งของประวัติรุ่น",
    "en": "Required — it becomes part of the revision history",
    "jp": "必須・版履歴に記録されます"
  },
  "ปรับคำค้นหา หรือเพิ่มลูกค้ารายแรกเมื่อมีสิทธิ์ master.write": {
    "th": "ปรับคำค้นหา หรือเพิ่มลูกค้ารายแรกเมื่อมีสิทธิ์ master.write",
    "en": "Adjust the search, or add the first customer with master.write permission",
    "jp": "検索条件を変更するか、master.write権限で最初の顧客を追加してください"
  },
  "ยังไม่มี stock transaction ถึงวันที่รายงาน": {
    "th": "ยังไม่มี stock transaction ถึงวันที่รายงาน",
    "en": "No stock transaction exists up to the report date",
    "jp": "報告日までの在庫取引はありません"
  },
  "POs": {
    "th": "ใบสั่งซื้อ",
    "en": "POs",
    "jp": "発注書"
  },
  "ยังไม่มีขั้นตอนอนุมัติที่เสร็จในช่วงวันที่นี้": {
    "th": "ยังไม่มีขั้นตอนอนุมัติที่เสร็จในช่วงวันที่นี้",
    "en": "No approval step was completed in this date range",
    "jp": "この期間に完了した承認ステップはありません"
  },
  "เลือกโครงการเพื่อคำนวณต้นทุนจาก estimate, procurement และ stock ledger": {
    "th": "เลือกโครงการเพื่อคำนวณต้นทุนจาก estimate, procurement และ stock ledger",
    "en": "Select a project to calculate costs from estimate, procurement and stock ledgers",
    "jp": "プロジェクトを選択し、見積・調達・在庫台帳から原価を計算します"
  },
  "Effective-dated engineering and installation rates": {
    "th": "อัตราวิศวกรรมและติดตั้งตามวันที่มีผล",
    "en": "Effective-dated engineering and installation rates",
    "jp": "適用日別の技術・設置単価"
  },
  "เพิ่มอัตราแรกเมื่อมีสิทธิ์ master.write": {
    "th": "เพิ่มอัตราแรกเมื่อมีสิทธิ์ master.write",
    "en": "Add the first rate with master.write permission",
    "jp": "master.write権限で最初の単価を追加します"
  },
  "This endpoint is read-only; both audit ledgers remain append-only": {
    "th": "อ่านข้อมูลได้อย่างเดียว บัญชี Audit ทั้งสองชุดเพิ่มประวัติได้แต่แก้ย้อนหลังไม่ได้",
    "en": "This endpoint is read-only; both audit ledgers remain append-only",
    "jp": "閲覧専用です。両方の監査台帳は追記のみで、過去の変更はできません"
  },
  "Resolved by the API and SQL user registry": {
    "th": "ยืนยันจาก API และทะเบียนผู้ใช้ SQL",
    "en": "Resolved by the API and SQL user registry",
    "jp": "APIとSQLユーザー台帳で確認"
  },
  "Verified by the successful bootstrap request": {
    "th": "ยืนยันจากการโหลดข้อมูลเริ่มต้นที่สำเร็จ",
    "en": "Verified by the successful bootstrap request",
    "jp": "初期データの正常な取得で確認済み"
  },
  "SQL Server via API": {
    "th": "SQL Server ผ่าน API",
    "en": "SQL Server via API",
    "jp": "API経由のSQL Server"
  },
  "Bootstrap, master and permissions loaded successfully": {
    "th": "โหลดข้อมูลเริ่มต้น ข้อมูลหลัก และสิทธิ์สำเร็จ",
    "en": "Bootstrap, master and permissions loaded successfully",
    "jp": "初期データ・マスタ・権限を正常に読み込みました"
  },
  "สิทธิ์ RBAC ที่ API ส่งให้บัญชีปัจจุบัน": {
    "th": "สิทธิ์ RBAC ที่ API ส่งให้บัญชีปัจจุบัน",
    "en": "RBAC permissions returned by the API for the current account",
    "jp": "APIが現在のアカウントに返したRBAC権限"
  },
  "ค่า connection string, Entra, CORS และ host ถูกจัดการที่ server environment เพื่อไม่ให้ browser แก้ไขความปลอดภัยของ Production ได้": {
    "th": "ค่า connection string, Entra, CORS และ host ถูกจัดการที่ server environment เพื่อไม่ให้ browser แก้ไขความปลอดภัยของ Production ได้",
    "en": "Connection strings, Entra, CORS and host settings are managed on the server so the browser cannot change production security",
    "jp": "接続文字列・Entra・CORS・ホストはサーバー環境で管理し、ブラウザーから本番環境のセキュリティを変更できないようにしています"
  },
  "สร้าง Estimate จาก Inquiry ที่ลงทะเบียนแล้ว": {
    "th": "สร้าง Estimate จาก Inquiry ที่ลงทะเบียนแล้ว",
    "en": "Create an estimate from a registered inquiry",
    "jp": "登録済みの引合から見積を作成"
  },
  "ไม่มี Inquiry สถานะ New ที่ยังไม่สร้าง Estimate และอยู่ในสิทธิ์ของคุณ": {
    "th": "ไม่มี Inquiry สถานะ New ที่ยังไม่สร้าง Estimate และอยู่ในสิทธิ์ของคุณ",
    "en": "No accessible New inquiry remains without an estimate",
    "jp": "アクセス可能な新規引合のうち、見積未作成のものはありません"
  },
  "บริษัทที่รับงานด้วย / Contracting customer": {
    "th": "บริษัทที่รับงานด้วย",
    "en": "Contracting customer",
    "jp": "契約先顧客"
  },
  "บัญชีนี้อ่านและดาวน์โหลดเอกสารได้ แต่ไม่มีสิทธิ์อัปโหลดเอกสารโครงการ": {
    "th": "บัญชีนี้อ่านและดาวน์โหลดเอกสารได้ แต่ไม่มีสิทธิ์อัปโหลดเอกสารโครงการ",
    "en": "This account can read and download documents but cannot upload project documents",
    "jp": "このアカウントは文書の閲覧・ダウンロードのみ可能で、プロジェクト文書をアップロードできません"
  },
  "ใช้ End user จาก Inquiry ต้นทาง / Inherit from Inquiry": {
    "th": "ใช้ End user จาก Inquiry ต้นทาง",
    "en": "Inherit end user from inquiry",
    "jp": "元の引合のエンドユーザーを使用"
  },
  "เอาเครื่องหมายออกเพื่อระบุ End user สำหรับ Project นี้เอง หรือเว้นว่างเมื่อยังไม่ทราบ / Uncheck to choose a company or leave unspecified.": {
    "th": "เอาเครื่องหมายออกเพื่อระบุ End user สำหรับ Project นี้เอง หรือเว้นว่างเมื่อยังไม่ทราบ",
    "en": "Uncheck to choose this project's end user, or leave unspecified if unknown",
    "jp": "チェックを外してこのプロジェクトのエンドユーザーを指定するか、不明なら空欄にします"
  },
  "เพิ่ม Material master และรับสินค้าเข้าระบบก่อน": {
    "th": "เพิ่ม Material master และรับสินค้าเข้าระบบก่อน",
    "en": "Add material master records and receive items first",
    "jp": "先に品目マスタを追加し、入荷を登録してください"
  },
  "ข้อมูลผู้ขายชุดเดียวกันสำหรับ Cost item และ Preferred supplier": {
    "th": "ข้อมูลผู้ขายชุดเดียวกันสำหรับ Cost item และ Preferred supplier",
    "en": "Shared supplier records for cost items and preferred suppliers",
    "jp": "原価明細と優先仕入先で同じ仕入先データを使用します"
  },
  "ลองเปลี่ยนคำค้นหา หรือกด Add supplier เพื่อเพิ่มผู้ขาย": {
    "th": "ลองเปลี่ยนคำค้นหา หรือกด Add supplier เพื่อเพิ่มผู้ขาย",
    "en": "Try another search, or choose Add supplier",
    "jp": "検索語を変更するか、仕入先追加を選択してください"
  },
  "คั่นแต่ละ Brand ด้วย comma; สูงสุด 100 รายการ และรายการละ 100 ตัวอักษร": {
    "th": "คั่นแต่ละ Brand ด้วย comma; สูงสุด 100 รายการ และรายการละ 100 ตัวอักษร",
    "en": "Separate brands with commas; up to 100 brands, 100 characters each",
    "jp": "ブランドをカンマで区切って入力・最大100件、各100文字まで"
  },
  "ทะเบียนสินค้าใช้ร่วมกับ Inventory · การเพิ่มสินค้าไม่เพิ่มยอด Stock": {
    "th": "ทะเบียนสินค้าใช้ร่วมกับ Inventory · การเพิ่มสินค้าไม่เพิ่มยอด Stock",
    "en": "Item records shared with Inventory · Adding an item does not add stock",
    "jp": "在庫と共通の品目マスタ・品目の追加では在庫数量は増えません"
  },
  "รหัส Item ต้องไม่ซ้ำ และรองรับตัวอักษร ตัวเลข . _ / -": {
    "th": "รหัส Item ต้องไม่ซ้ำ และรองรับตัวอักษร ตัวเลข . _ / -",
    "en": "Item codes must be unique and may contain letters, digits, . _ / -",
    "jp": "品目コードは一意にし、英数字と . _ / - を使用できます"
  },
  "การสร้าง Master ไม่เพิ่มยอด Stock; ยอดคงเหลือมาจาก Stock ledger เท่านั้น": {
    "th": "การสร้าง Master ไม่เพิ่มยอด Stock; ยอดคงเหลือมาจาก Stock ledger เท่านั้น",
    "en": "Creating master data does not add stock; balances come only from the stock ledger",
    "jp": "マスタ作成では在庫は増えません。在庫残高は在庫台帳のみから算出します"
  },
  "Preferred supplier เป็นตัวเลือก ไม่บังคับสำหรับการสร้าง Item": {
    "th": "Preferred supplier เป็นตัวเลือก ไม่บังคับสำหรับการสร้าง Item",
    "en": "Preferred supplier is optional when creating an item",
    "jp": "優先仕入先は任意で、品目作成の必須項目ではありません"
  },
  "ข้อมูลสินค้าอ้างอิง · ดูยอดคงเหลือและการเคลื่อนไหวที่เมนู Inventory": {
    "th": "ข้อมูลสินค้าอ้างอิง · ดูยอดคงเหลือและการเคลื่อนไหวที่เมนู Inventory",
    "en": "Item reference data · View balances and movements in Inventory",
    "jp": "品目の参照情報・残高と入出庫は在庫メニューで確認"
  },
  "สร้าง Material master โดยไม่สร้างยอด Stock เริ่มต้น": {
    "th": "สร้าง Material master โดยไม่สร้างยอด Stock เริ่มต้น",
    "en": "Create material master data without opening stock",
    "jp": "初期在庫を作成せずに品目マスタを追加"
  },
  "บัญชีที่เข้าใช้งานระบบและบทบาทสิทธิ์ แยกจากทะเบียนพนักงานในแท็บ Employees": {
    "th": "บัญชีที่เข้าใช้งานระบบและบทบาทสิทธิ์ แยกจากทะเบียนพนักงานในแท็บ Employees",
    "en": "System accounts and permission roles, separate from the employee register in Employees",
    "jp": "システムの利用アカウントと権限ロールです。従業員タブの従業員台帳とは別に管理します"
  },
  "Provision users before creating rate references": {
    "th": "สร้างบัญชีผู้ใช้ก่อนสร้างข้อมูลอ้างอิงอัตรา",
    "en": "Provision users before creating rate references",
    "jp": "単価の参照情報を作成する前にユーザーを登録してください"
  }
};
