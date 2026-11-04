/*
 * Click-through guides (GuideLayer.tsx): each walks a person through one task on the real screen. A step points at an
 * element marked data-guide="<name>" (Field and Panel take a guide prop; Tabs mark each tab data-tab="<id>") and either
 * waits for the person to click it or explains it with a Next button. The person does the real work as they go, and
 * the last step says how to stop without saving when they are only practising.
 *
 * Owner decisions 2026-10-30: six guides for the daily work, the person decides at the end whether to save, progress
 * is kept on the server so a head can see who has finished which guide (migration 091), and a screen invites a
 * newcomer the first time it is opened. On 2026-11-01 the owner added four CRM guides: creating a deal, logging an
 * activity with its follow-up, sending a deal for estimating, and recording the quotation and the order. On 2026-11-02
 * the owner asked for guides across the rest of the app and made it a standing rule that every new feature or function
 * updates these guides in the same change (AGENTS.md). A menu screen without a guide needs a reason in NO_GUIDE.
 *
 * Keep the words on buttons the same as the screen's own Thai, English and Japanese labels. tests/guides.test.mjs
 * checks that every step's target is still marked somewhere in the source.
 */

export type GuideCopy = { th: string; en: string; jp: string };

/** The part of the work a guide belongs to. The guide list and the team progress table group the guides by it. */
export type GuideArea = "sales" | "estimate" | "project" | "field" | "purchase" | "tools";
export const GUIDE_AREAS: readonly GuideArea[] = ["sales", "estimate", "project", "field", "purchase", "tools"];

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
  area: GuideArea;
  title: GuideCopy;
  summary: GuideCopy;
  minutes: number;
  /** Every permission the task needs; the guide is offered only to people who hold them all. */
  permissions: readonly string[];
  /** Screens where the guide is listed first. */
  views: readonly string[];
  /** The screen that invites a newcomer to this guide the first time it is opened. */
  invite?: string;
  /** A guide that only shows where things are. Nothing is saved, so its last step may be a note instead of a click. */
  browse?: boolean;
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

const dealsMenu = menu("crm-opportunities",
  { th: "เปิดเมนูโอกาสขาย / ติดตามงานขาย", en: "Open Opportunities / sales follow-up", jp: "「商談・営業フォロー」を開く" },
  { th: "ดีลทุกเรื่องของลูกค้าอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every customer deal lives here. Click the highlighted menu entry.", jp: "顧客の商談はすべてここにあります。強調表示のメニューをクリックします。" });

const openDeal = (body: GuideCopy): GuideStep => ({
  target: "crm.deals", action: "click", clickOn: ".crm-deal-name, .crm-opportunity-card", view: "crm-opportunities",
  title: { th: "เปิดดีล", en: "Open the deal", jp: "商談を開く" },
  body,
  missing: {
    th: "รอให้รายการโหลดสักครู่ ถ้ายังเปิดดีลเรื่องอื่นอยู่ ให้กด 'กลับ' ด้านบนของหน้า",
    en: "Wait a moment for the list to load. If another deal is open, press Back at the top of the page.",
    jp: "一覧の読み込みを少し待ちます。別の商談を開いている場合は、ページ上部の「戻る」を押します。",
  },
});

/* The CRM guides follow a deal from first contact to the order. GUIDES puts them around the delivery guides in the
   order the work happens, so the list and the team table read as one lifecycle. */
const CRM_DEAL_CREATE: Guide = {
  id: "crm-deal-create",
  area: "sales",
  title: { th: "สร้างดีลใหม่ใน CRM", en: "Create a deal in CRM", jp: "CRMで商談を作成" },
  summary: {
    th: "บันทึกโอกาสขายใหม่: ลูกค้า ชื่อดีล ผู้ติดต่อ ผู้รับผิดชอบ วันที่คาดว่าจะปิด และสิ่งที่ต้องทำถัดไป",
    en: "Record a new opportunity: the customer, the deal's name, the contact, the owners, the expected close and the next action.",
    jp: "新しい商談を登録します:顧客、商談名、担当者、責任者、受注予定日、次のアクション。",
  },
  minutes: 3,
  permissions: ["crm.read", "crm.write"],
  views: ["crm-dashboard", "crm-opportunities", "crm-pipeline"],
  invite: "crm-opportunities",
  steps: [
    dealsMenu,
    {
      target: "crm.new", action: "click", view: "crm-opportunities",
      title: { th: "กด 'เพิ่มโอกาสทางการขาย'", en: "Press New opportunity", jp: "「商談を作成」を押す" },
      body: { th: "ปุ่มอยู่มุมขวาบน เปิดฟอร์มดีลใหม่", en: "It is at the top right and opens the new deal form.", jp: "右上にあり、新しい商談のフォームが開きます。" },
      missing: {
        th: "ถ้ากำลังเปิดดีลอยู่ ให้กด 'กลับ' ด้านบนก่อน ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้างดีล",
        en: "If a deal is open, press Back at the top first. If the button never appears, this account cannot create deals.",
        jp: "商談を開いている場合は、先に上部の「戻る」を押します。ボタンが表示されない場合、このアカウントには作成権限がありません。",
      },
    },
    {
      target: "crm.deal.customer", action: "next", view: "crm-opportunities",
      title: { th: "เลือกลูกค้า", en: "Choose the customer", jp: "顧客を選ぶ" },
      body: {
        th: "พิมพ์ชื่อหรือรหัสบริษัทแล้วเลือกจากรายการ ถ้าบริษัทที่ใช้งานจริงเป็นบริษัทอื่น เลือกในช่อง End user ข้างๆ",
        en: "Type the company's name or code and pick it from the list. If another company will use the system, choose it under End user beside it.",
        jp: "会社名またはコードを入力して一覧から選びます。実際に使う会社が別なら、隣のエンドユーザー欄で選びます。",
      },
    },
    {
      target: "crm.deal.name", action: "next", view: "crm-opportunities",
      title: { th: "ตั้งชื่อดีล", en: "Name the deal", jp: "商談名を付ける" },
      body: {
        th: "ใช้ชื่อที่บอกว่าลูกค้าต้องการอะไร เช่น 'ระบบ OEE ไลน์ประกอบ 3' ถ้าลูกค้ามีดีลชื่อคล้ายกันที่ยังเปิดอยู่ จะขึ้นรายการเตือนใต้ช่องนี้ระหว่างพิมพ์",
        en: "Say what the customer wants, e.g. 'OEE system for assembly line 3'. If the customer has an open deal with a similar name, it is listed under the field as you type.",
        jp: "顧客の要望が分かる名前にします(例:「組立ライン3 OEEシステム」)。似た名前の進行中の商談があると、入力中に下に表示されます。",
      },
    },
    {
      target: "crm.deal.contact", action: "next", view: "crm-opportunities",
      title: { th: "ผู้ติดต่อ", en: "The contact", jp: "担当者" },
      body: {
        th: "ค้นหาด้วยชื่อ ตำแหน่ง หรือแผนก ถ้ายังไม่มีในระบบ พิมพ์ชื่อแล้วเลือกแถวสุดท้าย 'เพิ่มผู้ติดต่อใหม่' เพิ่มได้ทันทีโดยไม่ต้องออกจากฟอร์ม",
        en: "Search by name, position or department. Not listed yet? Type the name and pick the last row, Add a new contact, without leaving the form.",
        jp: "氏名・役職・部署で検索します。未登録なら名前を入力し、最後の行「新しい担当者を追加」でフォームのまま追加できます。",
      },
    },
    {
      target: "crm.deal.owner", action: "next", view: "crm-opportunities",
      title: { th: "ผู้รับผิดชอบ", en: "The owners", jp: "責任者" },
      body: {
        th: "ผู้รับผิดชอบงานขายคือคนที่ติดตามลูกค้า ผู้รับผิดชอบเทคนิคคือวิศวกรที่ดูแลเนื้องาน ตอนส่งประเมินราคา ระบบตั้งเขาเป็นผู้ประเมินให้",
        en: "The sales owner follows up the customer; the technical owner is the engineer for the work, and becomes the estimator when the deal is sent for estimating.",
        jp: "営業担当者が顧客をフォローし、技術担当者が技術面を担当します。見積依頼時には技術担当者が見積担当になります。",
      },
    },
    {
      target: "crm.deal.close", action: "next", view: "crm-opportunities",
      title: { th: "วันที่คาดว่าจะปิดงาน", en: "Expected close", jp: "受注予定日" },
      body: {
        th: "วันที่คาดว่าลูกค้าจะตัดสินใจ ใช้เรียงดีลและดูภาพรวมงานขายรายเดือน แก้ได้ทุกเมื่อ",
        en: "When you expect the customer to decide. It orders the deals and the monthly sales view, and can change at any time.",
        jp: "顧客が決定する見込みの日です。商談の並び順や月次の営業状況に使われ、いつでも変更できます。",
      },
    },
    {
      target: "crm.deal.nextAction", action: "next", view: "crm-opportunities",
      title: { th: "สิ่งที่ต้องทำถัดไป", en: "The next action", jp: "次のアクション" },
      body: {
        th: "ใส่สิ่งที่จะทำต่อและกำหนดเสร็จ เช่น 'นัดเข้าพบลูกค้า' ดีลที่ไม่มีสิ่งที่ต้องทำจะขึ้นเตือนในรายการ",
        en: "Enter what happens next and when, e.g. 'Meet the customer'. A deal with no next action is flagged in the list.",
        jp: "次に行うことと期限を入力します(例:「顧客訪問」)。次のアクションがない商談は一覧で警告されます。",
      },
    },
    {
      target: "crm.deal.more", action: "next", view: "crm-opportunities",
      title: { th: "รายละเอียดเพิ่มเติม", en: "Additional details", jp: "詳細情報" },
      body: {
        th: "กดเพื่อเปิด: ที่มาของดีล ความสำคัญ โอกาสได้งาน คู่แข่ง ความต้องการ และขอบเขตงาน ไม่บังคับ ใส่ทีหลังได้",
        en: "Open it for the source, priority, probability, competitor, need and scope. All optional; fill them in later if you like.",
        jp: "開くと商談の出所、優先度、受注確度、競合、要望、範囲を入力できます。任意で、後からでも構いません。",
      },
    },
    {
      target: "crm.save", action: "click", view: "crm-opportunities",
      title: { th: "บันทึกดีล", en: "Save the deal", jp: "商談を保存" },
      body: {
        th: "กด 'บันทึก' ระบบออกเลขดีลแล้วเปิดหน้าดีลให้ ถ้าแค่ฝึก ให้กด 'ยกเลิก' ข้างๆ แล้วกด 'จบบทสอน' จะไม่มีข้อมูลถูกบันทึก",
        en: "Press Save: the deal gets its number and opens. Only practising? Press Cancel beside it, then Finish; nothing is saved.",
        jp: "「保存」を押すと商談番号が付き、商談画面が開きます。練習だけなら横の「キャンセル」を押してから「完了」を押します。何も保存されません。",
      },
    },
  ],
};

const CRM_ACTIVITY: Guide = {
  id: "crm-activity-followup",
  area: "sales",
  title: { th: "บันทึกกิจกรรมกับลูกค้าและนัดติดตาม", en: "Log a customer activity and a follow-up", jp: "顧客との活動とフォローアップを記録" },
  summary: {
    th: "หลังประชุม โทร หรือส่งอีเมลถึงลูกค้า บันทึกสิ่งที่คุยไว้ในดีล และตั้งสิ่งที่ต้องทำต่อพร้อมกำหนดเสร็จ",
    en: "After a meeting, call or email with the customer, record what was said on the deal and set the next action with a due date.",
    jp: "顧客との打合せ・電話・メールの後、内容を商談に記録し、次のアクションと期限を設定します。",
  },
  minutes: 3,
  permissions: ["crm.read", "crm.activity.write"],
  views: ["crm-opportunities", "crm-pipeline", "crm-activities", "crm-dashboard"],
  invite: "crm-activities",
  steps: [
    dealsMenu,
    openDeal({
      th: "คลิกชื่อดีลที่เพิ่งคุยกับลูกค้า ใช้ช่องค้นหาด้านบนช่วยหาได้",
      en: "Click the name of the deal you have just discussed with the customer. The search above helps you find it.",
      jp: "顧客と話したばかりの商談名をクリックします。上の検索で探せます。",
    }),
    {
      target: "crm.followups", action: "next", view: "crm-opportunities",
      title: { th: "สิ่งที่ต้องทำ / ติดตาม", en: "Next actions / Follow-up", jp: "次のアクション・フォローアップ" },
      body: {
        th: "งานติดตามของดีลนี้อยู่ที่นี่ พร้อมผู้รับผิดชอบและกำหนดเสร็จ กด 'แก้ไข' เพื่อปิดงานที่ทำแล้ว ถ้าดีลไม่มีงานค้าง จะขึ้นเตือนสีเหลือง",
        en: "The deal's follow-ups are here with their owners and due dates. Press Edit to close one that is done. A deal with nothing open shows an amber warning.",
        jp: "この商談のフォローアップが担当者・期限とともに表示されます。完了したものは「編集」で閉じます。未完了がない場合は黄色の警告が出ます。",
      },
    },
    {
      target: "crm.tab.activities", action: "click", view: "crm-opportunities",
      title: { th: "แท็บกิจกรรม", en: "The Activities tab", jp: "「活動」タブ" },
      body: {
        th: "รวมทุกครั้งที่คุยกับลูกค้าของดีลนี้ เรียงจากล่าสุด คลิกแท็บนี้",
        en: "Every contact with the customer on this deal, latest first. Click this tab.",
        jp: "この商談での顧客とのやり取りが新しい順に並びます。このタブをクリックします。",
      },
    },
    {
      target: "crm.addActivity", action: "click", view: "crm-opportunities",
      title: { th: "กด 'บันทึกกิจกรรม'", en: "Press Log activity", jp: "「活動を記録」を押す" },
      body: {
        th: "เปิดฟอร์มบันทึก ลูกค้าและดีลถูกใส่ไว้ให้แล้ว",
        en: "It opens the form with the customer and the deal already filled in.",
        jp: "顧客と商談が入力済みのフォームが開きます。",
      },
      missing: {
        th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์บันทึกกิจกรรม",
        en: "If the button never appears, this account cannot log activities.",
        jp: "ボタンが表示されない場合、このアカウントには記録権限がありません。",
      },
    },
    {
      target: "crm.activity.type", action: "next", view: "crm-opportunities",
      title: { th: "ประเภทและเวลา", en: "Type and time", jp: "種別と日時" },
      body: {
        th: "เลือกว่าเป็นการประชุม โทร อีเมล เข้าหน้างาน หรืออื่นๆ และแก้วันที่ / เวลาให้ตรงกับที่เกิดขึ้นจริง",
        en: "Choose meeting, call, email, site visit or another type, and set the date and time it really happened.",
        jp: "打合せ・電話・メール・現地訪問などの種別を選び、実際の日時に合わせます。",
      },
    },
    {
      target: "crm.activity.summary", action: "next", view: "crm-opportunities",
      title: { th: "สรุปสิ่งที่คุย", en: "What was discussed", jp: "話した内容" },
      body: {
        th: "สรุปสั้นๆ ว่าคุยอะไร ช่องด้านล่างใส่ข้อสรุปสำคัญและรายการที่ต้องทำ คนอื่นในทีมจะเห็นต่อจากคุณได้ทันที",
        en: "A short summary of the conversation; the fields below take the key decision and the action items. The team picks up from it at once.",
        jp: "話した内容を短くまとめます。下の欄に主な決定と対応事項を書きます。チームはすぐに内容を引き継げます。",
      },
    },
    {
      target: "crm.activity.next", action: "next", view: "crm-opportunities",
      title: { th: "เพิ่มสิ่งที่ต้องทำ", en: "Add the next action", jp: "次のアクションを追加" },
      body: {
        th: "กดเพื่อเปิด แล้วใส่สิ่งที่ต้องทำต่อ ผู้รับผิดชอบ และกำหนดเสร็จ จะไปขึ้นในส่วน 'สิ่งที่ต้องทำ / ติดตาม' ของดีลและแจ้งเตือนเมื่อใกล้ครบกำหนด",
        en: "Open it and enter what happens next, who does it and by when. It joins the deal's follow-ups and is flagged as it falls due.",
        jp: "開いて次に行うこと、担当者、期限を入力します。商談のフォローアップに追加され、期限が近づくと警告されます。",
      },
    },
    {
      target: "crm.save", action: "click", view: "crm-opportunities",
      title: { th: "บันทึกกิจกรรม", en: "Save the activity", jp: "活動を保存" },
      body: {
        th: "กด 'บันทึก' กิจกรรมจะขึ้นในแท็บนี้และในเมนูกิจกรรมลูกค้า ถ้าแค่ฝึก ให้กด 'ยกเลิก' ข้างๆ แล้วกด 'จบบทสอน'",
        en: "Press Save; the activity shows on this tab and under Activities. Only practising? Press Cancel beside it, then Finish.",
        jp: "「保存」を押すと、このタブと「顧客活動」に表示されます。練習だけなら横の「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const CRM_SEND_ESTIMATE: Guide = {
  id: "crm-send-estimate",
  area: "sales",
  title: { th: "ส่งดีลไปประเมินราคา (สร้าง Inquiry)", en: "Send a deal for estimating (create the inquiry)", jp: "商談を見積依頼する(引合を作成)" },
  summary: {
    th: "เมื่อได้ RFQ หรือความต้องการจากลูกค้าแล้ว สร้าง Inquiry จากดีล เลือกวิศวกรผู้ประเมินและกำหนดส่ง ข้อมูลและไฟล์ของดีลจะตามไปเอง",
    en: "Once the customer's RFQ or requirements are in, create the inquiry from the deal and choose the estimating engineer and due date; the deal's details and files carry across.",
    jp: "顧客のRFQや要望が揃ったら商談から引合を作り、見積担当と期限を選びます。商談の情報とファイルは引き継がれます。",
  },
  minutes: 2,
  permissions: ["crm.read", "crm.convert"],
  views: ["crm-opportunities", "crm-pipeline", "crm-dashboard"],
  steps: [
    dealsMenu,
    openDeal({
      th: "คลิกชื่อดีลที่ลูกค้าส่ง RFQ มาแล้ว",
      en: "Click the name of the deal whose RFQ has arrived.",
      jp: "RFQが届いた商談名をクリックします。",
    }),
    {
      target: "crm.convert", action: "click", view: "crm-opportunities",
      title: { th: "กด 'ส่งประเมินราคา / สร้าง Inquiry'", en: "Press Send for estimating / create Inquiry", jp: "「見積依頼・Inquiry作成」を押す" },
      body: {
        th: "ปุ่มอยู่ด้านบนของดีล ถ้าเคยส่งไปแล้วและงานนั้นจบแล้ว ปุ่มจะเป็น 'สร้างงานประเมินเพิ่มเติม'",
        en: "It is at the top of the deal. If an earlier estimate has finished, it reads Create additional estimating work.",
        jp: "商談の上部にあります。以前の見積が終わっている場合は「追加の見積作業を作成」と表示されます。",
      },
      missing: {
        th: "ถ้าดีลมี Inquiry ที่ยังเปิดอยู่ จะเห็น 'เปิดงานประเมิน (Inquiry)' แทน ดีลที่ชนะ แพ้ หรือพักไว้ส่งไม่ได้ กด 'ข้ามขั้นนี้' หรือเลือกดีลอื่น",
        en: "A deal with an open inquiry shows Open estimating work instead, and a won, lost or on-hold deal cannot be sent. Skip this step or choose another deal.",
        jp: "進行中の引合がある商談には「見積作業(Inquiry)を開く」が表示され、受注・失注・保留の商談は送れません。この手順を飛ばすか、別の商談を選びます。",
      },
    },
    {
      target: "crm.convert.owner", action: "next", view: "crm-opportunities",
      title: { th: "วิศวกรผู้ประเมิน", en: "The estimating engineer", jp: "見積担当のエンジニア" },
      body: {
        th: "คนที่จะทำราคา ระบบใส่ผู้รับผิดชอบเทคนิคของดีลไว้ให้ เปลี่ยนได้ เขาจะได้รับอีเมลแจ้งงานและเห็นงานใน 'งานของฉัน'",
        en: "Who will price it. The deal's technical owner is filled in and can be changed; they are emailed and see it in My Work.",
        jp: "見積を行う人です。商談の技術担当者が入力済みで、変更できます。メールで通知され、マイワークに表示されます。",
      },
    },
    {
      target: "crm.convert.due", action: "next", view: "crm-opportunities",
      title: { th: "กำหนดส่งราคา", en: "Estimate due date", jp: "見積期限" },
      body: {
        th: "วันที่ต้องได้ราคาเพื่อตอบลูกค้า ค่าเริ่มต้นคืออีก 14 วัน",
        en: "When the price is needed to answer the customer. It starts 14 days ahead.",
        jp: "顧客へ回答するために価格が必要な日です。初期値は14日後です。",
      },
    },
    {
      target: "crm.convert.type", action: "next", view: "crm-opportunities",
      title: { th: "ประเภทโครงการ", en: "Project type", jp: "案件種別" },
      body: {
        th: "เลือกประเภทงาน เช่น IoT, Automation หรือ Robot ใช้จัดกลุ่มงานประเมินและรายงาน",
        en: "Choose the kind of work, such as IoT, Automation or Robot. It groups the estimating work and the reports.",
        jp: "IoT・Automation・Robotなど作業の種類を選びます。見積作業とレポートの分類に使われます。",
      },
    },
    {
      target: "crm.convert.carry", action: "next", view: "crm-opportunities",
      title: { th: "ข้อมูลที่ตามไป", en: "What carries across", jp: "引き継がれる情報" },
      body: {
        th: "ลูกค้า ผู้ติดต่อ ความต้องการ ขอบเขตงาน และไฟล์ของดีลจะไปอยู่ใน Inquiry เอง ไม่ต้องกรอกซ้ำ",
        en: "The customer, contact, need, scope and the deal's files go to the inquiry by themselves; nothing is typed twice.",
        jp: "顧客、担当者、要望、範囲、商談のファイルは引合に自動で引き継がれます。二重入力は不要です。",
      },
    },
    {
      target: "crm.save", action: "click", view: "crm-opportunities",
      title: { th: "สร้าง Inquiry", en: "Create the inquiry", jp: "引合を作成" },
      body: {
        th: "กด 'บันทึก' ระบบสร้าง Inquiry แจ้งวิศวกรทางอีเมล แล้วเปิด Inquiry ให้ ติดตามราคาได้ที่แท็บ Inquiry / Estimate / Project ของดีล ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Save: the inquiry is created, the engineer is emailed and the inquiry opens. Follow the price on the deal's Inquiry / Estimate / Project tab. Only practising? Press Cancel, then Finish.",
        jp: "「保存」を押すと引合が作成され、エンジニアにメールが届き、引合が開きます。見積の進捗は商談の「引合・見積・案件」タブで確認できます。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const CRM_PROPOSAL_WON: Guide = {
  id: "crm-proposal-won",
  area: "sales",
  title: { th: "บันทึกส่งใบเสนอราคาและลูกค้ายืนยันสั่งซื้อ", en: "Record the quotation and the order", jp: "見積送付と受注を記録" },
  summary: {
    th: "เมื่อส่งใบเสนอราคาแล้ว บันทึกวันที่และเลขเอกสาร และเมื่อลูกค้าส่ง PO บันทึกการได้งาน ดีลจะเลื่อนขั้นให้เอง",
    en: "Once the quotation is sent, record its date and number; when the customer's PO arrives, record the order. The deal moves on by itself.",
    jp: "見積を送ったら日付と番号を、顧客の注文書が届いたら受注を記録します。商談のステージは自動で進みます。",
  },
  minutes: 3,
  permissions: ["crm.read", "crm.write"],
  views: ["crm-opportunities", "crm-pipeline", "crm-dashboard"],
  steps: [
    dealsMenu,
    openDeal({
      th: "คลิกชื่อดีลที่ส่งใบเสนอราคาไปแล้ว",
      en: "Click the name of the deal you have sent a quotation for.",
      jp: "見積を送った商談名をクリックします。",
    }),
    {
      target: "crm.stagebar", action: "next", view: "crm-opportunities",
      title: { th: "ดีลอยู่ขั้นไหน", en: "Where the deal stands", jp: "商談のステージ" },
      body: {
        th: "แถบนี้บอกขั้นของดีล ตั้งแต่ใหม่จนชนะ การบันทึกในขั้นถัดไปจะเลื่อนดีลไปขั้นเสนอราคาและขั้นชนะให้เอง",
        en: "This bar shows the deal's stage from new to won. The next two records move it to the quotation stage and to won for you.",
        jp: "このバーは新規から受注までの商談ステージを示します。次の2つの記録で、見積と受注のステージへ自動で進みます。",
      },
    },
    {
      target: "crm.recordProposal", action: "click", view: "crm-opportunities",
      title: { th: "กด 'บันทึกส่งใบเสนอราคา'", en: "Press Record quotation dispatch", jp: "「見積送付を記録」を押す" },
      body: {
        th: "ทำเมื่อส่งใบเสนอราคาให้ลูกค้าแล้วจริง การอนุมัติต้นทุนใน Estimate ไม่ได้นับว่าส่งใบเสนอราคา",
        en: "Do this once the quotation has really gone to the customer. Approving the estimate's cost does not count as sending it.",
        jp: "見積を実際に顧客へ送った後に行います。見積の原価承認は送付とはみなされません。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นเมื่อดีลยังไม่ปิด (ไม่ใช่ชนะ แพ้ หรือพักไว้) และบัญชีนี้แก้ดีลได้",
        en: "The button shows while the deal is still open (not won, lost or on hold) and this account may edit deals.",
        jp: "商談が進行中(受注・失注・保留以外)で、このアカウントに編集権限がある場合に表示されます。",
      },
    },
    {
      target: "crm.evidence", action: "next", view: "crm-opportunities",
      title: { th: "วันที่และเลขใบเสนอราคา", en: "Quotation date and number", jp: "見積の日付と番号" },
      body: {
        th: "ใส่วันที่ส่งจริงและเลขใบเสนอราคาหรือหลักฐานการส่ง ต้องมีทั้งสองช่อง ทีมใช้ข้อมูลนี้นับยอดเสนอราคา",
        en: "Enter the real sending date and the quotation number or dispatch reference. Both are required; the team counts quotations from them.",
        jp: "実際の送付日と見積番号または送付記録を入力します。両方必須で、見積実績の集計に使われます。",
      },
    },
    {
      target: "crm.save", action: "click", view: "crm-opportunities",
      title: { th: "บันทึกการส่งใบเสนอราคา", en: "Save the quotation", jp: "見積送付を保存" },
      body: {
        th: "กด 'บันทึก' ดีลจะเลื่อนไปขั้นเสนอราคา ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วไปขั้นถัดไป",
        en: "Press Save and the deal moves to the quotation stage. Only practising? Press Cancel and carry on.",
        jp: "「保存」を押すと商談が見積ステージへ進みます。練習だけなら「キャンセル」を押して次へ進みます。",
      },
    },
    {
      target: "crm.recordWon", action: "click", view: "crm-opportunities",
      title: { th: "กด 'บันทึกลูกค้ายืนยันสั่งซื้อ'", en: "Press Record order confirmation", jp: "「受注確認を記録」を押す" },
      body: {
        th: "ทำเมื่อลูกค้าส่ง PO หรือยืนยันสั่งซื้อเป็นลายลักษณ์อักษร ถ้าสร้างโครงการจาก Inquiry พร้อมเลข PO ไปแล้ว ระบบบันทึกส่วนนี้ให้เอง",
        en: "Do this when the customer's PO or written confirmation arrives. If the project was already created from the inquiry with its PO number, this is recorded for you.",
        jp: "顧客の注文書または書面の確認が届いたら行います。引合から注文書番号付きで案件を作成済みなら、自動で記録されています。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นเมื่อดีลยังไม่ปิด ถ้าดีลชนะแล้ว วันที่และเลข PO จะแสดงอยู่ด้านบนของดีล",
        en: "The button shows while the deal is open. Once it is won, the date and PO number show at the top of the deal.",
        jp: "商談が進行中の場合に表示されます。受注済みなら、日付と注文書番号が商談上部に表示されます。",
      },
    },
    {
      target: "crm.evidence", action: "next", view: "crm-opportunities",
      title: { th: "วันที่และเลข PO", en: "Order date and PO number", jp: "受注日と注文書番号" },
      body: {
        th: "ใส่วันที่ลูกค้ายืนยันสั่งซื้อ และเลข PO หรือหลักฐานที่ลูกค้ายืนยัน",
        en: "Enter the date the customer confirmed the order and the PO number or confirmation reference.",
        jp: "顧客が注文を確定した日と、注文書番号または確認記録を入力します。",
      },
    },
    {
      target: "crm.save", action: "click", view: "crm-opportunities",
      title: { th: "บันทึกการได้งาน", en: "Save the order", jp: "受注を保存" },
      body: {
        th: "กด 'บันทึก' ดีลจะเป็นชนะ ขั้นต่อไปคือส่งมอบงานให้ทีมโครงการจาก Inquiry ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Save and the deal is won; the next step is handing the work to the project team from the inquiry. Only practising? Press Cancel, then Finish.",
        jp: "「保存」を押すと商談が受注になります。次は引合から案件チームへ引き渡します。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

/* Approving an estimate sends it to Pegasus ERP as a Cost Sheet, written from the rows of the ERP summary sheet
   (2026-11-02). The approver learns where to check the sheet first and where the Cost Sheet number appears afterwards. */
const ESTIMATE_APPROVE: Guide = {
  id: "estimate-approve",
  area: "estimate",
  title: { th: "อนุมัติ Estimate และส่งเข้า ERP", en: "Approve an estimate and send it to the ERP", jp: "見積を承認してERPへ送る" },
  summary: {
    th: "เปิด Estimate ที่รอตรวจ ดูหน้าสรุป ERP แล้วกดอนุมัติ ระบบส่งแถวในหน้าสรุปเข้า Pegasus ERP เป็น Cost Sheet ให้เอง",
    en: "Open an estimate waiting for review, check its ERP summary and approve it; the summary rows go to Pegasus ERP as a Cost Sheet by themselves.",
    jp: "レビュー待ちの見積を開き、ERPサマリーを確認して承認します。サマリーの行がCost SheetとしてPegasus ERPへ自動送信されます。",
  },
  minutes: 3,
  permissions: ["estimate.read", "estimate.approve"],
  views: ["estimates"],
  steps: [
    menu("estimates",
      { th: "เปิดเมนู Estimate Cost", en: "Open Estimate Cost", jp: "「Estimate Cost」を開く" },
      { th: "Estimate ทุกใบอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every estimate is here. Click the highlighted menu entry.", jp: "すべての見積はここにあります。強調表示されたメニューをクリックします。" }),
    {
      target: "estimate.list", action: "click", clickOn: "tbody tr", view: "estimates",
      title: { th: "เปิด Estimate ที่รอตรวจ", en: "Open an estimate waiting for review", jp: "レビュー待ちの見積を開く" },
      body: {
        th: "เลือกแถบสถานะรอตรวจ แล้วคลิก Estimate ที่จะอนุมัติ",
        en: "Pick the status tab for estimates in review, then click the one to approve.",
        jp: "レビュー中のステータスタブを選び、承認する見積をクリックします。",
      },
      missing: {
        th: "รอให้รายการโหลดสักครู่ ถ้ายังเปิด Estimate อื่นอยู่ ให้กดย้อนกลับด้านบนของหน้า",
        en: "Wait a moment for the list to load. If another estimate is open, go back at the top of the page.",
        jp: "一覧の読み込みを少し待ちます。別の見積を開いている場合は、ページ上部から戻ります。",
      },
    },
    {
      target: "[data-tab=\"summary\"]", action: "click", view: "estimates",
      title: { th: "ดูหน้าสรุป", en: "Open the cost summary", jp: "原価サマリーを開く" },
      body: {
        th: "หน้าสรุป ERP คือสิ่งที่ส่งเข้า ERP หนึ่งแถวต่อหนึ่งโมดูลหรือบรรทัดที่รวมไว้ ตรวจหมวดและยอดก่อนอนุมัติ",
        en: "The ERP summary is what goes to the ERP: one row per module or merged line. Check the headings and amounts before approving.",
        jp: "ERPサマリーがERPへ送られる内容です(モジュールまたはまとめた行ごとに1行)。承認前に分類と金額を確認します。",
      },
    },
    {
      target: "estimate.approve", action: "click", view: "estimates",
      title: { th: "อนุมัติ", en: "Approve", jp: "承認" },
      body: {
        th: "กด 'อนุมัติ' แล้วยืนยัน Estimate จะถูกล็อก และส่งเข้า Pegasus ERP ด้วยบัญชี TMT ID ของคุณทันที ถ้าแค่ฝึก ให้กดยกเลิกในหน้ายืนยัน แล้วกด 'เสร็จ'",
        en: "Press Approve and confirm: the estimate is locked and sent to Pegasus ERP with your TMT ID sign-in. Only practising? Press Cancel in the confirmation, then Finish.",
        jp: "「承認」を押して確定すると見積がロックされ、あなたのTMT IDでPegasus ERPへ送られます。練習だけなら確認画面で「キャンセル」を押し、「完了」を押します。",
      },
      missing: {
        th: "ปุ่มอนุมัติจะขึ้นเมื่อ Estimate รอตรวจ และคุณไม่ใช่เจ้าของ Estimate นั้น",
        en: "The Approve button appears while the estimate is in review, for someone other than its owner.",
        jp: "承認ボタンは見積がレビュー中で、担当者以外の方に表示されます。",
      },
    },
    {
      target: "estimate.erp", action: "next", view: "estimates",
      title: { th: "Cost Sheet ใน ERP", en: "The Cost Sheet in the ERP", jp: "ERPのCost Sheet" },
      body: {
        th: "แถบ Pegasus ERP แสดงเลข Cost Sheet ถ้าส่งไม่สำเร็จจะบอกเหตุผล และมีปุ่ม 'ส่งเข้า ERP' 'ส่งใหม่' ใช้หลังลบ Cost Sheet ใน ERP แล้วเท่านั้น",
        en: "The Pegasus ERP strip shows the Cost Sheet number. When a send fails it says why and offers Send to the ERP; Send again is only for after the Cost Sheet was deleted in the ERP.",
        jp: "Pegasus ERPの帯にCost Sheet番号が表示されます。送信に失敗すると理由と「ERPへ送信」が出ます。「再送信」はERPでCost Sheetを削除した後だけ使います。",
      },
    },
    {
      target: "[data-tab=\"summary\"]", action: "click", view: "estimates",
      title: { th: "เสร็จแล้ว", en: "Done", jp: "完了" },
      body: {
        th: "คลิกแท็บสรุปเพื่อจบคู่มือ เปิดดูสถานะใน ERP ได้ทุกเมื่อที่แถบนี้",
        en: "Click the summary tab to finish. The strip shows the ERP status whenever you come back.",
        jp: "サマリータブをクリックして終了します。この帯でいつでもERPの状態を確認できます。",
      },
    },
  ],
};

/* Guides for the rest of the app (owner request 2026-11-02): estimating sources, projects and plans, work on site,
   reports and signing, BOM and approvals, and the knowledge and tool screens. */
const SUPPLIER_QUOTATION: Guide = {
  id: "supplier-quotation",
  area: "estimate",
  title: { th: "อัปโหลดใบเสนอราคาจากผู้ขาย", en: "Upload a supplier quotation", jp: "仕入先の見積書をアップロード" },
  summary: {
    th: "อัปโหลด PDF ใบเสนอราคา ระบบอ่านรายการให้ ตรวจ แล้วผูกกับ Inquiry เพื่อใช้ราคาใน Estimate และคลังราคา",
    en: "Upload the quotation PDF, let the app read its lines, check them and link the inquiry, so the prices reach the estimate and the Price Library.",
    jp: "見積書PDFをアップロードすると明細が読み取られます。確認して引合と関連付けると、見積と価格ライブラリで使えます。",
  },
  minutes: 3,
  permissions: ["estimate.read", "estimate.write"],
  views: ["quotations", "estimates"],
  invite: "quotations",
  steps: [
    menu("quotations",
      { th: "เปิดเมนูใบเสนอราคาผู้ขาย", en: "Open Supplier Quotation", jp: "「仕入先見積」を開く" },
      { th: "ใบเสนอราคาจากผู้ขายทุกใบเก็บที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every supplier quotation is kept here. Click the highlighted menu entry.", jp: "仕入先の見積書はすべてここに保管されます。強調表示のメニューをクリックします。" }),
    {
      target: "quote.upload", action: "click", view: "quotations",
      title: { th: "กด 'อัปโหลดใบเสนอราคา'", en: "Press Upload quotation", jp: "「見積書をアップロード」を押す" },
      body: { th: "เปิดหน้าต่างอัปโหลด ไฟล์ PDF อยู่ด้านขวา ข้อมูลอยู่ด้านซ้าย", en: "It opens the upload window: the PDF on the right, the details on the left.", jp: "アップロード画面が開きます。右にPDF、左に入力欄があります。" },
      missing: { th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์อัปโหลดใบเสนอราคา", en: "If the button never appears, this account cannot upload quotations.", jp: "ボタンが表示されない場合、このアカウントにはアップロード権限がありません。" },
    },
    {
      target: "quote.file", action: "next", view: "quotations",
      title: { th: "เลือกไฟล์", en: "Choose the file", jp: "ファイルを選ぶ" },
      body: {
        th: "เลือก PDF แล้วระบบจะอ่านผู้ขาย วันที่ ยอดรวม และรายการให้เอง ช่องที่ขึ้นสีเหลืองหรือแดงให้ตรวจกับ PDF ด้านขวา รับ Excel, CSV และรูปด้วย",
        en: "Pick the PDF and the app reads the supplier, dates, total and lines. Check any field marked amber or red against the PDF on the right. Excel, CSV and images are accepted too.",
        jp: "PDFを選ぶと仕入先・日付・合計・明細が読み取られます。黄色や赤の欄は右のPDFと照合します。Excel・CSV・画像も使えます。",
      },
    },
    {
      target: "quote.supplier", action: "next", view: "quotations",
      title: { th: "ผู้ขายและเลขที่ใบเสนอราคา", en: "Supplier and reference", jp: "仕入先と見積番号" },
      body: {
        th: "ตรวจชื่อผู้ขาย และเลขที่ใบเสนอราคาของผู้ขาย ใช้ค้นหาใบนี้ภายหลัง",
        en: "Check the supplier and the supplier's own quotation number; it is how this one is found later.",
        jp: "仕入先と仕入先の見積番号を確認します。後で検索するときに使います。",
      },
    },
    {
      target: "quote.inquiry", action: "next", view: "quotations",
      title: { th: "Inquiry ที่เกี่ยวข้อง", en: "Related inquiry", jp: "関連する引合" },
      body: {
        th: "เลือก Inquiry ที่ขอราคานี้ ใบเสนอราคาจะขึ้นในแท็บเพิ่มรายการของ Estimate ของงานนั้น ดึงหลายรายการเข้า Estimate ได้ในครั้งเดียว",
        en: "Choose the inquiry this price was asked for. The quotation then shows in that estimate's Add items tab, where many lines go in at once.",
        jp: "この価格を依頼した引合を選びます。その見積の明細追加タブに表示され、複数行をまとめて取り込めます。",
      },
    },
    {
      target: "quote.lines", action: "next", view: "quotations",
      title: { th: "รายการและราคา", en: "Lines and prices", jp: "明細と価格" },
      body: {
        th: "ตรวจรายการ จำนวน และราคาต่อหน่วย คลังราคาได้ราคาจากรายการเหล่านี้ ถ้าเป็นเงินเยน ดอลลาร์ หรือยูโร ใส่อัตราแลกเป็นบาทด้วย",
        en: "Check each line, quantity and unit price; the Price Library takes its prices from these lines. For JPY, USD or EUR, enter the THB rate too.",
        jp: "明細・数量・単価を確認します。価格ライブラリはこの明細から価格を取ります。円・ドル・ユーロの場合はバーツ換算レートも入力します。",
      },
    },
    {
      target: "quote.save", action: "click", view: "quotations",
      title: { th: "อัปโหลด", en: "Upload it", jp: "アップロード" },
      body: {
        th: "กด 'อัปโหลดใบเสนอราคา' ระบบออกเลขและเก็บไฟล์ไว้ ถ้าแค่ฝึก ให้กด 'ยกเลิก' ข้างๆ แล้วกด 'จบบทสอน'",
        en: "Press Upload quotation: it gets a number and the file is stored. Only practising? Press Cancel beside it, then Finish.",
        jp: "「見積書をアップロード」を押すと番号が付き、ファイルが保管されます。練習だけなら横の「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const PRICE_LIBRARY: Guide = {
  id: "price-library",
  area: "estimate",
  title: { th: "ค้นราคาในคลังราคา", en: "Find a price in the Price Library", jp: "価格ライブラリで価格を探す" },
  summary: {
    th: "ค้นราคาที่เคยใช้ใน Estimate และราคาซื้อจริง ดูที่มาของแต่ละราคา และเพิ่มราคาจากลิงก์ภายนอก",
    en: "Search the prices used in estimates and actually paid, see where each came from, and add a price from an outside link.",
    jp: "見積で使った価格や実際の購入価格を検索し、出所を確認し、外部リンクから価格を追加します。",
  },
  minutes: 2,
  permissions: ["estimate.read"],
  views: ["price", "estimates"],
  invite: "price",
  steps: [
    menu("price",
      { th: "เปิดเมนูคลังราคา", en: "Open Price Library", jp: "「価格ライブラリ」を開く" },
      { th: "ราคาจาก Estimate และราคาซื้อจริงรวมอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Prices from estimates and from real purchases are gathered here. Click the highlighted menu entry.", jp: "見積と実購入の価格がここに集まっています。強調表示のメニューをクリックします。" }),
    {
      target: "price.search", action: "next", view: "price",
      title: { th: "ค้นหา", en: "Search", jp: "検索" },
      body: { th: "พิมพ์ชื่อสินค้า ยี่ห้อ รุ่น ผู้ขาย โปรเจกต์ หรือเลขอ้างอิง", en: "Type the item, brand, model, supplier, project or a reference.", jp: "品名・ブランド・型式・仕入先・案件・参照番号を入力します。" },
    },
    {
      target: "price.list", action: "next", view: "price",
      title: { th: "ราคาและที่มา", en: "Prices and their source", jp: "価格と出所" },
      body: {
        th: "แต่ละแถวบอกว่าราคามาจาก Estimate ไหน หรือจาก PR/PO ที่ซื้อจริง ราคาซื้อจริงเชื่อถือได้มากกว่าราคาประมาณ",
        en: "Each row says which estimate or which real PR/PO the price came from. A price actually paid is worth more than an estimated one.",
        jp: "各行に、どの見積または実際のPR/POの価格かが表示されます。実購入価格は見積価格より信頼できます。",
      },
    },
    {
      target: "price.add", action: "click", view: "price",
      title: { th: "เพิ่มราคา", en: "Add a price", jp: "価格を追加" },
      body: {
        th: "ถ้ามีราคาจากเว็บไซต์หรือเอกสารภายนอก กด 'เพิ่มราคา' แล้วใส่ลิงก์ที่มา ถ้าแค่ค้นราคา กด 'จบบทสอน'",
        en: "For a price from a website or an outside document, press Add price and give the link. Only looking? Press Finish.",
        jp: "Webサイトや外部文書の価格は「価格を追加」でリンクとともに登録します。検索だけなら「完了」を押します。",
      },
      missing: { th: "ปุ่มนี้ขึ้นสำหรับคนที่แก้ Estimate ได้ กด 'จบบทสอน' ได้เลย", en: "The button shows for people who may edit estimates. Press Finish.", jp: "見積を編集できる人に表示されます。「完了」を押します。" },
    },
  ],
};

const PROJECT_CREATE: Guide = {
  id: "project-create",
  area: "project",
  title: { th: "สร้างโปรเจกต์เมื่อได้ PO", en: "Create a project once the PO arrives", jp: "注文書受領後に案件を作成" },
  summary: {
    th: "เปิดโปรเจกต์จาก Estimate ที่อนุมัติแล้ว ใส่เลข ERP ผู้จัดการ เลข PO หัวข้อหลัก (Master Plan) และงานของทีมใต้หัวข้อ (Team Plan)",
    en: "Open the project from the approved estimate with its ERP number, manager, PO, its main headings (Master Plan) and the team's tasks under them (Team Plan).",
    jp: "承認済み見積から案件を作成し、ERP番号・PM・注文書・大見出し（マスタープラン）とその下のチームのタスク（チームプラン）を入力します。",
  },
  minutes: 5,
  permissions: ["project.read", "project.write"],
  views: ["projects"],
  invite: "projects",
  steps: [
    menu("projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "งานที่ได้ PO แล้วอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Work with a customer PO lives here. Click the highlighted menu entry.", jp: "注文書を受けた案件はここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "project.create", action: "click", view: "projects",
      title: { th: "กด 'สร้างโปรเจกต์'", en: "Press Create project", jp: "「プロジェクトを作成」を押す" },
      body: { th: "ปุ่มอยู่มุมขวาบนของหน้าโปรเจกต์", en: "It is at the top right of Projects.", jp: "プロジェクト画面の右上にあります。" },
      missing: { th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้างโปรเจกต์", en: "If the button never appears, this account cannot create projects.", jp: "ボタンが表示されない場合、このアカウントには作成権限がありません。" },
    },
    {
      target: "project.source", action: "next", view: "projects",
      title: { th: "สร้างจากอะไร", en: "Where it comes from", jp: "作成元" },
      body: {
        th: "ปกติสร้างจาก Estimate ที่อนุมัติแล้ว งานที่ไม่มี Estimate เช่นงานบริการ เลือก 'ไม่มี Estimate'",
        en: "Usually from an approved estimate. For work without one, such as a service job, choose Without an estimate.",
        jp: "通常は承認済み見積から作成します。サービス案件など見積がない場合は「見積なし」を選びます。",
      },
      missing: { th: "บัญชีนี้สร้างจาก Estimate ที่อนุมัติแล้วเท่านั้น กด 'ถัดไป'", en: "This account creates projects from approved estimates only. Press Next.", jp: "このアカウントは承認済み見積からのみ作成できます。「次へ」を押します。" },
    },
    {
      target: "project.from", action: "next", view: "projects",
      title: { th: "Estimate หรือลูกค้า", en: "The estimate or the customer", jp: "見積または顧客" },
      body: {
        th: "เลือก Estimate ที่อนุมัติแล้ว ลูกค้า ชื่องาน และวิศวกรจะมาให้เอง ถ้าไม่มี Estimate ให้ค้นหาลูกค้าและพิมพ์ชื่อโปรเจกต์",
        en: "Pick the approved estimate and the customer, name and engineer come with it. Without an estimate, search the customer and type the project name.",
        jp: "承認済み見積を選ぶと顧客・案件名・技術者が入ります。見積がない場合は顧客を検索して案件名を入力します。",
      },
    },
    {
      target: "project.number", action: "next", view: "projects",
      title: { th: "เลขโปรเจกต์จาก ERP", en: "Project number from the ERP", jp: "ERPの案件番号" },
      body: { th: "ใส่เลขโปรเจกต์ที่เปิดไว้ใน ERP เพื่อให้ PR และค่าใช้จ่ายตรงกับงานใน ERP", en: "Enter the project number opened in the ERP, so PRs and costs match the ERP job.", jp: "ERPで登録した案件番号を入力します。PRや費用がERPの案件と一致します。" },
    },
    {
      target: "project.people", action: "next", view: "projects",
      title: { th: "ผู้จัดการและวิศวกรหลัก", en: "Manager and lead engineer", jp: "PMと主任技術者" },
      body: { th: "เลือกผู้จัดการโปรเจกต์และวิศวกรหลัก ทั้งสองคนได้อีเมลแจ้งเมื่อสร้างโปรเจกต์", en: "Choose the project manager and the lead engineer; both are emailed when the project is created.", jp: "PMと主任技術者を選びます。作成時に両者へメールが届きます。" },
    },
    {
      target: "project.po", action: "next", view: "projects",
      title: { th: "เลขที่ใบสั่งซื้อลูกค้า", en: "Customer PO", jp: "客先注文書" },
      body: {
        th: "ใส่เลข PO และวันที่ PO ถ้างานนี้มาจากดีลใน CRM ระบบบันทึกดีลเป็นชนะงานให้เอง",
        en: "Enter the PO number and date. If the work came from a CRM deal, the deal is recorded as won for you.",
        jp: "注文書番号と日付を入力します。CRMの商談から来た案件なら、商談は自動で受注になります。",
      },
    },
    {
      target: "project.plan", action: "next", view: "projects",
      title: { th: "Master Plan: หัวข้อหลัก", en: "Master Plan: the main headings", jp: "マスタープラン：大見出し" },
      body: {
        th: "ใส่หัวข้อหลักของแผนพร้อมวันที่ตกลงกับลูกค้า เช่น 1 Kick-off, 2 Software development หรือเลือก Master Schedule เป็นต้นแบบ ลูกค้าเห็นเฉพาะส่วนนี้ วันเริ่มและวันส่งมอบของโปรเจกต์คิดจากแผน",
        en: "Enter the plan's main headings with the dates agreed with the customer, such as 1 Kick-off and 2 Software development, or start from a Master Schedule. The customer sees only this part; the project's start and delivery come from the plan.",
        jp: "計画の大見出しを顧客と合意した日程とともに入力します（例：1 Kick-off、2 Software development）。マスタースケジュールから始めることもできます。顧客にはこの部分だけが表示され、案件の開始日と納期は計画から決まります。",
      },
    },
    {
      target: "project.team", action: "next", view: "projects",
      title: { th: "Team Plan: แตกหัวข้อเป็นงานและฟังก์ชัน", en: "Team Plan: tasks and functions under each heading", jp: "チームプラン：見出しをタスクと機能に分ける" },
      body: {
        th: "ใต้แต่ละหัวข้อหลัก กด 'เพิ่มงาน' แล้วใส่ชื่องาน ผู้รับผิดชอบ (ต้องมี) วันที่ และ man-days เช่น 2.1 Web App WMS จากนั้นกด + ที่แถวงานเพื่อเพิ่มฟังก์ชันที่ต้องทำ เช่น 2.1.1 Inbound ฟังก์ชันที่ไม่ใส่วันหรือผู้รับผิดชอบจะใช้ของงาน หัวข้อที่ยังไม่แตกงานขึ้นว่า 'ยังไม่แตกแผน' บันทึกได้และแตกทีหลังได้",
        en: "Under each heading press Add task and give it a name, a member (required), dates and man-days, such as 2.1 Web App WMS. Then press + on the task for the functions to build, such as 2.1.1 Inbound; a function without its own dates or member has its task's. A heading not broken down yet shows Not broken down; you can save and do it later.",
        jp: "各見出しで「タスクを追加」を押し、タスク名・担当者（必須）・日程・人日を入力します（例：2.1 Web App WMS）。タスク行の + で作る機能を追加します（例：2.1.1 Inbound）。日程や担当者のない機能はタスクのものを使います。まだ分けていない見出しには「未展開」と表示され、保存して後から分けられます。",
      },
    },
    {
      target: "project.teamAdd", action: "next", view: "projects",
      title: { th: "เพิ่มงานใต้หัวข้อ", en: "Add a task under a heading", jp: "見出しにタスクを追加" },
      body: { th: "ปุ่ม 'เพิ่มงาน' อยู่ที่แต่ละหัวข้อหลัก งานใหม่ใช้วันที่ของหัวข้อเป็นค่าเริ่มต้น", en: "Each heading has its own Add task button; a new task starts with the heading's dates.", jp: "各大見出しに「タスクを追加」があります。新しいタスクは見出しの日程から始まります。" },
      missing: { th: "เพิ่มหัวข้อหลักใน Master Plan ก่อน ปุ่มนี้จึงจะขึ้น กด 'ถัดไป'", en: "Add a Master Plan heading first and the button appears. Press Next.", jp: "先にマスタープランの見出しを追加するとボタンが表示されます。「次へ」を押します。" },
    },
    {
      target: "project.save", action: "click", view: "projects",
      title: { th: "สร้างโปรเจกต์", en: "Create the project", jp: "プロジェクトを作成" },
      body: {
        th: "กด 'สร้างโปรเจกต์' ระบบแจ้งทีมทางอีเมล ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Create project and the team is emailed. Only practising? Press Cancel, then Finish.",
        jp: "「プロジェクトを作成」を押すとチームにメールが届きます。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const PROJECT_MASTER_PLAN: Guide = {
  id: "project-master-plan",
  area: "project",
  title: { th: "แก้ไข Master Plan ของโปรเจกต์ที่สร้างแล้ว", en: "Edit the Master Plan of an existing project", jp: "作成済み案件のマスタープランを編集" },
  summary: {
    th: "แก้หัวข้อหลัก (Master Plan) และงานกับฟังก์ชันใต้หัวข้อ (Team Plan) ของโปรเจกต์ที่มีอยู่ เลือก Master Schedule ได้ถ้ายังไม่มีแผน และปรับวันเริ่ม/วันส่งมอบตามแผน",
    en: "Change the main headings (Master Plan) and the tasks and functions under them (Team Plan) of a project that exists, start from a Master Schedule when it has none, and move its dates to the plan.",
    jp: "既存案件の大見出し（マスタープラン）とその下のタスク・機能（チームプラン）を変更します。計画がなければマスタースケジュールから始め、日程を計画に合わせます。",
  },
  minutes: 2,
  permissions: ["project.write", "schedule.plan"],
  views: ["projects"],
  steps: [
    menu("projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "รายการโปรเจกต์อยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The project list is here. Click the highlighted menu entry.", jp: "案件一覧はここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "project.rowMenu", action: "click", view: "projects",
      title: { th: "เปิดเมนูของโปรเจกต์", en: "Open the project's menu", jp: "案件のメニューを開く" },
      body: { th: "กดปุ่ม ⋯ ท้ายแถวของโปรเจกต์ที่ต้องการแก้", en: "Press the ⋯ button at the end of the project's row.", jp: "対象案件の行末にある ⋯ ボタンを押します。" },
      missing: { th: "ยังไม่มีโปรเจกต์ในรายการ ลองล้างตัวกรอง หรือกด 'จบบทสอน'", en: "No project is listed. Clear the filters, or press Finish.", jp: "案件が表示されていません。絞り込みを解除するか「完了」を押します。" },
    },
    {
      target: "project.editPlan", action: "click", view: "projects",
      title: { th: "กด 'แก้ไข Master Plan'", en: "Press Edit Master Plan", jp: "「マスタープランを編集」を押す" },
      body: { th: "เปิดหน้าต่างที่มีแค่แผนของโปรเจกต์นี้", en: "It opens a window with only this project's plan.", jp: "この案件の計画だけを編集する画面が開きます。" },
      missing: {
        th: "เมนูนี้ขึ้นสำหรับ PM ของโปรเจกต์นี้ Engineering Manager หรือ Admin และโปรเจกต์ต้องยังไม่ปิด",
        en: "It shows for this project's manager, an Engineering Manager or an Admin, while the project is open.",
        jp: "この案件のPM、エンジニアリングマネージャー、管理者に、案件が未完了の間だけ表示されます。",
      },
    },
    {
      target: "project.plan", action: "next", view: "projects",
      title: { th: "หัวข้อหลัก (Master Plan)", en: "The main headings (Master Plan)", jp: "大見出し（マスタープラン）" },
      body: {
        th: "แก้ชื่อหรือวันที่ตกลงกับลูกค้าได้ทุกหัวข้อ กด 'เพิ่มหัวข้อหลัก' เพื่อเพิ่ม หรือกด ✕ เพื่อลบหัวข้อพร้อมงานข้างใต้ หัวข้อที่มีงานคืบหน้าแล้วลบไม่ได้ ถ้ายังไม่มีแผน เลือก Master Schedule เป็นต้นแบบได้",
        en: "Change any heading's name or the dates agreed with the customer, add one, or remove one with ✕ together with the rows under it. A heading with work in progress under it cannot be removed. With no plan yet, start from a Master Schedule.",
        jp: "各見出しの名前や顧客と合意した日程を変更し、追加、または ✕ で配下の行とともに削除します。進行中の作業がある見出しは削除できません。計画がなければマスタースケジュールから始められます。",
      },
      missing: { th: "บัญชีนี้แก้แผนของโปรเจกต์นี้ไม่ได้ กด 'จบบทสอน'", en: "This account cannot change this project's plan. Press Finish.", jp: "このアカウントはこの案件の計画を変更できません。「完了」を押します。" },
    },
    {
      target: "project.team", action: "next", view: "projects",
      title: { th: "งานและฟังก์ชัน (Team Plan)", en: "Tasks and functions (Team Plan)", jp: "タスクと機能（チームプラン）" },
      body: {
        th: "แต่ละหัวข้อแสดงงานของทีม กด 'เพิ่มงาน' เลือกผู้รับผิดชอบ (ต้องมี) และกด + ที่งานเพื่อเพิ่มฟังก์ชัน งานที่มีฟังก์ชันคิดวันจากฟังก์ชัน แถวที่มีความคืบหน้าแก้ชื่อได้แต่ลบไม่ได้ คนที่ถูกเพิ่มจะได้รับแจ้ง งานที่รอจัดหัวข้ออยู่ใต้ 'ยังไม่จัดหัวข้อ' ลากเข้าหัวข้อที่ถูกใน Project Schedule",
        en: "Each heading lists the team's tasks. Press Add task, pick its member (required), and press + on a task for its functions. A task with functions takes its dates from them. Rows with progress can be renamed but not removed; anyone newly assigned is told. Rows waiting under ยังไม่จัดหัวข้อ are dragged to the right heading in Project Schedule.",
        jp: "各見出しにチームのタスクが並びます。「タスクを追加」で担当者（必須）を選び、タスクの + で機能を追加します。機能のあるタスクは日程を機能から算出します。進捗のある行は名前を変更できますが削除できません。新しく割り当てられた人に通知されます。「ยังไม่จัดหัวข้อ」の下で待つ行は、プロジェクトスケジュールで正しい見出しへドラッグします。",
      },
    },
    {
      target: "project.planSave", action: "click", view: "projects",
      title: { th: "บันทึกแผน", en: "Save the plan", jp: "計画を保存" },
      body: {
        th: "ถ้าแผนเลยวันเดิม ติ๊ก 'ปรับวันเริ่มและวันส่งมอบตามแผน' แล้วกด 'บันทึกแผน' ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "If the plan moved past the old dates, tick Move the project's start and delivery, then press Save plan. Only practising? Press Cancel, then Finish.",
        jp: "計画が元の日程を超えたら「案件の開始日と納期を計画に合わせる」にチェックし、「計画を保存」を押します。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const PROJECT_PLAN: Guide = {
  id: "project-plan",
  area: "project",
  title: { th: "วางแผนงานโปรเจกต์บน Gantt", en: "Plan a project on the Gantt", jp: "ガントで案件を計画" },
  summary: {
    th: "ดูแผนแบบ Master Plan (หัวข้อหลักตามวันที่ลูกค้า) หรือ Team Plan (งานทั้งหมด) เพิ่มงานด้วย + กำหนดวันและผู้รับผิดชอบโดยเห็นภาระงานของแต่ละคน และลากแถบบน Gantt เพื่อเลื่อนวัน",
    en: "See the plan as the Master Plan (headings on the customer's dates) or the Team Plan (every row), add rows in place with +, set dates and owners while seeing each person's load, and drag bars on the Gantt to move dates.",
    jp: "計画をマスタープラン（顧客の日程の見出し）またはチームプラン（全行）で表示し、+ でその場に行を追加し、各自の負荷を見ながら日付と担当者を決め、ガントのバーをドラッグして日程を動かします。",
  },
  minutes: 5,
  permissions: ["schedule.read", "schedule.plan"],
  views: ["projects"],
  steps: [
    menu("projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "แผนงานของทุกโปรเจกต์อยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every project's plan is here. Click the highlighted menu entry.", jp: "すべての案件の計画がここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "[data-tab=\"schedule\"]", action: "click", view: "projects",
      title: { th: "แท็บแผนงาน", en: "The Plan tab", jp: "「計画」タブ" },
      body: { th: "คลิกแท็บ 'แผนงาน'", en: "Click the Plan tab.", jp: "「計画」タブをクリックします。" },
    },
    {
      target: "plan.project", action: "next", view: "projects",
      title: { th: "เลือกโปรเจกต์", en: "Choose the project", jp: "案件を選ぶ" },
      body: { th: "เลือกโปรเจกต์จากรายการ พิมพ์ในช่องค้นหาด้านซ้ายเพื่อหาเร็วขึ้น", en: "Pick the project; type in the search on the left to find it faster.", jp: "案件を選びます。左の検索欄で早く探せます。" },
    },
    {
      target: "plan.gantt", action: "next", view: "projects",
      title: { th: "อ่าน Gantt", en: "Reading the Gantt", jp: "ガントの見方" },
      body: {
        th: "แต่ละแถบคือช่วงงาน ลากแถบเพื่อเลื่อนวัน ลากปลายแถบเพื่อยืดหรือหด แล้วกด 'ย้อนกลับ' ได้ถ้าพลาด เส้นโยงคืองานที่ต้องรออีกงานเสร็จ",
        en: "Each bar is a task. Drag it to move the dates, drag an end to stretch it, and undo if you slip. A line between bars means one task waits for another.",
        jp: "各バーが作業です。ドラッグで日程を移動し、端をドラッグで伸縮します。間違えたら元に戻せます。バー間の線は待ち関係です。",
      },
      missing: { th: "โปรเจกต์นี้ยังไม่มีแผน เพิ่มแถวแรกในขั้นถัดไป", en: "This project has no plan yet; add the first row in the next step.", jp: "この案件にはまだ計画がありません。次の手順で最初の行を追加します。" },
    },
    {
      target: "plan.level", action: "next", view: "projects",
      title: { th: "Master Plan หรือ Team Plan", en: "Master Plan or Team Plan", jp: "マスタープランかチームプランか" },
      body: {
        th: "Master Plan แสดงเฉพาะหัวข้อหลักตามวันที่ตกลงกับลูกค้า Team Plan แสดงงานและฟังก์ชันทั้งหมด หัวข้อที่ยังไม่มีงานขึ้น 'ยังไม่แตกแผน' และหัวข้อที่งานเลยวันลูกค้าขึ้น 'เลยวัน Master Plan'",
        en: "Master Plan shows only the headings on the dates agreed with the customer; Team Plan shows every task and function. A heading with no task yet says Not broken down, and one whose tasks run past the customer's dates says Past the Master Plan dates.",
        jp: "マスタープランは顧客と合意した日程の見出しだけを、チームプランはすべてのタスクと機能を表示します。タスクのない見出しには「未展開」、タスクが顧客の日程を超える見出しには「マスタープランの日程を超過」と表示されます。",
      },
      missing: { th: "โปรเจกต์นี้ยังไม่มีแผน กด 'ถัดไป'", en: "This project has no plan yet. Press Next.", jp: "この案件にはまだ計画がありません。「次へ」を押します。" },
    },
    {
      target: "plan.insert", action: "next", view: "projects",
      title: { th: "แทรกงานตรงที่ต้องการด้วย +", en: "Add a row in place with +", jp: "+ でその場に行を追加" },
      body: {
        th: "กด + เพื่อเพิ่มแถว แผนซ้อนได้สูงสุด 6 ระดับ เลือก 'ระดับเดียวกัน' เพื่อเพิ่มถัดจากแถวนี้และแถวลูกทั้งหมด หรือ 'ระดับย่อย (ใต้แถวนี้)' เพื่อเพิ่มเป็นแถวลูกสุดท้าย เลือกแถวแม่ที่ชื่อ WBS; หากกด + ที่หัวข้อหลัก ให้เลือก 'งาน' เพื่อเพิ่มลูกแถวแรก หัวข้อหลักใหม่อยู่ถัดจากกลุ่มระดับบนสุด กด 'บันทึกและเพิ่มถัดไป' หรือ Enter ในช่องชื่อเพื่อเพิ่มต่อในระดับและแถวแม่เดิม หลังบันทึกหัวข้อหลักจะเริ่มเพิ่มงานใต้หัวข้อนั้น บันทึกความคืบหน้าที่แถวล่างสุด เปอร์เซ็นต์ วันที่ และสถานะจะรวมขึ้นทุกระดับ",
        en: "Press + to add a row. Plans support up to 6 levels. Same level adds below this row and its whole subtree; Sub level (under this row) adds its last child. Select the parent under WBS name. On a heading, Task adds its first child; a new Main heading goes after the top-level group. Save & add next, or Enter in the name field, continues at the same level and parent. After saving a heading, add its first Task. Enter progress on the lowest row; percentages, dates and status roll up through every level.",
        jp: "+ で行を追加します。計画は最大6階層です。「同じ階層」はこの行と配下の全行の後に、「下位階層（この行の下）」は最後の子行として追加します。WBS名で親を選びます。見出しでは「タスク」で最初の子行を追加し、新しいメイン見出しは最上位グループの後に入ります。「保存して次を追加」または名前欄の Enter で同じ階層・同じ親に続けて追加できます。見出しの保存後は配下の最初のタスクを追加します。進捗は最下層の行に入力し、進捗率・日程・状態はすべての階層に集計されます。",
      },
      missing: { th: "ปุ่ม + ขึ้นสำหรับผู้วางแผนของโปรเจกต์นี้เมื่อแผนมีแถวแล้ว และไม่ได้กรองแถวอยู่ กด 'ถัดไป'", en: "The + shows for this project's planners once the plan has rows and no quick filter is on. Press Next.", jp: "+ はこの案件の計画担当者に、計画に行があり絞り込みをしていないときに表示されます。「次へ」を押します。" },
    },
    {
      target: "plan.delete", action: "next", view: "projects",
      title: { th: "ลบแถวที่พิมพ์ผิด", en: "Delete a row added by mistake", jp: "誤って追加した行を削除" },
      body: {
        th: "คลิกแถว แล้วกดแก้ไข จากนั้นกด 'ลบแถว' และยืนยันชื่อกับจำนวนแถวลูกที่จะลบ แถวที่มีความคืบหน้าหรืองานอ้างอิงลบไม่ได้",
        en: "Click a row, then Edit, and press Delete row. Confirm its name and the number of descendant rows to remove. Rows with progress or linked work cannot be deleted.",
        jp: "行をクリックして編集を開き、「行を削除」を押します。名前と配下の削除行数を確認してください。進捗や参照先のある行は削除できません。",
      },
      missing: { th: "คลิกแถวแล้วกดแก้ไขเพื่อดูปุ่มลบ หากแค่เรียนรู้ให้กดถัดไป", en: "Click a row, then Edit to see Delete row. Press Next if only browsing.", jp: "行をクリックして編集を開くと削除ボタンが表示されます。閲覧だけなら「次へ」を押してください。" },
    },
    {
      target: "plan.add", action: "click", view: "projects",
      title: { th: "กด 'เพิ่มรายการแผนงาน'", en: "Press Add schedule row", jp: "「予定行を追加」を押す" },
      body: { th: "เปิดฟอร์มงานใหม่ในแผน", en: "It opens the form for a new row.", jp: "新しい行のフォームが開きます。" },
      missing: { th: "ปุ่มนี้ขึ้นสำหรับผู้วางแผนของโปรเจกต์นี้ เช่น PM", en: "The button shows for the project's planners, such as the PM.", jp: "このボタンはPMなど案件の計画担当者に表示されます。" },
    },
    {
      target: "plan.rowName", action: "next", view: "projects",
      title: { th: "ชื่องาน", en: "Name the task", jp: "作業名" },
      body: {
        th: "ตั้งชื่อ แล้วเลือกระดับด้านบน แถวบนสุดเป็นหัวข้อหลักเท่านั้น และใส่วันที่ตกลงกับลูกค้าได้ งานใต้หัวข้อหลักต้องมีผู้รับผิดชอบ ฟังก์ชันใต้งานใช้ผู้รับผิดชอบของงานถ้าไม่เลือก เลือกแถวแม่ที่ชื่อ WBS",
        en: "Name it and choose the level above. The top of the plan holds main headings only, which may carry the dates agreed with the customer. A task under a heading needs a member; a function under a task has the task's member unless you pick another. Choose the parent under WBS name.",
        jp: "名前を入力し、上で階層を選びます。最上位は大見出しのみで、顧客と合意した日程を持てます。見出しの下のタスクには担当者が必要で、タスクの下の機能は別の人を選ばなければタスクの担当者になります。WBS名で親を選びます。",
      },
    },
    {
      target: "plan.rowDays", action: "next", view: "projects",
      title: { th: "วันเริ่มและจำนวนวัน", en: "Start and duration", jp: "開始日と日数" },
      body: {
        th: "ใส่วันเริ่ม หรือให้เริ่มต่อจากงานอื่น แล้วใส่จำนวนวันทำงาน ระบบข้ามวันหยุดให้เอง",
        en: "Give a start date or make it start after another task, then the working days; holidays are skipped for you.",
        jp: "開始日を入れるか別の作業の後に開始させ、作業日数を入力します。休日は自動で除かれます。",
      },
    },
    {
      target: "plan.pic", action: "next", view: "projects",
      title: { th: "ผู้รับผิดชอบ (PIC)", en: "Responsible (PIC)", jp: "担当者(PIC)" },
      body: {
        th: "เลือกผู้รับผิดชอบ ด้านล่างแสดงภาระงานของแต่ละคนช่วงนั้น ถ้าใครงานล้น ระบบเสนอคนที่ว่างกว่าให้สลับได้",
        en: "Choose who does it. Below, each person's load over those dates shows, and someone freer is offered if a person is overloaded.",
        jp: "担当者を選びます。下にその期間の各自の負荷が表示され、過負荷なら空いている人が提案されます。",
      },
    },
    {
      target: "plan.save", action: "click", view: "projects",
      title: { th: "บันทึกงาน", en: "Save the row", jp: "行を保存" },
      body: {
        th: "กด 'บันทึกและเพิ่มถัดไป' หรือ Enter ในช่องชื่อเพื่อบันทึกแล้วเพิ่มต่อ วันเริ่มถัดไปเป็นวันทำงานหลังแถวที่เพิ่งบันทึก กด 'บันทึก' หากต้องการปิดหน้าต่าง PIC ได้อีเมลและเห็นงานใน 'งานของฉัน' ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Save & add next, or Enter in the name field, to save and continue. The next start is the working day after the saved row finishes. Save closes the window. The PIC is emailed and sees the task in My Work. Only practising? Press Cancel, then Finish.",
        jp: "「保存して次を追加」または名前欄の Enter で保存して続けます。次の開始日は保存した行の終了後の営業日です。「保存」は画面を閉じます。PICにメールが届き、マイワークに表示されます。練習だけなら「キャンセル」の後に「完了」を押します。",
      },
    },
  ],
};

const TEAM_TASK: Guide = {
  id: "team-overview-task",
  area: "project",
  title: { th: "เพิ่มงานหรือนัดหมายในภาพรวมงานทีม", en: "Add work or an appointment on the team overview", jp: "チームの仕事一覧に作業・予定を追加" },
  summary: {
    th: "ลงงานด่วน นัดหมาย เข้าหน้างาน หรือวันลาบนตารางของทีม ทุกคนเห็นภาระงานของกันและกัน",
    en: "Put a quick task, an appointment, a site visit or time away on the team's board, where everyone sees everyone's load.",
    jp: "急ぎの作業・予定・現地訪問・不在をチームの表に登録します。全員が互いの負荷を見られます。",
  },
  minutes: 2,
  permissions: ["team.board"],
  views: ["resources"],
  invite: "resources",
  steps: [
    menu("resources",
      { th: "เปิดเมนูภาพรวมงานทีม", en: "Open Team overview", jp: "「チームの仕事一覧」を開く" },
      { th: "งานของทุกคนในทีมอยู่ในตารางนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Everyone's work is on this board. Click the highlighted menu entry.", jp: "チーム全員の作業がこの表にあります。強調表示のメニューをクリックします。" }),
    {
      target: "team.add", action: "click", view: "resources",
      title: { th: "กด 'เพิ่มงาน / นัดหมาย'", en: "Press Add work or appointment", jp: "「作業・予定を追加」を押す" },
      body: { th: "หรือกด + ในช่องของคนและวันที่บนตาราง ระบบใส่คนและวันนั้นให้", en: "Or press + in a person's cell on a day; that person and date are filled in.", jp: "表の担当者と日付のセルの+でも追加でき、その人と日付が入ります。" },
    },
    {
      target: "team.kind", action: "next", view: "resources",
      title: { th: "ประเภท", en: "Kind", jp: "種類" },
      body: { th: "นัดหมาย / เข้าหน้างาน, งานทั่วไป หรือ ลา / ไม่ว่าง", en: "Appointment or site visit, a task, or away.", jp: "予定・現地訪問、タスク、不在のいずれかです。" },
    },
    {
      target: "team.subject", action: "next", view: "resources",
      title: { th: "เรื่องและรายละเอียด", en: "Subject and detail", jp: "件名と内容" },
      body: { th: "บอกสั้นๆ ว่าทำอะไร และใส่รายละเอียดงานเบื้องต้นด้านล่าง เลือกลูกค้าได้ถ้าเกี่ยวกับลูกค้า", en: "Say briefly what it is and describe it below; pick the customer if one is involved.", jp: "何をするかを短く書き、下に内容を入力します。顧客が関わる場合は顧客を選びます。" },
    },
    {
      target: "team.people", action: "next", view: "resources",
      title: { th: "ผู้รับผิดชอบ", en: "Who does it", jp: "担当者" },
      body: { th: "เลือกได้หลายคน ระบบบอกภาระงานของแต่ละคนในวันนั้นให้เห็นก่อนเลือก", en: "Choose one or more people; each one's load that day shows before you choose.", jp: "複数選べます。選ぶ前にその日の各自の負荷が表示されます。" },
    },
    {
      target: "team.date", action: "next", view: "resources",
      title: { th: "วันที่", en: "When", jp: "日付" },
      body: { th: "วันที่ และวันสิ้นสุดถ้าหลายวัน เลือกทั้งวัน ช่วงเช้า ช่วงบ่าย หรือระบุเวลาได้", en: "The date, and an end date for several days; a whole day, morning, afternoon or set times.", jp: "日付と、複数日の場合は終了日を入れます。終日・午前・午後・時間指定を選べます。" },
    },
    {
      target: "team.save", action: "click", view: "resources",
      title: { th: "เพิ่มงาน", en: "Add it", jp: "追加" },
      body: {
        th: "กด 'เพิ่มงาน' งานขึ้นบนตารางของทีมทันที ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Add work and it is on the team board at once. Only practising? Press Cancel, then Finish.",
        jp: "「追加」を押すとすぐチームの表に載ります。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const BOM_RELEASE: Guide = {
  id: "bom-release",
  area: "purchase",
  title: { th: "สร้างและ Release BOM", en: "Generate and release a BOM", jp: "BOMの作成とリリース" },
  summary: {
    th: "สร้าง BOM จาก Estimate ที่อนุมัติแล้วของโปรเจกต์ ตรวจรายการ แล้ว Release เพื่อใช้ขอซื้อและเบิกของ",
    en: "Generate the BOM from the project's approved estimate, check it, then release it so purchases and issues can use it.",
    jp: "案件の承認済み見積からBOMを作成し、確認してリリースすると購買申請や出庫に使えます。",
  },
  minutes: 3,
  permissions: ["procurement.read", "procurement.request"],
  views: ["boms", "purchase"],
  invite: "boms",
  steps: [
    menu("boms",
      { th: "เปิดเมนู BOM", en: "Open BOM", jp: "「BOM」を開く" },
      { th: "รายการวัสดุของทุกโปรเจกต์อยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every project's bill of materials is here. Click the highlighted menu entry.", jp: "すべての案件のBOMがここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "bom.generate", action: "click", view: "boms",
      title: { th: "กด 'สร้างรายการวัสดุ'", en: "Press Generate BOM", jp: "「BOMを作成」を押す" },
      body: { th: "สร้าง BOM จาก Estimate ที่อนุมัติและล็อกแล้วของโปรเจกต์", en: "It builds the BOM from the project's approved, locked estimate.", jp: "案件の承認・ロック済み見積からBOMを作ります。" },
      missing: { th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้าง BOM", en: "If the button never appears, this account cannot generate BOMs.", jp: "ボタンが表示されない場合、このアカウントには作成権限がありません。" },
    },
    {
      target: "bom.project", action: "next", view: "boms",
      title: { th: "เลือกโปรเจกต์", en: "Choose the project", jp: "案件を選ぶ" },
      body: { th: "เลือกโปรเจกต์ ระบบคัดลอกรายการจาก Estimate revision ที่อนุมัติแล้ว", en: "Pick the project; the lines are copied from its approved estimate revision.", jp: "案件を選ぶと、承認済み見積リビジョンの明細がコピーされます。" },
    },
    {
      target: "bom.create", action: "click", view: "boms",
      title: { th: "สร้าง BOM", en: "Generate it", jp: "BOMを作成" },
      body: { th: "กดสร้าง BOM จะเป็นฉบับร่างจนกว่าจะ Release ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'ข้ามขั้นนี้'", en: "Press generate; the BOM stays a draft until it is released. Only practising? Press Cancel, then Skip this step.", jp: "作成するとリリースまで下書きです。練習だけなら「キャンセル」を押してから「この手順を飛ばす」を押します。" },
    },
    {
      target: "bom.list", action: "next", view: "boms",
      title: { th: "BOM ทุก revision", en: "Every BOM revision", jp: "全BOMリビジョン" },
      body: { th: "กด 'ดู' เพื่อตรวจรายการ จำนวน และจองของที่มีในสต็อก", en: "Press View to check the lines and quantities, and reserve stock on hand.", jp: "「表示」で明細と数量を確認し、在庫を引き当てます。" },
    },
    {
      target: "bom.release", action: "click", view: "boms",
      title: { th: "Release BOM", en: "Release the BOM", jp: "BOMをリリース" },
      body: {
        th: "เมื่อตรวจแล้ว กด Release รายการจะถูก freeze และใช้เป็นฐานของ PR และใบเบิก ถ้าแค่ฝึก ให้กด 'ยกเลิก' ในหน้าต่างยืนยัน แล้วกด 'จบบทสอน'",
        en: "Once checked, press Release: the lines freeze and become the base for PRs and material issues. Only practising? Press Cancel in the confirmation, then Finish.",
        jp: "確認後にリリースすると明細が固定され、PRと出庫の基準になります。練習だけなら確認画面で「キャンセル」を押してから「完了」を押します。",
      },
      missing: { th: "Release ได้เฉพาะ BOM ฉบับร่าง และผู้มีสิทธิ์อนุมัติ", en: "Only a draft BOM can be released, by someone who may approve.", jp: "リリースできるのは下書きBOMのみで、承認権限が必要です。" },
    },
  ],
};

const PR_APPROVE: Guide = {
  id: "pr-approve",
  area: "purchase",
  title: { th: "อนุมัติใบขอซื้อ", en: "Approve a purchase requisition", jp: "購買申請を承認" },
  summary: {
    th: "ดูใบขอซื้อที่รอคุณ เทียบยอดกับงบ แล้วอนุมัติหรือไม่อนุมัติ ใบที่อนุมัติครบจะส่งเข้า ERP เอง",
    en: "See the requisitions waiting for you, compare them with the budget, and approve or reject; fully approved ones go to the ERP by themselves.",
    jp: "自分の承認待ちの購買申請を予算と比べて承認・却下します。承認が揃うと自動でERPに送られます。",
  },
  minutes: 2,
  permissions: ["procurement.approve"],
  views: ["approvals", "purchase"],
  invite: "approvals",
  steps: [
    menu("approvals",
      { th: "เปิดเมนูรออนุมัติ", en: "Open Approvals", jp: "「承認」を開く" },
      { th: "ตัวเลขบนเมนูคือจำนวนที่รอคุณ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The number on the menu is how many wait for you. Click the highlighted menu entry.", jp: "メニューの数字が自分の承認待ち件数です。強調表示のメニューをクリックします。" }),
    {
      target: "appr.pr", action: "next", view: "approvals",
      title: { th: "ใบขอซื้อที่รอคุณ", en: "Requisitions waiting for you", jp: "承認待ちの購買申請" },
      body: {
        th: "ระบบคำนวณว่าใบไหนต้องให้ใครอนุมัติ: หัวหน้าแผนกของผู้ขอก่อน แล้วผู้อนุมัติขั้นสุดท้าย ซึ่งได้อีเมลเมื่อมีใบรอ ใบที่เกินงบของ Module ต้องใส่เหตุผลตอนอนุมัติ",
        en: "The app works out who approves each one: the requester's department head, then the final approver, who is emailed when one waits. A PR over a module budget needs a reason when approved.",
        jp: "誰が承認するかはシステムが決めます。依頼者の部門長、次に最終承認者で、最終承認者には承認待ちがあるとメールが届きます。モジュール予算を超えるPRは承認時に理由が必要です。",
      },
    },
    {
      target: "appr.approve", action: "click", view: "approvals",
      title: { th: "อนุมัติหรือไม่อนุมัติ", en: "Approve or reject", jp: "承認または却下" },
      body: {
        th: "กด 'อนุมัติ' หรือ 'ไม่อนุมัติ' แล้วยืนยันพร้อมความเห็น ผู้ขอได้แจ้งผลพร้อมความเห็นของคุณทุกครั้ง ใบที่อนุมัติครบจะส่งเข้า Pegasus ERP เอง ถ้าแค่ฝึก ให้กด 'ยกเลิก' ในหน้าต่างยืนยัน แล้วกด 'จบบทสอน'",
        en: "Press Approve or Reject and confirm with a comment; the requester is always told, with your comment. A fully approved PR goes to Pegasus ERP by itself. Only practising? Press Cancel in the confirmation, then Finish.",
        jp: "「承認」または「却下」を押し、コメントを付けて確定します。結果はコメントと一緒に必ず依頼者へ通知されます。承認が揃うとPegasus ERPに自動送信されます。練習だけなら確認画面で「キャンセル」を押してから「完了」を押します。",
      },
      missing: { th: "ยังไม่มีใบขอซื้อรอคุณ กด 'จบบทสอน' ได้", en: "Nothing is waiting for you. Press Finish.", jp: "承認待ちはありません。「完了」を押します。" },
    },
  ],
};

// An approved PR the ERP refused or deleted goes back to Draft (or is cancelled) and is corrected in the PR sheet (2026-11-02).
const PR_FIX: Guide = {
  id: "pr-fix",
  area: "purchase",
  title: { th: "แก้ PR ที่ ERP ไม่รับ", en: "Fix a PR the ERP did not take", jp: "ERPが受け付けなかったPRを直す" },
  summary: {
    th: "PR ที่อนุมัติแล้วแต่ส่ง ERP ไม่สำเร็จหรือถูกลบใน ERP ดึงกลับเป็นฉบับร่างเพื่อแก้แล้วส่งอนุมัติใหม่ หรือยกเลิกเพื่อคืนรายการ BOM",
    en: "An approved PR the ERP refused or deleted can go back to Draft to be corrected and approved again, or be cancelled to free its BOM lines.",
    jp: "承認済みでもERPが拒否・削除したPRは、下書きに戻して修正・再承認するか、取り消してBOM明細を戻します。",
  },
  minutes: 3,
  permissions: ["procurement.request"],
  views: ["purchase"],
  steps: [
    menu("purchase",
      { th: "เปิดเมนูใบขอซื้อ", en: "Open Purchase Requisition", jp: "「購買申請」を開く" },
      { th: "PR ทุกใบและสถานะใน ERP อยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every PR and its ERP status is here. Click the highlighted menu entry.", jp: "すべてのPRとERPでの状態がここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "pr.erp", action: "next", view: "purchase",
      title: { th: "ดูคอลัมน์ ERP", en: "Look at the ERP column", jp: "ERP列を見る" },
      body: {
        th: "ใบที่ขึ้น 'ส่ง ERP ไม่สำเร็จ' หรือ 'ถูกลบใน ERP' คือใบที่ ERP ไม่ได้รับไว้ กด 'View' ที่ใบนั้นเพื่อดูข้อความจาก ERP",
        en: "A PR marked as a failed ERP send, or as deleted in the ERP, is one the ERP does not hold. Press View on it to read the ERP's message.",
        jp: "「ERP送信失敗」または「ERPで削除済み」のPRはERPに登録されていません。そのPRの「表示」を押してERPのメッセージを確認します。",
      },
    },
    {
      target: "pr.takeback", action: "next", view: "purchase",
      title: { th: "ดึงกลับไปแก้ หรือยกเลิก", en: "Take it back, or cancel it", jp: "差し戻すか取り消す" },
      body: {
        th: "ถ้าต้องแก้ข้อมูล กด 'ดึงกลับไปแก้' PR จะกลับเป็นฉบับร่างและเปิดหน้าแก้รายการให้ ถ้าไม่ซื้อแล้ว กด 'ยกเลิก PR' ระบบถาม ERP ก่อนทุกครั้ง ถ้า ERP ยังมี PR ใบนั้นอยู่ ให้ฝ่ายจัดซื้อยกเลิกใน ERP แทน",
        en: "To correct it, press Take back to edit: the PR returns to Draft and opens in the PR sheet. If it is no longer needed, press Cancel PR. The app always asks the ERP first; if the ERP still holds the PR, ask Purchasing to cancel it there.",
        jp: "修正するなら「差し戻して修正」を押すと下書きに戻り編集画面が開きます。不要なら「購買申請を取消」を押します。毎回先にERPへ確認し、ERPにPRが残っている場合は購買部にERP側で取り消してもらいます。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นเฉพาะใน PR ที่อนุมัติแล้วแต่ ERP ไม่ได้รับไว้ และคุณเป็นผู้ขอ",
        en: "These buttons appear only on an approved PR the ERP does not hold, for its requester.",
        jp: "このボタンは、ERPに登録されていない承認済みPRで、依頼者にだけ表示されます。",
      },
    },
    {
      target: "pr.submit", action: "click", view: "purchase",
      title: { th: "แก้รายการแล้วบันทึก", en: "Correct the lines and save", jp: "明細を直して保存" },
      body: {
        th: "แก้จำนวน ราคา หรือรายการตามข้อความจาก ERP แล้วกด 'บันทึก PR' จากนั้นกด 'ส่ง' ที่รายการ PR เพื่อส่งอนุมัติใหม่ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Correct the quantities, prices or items the ERP named, press Save PR, then press Submit in the PR list to send it for approval again. Only practising? Press Cancel, then Finish.",
        jp: "ERPの指摘に合わせて数量・単価・明細を直し「PRを保存」を押し、PR一覧で「提出」を押して再承認に回します。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
      missing: {
        th: "หน้าแก้รายการเปิดหลังกด 'ดึงกลับไปแก้' หรือกด 'แก้ไข' ที่ PR ฉบับร่างของคุณ",
        en: "The PR sheet opens after Take back to edit, or from Edit on one of your draft PRs.",
        jp: "編集画面は「差し戻して修正」の後、または自分の下書きPRの「編集」から開きます。",
      },
    },
  ],
};

const SITE_VISIT_WORK: Guide = {
  id: "site-visit-work",
  area: "field",
  title: { th: "ทำงานหน้างานและส่งรายงานเข้าหน้างาน", en: "Work on site and send the visit report", jp: "現地作業と訪問報告書の提出" },
  summary: {
    th: "ตอบรับงาน เช็คอินเมื่อถึงหน้างาน ทำรายการตรวจสอบ ถ่ายรูป บันทึกสิ่งที่พบ เช็คเอาต์ แล้วส่งรายงานตรวจ",
    en: "Accept the job, check in on arrival, work the checklist, take photos, record findings, check out and send the report for review.",
    jp: "依頼を受諾し、到着時にチェックイン、チェックリスト・写真・所見を記録し、チェックアウトして報告書をレビューに出します。",
  },
  minutes: 4,
  permissions: ["visit.read"],
  views: ["my-assignments", "site-visits"],
  invite: "my-assignments",
  steps: [
    menu("my-assignments",
      { th: "เปิดเมนูงานที่ได้รับมอบหมาย", en: "Open My Assignments", jp: "「自分の割当」を開く" },
      { th: "งานเข้าหน้างานที่ส่งถึงคุณอยู่ที่นี่ ใช้บนมือถือได้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Site visits assigned to you are here, phone-friendly. Click the highlighted menu entry.", jp: "自分に割り当てられた現地訪問がここにあり、スマホでも使えます。強調表示のメニューをクリックします。" }),
    {
      target: "visit.respond", action: "next", view: "my-assignments",
      title: { th: "ตอบรับงาน", en: "Answer a new job", jp: "依頼に回答" },
      body: { th: "งานใหม่ต้องกด 'ตอบรับหรือปฏิเสธ' ก่อน ผู้ประสานงานจะรู้ทันที", en: "A new job needs Accept or decline first; the coordinator sees your answer at once.", jp: "新しい依頼はまず「受諾・辞退」を押します。調整担当にすぐ伝わります。" },
      missing: { th: "ยังไม่มีงานรอตอบรับ กด 'ถัดไป'", en: "Nothing is waiting for an answer. Press Next.", jp: "回答待ちはありません。「次へ」を押します。" },
    },
    {
      target: "visit.open", action: "click", view: "my-assignments",
      title: { th: "เปิดงาน", en: "Open the visit", jp: "訪問を開く" },
      body: { th: "กด 'เปิดงาน' ของงานที่จะไป หรือ 'ทำงานหน้างานต่อ' ถ้าเช็คอินไว้แล้ว", en: "Press Open visit on the job you are going to, or Continue on site if you have checked in.", jp: "行く訪問の「訪問を開く」、チェックイン済みなら「現地作業を続ける」を押します。" },
      missing: { th: "ยังไม่มีงานเข้าหน้างานของคุณ เมื่อได้รับมอบหมายจะขึ้นที่นี่", en: "No visits are assigned to you yet; they show here once you are placed on one.", jp: "まだ割り当てがありません。割り当てられるとここに表示されます。" },
    },
    {
      target: "visit.checkin", action: "next", view: "my-assignments",
      title: { th: "เช็คอิน", en: "Check in", jp: "チェックイン" },
      body: { th: "เมื่อถึงหน้างาน กด 'เช็คอิน' ระบบบันทึกเวลาเริ่มงาน", en: "On arrival press Check in; the start time is recorded.", jp: "到着したら「チェックイン」を押すと開始時刻が記録されます。" },
      missing: { th: "เช็คอินแล้ว ปุ่มนี้จึงไม่ขึ้น กด 'ถัดไป'", en: "Already checked in, so the button is gone. Press Next.", jp: "チェックイン済みのため表示されません。「次へ」を押します。" },
    },
    {
      target: "visit.checklist", action: "next", view: "my-assignments",
      title: { th: "รายการตรวจสอบ", en: "Checklist", jp: "チェックリスト" },
      body: { th: "ทำทีละข้อ กดปุ่มกรองเพื่อดูเฉพาะข้อที่ยังไม่ทำ", en: "Work through it item by item; the filter button shows only what is left.", jp: "1項目ずつ進めます。絞り込みボタンで未完了だけを表示できます。" },
    },
    {
      target: "visit.files", action: "next", view: "my-assignments",
      title: { th: "รูป วิดีโอ และเอกสาร", en: "Photos, videos and documents", jp: "写真・動画・文書" },
      body: { th: "เลือกหมวดแล้วถ่ายรูปหรืออัปโหลดไฟล์ รูปจากหน้างานใช้ในรายงานได้", en: "Choose a category, then take a photo or upload a file; site photos can go into the report.", jp: "カテゴリを選んで撮影またはアップロードします。現場写真は報告書に使えます。" },
    },
    {
      target: "visit.findings", action: "next", view: "my-assignments",
      title: { th: "สิ่งที่พบ ค่าที่วัด และความเสี่ยง", en: "Findings, measurements and risks", jp: "所見・測定値・リスク" },
      body: { th: "บันทึกสิ่งที่เจอจริง ข้อมูลส่วนนี้ไปอยู่ในรายงานให้เอง", en: "Record what you actually found; it is carried into the report.", jp: "実際の所見を記録します。報告書に自動で反映されます。" },
    },
    {
      target: "visit.checkout", action: "next", view: "my-assignments",
      title: { th: "เช็คเอาต์", en: "Check out", jp: "チェックアウト" },
      body: { th: "เสร็จงานแล้วกด 'เช็คเอาต์' ระบบสร้างรายงานเข้าหน้างานให้ทันที", en: "When you finish, press Check out and the visit report is created.", jp: "作業後に「チェックアウト」を押すと訪問報告書が作成されます。" },
      missing: { th: "ปุ่มนี้ขึ้นหลังเช็คอิน และหายไปเมื่อเช็คเอาต์แล้ว", en: "It shows after check-in and disappears once you have checked out.", jp: "チェックイン後に表示され、チェックアウト後は消えます。" },
    },
    {
      target: "visit.report", action: "next", view: "my-assignments",
      title: { th: "รายงานการเข้าหน้างาน", en: "Site visit report", jp: "現地訪問報告書" },
      body: { th: "กรอกสรุปการเข้าหน้างานและข้อสรุปของวิศวกร ต้องมีทั้งสองช่อง กด 'บันทึกฉบับร่าง' ระหว่างทำได้", en: "Fill in the visit summary and the engineer's conclusion, both required. Save draft as you go.", jp: "訪問概要と技術者の結論を入力します(両方必須)。途中で「下書き保存」できます。" },
      missing: { th: "รายงานจะถูกสร้างเมื่อเช็คเอาต์", en: "The report is created when you check out.", jp: "報告書はチェックアウト時に作成されます。" },
    },
    {
      target: "visit.submit", action: "click", view: "my-assignments",
      title: { th: "ส่งตรวจสอบ", en: "Submit for review", jp: "レビュー依頼" },
      body: { th: "กด 'ส่งตรวจสอบ' ก่อนครบกำหนดส่งรายงาน หัวหน้าจะตรวจและอนุมัติ ถ้ายังไม่พร้อม กด 'จบบทสอน' แล้วกลับมาส่งทีหลัง", en: "Press Submit for review before the report is due; your lead reviews and approves it. Not ready? Press Finish and submit later.", jp: "期限前に「レビュー依頼」を押すと上長が確認・承認します。準備ができていなければ「完了」を押し、後で提出します。" },
    },
  ],
};

const REPORT_CREATE: Guide = {
  id: "report-create",
  area: "field",
  title: { th: "สร้างรายงานปฏิบัติงานให้ลูกค้า", en: "Create an operational report", jp: "業務報告書を作成" },
  summary: {
    th: "เลือกแบบฟอร์ม ผูกกับ Inquiry หรือโปรเจกต์ ตั้งชื่อ แล้วเปิดรายงานเพื่อกรอกผล ส่งตรวจ และให้ลูกค้าเซ็นรับทราบ",
    en: "Pick a form, link the inquiry or project, name it, then open the report to fill in, send for review and have the customer acknowledge.",
    jp: "フォームを選び、引合または案件に関連付けて名前を付け、報告書を開いて入力・レビュー依頼・顧客確認へ進めます。",
  },
  minutes: 3,
  permissions: ["report.read", "report.write"],
  views: ["reports"],
  invite: "reports",
  steps: [
    menu("reports",
      { th: "เปิดเมนูรายงานปฏิบัติงาน", en: "Open Operational Reports", jp: "「業務報告書」を開く" },
      { th: "รายงานถึงลูกค้าทุกฉบับอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every report for customers is here. Click the highlighted menu entry.", jp: "顧客向けの報告書はすべてここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "report.start", action: "click", clickOn: ".report-form-choice", view: "reports",
      title: { th: "เลือกแบบฟอร์ม", en: "Pick a form", jp: "フォームを選ぶ" },
      body: { th: "คลิกแบบฟอร์มที่ตรงกับงาน เช่น รายงานบริการ หรือรายงานตรวจสอบ", en: "Click the form that fits the work, such as a service or inspection report.", jp: "作業に合うフォーム(サービス報告、点検報告など)をクリックします。" },
      missing: { th: "ถ้าไม่เห็นส่วนนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้างรายงาน", en: "If this part never shows, this account cannot create reports.", jp: "表示されない場合、このアカウントには作成権限がありません。" },
    },
    {
      target: "report.form", action: "next", view: "reports",
      title: { th: "แบบฟอร์มรายงาน", en: "The report form", jp: "報告書フォーム" },
      body: { th: "เปลี่ยนแบบฟอร์มได้ที่นี่ หรือใช้ Template ของทีมที่เคยทำไว้", en: "Change the form here, or use one of the team's templates.", jp: "ここでフォームを変更するか、チームのテンプレートを使います。" },
    },
    {
      target: "report.next", action: "click", view: "reports",
      title: { th: "กด 'ถัดไป: เลือกงาน'", en: "Press Next: choose the work", jp: "「次へ:作業を選ぶ」を押す" },
      body: { th: "ไปขั้นเลือกงานที่รายงานนี้เป็นของ", en: "Move on to choosing the work this report belongs to.", jp: "この報告書の対象作業を選ぶ手順へ進みます。" },
    },
    {
      target: "report.source", action: "next", view: "reports",
      title: { th: "Inquiry หรือโปรเจกต์", en: "Inquiry or project", jp: "引合または案件" },
      body: { th: "ค้นหาแล้วเลือก Inquiry หรือโปรเจกต์ ลูกค้าและสถานที่จะมาให้เอง", en: "Search and pick the inquiry or project; the customer and site come with it.", jp: "引合または案件を検索して選ぶと、顧客と現場が入ります。" },
    },
    {
      target: "report.title", action: "next", view: "reports",
      title: { th: "ชื่อและผู้ตรวจ", en: "Title and reviewers", jp: "件名と確認者" },
      body: { th: "ตั้งชื่อรายงานและวันที่ แล้วเลือกผู้ตรวจและผู้อนุมัติด้านล่าง", en: "Give the title and date, then choose the reviewer and approver below.", jp: "件名と日付を入れ、下で確認者と承認者を選びます。" },
    },
    {
      target: "report.create", action: "click", view: "reports",
      title: { th: "เปิดแบบฟอร์มเพื่อกรอก", en: "Open the form to fill in", jp: "フォームを開いて入力" },
      body: {
        th: "กดปุ่มนี้ ระบบสร้างรายงานและเปิดให้กรอกผล แนบรูป แล้วกด 'ส่งตรวจสอบ' เมื่ออนุมัติแล้วส่งให้ลูกค้าเซ็นรับทราบได้ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press it: the report is created and opens for you to fill in and add photos, then Submit for review; once approved the customer can acknowledge it. Only practising? Press Cancel, then Finish.",
        jp: "押すと報告書が作成されて開きます。結果と写真を入力し「レビュー依頼」を押します。承認後に顧客の確認へ進めます。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const SIGN_DOCUMENT: Guide = {
  id: "sign-document",
  area: "field",
  title: { th: "ลงนามเอกสาร", en: "Sign a document", jp: "文書に署名" },
  summary: {
    th: "สร้างลายเซ็นครั้งแรก เปิดเอกสารที่รอคุณ ตรวจไฟล์และตำแหน่งลายเซ็น แล้วลงนาม",
    en: "Create your signature once, open a document waiting for you, check the file and the signature's place, then sign.",
    jp: "初回に署名を作成し、署名待ちの文書を開き、ファイルと署名位置を確認して署名します。",
  },
  minutes: 2,
  permissions: ["signing.read"],
  views: ["signing", "documents"],
  invite: "signing",
  steps: [
    menu("signing",
      { th: "เปิดเมนูเอกสารรอลงนาม", en: "Open Sign Inbox", jp: "「署名受信箱」を開く" },
      { th: "เอกสารทุกประเภทที่รอลายเซ็นของคุณอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every document waiting for your signature is here. Click the highlighted menu entry.", jp: "署名待ちの文書はすべてここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "sign.specimen", action: "next", view: "signing",
      title: { th: "ลายเซ็นของคุณ", en: "Your signature", jp: "自分の署名" },
      body: { th: "ครั้งแรกต้องกด 'สร้างลายเซ็น' วาดหรืออัปโหลดลายเซ็นไว้ใช้ทุกเอกสาร คนอื่นไม่เห็นลายเซ็นนี้", en: "The first time, press Create signature to draw or upload it for every document; nobody else can see it.", jp: "初回は「署名を作成」で署名を描くかアップロードします。他の人には見えません。" },
      missing: { th: "มีลายเซ็นแล้ว กด 'ถัดไป'", en: "You already have one. Press Next.", jp: "署名は作成済みです。「次へ」を押します。" },
    },
    {
      target: "sign.waiting", action: "next", view: "signing",
      title: { th: "เอกสารที่รอคุณ", en: "Waiting for you", jp: "自分の署名待ち" },
      body: { th: "เรียงตามกำหนดส่ง เก่าที่สุดขึ้นก่อน แต่ละแถวบอกว่าต้องลงนามส่วนไหนและแบบไหน", en: "Ordered by due date, oldest first; each row says which block and which mark you are asked for.", jp: "期限順(古い順)に並びます。各行にどの欄・どの印が必要かが表示されます。" },
    },
    {
      target: "sign.open", action: "click", view: "signing",
      title: { th: "กด 'เปิดและลงนาม'", en: "Press Open & sign", jp: "「開いて署名」を押す" },
      body: { th: "เปิดเอกสารที่จะลงนาม", en: "It opens the document to sign.", jp: "署名する文書が開きます。" },
      missing: { th: "ยังไม่มีเอกสารรอลายเซ็นของคุณ", en: "No document is waiting for your signature.", jp: "署名待ちの文書はありません。" },
    },
    {
      target: "sign.file", action: "next", view: "signing",
      title: { th: "ตรวจไฟล์", en: "Check the file", jp: "ファイルを確認" },
      body: { th: "ไฟล์นี้แก้ไขไม่ได้ ถ้าต้นฉบับผิดต้องออก revision ใหม่ กดดูตัวอย่างเพื่อตรวจไฟล์และลายเซ็นที่มีอยู่", en: "This file cannot change; a wrong original needs a new revision. Use the preview to check the file and the signatures so far.", jp: "このファイルは変更できません。原本に誤りがあれば新しいリビジョンが必要です。プレビューでファイルと既存の署名を確認します。" },
    },
    {
      target: "sign.panel", action: "next", view: "signing",
      title: { th: "ตำแหน่งลายเซ็น", en: "Where the signature goes", jp: "署名の位置" },
      body: { th: "ดูตัวอย่าง ย้าย และย่อขยายลายเซ็นได้ ใส่หมายเหตุได้ หมายเหตุเก็บไว้ในประวัติของเอกสาร", en: "Preview, move and resize the signature, and add a note; the note is kept in the document's history.", jp: "署名をプレビュー・移動・拡大縮小でき、メモも残せます。メモは文書の履歴に保存されます。" },
    },
    {
      target: "sign.submit", action: "click", view: "signing",
      title: { th: "ลงนาม", en: "Sign", jp: "署名" },
      body: {
        th: "กด 'SIGN DOCUMENT' ระบบอาจให้ยืนยันตัวตนอีกครั้ง แล้วส่งต่อให้คนถัดไป ถ้าแค่ฝึก ไม่ต้องกดปุ่มนี้ ให้กด 'จบบทสอน'",
        en: "Press SIGN DOCUMENT; you may be asked to confirm who you are, then it moves on to the next signer. Only practising? Don't press it; press Finish.",
        jp: "「SIGN DOCUMENT」を押します。本人確認を求められる場合があり、その後次の署名者へ回ります。練習だけなら押さずに「完了」を押します。",
      },
    },
  ],
};

const KNOWLEDGE_FIND: Guide = {
  id: "knowledge-find",
  area: "tools",
  title: { th: "หาเอกสารใน Knowledge Hub", en: "Find a document in the Knowledge Hub", jp: "ナレッジハブで文書を探す" },
  summary: {
    th: "ค้น Standard, SOP และ Template ฉบับปัจจุบัน ดูเอกสารที่ต้องรับทราบ และเพิ่มเอกสารใหม่",
    en: "Search the current standards, SOPs and templates, see what you must acknowledge, and add a new document.",
    jp: "最新の標準・SOP・テンプレートを検索し、確認が必要な文書を見て、新しい文書を追加します。",
  },
  minutes: 2,
  permissions: ["knowledge.view"],
  views: ["knowledge"],
  invite: "knowledge",
  steps: [
    menu("knowledge",
      { th: "เปิดเมนูศูนย์ความรู้", en: "Open Knowledge Hub", jp: "「ナレッジハブ」を開く" },
      { th: "มาตรฐาน คู่มือ และความรู้ของทีมอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The team's standards, procedures and know-how are here. Click the highlighted menu entry.", jp: "チームの標準・手順・ノウハウがここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "[data-tab=\"register\"]", action: "click", view: "knowledge",
      title: { th: "ทะเบียนมาตรฐาน", en: "Standards Register", jp: "標準台帳" },
      body: { th: "Standard, SOP และ Template ทุกฉบับที่ใช้อยู่ คลิกแท็บนี้", en: "Every standard, SOP and template in force. Click this tab.", jp: "現在有効な標準・SOP・テンプレートの一覧です。このタブをクリックします。" },
    },
    {
      target: "kh.search", action: "next", view: "knowledge",
      title: { th: "ค้นหา", en: "Search", jp: "検索" },
      body: { th: "พิมพ์ชื่อ เลขเอกสาร หรือคำในเนื้อหา", en: "Type a title, a document number or a word from it.", jp: "件名・文書番号・本文の語句を入力します。" },
    },
    {
      target: "kh.register", action: "next", view: "knowledge",
      title: { th: "เอกสารและ revision ปัจจุบัน", en: "Documents and their current revision", jp: "文書と最新リビジョン" },
      body: { th: "หนึ่งแถวคือหนึ่งเอกสาร แสดง revision ที่ใช้อยู่ คลิกเพื่อเปิดอ่านหรือดาวน์โหลด", en: "One row per document with the revision in force; click one to read or download it.", jp: "1行が1文書で、有効なリビジョンが表示されます。クリックで閲覧・ダウンロードできます。" },
    },
    {
      target: "[data-tab=\"acknowledgements\"]", action: "click", view: "knowledge",
      title: { th: "รายการรับทราบของฉัน", en: "My Acknowledgements", jp: "自分の確認項目" },
      body: { th: "เอกสารที่คุณต้องอ่านและกดรับทราบอยู่ที่แท็บนี้", en: "Documents you must read and acknowledge are on this tab.", jp: "読んで確認する必要がある文書はこのタブにあります。" },
    },
    {
      target: "kh.new", action: "click", view: "knowledge",
      title: { th: "เพิ่มเอกสารใหม่", en: "Add a document", jp: "文書を追加" },
      body: { th: "กด 'เอกสารใหม่' เอกสารผ่านการตรวจและอนุมัติก่อนเผยแพร่ ถ้าแค่หาเอกสาร กด 'จบบทสอน'", en: "Press New Document; it is reviewed and approved before it is published. Only looking? Press Finish.", jp: "「新規文書」を押します。レビューと承認を経て公開されます。探すだけなら「完了」を押します。" },
      missing: { th: "ปุ่มนี้ขึ้นสำหรับคนที่เขียนเอกสารได้ กด 'จบบทสอน' ได้เลย", en: "The button shows for people who may write documents. Press Finish.", jp: "文書を作成できる人に表示されます。「完了」を押します。" },
    },
  ],
};

const DOWNLOADS: Guide = {
  id: "downloads-skill",
  area: "tools",
  title: { th: "ดาวน์โหลดโปรแกรมและติดตั้ง Skill", en: "Download software and install a skill", jp: "ソフトのダウンロードとスキルのインストール" },
  summary: {
    th: "ดาวน์โหลดโปรแกรมและไฟล์ของแผนก และติดตั้ง skill ของ Claude Code หรือ Codex จาก Skill Hub",
    en: "Download the department's software and files, and install a Claude Code or Codex skill from the Skill Hub.",
    jp: "部門のソフトとファイルをダウンロードし、Skill HubからClaude Code・Codexのスキルをインストールします。",
  },
  minutes: 2,
  permissions: [],
  views: ["downloads"],
  invite: "downloads",
  steps: [
    menu("downloads",
      { th: "เปิดเมนูศูนย์ดาวน์โหลด", en: "Open Download Center", jp: "「ダウンロードセンター」を開く" },
      { th: "โปรแกรม ไฟล์ และ skill ของแผนกอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The department's software, files and skills are here. Click the highlighted menu entry.", jp: "部門のソフト・ファイル・スキルがここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "[data-tab=\"files\"]", action: "click", view: "downloads",
      title: { th: "โปรแกรมและไฟล์", en: "Software & files", jp: "ソフトウェアとファイル" },
      body: { th: "ไฟล์จากโฟลเดอร์ดาวน์โหลดบน NAS แบ่งตามหมวด คลิกแท็บนี้", en: "Files from the NAS download folder, by category. Click this tab.", jp: "NASのダウンロードフォルダのファイルがカテゴリ別に並びます。このタブをクリックします。" },
    },
    {
      target: "dl.search", action: "next", view: "downloads",
      title: { th: "ค้นหาไฟล์", en: "Find a file", jp: "ファイルを探す" },
      body: { th: "พิมพ์ชื่อโปรแกรมหรือไฟล์", en: "Type the program or file name.", jp: "ソフト名またはファイル名を入力します。" },
    },
    {
      target: "dl.file", action: "next", view: "downloads",
      title: { th: "ดาวน์โหลด", en: "Download", jp: "ダウンロード" },
      body: { th: "กดปุ่มดาวน์โหลดของไฟล์ ระบบนับจำนวนครั้งที่ดาวน์โหลดให้ทีมเห็นว่าไฟล์ไหนใช้บ่อย", en: "Press the file's download button; downloads are counted so the team sees what is used.", jp: "ファイルのダウンロードボタンを押します。回数が数えられ、よく使うファイルが分かります。" },
      missing: { th: "ยังไม่มีไฟล์ในหมวดที่เปิดอยู่ กด 'ถัดไป'", en: "No file in the open category yet. Press Next.", jp: "開いているカテゴリにファイルがありません。「次へ」を押します。" },
    },
    {
      target: "[data-tab=\"skills\"]", action: "click", view: "downloads",
      title: { th: "Skill Hub", en: "Skill Hub", jp: "Skill Hub" },
      body: { th: "skill สำหรับ Claude Code และ Codex ที่ทีมทำไว้ คลิกแท็บนี้", en: "The team's skills for Claude Code and Codex. Click this tab.", jp: "チームが作ったClaude Code・Codex用スキルです。このタブをクリックします。" },
    },
    {
      target: "skill.search", action: "next", view: "downloads",
      title: { th: "ค้นหา skill", en: "Find a skill", jp: "スキルを探す" },
      body: { th: "พิมพ์ชื่อหรืองานที่อยากให้ AI ช่วย แล้วเลือก skill จากรายการ", en: "Type a name or the job you want help with, then pick a skill from the list.", jp: "名前や手伝ってほしい作業を入力し、一覧からスキルを選びます。" },
    },
    {
      target: "skill.install", action: "click", view: "downloads",
      title: { th: "ติดตั้ง", en: "Install", jp: "インストール" },
      body: { th: "กด 'ติดตั้งสำหรับ Claude' หรือ 'ติดตั้งสำหรับ Codex' ได้ไฟล์ติดตั้ง เปิดไฟล์แล้ว skill จะพร้อมใช้", en: "Press Install for Claude or Install for Codex to get the installer; run it and the skill is ready.", jp: "「Claude にインストール」または「Codex にインストール」でインストーラーを取得し、実行すると使えます。" },
      missing: { th: "เลือก skill ในรายการก่อน แล้วปุ่มติดตั้งจะขึ้น", en: "Pick a skill from the list first; the install buttons then appear.", jp: "先に一覧からスキルを選ぶとインストールボタンが表示されます。" },
    },
  ],
};

const SITE_MONITOR: Guide = {
  id: "site-monitor-check",
  area: "tools",
  title: { th: "ดูสถานะระบบที่ไซต์ลูกค้า", en: "Check a customer site in Site Monitor", jp: "サイトモニターで顧客サイトを確認" },
  summary: {
    th: "ดูปัญหาที่ยังเปิด สถานะโปรแกรม ผู้ดูแล และ log ที่ TMT Control Panel ส่งมาจากไซต์ลูกค้า",
    en: "See open problems, program status, the people responsible and the logs TMT Control Panel sends from a customer site.",
    jp: "顧客サイトからTMT Control Panelが送る未解決の問題・プログラム状態・担当者・ログを確認します。",
  },
  minutes: 2,
  permissions: ["monitor.read"],
  views: ["site-monitor", "installed-base"],
  invite: "site-monitor",
  browse: true,
  steps: [
    menu("site-monitor",
      { th: "เปิดเมนู Site Monitor", en: "Open Site Monitor", jp: "「サイトモニター」を開く" },
      { th: "ทุกไซต์ที่ติดตั้ง TMT Control Panel อยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every site running TMT Control Panel is here. Click the highlighted menu entry.", jp: "TMT Control Panelを導入したサイトがすべてここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "mon.sites", action: "click", clickOn: "tbody tr", view: "site-monitor",
      title: { th: "เปิดไซต์", en: "Open a site", jp: "サイトを開く" },
      body: { th: "คลิกแถวของไซต์ที่จะดู สีบอกว่าไซต์ไหนมีปัญหา", en: "Click the site's row; the colours show which sites have problems.", jp: "確認するサイトの行をクリックします。色で問題のあるサイトが分かります。" },
    },
    {
      target: "mon.problems", action: "next", view: "site-monitor",
      title: { th: "ปัญหาที่ยังเปิดอยู่", en: "Open problems", jp: "未解決の問題" },
      body: { th: "ปัญหาที่ระบบเจอและยังไม่ได้แก้ เรียงจากรุนแรงที่สุด", en: "Problems found and not yet fixed, most severe first.", jp: "検出されて未解決の問題が重大度順に並びます。" },
      missing: { th: "ไซต์นี้ไม่มีปัญหาค้าง กด 'ถัดไป'", en: "No open problems at this site. Press Next.", jp: "このサイトに未解決の問題はありません。「次へ」を押します。" },
    },
    {
      target: "mon.programs", action: "next", view: "site-monitor",
      title: { th: "โปรแกรมและ Service", en: "Programs & services", jp: "プログラムとサービス" },
      body: { th: "สถานะของแต่ละโปรแกรม คนที่มีสิทธิ์สั่ง Start, Stop หรือ Restart จากที่นี่ได้โดยไม่ต้องไปหน้างาน", en: "Each program's state. People with control rights can Start, Stop or Restart it from here without going on site.", jp: "各プログラムの状態です。権限がある人は現地に行かずに開始・停止・再起動できます。" },
    },
    {
      target: "mon.responsible", action: "next", view: "site-monitor",
      title: { th: "ผู้ดูแล", en: "Responsible people", jp: "担当者" },
      body: { th: "ผู้ดูแลลำดับ 1-2-3 ได้อีเมลตามลำดับเมื่อมีปัญหาและยังไม่มีคนรับเรื่อง", en: "Responsible people 1, 2 and 3 are emailed in turn while a problem stays unanswered.", jp: "問題に対応がない間、担当者1・2・3の順にメールが届きます。" },
    },
    {
      target: "mon.logs", action: "next", view: "site-monitor",
      title: { th: "Log", en: "Logs", jp: "ログ" },
      body: { th: "Log ที่ TMT Control Panel ส่งมา ค้นหาได้ ใช้ดูว่าเกิดอะไรก่อนมีปัญหา", en: "The logs TMT Control Panel sent, searchable, to see what happened before a problem.", jp: "TMT Control Panelから届いたログを検索でき、問題前の状況を確認できます。" },
    },
  ],
};

const ASSET_REGISTER: Guide = {
  id: "asset-register",
  area: "tools",
  title: { th: "ลงทะเบียนอุปกรณ์ที่ติดตั้งให้ลูกค้า", en: "Register equipment installed for a customer", jp: "顧客に納入した機器を登録" },
  summary: {
    th: "บันทึกอุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้า ผูกกับลูกค้า โปรเจกต์ และ Site Monitor พร้อมข้อมูลประกัน",
    en: "Record the equipment and software installed for a customer, linked to the customer, the project and Site Monitor, with its warranty.",
    jp: "顧客に納入した機器・ソフトを記録し、顧客・案件・サイトモニターと関連付け、保証情報も登録します。",
  },
  minutes: 3,
  permissions: ["asset.read", "asset.manage"],
  views: ["installed-base"],
  invite: "installed-base",
  steps: [
    menu("installed-base",
      { th: "เปิดเมนูทะเบียนอุปกรณ์ลูกค้า", en: "Open Installed Base", jp: "「納入機器台帳」を開く" },
      { th: "อุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้าทั้งหมดอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Everything installed for customers is here. Click the highlighted menu entry.", jp: "顧客に納入した機器とソフトがすべてここにあります。強調表示のメニューをクリックします。" }),
    {
      target: "asset.new", action: "click", view: "installed-base",
      title: { th: "กด 'ลงทะเบียนอุปกรณ์'", en: "Press Register asset", jp: "「機器を登録」を押す" },
      body: { th: "เปิดฟอร์มอุปกรณ์ใหม่ ระบบออกเลขทะเบียนให้", en: "It opens the form for a new asset; the asset number is given for you.", jp: "新しい機器のフォームが開きます。機器番号は自動で付きます。" },
      missing: { th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์ลงทะเบียนอุปกรณ์", en: "If the button never appears, this account cannot register assets.", jp: "ボタンが表示されない場合、このアカウントには登録権限がありません。" },
    },
    {
      target: "asset.name", action: "next", view: "installed-base",
      title: { th: "ชื่อ ประเภท และสถานะ", en: "Name, category and status", jp: "名称・種別・状態" },
      body: { th: "ตั้งชื่อที่ลูกค้าและทีมเรียกกัน แล้วเลือกประเภทและสถานะ", en: "Use the name the customer and the team call it, then pick its category and status.", jp: "顧客とチームが呼ぶ名前を付け、種別と状態を選びます。" },
    },
    {
      target: "asset.customer", action: "next", view: "installed-base",
      title: { th: "ลูกค้าและที่ตั้ง", en: "Customer and location", jp: "顧客と設置場所" },
      body: { th: "เลือกลูกค้าและ Site ของลูกค้า ถ้าอยู่ในตู้ เลือกตู้และตำแหน่งด้านล่าง", en: "Choose the customer and their site; if it sits in a cabinet, choose the cabinet and position below.", jp: "顧客と顧客拠点を選びます。盤内にある場合は下で盤と位置を選びます。" },
    },
    {
      target: "asset.project", action: "next", view: "installed-base",
      title: { th: "โปรเจกต์", en: "Project", jp: "案件" },
      body: { th: "โปรเจกต์ที่ติดตั้งอุปกรณ์นี้ ใช้ย้อนดูงานเดิมเมื่อลูกค้าแจ้งปัญหา", en: "The project that installed it, for looking back when the customer reports a problem.", jp: "この機器を納入した案件です。顧客から問題が来たときに経緯をたどれます。" },
    },
    {
      target: "asset.serial", action: "next", view: "installed-base",
      title: { th: "ข้อมูลเครื่อง", en: "Machine details", jp: "機器情報" },
      body: { th: "ผู้ผลิต รุ่น Serial number, IP และเวอร์ชัน ใช้ตอนซ่อมหรืออัปเดต", en: "Maker, model, serial number, IP and version, for repairs and updates.", jp: "メーカー・型式・シリアル番号・IP・バージョンです。修理や更新時に使います。" },
    },
    {
      target: "asset.warranty", action: "next", view: "installed-base",
      title: { th: "วันติดตั้งและประกัน", en: "Installed and warranty", jp: "設置日と保証" },
      body: { th: "ใส่วันติดตั้งและวันหมดประกัน เพื่อรู้ว่างานซ่อมคิดเงินหรืออยู่ในประกัน", en: "Enter the installation date and warranty end, so a repair is known to be billable or under warranty.", jp: "設置日と保証期限を入れると、修理が有償か保証内かが分かります。" },
    },
    {
      target: "asset.monitor", action: "next", view: "installed-base",
      title: { th: "Site ใน Site Monitor", en: "Site Monitor site", jp: "サイトモニターのサイト" },
      body: { th: "ถ้าไซต์นี้มี TMT Control Panel ผูกไว้ จะเห็นสถานะเครื่องจริงจากหน้าอุปกรณ์", en: "If the site runs TMT Control Panel, link it to see the live status from the asset.", jp: "サイトにTMT Control Panelがあれば関連付けると、機器画面から稼働状態を見られます。" },
    },
    {
      target: "asset.save", action: "click", view: "installed-base",
      title: { th: "บันทึก", en: "Save", jp: "保存" },
      body: { th: "กด 'บันทึก' อุปกรณ์จะขึ้นในทะเบียนพร้อมประวัติ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'", en: "Press Save and the asset joins the register with its history. Only practising? Press Cancel, then Finish.", jp: "「保存」を押すと履歴付きで台帳に載ります。練習だけなら「キャンセル」を押してから「完了」を押します。" },
    },
  ],
};

/*
 * Menu screens with no guide, and why (owner rule 2026-11-02: a new feature updates the guides). tests/guides.test.mjs
 * fails when a menu screen has neither a guide nor an entry here, so a new screen cannot ship without one or the other.
 */
export const NO_GUIDE: Readonly<Record<string, string>> = {
  "dashboard": "Read-only overview; each tile opens a screen that has its own guide.",
  "crm-customers": "Customer records are looked up and added from the deal form (crm-deal-create).",
  "crm-contacts": "Contacts are searched and added from the deal form (crm-deal-create).",
  "missing": "Read-only list of estimate lines still waiting for a supplier price; prices arrive through supplier-quotation.",
  "procurement": "Read-only procurement dashboard.",
  "pos": "Purchase orders are raised in Pegasus ERP (owner decision 2026-10-08); this screen only lists them.",
  "inventory": "Stock is kept in Pegasus ERP (owner decision 2026-10-08); the screen holds history only.",
  "receiving": "Goods receiving is done in Pegasus ERP (owner decision 2026-10-08).",
  "issues": "Material issues follow the ERP stock (owner decision 2026-10-08); no in-app flow to teach yet.",
  "stamps": "Company stamp authority set up by admins.",
  "activity": "Read-only team activity for heads.",
  "performance": "KPI reviews are written by heads in a review cycle; add a guide when that flow next changes.",
  "summary-reports": "Read-only report analytics.",
  "customers": "Master data kept by admins; staff with CRM use the CRM customer screens.",
  "suppliers": "Master data kept by admins.",
  "employees": "Master data kept by admins.",
  "material-master": "Master data kept by admins.",
  "visit-master": "Reference data for site visits, kept by coordinators.",
  "schedule-templates": "Master schedules kept by planners; used from project-create.",
  "module-templates": "Estimate templates kept by estimating leads; used from estimate-create.",
  "labor-packages": "Labour packages are saved and applied from the estimate's labour tab (estimate-create).",
  "rates": "Labour rate master kept by estimating leads.",
  "user-accounts": "Admin-only account and role management.",
  "audit": "Admin-only audit log.",
  "settings": "Admin-only settings.",
  "manual": "The full illustrated manual; the guide list links to it.",
};

export const GUIDES: readonly Guide[] = [
  CRM_DEAL_CREATE,
  CRM_ACTIVITY,
  CRM_SEND_ESTIMATE,
  {
    id: "inquiry-create",
    area: "sales",
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
          th: "ลากไฟล์มาวางหรือคลิกเพื่อเลือก (PDF, Office, DWG, STEP, อีเมล Outlook, ZIP/RAR/7z หรือรูป ไม่เกิน 50 MB ต่อไฟล์) ไฟล์จะอัปโหลดตอนกดบันทึก ถ้าไฟล์ไหนอัปโหลดไม่ผ่าน ระบบจะบอกชื่อไฟล์และเหตุผล ให้แนบใหม่ที่แท็บไฟล์แนบ",
          en: "Drag files here or click to browse (PDF, Office, DWG, STEP, Outlook email, ZIP/RAR/7z or images, up to 50 MB each). They upload when you save. A file that does not upload is named with the reason; attach it again from the Attachments tab.",
          jp: "ファイルをドラッグするかクリックして選択します(PDF・Office・DWG・STEP・Outlookメール・ZIP/RAR/7z・画像、1ファイル50MBまで)。保存時にアップロードされます。アップロードできなかったファイルは名前と理由が表示されるので、添付ファイルタブから添付し直します。",
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
    // Engineers hold inquiry.write from migration 094, and Project Manager, Engineering Manager and Leader from 095
    // (owner 2026-11-02), so the estimator and the heads attach files too.
    id: "inquiry-attach",
    area: "sales",
    title: { th: "แนบไฟล์เข้า Inquiry ที่มีอยู่", en: "Attach a file to an inquiry", jp: "既存の引合にファイルを添付" },
    summary: {
      th: "เพิ่มไฟล์ที่ลูกค้าส่งมาทีหลัง เช่น แบบ สเปก หรืออีเมล เข้า Inquiry เดิม ไฟล์จะตามไปที่ Project เมื่อสร้าง Project",
      en: "Add a file the customer sent later, such as a drawing, a specification or an email, to an existing inquiry. It is carried into the Project when the Project is created.",
      jp: "後から届いた図面・仕様書・メールなどを既存の引合に追加します。プロジェクト作成時に引き継がれます。",
    },
    minutes: 2,
    permissions: ["inquiry.write"],
    views: ["inquiries"],
    steps: [
      inquiryMenu,
      openInquiry({
        th: "คลิกที่แถวของ Inquiry ที่จะแนบไฟล์",
        en: "Click the row of the inquiry the file belongs to.",
        jp: "ファイルを添付する引合の行をクリックします。",
      }),
      {
        target: "[data-tab=\"attachments\"]", action: "click", view: "inquiries",
        title: { th: "เปิดแท็บไฟล์แนบ", en: "Open the Attachments tab", jp: "添付ファイルタブを開く" },
        body: {
          th: "แท็บนี้แสดงไฟล์ทั้งหมดของ Inquiry พร้อมหมวด ขนาด และผู้อัปโหลด",
          en: "It lists every file on the inquiry with its category, size and who uploaded it.",
          jp: "引合のすべてのファイルが、分類・サイズ・アップロード者とともに表示されます。",
        },
      },
      {
        target: "inquiry.upload", action: "click", view: "inquiries",
        title: { th: "กด 'อัปโหลด'", en: "Press Upload", jp: "「アップロード」を押す" },
        body: {
          th: "ปุ่มอยู่มุมขวาบนของกล่องไฟล์แนบ",
          en: "It is at the top right of the Attachments panel.",
          jp: "添付ファイル欄の右上にあります。",
        },
        missing: {
          th: "ถ้าไม่มีปุ่มนี้ แปลว่า Inquiry นี้ถูกยกเลิกหรือเก็บเข้าคลังแล้ว หรือบัญชีนี้ยังไม่มีสิทธิ์แก้ Inquiry",
          en: "No button means the inquiry is cancelled or archived, or this account cannot change inquiries.",
          jp: "ボタンがない場合、引合が取消またはアーカイブ済みか、このアカウントに引合の変更権限がありません。",
        },
      },
      {
        target: "inquiry.attachCategory", action: "next", view: "inquiries",
        title: { th: "เลือกหมวดเอกสาร", en: "Choose the document category", jp: "文書分類を選ぶ" },
        body: {
          th: "เช่น Customer RFQ, Drawing หรือ Specification หมวดนี้ใช้จัดไฟล์เมื่อส่งต่อไปที่ Project",
          en: "For example Customer RFQ, Drawing or Specification. The category files it when it moves to the Project.",
          jp: "Customer RFQ、Drawing、Specification などを選びます。プロジェクトへ引き継ぐときの分類に使われます。",
        },
      },
      {
        target: "inquiry.attachFile", action: "next", view: "inquiries",
        title: { th: "เลือกไฟล์", en: "Choose the file", jp: "ファイルを選ぶ" },
        body: {
          th: "รับ PDF, Office, DWG/DXF, STEP/IGES, อีเมล Outlook (.msg, .eml), ZIP/RAR/7z และรูป ไม่เกิน 50 MB ต่อไฟล์ แนบได้ครั้งละหนึ่งไฟล์",
          en: "PDF, Office, DWG/DXF, STEP/IGES, Outlook email (.msg, .eml), ZIP/RAR/7z and images are accepted, up to 50 MB each, one file at a time.",
          jp: "PDF・Office・DWG/DXF・STEP/IGES・Outlookメール(.msg、.eml)・ZIP/RAR/7z・画像を受け付けます。1ファイル50MBまで、1回に1ファイルです。",
        },
      },
      {
        target: "inquiry.attachUpload", action: "click", view: "inquiries",
        title: { th: "อัปโหลด", en: "Upload it", jp: "アップロード" },
        body: {
          th: "กด 'อัปโหลด' ไฟล์จะขึ้นในรายการทันที ถ้าแค่ฝึก ให้กด 'ยกเลิก' ข้างๆ แล้วกด 'จบบทสอน' จะไม่มีไฟล์ถูกบันทึก",
          en: "Press Upload and the file appears in the list. Only practising? Press Cancel beside it, then Finish; nothing is saved.",
          jp: "「アップロード」を押すと一覧に表示されます。練習だけなら横の「キャンセル」を押してから「完了」を押します。何も保存されません。",
        },
      },
    ],
  },
  {
    id: "site-visit-request",
    area: "sales",
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
  CRM_PROPOSAL_WON,
  {
    id: "estimate-create",
    area: "estimate",
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
  SUPPLIER_QUOTATION,
  PRICE_LIBRARY,
  PROJECT_CREATE,
  PROJECT_PLAN,
  PROJECT_MASTER_PLAN,
  TEAM_TASK,
  BOM_RELEASE,
  ESTIMATE_APPROVE,
  {
    id: "purchase-request",
    area: "purchase",
    title: { th: "ขอซื้อ (PR) จาก BOM", en: "Raise a purchase requisition from a BOM", jp: "BOMから購買申請を作成" },
    summary: {
      th: "เลือก BOM ที่เผยแพร่แล้ว เลือกรายการที่จะซื้อ ตรวจยอดกับงบของ Module แล้วสร้าง PR ให้หัวหน้าแผนกและผู้อนุมัติขั้นสุดท้ายอนุมัติ แล้วส่งเข้า ERP",
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
          th: "ดูยอดขอซื้อเทียบงบของ Module แถวที่มีข้อความสีแดงต้องแก้ก่อนส่ง ถ้า Module เกินงบ ผู้อนุมัติต้องใส่เหตุผลตอนอนุมัติ",
          en: "Compare the total with the module budgets. Rows with red text must be fixed first. Over a module's budget, the approver gives a reason.",
          jp: "申請額をモジュール予算と比べます。赤字の行は先に修正します。予算超過の場合、承認者が承認時に理由を記入します。",
        },
      },
      {
        target: "pr.approvers", action: "next", view: "purchase",
        title: { th: "ใครอนุมัติ", en: "Who approves", jp: "承認者" },
        body: {
          th: "ช่องผู้อนุมัติบอกว่าใบนี้ไปให้หัวหน้าแผนกของคุณก่อน แล้วไปที่ผู้อนุมัติขั้นสุดท้าย จากนั้นระบบส่งเข้า ERP เอง ทุกครั้งที่มีคนอนุมัติหรือไม่อนุมัติ คุณได้แจ้งเตือนที่กระดิ่งและทางอีเมล",
          en: "The approvers box shows the PR goes to your department head first, then to the final approver, then to the ERP by itself. Each time someone approves or rejects it, you get a notification and an email.",
          jp: "承認者欄のとおり、まず部門長、次に最終承認者が承認し、その後自動でERPに送られます。承認・却下のたびに通知とメールが届きます。",
        },
      },
      {
        target: "pr.submit", action: "click", view: "purchase",
        title: { th: "สร้าง PR", en: "Raise the PR", jp: "PRを作成" },
        body: {
          th: "กด 'สร้าง PR' แล้วกด 'Submit' ที่รายการ PR ใบนี้จะไปให้หัวหน้าแผนกและผู้อนุมัติขั้นสุดท้าย แล้วส่งเข้า ERP อัตโนมัติ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
          en: "Press the create PR button, then Submit in the list: it goes to your department head and the final approver, then to the ERP automatically. Only practising? Press Cancel, then Finish.",
          jp: "PR作成ボタンを押し、一覧で「提出」を押すと部門長と最終承認者の承認へ回り、その後自動でERPに送られます。練習だけなら「キャンセル」を押してから「完了」を押します。",
        },
      },
    ],
  },
  PR_APPROVE,
  PR_FIX,
  {
    id: "my-work-progress",
    area: "project",
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
  SITE_VISIT_WORK,
  REPORT_CREATE,
  SIGN_DOCUMENT,
  KNOWLEDGE_FIND,
  DOWNLOADS,
  SITE_MONITOR,
  ASSET_REGISTER,
  {
    id: "support-ticket",
    area: "tools",
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
