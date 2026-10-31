/*
 * Click-through guides (GuideLayer.tsx): each walks a person through one task on the real screen. A step points at an
 * element marked data-guide="<name>" (Field and Panel take a guide prop; Tabs mark each tab data-tab="<id>") and either
 * waits for the person to click it or explains it with a Next button. The person does the real work as they go, and
 * the last step says how to stop without saving when they are only practising.
 *
 * Owner decisions 2026-10-30: six guides for the daily work, the person decides at the end whether to save, progress
 * is kept on the server so a head can see who has finished which guide (migration 091), and a screen invites a
 * newcomer the first time it is opened.
 *
 * Keep the words on buttons the same as the screen's own Thai, English and Japanese labels. tests/guides.test.mjs
 * checks that every step's target is still marked somewhere in the source.
 */

export type GuideCopy = { th: string; en: string; jp: string };

export type GuideStep = {
  /** A data-guide name, or a CSS selector when it starts with "[". A step without one is a note in the middle of the screen. */
  target?: string;
  /** click: the step moves on when the person clicks the target. next: they read it and press Next. */
  action: "click" | "next";
  /** For a click step, the part of the target that counts, such as a table's rows. */
  clickOn?: string;
  /** The screen the step belongs to. The guide only skips ahead to a step on the screen that is open. */
  view: string;
  /** Offer "Go to this screen" when the target is not showing (for a menu entry the narrow layout hides). */
  canGo?: boolean;
  title: GuideCopy;
  body: GuideCopy;
  /** What to do when the target is not on the screen yet. */
  missing?: GuideCopy;
};

export type Guide = {
  id: string;
  title: GuideCopy;
  summary: GuideCopy;
  minutes: number;
  /** Every permission the task needs; the guide is offered only to people who hold them all. */
  permissions: readonly string[];
  /** Screens where the guide is listed first. */
  views: readonly string[];
  /** The screen that invites a newcomer to this guide the first time it is opened. */
  invite?: string;
  steps: readonly GuideStep[];
};

const menu = (view: string, title: GuideCopy, body: GuideCopy): GuideStep => ({
  target: `nav.${view}`, action: "click", view, canGo: true, title, body,
  missing: {
    th: "ถ้าไม่เห็นเมนูด้านซ้าย ให้กด 'ไปที่หน้านี้'",
    en: "If the side menu is hidden, press Go to this screen.",
    jp: "左のメニューが見えない場合は「この画面へ」を押します。",
  },
});

const inquiryMenu = menu("inquiries",
  { th: "เปิดเมนูงานประเมินราคา / Inquiry", en: "Open RFQ intake & estimating", jp: "「見積作業・Inquiry」を開く" },
  { th: "งานจากลูกค้าทุกเรื่องเริ่มที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every customer request starts here. Click the highlighted menu entry.", jp: "顧客からの依頼はすべてここから始まります。強調表示のメニューをクリックします。" });

const openInquiry = (body: GuideCopy): GuideStep => ({
  target: "inquiry.list", action: "click", clickOn: "tbody tr", view: "inquiries",
  title: { th: "เปิด Inquiry", en: "Open the inquiry", jp: "引合を開く" },
  body,
  missing: {
    th: "รอให้รายการโหลดสักครู่ ถ้ายังเปิด Inquiry เรื่องอื่นอยู่ ให้กดลิงก์ย้อนกลับด้านบนของหน้า",
    en: "Wait a moment for the list to load. If another inquiry is open, use the back link at the top of the page.",
    jp: "一覧の読み込みを少し待ちます。別の引合を開いている場合は、ページ上部の戻るリンクを使います。",
  },
});

export const GUIDES: readonly Guide[] = [
  {
    id: "inquiry-create",
    title: { th: "รับ RFQ และสร้าง Inquiry ใหม่", en: "Receive an RFQ and create an inquiry", jp: "RFQを受け付けて引合を作成" },
    summary: {
      th: "ตั้งแต่เปิดเมนูจนบันทึก Inquiry พร้อมไฟล์ RFQ ของลูกค้า และส่งต่อให้ผู้ประเมินราคา",
      en: "From the menu to a saved inquiry with the customer's RFQ files, handed to the estimator.",
      jp: "メニューから、顧客のRFQファイル付きの引合を保存して見積担当へ渡すまで。",
    },
    minutes: 3,
    permissions: ["inquiry.write"],
    views: ["inquiries"],
    invite: "inquiries",
    steps: [
      inquiryMenu,
      {
        target: "inquiry.receive", action: "click", view: "inquiries",
        title: { th: "กด 'รับ RFQ / สร้าง Inquiry'", en: "Press Receive RFQ / create inquiry", jp: "「RFQ受付・Inquiry作成」を押す" },
        body: { th: "ปุ่มนี้เปิดฟอร์มรับงานใหม่", en: "It opens the intake form for a new request.", jp: "新しい依頼の受付フォームが開きます。" },
        missing: {
          th: "ถ้ายังเปิด Inquiry เรื่องอื่นอยู่ ให้กดลิงก์ย้อนกลับด้านบนเพื่อกลับไปที่รายการ ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้าง Inquiry",
          en: "If another inquiry is open, use the back link at the top to return to the list. If the button never appears, this account cannot create inquiries.",
          jp: "別の引合を開いている場合は、上部の戻るリンクで一覧に戻ります。ボタンが表示されない場合、このアカウントには作成権限がありません。",
        },
      },
      {
        target: "inquiry.customer", action: "next", view: "inquiries",
        title: { th: "เลือกลูกค้า", en: "Choose the customer", jp: "顧客を選ぶ" },
        body: {
          th: "พิมพ์รหัสหรือชื่อบริษัทเพื่อค้นหา แล้วเลือกผู้ติดต่อ ถ้ายังไม่มีในระบบ กด 'ลูกค้าใหม่' เพื่อเพิ่ม",
          en: "Type the company code or name to search, then pick the contact. Not listed yet? Press the new customer button.",
          jp: "会社コードまたは名前を入力して検索し、担当者を選びます。未登録なら新規顧客ボタンで追加します。",
        },
      },
      {
        target: "inquiry.endUser", action: "next", view: "inquiries",
        title: { th: "End user (ถ้ามี)", en: "End user, if different", jp: "エンドユーザー(異なる場合)" },
        body: {
          th: "บริษัทที่ใช้งานจริง ถ้าเป็นบริษัทเดียวกับผู้ว่าจ้าง กด 'บริษัทเดียวกับผู้ว่าจ้าง' หรือเว้นไว้ใส่ทีหลังก็ได้",
          en: "The company that will use the system. If it is the customer itself, press Same customer, or leave it for later.",
          jp: "実際に使用する会社です。発注者と同じなら「Same customer」を押すか、後で入力します。",
        },
      },
      {
        target: "inquiry.projectName", action: "next", view: "inquiries",
        title: { th: "ตั้งชื่องาน", en: "Name the work", jp: "案件名を付ける" },
        body: {
          th: "ใช้ชื่อที่บอกว่าลูกค้าต้องการอะไร เช่น 'ระบบ OEE ไลน์ประกอบ 3' ถ้าลูกค้ามี Inquiry ชื่อคล้ายกันที่ยังเปิดอยู่ ระบบจะเตือนตอนบันทึก",
          en: "Say what the customer wants, e.g. 'OEE system for assembly line 3'. Saving warns you if the customer already has an open inquiry with a similar name.",
          jp: "顧客の要望が分かる名前にします(例:「組立ライン3 OEEシステム」)。同じ顧客に似た名前の引合があると保存時に警告されます。",
        },
      },
      {
        target: "inquiry.due", action: "next", view: "inquiries",
        title: { th: "กำหนดตอบกลับ", en: "Estimate due date", jp: "回答期限" },
        body: {
          th: "วันที่ต้องส่งราคาให้ลูกค้า ผู้ประเมินจะเห็นวันนี้ในงานของเขา ค่าเริ่มต้นคืออีก 14 วัน",
          en: "When the price must reach the customer. The estimator sees this date in their work; it starts 14 days ahead.",
          jp: "顧客へ価格を出す期限です。見積担当の作業に表示されます。初期値は14日後です。",
        },
      },
      {
        target: "inquiry.requirement", action: "next", view: "inquiries",
        title: { th: "ความต้องการของลูกค้า", en: "Customer requirement", jp: "顧客要求" },
        body: {
          th: "สรุปสิ่งที่ลูกค้าขอด้วยคำของลูกค้าเอง ผู้ประเมินใช้ข้อความนี้เริ่มทำราคา",
          en: "Summarise what the customer asked for, in their words. The estimator starts from this text.",
          jp: "顧客の言葉で要望をまとめます。見積担当はこの内容から作業を始めます。",
        },
      },
      {
        target: "inquiry.crm", action: "next", view: "inquiries",
        title: { th: "เชื่อมกับดีลใน CRM", en: "Link the CRM deal", jp: "CRMの商談とつなぐ" },
        body: {
          th: "ถ้างานนี้มีดีลใน CRM อยู่แล้ว เลือกจากรายการด้านล่าง ระบบจะดึงข้อมูลมาและผูกให้ ถ้าไม่มี ทำขั้นต่อไปได้เลย",
          en: "If this work already has a CRM deal, pick it from the list below and its details come across. If not, carry on.",
          jp: "既にCRMの商談があれば下の一覧から選ぶと内容が引き継がれます。なければそのまま進めます。",
        },
      },
      {
        target: "inquiry.more", action: "next", view: "inquiries",
        title: { th: "รายละเอียดเพิ่มเติม", en: "More details", jp: "詳細情報" },
        body: {
          th: "กดเพื่อเปิด: เปลี่ยนผู้ประเมิน ประเภทงาน ความสำคัญ โอกาสได้งาน และข้อมูลทางเทคนิค ถ้าค่าเริ่มต้นถูกแล้วข้ามได้",
          en: "Open it to change the estimator, project type, priority, probability and technical details. Skip it if the defaults are right.",
          jp: "開くと見積担当、案件種別、優先度、受注確度、技術情報を変更できます。初期値で良ければ省略できます。",
        },
      },
      {
        target: "inquiry.attach", action: "next", view: "inquiries",
        title: { th: "แนบไฟล์ RFQ", en: "Attach the RFQ files", jp: "RFQファイルを添付" },
        body: {
          th: "ลากไฟล์มาวางหรือคลิกเพื่อเลือก (PDF, Excel, Word, DWG หรือรูป ไม่เกิน 50 MB ต่อไฟล์) ไฟล์จะอัปโหลดตอนกดบันทึก",
          en: "Drag files here or click to browse (PDF, Excel, Word, DWG or images, up to 50 MB each). They upload when you save.",
          jp: "ファイルをドラッグするかクリックして選択します(PDF・Excel・Word・DWG・画像、1ファイル50MBまで)。保存時にアップロードされます。",
        },
      },
      {
        target: "inquiry.save", action: "click", view: "inquiries",
        title: { th: "บันทึก Inquiry", en: "Save the inquiry", jp: "引合を保存" },
        body: {
          th: "ตรวจข้อมูลแล้วกด 'บันทึก Inquiry' ระบบจะออกเลข Inquiry และแจ้งผู้ประเมินทางอีเมล ถ้าแค่ฝึก ให้กด 'ยกเลิก' ข้างๆ แล้วกด 'จบบทสอน' จะไม่มีข้อมูลถูกบันทึก",
          en: "Check the form and press Save inquiry: it gets its number and the estimator is emailed. Only practising? Press Cancel beside it, then Finish; nothing is saved.",
          jp: "内容を確認して「Inquiryを保存」を押すと番号が付き、見積担当にメールが届きます。練習だけなら横の「キャンセル」を押してから「完了」を押します。何も保存されません。",
        },
      },
    ],
  },
  {
    id: "site-visit-request",
    title: { th: "ขอให้วิศวกรเข้าหน้างาน", en: "Request a site visit", jp: "現地訪問を依頼" },
    summary: {
      th: "จาก Inquiry ที่ต้องดูหน้างานก่อนทำราคา กรอกข้อมูลที่วิศวกรต้องใช้ แล้วส่งให้ตรวจสอบทางเทคนิค",
      en: "From an inquiry that needs a site survey before pricing: fill in what the engineer needs and send it to technical review.",
      jp: "価格算出前に現地確認が必要な引合から、技術者に必要な情報を入力して技術レビューへ送ります。",
    },
    minutes: 4,
    permissions: ["inquiry.read", "intake.read", "intake.write"],
    views: ["inquiries", "site-visits", "sales-intake"],
    steps: [
      inquiryMenu,
      openInquiry({
        th: "คลิกที่แถวของ Inquiry ที่ต้องให้วิศวกรไปดูหน้างาน ใช้ช่องค้นหาด้านบนช่วยหาได้",
        en: "Click the row of the inquiry that needs an engineer on site. The search above helps you find it.",
        jp: "現地確認が必要な引合の行をクリックします。上の検索で探せます。",
      }),
      {
        target: "inquiry.requestVisit", action: "click", view: "inquiries",
        title: { th: "กด 'ขอเข้าหน้างาน'", en: "Press Request a site visit", jp: "「現地訪問を依頼」を押す" },
        body: {
          th: "ปุ่มอยู่ด้านบนของ Inquiry ระบบจะดึงลูกค้าและชื่องานจาก Inquiry มาให้",
          en: "It is at the top of the inquiry; the customer and project come across from it.",
          jp: "引合の上部にあります。顧客と案件名は引合から引き継がれます。",
        },
        missing: {
          th: "ไม่เห็นปุ่มนี้? Inquiry อาจปิดไปแล้ว หรือบัญชีนี้ยังไม่มีสิทธิ์ขอเข้าหน้างาน",
          en: "No button? The inquiry may be closed, or this account cannot request visits.",
          jp: "ボタンがない場合、引合が終了しているか、このアカウントに依頼権限がありません。",
        },
      },
      {
        target: "intake.customer", action: "next", view: "inquiries",
        title: { th: "ลูกค้าและสถานที่", en: "Customer and site", jp: "顧客と現場" },
        body: {
          th: "ใส่ชื่อ Site ที่อยู่ และผู้ติดต่อหน้างาน (ชื่อ และเบอร์โทรหรืออีเมล) ช่องเหล่านี้ต้องมีก่อนส่งตรวจ",
          en: "Name the site, its address and the contact on site (a name plus phone or email). These are required before review.",
          jp: "現場名・住所・現場担当者(氏名と電話またはメール)を入力します。レビュー前に必須です。",
        },
      },
      {
        target: "intake.want", action: "next", view: "inquiries",
        title: { th: "สิ่งที่ลูกค้าต้องการ", en: "What the customer wants", jp: "顧客の要望" },
        body: {
          th: "เขียนปัญหาที่เกิดขึ้นตอนนี้ และผลที่ลูกค้าอยากได้ อย่างละอย่างน้อย 20 ตัวอักษร",
          en: "Describe today's problem and the result the customer expects, at least 20 characters each.",
          jp: "現在の問題と顧客が期待する結果を、それぞれ20文字以上で書きます。",
        },
      },
      {
        target: "intake.machine", action: "next", view: "inquiries",
        title: { th: "เครื่องจักรและสภาพหน้างาน", en: "Machine and site conditions", jp: "設備と現場条件" },
        body: {
          th: "ชื่อและรุ่นเครื่อง ระบบเดิม ข้อกำหนดความปลอดภัยและการเข้าพื้นที่ ช่วยให้วิศวกรเตรียมตัวได้ถูก",
          en: "Machine name and model, the existing system, and safety or access rules, so the engineer comes prepared.",
          jp: "設備名と型式、既存システム、安全・入場ルールを書くと技術者が準備できます。",
        },
      },
      {
        target: "intake.purpose", action: "next", view: "inquiries",
        title: { th: "วัตถุประสงค์และทักษะ", en: "Purpose and skills", jp: "目的と技能" },
        body: {
          th: "เลือกวัตถุประสงค์อย่างน้อย 1 ข้อ และทักษะที่คิดว่าต้องใช้ ผู้ประสานงานปรับทีหลังได้",
          en: "Pick at least one purpose and the skills you expect; the coordinator can adjust them.",
          jp: "目的を1つ以上と必要と思われる技能を選びます。調整担当が後で修正できます。",
        },
      },
      {
        target: "intake.attach", action: "next", view: "inquiries",
        title: { th: "แนบรูปหรือแบบ", en: "Attach photos or drawings", jp: "写真や図面を添付" },
        body: {
          th: "รูปเครื่องจริงหนึ่งรูปช่วยลดการเดาได้มาก แนบอีเมลที่ลูกค้าส่งมาด้วยก็ได้",
          en: "One photo of the real machine saves a lot of guessing. You can attach the customer's email too.",
          jp: "実機の写真1枚で推測の手間が大きく減ります。顧客のメールも添付できます。",
        },
      },
      {
        target: "intake.readiness", action: "next", view: "inquiries",
        title: { th: "ความพร้อมของข้อมูล", en: "Readiness", jp: "情報充足度" },
        body: {
          th: "ส่วนนี้บอกว่ายังขาดอะไร ข้อที่เป็น blocker ต้องครบก่อนส่งตรวจ ส่วนคำเตือนส่งได้แต่ควรเติม",
          en: "This shows what is still missing. Blockers must be done before review; warnings can wait but are worth filling.",
          jp: "不足している項目が表示されます。ブロッカーはレビュー前に必須、警告は後でも構いません。",
        },
      },
      {
        target: "intake.save", action: "click", view: "inquiries",
        title: { th: "บันทึกฉบับร่าง", en: "Save the draft", jp: "下書き保存" },
        body: {
          th: "กด 'บันทึกฉบับร่าง' บันทึกได้ทุกเมื่อแม้ข้อมูลยังไม่ครบ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
          en: "Press Save draft; you can save at any time, even incomplete. Only practising? Press Cancel, then Finish.",
          jp: "「下書き保存」を押します。未完成でもいつでも保存できます。練習だけなら「キャンセル」を押してから「完了」を押します。",
        },
      },
      {
        target: "intake.to.Pending Technical Review", action: "click", view: "inquiries",
        title: { th: "ส่งให้ตรวจสอบทางเทคนิค", en: "Send to technical review", jp: "技術レビューへ送る" },
        body: {
          th: "เมื่อข้อมูลครบ กด 'รอตรวจสอบทางเทคนิค' วิศวกรจะตรวจ แล้วผู้ประสานงานนัดวันเข้าหน้างาน ติดตามได้ที่แท็บ 'เข้าหน้างาน / ผลสำรวจ' ของ Inquiry",
          en: "When it is complete, press Pending Technical Review. Engineering checks it, then the coordinator books the visit. Follow it on the inquiry's site visit tab.",
          jp: "入力が揃ったら「技術レビュー待ち」を押します。技術者が確認し、調整担当が訪問日を決めます。引合の現地訪問タブで追跡できます。",
        },
        missing: {
          th: "ปุ่มนี้จะขึ้นหลังบันทึกฉบับร่างแล้ว ถ้าข้อมูลที่ต้องมียังไม่ครบ ระบบจะบอกว่าขาดอะไร",
          en: "The button appears once the draft is saved. If required information is missing, the screen says what.",
          jp: "下書き保存後にボタンが表示されます。必須情報が不足している場合は画面に表示されます。",
        },
      },
    ],
  },
  {
    id: "estimate-create",
    title: { th: "สร้างประมาณการต้นทุนจาก Inquiry", en: "Create an estimate from an inquiry", jp: "引合から見積を作成" },
    summary: {
      th: "สร้าง Estimate จาก Inquiry ใส่วัสดุ ค่าแรง และค่าใช้จ่ายอื่น ตรวจสอบ แล้วส่งให้ตรวจ",
      en: "Create the cost estimate from an inquiry, add materials, labour and other costs, check it and send it for review.",
      jp: "引合から原価見積を作り、材料・労務・その他費用を入れて検証し、レビューに出します。",
    },
    minutes: 5,
    permissions: ["inquiry.read", "estimate.write"],
    views: ["inquiries", "estimates"],
    invite: "estimates",
    steps: [
      inquiryMenu,
      openInquiry({
        th: "คลิกที่แถวของ Inquiry ที่ได้รับมอบหมายให้ทำราคา",
        en: "Click the row of the inquiry you were asked to price.",
        jp: "見積を任された引合の行をクリックします。",
      }),
      {
        target: "inquiry.createEstimate", action: "click", view: "inquiries",
        title: { th: "กด 'สร้างประมาณการต้นทุน'", en: "Press Create estimate", jp: "「見積を作成」を押す" },
        body: {
          th: "ปุ่มอยู่ในแถบขั้นตอนถัดไปด้านบนของ Inquiry",
          en: "It is in the next-step strip at the top of the inquiry.",
          jp: "引合上部の「次のステップ」欄にあります。",
        },
        missing: {
          th: "ถ้า Inquiry นี้มี Estimate แล้ว จะเห็นปุ่ม 'เปิดประมาณการต้นทุน' แทน กด 'ข้ามขั้นนี้' หรือเลือก Inquiry อื่น",
          en: "If this inquiry already has an estimate, you will see Open estimate instead. Skip this step or choose another inquiry.",
          jp: "既に見積がある引合では「見積を開く」が表示されます。この手順を飛ばすか、別の引合を選びます。",
        },
      },
      {
        target: "estimate.startFrom", action: "next", view: "inquiries",
        title: { th: "เริ่มจากไหน", en: "Where to start from", jp: "作成方法を選ぶ" },
        body: {
          th: "เลือก Estimate เดิมที่คล้ายกันเพื่อคัดลอกรายการมาแก้ ช่วยประหยัดเวลา หรือเลือกเริ่มจากว่าง",
          en: "Pick a similar earlier estimate to copy its lines and adjust them, which saves time, or start empty.",
          jp: "似た過去の見積を選んで明細をコピーし修正すると時間を節約できます。空から始めることもできます。",
        },
      },
      {
        target: "estimate.create", action: "click", view: "inquiries",
        title: { th: "สร้าง Estimate", en: "Create it", jp: "見積を作成" },
        body: {
          th: "กดปุ่มสร้าง ถ้าคัดลอกจาก Estimate เดิม ระบบจะเปิดหน้า Estimate ให้ทันที",
          en: "Press the create button. When you copy from an earlier estimate, the new one opens at once.",
          jp: "作成ボタンを押します。過去の見積からコピーした場合は、すぐに見積画面が開きます。",
        },
      },
      {
        target: "inquiry.openEstimate", action: "click", view: "inquiries",
        title: { th: "เปิดประมาณการต้นทุน", en: "Open the estimate", jp: "見積を開く" },
        body: {
          th: "กด 'เปิดประมาณการต้นทุน' เพื่อเข้าไปใส่ต้นทุน",
          en: "Press Open estimate to start adding costs.",
          jp: "「見積を開く」を押して原価を入力します。",
        },
      },
      {
        target: "[data-tab=\"cost\"]", action: "click", view: "estimates",
        title: { th: "วัสดุและอุปกรณ์", en: "Cost items", jp: "原価明細" },
        body: {
          th: "คลิกแท็บนี้เพื่อใส่รายการวัสดุและอุปกรณ์ จัดเป็นกลุ่มตามโมดูล",
          en: "Click this tab to add materials and equipment, grouped by module.",
          jp: "このタブで材料と機器をモジュールごとに入力します。",
        },
      },
      {
        target: "estimate.addModule", action: "next", view: "estimates",
        title: { th: "เพิ่มโมดูลและรายการ", en: "Add modules and lines", jp: "モジュールと明細を追加" },
        body: {
          th: "'เพิ่มโมดูล' สร้างกลุ่มงาน แล้วเพิ่มรายการทีละแถว หรือใช้ 'นำเข้า / คัดลอก' จาก Excel, Price Library และ Template",
          en: "Add module creates a group; then add lines one by one, or use Import / copy from Excel, the Price Library or a template.",
          jp: "「モジュールを追加」でグループを作り明細を追加します。「インポート / コピー」でExcel・価格ライブラリ・テンプレートから取り込めます。",
        },
        missing: {
          th: "ปุ่มเพิ่มรายการจะขึ้นเมื่อคุณมีสิทธิ์แก้ Estimate นี้และยังเป็นฉบับร่าง",
          en: "The add buttons appear when you may edit this estimate and it is still a draft.",
          jp: "この見積を編集でき、下書きの場合に追加ボタンが表示されます。",
        },
      },
      {
        target: "[data-tab=\"manhour\"]", action: "click", view: "estimates",
        title: { th: "ค่าแรง", en: "Labour", jp: "労務費" },
        body: {
          th: "ใส่ man-day ของแต่ละสายงาน ระบบคิดค่าแรงจาก rate ที่ตั้งไว้",
          en: "Enter the man-days for each discipline; the cost comes from the configured rates.",
          jp: "分野ごとに人日を入力します。費用は設定済みの単価から計算されます。",
        },
      },
      {
        target: "[data-tab=\"other\"]", action: "click", view: "estimates",
        title: { th: "ค่าใช้จ่ายอื่น", en: "Other costs", jp: "その他費用" },
        body: {
          th: "ค่าเดินทาง ที่พัก และค่าใช้จ่ายอื่นของงาน",
          en: "Travel, accommodation and the work's other expenses.",
          jp: "交通費・宿泊費などその他の費用です。",
        },
      },
      {
        target: "[data-tab=\"validation\"]", action: "click", view: "estimates",
        title: { th: "ตรวจสอบ", en: "Validation", jp: "検証" },
        body: {
          th: "ระบบตรวจสิ่งที่ยังขาด รายการสีแดงต้องแก้ก่อนส่ง สีเหลืองเป็นคำเตือน",
          en: "The system lists what is missing. Red items must be fixed before submitting; amber ones are warnings.",
          jp: "不足をシステムが確認します。赤は提出前に修正が必要、黄色は警告です。",
        },
      },
      {
        target: "estimate.submit", action: "click", view: "estimates",
        title: { th: "ส่งให้ตรวจสอบ", en: "Submit for review", jp: "レビュー依頼" },
        body: {
          th: "เมื่อไม่มีรายการสีแดง กด 'ส่งให้ตรวจสอบ' ผู้อนุมัติจะได้รับแจ้ง ถ้ายังไม่พร้อม กด 'จบบทสอน' แล้วกลับมาส่งทีหลัง",
          en: "With no red items left, press Submit Review and the approver is notified. Not ready yet? Press Finish and submit later.",
          jp: "赤い項目がなくなったら「レビュー依頼」を押すと承認者に通知されます。準備ができていなければ「完了」を押し、後で提出します。",
        },
        missing: {
          th: "ปุ่มส่งจะขึ้นเมื่อคุณเป็นผู้รับผิดชอบ Estimate และยังเป็นฉบับร่าง",
          en: "The submit button appears for the estimate's owner while it is a draft.",
          jp: "提出ボタンは見積担当者に、下書きの間だけ表示されます。",
        },
      },
    ],
  },
  {
    id: "purchase-request",
    title: { th: "ขอซื้อ (PR) จาก BOM", en: "Raise a purchase requisition from a BOM", jp: "BOMから購買申請を作成" },
    summary: {
      th: "เลือก BOM ที่เผยแพร่แล้ว เลือกรายการที่จะซื้อ ตรวจยอดกับงบของ Module แล้วสร้าง PR ให้ PM อนุมัติและส่งเข้า ERP",
      en: "Pick a released BOM, choose what to buy, check it against the module budgets, then raise the PR for approval and the ERP.",
      jp: "リリース済みBOMを選び、購入品を選んでモジュール予算と照合し、承認とERP連携のためにPRを作成します。",
    },
    minutes: 4,
    permissions: ["procurement.request"],
    views: ["purchase", "boms"],
    invite: "purchase",
    steps: [
      menu("purchase",
        { th: "เปิดเมนูใบขอซื้อ", en: "Open Purchase Requisition", jp: "「購買申請」を開く" },
        { th: "ใบขอซื้อทุกใบอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every requisition lives here. Click the highlighted menu entry.", jp: "購買申請はすべてここにあります。強調表示のメニューをクリックします。" }),
      {
        target: "pr.new", action: "click", view: "purchase",
        title: { th: "กด 'สร้าง PR'", en: "Press New PR", jp: "「PRを作成」を押す" },
        body: { th: "ปุ่มนี้เปิดหน้าขอซื้อจาก BOM", en: "It opens the requisition sheet for a BOM.", jp: "BOMから購買申請する画面が開きます。" },
        missing: {
          th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์ขอซื้อ",
          en: "If the button never appears, this account cannot raise requisitions.",
          jp: "ボタンが表示されない場合、このアカウントには申請権限がありません。",
        },
      },
      {
        target: "pr.bom", action: "next", view: "purchase",
        title: { th: "เลือก BOM", en: "Choose the BOM", jp: "BOMを選ぶ" },
        body: {
          th: "เลือก BOM ที่เผยแพร่แล้วของโครงการ ระบบดึงรายการที่ยังต้องซื้อมาให้",
          en: "Pick the project's released BOM; the lines still to buy come across.",
          jp: "案件のリリース済みBOMを選ぶと、未購入の明細が表示されます。",
        },
        missing: {
          th: "ถ้ายังไม่มี BOM ที่เผยแพร่แล้ว ให้ PM เผยแพร่ BOM ที่เมนู BOM ก่อน",
          en: "If no BOM is released yet, ask the PM to release one under BOM first.",
          jp: "リリース済みBOMがない場合は、先にPMにBOMメニューでリリースしてもらいます。",
        },
      },
      {
        target: "pr.required", action: "next", view: "purchase",
        title: { th: "วันที่ต้องการและความเร่งด่วน", en: "Required date and priority", jp: "必要日と優先度" },
        body: {
          th: "ใส่วันที่ต้องได้ของ ความเร่งด่วน และวัตถุประสงค์ (เช่น ใช้ที่ไซต์ไหน) ถ้ามีช่องแผนกใน ERP ให้เลือกด้วย",
          en: "Enter when you need the goods, the priority and the purpose (such as which site). Choose the ERP department when it is asked.",
          jp: "必要日、優先度、用途(どの現場か等)を入力します。ERP部門の欄があれば選択します。",
        },
      },
      {
        target: "pr.lines", action: "next", view: "purchase",
        title: { th: "เลือกรายการที่จะซื้อ", en: "Choose what to buy", jp: "購入品を選ぶ" },
        body: {
          th: "ติ๊กช่องหน้ารายการที่จะซื้อ แก้จำนวนและราคาได้ กด 'เปลี่ยนรุ่น' ถ้าจะซื้อรุ่นอื่น หรือ 'เพิ่มรายการนอกแผน' สำหรับของที่ไม่อยู่ใน BOM",
          en: "Tick the lines to buy and adjust quantity and price. Use the change model button for another model, or add an unplanned line for anything not in the BOM.",
          jp: "購入する明細にチェックし、数量と価格を調整します。別型式は型式変更、BOMにない品は計画外追加を使います。",
        },
        missing: {
          th: "ถ้า BOM นี้ขอซื้อครบแล้ว ใช้ 'เพิ่มรายการนอกแผน' หรือนำเข้า Excel",
          en: "If everything in this BOM is already requested, add an unplanned line or import Excel.",
          jp: "このBOMが申請済みの場合は、計画外追加またはExcelインポートを使います。",
        },
      },
      {
        target: "pr.summary", action: "next", view: "purchase",
        title: { th: "ตรวจยอดและผู้อนุมัติ", en: "Check the total and approvers", jp: "合計と承認者を確認" },
        body: {
          th: "ดูยอดขอซื้อเทียบงบของ Module ถ้าเกินงบมากกว่า 10% ต้องให้ Engineering Manager อนุมัติเพิ่มจาก PM แถวที่มีข้อความสีแดงต้องแก้ก่อนส่ง",
          en: "Compare the total with the module budgets. More than 10% over needs the Engineering Manager as well as the PM. Rows with red text must be fixed first.",
          jp: "申請額をモジュール予算と比べます。10%超過ならPMに加えてEngineering Managerの承認が必要です。赤字の行は先に修正します。",
        },
      },
      {
        target: "pr.submit", action: "click", view: "purchase",
        title: { th: "สร้าง PR", en: "Raise the PR", jp: "PRを作成" },
        body: {
          th: "กด 'สร้าง PR' PR จะไปให้ PM อนุมัติ แล้วส่งเข้า ERP อัตโนมัติ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
          en: "Press the create PR button. It goes to the PM for approval, then to the ERP automatically. Only practising? Press Cancel, then Finish.",
          jp: "PR作成ボタンを押すとPMの承認へ回り、その後自動でERPに送られます。練習だけなら「キャンセル」を押してから「完了」を押します。",
        },
      },
    ],
  },
  {
    id: "my-work-progress",
    title: { th: "รับงานและรายงานความคืบหน้า", en: "Take on work and report progress", jp: "作業の受領と進捗報告" },
    summary: {
      th: "รับทราบงานที่ได้รับมอบหมาย อัปเดตเปอร์เซ็นต์และสถานะในงานของฉัน และดูประวัติที่รายงานไป",
      en: "Acknowledge new assignments, update percent done and status in My Work, and see what you have reported.",
      jp: "新しい割り当てを確認し、マイワークで進捗率とステータスを更新し、報告履歴を確認します。",
    },
    minutes: 3,
    permissions: ["schedule.progress"],
    views: ["my-work"],
    invite: "my-work",
    steps: [
      menu("my-work",
        { th: "เปิดงานของฉัน", en: "Open My Work", jp: "「マイワーク」を開く" },
        { th: "หน้านี้รวมทุกงานที่คุณรับผิดชอบจากทุกโครงการ คลิกที่เมนูที่ไฮไลต์อยู่", en: "It gathers everything you are responsible for across projects. Click the highlighted menu entry.", jp: "全案件の担当作業がまとまっています。強調表示のメニューをクリックします。" }),
      {
        target: "[data-tab=\"new\"]", action: "click", view: "my-work",
        title: { th: "งานมอบหมายใหม่", en: "New assignments", jp: "新しい割り当て" },
        body: {
          th: "งานที่เพิ่งได้รับมอบหมายอยู่ที่แท็บนี้ เปิดดูแล้วกด 'รับทราบ' เพื่อยืนยันว่ารับงานแล้ว PM จะเห็นทันที",
          en: "Work just assigned to you is here. Open it and press Acknowledge to confirm you have taken it on; the PM sees it at once.",
          jp: "新しく割り当てられた作業はこのタブにあります。開いて「確認する」を押すとPMにすぐ伝わります。",
        },
      },
      {
        target: "[data-tab=\"active\"]", action: "click", view: "my-work",
        title: { th: "งานที่กำลังรับผิดชอบ", en: "My active work", jp: "進行中の自分の作業" },
        body: {
          th: "งานที่รับแล้วจัดกลุ่มตามโครงการ งานที่เลยกำหนดขึ้นก่อน",
          en: "Work you have taken on, grouped by project, the late ones first.",
          jp: "受領済みの作業が案件ごとに並び、遅れているものが先に表示されます。",
        },
      },
      {
        target: "work.group", action: "next", view: "my-work",
        title: { th: "กลุ่มงานของโครงการ", en: "A project's work", jp: "案件ごとの作業" },
        body: {
          th: "แต่ละกล่องคือหนึ่งโครงการ ถ้ายังไม่เห็นงานย่อย กดที่หัวกล่องเพื่อกาง",
          en: "Each box is one project. If its tasks are not showing, press the box's header to open it.",
          jp: "各ボックスが1案件です。作業が表示されていなければ見出しを押して開きます。",
        },
        missing: {
          th: "ยังไม่มีงานในแท็บนี้ เมื่อได้รับมอบหมายงานจะรายงานความคืบหน้าได้ที่นี่ กด 'ข้ามขั้นนี้' เพื่อดูขั้นที่เหลือ",
          en: "Nothing here yet. Once work is assigned you report on it here; skip this step to see the rest.",
          jp: "まだ作業がありません。割り当て後にここで報告します。この手順を飛ばして続きを見られます。",
        },
      },
      {
        target: "work.percent", action: "next", view: "my-work",
        title: { th: "อัปเดตเปอร์เซ็นต์", en: "Update percent done", jp: "進捗率を更新" },
        body: {
          th: "กด 0, 25, 50, 75 หรือ 100 บันทึกทันทีโดยไม่ต้องกดเซฟ 100 หมายถึงงานเสร็จ",
          en: "Press 0, 25, 50, 75 or 100; it saves at once with no save button. 100 means done.",
          jp: "0・25・50・75・100を押すとすぐ保存されます。100は完了です。",
        },
        missing: {
          th: "กางกลุ่มงานก่อน (กดที่หัวกล่องโครงการ) แล้วจะเห็นแถบเปอร์เซ็นต์",
          en: "Open a project box first (press its header) to see the percent buttons.",
          jp: "まず案件ボックスの見出しを押して開くと進捗ボタンが表示されます。",
        },
      },
      {
        target: "work.status", action: "next", view: "my-work",
        title: { th: "เปลี่ยนสถานะ", en: "Change the status", jp: "ステータスを変更" },
        body: {
          th: "เลือก 'กำลังทำ' 'ติดปัญหา' หรือ 'เสร็จแล้ว' ถ้าเลือก 'ติดปัญหา' ต้องบอกว่าติดอะไร PM จะเห็นและช่วยแก้",
          en: "Choose In Progress, Blocked or Done. Blocked asks what is in the way, so the PM can help.",
          jp: "「進行中」「ブロック」「完了」を選びます。ブロックでは理由を入力し、PMが対応できます。",
        },
      },
      {
        target: "work.details", action: "next", view: "my-work",
        title: { th: "อัปเดตรายละเอียด", en: "Update details", jp: "詳細を更新" },
        body: {
          th: "ใส่วันเริ่มและเสร็จจริง วันที่คาดว่าจะเสร็จ และบันทึกถึง PM ถ้างานจะเลยกำหนด ใช้ 'ขอวันเพิ่ม' ในเมนู ⋯ ของงาน",
          en: "Record the actual start and finish, a forecast finish and a note for the PM. If it will run late, use Request more days in the task's ⋯ menu.",
          jp: "実績の開始・完了日、完了予測日、PMへのメモを入力します。遅れそうなら作業の⋯メニューから「日数追加を申請」します。",
        },
      },
      {
        target: "[data-tab=\"updates\"]", action: "click", view: "my-work",
        title: { th: "ประวัติการอัปเดตของฉัน", en: "My updates", jp: "自分の更新履歴" },
        body: {
          th: "ทุกครั้งที่รายงานจะเก็บไว้ที่นี่ตามลำดับเวลา ใช้ตรวจย้อนหลังได้",
          en: "Everything you report is kept here in order, so you can look back.",
          jp: "報告した内容は時系列でここに残り、後から確認できます。",
        },
      },
    ],
  },
  {
    id: "support-ticket",
    title: { th: "แจ้งปัญหาการใช้งาน", en: "Report a problem", jp: "問題を報告" },
    summary: {
      th: "แจ้งปัญหาหรือข้อเสนอแนะพร้อมรูปหน้าจอ แล้วติดตามคำตอบได้ที่เมนูแจ้งปัญหาและติดตาม",
      en: "Report a problem or suggestion with a screenshot, then follow the answer under Report & Track Issues.",
      jp: "スクリーンショット付きで問題や提案を報告し、「問題の報告と追跡」で回答を確認します。",
    },
    minutes: 2,
    permissions: [],
    views: ["support"],
    invite: "support",
    steps: [
      {
        target: "topbar.report", action: "click", view: "support",
        title: { th: "กด 'แจ้งปัญหา'", en: "Press Report a problem", jp: "「問題を報告」を押す" },
        body: {
          th: "ปุ่มอยู่ที่แถบด้านบนของทุกหน้า ระบบแนบชื่อหน้าที่คุณเปิดอยู่ให้เอง จึงควรกดจากหน้าที่เจอปัญหา",
          en: "It is in the top bar on every screen and records which screen you are on, so press it where the problem happens.",
          jp: "全画面の上部バーにあり、開いている画面名が自動で添付されます。問題が起きた画面から押します。",
        },
      },
      {
        target: "support.kind", action: "next", view: "support",
        title: { th: "ประเภทและผลกระทบ", en: "Category and impact", jp: "カテゴリと影響" },
        body: {
          th: "เลือกว่าเป็นเรื่องของแอปหรือเรื่องอื่น และกระทบงานแค่ไหน ยังทำงานได้ ติดบางส่วน หรือทำงานไม่ได้",
          en: "Say whether it is about the app or something else, and how much it affects your work.",
          jp: "アプリに関することかその他か、業務への影響の大きさを選びます。",
        },
      },
      {
        target: "support.subject", action: "next", view: "support",
        title: { th: "หัวข้อ", en: "Subject", jp: "件名" },
        body: {
          th: "สั้นๆ ว่าเกิดอะไร เช่น 'กดบันทึก PR แล้วขึ้น error' อย่างน้อย 5 ตัวอักษร",
          en: "A short line on what happened, e.g. 'Saving a PR shows an error'. At least 5 characters.",
          jp: "何が起きたかを短く書きます(例:「PR保存時にエラー」)。5文字以上です。",
        },
      },
      {
        target: "support.description", action: "next", view: "support",
        title: { th: "รายละเอียด", en: "Description", jp: "詳細" },
        body: {
          th: "เล่าว่ากำลังทำอะไร เห็นอะไร และควรเป็นอย่างไร ยิ่งละเอียดยิ่งแก้ได้เร็ว",
          en: "What you were doing, what you saw and what you expected. The more detail, the faster the fix.",
          jp: "何をしていて、何が表示され、本来どうなるべきかを書きます。詳しいほど早く解決できます。",
        },
      },
      {
        target: "support.attach", action: "next", view: "support",
        title: { th: "แนบรูปหน้าจอ", en: "Attach a screenshot", jp: "スクリーンショットを添付" },
        body: {
          th: "แนบรูป (PNG, JPG) หรือ PDF ได้สูงสุด 5 ไฟล์ ไฟล์ละไม่เกิน 10 MB",
          en: "Attach up to 5 images (PNG, JPG) or PDFs, 10 MB each at most.",
          jp: "画像(PNG・JPG)またはPDFを最大5件、各10MBまで添付できます。",
        },
      },
      {
        target: "support.submit", action: "click", view: "support",
        title: { th: "ส่งเรื่อง", en: "Send it", jp: "報告を送信" },
        body: {
          th: "กด 'ส่งเรื่อง' ทีมจะตอบกลับและคุณจะได้รับแจ้งเตือน ติดตามได้ที่เมนู 'แจ้งปัญหาและติดตาม' ถ้าแค่ฝึก ให้กด 'ปิด' แล้วกด 'จบบทสอน'",
          en: "Press Submit ticket. The team answers and you are notified; follow it under Report & Track Issues. Only practising? Press Close, then Finish.",
          jp: "「報告を送信」を押すとチームが回答し、通知が届きます。「問題の報告と追跡」で確認できます。練習だけなら「閉じる」を押してから「完了」を押します。",
        },
      },
    ],
  },
];

export const guideText = (copy: GuideCopy, lang: "TH" | "EN" | "JP") => lang === "TH" ? copy.th : lang === "JP" ? copy.jp : copy.en;

/** The guides a person can do: every permission the task needs, in catalog order. */
export const guidesFor = (permissions: readonly string[]) => GUIDES.filter((guide) => guide.permissions.every((code) => permissions.includes(code)));

/** A data-guide name as a selector; a target that is already a selector (starts with "[") is used as it is. */
export const guideSelector = (target: string) => target.startsWith("[") ? target : `[data-guide="${target.replace(/["\\]/g, "\\$&")}"]`;
