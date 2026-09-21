/** Estimate workspace interface copy. Business names, part numbers and user input stay unchanged. */
export const ESTIMATE_WORKSPACE_COPY: Record<string, {th: string; jp: string; en?: string}> = {
  "ERP Sheet": {
    "th": "ใบ ERP",
    "jp": "ERPシート"
  },
  "Loading the ERP sheet…": {
    "th": "กำลังโหลดใบ ERP…",
    "jp": "ERPシートを読み込み中…"
  },
  "ปรับตัวกรองหรือสร้าง Estimate จาก Inquiry ที่ยังไม่มี Estimate": {
    "th": "ปรับตัวกรองหรือสร้าง Estimate จาก Inquiry ที่ยังไม่มี Estimate",
    "jp": "条件を変更するか、見積未作成の引合から見積を作成してください。",
    "en": "Adjust filters or create an estimate from an inquiry without an estimate."
  },
  "Registered inquiry *": {
    "th": "งานสอบถามราคาที่ลงทะเบียน *",
    "jp": "登録済み引合 *"
  },
  "ทุก Inquiry มี Estimate แล้ว หรือบัญชีนี้ไม่มี Inquiry ที่อ่านได้": {
    "th": "ทุก Inquiry มี Estimate แล้ว หรือบัญชีนี้ไม่มี Inquiry ที่อ่านได้",
    "jp": "すべての引合に見積があるか、このアカウントで参照できる引合がありません。",
    "en": "All inquiries already have estimates, or this account has no accessible inquiries."
  },
  "must be resolved before submission or approval.": {
    "th": "ต้องแก้ไขก่อนส่งตรวจหรืออนุมัติ",
    "jp": "提出・承認前に解決してください。"
  },
  "do not block workflow, but should be reviewed.": {
    "th": "ไม่ปิดกั้นขั้นตอนงาน แต่ควรตรวจทาน",
    "jp": "処理を妨げませんが、確認が必要です。"
  },
  "Review warnings": {
    "th": "ตรวจทานคำเตือน",
    "jp": "警告を確認"
  },
  "Revision นี้ถูกล็อกแล้ว ข้อมูลต้นทุนอ่านได้อย่างเดียว การแก้ไขต้องผ่าน revision workflow": {
    "th": "Revision นี้ถูกล็อกแล้ว ข้อมูลต้นทุนอ่านได้อย่างเดียว การแก้ไขต้องผ่าน revision workflow",
    "jp": "この版はロックされています。原価は参照専用です。変更するには改訂手順で新しい版を作成してください。",
    "en": "This revision is locked. Costs are read-only; create a new revision to make changes."
  },
  "Cost by main module": {
    "th": "ต้นทุนตามโมดูลหลัก",
    "jp": "メインモジュール別原価"
  },
  "กดชื่อโมดูลเพื่อเปิดตาราง Cost Items ตรงโมดูลนั้น": {
    "th": "กดชื่อโมดูลเพื่อเปิดตาราง Cost Items ตรงโมดูลนั้น",
    "jp": "モジュール名を選ぶと、その原価明細が開きます。",
    "en": "Select a module name to open its cost items."
  },
  "Main module": {
    "th": "โมดูลหลัก",
    "jp": "メインモジュール"
  },
  "ครบทุก item": {
    "th": "ครบทุก item",
    "jp": "全明細を含む",
    "en": "All items included"
  },
  "Cost items — all modules": {
    "th": "รายการต้นทุนทุกโมดูล",
    "jp": "全モジュールの原価明細"
  },
  "No main module yet": {
    "th": "ยังไม่มีโมดูลหลัก",
    "jp": "メインモジュールがありません"
  },
  "สร้าง Main Module แล้วเพิ่ม item แรกในแท็บ Cost Items": {
    "th": "สร้าง Main Module แล้วเพิ่ม item แรกในแท็บ Cost Items",
    "jp": "メインモジュールを作成し、原価明細タブで最初の明細を追加してください。",
    "en": "Create a main module, then add its first item in Cost Items."
  },
  "ยอดเงินอยู่ในแถบด้านบนแล้ว หน้านี้ตอบว่าพร้อมส่งหรือยัง": {
    "th": "ยอดเงินอยู่ในแถบด้านบนแล้ว หน้านี้ตอบว่าพร้อมส่งหรือยัง",
    "jp": "合計は上部に表示されます。ここで提出準備を確認できます。",
    "en": "Totals are shown above. Check submission readiness here."
  },
  "cost item ·": {
    "th": "รายการต้นทุน ·",
    "jp": "原価明細・"
  },
  "module": {
    "th": "โมดูล",
    "jp": "モジュール"
  },
  "man-days": {
    "th": "คน-วัน",
    "jp": "人日"
  },
  "man-hour line ·": {
    "th": "รายการค่าแรง ·",
    "jp": "工数明細・"
  },
  "project cost line": {
    "th": "รายการค่าใช้จ่ายโครงการ",
    "jp": "プロジェクト経費明細"
  },
  "Revision information": {
    "th": "ข้อมูลฉบับแก้ไข",
    "jp": "改訂情報"
  },
  "Last updated": {
    "th": "แก้ไขล่าสุด",
    "jp": "最終更新"
  },
  "Lock": {
    "th": "การล็อก",
    "jp": "ロック"
  },
  "By discipline": {
    "th": "แยกตามหมวดงาน",
    "jp": "分野別"
  },
  "หมวด 01–10 ของ revision ปัจจุบัน": {
    "th": "หมวด 01–10 ของ revision ปัจจุบัน",
    "jp": "現在の版の分類01～10",
    "en": "Categories 01–10 in the current revision"
  },
  "ยังไม่มีรายการต้นทุนใน revision นี้": {
    "th": "ยังไม่มีรายการต้นทุนใน revision นี้",
    "jp": "この版には原価明細がありません。",
    "en": "This revision has no cost items."
  },
  "Top 5 cost items": {
    "th": "รายการต้นทุนสูงสุด 5 อันดับ",
    "jp": "原価上位5明細"
  },
  "รายการที่มีผลกับยอดรวมมากที่สุด": {
    "th": "รายการที่มีผลกับยอดรวมมากที่สุด",
    "jp": "合計への影響が最も大きい明細",
    "en": "Items with the greatest impact on the total"
  },
  "item": {
    "th": "รายการ",
    "jp": "明細"
  },
  "to fix": {
    "th": "ต้องแก้ไข",
    "jp": "要修正"
  },
  "Add item": {
    "th": "เพิ่มรายการ",
    "jp": "明細を追加"
  },
  "Add with details": {
    "th": "เพิ่มพร้อมรายละเอียด",
    "jp": "詳細を指定して追加"
  },
  "Save as template": {
    "th": "บันทึกเป็นแม่แบบ",
    "jp": "テンプレートとして保存"
  },
  "Copy Previous Estimate": {
    "th": "คัดลอกจากประมาณการต้นทุนเดิม",
    "jp": "既存見積からコピー"
  },
  "เลือกจาก Template": {
    "th": "เลือกจาก Template",
    "jp": "テンプレートから選択",
    "en": "Choose a template"
  },
  "All disciplines": {
    "th": "ทุกหมวดงาน",
    "jp": "すべての分野"
  },
  "Description / Specification": {
    "th": "รายละเอียด / ข้อกำหนด",
    "jp": "内容・仕様"
  },
  "Price source": {
    "th": "แหล่งราคา",
    "jp": "価格の参照元"
  },
  "ยังไม่เลือกผู้ขาย": {
    "th": "ยังไม่เลือกผู้ขาย",
    "jp": "仕入先未選択",
    "en": "Supplier not selected"
  },
  "รอราคา": {
    "th": "รอราคา",
    "jp": "価格待ち",
    "en": "Awaiting price"
  },
  "Add item to": {
    "th": "เพิ่มรายการใน",
    "jp": "明細を追加："
  },
  "ยังไม่มี item ในโมดูลนี้ — เพิ่ม item แรกเพื่อบันทึกโมดูลลง revision": {
    "th": "ยังไม่มี item ในโมดูลนี้ — เพิ่ม item แรกเพื่อบันทึกโมดูลลง revision",
    "jp": "このモジュールに明細がありません。最初の明細を追加すると、この版に保存されます。",
    "en": "This module has no items. Add its first item to save it in this revision."
  },
  "Modules": {
    "th": "โมดูล",
    "jp": "モジュール"
  },
  "Shown lines": {
    "th": "รายการที่แสดง",
    "jp": "表示中の明細"
  },
  "Shown subtotal": {
    "th": "ยอดรวมย่อยที่แสดง",
    "jp": "表示中の小計"
  },
  "live price record(s)": {
    "th": "รายการราคาปัจจุบัน",
    "jp": "現在の価格記録"
  },
  "Loading live Price Library…": {
    "th": "กำลังโหลดคลังราคาปัจจุบัน…",
    "jp": "現在の価格ライブラリを読み込み中…"
  },
  "Use price": {
    "th": "ใช้ราคานี้",
    "jp": "この価格を使用"
  },
  "No matching price": {
    "th": "ไม่พบราคาที่ตรงกัน",
    "jp": "一致する価格がありません"
  },
  "ลองค้นด้วย Part No., Description, Brand, Supplier หรือเลขที่เอกสาร": {
    "th": "ลองค้นด้วย Part No., Description, Brand, Supplier หรือเลขที่เอกสาร",
    "jp": "部品番号、内容、ブランド、仕入先、書類番号で検索してください。",
    "en": "Search by part number, description, brand, supplier or document number."
  },
  "Copy": {
    "th": "คัดลอก",
    "jp": "コピー"
  },
  "item(s)": {
    "th": "รายการ",
    "jp": "明細"
  },
  "Source estimate *": {
    "th": "ประมาณการต้นทุนต้นทาง *",
    "jp": "コピー元の見積 *"
  },
  "Loading source estimate…": {
    "th": "กำลังโหลดประมาณการต้นทุนต้นทาง…",
    "jp": "コピー元の見積を読み込み中…"
  },
  "valid of": {
    "th": "รายการถูกต้องจากทั้งหมด",
    "jp": "有効件数／全件数"
  },
  "row(s)": {
    "th": "แถว",
    "jp": "行"
  },
  "Import": {
    "th": "นำเข้า",
    "jp": "インポート"
  },
  "Excel file *": {
    "th": "ไฟล์ Excel *",
    "jp": "Excelファイル *"
  },
  "Header ที่รองรับ เช่น Category, Module, Item Code, Description, Brand, Model, Supplier, Qty, Unit, Unit Cost": {
    "th": "Header ที่รองรับ เช่น Category, Module, Item Code, Description, Brand, Model, Supplier, Qty, Unit, Unit Cost",
    "jp": "対応列名：Category、Module、Item Code、Description、Brand、Model、Supplier、Qty、Unit、Unit Cost。",
    "en": "Supported headers include Category, Module, Item Code, Description, Brand, Model, Supplier, Qty, Unit, Unit Cost."
  },
  "Apply Master Template": {
    "th": "ใช้แม่แบบมาตรฐาน",
    "jp": "標準テンプレートを適用"
  },
  "Loading templates…": {
    "th": "กำลังโหลดแม่แบบ…",
    "jp": "テンプレートを読み込み中…"
  },
  "No template": {
    "th": "ไม่พบแม่แบบ",
    "jp": "テンプレートがありません"
  },
  "ไม่พบชุดที่พร้อมใช้งาน — สร้างได้ที่หน้า Module Templates หรือปุ่ม Save as template บนแถบโมดูล": {
    "th": "ไม่พบชุดที่พร้อมใช้งาน — สร้างได้ที่หน้า Module Templates หรือปุ่ม Save as template บนแถบโมดูล",
    "jp": "使用できるテンプレートがありません。モジュールテンプレート画面、またはモジュールの「テンプレートとして保存」から作成できます。",
    "en": "No template is available. Create one in Module Templates or use Save as template on a module."
  },
  "· Revision": {
    "th": "· ฉบับแก้ไข",
    "jp": "・改訂"
  },
  "· สร้างโดย": {
    "th": "· สร้างโดย",
    "jp": "・作成者",
    "en": "· Created by"
  },
  "· แก้ไขล่าสุดโดย": {
    "th": "· แก้ไขล่าสุดโดย",
    "jp": "・最終更新者",
    "en": "· Last updated by"
  },
  "เมื่อ": {
    "th": "เมื่อ",
    "jp": "更新日時",
    "en": "on"
  },
  "ชื่อโมดูลในใบนี้ *": {
    "th": "ชื่อโมดูลในใบนี้ *",
    "jp": "この見積でのモジュール名 *",
    "en": "Module name in this estimate *"
  },
  "จำนวนชุด *": {
    "th": "จำนวนชุด *",
    "jp": "セット数 *",
    "en": "Number of sets *"
  },
  "ราคา": {
    "th": "ราคา",
    "jp": "価格",
    "en": "Price"
  },
  "ใช้ราคาอ้างอิงจาก template": {
    "th": "ใช้ราคาอ้างอิงจาก template",
    "jp": "テンプレートの参考価格を使用",
    "en": "Use template reference prices"
  },
  "ราคาอ้างอิงเก่าสุดในชุดนี้อายุ": {
    "th": "ราคาอ้างอิงเก่าสุดในชุดนี้อายุ",
    "jp": "このセットの最も古い参考価格の経過日数：",
    "en": "Oldest reference price in this set is"
  },
  "วัน — ควรทบทวนราคาหลังลงรายการ": {
    "th": "วัน — ควรทบทวนราคาหลังลงรายการ",
    "jp": "日。明細追加後に価格を確認してください。",
    "en": "days old. Review prices after adding the items."
  },
  "จะลงรายการด้วยราคา 0 ทุกบรรทัด แล้วค่อยใส่ราคาเองหรือดึงจาก Price Library": {
    "th": "จะลงรายการด้วยราคา 0 ทุกบรรทัด แล้วค่อยใส่ราคาเองหรือดึงจาก Price Library",
    "jp": "すべての明細を価格0で追加します。その後、価格を入力するか価格ライブラリから選択してください。",
    "en": "All items will start at zero price. Enter prices or select them from the Price Library afterward."
  },
  "Added to estimate": {
    "th": "เพิ่มลงประมาณการต้นทุนแล้ว",
    "jp": "見積に追加済み"
  },
  "Save as Master Template": {
    "th": "บันทึกเป็นแม่แบบมาตรฐาน",
    "jp": "標準テンプレートとして保存"
  },
  "Template code *": {
    "th": "รหัสแม่แบบ *",
    "jp": "テンプレートコード *"
  },
  "Template name *": {
    "th": "ชื่อแม่แบบ *",
    "jp": "テンプレート名 *"
  },
  "ไม่ระบุ": {
    "th": "ไม่ระบุ",
    "jp": "未指定",
    "en": "Not specified"
  },
  "ราคาที่เก็บไปเป็น": {
    "th": "ราคาที่เก็บไปเป็น",
    "jp": "保存する価格は",
    "en": "Saved prices are"
  },
  "ราคาอ้างอิง": {
    "th": "ราคาอ้างอิง",
    "jp": "参考価格",
    "en": "reference prices"
  },
  "พร้อมวันที่ ไม่ใช่ราคาปัจจุบัน ตอนดึงไปใช้จะเตือนถ้าเก่าเกิน": {
    "th": "พร้อมวันที่ ไม่ใช่ราคาปัจจุบัน ตอนดึงไปใช้จะเตือนถ้าเก่าเกิน",
    "jp": "です。参照日も保存しますが、現在価格ではありません。再利用時に古すぎる価格を警告します。",
    "en": "with a reference date, not current prices. A warning appears when reused prices are too old."
  },
  "Continue to first item": {
    "th": "ไปเพิ่มรายการแรก",
    "jp": "最初の明細へ進む"
  },
  "Main module name *": {
    "th": "ชื่อโมดูลหลัก *",
    "jp": "メインモジュール名 *"
  },
  "Main Module จะถูกบันทึกจริงเมื่อ Item แรกถูกสร้าง เพื่อไม่ให้เกิดโมดูลว่างในฐานข้อมูล": {
    "th": "Main Module จะถูกบันทึกจริงเมื่อ Item แรกถูกสร้าง เพื่อไม่ให้เกิดโมดูลว่างในฐานข้อมูล",
    "jp": "空のモジュールを作らないため、メインモジュールは最初の明細作成時に保存されます。",
    "en": "The main module is saved when its first item is created, avoiding empty modules."
  },
  "Engineering Man-hour & Site Expense": {
    "th": "ค่าแรงวิศวกรรมและค่าใช้จ่ายหน้างาน",
    "jp": "設計工数・現場経費"
  },
  "Work package → activity → cost · engineering, installation, supplier man-hour และค่าเดินทางอยู่ในโครงเดียวกัน": {
    "th": "Work package → activity → cost · engineering, installation, supplier man-hour และค่าเดินทางอยู่ในโครงเดียวกัน",
    "jp": "作業パッケージ→作業→原価。設計、設置、外注工数、出張費を同じ構成で管理します。",
    "en": "Work package → activity → cost: engineering, installation, supplier labor and travel share one structure."
  },
  "More columns": {
    "th": "แสดงคอลัมน์เพิ่ม",
    "jp": "列を追加表示"
  },
  "Fewer columns": {
    "th": "ซ่อนคอลัมน์",
    "jp": "列を減らす"
  },
  "แก้ Qty / Man-days / Hours ได้ในช่อง · Enter หรือ ✓ เพื่อบันทึก · เพิ่มแถวแล้วกด Enter เพื่อเพิ่มต่อเนื่อง": {
    "th": "แก้ Qty / Man-days / Hours ได้ในช่อง · Enter หรือ ✓ เพื่อบันทึก · เพิ่มแถวแล้วกด Enter เพื่อเพิ่มต่อเนื่อง",
    "jp": "数量・人日・時間はセル内で編集し、Enter または ✓ で保存します。行を追加したあと Enter を押すと続けて追加できます。",
    "en": "Edit Qty / Man-days / Hours in place · Enter or ✓ to save · press Enter after adding a row to keep adding."
  },
  "Revision นี้ไม่เปิดให้แก้ไขค่าแรงในสถานะปัจจุบัน หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข": {
    "th": "Revision นี้ไม่เปิดให้แก้ไขค่าแรงในสถานะปัจจุบัน หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข",
    "jp": "この改訂は現在の状態では労務費を編集できません。またはこのアカウントに編集権限がありません。",
    "en": "This revision does not accept labour edits in its current state, or this account cannot edit it."
  },
  "แก้ชื่อ Main Module / Rename Main Module": {
    "th": "แก้ชื่อ Main Module",
    "jp": "メインモジュール名を変更",
    "en": "Rename main module"
  },
  "Installation &amp; Service cost": {
    "th": "ค่าติดตั้งและบริการ",
    "jp": "設置・サービス費"
  },
  "Installation & Service cost": {
    "th": "ค่าติดตั้งและบริการ",
    "jp": "設置・サービス費"
  },
  "· Installation": {
    "th": "· งานติดตั้ง",
    "jp": "・設置"
  },
  "· Supplier": {
    "th": "· ผู้ขาย",
    "jp": "・仕入先"
  },
  "· Expense": {
    "th": "· ค่าใช้จ่าย",
    "jp": "・経費"
  },
  "Activity / Description": {
    "th": "กิจกรรม / รายละเอียด",
    "jp": "作業・内容"
  },
  "Cost Type": {
    "th": "ประเภทต้นทุน",
    "jp": "原価区分"
  },
  "Hours / Day": {
    "th": "ชั่วโมง / วัน",
    "jp": "時間／日"
  },
  "Rate": {
    "th": "อัตรา",
    "jp": "単価"
  },
  "MD": {
    "th": "คน-วัน",
    "jp": "人日"
  },
  "Add expense": {
    "th": "เพิ่มค่าใช้จ่าย",
    "jp": "経費を追加"
  },
  "HR": {
    "th": "ชั่วโมง",
    "jp": "時間"
  },
  "Own engineer": {
    "th": "วิศวกรภายใน",
    "jp": "社内エンジニア"
  },
  "Rate master": {
    "th": "อัตราค่าแรงมาตรฐาน",
    "jp": "標準工数単価"
  },
  "On save": {
    "th": "เมื่อบันทึก",
    "jp": "保存時"
  },
  "Add activity to": {
    "th": "เพิ่มกิจกรรมใน",
    "jp": "作業を追加："
  },
  "Add travel, accommodation or other expense to": {
    "th": "เพิ่มค่าเดินทาง ที่พัก หรือค่าใช้จ่ายอื่นใน",
    "jp": "出張費、宿泊費、その他経費を追加："
  },
  "No work package yet": {
    "th": "ยังไม่มีชุดงาน",
    "jp": "作業パッケージがありません"
  },
  "สร้าง Work Package แล้วเพิ่ม Activity, Supplier man-hour หรือค่าเดินทางที่เกี่ยวข้อง": {
    "th": "สร้าง Work Package แล้วเพิ่ม Activity, Supplier man-hour หรือค่าเดินทางที่เกี่ยวข้อง",
    "jp": "作業パッケージを作成し、作業、外注工数、関連する出張費を追加してください。",
    "en": "Create a work package, then add activities, supplier labor or related travel expenses."
  },
  "Installation &amp; service": {
    "th": "งานติดตั้งและบริการ",
    "jp": "設置・サービス"
  },
  "Installation & service": {
    "th": "งานติดตั้งและบริการ",
    "jp": "設置・サービス"
  },
  "Travel / hotel / per diem": {
    "th": "เดินทาง / ที่พัก / เบี้ยเลี้ยง",
    "jp": "交通費・宿泊費・日当"
  },
  "Outsource & Other Project Cost": {
    "th": "งานจ้างภายนอกและค่าใช้จ่ายโครงการอื่น",
    "jp": "外注費・その他プロジェクト経費"
  },
  "Cost line ที่ไม่ใช่ material หรือ man-hour": {
    "th": "Cost line ที่ไม่ใช่ material หรือ man-hour",
    "jp": "材料費・工数以外の原価明細",
    "en": "Costs other than materials or labor"
  },
  "Add other cost": {
    "th": "เพิ่มค่าใช้จ่ายอื่น",
    "jp": "その他経費を追加"
  },
  "No other project cost": {
    "th": "ยังไม่มีค่าใช้จ่ายโครงการอื่น",
    "jp": "その他プロジェクト経費がありません"
  },
  "ยังไม่มี outsource, transportation, accommodation หรือ other cost": {
    "th": "ยังไม่มี outsource, transportation, accommodation หรือ other cost",
    "jp": "外注費、交通費、宿泊費、その他経費がありません。",
    "en": "No outsourcing, transportation, accommodation or other costs yet."
  },
  "Applied by SQL Server to the current cost base": {
    "th": "คำนวณจากฐานต้นทุนปัจจุบัน",
    "jp": "現在の原価ベースに適用"
  },
  "Preview total after contingency": {
    "th": "ยอดรวมหลังเผื่อค่าใช้จ่าย",
    "jp": "予備費を含む合計のプレビュー"
  },
  "Save contingency": {
    "th": "บันทึกค่าเผื่อ",
    "jp": "予備費を保存"
  },
  "Cost base": {
    "th": "ฐานต้นทุน",
    "jp": "原価ベース"
  },
  "Transportation": {
    "th": "ค่าเดินทาง",
    "jp": "交通費"
  },
  "Accommodation": {
    "th": "ค่าที่พัก",
    "jp": "宿泊費"
  },
  "Subtotal": {
    "th": "ยอดรวมย่อย",
    "jp": "小計"
  },
  "Estimate sections": {
    "th": "ส่วนงานประมาณการต้นทุน",
    "jp": "見積の担当区分"
  },
  "ผู้รับผิดชอบ วันครบกำหนด สถานะ และ progress จากฐานข้อมูล": {
    "th": "ผู้รับผิดชอบ วันครบกำหนด สถานะ และ progress จากฐานข้อมูล",
    "jp": "保存済みの担当者、期限、状態、進捗",
    "en": "Saved owners, due dates, statuses and progress"
  },
  "Assign section": {
    "th": "มอบหมายส่วนงาน",
    "jp": "担当区分を割り当て"
  },
  "Responsible Engineer": {
    "th": "วิศวกรผู้รับผิดชอบ",
    "jp": "担当エンジニア"
  },
  "Support Engineer": {
    "th": "วิศวกรสนับสนุน",
    "jp": "支援エンジニア"
  },
  "No section assignment": {
    "th": "ยังไม่ได้มอบหมายส่วนงาน",
    "jp": "担当区分が未割り当てです"
  },
  "Estimate completion": {
    "th": "ความคืบหน้าประมาณการต้นทุน",
    "jp": "見積の完成状況"
  },
  "Overall assignment progress": {
    "th": "ความคืบหน้างานที่มอบหมายทั้งหมด",
    "jp": "割り当て作業全体の進捗"
  },
  "Permission": {
    "th": "สิทธิ์ใช้งาน",
    "jp": "権限"
  },
  "Estimate Validation": {
    "th": "ตรวจสอบประมาณการต้นทุน",
    "jp": "見積の検証"
  },
  "ตรวจโดย API/SQL Server ก่อน Submit และ Approve": {
    "th": "ตรวจโดย API/SQL Server ก่อน Submit และ Approve",
    "jp": "提出・承認前にシステムで検証します",
    "en": "Validated by the system before submission and approval"
  },
  "Open line": {
    "th": "เปิดรายการ",
    "jp": "明細を開く"
  },
  "Server validation passed": {
    "th": "ผ่านการตรวจสอบจากระบบ",
    "jp": "システム検証に合格"
  },
  "Revision ปัจจุบันไม่มี critical issue หรือ advisory warning": {
    "th": "Revision ปัจจุบันไม่มี critical issue หรือ advisory warning",
    "jp": "現在の版に重大な問題や注意事項はありません。",
    "en": "The current revision has no critical issues or advisory warnings."
  },
  "Result": {
    "th": "ผลลัพธ์",
    "jp": "結果"
  },
  "Rules enforced": {
    "th": "กฎที่ใช้ตรวจสอบ",
    "jp": "検証ルール"
  },
  "Positive quantity": {
    "th": "จำนวนมากกว่าศูนย์",
    "jp": "数量は正の値"
  },
  "Every persisted line must have quantity greater than zero.": {
    "th": "ทุกรายการที่บันทึกต้องมีจำนวนมากกว่าศูนย์",
    "jp": "保存するすべての明細は数量が0より大きい必要があります。"
  },
  "Unit cost and owner": {
    "th": "ต้นทุนต่อหน่วยและผู้รับผิดชอบ",
    "jp": "単価と担当者"
  },
  "Required references are checked at the API boundary.": {
    "th": "ระบบตรวจสอบข้อมูลอ้างอิงที่จำเป็นก่อนบันทึก",
    "jp": "保存前に必要な参照情報を確認します。"
  },
  "Supplier and quotation are mandatory.": {
    "th": "ต้องระบุผู้ขายและใบเสนอราคา",
    "jp": "仕入先と見積書は必須です。"
  },
  "Non-empty revision": {
    "th": "ฉบับแก้ไขต้องมีรายการ",
    "jp": "明細のある版"
  },
  "At least one cost or effort line is required.": {
    "th": "ต้องมีรายการต้นทุนหรือค่าแรงอย่างน้อยหนึ่งรายการ",
    "jp": "原価または工数の明細が1件以上必要です。"
  },
  "Revision Control": {
    "th": "ควบคุมฉบับแก้ไข",
    "jp": "改訂管理"
  },
  "Revision history เป็น immutable record; เปิด revision ใหม่จากแถบคำสั่งของรายการที่ Approved หรือ Locked": {
    "th": "Revision history เป็น immutable record; เปิด revision ใหม่จากแถบคำสั่งของรายการที่ Approved หรือ Locked",
    "jp": "改訂履歴は変更できません。承認済みまたはロック済み見積の操作バーから新しい版を作成してください。",
    "en": "Revision history cannot be changed. Create a new revision from an approved or locked estimate's action bar."
  },
  "Reviewed by": {
    "th": "ผู้ตรวจทาน",
    "jp": "確認者"
  },
  "Reviewed": {
    "th": "ตรวจทานแล้ว",
    "jp": "確認済み"
  },
  "No revision history": {
    "th": "ยังไม่มีประวัติฉบับแก้ไข",
    "jp": "改訂履歴がありません"
  },
  "ยังไม่มี revision record ที่ API ส่งกลับ": {
    "th": "ยังไม่มี revision record ที่ API ส่งกลับ",
    "jp": "改訂記録がありません。",
    "en": "No revision records were returned."
  },
  "Comparison is not available yet": {
    "th": "ยังเปรียบเทียบไม่ได้",
    "jp": "比較はまだ利用できません"
  },
  "ต้องมี revision history อย่างน้อยสอง revision; ระบบไม่สร้างข้อมูลเปรียบเทียบจำลอง": {
    "th": "ต้องมี revision history อย่างน้อยสอง revision; ระบบไม่สร้างข้อมูลเปรียบเทียบจำลอง",
    "jp": "比較には保存済みの版が2つ以上必要です。",
    "en": "At least two saved revisions are required for comparison."
  },
  "Compare Estimate Revision": {
    "th": "เปรียบเทียบฉบับประมาณการต้นทุน",
    "jp": "見積の版を比較"
  },
  "เปรียบเทียบยอดรวมจาก revision history จริง": {
    "th": "เปรียบเทียบยอดรวมจาก revision history จริง",
    "jp": "保存済み改訂履歴の合計を比較",
    "en": "Compare totals from saved revision history"
  },
  "From revision": {
    "th": "จากฉบับ",
    "jp": "比較元の版"
  },
  "To revision": {
    "th": "ถึงฉบับ",
    "jp": "比較先の版"
  },
  "Difference": {
    "th": "ส่วนต่าง",
    "jp": "差額"
  },
  "Line-by-line historical comparison จะเปิดเมื่อ backend ส่ง revision snapshots; หน้านี้แสดงเฉพาะ revision totals ที่มีอยู่จริง": {
    "th": "Line-by-line historical comparison จะเปิดเมื่อ backend ส่ง revision snapshots; หน้านี้แสดงเฉพาะ revision totals ที่มีอยู่จริง",
    "jp": "保存済みの版の合計のみ表示します。明細ごとの比較には過去の明細スナップショットが必要です。",
    "en": "Only saved revision totals are shown. Line-by-line comparison requires historical item snapshots."
  },
  "Cost summary": {
    "th": "สรุปต้นทุน",
    "jp": "原価集計"
  },
  "Approval covers internal engineering cost only — no margin": {
    "th": "อนุมัติเฉพาะต้นทุนวิศวกรรมภายใน ไม่รวมส่วนกำไร",
    "jp": "承認対象は社内設計原価のみで、利益は含みません"
  },
  "Top 10 highest cost items": {
    "th": "รายการต้นทุนสูงสุด 10 อันดับ",
    "jp": "原価上位10明細"
  },
  "ยังไม่มี cost item สำหรับ review": {
    "th": "ยังไม่มี cost item สำหรับ review",
    "jp": "確認する原価明細がありません。",
    "en": "No cost items are available for review."
  },
  "Engineering man-hour by department": {
    "th": "ค่าแรงวิศวกรรมแยกตามแผนก",
    "jp": "部門別の設計工数"
  },
  "No man-hour": {
    "th": "ยังไม่มีค่าแรง",
    "jp": "工数がありません"
  },
  "ยังไม่มี engineering effort สำหรับ review": {
    "th": "ยังไม่มี engineering effort สำหรับ review",
    "jp": "確認する設計工数がありません。",
    "en": "No engineering effort is available for review."
  },
  "Reviewer decision": {
    "th": "การตัดสินใจของผู้ตรวจทาน",
    "jp": "確認者の判断"
  },
  "Actions shown from API capabilities": {
    "th": "แสดงคำสั่งตามสิทธิ์ที่ระบบอนุญาต",
    "jp": "権限に応じた操作を表示"
  },
  "Submit for Engineering Review": {
    "th": "ส่งให้วิศวกรรมตรวจทาน",
    "jp": "設計レビューに提出"
  },
  "Approve Estimate Cost": {
    "th": "อนุมัติประมาณการต้นทุน",
    "jp": "見積原価を承認"
  },
  "บัญชีนี้ไม่มี workflow action สำหรับสถานะปัจจุบัน": {
    "th": "บัญชีนี้ไม่มี workflow action สำหรับสถานะปัจจุบัน",
    "jp": "現在の状態で、このアカウントが実行できる操作はありません。",
    "en": "This account has no available workflow actions for the current status."
  },
  "critical error(s) block submission and approval.": {
    "th": "ข้อผิดพลาดสำคัญปิดกั้นการส่งตรวจและอนุมัติ",
    "jp": "重大なエラーがあるため提出・承認できません。"
  },
  "warning(s) are advisory and do not block workflow.": {
    "th": "คำเตือนเป็นข้อแนะนำ ไม่ปิดกั้นขั้นตอนงาน",
    "jp": "警告は注意事項であり、処理を妨げません。"
  },
  "Validation for reviewer": {
    "th": "ผลตรวจสอบสำหรับผู้ตรวจทาน",
    "jp": "確認者向けの検証結果"
  },
  "No server validation issue.": {
    "th": "ไม่พบปัญหาจากการตรวจสอบของระบบ",
    "jp": "システム検証の問題はありません。"
  },
  "Main module *": {
    "th": "โมดูลหลัก *",
    "jp": "メインモジュール *"
  },
  "Reference number": {
    "th": "เลขที่อ้างอิง",
    "jp": "参照番号"
  },
  "Reference project": {
    "th": "โครงการอ้างอิง",
    "jp": "参照プロジェクト"
  },
  "Line status": {
    "th": "สถานะรายการ",
    "jp": "明細の状態"
  },
  "Continue to activity": {
    "th": "ไปเพิ่มกิจกรรม",
    "jp": "作業へ進む"
  },
  "Work package name *": {
    "th": "ชื่อชุดงาน *",
    "jp": "作業パッケージ名 *"
  },
  "Cost type *": {
    "th": "ประเภทต้นทุน *",
    "jp": "原価区分 *"
  },
  "Work Package จะเกิดขึ้นจริงเมื่อ Activity แรกถูกบันทึก เพื่อไม่สร้าง Package ว่างในฐานข้อมูล": {
    "th": "Work Package จะเกิดขึ้นจริงเมื่อ Activity แรกถูกบันทึก เพื่อไม่สร้าง Package ว่างในฐานข้อมูล",
    "jp": "空のパッケージを作らないため、作業パッケージは最初の作業の保存時に作成されます。",
    "en": "The work package is saved with its first activity, avoiding empty packages."
  },
  "Work package *": {
    "th": "ชุดงาน *",
    "jp": "作業パッケージ *"
  },
  "Provider *": {
    "th": "ผู้ให้บริการ *",
    "jp": "作業提供者 *"
  },
  "Engineer level *": {
    "th": "ระดับวิศวกร *",
    "jp": "エンジニアの等級 *"
  },
  "Select supplier": {
    "th": "เลือกผู้ขาย",
    "jp": "仕入先を選択"
  },
  "Quotation number": {
    "th": "เลขที่ใบเสนอราคา",
    "jp": "見積書番号"
  },
  "Quotation date": {
    "th": "วันที่ใบเสนอราคา",
    "jp": "見積書日付"
  },
  "Engineer qty *": {
    "th": "จำนวนวิศวกร *",
    "jp": "エンジニア人数 *"
  },
  "Hours / day *": {
    "th": "ชั่วโมง / วัน *",
    "jp": "時間／日 *"
  },
  "Line cost": {
    "th": "ต้นทุนรายการ",
    "jp": "明細の原価"
  },
  "Expense type *": {
    "th": "ประเภทค่าใช้จ่าย *",
    "jp": "経費区分 *"
  },
  "Unit cost (THB) *": {
    "th": "ต้นทุนต่อหน่วย (บาท) *",
    "jp": "単価（THB） *"
  },
  "Assign estimate section": {
    "th": "มอบหมายส่วนงานประมาณการต้นทุน",
    "jp": "見積の担当区分を割り当て"
  },
  "ระบบจะส่งอีเมลให้ Responsible Engineer และ Support Engineer ที่เลือก โดยการบันทึก assignment จะไม่สูญหายหากระบบอีเมลขัดข้อง": {
    "th": "ระบบจะส่งอีเมลให้ Responsible Engineer และ Support Engineer ที่เลือก โดยการบันทึก assignment จะไม่สูญหายหากระบบอีเมลขัดข้อง",
    "jp": "選択した担当・支援エンジニアにメールを送信します。メール送信に失敗しても、割り当て記録は保存されます。",
    "en": "The system emails the selected responsible and support engineers. Assignment records remain saved if email delivery fails."
  },
  "Section *": {
    "th": "ส่วนงาน *",
    "jp": "担当区分 *"
  },
  "Responsible engineer *": {
    "th": "วิศวกรผู้รับผิดชอบ *",
    "jp": "担当エンジニア *"
  },
  "Support engineer": {
    "th": "วิศวกรสนับสนุน",
    "jp": "支援エンジニア"
  },
  "None": {
    "th": "ไม่มี",
    "jp": "なし"
  },
  "Assignment note": {
    "th": "หมายเหตุการมอบหมาย",
    "jp": "割り当てメモ"
  },
  "Progress %": {
    "th": "ความคืบหน้า %",
    "jp": "進捗率 %"
  },
  "Labor work package": {
    "th": "ชุดงานค่าแรง",
    "jp": "労務ワークパッケージ"
  },
  "Pull a reusable set of activities from the library, adjust people and duration, then add them in one go": {
    "th": "ดึงชุดกิจกรรมที่ใช้ซ้ำได้จากคลัง ปรับจำนวนคนและระยะเวลา แล้วเพิ่มเข้า Estimate ในครั้งเดียว",
    "jp": "ライブラリから再利用できる作業セットを取り込み、人数と期間を調整して一括で追加します"
  },
  "Search code, name, activity or level": {
    "th": "ค้นหารหัส ชื่อ กิจกรรม หรือระดับ",
    "jp": "コード・名称・作業・等級で検索"
  },
  "All cost types": {
    "th": "ทุกประเภทต้นทุน",
    "jp": "すべての原価区分"
  },
  "Cost type": {
    "th": "ประเภทต้นทุน",
    "jp": "原価区分"
  },
  "Package": {
    "th": "ชุดงาน",
    "jp": "パッケージ"
  },
  "Add activities": {
    "th": "เพิ่มกิจกรรม",
    "jp": "作業を追加"
  },
  "Choose another package": {
    "th": "เลือกชุดงานอื่น",
    "jp": "別のパッケージを選ぶ"
  },
  "Loading packages…": {
    "th": "กำลังโหลดชุดงาน…",
    "jp": "パッケージを読み込み中…"
  },
  "No published package": {
    "th": "ยังไม่มีชุดงานที่เผยแพร่",
    "jp": "公開済みパッケージがありません"
  },
  "No labor package is published yet. Build one from an existing work package with Save as labor package.": {
    "th": "ยังไม่มีชุดงานค่าแรงที่เผยแพร่ สร้างได้จากชุดงานที่มีอยู่ด้วยปุ่ม บันทึกเป็น Labor Package",
    "jp": "公開済みの労務パッケージがありません。既存のワークパッケージから「労務パッケージとして保存」で作成してください。"
  },
  "Labor package library is not available on this database": {
    "th": "ฐานข้อมูลนี้ยังไม่มีคลังชุดงานค่าแรง",
    "jp": "このデータベースでは労務パッケージライブラリを利用できません"
  },
  "Work package name in this estimate *": {
    "th": "ชื่อชุดงานใน Estimate นี้ *",
    "jp": "この見積でのワークパッケージ名 *"
  },
  "Rate date": {
    "th": "วันที่ใช้อัตรา",
    "jp": "単価基準日"
  },
  "Hours / day": {
    "th": "ชั่วโมง/วัน",
    "jp": "時間/日"
  },
  "Decide at submit": {
    "th": "เลือกตอนส่งอนุมัติ",
    "jp": "提出時に決定"
  },
  "no rate": {
    "th": "ไม่มีอัตรา",
    "jp": "単価なし"
  },
  "the rate this line was written against has been superseded": {
    "th": "อัตราที่ใช้บันทึกแถวนี้ถูกแทนที่ด้วยฉบับใหม่แล้ว",
    "jp": "この明細の基準単価は新しい版に置き換えられています"
  },
  "Activities": {
    "th": "กิจกรรม",
    "jp": "作業"
  },
  "Search the rate master and fill in the rate, level and department": {
    "th": "ค้นหาใน Rate Master แล้วเติมอัตรา ระดับ และแผนก",
    "jp": "レートマスタを検索して単価・等級・部門を入力します"
  },
  "Search code, level, department or role": {
    "th": "ค้นหารหัส ระดับ แผนก หรือบทบาท",
    "jp": "コード・等級・部門・役割で検索"
  },
  "Only an effective rate can price a new line": {
    "th": "มีเพียงอัตราที่มีผลอยู่เท่านั้นที่ใช้คิดราคาแถวใหม่ได้",
    "jp": "新しい明細に適用できるのは有効な単価だけです"
  },
  "In effect": {
    "th": "ใช้งานอยู่",
    "jp": "有効"
  },
  "Starts later": {
    "th": "เริ่มภายหลัง",
    "jp": "開始前"
  },
  "Expired": {
    "th": "หมดอายุ",
    "jp": "期限切れ"
  },
  "No rate found": {
    "th": "ไม่พบอัตรา",
    "jp": "単価が見つかりません"
  },
  "No engineering rate matches this search. An Engineering Manager or Admin maintains the rate master.": {
    "th": "ไม่มีอัตราวิศวกรรมที่ตรงกับการค้นหานี้ ผู้ดูแล Rate Master คือ Engineering Manager หรือ Admin",
    "jp": "この検索条件に一致する技術単価はありません。レートマスタはエンジニアリングマネージャーまたは管理者が管理します。"
  },
  "Save as labor package": {
    "th": "บันทึกเป็นชุดงานค่าแรง",
    "jp": "労務パッケージとして保存"
  },
  "Save to library": {
    "th": "บันทึกเข้าคลัง",
    "jp": "ライブラリに保存"
  },
  "activity lines": {
    "th": "กิจกรรม",
    "jp": "件の作業"
  },
  "Package code *": {
    "th": "รหัสชุดงาน *",
    "jp": "パッケージコード *"
  },
  "Package name *": {
    "th": "ชื่อชุดงาน *",
    "jp": "パッケージ名 *"
  },
  "e.g. LP-COMMISSIONING": {
    "th": "เช่น LP-COMMISSIONING",
    "jp": "例: LP-COMMISSIONING"
  },
  "Leave blank for every department": {
    "th": "เว้นว่างไว้ถ้าใช้ได้ทุกแผนก",
    "jp": "全部門で使う場合は空欄"
  },
  "What kind of job is this package for, and what should someone know before pulling it in?": {
    "th": "ชุดงานนี้ใช้กับงานแบบไหน และคนที่จะดึงไปใช้ควรรู้อะไรก่อน",
    "jp": "このパッケージはどんな案件向けか、取り込む前に知っておくべきことは何か"
  },
  "Saved to the labor package library": {
    "th": "บันทึกเข้าคลังชุดงานค่าแรงแล้ว",
    "jp": "労務パッケージライブラリに保存しました"
  },
  "is saved as a draft in the labor package library.": {
    "th": "ถูกบันทึกเป็น Draft ในคลังชุดงานค่าแรงแล้ว",
    "jp": "は労務パッケージライブラリに下書きとして保存されました。"
  },
  "Find it under Estimating library → Labor Packages. A draft cannot be pulled into an estimate until somebody publishes it as Active.": {
    "th": "เปิดได้ที่เมนู Estimating library → Labor Packages · Draft ยังดึงเข้า Estimate ไม่ได้จนกว่าจะมีคนเผยแพร่เป็น Active",
    "jp": "Estimating library → Labor Packages から開けます。下書きは誰かが Active として公開するまで見積に取り込めません。"
  },
  "Open the saved package": {
    "th": "เปิดชุดงานที่บันทึก",
    "jp": "保存したパッケージを開く"
  },
  "Saved, but the screen behind could not be refreshed:": {
    "th": "บันทึกสำเร็จ แต่รีเฟรชหน้าจอด้านหลังไม่สำเร็จ:",
    "jp": "保存しましたが、背面の画面を更新できませんでした:"
  },
  "This database has no rate code, role or ERP default yet. Rates and their amounts are correct; the extra master fields arrive with migration 044.": {
    "th": "ฐานข้อมูลนี้ยังไม่มีรหัสอัตรา บทบาท หรือค่าตั้งต้น ERP · ตัวอัตราและจำนวนเงินถูกต้อง ส่วนฟิลด์ master ที่เหลือจะมากับ migration 044",
    "jp": "このデータベースには単価コード・役割・ERP 既定値がまだありません。単価と金額は正しく、追加のマスタ項目は migration 044 で追加されます。"
  },
  "Effective today only": {
    "th": "เฉพาะที่มีผลวันนี้",
    "jp": "本日有効のみ"
  },
  "Loading rates…": {
    "th": "กำลังโหลดอัตรา…",
    "jp": "単価を読み込み中…"
  },
  "Per hour": {
    "th": "ต่อชั่วโมง",
    "jp": "時間あたり"
  },
  "Per day": {
    "th": "ต่อวัน",
    "jp": "日あたり"
  },
  "ERP": {
    "th": "ERP",
    "jp": "ERP"
  },
  "· version": {
    "th": "· ฉบับ",
    "jp": "· 版"
  },
  " · internal rates are read from the rate master when you add them, not from this package": {
    "th": " · อัตราภายในถูกอ่านจาก Rate Master ตอนกดเพิ่ม ไม่ได้เอามาจากชุดงานนี้",
    "jp": " · 社内単価は追加時にレートマスタから読み込まれ、このパッケージからは取りません"
  },
  "A supplier activity needs its own supplier, quotation number and price date before it can be added. Fill those in on the line, or leave it unticked.": {
    "th": "กิจกรรมของผู้ขายต้องมีผู้ขาย เลขที่ใบเสนอราคา และวันที่ราคา ก่อนจึงจะเพิ่มได้ · กรอกในแถวนั้น หรือเอาเครื่องหมายถูกออก",
    "jp": "仕入先の作業は、仕入先・見積番号・価格日付を入力しないと追加できません。行に入力するか、チェックを外してください。"
  },
  "activity line(s) cannot be added yet. Fix them, or untick them to leave them out.": {
    "th": "กิจกรรมยังเพิ่มไม่ได้ · แก้ให้ถูกต้อง หรือเอาเครื่องหมายถูกออกเพื่อไม่รวม",
    "jp": "件の作業はまだ追加できません。修正するか、チェックを外して除外してください。"
  },
  "Rates are stored as a reference with the rate master row they came from. Applying the package re-reads the live rate, so an old rate card can never be copied into a new estimate. The package is saved as a draft; publishing it needs master data access.": {
    "th": "อัตราถูกเก็บไว้เป็นข้อมูลอ้างอิงพร้อมแถว Rate Master ที่มันมา · ตอนนำชุดงานไปใช้ระบบจะอ่านอัตราปัจจุบันใหม่ อัตราเก่าจึงไม่มีทางถูกคัดลอกเข้า Estimate ใหม่ · ชุดงานถูกบันทึกเป็น Draft การเผยแพร่ต้องมีสิทธิ์ master data",
    "jp": "単価は取得元のレートマスタ行とともに参照値として保存されます。パッケージ適用時に現行単価を読み直すため、古い単価が新しい見積に複製されることはありません。パッケージは下書きとして保存され、公開にはマスタデータ権限が必要です。"
  },
  "Name the module, then add its first item to save it into this revision": {
    "th": "ตั้งชื่อ Main Module แล้วเพิ่ม Item แรกเพื่อบันทึกลง revision ปัจจุบัน",
    "jp": "メインモジュール名を付け、最初のアイテムを追加すると現在の版に保存されます"
  },
  "ขยับขึ้น / Move up": {
    "th": "ขยับขึ้น",
    "jp": "上へ移動"
  },
  "ขยับลง / Move down": {
    "th": "ขยับลง",
    "jp": "下へ移動"
  },
  "แก้ไข Main Module / Edit Main Module": {
    "th": "แก้ไข Main Module",
    "jp": "メインモジュールを編集"
  },
  "ลบ Main Module / Delete Main Module": {
    "th": "ลบ Main Module",
    "jp": "メインモジュールを削除"
  },
  "The estimator and due date come from the inquiry · contingency starts at 5%": {
    "th": "ระบบใช้ผู้ประเมินและกำหนดส่งจาก Inquiry ให้อัตโนมัติ · Contingency เริ่มต้น 5%",
    "jp": "見積担当と期日は引合から自動で設定され、予備費は5%から始まります"
  },
  "Add a standalone item": {
    "th": "เพิ่มรายการเดี่ยว",
    "jp": "単独明細を追加"
  },
  "Drag ⠿ to reorder or move a line between modules · drop it on a row to choose the position, or on a module name to send it to the end": {
    "th": "ลากปุ่ม ⠿ เพื่อจัดลำดับหรือย้ายข้ามโมดูล · วางบนแถวเพื่อเลือกตำแหน่ง หรือบนชื่อโมดูลเพื่อย้ายไปท้ายโมดูล",
    "jp": "⠿ をドラッグして並べ替えやモジュール間の移動ができます。行に落とすと位置を指定、モジュール名に落とすと末尾へ移動します"
  },
  "Included in the set price": {
    "th": "รวมในราคาเซ็ต",
    "jp": "セット価格に含む"
  },
  "standalone": {
    "th": "เดี่ยว",
    "jp": "単独"
  },
  "Add from library": {
    "th": "เพิ่มจากคลัง",
    "jp": "ライブラリから追加"
  },
  "Manage library": {
    "th": "จัดการคลัง",
    "jp": "ライブラリを管理"
  },
  "all departments": {
    "th": "ทุกแผนก",
    "jp": "全部門"
  },
  "Internal rates are resolved on the business date the lines are added": {
    "th": "อัตราภายในถูกคิดตามวันทำการที่เพิ่มแถวเข้าไป",
    "jp": "社内単価は明細を追加した営業日で解決されます"
  },
  "Left out": {
    "th": "ไม่รวม",
    "jp": "除外"
  }
};
