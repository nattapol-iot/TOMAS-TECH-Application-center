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

/**
 * A task some people do without its permission (2026-11-25): the named PR and estimate approvers (migrations 097, 101, 116)
 * decide without the approve permission, and the Application team creates a project without an estimate without
 * project.write.
 */
export type GuideDuty = "purchase-approver" | "estimate-approver" | "project-without-estimate";

export type Guide = {
  id: string;
  area: GuideArea;
  title: GuideCopy;
  summary: GuideCopy;
  minutes: number;
  /** Every permission the task needs; the guide is offered only to people who hold them all. */
  permissions: readonly string[];
  /** Also offered to someone with this duty, who does the task without the permissions above. */
  orDuty?: GuideDuty;
  /** Screens where the guide is listed first. */
  views: readonly string[];
  /** The screen that invites a newcomer to this guide the first time it is opened. */
  invite?: string;
  /** A guide that only shows where things are. Nothing is saved, so its last step may be a note instead of a click. */
  browse?: boolean;
  steps: readonly GuideStep[];
};

const menu = (view: string, title: GuideCopy, body: GuideCopy): GuideStep => ({
  target: `nav.${view}`,
  action: "click",
  view,
  canGo: true,
  title,
  body,
  missing: {
    th: "ถ้าไม่เห็นเมนูนี้ ให้กดชื่อกลุ่มในเมนูด้านซ้ายเพื่อกางออก หรือกด 'ไปที่หน้านี้'",
    en: "If you cannot see this entry, press its group heading in the side menu to open the group, or press Go to this screen.",
    jp: "このメニューが見えない場合は、左メニューのグループ名を押して開くか、「この画面へ」を押します。",
  },
});

const inquiryMenu = menu(
  "inquiries",
  { th: "เปิดเมนูงานประเมินราคา / Inquiry", en: "Open RFQ intake & estimating", jp: "「見積作業・Inquiry」を開く" },
  {
    th: "งานจากลูกค้าทุกเรื่องเริ่มที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่",
    en: "Every customer request starts here. Click the highlighted menu entry.",
    jp: "顧客からの依頼はすべてここから始まります。強調表示のメニューをクリックします。",
  },
);

const openInquiry = (body: GuideCopy): GuideStep => ({
  target: "inquiry.list",
  action: "click",
  clickOn: "tbody tr",
  view: "inquiries",
  title: { th: "เปิด Inquiry", en: "Open the inquiry", jp: "引合を開く" },
  body,
  missing: {
    th: "รอให้รายการโหลดสักครู่ ถ้ายังเปิด Inquiry เรื่องอื่นอยู่ ให้กดลิงก์ย้อนกลับด้านบนของหน้า",
    en: "Wait a moment for the list to load. If another inquiry is open, use the back link at the top of the page.",
    jp: "一覧の読み込みを少し待ちます。別の引合を開いている場合は、ページ上部の戻るリンクを使います。",
  },
});

const dealsMenu = menu(
  "crm-opportunities",
  { th: "เปิดเมนูโอกาสขาย / ติดตามงานขาย", en: "Open Opportunities / sales follow-up", jp: "「商談・営業フォロー」を開く" },
  {
    th: "ดีลทุกเรื่องของลูกค้าอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่",
    en: "Every customer deal lives here. Click the highlighted menu entry.",
    jp: "顧客の商談はすべてここにあります。強調表示のメニューをクリックします。",
  },
);

const openDeal = (body: GuideCopy): GuideStep => ({
  target: "crm.deals",
  action: "click",
  clickOn: ".crm-deal-name, .crm-opportunity-card",
  view: "crm-opportunities",
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
      target: "crm.new",
      action: "click",
      view: "crm-opportunities",
      title: { th: "กด 'เพิ่มโอกาสทางการขาย'", en: "Press New opportunity", jp: "「商談を作成」を押す" },
      body: { th: "ปุ่มอยู่มุมขวาบน เปิดฟอร์มดีลใหม่", en: "It is at the top right and opens the new deal form.", jp: "右上にあり、新しい商談のフォームが開きます。" },
      missing: {
        th: "ถ้ากำลังเปิดดีลอยู่ ให้กด 'กลับ' ด้านบนก่อน ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้างดีล",
        en: "If a deal is open, press Back at the top first. If the button never appears, this account cannot create deals.",
        jp: "商談を開いている場合は、先に上部の「戻る」を押します。ボタンが表示されない場合、このアカウントには作成権限がありません。",
      },
    },
    {
      target: "crm.deal.customer",
      action: "next",
      view: "crm-opportunities",
      title: { th: "เลือกลูกค้า", en: "Choose the customer", jp: "顧客を選ぶ" },
      body: {
        th: "พิมพ์ชื่อหรือรหัสบริษัทแล้วเลือกจากรายการ ถ้าบริษัทที่ใช้งานจริงเป็นบริษัทอื่น เลือกในช่อง End user ข้างๆ",
        en: "Type the company's name or code and pick it from the list. If another company will use the system, choose it under End user beside it.",
        jp: "会社名またはコードを入力して一覧から選びます。実際に使う会社が別なら、隣のエンドユーザー欄で選びます。",
      },
    },
    {
      target: "crm.deal.name",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ตั้งชื่อดีล", en: "Name the deal", jp: "商談名を付ける" },
      body: {
        th: "ใช้ชื่อที่บอกว่าลูกค้าต้องการอะไร เช่น 'ระบบ OEE ไลน์ประกอบ 3' ถ้าลูกค้ามีดีลชื่อคล้ายกันที่ยังเปิดอยู่ จะขึ้นรายการเตือนใต้ช่องนี้ระหว่างพิมพ์",
        en: "Say what the customer wants, e.g. 'OEE system for assembly line 3'. If the customer has an open deal with a similar name, it is listed under the field as you type.",
        jp: "顧客の要望が分かる名前にします(例:「組立ライン3 OEEシステム」)。似た名前の進行中の商談があると、入力中に下に表示されます。",
      },
    },
    {
      target: "crm.deal.contact",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ผู้ติดต่อ", en: "The contact", jp: "担当者" },
      body: {
        th: "ค้นหาด้วยชื่อ ตำแหน่ง หรือแผนก ถ้ายังไม่มีในระบบ พิมพ์ชื่อแล้วเลือกแถวสุดท้าย 'เพิ่มผู้ติดต่อใหม่' เพิ่มได้ทันทีโดยไม่ต้องออกจากฟอร์ม",
        en: "Search by name, position or department. Not listed yet? Type the name and pick the last row, Add a new contact, without leaving the form.",
        jp: "氏名・役職・部署で検索します。未登録なら名前を入力し、最後の行「新しい担当者を追加」でフォームのまま追加できます。",
      },
    },
    {
      target: "crm.deal.owner",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ผู้รับผิดชอบ", en: "The owners", jp: "責任者" },
      body: {
        th: "ผู้รับผิดชอบงานขายคือคนที่ติดตามลูกค้า ผู้รับผิดชอบเทคนิคคือวิศวกรที่ดูแลเนื้องาน ตอนส่งประเมินราคา ระบบตั้งเขาเป็นผู้ประเมินให้",
        en: "The sales owner follows up the customer; the technical owner is the engineer for the work, and becomes the estimator when the deal is sent for estimating.",
        jp: "営業担当者が顧客をフォローし、技術担当者が技術面を担当します。見積依頼時には技術担当者が見積担当になります。",
      },
    },
    {
      target: "crm.deal.close",
      action: "next",
      view: "crm-opportunities",
      title: { th: "วันที่คาดว่าจะปิดงาน", en: "Expected close", jp: "受注予定日" },
      body: {
        th: "วันที่คาดว่าลูกค้าจะตัดสินใจ ใช้เรียงดีลและดูภาพรวมงานขายรายเดือน แก้ได้ทุกเมื่อ",
        en: "When you expect the customer to decide. It orders the deals and the monthly sales view, and can change at any time.",
        jp: "顧客が決定する見込みの日です。商談の並び順や月次の営業状況に使われ、いつでも変更できます。",
      },
    },
    {
      target: "crm.deal.nextAction",
      action: "next",
      view: "crm-opportunities",
      title: { th: "สิ่งที่ต้องทำถัดไป", en: "The next action", jp: "次のアクション" },
      body: {
        th: "ใส่สิ่งที่จะทำต่อและกำหนดเสร็จ เช่น 'นัดเข้าพบลูกค้า' ดีลที่ไม่มีสิ่งที่ต้องทำจะขึ้นเตือนในรายการ",
        en: "Enter what happens next and when, e.g. 'Meet the customer'. A deal with no next action is flagged in the list.",
        jp: "次に行うことと期限を入力します(例:「顧客訪問」)。次のアクションがない商談は一覧で警告されます。",
      },
    },
    {
      target: "crm.deal.more",
      action: "next",
      view: "crm-opportunities",
      title: { th: "รายละเอียดเพิ่มเติม", en: "Additional details", jp: "詳細情報" },
      body: {
        th: "กดเพื่อเปิด: ที่มาของดีล ความสำคัญ โอกาสได้งาน คู่แข่ง ความต้องการ และขอบเขตงาน ไม่บังคับ ใส่ทีหลังได้",
        en: "Open it for the source, priority, probability, competitor, need and scope. All optional; fill them in later if you like.",
        jp: "開くと商談の出所、優先度、受注確度、競合、要望、範囲を入力できます。任意で、後からでも構いません。",
      },
    },
    {
      target: "crm.save",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.followups",
      action: "next",
      view: "crm-opportunities",
      title: { th: "สิ่งที่ต้องทำ / ติดตาม", en: "Next actions / Follow-up", jp: "次のアクション・フォローアップ" },
      body: {
        th: "งานติดตามของดีลนี้อยู่ที่นี่ พร้อมผู้รับผิดชอบและกำหนดเสร็จ กด 'แก้ไข' เพื่อปิดงานที่ทำแล้ว ถ้าดีลไม่มีงานค้าง จะขึ้นเตือนสีเหลือง",
        en: "The deal's follow-ups are here with their owners and due dates. Press Edit to close one that is done. A deal with nothing open shows an amber warning.",
        jp: "この商談のフォローアップが担当者・期限とともに表示されます。完了したものは「編集」で閉じます。未完了がない場合は黄色の警告が出ます。",
      },
    },
    {
      target: "crm.tab.activities",
      action: "click",
      view: "crm-opportunities",
      title: { th: "แท็บกิจกรรม", en: "The Activities tab", jp: "「活動」タブ" },
      body: {
        th: "รวมทุกครั้งที่คุยกับลูกค้าของดีลนี้ เรียงจากล่าสุด คลิกแท็บนี้",
        en: "Every contact with the customer on this deal, latest first. Click this tab.",
        jp: "この商談での顧客とのやり取りが新しい順に並びます。このタブをクリックします。",
      },
    },
    {
      target: "crm.addActivity",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.activity.type",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ประเภทและเวลา", en: "Type and time", jp: "種別と日時" },
      body: {
        th: "เลือกว่าเป็นการประชุม โทร อีเมล เข้าหน้างาน หรืออื่นๆ และแก้วันที่ / เวลาให้ตรงกับที่เกิดขึ้นจริง",
        en: "Choose meeting, call, email, site visit or another type, and set the date and time it really happened.",
        jp: "打合せ・電話・メール・現地訪問などの種別を選び、実際の日時に合わせます。",
      },
    },
    {
      target: "crm.activity.summary",
      action: "next",
      view: "crm-opportunities",
      title: { th: "สรุปสิ่งที่คุย", en: "What was discussed", jp: "話した内容" },
      body: {
        th: "สรุปสั้นๆ ว่าคุยอะไร ช่องด้านล่างใส่ข้อสรุปสำคัญและรายการที่ต้องทำ คนอื่นในทีมจะเห็นต่อจากคุณได้ทันที",
        en: "A short summary of the conversation; the fields below take the key decision and the action items. The team picks up from it at once.",
        jp: "話した内容を短くまとめます。下の欄に主な決定と対応事項を書きます。チームはすぐに内容を引き継げます。",
      },
    },
    {
      target: "crm.activity.next",
      action: "next",
      view: "crm-opportunities",
      title: { th: "เพิ่มสิ่งที่ต้องทำ", en: "Add the next action", jp: "次のアクションを追加" },
      body: {
        th: "กดเพื่อเปิด แล้วใส่สิ่งที่ต้องทำต่อ ผู้รับผิดชอบ และกำหนดเสร็จ จะไปขึ้นในส่วน 'สิ่งที่ต้องทำ / ติดตาม' ของดีลและแจ้งเตือนเมื่อใกล้ครบกำหนด",
        en: "Open it and enter what happens next, who does it and by when. It joins the deal's follow-ups and is flagged as it falls due.",
        jp: "開いて次に行うこと、担当者、期限を入力します。商談のフォローアップに追加され、期限が近づくと警告されます。",
      },
    },
    {
      target: "crm.save",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.convert",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.convert.owner",
      action: "next",
      view: "crm-opportunities",
      title: { th: "วิศวกรผู้ประเมิน", en: "The estimating engineer", jp: "見積担当のエンジニア" },
      body: {
        th: "คนที่จะทำราคา ระบบใส่ผู้รับผิดชอบเทคนิคของดีลไว้ให้ เปลี่ยนได้ เขาจะได้รับอีเมลแจ้งงานและเห็นงานใน 'งานของฉัน'",
        en: "Who will price it. The deal's technical owner is filled in and can be changed; they are emailed and see it in My Work.",
        jp: "見積を行う人です。商談の技術担当者が入力済みで、変更できます。メールで通知され、マイワークに表示されます。",
      },
    },
    {
      target: "crm.convert.due",
      action: "next",
      view: "crm-opportunities",
      title: { th: "กำหนดส่งราคา", en: "Estimate due date", jp: "見積期限" },
      body: {
        th: "วันที่ต้องได้ราคาเพื่อตอบลูกค้า ค่าเริ่มต้นคืออีก 14 วัน",
        en: "When the price is needed to answer the customer. It starts 14 days ahead.",
        jp: "顧客へ回答するために価格が必要な日です。初期値は14日後です。",
      },
    },
    {
      target: "crm.convert.type",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ประเภทโครงการ", en: "Project type", jp: "案件種別" },
      body: {
        th: "เลือกประเภทงาน เช่น IoT, Automation หรือ Robot ใช้จัดกลุ่มงานประเมินและรายงาน",
        en: "Choose the kind of work, such as IoT, Automation or Robot. It groups the estimating work and the reports.",
        jp: "IoT・Automation・Robotなど作業の種類を選びます。見積作業とレポートの分類に使われます。",
      },
    },
    {
      target: "crm.convert.carry",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ข้อมูลที่ตามไป", en: "What carries across", jp: "引き継がれる情報" },
      body: {
        th: "ลูกค้า ผู้ติดต่อ ความต้องการ ขอบเขตงาน และไฟล์ของดีลจะไปอยู่ใน Inquiry เอง ไม่ต้องกรอกซ้ำ",
        en: "The customer, contact, need, scope and the deal's files go to the inquiry by themselves; nothing is typed twice.",
        jp: "顧客、担当者、要望、範囲、商談のファイルは引合に自動で引き継がれます。二重入力は不要です。",
      },
    },
    {
      target: "crm.save",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.stagebar",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ดีลอยู่ขั้นไหน", en: "Where the deal stands", jp: "商談のステージ" },
      body: {
        th: "แถบนี้บอกขั้นของดีล ตั้งแต่ใหม่จนชนะ การบันทึกในขั้นถัดไปจะเลื่อนดีลไปขั้นเสนอราคาและขั้นชนะให้เอง",
        en: "This bar shows the deal's stage from new to won. The next two records move it to the quotation stage and to won for you.",
        jp: "このバーは新規から受注までの商談ステージを示します。次の2つの記録で、見積と受注のステージへ自動で進みます。",
      },
    },
    {
      target: "crm.recordProposal",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.evidence",
      action: "next",
      view: "crm-opportunities",
      title: { th: "วันที่และเลขใบเสนอราคา", en: "Quotation date and number", jp: "見積の日付と番号" },
      body: {
        th: "ใส่วันที่ส่งจริงและเลขใบเสนอราคาหรือหลักฐานการส่ง ต้องมีทั้งสองช่อง ทีมใช้ข้อมูลนี้นับยอดเสนอราคา",
        en: "Enter the real sending date and the quotation number or dispatch reference. Both are required; the team counts quotations from them.",
        jp: "実際の送付日と見積番号または送付記録を入力します。両方必須で、見積実績の集計に使われます。",
      },
    },
    {
      target: "crm.save",
      action: "click",
      view: "crm-opportunities",
      title: { th: "บันทึกการส่งใบเสนอราคา", en: "Save the quotation", jp: "見積送付を保存" },
      body: {
        th: "กด 'บันทึก' ดีลจะเลื่อนไปขั้นเสนอราคา ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วไปขั้นถัดไป",
        en: "Press Save and the deal moves to the quotation stage. Only practising? Press Cancel and carry on.",
        jp: "「保存」を押すと商談が見積ステージへ進みます。練習だけなら「キャンセル」を押して次へ進みます。",
      },
    },
    {
      target: "crm.recordWon",
      action: "click",
      view: "crm-opportunities",
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
      target: "crm.evidence",
      action: "next",
      view: "crm-opportunities",
      title: { th: "วันที่และเลข PO", en: "Order date and PO number", jp: "受注日と注文書番号" },
      body: {
        th: "ใส่วันที่ลูกค้ายืนยันสั่งซื้อ และเลข PO หรือหลักฐานที่ลูกค้ายืนยัน",
        en: "Enter the date the customer confirmed the order and the PO number or confirmation reference.",
        jp: "顧客が注文を確定した日と、注文書番号または確認記録を入力します。",
      },
    },
    {
      target: "crm.save",
      action: "click",
      view: "crm-opportunities",
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
  orDuty: "estimate-approver",
  views: ["estimates"],
  steps: [
    menu(
      "estimates",
      { th: "เปิดเมนู Estimate Cost", en: "Open Estimate Cost", jp: "「Estimate Cost」を開く" },
      { th: "Estimate ทุกใบอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every estimate is here. Click the highlighted menu entry.", jp: "すべての見積はここにあります。強調表示されたメニューをクリックします。" },
    ),
    {
      target: "estimate.list",
      action: "click",
      clickOn: "tbody tr",
      view: "estimates",
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
      target: "estimate.review",
      action: "next",
      view: "estimates",
      title: { th: "รอใครอนุมัติ", en: "Who it waits for", jp: "誰の承認待ちか" },
      body: {
        th: "บรรทัดนี้บอกว่าใครส่งตรวจเมื่อไร และรอใครอนุมัติ คนใดคนหนึ่งในรายชื่ออนุมัติหรือส่งกลับให้แก้ได้ เจ้าของ Estimate ได้กระดิ่งและอีเมลเมื่อมีการตัดสิน",
        en: "This line says who sent it for review and when, and who it waits for. Any one of them approves or sends it back; the estimate's owner gets a bell and an email on the decision.",
        jp: "誰がいつレビュー依頼したか、誰の承認待ちかを示します。いずれか1名が承認または差し戻しでき、担当者には決定時に通知とメールが届きます。",
      },
    },
    {
      target: '[data-tab="summary"]',
      action: "click",
      view: "estimates",
      title: { th: "ดูหน้าสรุป", en: "Open the cost summary", jp: "原価サマリーを開く" },
      body: {
        th: "หน้าสรุป ERP คือสิ่งที่ส่งเข้า ERP หนึ่งแถวต่อหนึ่งโมดูลหรือบรรทัดที่รวมไว้ ตรวจหมวดและยอดก่อนอนุมัติ",
        en: "The ERP summary is what goes to the ERP: one row per module or merged line. Check the headings and amounts before approving.",
        jp: "ERPサマリーがERPへ送られる内容です(モジュールまたはまとめた行ごとに1行)。承認前に分類と金額を確認します。",
      },
    },
    {
      target: "estimate.approve",
      action: "click",
      view: "estimates",
      title: { th: "อนุมัติ", en: "Approve", jp: "承認" },
      body: {
        th: "กด 'อนุมัติ' แล้วยืนยัน Estimate จะถูกล็อก และส่งเข้า Pegasus ERP ด้วยบัญชี TMT ID ของคุณทันที ถ้าแค่ฝึก ให้กดยกเลิกในหน้ายืนยัน แล้วกด 'เสร็จ'",
        en: "Press Approve and confirm: the estimate is locked and sent to Pegasus ERP with your TMT ID sign-in. Only practising? Press Cancel in the confirmation, then Finish.",
        jp: "「承認」を押して確定すると見積がロックされ、あなたのTMT IDでPegasus ERPへ送られます。練習だけなら確認画面で「キャンセル」を押し、「完了」を押します。",
      },
      missing: {
        th: "ปุ่มอนุมัติขึ้นให้ผู้อนุมัติในรายชื่อ เมื่อ Estimate รอตรวจ และไม่ใช่ Estimate ของตัวเอง",
        en: "The Approve button appears for the listed approvers while the estimate is in review, except on their own estimate.",
        jp: "承認ボタンは、レビュー中の見積について、自分の見積を除き、登録された承認者に表示されます。",
      },
    },
    {
      target: "estimate.erp",
      action: "next",
      view: "estimates",
      title: { th: "Cost Sheet ใน ERP", en: "The Cost Sheet in the ERP", jp: "ERPのCost Sheet" },
      body: {
        th: "แถบ Pegasus ERP แสดงเลข Cost Sheet และ revision ที่ส่งไป แต่ละ revision ที่อนุมัติเป็น Cost Sheet ใบใหม่ ใบของ revision ก่อนยังอยู่ใน ERP และแสดงต่อท้ายแถบนี้ ถ้าส่งไม่สำเร็จจะบอกเหตุผล และมีปุ่ม 'ส่งเข้า ERP' 'ส่งใหม่' ใช้หลังลบ Cost Sheet ใน ERP แล้วเท่านั้น",
        en: "The Pegasus ERP strip shows the Cost Sheet number and the revision sent. Each approved revision becomes a new Cost Sheet; the earlier revisions' sheets stay in the ERP and are listed on this strip. When a send fails it says why and offers Send to the ERP; Send again is only for after the Cost Sheet was deleted in the ERP.",
        jp: "Pegasus ERPの帯にCost Sheet番号と送信した改訂が表示されます。承認した改訂ごとに新しいCost Sheetになり、以前の改訂のシートはERPに残ってこの帯に並びます。送信に失敗すると理由と「ERPへ送信」が出ます。「再送信」はERPでCost Sheetを削除した後だけ使います。",
      },
    },
    {
      target: '[data-tab="summary"]',
      action: "click",
      view: "estimates",
      title: { th: "เสร็จแล้ว", en: "Done", jp: "完了" },
      body: {
        th: "คลิกแท็บสรุปเพื่อจบคู่มือ เปิดดูสถานะใน ERP ได้ทุกเมื่อที่แถบนี้",
        en: "Click the summary tab to finish. The strip shows the ERP status whenever you come back.",
        jp: "サマリータブをクリックして終了します。この帯でいつでもERPの状態を確認できます。",
      },
    },
  ],
};

/* Going back to an earlier revision (owner 2026-11-18): the Revision tab opens any revision in the history read-only,
   and a new revision can be opened from it. Nothing is overwritten, so the guide can be practised up to the last press. */
const ESTIMATE_REVISION_BACK: Guide = {
  id: "estimate-revision-back",
  area: "estimate",
  title: { th: "ดู Revision เก่า และกลับไปใช้ทำต่อ", en: "Open an earlier revision and continue from it", jp: "以前の改訂を開き、そこから続ける" },
  summary: {
    th: "เปิดดูรายการของ Revision เก่าแบบอ่านอย่างเดียว แล้วเปิด Revision ใหม่จาก Revision นั้นเมื่อต้องการย้อนกลับ งานที่ทำอยู่ยังเก็บไว้ในประวัติ",
    en: "Open the lines of an earlier revision read-only, then open a new revision from it when you need to go back. The work in hand stays in the history.",
    jp: "以前の改訂の明細を読み取り専用で開き、戻したいときはそこから新しい改訂を開きます。作業中の内容は履歴に残ります。",
  },
  minutes: 2,
  permissions: ["estimate.read", "estimate.write"],
  views: ["estimates"],
  steps: [
    menu(
      "estimates",
      { th: "เปิดเมนู Estimate Cost", en: "Open Estimate Cost", jp: "「Estimate Cost」を開く" },
      { th: "Estimate ทุกใบอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every estimate is here. Click the highlighted menu entry.", jp: "すべての見積はここにあります。強調表示されたメニューをクリックします。" },
    ),
    {
      target: "estimate.list",
      action: "click",
      clickOn: "tbody tr",
      view: "estimates",
      title: { th: "เปิด Estimate ที่มีมากกว่าหนึ่ง Revision", en: "Open an estimate with more than one revision", jp: "改訂が2つ以上ある見積を開く" },
      body: {
        th: "เลือก Estimate ที่เคยอนุมัติ ถูกส่งกลับ หรือเปิด Revision ใหม่มาแล้ว เลข Revision อยู่ในคอลัมน์ของรายการ",
        en: "Pick an estimate that was approved, sent back or revised before. The list shows each estimate's revision.",
        jp: "承認、差し戻し、または改訂されたことのある見積を選びます。一覧に改訂番号が表示されます。",
      },
      missing: {
        th: "รอให้รายการโหลดสักครู่ ถ้ายังเปิด Estimate อื่นอยู่ ให้กดย้อนกลับด้านบนของหน้า",
        en: "Wait a moment for the list to load. If another estimate is open, go back at the top of the page.",
        jp: "一覧の読み込みを少し待ちます。別の見積を開いている場合は、ページ上部から戻ります。",
      },
    },
    {
      target: '[data-tab="revision"]',
      action: "click",
      view: "estimates",
      title: { th: "เปิดแท็บ Revision", en: "Open the Revision tab", jp: "「改訂履歴」タブを開く" },
      body: {
        th: "แท็บนี้เก็บทุก Revision ของ Estimate ใบนี้ไว้ถาวร",
        en: "This tab keeps every revision of the estimate for good.",
        jp: "このタブには見積のすべての改訂が残っています。",
      },
    },
    {
      target: "estimate.revisions",
      action: "next",
      view: "estimates",
      title: { th: "ประวัติ Revision", en: "The revision history", jp: "改訂履歴" },
      body: {
        th: "แต่ละแถวคือหนึ่ง Revision พร้อมเหตุผล สถานะ และยอดรวม 'พักไว้' คืองานที่ทำค้างตอนมีคนกลับไปใช้ Revision เก่า 'คัดลอกจาก R..' บอกว่า Revision นั้นเปิดมาจาก Revision ไหน",
        en: "Each row is one revision with its reason, status and total. Set aside is the work that was in hand when someone went back to an earlier revision; Copied from R.. says which revision a revision was opened from.",
        jp: "各行が1つの改訂で、理由・状態・合計を示します。「保留」は以前の改訂に戻したときに作業中だった内容、「R.. からコピー」はどの改訂から開いたかを示します。",
      },
    },
    {
      target: "estimate.revisionOpen",
      action: "click",
      view: "estimates",
      title: { th: "กด 'ดูรายการ'", en: "Press View lines", jp: "「明細を見る」を押す" },
      body: {
        th: "เปิดดูรายการต้นทุน ค่าแรง และค่าใช้จ่ายของ Revision นั้นตามที่บันทึกไว้ อ่านอย่างเดียว แก้ไม่ได้",
        en: "It opens that revision's cost items, labor and expenses as they were recorded. Read-only; nothing can be changed there.",
        jp: "その改訂の原価明細・労務・経費を記録どおりに開きます。読み取り専用で変更はできません。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นที่แถวของ Revision เก่า Estimate ที่มี Revision เดียวยังไม่มีให้ดู กด 'จบบทสอน' ได้เลย",
        en: "The button shows on the rows of earlier revisions. An estimate with one revision has none yet. Press Finish.",
        jp: "このボタンは以前の改訂の行に表示されます。改訂が1つだけの見積にはまだありません。「完了」を押します。",
      },
    },
    {
      target: "estimate.revisionRestore",
      action: "click",
      view: "estimates",
      title: { th: "ใช้ Revision นี้ทำต่อ", en: "Continue from this revision", jp: "この改訂から続ける" },
      body: {
        th: "กดเมื่อต้องการย้อนกลับ ระบบจะถามยืนยันก่อน แล้วเปิด Revision ใหม่ที่เหมือน Revision นี้ทุกอย่าง ทั้งรายการ ราคา อัตราสำรอง และการจัดหน้าสรุป ERP งานที่ทำอยู่ตอนนี้ยังอยู่ในประวัติ กลับไปใช้ได้อีก ถ้าแค่ฝึก ให้กด 'ย้อนกลับ' ในหน้ายืนยัน แล้วกด 'จบบทสอน'",
        en: "Press it to go back. After you confirm, a new revision opens as this one was, with its lines, prices, contingency rate and ERP summary layout; the work in hand stays in the history and can be gone back to. Only practising? Press Back in the confirmation, then Finish.",
        jp: "戻したいときに押します。確認後、この改訂と同じ内容（明細、単価、予備費率、ERPサマリーの構成）の新しい改訂が開き、作業中の内容は履歴に残ってあとで戻せます。練習だけなら確認画面で「戻る」を押し、「完了」を押します。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นให้เจ้าของ Estimate หรือผู้จัดการ เมื่อ Estimate อนุมัติแล้วหรือกำลังแก้ไข ระหว่างรอตรวจให้ถอนการส่งก่อน",
        en: "The button shows for the estimate's owner or a manager while the estimate is approved or being edited. Withdraw a review first.",
        jp: "このボタンは、見積が承認済みまたは編集中のとき、担当者または管理者に表示されます。レビュー中は先に取り下げます。",
      },
    },
  ],
};

/* Importing an old Excel Estimate Cost afterwards (owner request 2026-11-25): a job costed in Excel before the app runs as a
   project without an estimate; its workbook becomes that project's Draft estimate. Nothing is saved before the last press. */
const ESTIMATE_HISTORICAL_IMPORT: Guide = {
  id: "estimate-historical-import",
  area: "estimate",
  title: { th: "นำเข้า Estimate ย้อนหลังจาก Excel เดิม", en: "Import an old estimate from Excel", jp: "旧Excelから過去の見積を取り込む" },
  summary: {
    th: "เลือกไฟล์ Estimate Cost เดิมของงานที่เป็น Project แล้วแต่ยังไม่มี Estimate ตรวจรายการและยอดรวม แล้วนำเข้าเป็น Estimate ร่างที่ผูกกับ Project นั้น",
    en: "Choose the old Estimate Cost workbook of a job that is already a project without an estimate, check its rows and totals, and import it as a Draft estimate linked to that project.",
    jp: "見積のない既存案件の旧Estimate Costブックを選び、明細と合計を確認して、その案件に紐付く下書き見積として取り込みます。",
  },
  minutes: 3,
  permissions: ["estimate.read", "estimate.write"],
  views: ["estimates"],
  steps: [
    menu(
      "estimates",
      { th: "เปิดเมนู Estimate Cost", en: "Open Estimate Cost", jp: "「Estimate Cost」を開く" },
      { th: "Estimate ทุกใบอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every estimate is here. Click the highlighted menu entry.", jp: "すべての見積はここにあります。強調表示されたメニューをクリックします。" },
    ),
    {
      target: "estimate.historical-import",
      action: "click",
      view: "estimates",
      title: { th: "นำเข้า Estimate ย้อนหลัง", en: "Import old estimate", jp: "過去の見積を取り込む" },
      body: {
        th: "กดปุ่ม 'นำเข้า Estimate ย้อนหลัง' ด้านบนของรายการ",
        en: "Press Import old estimate at the top of the list.",
        jp: "一覧の上にある「過去の見積を取り込む」を押します。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นให้ Engineer, Engineering Manager และ Admin ถ้าเปิด Estimate อยู่ ให้กดย้อนกลับด้านบนของหน้าก่อน",
        en: "The button shows for engineers, engineering managers and admins. If an estimate is open, go back at the top of the page first.",
        jp: "このボタンはエンジニア、エンジニアリングマネージャー、管理者に表示されます。見積を開いている場合は、先にページ上部から戻ります。",
      },
    },
    {
      target: "estimate.historical-file",
      action: "next",
      view: "estimates",
      title: { th: "เลือกไฟล์ Excel เดิม", en: "Choose the old workbook", jp: "旧ブックを選ぶ" },
      body: {
        th: "เลือกไฟล์ .xlsx ของฟอร์ม Estimate Cost บริษัท (มีชีต Summary cost) ระบบอ่านทุกชีตแล้วตรวจยอดรวมกับชีตรายละเอียด ถ้าชื่องานหรือเลข Project ตรงกับ Project ในระบบ จะเลือก Project ให้เอง",
        en: "Choose the .xlsx of the company Estimate Cost form (with its Summary cost sheet). Every sheet is read and the totals are checked against the detail sheets; when the job name or project number matches a project, that project is chosen for you.",
        jp: "会社のEstimate Costフォーム(Summary costシートあり)の.xlsxを選びます。全シートを読み、合計を明細シートと照合します。案件名や案件番号が一致すれば、その案件が自動で選ばれます。",
      },
    },
    {
      target: "estimate.historical-project",
      action: "next",
      view: "estimates",
      title: { th: "ตรวจ Project ที่จะผูก", en: "Check the project", jp: "紐付ける案件を確認" },
      body: {
        th: "รายการนี้มีเฉพาะ Project ที่ยังไม่มี Estimate และคุณเป็น PM หรือ Lead (Engineering Manager และ Admin เห็นทุก Project) ถ้า Project ไม่มี Inquiry ระบบจะสร้าง Inquiry ย้อนหลังให้ 1 รายการ",
        en: "The list holds only projects without an estimate where you are the manager or lead engineer (engineering managers and admins see every project). A project without an inquiry gets one recorded for it.",
        jp: "見積がなく、あなたがマネージャーまたはリードエンジニアの案件だけが並びます(エンジニアリングマネージャーと管理者は全案件)。引合のない案件には引合が1件記録されます。",
      },
    },
    {
      target: "estimate.historical-preview",
      action: "next",
      view: "estimates",
      title: { th: "ตรวจวันที่และยอดรวม", en: "Check the date and totals", jp: "日付と合計を確認" },
      body: {
        th: "วันที่มาจากไฟล์เดิม ยอด Summary ต้องเท่ากับยอดที่นำเข้า และตรวจรายการทั้งหมดในตาราง ถ้ามีข้อผิดพลาดสีแดง ปุ่มนำเข้าจะกดไม่ได้ ให้แก้ไฟล์แล้วเลือกใหม่",
        en: "The date comes from the workbook, the Summary total must equal the imported total, and every row is in the table. While a red error shows, the import button stays off: fix the file and choose it again.",
        jp: "日付は元のブックから取ります。Summaryの合計と取り込み合計が一致し、全行が表に並びます。赤いエラーがある間は取り込めないので、ファイルを直して選び直します。",
      },
      missing: {
        th: "เลือกไฟล์ก่อน รายการตรวจจะขึ้นหลังอ่านไฟล์เสร็จ",
        en: "Choose the file first; the check appears once it has been read.",
        jp: "先にファイルを選びます。読み込みが終わると確認内容が表示されます。",
      },
    },
    {
      target: "estimate.historical-save",
      action: "click",
      view: "estimates",
      title: { th: "นำเข้า", en: "Import", jp: "取り込む" },
      body: {
        th: "กดนำเข้า ได้ Estimate ร่าง R00 ผูกกับ Project ทันที แก้ต่อได้ แล้วส่งตรวจและอนุมัติตามปกติ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'เสร็จ'",
        en: "Press Import: a Draft R00 estimate is created and linked to the project at once; change it as needed, then send it for review and approval as usual. Only practising? Press Cancel, then Finish.",
        jp: "取り込むと下書きR00の見積が作成され、すぐ案件に紐付きます。必要に応じて編集し、通常どおりレビューと承認に進みます。練習だけなら「キャンセル」を押し、「完了」を押します。",
      },
      missing: {
        th: "ปุ่มนำเข้ากดได้เมื่อเลือก Project และไฟล์ที่ไม่มีข้อผิดพลาดแล้ว",
        en: "The import button turns on once a project and a file without errors are chosen.",
        jp: "案件とエラーのないファイルを選ぶと、取り込みボタンが押せるようになります。",
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
    menu(
      "quotations",
      { th: "เปิดเมนูใบเสนอราคาผู้ขาย", en: "Open Supplier Quotation", jp: "「仕入先見積」を開く" },
      {
        th: "ใบเสนอราคาจากผู้ขายทุกใบเก็บที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every supplier quotation is kept here. Click the highlighted menu entry.",
        jp: "仕入先の見積書はすべてここに保管されます。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "quote.upload",
      action: "click",
      view: "quotations",
      title: { th: "กด 'อัปโหลดใบเสนอราคา'", en: "Press Upload quotation", jp: "「見積書をアップロード」を押す" },
      body: {
        th: "เปิดหน้าต่างอัปโหลด ไฟล์ PDF อยู่ด้านขวา ข้อมูลอยู่ด้านซ้าย",
        en: "It opens the upload window: the PDF on the right, the details on the left.",
        jp: "アップロード画面が開きます。右にPDF、左に入力欄があります。",
      },
      missing: {
        th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์อัปโหลดใบเสนอราคา",
        en: "If the button never appears, this account cannot upload quotations.",
        jp: "ボタンが表示されない場合、このアカウントにはアップロード権限がありません。",
      },
    },
    {
      target: "quote.file",
      action: "next",
      view: "quotations",
      title: { th: "เลือกไฟล์", en: "Choose the file", jp: "ファイルを選ぶ" },
      body: {
        th: "เลือก PDF แล้วระบบจะอ่านผู้ขาย วันที่ ยอดรวม และรายการให้เอง ช่องที่ขึ้นสีเหลืองหรือแดงให้ตรวจกับ PDF ด้านขวา รับ Excel, CSV และรูปด้วย",
        en: "Pick the PDF and the app reads the supplier, dates, total and lines. Check any field marked amber or red against the PDF on the right. Excel, CSV and images are accepted too.",
        jp: "PDFを選ぶと仕入先・日付・合計・明細が読み取られます。黄色や赤の欄は右のPDFと照合します。Excel・CSV・画像も使えます。",
      },
    },
    {
      target: "quote.supplier",
      action: "next",
      view: "quotations",
      title: { th: "ผู้ขายและเลขที่ใบเสนอราคา", en: "Supplier and reference", jp: "仕入先と見積番号" },
      body: {
        th: "ตรวจชื่อผู้ขาย และเลขที่ใบเสนอราคาของผู้ขาย ใช้ค้นหาใบนี้ภายหลัง",
        en: "Check the supplier and the supplier's own quotation number; it is how this one is found later.",
        jp: "仕入先と仕入先の見積番号を確認します。後で検索するときに使います。",
      },
    },
    {
      target: "quote.inquiry",
      action: "next",
      view: "quotations",
      title: { th: "Inquiry ที่เกี่ยวข้อง", en: "Related inquiry", jp: "関連する引合" },
      body: {
        th: "เลือก Inquiry ที่ขอราคานี้ ใบเสนอราคาจะขึ้นในแท็บเพิ่มรายการของ Estimate ของงานนั้น ดึงหลายรายการเข้า Estimate ได้ในครั้งเดียว",
        en: "Choose the inquiry this price was asked for. The quotation then shows in that estimate's Add items tab, where many lines go in at once.",
        jp: "この価格を依頼した引合を選びます。その見積の明細追加タブに表示され、複数行をまとめて取り込めます。",
      },
    },
    {
      target: "quote.lines",
      action: "next",
      view: "quotations",
      title: { th: "รายการและราคา", en: "Lines and prices", jp: "明細と価格" },
      body: {
        th: "ตรวจรายการ จำนวน และราคาต่อหน่วย คลังราคาได้ราคาจากรายการเหล่านี้ ถ้าเป็นเงินเยน ดอลลาร์ หรือยูโร ใส่อัตราแลกเป็นบาทด้วย กด 'ใช้อัตรากลาง' เพื่อใช้อัตราของบริษัท ณ วันที่ของใบ หรือพิมพ์เองก็ได้",
        en: "Check each line, quantity and unit price; the Price Library takes its prices from these lines. For JPY, USD or EUR, enter the THB rate too: press Use the company rate for the rate in force on the quotation's date, or type your own.",
        jp: "明細・数量・単価を確認します。価格ライブラリはこの明細から価格を取ります。円・ドル・ユーロの場合はバーツ換算レートも入力します。「会社レートを使う」で見積日の会社レートを入れるか、自分で入力します。",
      },
    },
    {
      target: "quote.save",
      action: "click",
      view: "quotations",
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
    menu(
      "price",
      { th: "เปิดเมนูคลังราคา", en: "Open Price Library", jp: "「価格ライブラリ」を開く" },
      {
        th: "ราคาจาก Estimate และราคาซื้อจริงรวมอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Prices from estimates and from real purchases are gathered here. Click the highlighted menu entry.",
        jp: "見積と実購入の価格がここに集まっています。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "price.search",
      action: "next",
      view: "price",
      title: { th: "ค้นหา", en: "Search", jp: "検索" },
      body: { th: "พิมพ์ชื่อสินค้า ยี่ห้อ รุ่น ผู้ขาย โปรเจกต์ หรือเลขอ้างอิง", en: "Type the item, brand, model, supplier, project or a reference.", jp: "品名・ブランド・型式・仕入先・案件・参照番号を入力します。" },
    },
    {
      target: "price.list",
      action: "next",
      view: "price",
      title: { th: "ราคาและที่มา", en: "Prices and their source", jp: "価格と出所" },
      body: {
        th: "แต่ละแถวบอกว่าราคามาจาก Estimate ไหน หรือจาก PR/PO ที่ซื้อจริง ราคาซื้อจริงเชื่อถือได้มากกว่าราคาประมาณ",
        en: "Each row says which estimate or which real PR/PO the price came from. A price actually paid is worth more than an estimated one.",
        jp: "各行に、どの見積または実際のPR/POの価格かが表示されます。実購入価格は見積価格より信頼できます。",
      },
    },
    {
      target: "price.add",
      action: "click",
      view: "price",
      title: { th: "เพิ่มราคา", en: "Add a price", jp: "価格を追加" },
      body: {
        th: "ถ้ามีราคาจากเว็บไซต์หรือเอกสารภายนอก กด 'เพิ่มราคา' แล้วใส่ลิงก์ที่มา ถ้าแค่ค้นราคา กด 'จบบทสอน'",
        en: "For a price from a website or an outside document, press Add price and give the link. Only looking? Press Finish.",
        jp: "Webサイトや外部文書の価格は「価格を追加」でリンクとともに登録します。検索だけなら「完了」を押します。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นสำหรับคนที่แก้ Estimate ได้ กด 'จบบทสอน' ได้เลย",
        en: "The button shows for people who may edit estimates. Press Finish.",
        jp: "見積を編集できる人に表示されます。「完了」を押します。",
      },
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
  // The Application team creates projects without an estimate and without project.write (owner 2026-11-25).
  orDuty: "project-without-estimate",
  views: ["projects"],
  invite: "projects",
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      {
        th: "งานที่ได้ PO แล้วอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Work with a customer PO lives here. Click the highlighted menu entry.",
        jp: "注文書を受けた案件はここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "project.create",
      action: "click",
      view: "projects",
      title: { th: "กด 'สร้างโปรเจกต์'", en: "Press Create project", jp: "「プロジェクトを作成」を押す" },
      body: { th: "ปุ่มอยู่มุมขวาบนของหน้าโปรเจกต์", en: "It is at the top right of Projects.", jp: "プロジェクト画面の右上にあります。" },
      missing: {
        th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้างโปรเจกต์",
        en: "If the button never appears, this account cannot create projects.",
        jp: "ボタンが表示されない場合、このアカウントには作成権限がありません。",
      },
    },
    {
      target: "project.source",
      action: "next",
      view: "projects",
      title: { th: "สร้างจากอะไร", en: "Where it comes from", jp: "作成元" },
      body: {
        th: "ปกติสร้างจาก Estimate ที่อนุมัติแล้ว งานที่ไม่มี Estimate เช่นงานบริการ เลือก 'ไม่มี Estimate'",
        en: "Usually from an approved estimate. For work without one, such as a service job, choose Without an estimate.",
        jp: "通常は承認済み見積から作成します。サービス案件など見積がない場合は「見積なし」を選びます。",
      },
      missing: {
        th: "บัญชีนี้สร้างได้แบบเดียว: จาก Estimate ที่อนุมัติแล้ว หรือแบบไม่มี Estimate สำหรับทีม Application กด 'ถัดไป'",
        en: "This account creates projects one way only: from an approved estimate, or without an estimate for the Application team. Press Next.",
        jp: "このアカウントの作成方法は1つだけです（承認済み見積から、またはアプリケーションチームは見積なし）。「次へ」を押します。",
      },
    },
    {
      target: "project.from",
      action: "next",
      view: "projects",
      title: { th: "Estimate หรือลูกค้า", en: "The estimate or the customer", jp: "見積または顧客" },
      body: {
        th: "เลือก Estimate ที่อนุมัติแล้ว ลูกค้า ชื่องาน และวิศวกรจะมาให้เอง ถ้าไม่มี Estimate ให้ค้นหาลูกค้าและพิมพ์ชื่อโปรเจกต์",
        en: "Pick the approved estimate and the customer, name and engineer come with it. Without an estimate, search the customer and type the project name.",
        jp: "承認済み見積を選ぶと顧客・案件名・技術者が入ります。見積がない場合は顧客を検索して案件名を入力します。",
      },
    },
    {
      target: "project.number",
      action: "next",
      view: "projects",
      title: { th: "เลขโปรเจกต์จาก ERP", en: "Project number from the ERP", jp: "ERPの案件番号" },
      body: {
        th: "พิมพ์เลขโปรเจกต์ ชื่องาน หรือชื่อลูกค้า แล้วเลือกจากรายการที่ค้นจาก ERP ระบบใส่เลขตามที่ ERP ใช้ และบอกใต้ช่องว่าพบเลขนี้ใน ERP หรือไม่ PR และค่าใช้จ่ายจึงตรงกับงานใน ERP ถ้า ERP ยังไม่ออกเลข ใส่ PJ000000 ไว้ก่อน แล้วเปลี่ยนเป็นเลขจริงที่ 'แก้ไขโปรเจกต์'",
        en: "Type the project number, the job name or the customer, then pick from the ERP's list: the number goes in as the ERP has it, and the line under the box says whether the ERP knows it, so PRs and costs match the ERP job. If the ERP has not issued a number yet, enter PJ000000 and set the real one later in Edit project.",
        jp: "案件番号・案件名・顧客名を入力し、ERPの一覧から選びます。番号がERPのとおりに入り、欄の下にERPにあるかどうかが表示されるので、PRや費用がERPの案件と一致します。ERPがまだ番号を発行していない場合はPJ000000を入力し、後で「案件を編集」で正しい番号に変えます。",
      },
    },
    {
      target: "project.people",
      action: "next",
      view: "projects",
      title: { th: "ผู้จัดการและวิศวกรหลัก", en: "Manager and lead engineer", jp: "PMと主任技術者" },
      body: {
        th: "เลือกผู้จัดการโปรเจกต์และวิศวกรหลัก ทั้งสองคนได้อีเมลแจ้งเมื่อสร้างโปรเจกต์",
        en: "Choose the project manager and the lead engineer; both are emailed when the project is created.",
        jp: "PMと主任技術者を選びます。作成時に両者へメールが届きます。",
      },
    },
    {
      target: "project.po",
      action: "next",
      view: "projects",
      title: { th: "เลขที่ใบสั่งซื้อลูกค้า", en: "Customer PO", jp: "客先注文書" },
      body: {
        th: "ใส่เลข PO และวันที่ PO ถ้างานนี้มาจากดีลใน CRM ระบบบันทึกดีลเป็นชนะงานให้เอง",
        en: "Enter the PO number and date. If the work came from a CRM deal, the deal is recorded as won for you.",
        jp: "注文書番号と日付を入力します。CRMの商談から来た案件なら、商談は自動で受注になります。",
      },
    },
    {
      target: "project.plan",
      action: "next",
      view: "projects",
      title: { th: "Master Plan: หัวข้อหลัก", en: "Master Plan: the main headings", jp: "マスタープラン：大見出し" },
      body: {
        th: "ใส่หัวข้อหลักของแผนพร้อมวันที่ตกลงกับลูกค้า เช่น 1 Kick-off, 2 Software development หรือเลือก Master Schedule เป็นต้นแบบ ลูกค้าเห็นเฉพาะส่วนนี้ วันเริ่มและวันส่งมอบของโปรเจกต์คิดจากแถวที่มีวันที่ หากยังไม่มีวันที่ทุกแถวให้กรอกวันเริ่มและวันส่งมอบของโปรเจกต์เอง หัวข้อที่ยังไม่แตกเป็นงานย่อยสามารถเว้นวันที่ทั้งสองช่องไว้ แล้วกำหนดวันและแตกงานทีหลังได้",
        en: "Enter the plan's main headings with the dates agreed with the customer, such as 1 Kick-off and 2 Software development, or start from a Master Schedule. The customer sees only this part; the project's start and delivery come from dated rows, or you enter them if all rows are undated. Headings not broken down into tasks yet may leave both dates empty and be dated and broken down later.",
        jp: "計画の大見出しを顧客と合意した日程とともに入力します（例：1 Kick-off、2 Software development）。マスタースケジュールから始めることもできます。顧客にはこの部分だけが表示され、案件の開始日と納期は日程のある行から決まります。全行が日程未定の場合は案件の開始日と納期を入力します。まだタスクに分けていない見出しは両方の日付を空欄にし、後から日程を決めてタスクに分けられます。",
      },
      missing: {
        th: "บัญชีนี้ไม่ได้วางแผนตอนสร้าง ใส่วันเริ่มและวันส่งมอบ แล้ว Project Manager ของโปรเจกต์ใส่แผนหลังสร้าง กด 'ถัดไป'",
        en: "This account does not plan while creating: type the start and delivery dates, and the project's Project Manager adds the plan afterwards. Press Next.",
        jp: "このアカウントは作成時に計画を入力しません。開始日と納期を入力し、計画は作成後に案件のプロジェクトマネージャーが追加します。「次へ」を押します。",
      },
    },
    {
      target: "project.team",
      action: "next",
      view: "projects",
      title: { th: "Team Plan: แตกหัวข้อเป็นงานและฟังก์ชัน", en: "Team Plan: tasks and functions under each heading", jp: "チームプラン：見出しをタスクと機能に分ける" },
      body: {
        th: "ใต้แต่ละหัวข้อหลัก กด 'เพิ่มงาน' แล้วใส่ชื่องาน ผู้รับผิดชอบ (ต้องมี) วันที่ และ man-days เช่น 2.1 Web App WMS จากนั้นกด + ที่แถวงานเพื่อเพิ่มฟังก์ชันที่ต้องทำ เช่น 2.1.1 Inbound ฟังก์ชันที่ไม่ใส่วันหรือผู้รับผิดชอบจะใช้ของงาน หัวข้อที่ยังไม่แตกงานขึ้นว่า 'ยังไม่แตกแผน' บันทึกได้และแตกทีหลังได้",
        en: "Under each heading press Add task and give it a name, a member (required), dates and man-days, such as 2.1 Web App WMS. Then press + on the task for the functions to build, such as 2.1.1 Inbound; a function without its own dates or member has its task's. A heading not broken down yet shows Not broken down; you can save and do it later.",
        jp: "各見出しで「タスクを追加」を押し、タスク名・担当者（必須）・日程・人日を入力します（例：2.1 Web App WMS）。タスク行の + で作る機能を追加します（例：2.1.1 Inbound）。日程や担当者のない機能はタスクのものを使います。まだ分けていない見出しには「未展開」と表示され、保存して後から分けられます。",
      },
      missing: {
        th: "บัญชีนี้ไม่ได้วางแผนตอนสร้าง กด 'ถัดไป'",
        en: "This account does not plan while creating. Press Next.",
        jp: "このアカウントは作成時に計画を入力しません。「次へ」を押します。",
      },
    },
    {
      target: "project.teamAdd",
      action: "next",
      view: "projects",
      title: { th: "เพิ่มงานใต้หัวข้อ", en: "Add a task under a heading", jp: "見出しにタスクを追加" },
      body: {
        th: "ปุ่ม 'เพิ่มงาน' อยู่ที่แต่ละหัวข้อหลัก งานใหม่ใช้วันที่ของหัวข้อเป็นค่าเริ่มต้น",
        en: "Each heading has its own Add task button; a new task starts with the heading's dates.",
        jp: "各大見出しに「タスクを追加」があります。新しいタスクは見出しの日程から始まります。",
      },
      missing: {
        th: "เพิ่มหัวข้อหลักใน Master Plan ก่อน ปุ่มนี้จึงจะขึ้น (บัญชีที่ไม่ได้วางแผนตอนสร้างจะไม่มีปุ่มนี้) กด 'ถัดไป'",
        en: "Add a Master Plan heading first and the button appears (an account that does not plan while creating has none). Press Next.",
        jp: "先にマスタープランの見出しを追加するとボタンが表示されます（作成時に計画を入力しないアカウントには表示されません）。「次へ」を押します。",
      },
    },
    {
      target: "project.save",
      action: "click",
      view: "projects",
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
    th: "Master Plan คือหัวข้อหลักแถวบนสุดของตารางแผนงาน วันที่ของหัวข้อคือกรอบที่ตกลงกับลูกค้า งานและฟังก์ชันใต้หัวข้อคือ Team Plan แก้ทั้งหมดที่แท็บแผนงาน ถ้ายังไม่มีแผนเริ่มจาก Master Schedule",
    en: "The Master Plan is the top rows of the Plan tab's Sheet: the headings, on the dates agreed with the customer. The tasks and functions under them are the Team Plan. Everything is edited on the Plan tab; with no plan yet, start from a Master Schedule.",
    jp: "マスタープランは計画タブの表の最上位の行（大見出し）で、日程は顧客と合意した枠です。その下のタスクと機能がチームプランです。すべて計画タブで編集し、計画がなければマスタースケジュールから始めます。",
  },
  minutes: 2,
  permissions: ["project.write", "schedule.plan"],
  views: ["projects"],
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "รายการโปรเจกต์อยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The project list is here. Click the highlighted menu entry.", jp: "案件一覧はこのメニューにあります。強調表示のメニューをクリックします。" },
    ),
    {
      target: "project.rowMenu",
      action: "click",
      view: "projects",
      title: { th: "เปิดเมนูของโปรเจกต์", en: "Open the project's menu", jp: "案件のメニューを開く" },
      body: { th: "กดปุ่ม ⋯ หน้าสุดของแถวโปรเจกต์ที่ต้องการแก้", en: "Press the ⋯ button at the start of the project's row.", jp: "対象案件の行頭にある ⋯ ボタンを押します。" },
      missing: {
        th: "ยังไม่มีโปรเจกต์ในรายการ ลองล้างตัวกรอง หรือกด 'จบบทสอน'",
        en: "No project is listed. Clear the filters, or press Finish.",
        jp: "案件が表示されていません。絞り込みを解除するか「完了」を押します。",
      },
    },
    {
      target: "project.openPlan",
      action: "click",
      view: "projects",
      title: { th: "เปิดแผนงาน", en: "Open the plan", jp: "計画を開く" },
      body: { th: "แผนเปิดที่แท็บแผนงาน บนตาราง", en: "The plan opens on the Plan tab, on the Sheet.", jp: "計画タブの表で計画が開きます。" },
    },
    {
      target: "plan.sheet",
      action: "next",
      view: "projects",
      title: { th: "หัวข้อหลัก (Master Plan)", en: "The main headings (Master Plan)", jp: "大見出し（マスタープラン）" },
      body: {
        th: "แถวตัวหนาระดับบนสุดคือหัวข้อหลัก วันเริ่มและวันจบของหัวข้อคือกรอบที่ตกลงกับลูกค้า คลิกช่องแล้วพิมพ์แก้ชื่อหรือวันที่ได้เลย ระบบบันทึกเมื่อออกจากช่อง กด 'เฉพาะหัวข้อ (Master Plan)' เพื่อดูแค่หัวข้อ",
        en: "The bold top rows are the main headings; their start and end are the window agreed with the customer. Click a cell and type to change a name or a date; it saves when you leave the cell. Press Headings only (Master Plan) to see just the headings.",
        jp: "太字の最上位の行が大見出しで、開始日と終了日が顧客と合意した枠です。セルをクリックして名前や日付を入力すると、セルを離れたときに保存されます。「見出しのみ（マスタープラン）」で見出しだけを表示します。",
      },
      missing: {
        th: "บัญชีนี้เปิดแผนของโปรเจกต์นี้ไม่ได้ กด 'จบบทสอน'",
        en: "This account cannot open this project's plan. Press Finish.",
        jp: "このアカウントはこの案件の計画を開けません。「完了」を押します。",
      },
    },
    {
      target: "plan.sheetAdd",
      action: "next",
      view: "projects",
      title: { th: "งานและฟังก์ชัน (Team Plan)", en: "Tasks and functions (Team Plan)", jp: "タスクと機能（チームプラン）" },
      body: {
        th: "แถวใต้หัวข้อคืองานของทีม กด 'แทรกแถว' หรือ + หน้าแถวเพื่อเพิ่ม และ Alt+Shift+→ เพื่อเลื่อนเป็นงานย่อย งานที่มีงานย่อยคิดวันจากงานย่อย แถวที่มีความคืบหน้าแล้วลบไม่ได้",
        en: "The rows under a heading are the team's tasks. Press Insert row, or + in front of a row, to add one, and Alt+Shift+→ to make it a sub task. A task with sub tasks takes its dates from them. Rows with progress cannot be deleted.",
        jp: "見出しの下の行がチームのタスクです。「行を挿入」または行頭の + で追加し、Alt+Shift+→ でサブタスクにします。サブタスクのあるタスクは日程をサブタスクから算出します。進捗のある行は削除できません。",
      },
    },
    {
      target: "plan.sheetTemplate",
      action: "next",
      view: "projects",
      title: { th: "ยังไม่มีแผน: เริ่มจาก Master Schedule", en: "No plan yet: start from a Master Schedule", jp: "計画がない場合：マスタースケジュールから始める" },
      body: {
        th: "กด 'Master Schedule' เพื่อเลือกแผนมาตรฐาน ระบบเติมหัวข้อและงานตามแม่แบบ แล้วค่อยแก้วันให้ตรงกับที่ตกลงกับลูกค้า",
        en: "Press Master Schedule to pick a standard plan. Its headings and tasks fill the Sheet; then set the dates agreed with the customer.",
        jp: "「マスタースケジュール」を押して標準計画を選びます。見出しとタスクが表に入るので、顧客と合意した日程に合わせます。",
      },
    },
    {
      target: "plan.sheetFollow",
      action: "click",
      view: "projects",
      title: { th: "ดูสิ่งที่ต้องตาม", en: "See what to follow up", jp: "要フォローを見る" },
      body: {
        th: "กด 'ต้องตาม' เพื่อดูหัวข้อที่ยังไม่แตกงาน งานที่เลยกรอบของหัวข้อ และงานที่ยังไม่มีผู้ทำ กดชื่อเพื่อไปที่แถวนั้น",
        en: "Press To follow up to see headings not yet broken down, tasks past their heading's window and tasks with nobody on them. Press a name to go to its row.",
        jp: "「要フォロー」を押すと、未分解の見出し、見出しの枠を超えたタスク、担当者のいないタスクが表示されます。名前を押すとその行へ移動します。",
      },
      missing: {
        th: "ปุ่มนี้กดได้เมื่อมีเรื่องต้องตาม ถ้าไม่มี กด 'จบบทสอน'",
        en: "The button works when there is something to follow up; if not, press Finish.",
        jp: "要フォローがあるときに押せます。なければ「完了」を押します。",
      },
    },
  ],
};

// A project registered under PJ000000 takes its ERP number once the ERP issues it (2026-11-06).
const PROJECT_ERP_NUMBER: Guide = {
  id: "project-erp-number",
  area: "project",
  title: { th: "ใส่เลขโปรเจกต์จาก ERP ให้โปรเจกต์ที่ใช้ PJ000000", en: "Give a PJ000000 project its ERP number", jp: "PJ000000の案件にERP番号を入れる" },
  summary: {
    th: "เมื่อ ERP ออกเลขให้โปรเจกต์ที่สร้างไว้ด้วยเลขชั่วคราวแล้ว ค้นเลขจาก ERP แล้วบันทึก PR และ Cost Sheet ต่อจากนี้จะผูกกับโปรเจกต์ใน ERP",
    en: "Once the ERP issues the number of a project created under the placeholder, search it from the ERP and save; PRs and Cost Sheets from then on link to the ERP project.",
    jp: "仮番号で作成した案件にERPが番号を発行したら、ERPから検索して保存します。以後のPRとコストシートはERPの案件に紐づきます。",
  },
  minutes: 1,
  permissions: ["project.read", "project.write"],
  views: ["projects"],
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "รายการโปรเจกต์อยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The project list is here. Click the highlighted menu entry.", jp: "案件一覧はここにあります。強調表示のメニューをクリックします。" },
    ),
    {
      target: "project.rowMenu",
      action: "click",
      view: "projects",
      title: { th: "เปิดเมนูของโปรเจกต์ PJ000000", en: "Open the PJ000000 project's menu", jp: "PJ000000の案件のメニューを開く" },
      body: {
        th: "กดปุ่ม ⋯ หน้าสุดของแถวโปรเจกต์ที่ยังใช้เลข PJ000000",
        en: "Press the ⋯ button at the start of the row of the project still numbered PJ000000.",
        jp: "PJ000000のままの案件の行頭にある ⋯ ボタンを押します。",
      },
      missing: {
        th: "ยังไม่มีโปรเจกต์ในรายการ ลองล้างตัวกรอง หรือกด 'จบบทสอน'",
        en: "No project is listed. Clear the filters, or press Finish.",
        jp: "案件が表示されていません。絞り込みを解除するか「完了」を押します。",
      },
    },
    {
      target: "project.openPage",
      action: "click",
      view: "projects",
      title: { th: "เปิดหน้าโปรเจกต์", en: "Open the project's page", jp: "案件ページを開く" },
      body: { th: "การแก้ข้อมูลโปรเจกต์อยู่ที่หน้าของโปรเจกต์", en: "A project's details are edited on its page.", jp: "案件情報は案件ページで編集します。" },
    },
    {
      target: "projectPage.edit",
      action: "click",
      view: "projects",
      title: { th: "กด 'แก้ไขโครงการ'", en: "Press Edit project", jp: "「案件を編集」を押す" },
      body: { th: "เปิดหน้าต่างแก้ข้อมูลของโปรเจกต์นี้", en: "It opens this project's details.", jp: "この案件の情報を編集する画面が開きます。" },
      missing: { th: "บัญชีนี้แก้โปรเจกต์ไม่ได้ กด 'จบบทสอน'", en: "This account cannot edit projects. Press Finish.", jp: "このアカウントは案件を編集できません。「完了」を押します。" },
    },
    {
      target: "project.erpNumber",
      action: "next",
      view: "projects",
      title: { th: "ค้นเลขจาก ERP", en: "Search the number in the ERP", jp: "ERPで番号を検索" },
      body: {
        th: "พิมพ์ชื่องานหรือชื่อลูกค้า แล้วเลือกโปรเจกต์จากรายการของ ERP ใต้ช่องจะบอกว่าพบใน ERP หรือมีโปรเจกต์อื่นในแอปใช้เลขนี้แล้ว",
        en: "Type the job or customer name and pick the project from the ERP's list. The line under the box says whether the ERP has it, or whether another project here already uses the number.",
        jp: "案件名か顧客名を入力し、ERPの一覧から案件を選びます。欄の下に、ERPにあるか、アプリ内の別の案件が使っているかが表示されます。",
      },
      missing: {
        th: "ช่องนี้ขึ้นเฉพาะโปรเจกต์ที่ยังใช้ PJ000000 เลขจริงจาก ERP เปลี่ยนไม่ได้ กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "The box shows only for a project still on PJ000000; a real ERP number does not change. Press Cancel, then Finish.",
        jp: "この欄はPJ000000のままの案件にだけ表示されます。ERPの番号は変更できません。「キャンセル」を押してから「完了」を押します。",
      },
    },
    {
      target: "project.editSave",
      action: "click",
      view: "projects",
      title: { th: "บันทึก", en: "Save", jp: "保存" },
      body: {
        th: "กด 'บันทึกโปรเจกต์' เลขจริงเปลี่ยนอีกไม่ได้ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Save project; the real number cannot change again. Only practising? Press Cancel, then Finish.",
        jp: "「案件を保存」を押します。正式な番号は再変更できません。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

const PUNCHLIST_ISSUES: Guide = {
  id: "punchlist-issues",
  area: "project",
  title: { th: "บันทึกใบแจ้ง Issue ของลูกค้า", en: "Record a customer's issue batch", jp: "顧客の課題票を記録" },
  summary: {
    th: "ลูกค้าแจ้งปัญหาหนึ่งครั้ง = หนึ่งใบ พิมพ์หลาย Issue ในตารางแบบ Excel (วางจาก Excel ได้) แนบภาพหน้าจอ เลือกผู้รับผิดชอบ วันและชั่วโมงตามแผน Problem เริ่มได้ทันที Requirement ที่ Engineer พิมพ์จะรอ PM / Lead อนุมัติ ใช้กับโปรเจกต์ที่ปิดแล้วหรือไม่มีในระบบได้",
    en: "One customer report is one batch. Type its issues in an Excel-like grid (or paste rows from Excel), attach screenshots, pick the PIC, plan dates and hours. Problems start at once; a Requirement typed by an engineer waits for the PM / Lead. Works for closed projects and ones not in the system.",
    jp: "顧客の報告1回が1枚の票です。Excelのような表に課題を入力（Excelから貼り付けも可）し、スクリーンショットを添付、担当者・計画日・時間を入れます。Problemはすぐ着手、エンジニアが入力したRequirementはPM/リーダーの承認待ちです。完了案件やシステム外の案件にも使えます。",
  },
  minutes: 3,
  permissions: ["schedule.read"],
  views: ["projects"],
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "Punchlist อยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "The Punchlist is here. Click the highlighted menu entry.", jp: "パンチリストはここにあります。ハイライトされたメニューをクリックします。" },
    ),
    {
      target: '[data-tab="punchlist"]',
      action: "click",
      view: "projects",
      title: { th: "แท็บ Punchlist", en: "The Punchlist tab", jp: "「パンチリスト」タブ" },
      body: { th: "คลิกแท็บ 'Punchlist · Issue ลูกค้า'", en: "Click the Punchlist · Customer issues tab.", jp: "「パンチリスト・顧客課題」タブをクリックします。" },
    },
    {
      target: "issues.summary",
      action: "next",
      view: "projects",
      title: { th: "แถบสรุปคือตัวกรอง", en: "The summary bar is the filter", jp: "サマリーバーがフィルター" },
      body: {
        th: "กดช่องใดก็ได้เพื่อดูใบตามสถานะ: ยังเปิดอยู่ รออนุมัติ ของฉัน หรือปิดแล้ว ใบจะปิดเองเมื่อทุกข้อเสร็จ ยกเลิก หรือไม่อนุมัติ",
        en: "Press any cell to list the batches in that state: open, waiting approval, mine or closed. A batch closes itself once every issue is done, cancelled or rejected.",
        jp: "セルを押すとその状態の票が表示されます（未完了・承認待ち・自分の担当・完了）。全件が完了・取消・却下になると票は自動で完了します。",
      },
    },
    {
      target: "issues.create",
      action: "click",
      view: "projects",
      title: { th: "สร้างใบแจ้ง Issue", en: "Create an issue batch", jp: "課題票を作成" },
      body: { th: "กด 'สร้างใบแจ้ง Issue'", en: "Press New issue batch.", jp: "「課題票を作成」を押します。" },
      missing: {
        th: "บัญชีนี้ไม่มีสิทธิ์วางแผนหรืออัปเดตงาน จึงสร้างใบไม่ได้ กด 'จบบทสอน'",
        en: "This account cannot plan or update work, so it cannot create batches. Press Finish.",
        jp: "このアカウントには計画・進捗の権限がないため票を作成できません。「完了」を押します。",
      },
    },
    {
      target: "issues.header",
      action: "next",
      view: "projects",
      title: { th: "ใบนี้ของโปรเจกต์ไหน", en: "Which project the batch is for", jp: "どの案件の票か" },
      body: {
        th: "เลือกโปรเจกต์ (โปรเจกต์ที่ปิดแล้วก็เลือกได้) หรือกด 'ไม่มีในระบบ' แล้วพิมพ์ชื่อโปรเจกต์กับลูกค้าเอง ใส่วันที่ลูกค้าแจ้งและชื่อผู้แจ้ง",
        en: "Pick the project (closed ones too), or press Not in the system and type the project and customer. Add the day the customer reported and who reported it.",
        jp: "案件を選ぶ（完了案件も可）か、「システム外」を押して案件名と顧客を入力します。報告日と報告者を入れます。",
      },
    },
    {
      target: "issues.grid",
      action: "next",
      view: "projects",
      title: { th: "พิมพ์ Issue แบบ Excel", en: "Type the issues like Excel", jp: "Excelのように課題を入力" },
      body: {
        th: "หนึ่งบรรทัดต่อหนึ่ง Issue: ประเภท ฟังก์ชัน รายละเอียด ผู้รับผิดชอบ วันเริ่ม/เสร็จ และชั่วโมง (8 ชม. = 1 คน-วัน) คัดลอกแถวจาก Excel มาวางได้ วางภาพหน้าจอ (Ctrl+V) ในบรรทัดเพื่อแนบรูป บรรทัดว่างไม่ถูกบันทึก",
        en: "One line per issue: category, function, description, PIC, start / end and hours (8 h = 1 man-day). Rows copied from Excel can be pasted; paste a screenshot (Ctrl+V) into a line to attach it. Empty lines are not saved.",
        jp: "1行に1件：区分・機能・内容・担当者・開始/終了・時間（8時間=1人日）。Excelからコピーした行を貼り付けられます。行にスクリーンショットを貼り付け（Ctrl+V）ると添付されます。空の行は保存されません。",
      },
    },
    {
      target: "issues.load",
      action: "next",
      view: "projects",
      title: { th: "ดูภาระงานก่อนมอบหมาย", en: "Check the load before assigning", jp: "割り当て前に負荷を確認" },
      body: {
        th: "แถบด้านขวาบอกชั่วโมงที่แต่ละคนมีงานอยู่แล้วในสัปดาห์นั้น บวกชั่วโมงจากใบนี้ เทียบกับกำลังของเขา สีแดงคือเกิน",
        en: "The side panel shows the hours each PIC already has that week plus the hours from this batch, against what they have. Red means over.",
        jp: "右のパネルに、その週の担当者の既存の時間とこの票の時間の合計が、稼働可能時間と比べて表示されます。赤は超過です。",
      },
      missing: {
        th: "ยังไม่ได้เปิดหน้าต่างสร้างใบ กด 'สร้างใบแจ้ง Issue' ก่อน",
        en: "The new batch window is not open. Press New issue batch first.",
        jp: "作成画面が開いていません。先に「課題票を作成」を押します。",
      },
    },
    {
      target: "issues.save",
      action: "click",
      view: "projects",
      title: { th: "บันทึกใบแจ้ง", en: "Save the batch", jp: "票を保存" },
      body: {
        th: "กด 'บันทึกใบแจ้ง' ระบบออกเลข IS-ปีเดือน-ลำดับ และ Issue จะไปอยู่ใน My Work ของผู้รับผิดชอบ ภาระงานทีม และ Gantt ของโปรเจกต์ ถ้าแค่ฝึก ให้กด 'ยกเลิก' (ร่างที่พิมพ์ไว้ยังเก็บไว้ให้)",
        en: "Press Save batch. It gets a number IS-yearmonth-sequence, and the issues show in the PICs' My Work, the team's load and the project's Gantt. Only practising? Press Cancel (what you typed stays as a draft).",
        jp: "「票を保存」を押すと IS-年月-連番 が付き、課題は担当者のマイワーク・チームの負荷・案件のガントに表示されます。練習だけなら「キャンセル」を押します（入力内容は下書きとして残ります）。",
      },
    },
  ],
};

const PUNCHLIST_CLOSE: Guide = {
  id: "punchlist-close-issue",
  area: "project",
  title: { th: "เริ่มและปิดงาน Issue ลูกค้า", en: "Start and close a customer issue", jp: "顧客課題の着手と完了" },
  summary: {
    th: "ผู้รับผิดชอบกด 'เริ่มทำ' แล้วปิดงานด้วยวันที่เสร็จจริง ชั่วโมงที่ใช้จริง และสิ่งที่แก้ไข PM / Lead อนุมัติหรือไม่อนุมัติ Requirement ได้จากหน้าเดียวกัน",
    en: "The PIC presses Start, then closes the issue with the actual end, the hours it really took and what was done. PM / Lead approve or reject Requirements in the same place.",
    jp: "担当者は「着手」を押し、実績終了日・実績時間・対応内容で完了にします。PM/リーダーは同じ画面でRequirementを承認・却下できます。",
  },
  minutes: 2,
  permissions: ["schedule.read"],
  views: ["projects", "my-work"],
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      {
        th: "Punchlist อยู่ในเมนูนี้ (Issue ของคุณยังขึ้นใน My Work ด้วย)",
        en: "The Punchlist is here (your issues also show in My Work).",
        jp: "パンチリストはここにあります（担当の課題はマイワークにも表示されます）。",
      },
    ),
    {
      target: '[data-tab="punchlist"]',
      action: "click",
      view: "projects",
      title: { th: "แท็บ Punchlist", en: "The Punchlist tab", jp: "「パンチリスト」タブ" },
      body: { th: "คลิกแท็บ 'Punchlist · Issue ลูกค้า'", en: "Click the Punchlist · Customer issues tab.", jp: "「パンチリスト・顧客課題」タブをクリックします。" },
    },
    {
      target: "issues.summary",
      action: "next",
      view: "projects",
      title: { th: "กด 'ของฉัน' หรือ 'รออนุมัติ'", en: "Press Mine or Waiting approval", jp: "「自分の担当」か「承認待ち」を押す" },
      body: {
        th: "'ของฉัน' คือใบที่คุณเป็นผู้รับผิดชอบ Issue ที่ยังเปิด 'รออนุมัติ' คือ Requirement ที่รอ PM / Lead",
        en: "Mine lists the batches where you are the PIC of an open issue; Waiting approval lists Requirements for a PM / Lead.",
        jp: "「自分の担当」は未完了の課題を担当している票、「承認待ち」はPM/リーダーの承認を待つRequirementです。",
      },
    },
    {
      target: "issues.batch",
      action: "click",
      view: "projects",
      title: { th: "เปิดใบแจ้ง", en: "Open a batch", jp: "票を開く" },
      body: { th: "กดเลขใบแจ้ง (IS-…)", en: "Press the batch number (IS-…).", jp: "票番号（IS-…）を押します。" },
      missing: { th: "ยังไม่มีใบในรายการนี้ ลองกด 'ทั้งหมด' หรือกด 'จบบทสอน'", en: "No batch in this list. Try All, or press Finish.", jp: "この一覧に票がありません。「すべて」を試すか「完了」を押します。" },
    },
    {
      target: "issues.itemActions",
      action: "click",
      view: "projects",
      title: { th: "ปุ่มอยู่ด้านซ้ายของแต่ละข้อ", en: "Each issue's buttons are on its left", jp: "各課題のボタンは左側" },
      body: {
        th: "ผู้รับผิดชอบกด 'เริ่มทำ' และเมื่อเสร็จกด 'ปิดงาน' แล้วใส่วันที่เสร็จจริง ชั่วโมงที่ใช้จริง และสิ่งที่แก้ไข PM / Lead จะเห็นปุ่ม 'อนุมัติ' / 'ไม่อนุมัติ' ที่ Requirement ที่รอ ถ้าแค่ฝึก ให้กด 'ยกเลิก' ในหน้าต่างที่เปิดขึ้น",
        en: "The PIC presses Start, and Close issue when it is done, then types the actual end, the hours it really took and what was done. A PM / Lead sees Approve / Reject on a waiting Requirement. Only practising? Press Cancel in the window that opens.",
        jp: "担当者は「着手」を押し、終わったら「完了にする」を押して実績終了日・実績時間・対応内容を入力します。PM/リーダーには承認待ちのRequirementに「承認」「却下」が表示されます。練習だけなら開いた画面で「キャンセル」を押します。",
      },
      missing: {
        th: "ไม่มีปุ่มให้คุณในใบนี้ (คุณไม่ใช่ผู้รับผิดชอบหรือผู้อนุมัติ) กด 'จบบทสอน'",
        en: "There is nothing for you to press in this batch (you are not its PIC or an approver). Press Finish.",
        jp: "この票にはあなたが押せるボタンがありません（担当者でも承認者でもありません）。「完了」を押します。",
      },
    },
  ],
};

const PROJECT_DELETE: Guide = {
  id: "project-delete",
  area: "project",
  minutes: 2,
  permissions: ["project.read"],
  views: ["projects"],
  browse: true,
  title: { th: "ลบโครงการ", en: "Delete a project", jp: "プロジェクトを削除" },
  summary: {
    th: "ตรวจงานที่บันทึกไว้ก่อนลบ และยืนยันเลขโครงการเมื่อ Management หรือ Admin ต้องการซ่อนโครงการที่มีงาน",
    en: "Review recorded work before deletion; Management or Admin confirm the number to hide a project with work.",
    jp: "削除前に作業記録を確認します。ManagementまたはAdminは番号を確認して作業のある案件を非表示にできます。",
  },
  steps: [
    {
      target: "project.rowMenu",
      action: "next",
      view: "projects",
      title: { th: "เปิดเมนูลบโครงการ", en: "Open Delete project", jp: "プロジェクト削除を開く" },
      body: {
        th: "เปิด ⋯ แล้วเลือกลบโครงการ Management และ Admin ลบได้ทุกโครงการ รวมถึงโครงการที่มีงาน",
        en: "Open ⋯ and choose Delete project. Management and Admin may delete any project, including projects with work.",
        jp: "⋯ からプロジェクト削除を選びます。ManagementとAdminは作業のある案件を含め、すべての案件を削除できます。",
      },
    },
    {
      target: "project.deleteNumber",
      action: "next",
      view: "projects",
      title: { th: "ตรวจงานและพิมพ์เลขโครงการ", en: "Review work and type the number", jp: "作業を確認して番号を入力" },
      body: {
        th: "เมื่อมีงาน ให้อ่านรายการและคำเตือน แล้วพิมพ์เลขโครงการให้ตรงทุกตัว โครงการและงานจะถูกซ่อน แต่ข้อมูลและไฟล์ยังอยู่ให้ผู้ดูแลฐานข้อมูลกู้คืน",
        en: "When work exists, review the blockers and warning, then type the exact project number. The project and its work will be hidden; records and files remain available for a database administrator to restore.",
        jp: "作業がある場合は一覧と警告を確認し、正確な案件番号を入力します。案件と作業は非表示になりますが、記録とファイルは管理者が復元できます。",
      },
      missing: {
        th: "ช่องนี้แสดงเฉพาะ Management หรือ Admin เมื่อโครงการมีงาน",
        en: "This field appears only for Management or Admin when the project has work.",
        jp: "作業がある案件でManagementまたはAdminにのみ表示されます。",
      },
    },
    {
      target: "project.deleteConfirm",
      action: "next",
      view: "projects",
      title: { th: "ตรวจสอบก่อนยืนยันลบ", en: "Review before confirming deletion", jp: "削除の確定前に確認" },
      body: {
        th: "ยืนยันลบแม้มีงานจะซ่อนข้อมูล โครงการที่ไม่มีงานจะถูกลบถาวร หากเพียงฝึกใช้งานให้กดยกเลิก",
        en: "Delete anyway hides recorded work. A project without work is permanently deleted. Press Cancel if only practising.",
        jp: "「作業記録があっても削除」はデータを非表示にします。作業のない案件は完全削除されます。練習の場合はキャンセルしてください。",
      },
    },
  ],
};

const MY_WEEK_BOOK: Guide = {
  id: "my-week-book",
  area: "project",
  minutes: 2,
  permissions: ["schedule.read", "schedule.progress"],
  views: ["my-work"],
  title: { th: "วางแผนสัปดาห์และลงเวลาในปฏิทิน (แทน Outlook)", en: "Plan your week on the calendar (instead of Outlook)", jp: "カレンダーで週を計画する（Outlookの代わり）" },
  summary: {
    th: "ลงเวลาให้งานที่ได้รับบนปฏิทินในแอป ไม่ต้องพิมพ์ใน Outlook แล้ว แอปส่งเวลาที่ลงเข้าปฏิทิน Outlook ของคุณเอง และใช้ร่างชั่วโมงของแต่ละวัน นัดที่คนอื่นส่งมาใน Outlook จะขึ้นในปฏิทิน กดแล้วผูกกับงานได้",
    en: "Book time for your work on the app's calendar instead of typing it into Outlook. The app writes the time into your Outlook calendar and drafts each day's hours from it. Meetings other people send you in Outlook show on the calendar; press one to tie it to a piece of work.",
    jp: "Outlookに入力する代わりに、アプリのカレンダーで担当作業の時間を入れます。入れた時間は自動でOutlookの予定表に入り、毎日の作業時間の下書きになります。他の人から届いたOutlookの予定もカレンダーに表示され、押すと作業に紐づけられます。",
  },
  steps: [
    menu(
      "my-work",
      { th: "เปิดงานของฉัน", en: "Open My Work", jp: "「マイワーク」を開く" },
      { th: "สัปดาห์ของฉันอยู่ในหน้านี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "My week is on this page. Click the highlighted menu entry.", jp: "マイウィークはこの画面にあります。強調表示のメニューをクリックします。" },
    ),
    {
      target: '[data-tab="week"]',
      action: "click",
      view: "my-work",
      title: { th: "เปิดสัปดาห์ของฉัน", en: "Open My week", jp: "マイウィークを開く" },
      body: { th: "กดแท็บ 'สัปดาห์ของฉัน'", en: "Press the My week tab.", jp: "「マイウィーク」タブを押します。" },
    },
    {
      target: "myweek.backlog",
      action: "next",
      view: "my-work",
      title: { th: "งานที่ได้รับ", en: "Work assigned to you", jp: "担当作業" },
      body: {
        th: "ด้านซ้ายคืองานที่คุณรับผิดชอบ แต่ละงานบอกชั่วโมงที่เหลือจากแผน (หักชั่วโมงที่ยืนยันแล้ว) และชั่วโมงที่ลงไว้ในสัปดาห์นี้ กด 'ลงเวลา' ที่งาน หรือคลิกช่องว่างในปฏิทินก็ได้",
        en: "On the left is the work you are responsible for: the hours left in its plan (less the hours already confirmed) and the hours booked this week. Press Book time on a piece of work, or click a free time on the calendar.",
        jp: "左側は担当作業です。計画の残り時間（確定済みの時間を除く）と今週入れた時間が表示されます。作業の「時間を入れる」を押すか、カレンダーの空き時間をクリックします。",
      },
      missing: { th: "ยังไม่มีงานที่ได้รับ กด 'ถัดไป'", en: "No work is assigned to you yet. Press Next.", jp: "担当作業がまだありません。「次へ」を押します。" },
    },
    {
      target: "myweek.book",
      action: "click",
      view: "my-work",
      title: { th: "ลงเวลา", en: "Book time", jp: "時間を入れる" },
      body: { th: "กด 'ลงเวลา' ระบบหาช่วงว่างแรกของวันให้", en: "Press Book time. The app picks the day's first free hour.", jp: "「時間を入れる」を押します。その日の最初の空き時間が選ばれます。" },
    },
    {
      target: "myweek.work",
      action: "next",
      view: "my-work",
      title: { th: "เลือกงาน", en: "Choose the work", jp: "作業を選ぶ" },
      body: {
        th: "เลือกงานที่จะทำ ถ้าเป็นงานนอกแผน เลือก 'งานอื่นในโครงการ' หรือ 'งานอื่น' แล้วพิมพ์ว่าทำอะไร",
        en: "Choose the work you will do. For work outside the plan choose Other work on a project or Other work and type what it is.",
        jp: "行う作業を選びます。計画外の作業は「プロジェクトのその他作業」か「その他の作業」を選んで内容を入力します。",
      },
    },
    {
      target: "myweek.time",
      action: "next",
      view: "my-work",
      title: { th: "วันและเวลา", en: "Day and time", jp: "日付と時間" },
      body: {
        th: "ตั้งวัน เวลาเริ่ม และเวลาจบ (ทีละ 15 นาที) ช่วงที่ชนกับช่องอื่นที่ลงไว้จะบันทึกไม่ได้ นัดใน Outlook ซ้อนกันได้ ระบบนับชั่วโมงของนัดแทน",
        en: "Set the day, the start and the end (in 15 minutes). Time that overlaps another booked block cannot be saved; an Outlook meeting may overlap, and its hours are counted instead.",
        jp: "日付・開始・終了を設定します（15分単位）。他の予定と重なる時間は保存できません。Outlookの予定とは重なってもよく、その予定の時間が計上されます。",
      },
    },
    {
      target: "myweek.save",
      action: "click",
      view: "my-work",
      title: { th: "บันทึก แล้วเข้า Outlook เอง", en: "Save: it goes into Outlook by itself", jp: "保存するとOutlookに入ります" },
      body: {
        th: "กด 'บันทึก' เวลานี้จะเข้าปฏิทิน Outlook ของคุณทันที (แก้หรือลบที่แอป การแก้ใน Outlook จะถูกเขียนทับ) และใช้ร่างชั่วโมงของวันนั้น ถ้าแค่ฝึก ให้กด 'ยกเลิก'",
        en: "Press Save. The time goes into your Outlook calendar at once (change or remove it in the app: changes made in Outlook are overwritten) and drafts that day's hours. Only practising? Press Cancel.",
        jp: "「保存」を押すと、この時間がすぐOutlookの予定表に入り（変更・削除はアプリで。Outlookでの変更は上書きされます）、その日の作業時間の下書きになります。練習だけなら「キャンセル」を押します。",
      },
    },
  ],
};

// Task doc 3.6: an outside supplier's people per day on the outsourced rows a person looks after.
const VENDOR_HOURS: Guide = {
  id: "vendor-hours",
  area: "project",
  minutes: 1,
  // Shows where to type; a practice run does not have to record a supplier's day.
  browse: true,
  permissions: ["schedule.read"],
  views: ["my-work"],
  title: { th: "ลงคนของผู้รับเหมารายวัน", en: "Record a supplier's people per day", jp: "外注先の人数を日ごとに記録" },
  summary: {
    th: "งานที่จ้างภายนอก ผู้ดูแลงานหรือ PM ลงจำนวนคนของผู้รับเหมาที่เข้าทำงานแต่ละวัน ชั่วโมงคิดเป็นคน × 8 และขึ้นเป็นชม.จริงของงานนั้นในตารางแผนงาน ไม่มีจำนวนเงิน",
    en: "For outsourced work, the member who looks after the row or the project manager records how many of the supplier's people worked each day. Hours are people × 8 and show as the row's Actual h on the plan Sheet. No money here.",
    jp: "外注作業では、担当者またはPMが外注先の人数を日ごとに入力します。時間は人数 × 8 で、計画表の「実績 h」に表示されます。金額は扱いません。",
  },
  steps: [
    menu(
      "my-work",
      { th: "เปิดงานของฉัน", en: "Open My Work", jp: "「マイワーク」を開く" },
      { th: "คลิกที่เมนูที่ไฮไลต์อยู่", en: "Click the highlighted menu entry.", jp: "強調表示のメニューをクリックします。" },
    ),
    {
      target: '[data-tab="vendor"]',
      action: "click",
      view: "my-work",
      title: { th: "เปิดงานจ้างภายนอก", en: "Open Outsourced work", jp: "「外注作業」を開く" },
      body: { th: "กดแท็บ 'งานจ้างภายนอก'", en: "Press the Outsourced work tab.", jp: "「外注作業」タブを押します。" },
    },
    {
      target: "work.vendor",
      action: "next",
      view: "my-work",
      title: { th: "จำนวนคนรายวัน", en: "People per day", jp: "日ごとの人数" },
      body: {
        th: "แต่ละแถวคืองานที่จ้างภายนอกที่คุณดูแล พิมพ์จำนวนคนในช่องของวันนั้นแล้วกด Enter ระบบบันทึกทันที ลบตัวเลขเพื่อลบวันนั้น ลงย้อนหลังได้ 60 วัน ด้านขวาบอกชั่วโมงสัปดาห์นี้และชั่วโมงสะสมเทียบแผน",
        en: "Each row is outsourced work you look after. Type the number of people in a day's box and press Enter; it saves at once. Clear the number to remove the day. Days up to 60 days back can be recorded. On the right: this week's hours and the hours to date against the plan.",
        jp: "各行は担当する外注作業です。その日の欄に人数を入力して Enter を押すとすぐ保存されます。数字を消すとその日を削除します。60日前まで入力できます。右側に今週の時間と計画に対する累計を表示します。",
      },
    },
  ],
};

// Task doc 5.2: a project's own page, with its tabs and the actions the list's row menu held.
const PROJECT_PAGE: Guide = {
  id: "project-page",
  area: "project",
  minutes: 2,
  // A tour of one project's page; nothing has to change.
  browse: true,
  permissions: ["project.read"],
  views: ["projects"],
  title: { th: "หน้าของโปรเจกต์", en: "A project's own page", jp: "案件のページ" },
  summary: {
    th: "กดเลขหรือชื่อโปรเจกต์ในรายการเพื่อเปิดหน้าของโปรเจกต์นั้น ด้านบนคือชื่อ ขั้นงาน และข้อมูลหลัก พร้อมปุ่มแก้ไข สมาชิก เปลี่ยนขั้น พัก ปิด และลบ ด้านล่างเป็นแท็บ ภาพรวม แผนงาน ต้นทุน และเอกสาร ลิงก์ของหน้านี้ส่งต่อให้เพื่อนเปิดแท็บเดียวกันได้",
    en: "Press a project's number or name in the list to open its own page. At the top: its name, stage and main facts, with Edit, Members, stage (hold, close), end user and Delete. Below: the tabs Overview, Plan, Cost and Documents. The page's link opens the same tab for a teammate.",
    jp: "一覧の案件番号または名前を押すと案件のページが開きます。上部に名前・段階・主な情報と、編集・メンバー・段階の変更（保留・完了）・エンドユーザー・削除があります。下に「概要」「計画」「コスト」「文書」のタブがあります。このページのリンクで同じタブを共有できます。",
  },
  steps: [
    menu("projects", { th: "เปิดโปรเจกต์", en: "Open Projects", jp: "「案件」を開く" }, { th: "คลิกที่เมนูที่ไฮไลต์อยู่", en: "Click the highlighted menu entry.", jp: "強調表示のメニューをクリックします。" }),
    {
      target: "project.rowMenu",
      action: "next",
      view: "projects",
      title: { th: "เปิดหน้าของโปรเจกต์", en: "Open a project's page", jp: "案件のページを開く" },
      body: {
        th: "กดเลขหรือชื่อโปรเจกต์ หรือเมนู ⋯ ของแถวแล้วเลือก 'เปิดหน้าโปรเจกต์' เมนูของแถวมีเพียงเปิดหน้าและเปิดแผนงาน งานแก้ไขอื่นย้ายไปอยู่ในหน้าของโปรเจกต์",
        en: "Press the project's number or name, or the row's ⋯ menu and Open project page. The row menu only opens the page or the plan; the other actions moved to the project's page.",
        jp: "案件番号か名前を押すか、行の ⋯ メニューで「案件ページを開く」を選びます。行メニューはページと計画を開くだけで、他の操作は案件のページに移りました。",
      },
      missing: { th: "ถ้ายังไม่มีโปรเจกต์ในรายการ ให้กด 'ถัดไป'", en: "If the list has no project yet, press Next.", jp: "一覧に案件がない場合は「次へ」を押します。" },
    },
    {
      target: "projectPage.header",
      action: "next",
      view: "projects",
      title: { th: "หัวของหน้า", en: "The page's header", jp: "ページの見出し" },
      body: {
        th: "ชื่อ เลขโปรเจกต์ สุขภาพของแผน ลูกค้า PM วิศวกรหลัก PO และวันส่งมอบ ปุ่มขั้นงานใช้เปลี่ยนขั้นตามกติกาเดิม รวมถึงพักงานและปิดโปรเจกต์",
        en: "Name, number, the plan's health, customer, PM, lead engineer, PO and delivery date. The stage button moves the project along by the usual rules, including putting it on hold and closing it.",
        jp: "名前・番号・計画の健全性・顧客・PM・リードエンジニア・PO・納期です。段階ボタンで従来のルールどおり段階を変更でき、保留や完了も行えます。",
      },
      missing: { th: "เปิดหน้าของโปรเจกต์ก่อน หรือกด 'ถัดไป'", en: "Open a project's page first, or press Next.", jp: "先に案件のページを開くか、「次へ」を押します。" },
    },
    {
      target: "projectPage.more",
      action: "next",
      view: "projects",
      title: { th: "แก้ไขและอื่นๆ", en: "Edit and More", jp: "編集とその他" },
      body: {
        th: "'แก้ไขโปรเจกต์' แก้ข้อมูลหลัก 'อื่นๆ' มีสมาชิก เปลี่ยน End user และลบโปรเจกต์ (ลบได้เมื่อยังไม่มีงานบันทึกไว้)",
        en: "Edit project changes the main facts. More holds Members, the end user and Delete project (allowed while no work is recorded against it).",
        jp: "「案件を編集」で主な情報を変更します。「その他」にはメンバー・エンドユーザー・案件の削除（作業記録がない間のみ）があります。",
      },
      missing: { th: "เปิดหน้าของโปรเจกต์ก่อน หรือกด 'ถัดไป'", en: "Open a project's page first, or press Next.", jp: "先に案件のページを開くか、「次へ」を押します。" },
    },
    {
      target: "projectPage.summary",
      action: "next",
      view: "projects",
      title: { th: "แท็บภาพรวม", en: "The Overview tab", jp: "概要タブ" },
      body: {
        th: "แถวบนคือความคืบหน้าเทียบแผน วันที่เลย งานต้องตาม (นับเหมือนคอลัมน์ในรายการโปรเจกต์) ชั่วโมงจริงเทียบงบ จุดสำคัญถัดไป และคำขอปรับวันที่รอตอบ กดกล่องไหนจะไปที่แท็บแผนงาน กล่องชั่วโมงตามสาขาแยกสาขาแบบเดียวกับแถบชั่วโมงในแผนงานและแท็บต้นทุน",
        en: "The top row: progress against plan, days late, rows to chase (counted as in the project list), hours against budget, the next milestone and day requests waiting for an answer. Press a box to go to the Plan tab. Hours by discipline splits the hours the same way as the Plan sheet's hours bar and the Cost tab.",
        jp: "上段は計画に対する進捗・遅延日数・要対応の作業（案件一覧の列と同じ数え方）・予算に対する実績時間・次のマイルストーン・回答待ちの日程変更依頼です。ボックスを押すと「計画」タブへ移ります。分野別の時間は計画の時間バーやコストタブと同じ分け方です。",
      },
      missing: { th: "เปิดหน้าของโปรเจกต์ก่อน หรือกด 'ถัดไป'", en: "Open a project's page first, or press Next.", jp: "先に案件のページを開くか、「次へ」を押します。" },
    },
    {
      target: "projectPage.boxes",
      action: "next",
      view: "projects",
      title: { th: "กล่องในภาพรวม", en: "The Overview boxes", jp: "概要のボックス" },
      body: {
        th: "ใต้แถวบนเป็นกล่อง: วันสำคัญ ความคืบหน้าตามหัวข้อ (เส้นดำคือที่ควรถึงวันนี้ แดงคือมีงานเลยกำหนด) ชั่วโมงตามสาขา (งบ แผน จริง) ใบขอซื้อตามสถานะ ทีมและชั่วโมงสัปดาห์นี้ เอกสารล่าสุด การชำระเงิน และความเคลื่อนไหวล่าสุด กด 'เปิด' ที่หัวกล่องเพื่อไปยังที่จัดการเรื่องนั้น ไม่มีจำนวนเงินในหน้านี้",
        en: "Below the top row are boxes: key dates, progress by heading (the dark line is where it should be today; red means work is late), hours by discipline (budget, plan, actual), purchase requests by status, the team and its hours this week, the latest documents, payments and the latest activity. Press Open on a box to go where that is handled. No money on this page.",
        jp: "上段の下にボックスがあります：主要日程、見出し別の進捗（黒い線は今日の予定位置、赤は遅延）、分野別の時間（予算・計画・実績）、状態別の購買依頼、チームと今週の時間、最新の文書、入金、最近の動きです。ボックスの「開く」で担当の画面へ移ります。このページに金額はありません。",
      },
      missing: { th: "เปิดหน้าของโปรเจกต์ก่อน หรือกด 'ถัดไป'", en: "Open a project's page first, or press Next.", jp: "先に案件のページを開くか、「次へ」を押します。" },
    },
    {
      target: "cost.views",
      action: "next",
      view: "projects",
      title: { th: "แท็บต้นทุน", en: "The Cost tab", jp: "コストタブ" },
      body: {
        th: "สำหรับ Leader ขึ้นไป แถวบนสลับมุมมอง ภาพรวม ตามงาน ตามคน และซื้อของ สี่ช่องด้านล่างคือ Hardware และ Outsource (ขอซื้อแล้วเทียบงบ) man-day ที่ใช้จริง และที่คาดตอนจบเทียบงบ กดช่องเพื่อไปมุมมองนั้น ภาพรวมมีกราฟ man-day สะสม (เส้นประคือแผน เส้นเขียวคือจริง เส้นแดงคืองบ จุดส้มคือคาดตอนจบ) คู่กับตารางตามสาขา มุมมองซื้อของมีกราฟยอดขอซื้อและสั่งซื้อสะสม (สั่งซื้อนับจากวันที่ระบบเห็น PO) แถบช่วงวันที่ต้องการของ และแยกตามหมวด",
        en: "For Leaders and above. The top row switches between Overview, By task, By person and Bought. The four figures below are Hardware and Outsource (requested against budget), man-days used and the forecast at completion against budget; press one to open its view. The Overview draws man-days over time (dashed: plan, green: actual, red: budget, orange dot: forecast) beside the split by discipline. Bought draws requested and ordered cost over time (ordered by the date the app first saw the PO), with the need-by dates as a band and the split by category.",
        jp: "リーダー以上が対象です。上段で「概要」「作業別」「人別」「購買」を切り替えます。その下の4つはハードウェアと外注（予算に対する依頼額）、実績人日、予算に対する完了時見込みで、押すとその表示に移ります。概要には人日の累計グラフ（点線：計画、緑：実績、赤：予算、橙の点：見込み）と分野別の表があります。",
      },
      missing: {
        th: "เปิดแท็บต้นทุนของโปรเจกต์ก่อน (Leader ขึ้นไป) หรือกด 'ถัดไป'",
        en: "Open a project's Cost tab first (Leaders and above), or press Next.",
        jp: "先に案件のコストタブを開く（リーダー以上）か、「次へ」を押します。",
      },
    },
    {
      target: "ceo.summary",
      action: "next",
      view: "projects",
      title: { th: "สรุปต้นทุนสำหรับ CEO", en: "The CEO cost summary", jp: "CEO 向けコスト概要" },
      body: {
        th: "สำหรับ Leader ขึ้นไป เปิดจากปุ่ม 'สรุปสำหรับ CEO' บนแถบด้านบนของรายการโปรเจกต์ หรือในแท็บต้นทุน หน้าเดียวแสดงทุกโปรเจกต์ที่เปิดอยู่ เรียงจากเสี่ยงงบมากที่สุด หรือเลือกโปรเจกต์เดียว แต่ละโปรเจกต์มี Hardware Outsource และคนเทียบงบ เรื่องที่ควรรู้ที่ระบบเขียนให้จากตัวเลข และหมายเหตุจาก PM (PM ของโปรเจกต์ EM หรือ Admin เขียนได้) กดชื่อเพื่อเปิดโปรเจกต์ ไม่มีการส่งอีเมล ปุ่ม PDF พิมพ์หน้าตามที่เห็นบนกระดาษ A4 แนวนอน (เลือก บันทึกเป็น PDF) ปุ่ม Excel ได้แท็บ สรุป ตามคน ตามงาน ใบขอซื้อ และทุกโปรเจกต์",
        en: "For Leaders and above: open it from the CEO summary button at the top of the project list, or on a project's Cost tab. One page with every open project, most at risk on its budget first, or one project. Each shows hardware, outsource and people against budget, things to know written from the figures, and a note from the PM (the project's manager, an Engineering Manager or an Admin writes it). Press a name to open the project. Nothing is emailed. PDF prints the page as it is on A4 landscape (choose Save as PDF); Excel has the sheets Summary, By person, By task, Purchase requests and All projects.",
        jp: "リーダー以上が対象です。案件一覧の上部、または案件のコストタブの「CEO 向け概要」ボタンから開きます。進行中の全案件を予算リスクの高い順に、または1案件だけを1ページで表示します。各案件にハードウェア・外注・人員の予算比、数値から自動で書かれる「知っておくべきこと」、PM からのメモ（案件の PM、EM、Admin が記入）があります。名前を押すと案件を開きます。メールは送りません。「PDF」は表示どおりのページを A4 横で印刷します（「PDF として保存」を選択）。「Excel」には概要・人別・作業別・購買依頼・全案件のシートがあります。",
      },
      missing: {
        th: "เปิดสรุปสำหรับ CEO ก่อน (Leader ขึ้นไป) หรือกด 'ถัดไป'",
        en: "Open the CEO summary first (Leaders and above), or press Next.",
        jp: "先に CEO 向け概要を開く（リーダー以上）か、「次へ」を押します。",
      },
    },
    {
      target: "projectCreate.aside",
      action: "next",
      view: "projects",
      title: { th: "สร้างโปรเจกต์เป็นหน้าเต็ม", en: "Create project as a page", jp: "ページで案件を作成" },
      body: {
        th: "ปุ่ม 'สร้างโปรเจกต์' เปิดเป็นหน้าเต็ม 4 ส่วน: ที่มา ข้อมูลโปรเจกต์ แผนตั้งต้น และการชำระเงิน ด้านขวาบอกช่องที่ยังขาดและสิ่งที่ระบบทำหลังกดสร้าง สิ่งที่พิมพ์เก็บไว้ในเบราว์เซอร์จนกว่าจะสร้าง สร้างเสร็จระบบเปิดแท็บแผนงานของโปรเจกต์ใหม่ทันที",
        en: "Create project opens as a page in four parts: where it comes from, project details, the starting plan and payments. The right-hand column lists what is still needed and what Create does. What you type is kept in the browser until the project exists, and the new project opens on its Plan.",
        jp: "「案件を作成」がページで開き、由来・案件情報・初期計画・入金の4部構成です。右側に未入力の項目と作成時に行われる処理が表示されます。入力内容は作成までブラウザーに保存され、作成後は新しい案件の計画タブが開きます。",
      },
      missing: {
        th: "กด 'สร้างโปรเจกต์' ในรายการโปรเจกต์เพื่อเปิดหน้านี้ หรือกด 'ถัดไป'",
        en: "Press Create project on the Projects list to open this page, or press Next.",
        jp: "案件一覧で「案件を作成」を押すとこのページが開きます。または「次へ」を押します。",
      },
    },
    {
      target: "projectDocs.folders",
      action: "next",
      view: "projects",
      title: { th: "แท็บเอกสาร", en: "The Documents tab", jp: "文書タブ" },
      body: {
        th: "ด้านซ้ายคือแฟ้มมาตรฐาน 00–14 พร้อมจำนวนไฟล์ ด้านบนค้นหาและกรองตามที่มา (Inquiry, Site Visit, Estimate, ส่งออกจากแผน, อัปโหลดเอง) ลากไฟล์หลายไฟล์มาวางในกรอบนี้ แล้วเลือกแฟ้มและพิมพ์ชนิดของแต่ละไฟล์ก่อนกดอัปโหลด กดชื่อไฟล์เพื่อดาวน์โหลด",
        en: "On the left, the standard folders 00-14 with their file counts; above, a search and a filter by where files came from (Inquiry, Site Visit, Estimate, plan export, uploaded). Drop many files in this box, give each its folder and type, then upload. Press a file's name to download it.",
        jp: "左は標準フォルダー 00〜14 とファイル数、上は検索と由来（Inquiry・Site Visit・Estimate・計画から出力・アップロード）での絞り込みです。この枠に複数のファイルをドロップし、それぞれのフォルダーと種類を入れてからアップロードします。ファイル名を押すとダウンロードします。",
      },
      missing: { th: "เปิดแท็บเอกสารของโปรเจกต์ก่อน หรือกด 'ถัดไป'", en: "Open a project's Documents tab first, or press Next.", jp: "先に案件の文書タブを開くか、「次へ」を押します。" },
    },
  ],
};

const MY_HOURS: Guide = {
  id: "my-hours-confirm",
  area: "project",
  minutes: 2,
  permissions: ["schedule.read", "schedule.progress"],
  views: ["my-work"],
  title: { th: "ยืนยันชั่วโมงทำงานรายวัน", en: "Confirm your daily hours", jp: "毎日の作業時間を確定" },
  summary: {
    th: "ระบบร่างชั่วโมงของแต่ละวันจากเวลาที่คุณลงในสัปดาห์ของฉัน (ถ้าไม่ได้ลง ร่างจากงานในแผน) Team task Issue และนัดใน Outlook ถ้าเป็นไปตามนั้นกดยืนยันที่ท้ายวันครั้งเดียว ถ้าไม่ตรงเปิดวันนั้นแล้วแก้ชั่วโมง ลบหรือเพิ่มงาน ยืนยันย้อนหลังได้ 30 วัน",
    en: "The app drafts each day's hours from the time you booked on My week (or, without it, from your plan tasks), team tasks, issues and Outlook meetings. Confirm with one press at the foot of the day when it went that way; otherwise open the day and change the hours, remove or add work. Days can be confirmed up to 30 days late.",
    jp: "マイウィークで入れた時間（なければ計画タスク）、チームタスク、課題、Outlookの予定から毎日の作業時間を下書きします。そのとおりなら日の下でワンクリックで確定し、違う日はその日を開いて時間を直したり作業を追加・削除したりします。30日前まで遡って確定できます。",
  },
  steps: [
    menu(
      "my-work",
      { th: "เปิดงานของฉัน", en: "Open My Work", jp: "「マイワーク」を開く" },
      {
        th: "การยืนยันชั่วโมงอยู่ท้ายแต่ละวันในสัปดาห์ของฉัน คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Hours are confirmed at the foot of each day on My week. Click the highlighted menu entry.",
        jp: "作業時間はマイウィークの各日の下で確定します。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="week"]',
      action: "click",
      view: "my-work",
      title: { th: "เปิดสัปดาห์ของฉัน", en: "Open My week", jp: "マイウィークを開く" },
      body: { th: "กดแท็บ 'สัปดาห์ของฉัน'", en: "Press the My week tab.", jp: "「マイウィーク」タブを押します。" },
    },
    {
      target: "myweek.week",
      action: "next",
      view: "my-work",
      title: { th: "ชั่วโมงของสัปดาห์", en: "Your week's hours", jp: "今週の作業時間" },
      body: {
        th: "แถบนี้บอกชั่วโมงทำงานของสัปดาห์ ลงเวลาไปแล้วเท่าไร ลาเท่าไร ว่างเท่าไร และยืนยันแล้วเท่าไร ลูกศรด้านบนเลื่อนดูสัปดาห์ก่อนได้",
        en: "This bar shows the week's working hours: how many are booked, away, free and confirmed. The arrows above move to the previous week.",
        jp: "この帯は今週の勤務時間（予定済み・不在・空き・確定済み）を示します。上の矢印で前の週に移動できます。",
      },
    },
    {
      target: "myweek.confirm",
      action: "next",
      view: "my-work",
      title: { th: "วันที่เป็นไปตามปฏิทิน: กดครั้งเดียว", en: "A day that went as booked: one press", jp: "予定どおりの日：ワンクリック" },
      body: {
        th: "ปุ่ม 'ยืนยัน' ท้ายวันบันทึกชั่วโมงตามร่างทันที วันที่ยังไม่ยืนยันมีปุ่มนี้ทุกวัน วันที่ไม่มีงานเลยต้องลงชั่วโมงเอง งานในแผนที่ยังไม่เริ่ม พอยืนยันชั่วโมงลงไปจะเปลี่ยนเป็นกำลังทำ และวันเริ่มจริงคือวันนั้น",
        en: "Confirm at the foot of the day saves the drafted hours at once. Every day still waiting has this button; a day with nothing on it is filled in by you. A plan task not started yet turns In progress once hours on it are confirmed, with that day as its actual start.",
        jp: "日の下の「確定」で下書きの時間をすぐ保存します。未確定の日にはこのボタンがあります。何もない日は自分で入力します。未着手の計画タスクは、時間を確定すると進行中になり、その日が実績開始日になります。",
      },
      missing: { th: "วันนี้ยืนยันแล้ว หรือวันนี้ไม่มีงาน กด 'ถัดไป'", en: "Today is already confirmed or has nothing on it. Press Next.", jp: "今日は確定済みか、作業がありません。「次へ」を押します。" },
    },
    {
      target: "myweek.editHours",
      action: "click",
      view: "my-work",
      title: { th: "วันที่ไม่ตรง: แก้ชั่วโมง", en: "A day that went differently: change the hours", jp: "違う日：時間を修正" },
      body: { th: "กด 'แก้ชั่วโมง' ท้ายวันนั้น", en: "Press Change hours at the foot of that day.", jp: "その日の下の「時間を修正」を押します。" },
      missing: {
        th: "วันนี้ยังแก้ไม่ได้ (ยังไม่ถึงหรือปิดแล้ว) กด 'ถัดไป'",
        en: "This day cannot be changed (still to come, or closed). Press Next.",
        jp: "この日はまだ変更できません（未来の日か締め済み）。「次へ」を押します。",
      },
    },
    {
      target: "hours.add",
      action: "next",
      view: "my-work",
      title: { th: "แก้ชั่วโมง ลบ หรือเพิ่มงาน", en: "Change hours, remove or add work", jp: "時間の修正・作業の削除と追加" },
      body: {
        th: "แก้ตัวเลขชั่วโมงเฉพาะงานที่ไม่ตรง (ทีละ 0.25 ชม.) กด × เพื่อลบงานที่ไม่ได้ทำ และเลือกงานจากช่อง 'เพิ่มงาน' ถ้าเป็นงานนอกแผน เลือก 'งานอื่นในโครงการ' หรือ 'งานอื่น' แล้วพิมพ์ว่าทำอะไร 'กลับไปตามแผน' ล้างที่แก้ไว้",
        en: "Change the hours only where the day differed (in steps of 0.25 h), press × to remove work you did not do, and pick work from Add work. For work outside the plan choose Other work on a project or Other work and type what you did. Back to the plan undoes your changes.",
        jp: "違う作業の時間だけ直し（0.25時間単位）、しなかった作業は×で削除し、「作業を追加」から作業を選びます。計画外の作業は「プロジェクトのその他作業」か「その他の作業」を選んで内容を入力します。「計画に戻す」で変更を取り消せます。",
      },
      missing: {
        th: "วันนี้แก้ไขไม่ได้ (ยังไม่ถึง หรือเกิน 30 วัน) กด 'ถัดไป'",
        en: "This day cannot be changed (still to come, or more than 30 days ago). Press Next.",
        jp: "この日は変更できません（未来の日か30日以上前）。「次へ」を押します。",
      },
    },
    {
      target: "hours.save",
      action: "click",
      view: "my-work",
      title: { th: "ยืนยันชั่วโมง", en: "Confirm the hours", jp: "時間を確定" },
      body: {
        th: "กด 'ยืนยันชั่วโมง' ชั่วโมงที่ยืนยันจะไปรวมเป็น 'ใช้จริง' ในแถบงบ Man-hour ของโครงการ แก้ซ้ำได้ภายใน 30 วัน ถ้าแค่ฝึก ให้กด 'ยกเลิก'",
        en: "Press Confirm hours. Confirmed hours add up to Actual on the project's man-hour line, and the day can be changed again for 30 days. Only practising? Press Cancel.",
        jp: "「時間を確定」を押します。確定した時間はプロジェクトの工数予算の「実績」に加算され、30日以内なら再度変更できます。練習だけなら「キャンセル」を押します。",
      },
      missing: { th: "วันนี้แก้ไขไม่ได้ กด 'จบบทสอน'", en: "This day cannot be changed. Press Finish.", jp: "この日は変更できません。「完了」を押します。" },
    },
  ],
};

const PROJECT_COST: Guide = {
  id: "project-cost",
  area: "project",
  minutes: 2,
  permissions: ["project.read", "schedule.read"],
  views: ["projects"],
  browse: true,
  title: { th: "ดูต้นทุนโครงการ (Hardware และคน)", en: "Check project cost (hardware and people)", jp: "プロジェクトコストを確認（ハードウェアと人員）" },
  summary: {
    th: "สำหรับ Leader ขึ้นไป: ดูงบจาก Estimate cost เทียบกับใบขอซื้อ Hardware / Outsource และชั่วโมงงานของคนตามแผน ของทุกโครงการในหน้าเดียว แล้วเปิดรายละเอียดรายโครงการ",
    en: "For Leaders and above: see every project's Estimate cost against its hardware and outsource purchase requests and the planned hours of work on one page, then open one project's breakdown.",
    jp: "リーダー以上向け：全プロジェクトの見積原価と、ハードウェア・外注の購入依頼および計画工数（時間）を1ページで確認し、案件ごとの内訳を開きます。",
  },
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      { th: "ต้นทุนอยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Cost is here. Click the highlighted menu entry.", jp: "コストはここにあります。ハイライトされたメニューをクリックします。" },
    ),
    {
      target: '[data-tab="cost"]',
      action: "click",
      view: "projects",
      title: { th: "แท็บต้นทุน", en: "The Cost tab", jp: "「コスト」タブ" },
      body: { th: "คลิกแท็บ 'ต้นทุน'", en: "Click the Cost tab.", jp: "「コスト」タブをクリックします。" },
      missing: {
        th: "แท็บนี้แสดงเฉพาะ Leader ขึ้นไป (Leader ผู้จัดการ Management และ Admin)",
        en: "This tab is shown to Leaders and above only (Leader, managers, Management and Admin).",
        jp: "このタブはリーダー以上（リーダー・マネージャー・Management・Admin）にのみ表示されます。",
      },
    },
    {
      target: "cost.totals",
      action: "next",
      view: "projects",
      title: { th: "ยอดรวมของที่ซื้อ", en: "Totals of what is bought", jp: "購入分の合計" },
      body: {
        th: "Hardware และ Outsource แสดง 'ขอซื้อแล้ว / งบ' พร้อมยอดที่สั่งซื้อแล้ว ยอดรวมนับทุกแถวที่ผ่านตัวกรอง ไม่ใช่แค่หน้าที่เห็น ชี้ที่ตัวเลขย่อเพื่อดูจำนวนเต็ม",
        en: "Hardware and Outsource read requested / budget, with what is ordered. The totals cover every row that passes the filters, not only the page in view. Hover a short figure for the exact amount.",
        jp: "ハードウェアと外注は「依頼済み / 予算」と発注済み額を表示します。合計は表示ページだけでなく、フィルター後の全行が対象です。短縮表示にカーソルを合わせると正確な金額が出ます。",
      },
      missing: { th: "รอให้ข้อมูลโหลดเสร็จก่อน", en: "Wait for the figures to load.", jp: "データの読み込みを待ちます。" },
    },
    {
      target: "cost.labor",
      action: "next",
      view: "projects",
      title: { th: "ชั่วโมงงานแยกตามสายงาน", en: "Labor hours by discipline", jp: "分野別の工数（時間）" },
      body: {
        th: "แต่ละช่องคือชั่วโมงงานทั้งหมด หรือของ Electrical, Mechanical, Software และ Installation แสดง 'ชั่วโมงตามแผน / งบ' กับส่วนที่ถึงวันนี้ กดช่องของสายงานเพื่อให้คอลัมน์คนในตารางแสดงเฉพาะสายงานนั้น กดซ้ำเพื่อกลับไปดูทั้งหมด งบคือชั่วโมงงานใน Estimate cost ส่วนชั่วโมงในแผนนับตามแผนกของผู้รับผิดชอบแต่ละแถว 'ใช้จริง' คือชั่วโมงที่ทีมยืนยันในงานของฉัน และ 'คาดจบ' คือใช้จริงบวกงานที่แผนยังเหลือ ถ้าคาดจบเกินงบช่องจะเป็นสีแดง ฝั่งคนนับเป็นชั่วโมง ไม่แสดงเป็นเงิน",
        en: "Each cell is all labor, or Electrical, Mechanical, Software or Installation labor, as planned hours / budget with the part due up to today. Press a discipline to make the table's People columns show it alone; press again for all labor. The budget is the Estimate cost's labor hours; plan hours follow the department of each row's PIC. Actual is the hours the team confirmed in My Work, and Forecast is the actual plus what the plan still has to do; a forecast over budget turns the cell red. People are counted in hours, not money.",
        jp: "各セルは工数の合計、または電気・機械・ソフトウェア・据付の工数で、「計画時間 / 予算」と本日までの分を表示します。分野を押すと表の人員列がその分野だけになり、もう一度押すと合計に戻ります。予算は見積原価の工数（時間）、計画時間は各行の担当者の部署で振り分けます。「実績」はチームがマイワークで確定した時間、「見込み」は実績に計画の残りを足したもので、見込みが予算を超えるとセルが赤になります。人員は金額ではなく時間で数えます。",
      },
      missing: { th: "รอให้ข้อมูลโหลดเสร็จก่อน", en: "Wait for the figures to load.", jp: "データの読み込みを待ちます。" },
    },
    {
      target: "cost.filter",
      action: "next",
      view: "projects",
      title: { th: "กรองตามสถานะงบ", en: "Filter by budget state", jp: "予算の状態で絞り込む" },
      body: {
        th: "กด 'เกินงบ' หรือ 'ใกล้เต็มงบ' (ใช้ไป 90% ขึ้นไป) เพื่อดูเฉพาะโครงการที่ต้องตาม โครงการนับตามกลุ่มที่แย่ที่สุดของมัน กดซ้ำเพื่อล้างตัวกรอง",
        en: "Press Over budget or Near budget (90% used or more) to list only the projects to chase. A project counts by its worst group. Press again to clear.",
        jp: "「予算超過」または「予算間近」（90%以上使用）を押すと、対応が必要な案件だけが表示されます。案件は最も悪いグループで数えます。もう一度押すと解除します。",
      },
    },
    {
      target: "cost.table",
      action: "next",
      view: "projects",
      title: { th: "อ่านแถวของโครงการ", en: "Read a project's row", jp: "プロジェクトの行を読む" },
      body: {
        th: "แต่ละกลุ่มแสดง 'ใช้ไป / งบ' พร้อมแถบ: น้ำเงินอยู่ในงบ เหลืองใกล้เต็ม แดงเกินงบ ขีดบนแถบของคนคือชั่วโมงที่แผนวางไว้ถึงวันนี้ ใต้แถบคือ 'ใช้จริง' (ชั่วโมงที่ยืนยันแล้ว) และ 'คาดจบ' คอลัมน์คนแสดงสายงานที่เลือกไว้ในแถบชั่วโมงงาน กดหัวคอลัมน์เพื่อเรียง",
        en: "Each group shows used / budget with a bar: blue within budget, amber near it, red over it. The mark on the People bar is the hours the plan puts on or before today; under the bar are Actual (confirmed hours) and Forecast. The People columns show the discipline chosen in the labor hours bar. Press a column heading to sort.",
        jp: "各グループは「使用 / 予算」とバーで表示されます。青は予算内、黄は間近、赤は超過です。人員のバー上の印は、計画上本日までの時間です。バーの下に「実績」（確定時間）と「見込み」を表示します。人員列は工数バーで選んだ分野を表示します。列見出しを押すと並べ替えます。",
      },
    },
    {
      target: "cost.open",
      action: "click",
      view: "projects",
      title: { th: "เปิดรายละเอียดโครงการ", en: "Open a project's breakdown", jp: "案件の内訳を開く" },
      body: {
        th: "คลิกเลขโครงการ รายละเอียดเปิดเป็นหน้าต่างทับรายการ ตัวกรองของคุณยังอยู่",
        en: "Click a project number. The breakdown opens over the list, so your filters stay.",
        jp: "案件番号をクリックします。内訳は一覧の上に開くので、フィルターはそのままです。",
      },
      missing: { th: "ยังไม่มีโครงการในรายการ ล้างตัวกรองก่อน", en: "No project in the list. Clear the filters first.", jp: "一覧に案件がありません。先にフィルターを解除してください。" },
    },
    {
      target: "cost.hardware",
      action: "next",
      view: "projects",
      title: { th: "Hardware และ Outsource แยกตาม Module", en: "Hardware and outsource by module", jp: "モジュール別のハードウェア・外注" },
      body: {
        th: "งบของแต่ละ Module มาจาก Estimate cost ยอดขอซื้อ อนุมัติ และสั่งซื้อมาจากใบขอซื้อที่ยังใช้งานอยู่ 'สั่งซื้อแล้ว' คือรายการที่ ERP ออก PO แล้ว คิดที่ราคาโดยประมาณในใบขอซื้อ ด้านล่างคือรายการใบขอซื้อของโครงการ",
        en: "Each Module's budget comes from the Estimate cost; requested, approved and ordered come from the live purchase requests. Ordered is what the ERP has a PO for, at the request's approximate price. The project's requests are listed below.",
        jp: "各モジュールの予算は見積原価から、依頼・承認・発注は有効な購入依頼からです。「発注済み」はERPでPOが発行された明細で、依頼時の概算価格で計算します。下に案件の購入依頼が並びます。",
      },
      missing: { th: "รอให้รายละเอียดโหลดเสร็จก่อน", en: "Wait for the breakdown to load.", jp: "内訳の読み込みを待ちます。" },
    },
    {
      target: "cost.people",
      action: "next",
      view: "projects",
      title: { th: "ชั่วโมงงานแยกตามสายงานและตามแผน", en: "Labor hours by discipline and by plan", jp: "分野別・計画別の工数（時間）" },
      body: {
        th: "ตารางบนเทียบงบกับแผนของแต่ละสายงานเป็นชั่วโมง: งบ ตามแผน ถึงวันนี้ ใช้จริง คาดจบ และคงเหลือ (สีแดงเมื่อเกิน) ตารางล่างคือชั่วโมงในแผนงานใต้หัวข้อหลักแต่ละแถว กด 'เปิดแผนงาน' เพื่อไปแก้แผน หรือกด 'ปิด' เพื่อกลับไปที่รายการ",
        en: "The first table sets each discipline's budget against the plan in hours: budget, planned, to date, actual, forecast and what is left (red when over). The second is the planned hours under each top row. Press Open plan to change the plan, or Close to return to the list.",
        jp: "上の表は分野ごとに予算と計画を時間で比較します（予算、計画、本日まで、実績、見込み、残り。超過は赤）。下の表は各トップ行配下の計画時間です。「計画を開く」で計画を修正、「閉じる」で一覧に戻ります。",
      },
      missing: { th: "รอให้รายละเอียดโหลดเสร็จก่อน", en: "Wait for the breakdown to load.", jp: "内訳の読み込みを待ちます。" },
    },
  ],
};

const PROJECT_PLAN: Guide = {
  id: "project-plan",
  area: "project",
  title: { th: "วางแผนงานโปรเจกต์บน Gantt", en: "Plan a project on the Gantt", jp: "ガントで案件を計画" },
  summary: {
    th: "แผนแก้ที่ 'ตาราง' ที่เดียว พิมพ์ทีละช่องเหมือน Excel วางจาก Excel ได้ และกด 'เฉพาะหัวข้อ' เพื่อดู Master Plan 'ตามสมาชิก' ดูทีละคน และ 'ตารางคน' ใส่จำนวนคนรายวัน",
    en: "The plan is edited in one place, the Sheet: type it cell by cell like Excel, paste from Excel, and press Headings only to see the Master Plan. By member shows it person by person, and People takes the head count per day.",
    jp: "計画は「表」の一か所で編集します。Excel のようにセルごとに入力し、Excel から貼り付けもでき、「見出しのみ」でマスタープランを表示します。「メンバー別」は一人ずつ表示し、「人員表」で日ごとの人数を入力します。",
  },
  minutes: 5,
  permissions: ["schedule.read"],
  views: ["projects"],
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「プロジェクト」を開く" },
      {
        th: "แผนงานของทุกโปรเจกต์อยู่ในเมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every project's plan is here. Click the highlighted menu entry.",
        jp: "すべての案件の計画がここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="schedule"]',
      action: "click",
      view: "projects",
      title: { th: "แท็บแผนงาน", en: "The Plan tab", jp: "「計画」タブ" },
      body: { th: "คลิกแท็บ 'แผนงาน'", en: "Click the Plan tab.", jp: "「計画」タブをクリックします。" },
    },
    {
      target: "plan.project",
      action: "next",
      view: "projects",
      title: { th: "เลือกโปรเจกต์", en: "Choose the project", jp: "案件を選ぶ" },
      body: { th: "เลือกโปรเจกต์จากรายการ พิมพ์ในช่องค้นหาด้านซ้ายเพื่อหาเร็วขึ้น", en: "Pick the project; type in the search on the left to find it faster.", jp: "案件を選びます。左の検索欄で早く探せます。" },
    },
    {
      target: "plan.manhours",
      action: "next",
      view: "projects",
      title: { th: "งบ Man-hour ของโปรเจกต์", en: "The project's man-hour budget", jp: "案件の工数予算" },
      body: {
        th: "แถบนี้เทียบชั่วโมงที่ประเมินไว้ใน Estimate cost กับชั่วโมงที่วางในแผน และบอกว่าเหลือให้วางอีกเท่าไร สีแดงคือวางเกินงบ ตัวเลขสีเหลืองคือจำนวนงานที่ยังไม่ใส่ Man-day เมื่อทีมกดยืนยันชั่วโมงใน My Work แล้ว จะมีช่อง 'ใช้จริง (ยืนยันแล้ว)' สีเขียวบอกชั่วโมงที่ใช้จริงและจำนวนคน โปรเจกต์ที่ไม่มีค่าแรงประเมินไว้ ผู้จัดการกด 'ตั้งงบ' เพื่อกำหนดเองได้ และตอนแก้แถวงาน ใต้ช่อง Plan man-days จะบอกงบคงเหลือหลังแถวนั้น",
        en: "This line compares the hours estimated in Estimate cost with the hours placed in the plan, and shows what is left to plan. Red means the plan is over the budget; the amber figure counts tasks that have no man-days yet. Once people confirm their hours in My Work, a green Actual (confirmed) figure shows the hours really used and by how many people. For a project with no estimated labor, a manager presses Set budget to type one. When you edit a row, the budget left after that row shows under Plan man-days.",
        jp: "この行は見積原価の見積時間と計画に入れた時間を比べ、残りを表示します。赤は予算超過、黄色の数字は工数未入力のタスク数です。メンバーがマイワークで作業時間を確定すると、緑の「実績（確定分）」に実際の時間と人数が表示されます。見積工数のない案件は、管理者が「予算を設定」で入力できます。行の編集時は、計画人日の下にその行の後の残り予算が表示されます。",
      },
      missing: { th: "ยังไม่ได้เลือกโปรเจกต์ กด 'ถัดไป'", en: "No project is chosen yet. Press Next.", jp: "案件がまだ選ばれていません。「次へ」を押します。" },
    },
    {
      target: "plan.people",
      action: "next",
      view: "projects",
      title: { th: "ตารางคน: ใส่จำนวนคนรายวันแบบ Excel", en: "People table: people per day, typed like Excel", jp: "人員表：Excel のように日ごとの人数を入力" },
      body: {
        th: "กด 'ตารางคน' ที่แถบมุมมอง แต่ละแถวคืองานในแผน แต่ละช่องคือหนึ่งวัน คลิกช่องวันแล้วพิมพ์จำนวนคน กด Enter หรือลากคลุมหลายวันแล้วพิมพ์ครั้งเดียว กด Delete เพื่อลบ และวางตัวเลขที่คัดลอกจาก Excel ได้ ช่อง 'คน/วัน' ใส่จำนวนคนให้ทุกวันทำงานของแถวนั้น ถ้าคนเดียวทำหลายงานในวันเดียว ให้ใส่งานละเศษ เช่น 0.5 ช่องที่ขึ้นขอบเหลืองคือวันที่คนนั้นถูกใส่งานรวมทุกโปรเจกต์เกินกำลังต่อวันของเขา เลือก 'ของเรา' หรือ 'จ้างนอก' ต่อแถว ถ้าจ้างนอกให้พิมพ์ชื่อบริษัท Manpower ใต้ชื่องาน Man-day ของแถวคิดจากจำนวนคนที่ใส่ ระบบบันทึกให้เอง การเพิ่มงานทำใน 'ตาราง'",
        en: "Press People table on the view bar. Each row is a task of the plan and each cell is one day. Click a day and type the number of people, then press Enter; or drag over several days and type once. Delete clears, and numbers copied from Excel can be pasted in. The People/day box puts that many people on every work day of the row. When one person does several tasks on a day, type a share on each, such as 0.5; an amber edge marks a day where the person's work over every project is more than they have that day. Mark each row as Ours or Hired; for hired manpower, type the company under the task name. The row's man-days are counted from the people typed, and changes save by themselves. Tasks are added in the Sheet.",
        jp: "表示切替で「人員表」を押します。各行は計画のタスク、各マスは1日です。日のマスをクリックして人数を入力し Enter、または複数の日をドラッグして一度に入力します。Delete で消去、Excel からコピーした数値の貼り付けもできます。「人/日」はその行の全ての作業日に人数を入れます。1人が同じ日に複数のタスクを行う場合は、それぞれに 0.5 のように按分して入力します。全案件を合わせた割当が本人のその日の稼働可能量を超える日は、黄色の枠で示されます。行ごとに「自社」か「外注」を選び、外注の場合はタスク名の下に会社名を入力します。行の人日は入力した人数から計算され、変更は自動で保存されます。タスクの追加は「表」で行います。",
      },
      missing: { th: "ยังไม่ได้เปิดมุมมอง 'ตารางคน' กด 'ถัดไป'", en: "The People table is not open yet. Press Next.", jp: "「人員表」がまだ開かれていません。「次へ」を押します。" },
    },
    {
      target: "plan.gantt",
      action: "next",
      view: "projects",
      title: { th: "อ่าน Gantt", en: "Reading the Gantt", jp: "ガントの見方" },
      body: {
        th: "แต่ละแถบคือช่วงวันของงาน ดับเบิลคลิกแถบเพื่อเปิดงาน ถ้าจะเลื่อนงาน ให้พิมพ์วันใหม่ในแถวของงานนั้นบน 'ตาราง' (ขั้นถัดไป)",
        en: "Each bar is a task's dates; double-click a bar to open the task. To move a task, type its new dates in its row on the Sheet (next steps).",
        jp: "各バーはタスクの日程です。バーをダブルクリックするとタスクが開きます。タスクを動かすには、「表」のその行に新しい日付を入力します（次の手順）。",
      },
      missing: {
        th: "โปรเจกต์นี้ยังไม่มีแผน เพิ่มแถวแรกในขั้นถัดไป",
        en: "This project has no plan yet; add the first row in the next step.",
        jp: "この案件にはまだ計画がありません。次の手順で最初の行を追加します。",
      },
    },
    {
      target: "plan.level",
      action: "next",
      view: "projects",
      title: { th: "ตาราง, ตามสมาชิก หรือตารางคน", en: "Sheet, by member or people", jp: "表・メンバー別・人員表" },
      body: {
        th: "แผนแก้ที่ 'ตาราง' ที่เดียว: พิมพ์ได้ทุกช่องเหมือน Excel (ขั้นถัดไป) และปุ่ม 'เฉพาะหัวข้อ (Master Plan)' ในตารางแสดงเฉพาะหัวข้อหลักตามวันที่ตกลงกับลูกค้า 'ตามสมาชิก' แสดงทีละคนว่าทำงานไหนอยู่ และงานซ้อนกันหรือไม่ 'ตารางคน' คือจำนวนคนต่อวัน",
        en: "The plan is edited in one place, the Sheet: every cell typed like Excel (next step), and its Headings only (Master Plan) button shows just the headings on the dates agreed with the customer. By member shows, person by person, what each one is on and whether their work overlaps; People is the head count per day.",
        jp: "計画は「表」の一か所で編集します。Excel のようにすべてのセルに入力でき（次の手順）、表の「見出しのみ（マスタープラン）」で顧客と合意した日程の見出しだけを表示します。「メンバー別」は一人ずつ、今どの作業をしているか、作業が重なっていないかを、「人員表」は日ごとの人数を表示します。",
      },
      missing: { th: "โปรเจกต์นี้ยังไม่มีแผน กด 'ถัดไป'", en: "This project has no plan yet. Press Next.", jp: "この案件にはまだ計画がありません。「次へ」を押します。" },
    },
    {
      target: "plan.sheet",
      action: "next",
      view: "projects",
      title: { th: "ตาราง: พิมพ์แผนเหมือน Excel", en: "Sheet: type the plan like Excel", jp: "表：Excel のように計画を入力" },
      body: {
        th: "แต่ละแถวคืองานในแผน คลิกช่องแล้วพิมพ์ได้เลย หรือกด F2 หรือดับเบิลคลิกเพื่อแก้ค่าเดิม Enter ลง Tab ไปขวา Esc ยกเลิก ทุกช่องบันทึกเองเมื่อออกจากช่อง Ctrl+Z ย้อน Ctrl+Y ทำซ้ำ และ Ctrl+D เติมจากแถวบน วันที่พิมพ์ได้แบบ 19/11/26, 19/11 หรือ +1 (ถัดจากวันจบของแถวบน) END หรือ DAYS กำหนดความยาวงาน WORK DAYS นับเฉพาะวันทำงาน % DONE และสถานะคือความคืบหน้า (ผู้ทำ PM หรือ Admin) สถานะ 'ติดปัญหา' ให้ใส่เหตุผลในหน้าต่างงานที่เปิดขึ้น PIC คือฝ่ายที่ลูกค้าเห็น ส่วนผู้ทำคือคนในทีมหรือผู้รับเหมา ไม่ใส่ก็ได้ หรือเลือกสายงานไว้รอหัวหน้าจัดคน Ctrl+C คัดลอกช่วงที่เลือกไป Excel และ Ctrl+V วางจาก Excel ได้ ด้านขวาคือ Gantt รายวัน เส้นแดงคือวันนี้ ช่องชมพูคือวันหยุดบริษัท ดับเบิลคลิกแท่งเพื่อเปิดอัปเดตงาน 'เฉพาะหัวข้อ' แสดงแค่ Master Plan 'ไปวันนี้' เลื่อน Gantt มาที่วันนี้ และ 'ซ่อนคอลัมน์' (หรือ « ที่หัว TASK) หุบคอลัมน์ PIC ถึงสถานะเพื่อให้ Gantt กว้างขึ้น กดอีกครั้งเพื่อกางกลับ แถบล่างบอกแถวที่เลือก ภาพรวมแผน และเวลาที่บันทึกล่าสุด",
        en: "Each row is a task of the plan. Click a cell and type, or press F2 or double-click to change what is there. Enter goes down, Tab goes right, Esc cancels; every cell saves itself when you leave it. Ctrl+Z undoes, Ctrl+Y redoes and Ctrl+D fills from the row above. Dates can be typed as 19/11/26, 19/11 or +1 (the day after the row above ends). END or DAYS sets the length, WORK DAYS counts work days only, % DONE and Status are progress (the member, the PM or an Admin); for Blocked, give the reason in the task window that opens. PIC is the party the customer sees; Member is a person in the team or a contractor, may be left empty, or can name the discipline that waits for the head to assign people. Ctrl+C copies the selected cells to Excel and Ctrl+V pastes from Excel. On the right is the day-by-day Gantt: the red line is today, pink days are company holidays, and a double-click on a bar opens the task to update. Headings only shows the Master Plan, Go to today scrolls the Gantt to today, and Hide columns (or « on the TASK header) folds the columns from PIC to Status so the Gantt gets wider; press it again to open them. The bar at the bottom shows the selection, the plan in one line and when it last saved.",
        jp: "各行が計画のタスクです。セルをクリックしてそのまま入力するか、F2 またはダブルクリックで既存の値を修正します。Enter で下へ、Tab で右へ、Esc で取消。各セルは離れると自動保存され、Ctrl+Z で元に戻す、Ctrl+Y でやり直し、Ctrl+D で上の行から埋めます。日付は 19/11/26・19/11・+1（上の行の終了日の翌日）で入力できます。END か DAYS で期間を決め、WORK DAYS は稼働日のみを数え、% DONE と状態は進捗です（担当者・PM・管理者）。保留中は開いたタスク画面で理由を入力します。PIC は顧客に見せる担当側、担当者は社内の人か外注先で空欄でも構いません。分野を選ぶと責任者の割り当て待ちになります。Ctrl+C で選択範囲を Excel へコピー、Ctrl+V で Excel から貼り付けできます。右側は日ごとのガントで、赤い線が今日、ピンクの日が会社休日です。バーをダブルクリックするとタスクの更新画面が開きます。「見出しのみ」でマスタープランだけを表示し、「今日へ」でガントを今日に移動します。「列を隠す」（または TASK 見出しの «）で PIC〜状態の列を折りたたみ、ガントを広く表示します。もう一度押すと元に戻ります。下のバーに選択中の行、計画の概要、最後に保存した時刻が出ます。",
      },
      missing: {
        th: "กด 'ตาราง' ที่แถบมุมมองก่อน หรือกด 'ถัดไป'",
        en: "Press Sheet on the view bar first, or press Next.",
        jp: "先に表示切替の「表」を押すか、「次へ」を押します。",
      },
    },
    {
      target: "plan.sheetAdd",
      action: "next",
      view: "projects",
      title: { th: "เพิ่มแถวในตาราง", en: "Adding rows in the Sheet", jp: "表に行を追加" },
      body: {
        th: "'แทรกแถว' (Ctrl+Enter) หรือ + หน้าแถวเพิ่มแถวใต้แถวที่เลือก บนหัวข้อหลักจะเพิ่มงานท้ายหัวข้อนั้น ชี้ที่งานแล้วกด '+ งานย่อย' เพื่อเพิ่มงานย่อย แถวล่างสุดมี '+ เพิ่มงาน' และ '+ เพิ่มหัวข้อหลัก' หรือพิมพ์ชื่อในแถวนั้นได้เลย พิมพ์ชื่อแล้วกด Enter ระบบบันทึกและเปิดแถวถัดไปให้พิมพ์ต่อ กด Esc เพื่อหยุด ถ้าวางจาก Excel ที่ช่อง WBS ของแถวล่างสุด (คอลัมน์ WBS ถึง WORK DAYS เหมือนไฟล์เดิม) ระบบสร้างหัวข้อและงานตามเลข WBS ให้ ปุ่มลูกศรด้านบน (หรือ Alt+Shift+ลูกศร) ย้ายแถวขึ้นลง เลื่อนเข้าเป็นงานย่อย หรือเลื่อนออก ใช้เมาส์ได้เช่นกัน: คลิกขวาที่แถวเพื่อแทรกแถวด้านบนหรือด้านล่าง เพิ่มงานย่อย ย้าย เปิดงาน หรือลบ ลากช่อง WBS เพื่อย้ายแถวขึ้นลง (วางกลางแถวอื่นเพื่อเป็นงานย่อยของแถวนั้น) และลากขอบหัวคอลัมน์เพื่อปรับความกว้าง 'ลบแถว' ลบแถวที่เลือกถ้ายังไม่เริ่มงาน",
        en: "Insert row (Ctrl+Enter) or the + at the start of a row adds a row under the selected one; on a main heading it adds a task at the end of that heading. Point at a task and press + Sub task to add a sub task. The bottom row has + Add task and + Add main heading, or just type a name in it. Type the name and press Enter: the row saves and the next one opens; Esc stops. Pasting from Excel into the WBS cell of the bottom row (columns WBS to WORK DAYS, as in the old file) builds headings and tasks from the WBS numbers. The arrow buttons above (or Alt+Shift+arrow) move a row up or down, in as a sub task, or out. The mouse works too: right-click a row to insert a row above or below, add a sub task, move it, open the task or delete it; drag a row's WBS cell to move it (drop on the middle of another row to put it under that row); drag a column header's edge to change its width. Delete row removes the selected row if its work has not started.",
        jp: "「行を挿入」(Ctrl+Enter) または行頭の + で選択行の下に行を追加します。大見出しではその見出しの最後にタスクを追加します。タスクにカーソルを合わせて「+ サブタスク」を押すとサブタスクを追加できます。最下行の「+ タスクを追加」「+ 大見出しを追加」、またはその行に直接名前を入力しても追加できます。名前を入力して Enter で保存し、次の行が開きます。Esc で終了します。最下行の WBS セルに Excel から貼り付けると（WBS〜WORK DAYS 列、従来のファイルと同じ）、WBS 番号どおりに見出しとタスクを作ります。上の矢印ボタン（または Alt+Shift+矢印）で行を上下に移動、サブタスクへ下げる、上げることができます。マウスでも操作できます：行を右クリックすると上下への行挿入・サブタスク追加・移動・タスクを開く・削除ができ、WBS セルをドラッグすると行を移動します（他の行の中央に置くとその下へ）。列見出しの端をドラッグすると幅を変えられます。「行を削除」は作業が始まっていない選択行を削除します。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetImport",
      action: "next",
      view: "projects",
      title: { th: "นำเข้าจาก Excel", en: "Import from Excel", jp: "Excel から取り込む" },
      body: {
        th: "เลือกไฟล์ Gantt ที่ทีมใช้อยู่ ระบบหาแถวหัวตารางที่มี TASK และ START เอง แล้วอ่าน WBS PIC START END DAYS และ % DONE ไฟล์อ่านในเบราว์เซอร์เท่านั้น ดูตัวอย่างก่อนว่าแถวไหนจะ 'แก้' 'เพิ่ม' หรือ 'เหมือนเดิม' โดยจับคู่ตามเลข WBS แถวในแอปที่ไม่มีในไฟล์คงไว้ และผู้ทำที่ใส่ไว้ไม่หาย กด 'นำเข้า' แล้วระบบบันทึกทีละแถวให้ (ย้อนการแก้แถวเดิมได้ด้วย Ctrl+Z) ใช้ได้เฉพาะเจ้าของแผน",
        en: "Choose the Gantt file the team uses. The header row with TASK and START is found by itself, then WBS, PIC, START, END, DAYS and % DONE are read; the file stays in the browser. The preview shows which rows will change, be added or stay the same, matched by WBS. Rows in the plan that are not in the file stay, and members already named are kept. Press Import and each row is saved (changes to existing rows undo with Ctrl+Z). For the plan owner only.",
        jp: "チームで使っている Gantt ファイルを選びます。TASK と START のある見出し行を自動で探し、WBS・PIC・START・END・DAYS・% DONE を読み込みます。ファイルはブラウザ内でのみ扱います。WBS で照合し、変更・追加・同じになる行をプレビューで確認できます。ファイルにない計画の行はそのまま、設定済みの担当者も残ります。「取り込む」で各行を保存します（既存行の変更は Ctrl+Z で戻せます）。計画の担当者のみ使えます。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetExport",
      action: "next",
      view: "projects",
      title: { th: "ส่งออก Excel แบบส่งลูกค้า", en: "Export Excel for the customer", jp: "顧客向け Excel を出力" },
      body: {
        th: "ปุ่มขวาบนเติมแผนลงในไฟล์ Gantt master ของทีม ซึ่งเป็นไฟล์เดียวกับที่ส่งลูกค้า (สูตร สี แถบ Gantt และแถบเลื่อน Display Week เหมือนเดิม): ชื่อโปรเจกต์ ลูกค้า เลข PJ และ PO วันเริ่มโปรเจกต์ และหัวหน้าโปรเจกต์ ชีต Plan มีหัวข้อหลักและงาน % DONE มาจากความคืบหน้าล่าสุดของทีม ไม่มีสถานะ เหตุผล หรือชั่วโมงภายใน เลือกภาษาวันที่ได้ รวมงานย่อยได้ และเพิ่มชีต Task list รายคนได้ถ้าต้องการ ดูตัวอย่างก่อนกดดาวน์โหลด ระบบเก็บสำเนาไว้ในแฟ้ม 08 Schedule ของโปรเจกต์ให้ด้วย",
        en: "The button at the top right fills the plan into the team's master Gantt workbook, the file the customer gets, with its formulas, colours, Gantt bars and Display Week scroll bar: the project, customer, PJ number and PO, the project start and the project lead. The Plan sheet has the headings and tasks; % DONE is the team's latest progress, and no status, reasons or internal hours go out. Pick the date language, include sub tasks, or add the Task list sheet by person if you want them. Check the preview, then download; a copy is kept in the project's folder 08 Schedule.",
        jp: "右上のボタンで、チームのマスター Gantt ブック（顧客に送るファイル。数式・色・ガントバー・Display Week のスクロールバーはそのまま）に計画を入れます。案件名・顧客・PJ 番号・PO、案件開始日、プロジェクトリーダーが入ります。Plan シートには見出しとタスクが入り、% DONE はチームの最新の進捗で、状態・理由・社内の時間は出しません。日付の言語を選び、必要ならサブタスクや担当者別の Task list シートを加えます。プレビューを確認してダウンロードします。控えは案件のフォルダ 08 Schedule に保存されます。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetAfter",
      action: "next",
      view: "projects",
      title: { th: "ต่อจาก: งานที่ต้องรอ", en: "After: the task a row waits for", jp: "前工程：先に終える作業" },
      body: {
        th: "พิมพ์ WBS ของงานที่ต้องเสร็จก่อน เช่น 2.1 แถวนี้จะเริ่มวันทำงานถัดไปหลังงานนั้นจบ ใส่ +N เพื่อเว้น N วันทำงาน (ข้ามเสาร์ อาทิตย์ และวันหยุดบริษัท) เช่น 2.1+2 ถ้าต้องรอหลายงานให้คั่นด้วยจุลภาค เช่น 2.1, 3.4+1 แถวนี้จะเริ่มหลังงานที่จบช้าสุด ลบช่องนี้เพื่อเลิกต่อ ถ้าพิมพ์ START เอง แถวนั้นจะเลิกต่อจากงานเดิม ต่อกันได้แบบ 'เสร็จแล้วค่อยเริ่ม' เท่านั้น และหัวข้อหลักไม่มีช่องนี้",
        en: "Type the WBS of the task that must finish first, such as 2.1: the row starts on the next work day after it ends. Add +N for a gap of N work days (weekends and company holidays skipped), such as 2.1+2. To wait for several tasks, separate them with commas, such as 2.1, 3.4+1: the row starts after the latest. Clear the cell to unlink it; typing START yourself also unlinks the row. Links are finish-to-start only, and a main heading has none.",
        jp: "先に終える作業の WBS（例 2.1）を入力すると、その作業が終わった次の稼働日に始まります。+N で N 稼働日あけます（土日と会社休日を除く）。例 2.1+2。複数の作業を待つときはカンマで区切ります（例 2.1, 3.4+1）。いちばん遅く終わる作業の後に始まります。セルを消すと解除、START を直接入力しても解除されます。前工程は「終了後に開始」のみで、大見出しにはありません。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetTemplate",
      action: "next",
      view: "projects",
      title: { th: "Master Schedule", en: "Master schedule", jp: "マスタースケジュール" },
      body: {
        th: "ปุ่มนี้ใส่ template ลงในแผน: เลือก template และวันเริ่ม ระบบคิดวันที่จากวันทำงาน ข้ามเสาร์ อาทิตย์ และวันหยุดบริษัท ยังไม่มีผู้ทำ หัวหน้าจัดคนทีหลัง หรือเก็บแผนนี้เป็น template ใหม่ (เก็บแถว ฝ่าย สาขา วันทำงาน และชั่วโมงตั้งต้น ไม่เก็บคนหรือวันที่) ทุกคนสร้างและแก้ template ได้",
        en: "This button adds a template to the plan: pick one and a start date, and the dates come from its working days, skipping weekends and company holidays; people are assigned afterwards. Or keep this plan as a new template (rows, party, discipline, working days and starting hours; not people or dates). Anyone can make and change templates.",
        jp: "このボタンでテンプレートを計画に追加します。テンプレートと開始日を選ぶと、稼働日から日付を計算します（土日と会社休日を除く）。担当者は後で割り当てます。この計画を新しいテンプレートとして保存することもできます（行・担当側・分野・稼働日・初期時間。担当者や日付は保存しません）。テンプレートは誰でも作成・変更できます。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetHolidays",
      action: "next",
      view: "projects",
      title: { th: "วันหยุดบริษัท", en: "Company holidays", jp: "会社休日" },
      body: {
        th: "กด 'วันหยุดบริษัท' ในคำอธิบายสีเพื่อดูวันหยุดจากปฏิทินบริษัทตามช่วงของแผน พร้อมงานที่ยังไม่เสร็จที่ตรงกับแต่ละวัน วันหยุดที่เพิ่งเพิ่มมีป้าย 'ใหม่' และ PM ได้แจ้งเตือนที่กระดิ่ง",
        en: "Press Company holiday in the colour key to see the company calendar's holidays over the plan, with the open work on each. A recently added one is marked New, and the PM gets a bell notification.",
        jp: "凡例の「会社休日」を押すと、計画期間の会社カレンダーの休日と、各日に重なる未完了の作業を表示します。最近追加された休日には「新規」が付き、PM にベル通知が届きます。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetHours",
      action: "next",
      view: "projects",
      title: { th: "ชั่วโมงงานตามสาขา", en: "Hours by discipline", jp: "分野別の作業時間" },
      body: {
        th: "คอลัมน์ ชม.แผน รับชั่วโมง (16) หรือ man-day (2 MD) ชม.จริง คือชั่วโมงที่ทีมยืนยันใน My Work และคงเหลือคือแผนลบจริง แถบนี้รวมตามสาขาเทียบชั่วโมงแรงงานใน Estimate งานแต่ละแถวนับเป็นสาขาที่ระบุไว้ในแถว ถ้าไม่ได้ระบุและอยู่ใต้หัวข้องานติดตั้งนับเป็นงานติดตั้ง ถ้าไม่ใช่นับตามแผนกของผู้ทำ (เหมือนภาพรวมและแท็บต้นทุน) งานที่บอกสาขาไม่ได้รวมอยู่ใน ยังไม่ระบุสาขา กดสาขาเพื่อดูเฉพาะงานของสาขานั้น ไม่มีจำนวนเงิน งานที่จ้างภายนอก เลือกผู้รับเหมาในช่อง ผู้ทำ (กลุ่ม จ้างภายนอก) ผู้ทำของเรายังอยู่เป็นผู้ดูแล แท่งเป็นสีม่วง และไม่นับรวมกับงบชั่วโมงของทีม ผูกใบขอซื้อ (PR) ของผู้รับเหมาได้จากเมนูของแถว ถ้ายังไม่มีจะขึ้นป้าย ยังไม่ขอซื้อ",
        en: "The Plan h column takes hours (16) or man-days (2 MD); Actual h is what the team confirmed in My Work, and Left h is plan minus actual. This bar adds them up by discipline against the Estimate's labor hours; a row counts for the discipline typed on it, else Installation under an installation heading, else its member's department (as on the Overview and Cost tabs); what fits none is under No discipline. Press a discipline to see only its rows. No money is shown. For outsourced work, pick the supplier in the Member cell (Outsourced to); our member stays on the row to look after it, the bar turns purple, and its hours stay out of the team budget. Link the supplier's purchase request from the row menu; until then the row shows no PR.",
        jp: "「計画 h」には時間（16）か人日（2 MD）を入力します。「実績 h」はチームがマイワークで確定した時間、「残り h」は計画から実績を引いた値です。この帯は分野ごとに見積の工数と比べます。行に入力した分野、なければ据付の見出しの下は据付、それ以外は担当者の部署で数えます（概要・コストタブと同じ）。どれにも当たらない行は「分野未設定」に入ります。分野を押すとその行だけ表示します。金額は表示しません。外注する作業は「担当」欄で外注先を選びます。社内の担当者は管理者として残り、バーは紫になり、時間はチームの予算に含めません。外注先の購買依頼は行メニューから紐付けます。未紐付けの行には「PR なし」と表示されます。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.sheetFit",
      action: "click",
      view: "projects",
      title: { th: "ต่อวัน และเวลาว่างของผู้ทำ", en: "A day, and the member's free time", jp: "1日あたりと担当者の空き時間" },
      body: {
        th: "ชั่วโมงงานของแต่ละแถวแบ่งเท่ากันในวันทำงานของช่วงที่ทำได้ คอลัมน์ 'ต่อวัน' บอกเป็น ชม./วัน และ % ของวัน คอลัมน์ 'เวลาว่าง' เทียบกับเวลาว่างของผู้ทำ รวมงานทุกโปรเจกต์และหักวันลา: ทัน หรือ ขาดกี่ชั่วโมง แถวที่ยังไม่ใส่ชั่วโมงไม่นับภาระ หัวข้อขึ้น 'เสี่ยง' เมื่อคาดว่าจบเลยวันที่สัญญาลูกค้า กดชิปของแถวเพื่อเปิดดูเวลา",
        en: "Each row's hours are spread over the working days of its window. A day shows them as hours and a share of the day; Free time weighs them against the member's free time, over every project and less time away: Fits, or how many hours short. A row with no hours is not counted. A heading shows At risk when its work is forecast past the customer's date. Press a row's chip to open its time.",
        jp: "各行の作業時間は作業可能期間の稼働日に均等に配分されます。「1日あたり」は h/日 と1日の%、「空き時間」は全案件の作業と休暇を差し引いた担当者の空き時間と比べ、間に合うか何時間不足かを示します。時間未入力の行は負荷に含めません。顧客の約束日を超える見込みの見出しは「リスク」になります。行のチップを押すと時間を開きます。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
    {
      target: "plan.allocWeeks",
      action: "next",
      view: "projects",
      title: { th: "สัปดาห์ต่อสัปดาห์ และภาระรายวัน", en: "Week by week, and the days", jp: "週ごとと日ごとの負荷" },
      body: {
        th: "ตารางบอกแต่ละสัปดาห์ว่างานนี้ต้องใช้กี่ชั่วโมง งานอื่นของผู้ทำกี่ชั่วโมง ลากี่ชั่วโมง ว่างเท่าไร และขาดเท่าไร แถบด้านล่างคือภาระรายวันรวมทุกโปรเจกต์ เส้นประคือเวลาที่มีของวันนั้น ชี้ที่แถบเพื่อดูว่าเป็นงานอะไร",
        en: "For each week: what this task needs, the member's other work, time away, what is free and what is short. The bars below are their days over every project; the dashed line is the time they have that day. Point at a bar to see the work.",
        jp: "週ごとに、この作業の必要時間、担当者の他の作業、休暇、空き、不足を示します。下のバーは全案件の日ごとの負荷で、点線はその日の持ち時間です。バーにカーソルを合わせると作業が分かります。",
      },
      missing: {
        th: "กดชิป 'เวลาว่าง' ของแถวที่มีผู้ทำและชั่วโมงก่อน หรือกด 'ถัดไป'",
        en: "Press the Free time chip of a row with a member and hours first, or press Next.",
        jp: "先に担当者と時間のある行の「空き時間」チップを押すか、「次へ」を押します。",
      },
    },
    {
      target: "plan.allocFixes",
      action: "next",
      view: "projects",
      title: { th: "ทางแก้เมื่อเวลาไม่พอ", en: "Fixes when time is short", jp: "時間不足の対処" },
      body: {
        th: "เมื่อเวลาว่างไม่พอ ระบบบอกว่าถ้าไม่ปรับจะเสร็จวันไหน และเสนอทางแก้: ขยายวันจบ เพิ่มผู้ทำที่ว่างที่สุด หรือเปิดแผนของงานอื่นเพื่อเลื่อน ทางแรกคือที่แนะนำ กดเลือกเอง ระบบไม่เลื่อนให้เอง",
        en: "When time is short, the panel says when the work would finish as it is, and offers fixes: move the end, add the member with the most free time, or open the plan of other work to move it. The first is the one recommended. You pick; nothing moves by itself.",
        jp: "時間が足りないとき、このままでいつ終わるかを示し、終了日の変更・最も空いている人の追加・他の作業の計画を開いて移動、の対処を提案します。最初が推奨です。選ぶのは人で、自動では動きません。",
      },
      missing: { th: "งานนี้เวลาพอ จึงไม่มีทางแก้ให้เลือก กด 'ถัดไป'", en: "This task fits, so there is no fix to pick. Press Next.", jp: "この作業は間に合うため対処はありません。「次へ」を押します。" },
    },
    {
      target: "plan.allocWeeklyToggle",
      action: "next",
      view: "projects",
      title: { th: "ปรับรายสัปดาห์", en: "Adjust week by week", jp: "週ごとに調整" },
      body: {
        th: "ปกติชั่วโมงงานแบ่งเท่ากันทุกวัน ถ้ารู้ว่าสัปดาห์ไหนติดงานอื่น กด 'ปรับรายสัปดาห์' แล้วใส่ชั่วโมงของแต่ละสัปดาห์ ระบบแบ่งเท่ากันในวันทำงานของสัปดาห์นั้น และยอดรวมจะเป็นชั่วโมงงานของงานนี้ ชั่วโมงที่ยืนยันใน งานของฉัน หักออกแล้วแบ่งที่เหลือในวันที่เหลือเสมอ",
        en: "The hours are spread evenly by default. When you know a week is taken by other work, press Adjust week by week and type each week's hours; they are spread over that week's working days, and the total becomes the task's hours. Hours confirmed in My Work always come off, and the rest is spread over the days left.",
        jp: "通常、作業時間は毎日均等に配分されます。他の作業がある週が分かっていれば「週ごとに調整」で週ごとの時間を入力します。その週の稼働日に均等に配分され、合計が作業時間になります。マイワークで確定した時間は常に差し引かれ、残りを残りの日に配分します。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นเมื่องานมีผู้ทำคนเดียวและยาวกว่าหนึ่งสัปดาห์ และบัญชีนี้แก้แผนได้ กด 'ถัดไป'",
        en: "It shows for a row with one member that spans more than a week, to someone who may change the plan. Press Next.",
        jp: "担当者が1人で1週間を超える行に、計画を変更できる人に表示されます。「次へ」を押します。",
      },
    },
    {
      target: "plan.view",
      action: "next",
      view: "projects",
      title: { th: "กาง ยุบ คำอธิบายสี และเมนูเพิ่มเติม", en: "Expand, collapse, the colour key and More", jp: "展開・折りたたみ・色の説明・その他メニュー" },
      body: {
        th: "ในมุมมอง 'ตามสมาชิก' ปุ่มเดียวสลับระหว่าง 'กางทั้งหมด' กับ 'ยุบทั้งหมด' เพื่อเปิดหรือปิดทุกคนในครั้งเดียว และกด 'คำอธิบายสี' เพื่อดูว่าสีและสัญลักษณ์ใน Gantt หมายถึงอะไร ระบบจำว่าเปิดหรือปิดไว้ ส่วน Export Excel, Create baseline, เต็มจอ และ Refresh อยู่ในปุ่ม 'เพิ่มเติม' ตอนเต็มจอ กด Esc หรือ 'ออกจากเต็มจอ' เพื่อกลับ",
        en: "In By member, one button flips between Expand all and Collapse all, opening or closing every member at once, and Colour key shows what the colours and marks on the Gantt mean; it stays the way you left it. Export Excel, Create baseline, Full screen and Refresh are under More. In full screen, press Esc or Exit full screen to come back.",
        jp: "「メンバー別」では、1つのボタンで「すべて展開」と「すべて折りたたむ」を切り替えて全員を一度に開閉し、「色の説明」でガントの色と記号の意味を表示します。開閉の状態は記憶されます。Excel 出力・ベースライン作成・全画面表示・更新は「その他」にあります。全画面では Esc か「全画面を終了」で戻ります。",
      },
      missing: { th: "โปรเจกต์นี้ยังไม่มีแผน กด 'ถัดไป'", en: "This project has no plan yet. Press Next.", jp: "この案件にはまだ計画がありません。「次へ」を押します。" },
    },
    {
      target: "plan.memberLegend",
      action: "next",
      view: "projects",
      title: { th: "ใครทำอะไร และงานซ้อนไหม", en: "Who is on what, and does it overlap", jp: "誰が何をしているか、重なりはないか" },
      body: {
        th: "แต่ละแถวคือสมาชิกหนึ่งคน บอกว่าตอนนี้ทำงานไหนหรือถัดไปคืองานไหน กดขยายเพื่อดูงานของเขาในโปรเจกต์นี้ และงานนอกโปรเจกต์ (แถบสีเทา) เส้นสีส้มใต้แถว = วันที่มี 2 งานขึ้นไป เส้นสีแดง = งานเกินเวลาที่มี ชี้เมาส์ที่เส้นเพื่อดูว่าซ้อนกับงานอะไร งานที่ยังไม่ใส่ชั่วโมงไม่นับภาระ และฟังก์ชันใต้งานเดียวกันไม่นับว่าซ้อนกัน",
        en: "Each row is one member, with what they are on now or next. Open it to see their work in this project and their other work (grey bars). An amber line under the row marks days with two or more pieces of work; a red line, days with more work than time. Point at a line to see what overlaps. Work with no hours yet is not counted, and a task's own functions never overlap.",
        jp: "各行がメンバー1人で、今の作業か次の作業を示します。開くとこの案件の作業と他の作業（灰色のバー）が表示されます。行の下のオレンジの線は2件以上の作業がある日、赤い線は持ち時間を超える日です。線にカーソルを合わせると何が重なっているか分かります。時間未入力の作業は負荷に含めず、同じタスクの機能同士は重複としません。",
      },
      missing: { th: "กด 'ตามสมาชิก' ด้านบนเพื่อดูส่วนนี้ หรือกด 'ถัดไป'", en: "Press By member above to see this, or press Next.", jp: "上の「メンバー別」を押すと表示されます。または「次へ」を押します。" },
    },
    {
      target: "plan.workDays",
      action: "next",
      view: "projects",
      title: { th: "จำนวนวันตามแผนนับวันทำงาน", en: "Plan days count working days", jp: "計画日数は稼働日で数える" },
      body: {
        th: "เมื่อเปิดแก้งานในแผน ช่อง 'จำนวนวันตามแผน' นับเฉพาะวันจันทร์–ศุกร์ ไม่นับวันหยุดบริษัท เช่น เริ่ม 17 ต.ค. 8 วัน จะจบ 28 ต.ค. แผนเดิมจะไม่ขยับจนกว่าจะแก้จำนวนวันหรือวันเริ่มของงานนั้น",
        en: "When you edit a plan row, Plan days count Monday–Friday without company holidays: start 17 Oct with 8 days finishes 28 Oct. Existing rows keep their dates until you change their days or start.",
        jp: "計画の行を編集するとき、計画日数は会社の休日を除く月～金で数えます。例：10月17日開始・8日なら10月28日終了。既存の行は日数か開始日を変えるまで日付が変わりません。",
      },
      missing: {
        th: "ช่องนี้อยู่ในหน้าต่างแก้งาน เปิดแถวงานแล้วกดแก้ไข หรือกด 'ถัดไป'",
        en: "This box is in the edit window of a plan row. Open a row and press Edit, or press Next.",
        jp: "この欄は行の編集画面にあります。行を開いて編集を押すか、「次へ」を押します。",
      },
    },
    {
      target: "plan.sheetFollow",
      action: "click",
      view: "projects",
      title: { th: "ต้องตาม", en: "To follow up", jp: "要フォロー" },
      body: {
        th: "ปุ่มนี้รวมงานที่ต้องตาม: เลยกำหนด ติดปัญหา ถึงวันเริ่มแต่ยังไม่เริ่ม ยังไม่มีผู้ทำ วันที่ผู้ทำยังไม่ยืนยันชั่วโมงใน My Work (ย้อนหลัง 2 สัปดาห์) งานจ้างภายนอกที่ยังไม่ขอซื้อ วันหยุดบริษัทใหม่ที่ตรงกับงาน (กด 'เลื่อนวันจบ' หรือ 'คงไว้' ระบบไม่เลื่อนเอง) และแถวที่แก้หลังส่งไฟล์ลูกค้าครั้งล่าสุด (กด 'ส่งออกไฟล์ใหม่') บรรทัดแรกบอกว่าในนี้กี่แถวเป็นงานต้องตาม ซึ่งเป็นตัวเลขที่รายการโปรเจกต์และภาพรวมแสดง กดชื่องานเพื่อไปที่แถวนั้นในตาราง",
        en: "This button gathers what needs following up: late, blocked, due to start but not started, no member yet, days a member has not confirmed in My Work (the last two weeks), outsourced work with no purchase request, a new company holiday on the work (press Move the end or Keep; nothing moves on its own), and rows changed since the customer file was last sent (press Export a new file). The first line says how many of them are rows to chase, the figure the project list and Overview show. Press a task to go to its row.",
        jp: "このボタンに要フォローの作業をまとめます：遅延、停滞、開始日を過ぎて未着手、担当者なし、担当者が My Work で工数を確定していない日（過去2週間）、購買依頼のない外注作業、作業に重なる新しい会社休日（「終了日を延ばす」か「そのまま」を押します。自動では動きません）、前回の顧客ファイル送付後に変更された行（「新しいファイルを出力」を押します）。最初の行に、このうち要対応の作業が何行か（案件一覧と概要に出る数）を表示します。作業名を押すとその行に移動します。",
      },
      missing: { th: "เปิด 'ตาราง' ก่อน หรือกด 'ถัดไป'", en: "Open the Sheet first, or press Next.", jp: "先に「表」を開くか、「次へ」を押します。" },
    },
  ],
};

/*
 * Allocation (owner, 2026-11-22): one head names the people of every project. A PM adds a plan row with its discipline and
 * no member ("Waiting for people"); the row waits in the queue on Team overview > Allocation · weekly, where the head
 * picks people by free time, leave already taken off.
 */
const TEAM_WEEK: Guide = {
  id: "team-week",
  area: "project",
  browse: true,
  title: { th: "แผนงานทีม: ใครว่าง ใครเกิน ใครยังไม่ยืนยันชั่วโมง", en: "Team planner: who is free, who is over, who has not confirmed", jp: "チームプランナー：空き・超過・未確定を確認" },
  summary: {
    th: "แผนงานทีมรวมตารางรายวันกับสัปดาห์ทีมไว้ในตารางเดียว แสดงชั่วโมงของทุกคนรายวัน 1, 2 หรือ 4 สัปดาห์ แต่ละช่องมีตัวเลขเดียว: ชั่วโมงที่ยืนยันแล้ว ถ้ายังไม่ยืนยันใช้ที่จองใน My week ถ้ายังไม่จองใช้ตามแผน แถบสรุปด้านบนกดกรองได้ และงานรอมอบหมายอยู่ด้านขวา",
    en: "Team planner puts the daily grid and Team week in one table: everyone's hours a day over one, two or four weeks. Each cell has one figure: the hours confirmed, else booked on My week, else planned. The summary bar above filters, and work waiting for people sits on the right.",
    jp: "チームプランナーは日別表とチーム週間を1つの表にまとめ、全員の1日ごとの時間を1・2・4週で表示します。各セルの数字は1つで、確定済みの時間、未確定ならマイウィークの予約、未予約なら計画です。上のまとめバーで絞り込め、割り当て待ちは右側にあります。",
  },
  minutes: 3,
  permissions: ["team.board"],
  views: ["resources"],
  steps: [
    menu(
      "resources",
      { th: "เปิดภาพรวมงานทีม", en: "Open Team overview", jp: "「チームの仕事一覧」を開く" },
      {
        th: "แผนงานทีมอยู่ในหน้านี้ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Team planner is on this page. Click the highlighted menu entry.",
        jp: "チームプランナーはこの画面にあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="week"]',
      action: "click",
      view: "resources",
      title: { th: "เปิดแผนงานทีม", en: "Open Team planner", jp: "チームプランナーを開く" },
      body: { th: "กดแท็บ 'แผนงานทีม'", en: "Press the Team planner tab.", jp: "「チームプランナー」タブを押します。" },
    },
    {
      target: "team.range",
      action: "next",
      view: "resources",
      title: { th: "เลือกช่วงที่ดู", en: "Pick how much to see", jp: "表示する期間を選ぶ" },
      body: {
        th: "กด 1, 2 หรือ 4 สัปดาห์ (2 สัปดาห์คือแบบตารางรายวันเดิม) ลูกศรเลื่อนไปช่วงก่อนหรือถัดไป ปุ่ม 'วันนี้' กลับมาสัปดาห์นี้ ระบบจำช่วงที่เลือกไว้ให้ ท้ายแถวเดียวกันมีเมนู 'ทีม' (เลือกได้หลายทีม) เมนู 'ประเภทงาน' และช่องค้นหา",
        en: "Press 1, 2 or 4 weeks (2 weeks is the old daily grid). The arrows move to the period before or after, and Today comes back to this week. Your choice is remembered. At the end of the same row are the Team menu (several teams at once), the Work type menu and the search.",
        jp: "1・2・4週を押します（2週は以前の日別表と同じ）。矢印で前後の期間へ、「今日」で今週に戻ります。選んだ期間は記憶されます。同じ行の右端に「チーム」メニュー（複数選択可）、「作業の種類」メニュー、検索があります。",
      },
      missing: {
        th: "ปุ่มนี้อยู่ในมุมมองตาราง ถ้าเปิด Gantt อยู่ ให้กด 'ตาราง' ก่อน หรือกด 'ถัดไป'",
        en: "These buttons are on the table view. If the Gantt chart is open, press Table by day first, or press Next.",
        jp: "このボタンは表の表示にあります。ガントチャートを表示中なら「表」を押すか、「次へ」を押します。",
      },
    },
    {
      target: "teamweek.table",
      action: "next",
      view: "resources",
      title: { th: "ตัวเลขในช่อง", en: "The figure in a cell", jp: "セルの数字" },
      body: {
        th: "แถวละคน ช่องละวัน ตัวเลขคือชั่วโมงของวันนั้น เครื่องหมายถูกคือยืนยันแล้ว จุดทึบคือจองใน My week วงกลมโปร่งคือตามแผน (MD × 8) ช่องสีแดงคือเกินเวลาที่มี ขีดส้มใต้ช่องคือวันที่ผ่านมาแล้วแต่ยังไม่ยืนยัน มุมสีส้มคือมีงานซ้อน ข้างชื่อคือชั่วโมงรวมของช่วงที่ดู",
        en: "One row per person, one column per day. The figure is the day's hours: a tick is confirmed, a dot is booked on My week, a ring is planned (MD × 8). A red cell is over the time the day offers, an amber line under a cell is a past day not confirmed yet, and an amber corner is overlapping work. Beside each name are the hours over the period shown.",
        jp: "1行が1人、1列が1日です。数字はその日の時間で、チェックは確定済み、塗りの点はマイウィークの予約、白丸は計画（人日×8）です。赤いセルは持ち時間超過、セル下のオレンジの線は過ぎた日の未確定、オレンジの角は作業の重複です。名前の横は表示期間の合計時間です。",
      },
      missing: { th: "รอให้ข้อมูลโหลดเสร็จก่อน หรือกด 'ถัดไป'", en: "Wait for the table to load, or press Next.", jp: "読み込みを待つか、「次へ」を押します。" },
    },
    {
      target: "teamweek.workOpen",
      action: "next",
      view: "resources",
      title: { th: "กางดูงานทีละงาน", en: "Open someone's work, one line each", jp: "作業を1行ずつ表示する" },
      body: {
        th: "กดลูกศรหน้าชื่อคนเพื่อกางงานของเขาทีละงาน ทุกโปรเจกต์ แต่ละช่องคือชั่วโมงของงานนั้นในวันนั้น ชั่วโมงงานของงานแบ่งเท่ากันในวันทำงานของช่วงที่ทำได้ งานที่ยังไม่ใส่ชั่วโมงขึ้น '?' และ 'ไม่นับ' เพราะไม่ถูกนับในภาระ งานจ้างภายนอกเป็นของผู้รับเหมา",
        en: "Press the arrow before a name to open their work, one line each, over every project. Each cell is that work's hours that day: a task's hours are spread over the working days of its window. Work with no hours shows ? and not counted, because it takes no time in the load; outsourced work is the supplier's.",
        jp: "名前の前の矢印を押すと、その人の作業を全案件で1行ずつ表示します。各セルはその日の作業時間で、作業時間は作業可能期間の稼働日に均等に配分されます。時間未入力の作業は ? と「含めない」で、負荷に数えません。外注の作業は外注先のものです。",
      },
      missing: {
        th: "ลูกศรขึ้นกับคนที่มีงานในช่วงที่ดู ถ้ายังไม่มี กด 'ถัดไป'",
        en: "The arrow shows for people with work in the days on show. If there is none, press Next.",
        jp: "表示期間に作業がある人に矢印が表示されます。なければ「次へ」を押します。",
      },
    },
    {
      target: "teamweek.chips",
      action: "next",
      view: "resources",
      title: { th: "กรองคนที่ต้องดู", en: "Filter the people to look at", jp: "確認したい人に絞る" },
      body: {
        th: "แถบสรุปนับคนในแต่ละเรื่อง: เกินกำลัง งานซ้อน ว่าง 8 ชม. ขึ้นไป ยังไม่ยืนยันชั่วโมง มีวันลา มีงานยังไม่ใส่ชั่วโมง เลยกำหนด และงานรอมอบหมาย กดช่องไหนตารางเหลือเฉพาะคนกลุ่มนั้น กดซ้ำเพื่อดูทุกคน",
        en: "The summary bar counts people for each: over capacity, overlapping work, 8 h or more free, hours not confirmed, time away, work with no hours, overdue, and work waiting for people. Press one to see only those people; press it again to see everyone.",
        jp: "まとめバーは、負荷超過・作業の重複・8時間以上空き・時間未確定・休暇あり・時間未入力の作業あり・期限超過・割り当て待ちの人数を表示します。押すとその人だけを表示し、もう一度押すと全員に戻ります。",
      },
    },
    {
      target: "team.dayWork",
      action: "next",
      view: "resources",
      title: { th: "ดูงานของวัน", en: "See a day's work", jp: "その日の作業を見る" },
      body: {
        th: "กดตัวเลขในช่อง แผงด้านขวาจะแสดงชั่วโมงของวันนั้นและมาจากไหน ที่ลงใน My week งานทุกชิ้นที่กินเวลาวันนั้น นัดและวันลา กด + ในช่องว่างเพื่อเพิ่มงานให้คนนั้นวันนั้น",
        en: "Press a figure: the panel on the right shows the day's hours and where they come from, what was booked on My week, every piece of work taking time that day, meetings and time away. Press + in an empty part of a cell to add work for that person and day.",
        jp: "数字を押すと、右のパネルにその日の時間とその出どころ、マイウィークの予約、その日に時間を使う作業、予定と不在が表示されます。セルの空いた所の+でその人・その日に作業を追加できます。",
      },
      missing: { th: "ช่วงที่ดูยังไม่มีงาน กด 'ถัดไป'", en: "Nothing is planned in the period shown. Press Next.", jp: "表示期間に作業がありません。「次へ」を押します。" },
    },
    {
      target: "alloc.queue",
      action: "next",
      view: "resources",
      title: { th: "งานรอจัดคน", en: "Rows waiting for people", jp: "割り当て待ちの行" },
      body: {
        th: "ด้านขวาคืองานในแผนที่ PM ใส่สายงานไว้แต่ยังไม่มีคน หัวหน้ากด 'จัดคน' แล้วเลือกคนที่ว่างพอได้ทันที ใต้นั้นคืองานทีมที่ยังไม่มีคนรับ กดงานเพื่อเลือกคน",
        en: "On the right are plan rows a PM gave a discipline but no person. The head presses Assign and picks someone free enough there and then. Under them are team tasks nobody has taken: open one to choose who does it.",
        jp: "右側は、PMが職種だけ指定して担当者のいない計画行です。責任者は「割り当て」を押して空きのある人をその場で選びます。その下は担当者のいないチームタスクで、開いて担当者を選びます。",
      },
      missing: {
        th: "ตอนนี้ไม่มีงานรอจัดคน หรือคุณไม่มีสิทธิ์ดูแผนงาน กด 'จบบทสอน'",
        en: "Nothing is waiting for people, or you cannot read plans. Press Finish.",
        jp: "割り当て待ちの行がないか、計画を見る権限がありません。「完了」を押します。",
      },
    },
  ],
};

const ALLOCATION_ASSIGN: Guide = {
  id: "allocation-assign",
  area: "project",
  title: { th: "จัดคนให้งานที่รอจัดคน", en: "Assign people to plan rows waiting for them", jp: "割り当て待ちの計画行に担当者を割り当て" },
  summary: {
    th: "PM เพิ่มงานในแผนพร้อมสายงานโดยยังไม่ใส่คน หัวหน้าเห็นงานทุกโครงการที่รอจัดคนในที่เดียว แล้วเลือกคนที่ว่างที่สุด (หักวันลาแล้ว)",
    en: "A PM adds plan rows with a discipline and no member. The head sees every project's rows waiting for people in one place and picks the freest people, leave already taken off.",
    jp: "PM は職種だけ指定して担当者を空けた計画行を追加します。責任者は全案件の割り当て待ちの行を一か所で見て、空きの多い人（不在日を差し引き済み）を選びます。",
  },
  minutes: 3,
  permissions: ["schedule.read", "project.read", "schedule.plan"],
  views: ["resources"],
  steps: [
    menu(
      "resources",
      { th: "เปิดเมนูภาพรวมงานทีม", en: "Open Team overview", jp: "「チームの仕事一覧」を開く" },
      {
        th: "การจัดคนอยู่ในแท็บ 'จัดคน 12 สัปดาห์' ของหน้านี้ (คิวรอจัดคนยังอยู่ข้างตารางของแท็บ 'แผนงานทีม' ด้วย) คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Allocation is the Allocation · 12 weeks tab of this page (the queue also sits beside the Team planner table). Click the highlighted menu entry.",
        jp: "要員配置はこのページの「要員配置・12週」タブにあります（割り当て待ちの一覧は「チームプランナー」の表の横にもあります）。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="workload"]',
      action: "click",
      view: "resources",
      title: { th: "กดแท็บ 'จัดคน 12 สัปดาห์'", en: "Press the Allocation · 12 weeks tab", jp: "「要員配置・12週」タブを押す" },
      body: {
        th: "ตารางคน × สัปดาห์บอกว่าแต่ละคนมีงานกี่เปอร์เซ็นต์ของเวลาที่มี วันลาถูกหักออกจากเวลาแล้ว ใต้ตัวเลขมี 'จริง' คือชั่วโมงที่ยืนยันใน My Work และ 'ลา' คือจำนวนวันที่ลา",
        en: "The people × weeks table shows each person's planned work as a share of the time they have, with days away already taken off. Under the figures, Actual is the hours confirmed in My Work and Away the days away.",
        jp: "人×週の表は、各人の計画作業が持ち時間の何％かを示し、不在日は差し引き済みです。数字の下の「実績」はマイワークで確定した時間、「不在」は不在日数です。",
      },
    },
    {
      target: "alloc.queue",
      action: "next",
      view: "resources",
      title: { th: "คิวงานรอจัดคน", en: "The queue of rows waiting for people", jp: "割り当て待ちの一覧" },
      body: {
        th: "งานทุกโครงการที่ PM เพิ่มไว้พร้อมสายงานแต่ยังไม่มีคน เรียงตามวันเริ่ม กดชิปสายงานเพื่อดูเฉพาะไฟฟ้า เครื่องกล ซอฟต์แวร์ หรืองานติดตั้ง กดเลขโครงการเพื่อเปิดแผน",
        en: "Every project's rows a PM added with a discipline and no member, soonest start first. Press a discipline chip to see only Electrical, Mechanical, Software or Installation work, and the project number to open its plan.",
        jp: "PM が職種だけ指定して担当者を空けた全案件の行で、開始日の早い順です。職種のチップで電気・機械・ソフトウェア・据付だけを表示し、案件番号で計画を開きます。",
      },
      missing: {
        th: "แผงนี้ขึ้นเมื่อมีงานรอจัดคน PM เลือก 'รอหัวหน้าจัดคน' พร้อมสายงานตอนเพิ่มงานในแผน กด 'ถัดไป'",
        en: "This shows when rows are waiting. A PM picks Waiting for people with a discipline when adding a plan row. Press Next.",
        jp: "割り当て待ちの行があるときに表示されます。PM が計画行の追加時に職種付きの「担当者の割り当て待ち」を選びます。「次へ」を押します。",
      },
    },
    {
      target: "alloc.assign",
      action: "click",
      view: "resources",
      title: { th: "กด 'จัดคน'", en: "Press Assign", jp: "「割り当て」を押す" },
      body: {
        th: "หน้าต่างจะแสดงคนที่สายงานตรงกันก่อน เรียงตามเวลาว่างในสัปดาห์ที่งานนี้ทำ ป้ายเขียวคือว่างพอ ส้มคือว่างไม่พอ แดงคือเกินอยู่แล้ว",
        en: "The window lists people of the row's discipline first, freest first over the weeks the row runs. Green: enough free time; amber: not enough; red: already over.",
        jp: "画面には同じ職種の人が先に、この行の週の空きが多い順に表示されます。緑は十分な空き、オレンジは不足、赤はすでに超過です。",
      },
      missing: {
        th: "ปุ่มนี้มีสำหรับ PM ของโครงการ Engineering Manager และ Admin ถ้ายังไม่มีงานรอจัดคน กด 'ถัดไป'",
        en: "The button is for the project's PM, Engineering Managers and Admins. If nothing is waiting, press Next.",
        jp: "このボタンは案件の PM、Engineering Manager、Admin 用です。割り当て待ちがなければ「次へ」を押します。",
      },
    },
    {
      target: "alloc.assignSave",
      action: "click",
      view: "resources",
      title: { th: "เลือกคนแล้วกด 'จัดคน'", en: "Pick the people and press Assign", jp: "担当者を選んで「割り当て」を押す" },
      body: {
        th: "ติ๊กได้หลายคน คนที่ยังไม่อยู่ในทีมโครงการจะถูกเพิ่มเข้าทีมให้ ผู้รับผิดชอบได้รับแจ้งและเห็นงานใน My Work งานจะหายจากคิวและไปอยู่ในแถวของคนนั้น ถ้าแค่ฝึก กด 'ยกเลิก' แล้วกด 'เสร็จ'",
        en: "Tick one or more people; anyone not on the project's team joins it. They are notified and see the work in My Work, and the row leaves the queue for their line of the table. Only practising? Press Cancel, then Finish.",
        jp: "複数人を選べます。案件のチームにいない人はチームに追加されます。担当者に通知され、マイワークに表示されます。行は一覧から消えてその人の行に入ります。練習だけなら「キャンセル」の後に「完了」を押します。",
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
    menu(
      "resources",
      { th: "เปิดเมนูภาพรวมงานทีม", en: "Open Team overview", jp: "「チームの仕事一覧」を開く" },
      {
        th: "งานของทุกคนในทีมอยู่ในตารางนี้ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Everyone's work is on this board. Click the highlighted menu entry.",
        jp: "チーム全員の作業がこの表にあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "teamweek.table",
      action: "next",
      view: "resources",
      title: { th: "ดูว่าใครว่างก่อนเพิ่มงาน", en: "See who is free before adding work", jp: "作業を追加する前に空きを確認" },
      body: {
        th: "แผนงานทีมแสดงชั่วโมงของทุกคนรายวัน ช่องสีแดงคือวันที่เกินเวลาที่มี ข้างชื่อบอกชั่วโมงที่ยังว่างในช่วงที่ดู กด 1, 2 หรือ 4 สัปดาห์เพื่อดูไกลขึ้น",
        en: "Team planner shows everyone's hours a day. A red cell is a day over the time it offers; beside each name are the hours still free in the period shown. Press 1, 2 or 4 weeks to see further.",
        jp: "チームプランナーは全員の1日ごとの時間を表示します。赤いセルは持ち時間を超える日、名前の横は表示期間の空き時間です。1・2・4週を押すと先まで見られます。",
      },
      missing: { th: "รอให้ข้อมูลโหลดเสร็จก่อน กด 'ถัดไป'", en: "Wait for the table to load, or press Next.", jp: "読み込みを待つか、「次へ」を押します。" },
    },
    {
      target: "team.add",
      action: "click",
      view: "resources",
      title: { th: "กด 'เพิ่มงาน / นัดหมาย'", en: "Press Add work or appointment", jp: "「作業・予定を追加」を押す" },
      body: {
        th: "ปุ่มนี้อยู่มุมขวาบนของหน้า (กด + ในช่องของคนและวันบนแผนงานทีมได้ด้วย ระบบใส่คนและวันนั้นให้)",
        en: "It is at the top right of the page. (You can also press + in a person's cell on a day in Team planner; that person and date are filled in.)",
        jp: "ページ右上にあります（チームプランナーで担当者と日付のセルの+を押しても追加でき、その人と日付が入ります）。",
      },
    },
    {
      target: "team.kind",
      action: "next",
      view: "resources",
      title: { th: "ประเภท", en: "Kind", jp: "種類" },
      body: { th: "นัดหมาย / เข้าหน้างาน, งานทั่วไป หรือ ลา / ไม่ว่าง", en: "Appointment or site visit, a task, or away.", jp: "予定・現地訪問、タスク、不在のいずれかです。" },
    },
    {
      target: "team.subject",
      action: "next",
      view: "resources",
      title: { th: "เรื่องและรายละเอียด", en: "Subject and detail", jp: "件名と内容" },
      body: {
        th: "บอกสั้นๆ ว่าทำอะไร และใส่รายละเอียดงานเบื้องต้นด้านล่าง เลือกลูกค้าได้ถ้าเกี่ยวกับลูกค้า งานซัพพอตของโปรเจกต์ที่ปิดแล้วก็เลือกโปรเจกต์นั้นได้ (ท้ายรายการ มีคำว่า ปิดแล้ว)",
        en: "Say briefly what it is and describe it below; pick the customer if one is involved. Support work for a finished project can pick that project too (at the end of the list, marked closed).",
        jp: "何をするかを短く書き、下に内容を入力します。顧客が関わる場合は顧客を選びます。完了済み案件のサポート作業もその案件を選べます（一覧の末尾に「完了済み」と表示）。",
      },
    },
    {
      target: "team.people",
      action: "next",
      view: "resources",
      title: { th: "ผู้รับผิดชอบ", en: "Who does it", jp: "担当者" },
      body: {
        th: "เลือกได้หลายคน ระบบบอกภาระงานของแต่ละคนในวันนั้นให้เห็นก่อนเลือก",
        en: "Choose one or more people; each one's load that day shows before you choose.",
        jp: "複数選べます。選ぶ前にその日の各自の負荷が表示されます。",
      },
    },
    {
      target: "team.date",
      action: "next",
      view: "resources",
      title: { th: "วันที่", en: "When", jp: "日付" },
      body: {
        th: "วันที่ และวันสิ้นสุดถ้าหลายวัน เลือกทั้งวัน ช่วงเช้า ช่วงบ่าย หรือระบุเวลาได้",
        en: "The date, and an end date for several days; a whole day, morning, afternoon or set times.",
        jp: "日付と、複数日の場合は終了日を入れます。終日・午前・午後・時間指定を選べます。",
      },
    },
    {
      target: "team.meeting",
      action: "next",
      view: "resources",
      title: { th: "ประชุมออนไลน์หรือออฟไลน์", en: "Online or in person", jp: "オンラインか対面か" },
      body: {
        th: "สำหรับนัดหมาย เลือก 'ออนไลน์' แล้ววางลิงก์ Teams / Zoom หรือ 'ออฟไลน์' แล้วใส่สถานที่ ลิงก์หรือสถานที่จะอยู่ในนัดของ Outlook ด้วย",
        en: "For an appointment, choose Online and paste the Teams or Zoom link, or Offline and write the place. The link or place goes into the Outlook meeting too.",
        jp: "予定の場合、「オンライン」を選んでTeams・Zoomのリンクを貼るか、「対面」を選んで場所を入力します。リンクや場所はOutlookの会議にも入ります。",
      },
      missing: { th: "ช่องนี้มีเฉพาะประเภทนัดหมาย กด 'ถัดไป'", en: "This shows for an appointment. Press Next.", jp: "予定の場合に表示されます。「次へ」を押します。" },
    },
    {
      target: "team.repeat",
      action: "next",
      view: "resources",
      title: { th: "งานที่ทำซ้ำ เช่น ประชุมทุกวัน", en: "Work that repeats, such as a daily meeting", jp: "繰り返す作業（毎日の会議など）" },
      body: {
        th: "เลือก 'ทุกวันทำงาน' หรือ 'ทุกสัปดาห์' แล้วเลือกวัน ใส่วันที่สิ้นสุด (ไม่เกิน 1 ปี) ระบบลงงานให้ทุกวันตามรอบ ข้ามวันหยุดบริษัท และส่ง Outlook เป็นนัดประจำนัดเดียว ภายหลังเปิดงานวันไหนก็ได้ แล้วเลือกแก้หรือลบ 'เฉพาะครั้งนี้' หรือ 'ครั้งนี้และครั้งถัดไป'",
        en: "Choose Every working day, or Weekly and the days, then the day it ends (a year at most). The task is put on each of those days, company holidays skipped, and Outlook gets one recurring meeting. Later, open any day and change or remove This day only, or This and following days.",
        jp: "「毎営業日」か「毎週」と曜日を選び、終了日（最長1年）を入れます。会社の休日を除く各日に作業が入り、Outlookには定期的な会議が1件届きます。後でどの回を開いても「この回のみ」か「この回以降すべて」を選んで変更・削除できます。",
      },
    },
    {
      target: "team.save",
      action: "click",
      view: "resources",
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
  views: ["purchase"],
  steps: [
    menu(
      "purchase",
      { th: "เปิดเมนูใบขอซื้อ", en: "Open Purchase Requisition", jp: "「購買申請」を開く" },
      {
        th: "BOM อยู่ในหน้าใบขอซื้อ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "The BOMs are inside the Purchase Requisition screen. Click the highlighted menu entry.",
        jp: "BOMは購買申請の画面の中にあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="boms"]',
      action: "click",
      view: "purchase",
      title: { th: "เปิดแท็บ BOM", en: "Open the BOM tab", jp: "「BOM」タブを開く" },
      body: {
        th: "รายการวัสดุของทุกโปรเจกต์อยู่ในแท็บนี้ คลิกที่แท็บ BOM",
        en: "Every project's bill of materials is on this tab. Click the BOM tab.",
        jp: "すべての案件のBOMはこのタブにあります。「BOM」タブをクリックします。",
      },
    },
    {
      target: "bom.generate",
      action: "click",
      view: "purchase",
      title: { th: "กด 'สร้างรายการวัสดุ'", en: "Press Generate BOM", jp: "「BOMを作成」を押す" },
      body: {
        th: "สร้าง BOM จาก Estimate ที่อนุมัติและล็อกแล้วของโปรเจกต์ ได้ทั้งรายการวัสดุและงานจ้างภายนอก (Outsource)",
        en: "It builds the BOM from the project's approved, locked estimate: its material lines and its outsourced work.",
        jp: "案件の承認・ロック済み見積からBOMを作ります。資材明細と外注作業（Outsource）が入ります。",
      },
      missing: {
        th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้าง BOM",
        en: "If the button never appears, this account cannot generate BOMs.",
        jp: "ボタンが表示されない場合、このアカウントには作成権限がありません。",
      },
    },
    {
      target: "bom.project",
      action: "next",
      view: "purchase",
      title: { th: "เลือกโปรเจกต์", en: "Choose the project", jp: "案件を選ぶ" },
      body: {
        th: "เลือกโปรเจกต์ ระบบคัดลอกรายการจาก Estimate revision ที่อนุมัติแล้ว",
        en: "Pick the project; the lines are copied from its approved estimate revision.",
        jp: "案件を選ぶと、承認済み見積リビジョンの明細がコピーされます。",
      },
    },
    {
      target: "bom.create",
      action: "click",
      view: "purchase",
      title: { th: "สร้าง BOM", en: "Generate it", jp: "BOMを作成" },
      body: {
        th: "กดสร้าง BOM จะเป็นฉบับร่างจนกว่าจะ Release ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'ข้ามขั้นนี้'",
        en: "Press generate; the BOM stays a draft until it is released. Only practising? Press Cancel, then Skip this step.",
        jp: "作成するとリリースまで下書きです。練習だけなら「キャンセル」を押してから「この手順を飛ばす」を押します。",
      },
    },
    {
      target: "bom.list",
      action: "next",
      view: "purchase",
      title: { th: "BOM ทุก revision", en: "Every BOM revision", jp: "全BOMリビジョン" },
      body: {
        th: "กดเลข BOM เพื่อตรวจรายการ งบ ยอดที่ขอซื้อแล้ว และยอดที่ยังต้องซื้อ กรองตาม Module หรือหมวดได้ และดาวน์โหลดเป็น Excel ได้ ใน BOM ที่ Release แล้ว ติ๊กรายการที่จะซื้อ แล้วกด 'สร้าง PR จากรายการที่เลือก' หรือกดปุ่ม + ที่แถวของ BOM เพื่อเปิดใบขอซื้อเปล่าของ BOM นั้น ในหน้า BOM ยังมีแผง 'Unit ของโครงการ' สำหรับแบ่งงบของ Module เป็น Unit ตาม Drawing (กด 'เพิ่ม Unit') และดูยอดขอซื้อของแต่ละ Unit กับแต่ละ Discipline พร้อมจำนวนรายการที่ยังรอสั่งซื้อและวันที่ต้องการเร็วสุด (ตัวแดงเมื่อเกินกำหนด) กดจำนวนใบขอซื้อใต้ชื่อ Unit เพื่อดูใบของ Unit นั้น",
        en: "Press a BOM number to check its lines, budget, what has been requested and what is still to buy. Filter by module or section, and download it as Excel. On a released BOM, tick the lines to buy and press Create PR from selected lines, or press + on the BOM's row for an empty PR sheet on that BOM. The BOM also has the Project Units panel: split a module's budget into Units by drawing (Add Unit), and see what each Unit and each discipline has requested, how many lines still wait to be ordered and the earliest date one is needed by (red once it has passed). Press the number of requests under a Unit's name to list them.",
        jp: "BOM番号を押して明細、予算、申請済み額、未購入額を確認します。モジュールや区分で絞り込み、Excelでダウンロードできます。リリース済みBOMでは購入する明細にチェックを入れて「選択した明細でPRを作成」を押すか、BOMの行の＋でそのBOMの空のPRシートを開きます。BOM画面には「案件のUnit」パネルもあり、モジュール予算を図面ごとのUnitに分け（「Unitを追加」）、Unitごと・Disciplineごとの申請額、発注待ちの明細数、最も早い必要日（期限を過ぎると赤字）を確認できます。Unit名の下の申請件数を押すと、そのUnitの申請が一覧表示されます。",
      },
    },
    {
      target: "bom.release",
      action: "click",
      view: "purchase",
      title: { th: "Release BOM", en: "Release the BOM", jp: "BOMをリリース" },
      body: {
        th: "เมื่อตรวจแล้ว กดปุ่มกุญแจ (Release) ทางซ้ายของแถว รายการจะถูก freeze และใช้เป็นฐานของ PR และใบเบิก ถ้าแค่ฝึก ให้กด 'ยกเลิก' ในหน้าต่างยืนยัน แล้วกด 'จบบทสอน'",
        en: "Once checked, press the lock button (Release) at the left of the row: the lines freeze and become the base for PRs and material issues. Only practising? Press Cancel in the confirmation, then Finish.",
        jp: "確認後、行の左の鍵ボタン（リリース）を押すと明細が固定され、PRと出庫の基準になります。練習だけなら確認画面で「キャンセル」を押してから「完了」を押します。",
      },
      missing: {
        th: "Release ได้เฉพาะ BOM ฉบับร่าง และผู้มีสิทธิ์อนุมัติ ถ้าปุ่มกุญแจเป็นสีจาง แปลว่า BOM ที่คุณสร้างมีมูลค่าถึงเกณฑ์ตรวจ (เริ่มต้น 100,000 บาท) ต้องให้ผู้อนุมัติคนอื่น Release",
        en: "Only a draft BOM can be released, by someone who may approve. A greyed-out lock means a BOM you generated is at or over the review threshold (THB 100,000 to start with): another approver must release it.",
        jp: "リリースできるのは下書きBOMのみで、承認権限が必要です。鍵ボタンが薄い場合、自分で作成したBOMが確認基準額（初期値100,000バーツ）以上のため、別の承認者がリリースする必要があります。",
      },
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
  orDuty: "purchase-approver",
  views: ["approvals", "purchase"],
  invite: "approvals",
  steps: [
    menu(
      "approvals",
      { th: "เปิดเมนูรออนุมัติ", en: "Open Approvals", jp: "「承認」を開く" },
      {
        th: "ตัวเลขบนเมนูคือจำนวนที่รอคุณ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "The number on the menu is how many wait for you. Click the highlighted menu entry.",
        jp: "メニューの数字が自分の承認待ち件数です。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "appr.pr",
      action: "next",
      view: "approvals",
      title: { th: "ใบขอซื้อที่รอคุณ", en: "Requisitions waiting for you", jp: "承認待ちの購買申請" },
      body: {
        th: "ระบบคำนวณว่าใบไหนต้องให้ใครอนุมัติ: หัวหน้าของ discipline ของ Unit ในใบ (ME, EE, SW; ใบที่ไม่ได้เลือก Unit ใช้หัวหน้าแผนกของผู้ขอ) ก่อน แล้วผู้อนุมัติขั้นสุดท้าย ซึ่งได้อีเมลเมื่อมีใบรอ ใบที่เกินงบของ Module ต้องใส่เหตุผลตอนอนุมัติ",
        en: "The app works out who approves each one: the head of the discipline of the request's Unit (ME, EE, SW; a request with no Unit goes to the requester's department head), then the final approver, who is emailed when one waits. A PR over a module budget needs a reason when approved.",
        jp: "誰が承認するかはシステムが決めます。PRのUnitの分野（ME・EE・SW）の責任者（Unit未指定のPRは依頼者の部門長）、次に最終承認者で、最終承認者には承認待ちがあるとメールが届きます。モジュール予算を超えるPRは承認時に理由が必要です。",
      },
    },
    {
      target: "appr.approve",
      action: "click",
      view: "approvals",
      title: { th: "อนุมัติหรือไม่อนุมัติ", en: "Approve or reject", jp: "承認または却下" },
      body: {
        th: "กดปุ่ม ✓ (อนุมัติ) หรือ ✕ (ไม่อนุมัติ) ทางซ้ายของแถว แล้วยืนยันพร้อมความเห็น กดเลข PR เพื่อดูรายการก่อนได้ ผู้ขอได้แจ้งผลพร้อมความเห็นของคุณทุกครั้ง ใบที่อนุมัติครบจะส่งเข้า Pegasus ERP เอง ถ้าแค่ฝึก ให้กด 'ยกเลิก' ในหน้าต่างยืนยัน แล้วกด 'จบบทสอน'",
        en: "Press ✓ (Approve) or ✕ (Reject) at the left of the row and confirm with a comment; press the PR number to see its lines first; the requester is always told, with your comment. A fully approved PR goes to Pegasus ERP by itself. Only practising? Press Cancel in the confirmation, then Finish.",
        jp: "行の左の✓（承認）または✕（却下）を押し、コメントを付けて確定します。PR番号を押すと先に明細を確認できます。結果はコメントと一緒に必ず依頼者へ通知されます。承認が揃うとPegasus ERPに自動送信されます。練習だけなら確認画面で「キャンセル」を押してから「完了」を押します。",
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
    menu(
      "purchase",
      { th: "เปิดเมนูใบขอซื้อ", en: "Open Purchase Requisition", jp: "「購買申請」を開く" },
      {
        th: "PR ทุกใบและสถานะใน ERP อยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every PR and its ERP status is here. Click the highlighted menu entry.",
        jp: "すべてのPRとERPでの状態がここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "pr.erp",
      action: "next",
      view: "purchase",
      title: { th: "ดูคอลัมน์ ERP", en: "Look at the ERP column", jp: "ERP列を見る" },
      body: {
        th: "ใบที่ขึ้น 'ส่ง ERP ไม่สำเร็จ' หรือ 'ถูกลบใน ERP' คือใบที่ ERP ไม่ได้รับไว้ กดเลข PR ของใบนั้นเพื่อดูข้อความจาก ERP ใบที่ขึ้น 'Request List' คือรายการของใบนั้นอยู่ใน Request List ของโครงการใน ERP ฝ่ายจัดซื้อจะออก PR แยกตาม Supplier เอง กดเลข PR เพื่อดูสถานะของแต่ละรายการ (รอจัดซื้อ อยู่ใน PR สั่งซื้อแล้ว หรือยกเลิก) และดาวน์โหลด Excel สำหรับ Request List ได้",
        en: "A PR marked as a failed ERP send, or as deleted in the ERP, is one the ERP does not hold. Press its PR number to read the ERP's message. A PR marked Request List has its lines in the project's Request List in the ERP, where Purchasing raises PRs per supplier. Press its PR number to see each line's status (waiting, in a PR, ordered or cancelled) and to download the Excel for the Request List.",
        jp: "「ERP送信失敗」または「ERPで削除済み」のPRはERPに登録されていません。そのPR番号を押してERPのメッセージを確認します。「Request List」と表示されるPRは、明細がERPの案件Request Listにあり、購買部が仕入先ごとにPRを作成します。PR番号を押すと明細ごとの状態（購買待ち、PR作成済み、発注済み、キャンセル）を確認でき、Request List用のExcelもダウンロードできます。",
      },
    },
    {
      target: "pr.takeback",
      action: "next",
      view: "purchase",
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
      target: "pr.submit",
      action: "click",
      view: "purchase",
      title: { th: "แก้รายการแล้วบันทึก", en: "Correct the lines and save", jp: "明細を直して保存" },
      body: {
        th: "แก้จำนวน ราคา หรือรายการตามข้อความจาก ERP แล้วกด 'ส่งขออนุมัติ' เพื่อบันทึกและส่งอนุมัติใหม่ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Correct the quantities, prices or items the ERP named, then press Submit for approval to save it and send it for approval again. Only practising? Press Cancel, then Finish.",
        jp: "ERPの指摘に合わせて数量・単価・明細を直し、「承認申請」を押して保存と再承認の申請を行います。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
      missing: {
        th: "หน้าแก้รายการเปิดหลังกด 'ดึงกลับไปแก้' หรือกดปุ่มดินสอ (แก้ไข) ทางซ้ายของ PR ฉบับร่างของคุณ",
        en: "The PR sheet opens after Take back to edit, or from the pencil button (Edit) at the left of one of your draft PRs.",
        jp: "編集画面は「差し戻して修正」の後、または自分の下書きPRの左の鉛筆ボタン（編集）から開きます。",
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
    menu(
      "my-assignments",
      { th: "เปิดเมนูงานที่ได้รับมอบหมาย", en: "Open My Assignments", jp: "「自分の割当」を開く" },
      {
        th: "งานเข้าหน้างานที่ส่งถึงคุณอยู่ที่นี่ ใช้บนมือถือได้ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Site visits assigned to you are here, phone-friendly. Click the highlighted menu entry.",
        jp: "自分に割り当てられた現地訪問がここにあり、スマホでも使えます。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "visit.respond",
      action: "next",
      view: "my-assignments",
      title: { th: "ตอบรับงาน", en: "Answer a new job", jp: "依頼に回答" },
      body: {
        th: "งานใหม่ต้องกด 'ตอบรับหรือปฏิเสธ' ก่อน ผู้ประสานงานจะรู้ทันที",
        en: "A new job needs Accept or decline first; the coordinator sees your answer at once.",
        jp: "新しい依頼はまず「受諾・辞退」を押します。調整担当にすぐ伝わります。",
      },
      missing: { th: "ยังไม่มีงานรอตอบรับ กด 'ถัดไป'", en: "Nothing is waiting for an answer. Press Next.", jp: "回答待ちはありません。「次へ」を押します。" },
    },
    {
      target: "visit.open",
      action: "click",
      view: "my-assignments",
      title: { th: "เปิดงาน", en: "Open the visit", jp: "訪問を開く" },
      body: {
        th: "กด 'เปิดงาน' ของงานที่จะไป หรือ 'ทำงานหน้างานต่อ' ถ้าเช็คอินไว้แล้ว",
        en: "Press Open visit on the job you are going to, or Continue on site if you have checked in.",
        jp: "行く訪問の「訪問を開く」、チェックイン済みなら「現地作業を続ける」を押します。",
      },
      missing: {
        th: "ยังไม่มีงานเข้าหน้างานของคุณ เมื่อได้รับมอบหมายจะขึ้นที่นี่",
        en: "No visits are assigned to you yet; they show here once you are placed on one.",
        jp: "まだ割り当てがありません。割り当てられるとここに表示されます。",
      },
    },
    {
      target: "visit.checkin",
      action: "next",
      view: "my-assignments",
      title: { th: "เช็คอิน", en: "Check in", jp: "チェックイン" },
      body: { th: "เมื่อถึงหน้างาน กด 'เช็คอิน' ระบบบันทึกเวลาเริ่มงาน", en: "On arrival press Check in; the start time is recorded.", jp: "到着したら「チェックイン」を押すと開始時刻が記録されます。" },
      missing: { th: "เช็คอินแล้ว ปุ่มนี้จึงไม่ขึ้น กด 'ถัดไป'", en: "Already checked in, so the button is gone. Press Next.", jp: "チェックイン済みのため表示されません。「次へ」を押します。" },
    },
    {
      target: "visit.checklist",
      action: "next",
      view: "my-assignments",
      title: { th: "รายการตรวจสอบ", en: "Checklist", jp: "チェックリスト" },
      body: {
        th: "ทำทีละข้อ กดปุ่มกรองเพื่อดูเฉพาะข้อที่ยังไม่ทำ",
        en: "Work through it item by item; the filter button shows only what is left.",
        jp: "1項目ずつ進めます。絞り込みボタンで未完了だけを表示できます。",
      },
    },
    {
      target: "visit.files",
      action: "next",
      view: "my-assignments",
      title: { th: "รูป วิดีโอ และเอกสาร", en: "Photos, videos and documents", jp: "写真・動画・文書" },
      body: {
        th: "เลือกหมวดแล้วถ่ายรูปหรืออัปโหลดไฟล์ รูปจากหน้างานใช้ในรายงานได้",
        en: "Choose a category, then take a photo or upload a file; site photos can go into the report.",
        jp: "カテゴリを選んで撮影またはアップロードします。現場写真は報告書に使えます。",
      },
    },
    {
      target: "visit.findings",
      action: "next",
      view: "my-assignments",
      title: { th: "สิ่งที่พบ ค่าที่วัด และความเสี่ยง", en: "Findings, measurements and risks", jp: "所見・測定値・リスク" },
      body: { th: "บันทึกสิ่งที่เจอจริง ข้อมูลส่วนนี้ไปอยู่ในรายงานให้เอง", en: "Record what you actually found; it is carried into the report.", jp: "実際の所見を記録します。報告書に自動で反映されます。" },
    },
    {
      target: "visit.checkout",
      action: "next",
      view: "my-assignments",
      title: { th: "เช็คเอาต์", en: "Check out", jp: "チェックアウト" },
      body: {
        th: "เสร็จงานแล้วกด 'เช็คเอาต์' ระบบสร้างรายงานเข้าหน้างานให้ทันที",
        en: "When you finish, press Check out and the visit report is created.",
        jp: "作業後に「チェックアウト」を押すと訪問報告書が作成されます。",
      },
      missing: { th: "ปุ่มนี้ขึ้นหลังเช็คอิน และหายไปเมื่อเช็คเอาต์แล้ว", en: "It shows after check-in and disappears once you have checked out.", jp: "チェックイン後に表示され、チェックアウト後は消えます。" },
    },
    {
      target: "visit.report",
      action: "next",
      view: "my-assignments",
      title: { th: "รายงานการเข้าหน้างาน", en: "Site visit report", jp: "現地訪問報告書" },
      body: {
        th: "กรอกสรุปการเข้าหน้างานและข้อสรุปของวิศวกร ต้องมีทั้งสองช่อง กด 'บันทึกฉบับร่าง' ระหว่างทำได้",
        en: "Fill in the visit summary and the engineer's conclusion, both required. Save draft as you go.",
        jp: "訪問概要と技術者の結論を入力します(両方必須)。途中で「下書き保存」できます。",
      },
      missing: { th: "รายงานจะถูกสร้างเมื่อเช็คเอาต์", en: "The report is created when you check out.", jp: "報告書はチェックアウト時に作成されます。" },
    },
    {
      target: "visit.submit",
      action: "click",
      view: "my-assignments",
      title: { th: "ส่งตรวจสอบ", en: "Submit for review", jp: "レビュー依頼" },
      body: {
        th: "กด 'ส่งตรวจสอบ' ก่อนครบกำหนดส่งรายงาน หัวหน้าจะตรวจและอนุมัติ ถ้ายังไม่พร้อม กด 'จบบทสอน' แล้วกลับมาส่งทีหลัง",
        en: "Press Submit for review before the report is due; your lead reviews and approves it. Not ready? Press Finish and submit later.",
        jp: "期限前に「レビュー依頼」を押すと上長が確認・承認します。準備ができていなければ「完了」を押し、後で提出します。",
      },
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
    menu(
      "reports",
      { th: "เปิดเมนูรายงานปฏิบัติงาน", en: "Open Operational Reports", jp: "「業務報告書」を開く" },
      {
        th: "รายงานถึงลูกค้าทุกฉบับอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every report for customers is here. Click the highlighted menu entry.",
        jp: "顧客向けの報告書はすべてここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "report.start",
      action: "click",
      clickOn: ".report-form-choice",
      view: "reports",
      title: { th: "เลือกแบบฟอร์ม", en: "Pick a form", jp: "フォームを選ぶ" },
      body: {
        th: "คลิกแบบฟอร์มที่ตรงกับงาน เช่น รายงานบริการ หรือรายงานตรวจสอบ",
        en: "Click the form that fits the work, such as a service or inspection report.",
        jp: "作業に合うフォーム(サービス報告、点検報告など)をクリックします。",
      },
      missing: { th: "ถ้าไม่เห็นส่วนนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้างรายงาน", en: "If this part never shows, this account cannot create reports.", jp: "表示されない場合、このアカウントには作成権限がありません。" },
    },
    {
      target: "report.form",
      action: "next",
      view: "reports",
      title: { th: "แบบฟอร์มรายงาน", en: "The report form", jp: "報告書フォーム" },
      body: {
        th: "เปลี่ยนแบบฟอร์มได้ที่นี่ หรือใช้ Template ของทีมที่เคยทำไว้",
        en: "Change the form here, or use one of the team's templates.",
        jp: "ここでフォームを変更するか、チームのテンプレートを使います。",
      },
    },
    {
      target: "report.next",
      action: "click",
      view: "reports",
      title: { th: "กด 'ถัดไป: เลือกงาน'", en: "Press Next: choose the work", jp: "「次へ:作業を選ぶ」を押す" },
      body: { th: "ไปขั้นเลือกงานที่รายงานนี้เป็นของ", en: "Move on to choosing the work this report belongs to.", jp: "この報告書の対象作業を選ぶ手順へ進みます。" },
    },
    {
      target: "report.source",
      action: "next",
      view: "reports",
      title: { th: "Inquiry หรือโปรเจกต์", en: "Inquiry or project", jp: "引合または案件" },
      body: {
        th: "ค้นหาแล้วเลือก Inquiry หรือโปรเจกต์ ลูกค้าและสถานที่จะมาให้เอง",
        en: "Search and pick the inquiry or project; the customer and site come with it.",
        jp: "引合または案件を検索して選ぶと、顧客と現場が入ります。",
      },
    },
    {
      target: "report.title",
      action: "next",
      view: "reports",
      title: { th: "ชื่อและผู้ตรวจ", en: "Title and reviewers", jp: "件名と確認者" },
      body: { th: "ตั้งชื่อรายงานและวันที่ แล้วเลือกผู้ตรวจและผู้อนุมัติด้านล่าง", en: "Give the title and date, then choose the reviewer and approver below.", jp: "件名と日付を入れ、下で確認者と承認者を選びます。" },
    },
    {
      target: "report.create",
      action: "click",
      view: "reports",
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
    menu(
      "signing",
      { th: "เปิดเมนูเอกสารรอลงนาม", en: "Open Sign Inbox", jp: "「署名受信箱」を開く" },
      {
        th: "เอกสารทุกประเภทที่รอลายเซ็นของคุณอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every document waiting for your signature is here. Click the highlighted menu entry.",
        jp: "署名待ちの文書はすべてここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "sign.specimen",
      action: "next",
      view: "signing",
      title: { th: "ลายเซ็นของคุณ", en: "Your signature", jp: "自分の署名" },
      body: {
        th: "ครั้งแรกต้องกด 'สร้างลายเซ็น' วาดหรืออัปโหลดลายเซ็นไว้ใช้ทุกเอกสาร คนอื่นไม่เห็นลายเซ็นนี้",
        en: "The first time, press Create signature to draw or upload it for every document; nobody else can see it.",
        jp: "初回は「署名を作成」で署名を描くかアップロードします。他の人には見えません。",
      },
      missing: { th: "มีลายเซ็นแล้ว กด 'ถัดไป'", en: "You already have one. Press Next.", jp: "署名は作成済みです。「次へ」を押します。" },
    },
    {
      target: "sign.waiting",
      action: "next",
      view: "signing",
      title: { th: "เอกสารที่รอคุณ", en: "Waiting for you", jp: "自分の署名待ち" },
      body: {
        th: "เรียงตามกำหนดส่ง เก่าที่สุดขึ้นก่อน แต่ละแถวบอกว่าต้องลงนามส่วนไหนและแบบไหน",
        en: "Ordered by due date, oldest first; each row says which block and which mark you are asked for.",
        jp: "期限順(古い順)に並びます。各行にどの欄・どの印が必要かが表示されます。",
      },
    },
    {
      target: "sign.open",
      action: "click",
      view: "signing",
      title: { th: "กด 'เปิดและลงนาม'", en: "Press Open & sign", jp: "「開いて署名」を押す" },
      body: { th: "เปิดเอกสารที่จะลงนาม", en: "It opens the document to sign.", jp: "署名する文書が開きます。" },
      missing: { th: "ยังไม่มีเอกสารรอลายเซ็นของคุณ", en: "No document is waiting for your signature.", jp: "署名待ちの文書はありません。" },
    },
    {
      target: "sign.file",
      action: "next",
      view: "signing",
      title: { th: "ตรวจไฟล์", en: "Check the file", jp: "ファイルを確認" },
      body: {
        th: "ไฟล์นี้แก้ไขไม่ได้ ถ้าต้นฉบับผิดต้องออก revision ใหม่ กดดูตัวอย่างเพื่อตรวจไฟล์และลายเซ็นที่มีอยู่",
        en: "This file cannot change; a wrong original needs a new revision. Use the preview to check the file and the signatures so far.",
        jp: "このファイルは変更できません。原本に誤りがあれば新しいリビジョンが必要です。プレビューでファイルと既存の署名を確認します。",
      },
    },
    {
      target: "sign.panel",
      action: "next",
      view: "signing",
      title: { th: "ตำแหน่งลายเซ็น", en: "Where the signature goes", jp: "署名の位置" },
      body: {
        th: "ดูตัวอย่าง ย้าย และย่อขยายลายเซ็นได้ ใส่หมายเหตุได้ หมายเหตุเก็บไว้ในประวัติของเอกสาร",
        en: "Preview, move and resize the signature, and add a note; the note is kept in the document's history.",
        jp: "署名をプレビュー・移動・拡大縮小でき、メモも残せます。メモは文書の履歴に保存されます。",
      },
    },
    {
      target: "sign.submit",
      action: "click",
      view: "signing",
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
    menu(
      "knowledge",
      { th: "เปิดเมนูศูนย์ความรู้", en: "Open Knowledge Hub", jp: "「ナレッジハブ」を開く" },
      {
        th: "มาตรฐาน คู่มือ และความรู้ของทีมอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "The team's standards, procedures and know-how are here. Click the highlighted menu entry.",
        jp: "チームの標準・手順・ノウハウがここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="register"]',
      action: "click",
      view: "knowledge",
      title: { th: "ทะเบียนมาตรฐาน", en: "Standards Register", jp: "標準台帳" },
      body: {
        th: "Standard, SOP และ Template ทุกฉบับที่ใช้อยู่ คลิกแท็บนี้",
        en: "Every standard, SOP and template in force. Click this tab.",
        jp: "現在有効な標準・SOP・テンプレートの一覧です。このタブをクリックします。",
      },
    },
    {
      target: "kh.search",
      action: "next",
      view: "knowledge",
      title: { th: "ค้นหา", en: "Search", jp: "検索" },
      body: { th: "พิมพ์ชื่อ เลขเอกสาร หรือคำในเนื้อหา", en: "Type a title, a document number or a word from it.", jp: "件名・文書番号・本文の語句を入力します。" },
    },
    {
      target: "kh.register",
      action: "next",
      view: "knowledge",
      title: { th: "เอกสารและ revision ปัจจุบัน", en: "Documents and their current revision", jp: "文書と最新リビジョン" },
      body: {
        th: "หนึ่งแถวคือหนึ่งเอกสาร แสดง revision ที่ใช้อยู่ คลิกเลขเอกสารหรือชื่อเพื่อเปิดอ่านหรือดาวน์โหลด",
        en: "One row per document with the revision in force; click its number or title to read or download it.",
        jp: "1行が1文書で、有効なリビジョンが表示されます。文書番号または件名をクリックすると閲覧・ダウンロードできます。",
      },
    },
    {
      target: '[data-tab="acknowledgements"]',
      action: "click",
      view: "knowledge",
      title: { th: "รายการรับทราบของฉัน", en: "My Acknowledgements", jp: "自分の確認項目" },
      body: { th: "เอกสารที่คุณต้องอ่านและกดรับทราบอยู่ที่แท็บนี้", en: "Documents you must read and acknowledge are on this tab.", jp: "読んで確認する必要がある文書はこのタブにあります。" },
    },
    {
      target: "kh.new",
      action: "click",
      view: "knowledge",
      title: { th: "เพิ่มเอกสารใหม่", en: "Add a document", jp: "文書を追加" },
      body: {
        th: "กด 'เอกสารใหม่' เอกสารผ่านการตรวจและอนุมัติก่อนเผยแพร่ ถ้าแค่หาเอกสาร กด 'จบบทสอน'",
        en: "Press New Document; it is reviewed and approved before it is published. Only looking? Press Finish.",
        jp: "「新規文書」を押します。レビューと承認を経て公開されます。探すだけなら「完了」を押します。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นสำหรับคนที่เขียนเอกสารได้ กด 'จบบทสอน' ได้เลย",
        en: "The button shows for people who may write documents. Press Finish.",
        jp: "文書を作成できる人に表示されます。「完了」を押します。",
      },
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
    menu(
      "downloads",
      { th: "เปิดเมนูศูนย์ดาวน์โหลด", en: "Open Download Center", jp: "「ダウンロードセンター」を開く" },
      {
        th: "โปรแกรม ไฟล์ และ skill ของแผนกอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "The department's software, files and skills are here. Click the highlighted menu entry.",
        jp: "部門のソフト・ファイル・スキルがここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="files"]',
      action: "click",
      view: "downloads",
      title: { th: "โปรแกรมและไฟล์", en: "Software & files", jp: "ソフトウェアとファイル" },
      body: {
        th: "ไฟล์จากโฟลเดอร์ดาวน์โหลดบน NAS แบ่งตามหมวด คลิกแท็บนี้",
        en: "Files from the NAS download folder, by category. Click this tab.",
        jp: "NASのダウンロードフォルダのファイルがカテゴリ別に並びます。このタブをクリックします。",
      },
    },
    {
      target: "dl.search",
      action: "next",
      view: "downloads",
      title: { th: "ค้นหาไฟล์", en: "Find a file", jp: "ファイルを探す" },
      body: { th: "พิมพ์ชื่อโปรแกรมหรือไฟล์", en: "Type the program or file name.", jp: "ソフト名またはファイル名を入力します。" },
    },
    {
      target: "dl.file",
      action: "next",
      view: "downloads",
      title: { th: "ดาวน์โหลด", en: "Download", jp: "ダウンロード" },
      body: {
        th: "กดไอคอนดาวน์โหลดหน้าชื่อไฟล์ ระบบนับจำนวนครั้งที่ดาวน์โหลดให้ทีมเห็นว่าไฟล์ไหนใช้บ่อย",
        en: "Press the download icon in front of the file's name; downloads are counted so the team sees what is used.",
        jp: "ファイル名の左にあるダウンロードアイコンを押します。回数が数えられ、よく使うファイルが分かります。",
      },
      missing: { th: "ยังไม่มีไฟล์ในหมวดที่เปิดอยู่ กด 'ถัดไป'", en: "No file in the open category yet. Press Next.", jp: "開いているカテゴリにファイルがありません。「次へ」を押します。" },
    },
    {
      target: '[data-tab="skills"]',
      action: "click",
      view: "downloads",
      title: { th: "Skill Hub", en: "Skill Hub", jp: "Skill Hub" },
      body: {
        th: "skill สำหรับ Claude Code และ Codex ที่ทีมทำไว้ คลิกแท็บนี้",
        en: "The team's skills for Claude Code and Codex. Click this tab.",
        jp: "チームが作ったClaude Code・Codex用スキルです。このタブをクリックします。",
      },
    },
    {
      target: "skill.search",
      action: "next",
      view: "downloads",
      title: { th: "ค้นหา skill", en: "Find a skill", jp: "スキルを探す" },
      body: {
        th: "พิมพ์ชื่อหรืองานที่อยากให้ AI ช่วย แล้วเลือก skill จากรายการ",
        en: "Type a name or the job you want help with, then pick a skill from the list.",
        jp: "名前や手伝ってほしい作業を入力し、一覧からスキルを選びます。",
      },
    },
    {
      target: "skill.install",
      action: "click",
      view: "downloads",
      title: { th: "ติดตั้ง", en: "Install", jp: "インストール" },
      body: {
        th: "กด 'ติดตั้งสำหรับ Claude' หรือ 'ติดตั้งสำหรับ Codex' ได้ไฟล์ติดตั้ง เปิดไฟล์แล้ว skill จะพร้อมใช้",
        en: "Press Install for Claude or Install for Codex to get the installer; run it and the skill is ready.",
        jp: "「Claude にインストール」または「Codex にインストール」でインストーラーを取得し、実行すると使えます。",
      },
      missing: {
        th: "เลือก skill ในรายการก่อน แล้วปุ่มติดตั้งจะขึ้น",
        en: "Pick a skill from the list first; the install buttons then appear.",
        jp: "先に一覧からスキルを選ぶとインストールボタンが表示されます。",
      },
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
  views: ["monitor", "installed-base"],
  invite: "monitor",
  browse: true,
  steps: [
    menu(
      "monitor",
      { th: "เปิดเมนู Site Monitor", en: "Open Site Monitor", jp: "「サイトモニター」を開く" },
      {
        th: "ทุกไซต์ที่ติดตั้ง TMT Control Panel อยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every site running TMT Control Panel is here. Click the highlighted menu entry.",
        jp: "TMT Control Panelを導入したサイトがすべてここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "mon.sites",
      action: "click",
      clickOn: "tbody tr",
      view: "monitor",
      title: { th: "เปิดไซต์", en: "Open a site", jp: "サイトを開く" },
      body: {
        th: "คลิกแถวของไซต์ที่จะดู สีบอกว่าไซต์ไหนมีปัญหา",
        en: "Click the site's row; the colours show which sites have problems.",
        jp: "確認するサイトの行をクリックします。色で問題のあるサイトが分かります。",
      },
    },
    {
      target: "mon.problems",
      action: "next",
      view: "monitor",
      title: { th: "ปัญหาที่ยังเปิดอยู่", en: "Open problems", jp: "未解決の問題" },
      body: { th: "ปัญหาที่ระบบเจอและยังไม่ได้แก้ เรียงจากรุนแรงที่สุด", en: "Problems found and not yet fixed, most severe first.", jp: "検出されて未解決の問題が重大度順に並びます。" },
      missing: { th: "ไซต์นี้ไม่มีปัญหาค้าง กด 'ถัดไป'", en: "No open problems at this site. Press Next.", jp: "このサイトに未解決の問題はありません。「次へ」を押します。" },
    },
    {
      target: "mon.programs",
      action: "next",
      view: "monitor",
      title: { th: "โปรแกรมและ Service", en: "Programs & services", jp: "プログラムとサービス" },
      body: {
        th: "สถานะของแต่ละโปรแกรม คนที่มีสิทธิ์สั่ง Start, Stop หรือ Restart จากที่นี่ได้โดยไม่ต้องไปหน้างาน",
        en: "Each program's state. People with control rights can Start, Stop or Restart it from here without going on site.",
        jp: "各プログラムの状態です。権限がある人は現地に行かずに開始・停止・再起動できます。",
      },
    },
    {
      target: "mon.responsible",
      action: "next",
      view: "monitor",
      title: { th: "ผู้ดูแล", en: "Responsible people", jp: "担当者" },
      body: {
        th: "ผู้ดูแลลำดับ 1-2-3 ได้อีเมลตามลำดับเมื่อมีปัญหาและยังไม่มีคนรับเรื่อง",
        en: "Responsible people 1, 2 and 3 are emailed in turn while a problem stays unanswered.",
        jp: "問題に対応がない間、担当者1・2・3の順にメールが届きます。",
      },
    },
    {
      target: "mon.logs",
      action: "next",
      view: "monitor",
      title: { th: "Log", en: "Logs", jp: "ログ" },
      body: {
        th: "Log ที่ TMT Control Panel ส่งมา ค้นหาได้ ใช้ดูว่าเกิดอะไรก่อนมีปัญหา",
        en: "The logs TMT Control Panel sent, searchable, to see what happened before a problem.",
        jp: "TMT Control Panelから届いたログを検索でき、問題前の状況を確認できます。",
      },
    },
    {
      target: "mon.alerts",
      action: "next",
      view: "monitor",
      title: { th: "แจ้งเตือน LINE / Teams", en: "LINE / Teams alerts", jp: "LINE / Teams 通知" },
      body: {
        th: "ผู้ดูแล Site ตั้งให้ปัญหาส่งเข้ากลุ่ม LINE หรือช่อง Teams ได้ กด ส่งทดสอบ เพื่อเช็กว่าข้อความไปถึง",
        en: "Site managers can send this site's problems to a LINE group or a Teams channel. Send test checks that messages arrive.",
        jp: "サイト管理者は問題を LINE グループや Teams チャネルへ送れます。「テスト送信」で届くか確認できます。",
      },
      missing: {
        th: "ส่วนนี้เห็นเฉพาะคนที่จัดการ Site ได้ กด 'ถัดไป'",
        en: "Only people who manage sites see this part. Press Next.",
        jp: "この部分はサイト管理者だけに表示されます。「次へ」を押します。",
      },
    },
  ],
};

const FLEET_SCRIPT: Guide = {
  id: "fleet-run-script",
  area: "tools",
  title: { th: "รันสคริปต์บนหลายเครื่องจากหน้า Fleet", en: "Run a script on several machines from Fleet", jp: "フリートから複数マシンでスクリプトを実行" },
  summary: {
    th: "เลือกเครื่องลูกค้าหลายเครื่อง เขียนสคริปต์ แล้วส่งให้อีกคนอนุมัติก่อนรัน ผลของแต่ละเครื่องกลับมาที่หน้าเดียวกัน",
    en: "Pick several customer machines, write a script and send it for someone else to approve; each machine's result comes back on the same screen.",
    jp: "複数の顧客マシンを選んでスクリプトを書き、別の人の承認後に実行します。各マシンの結果は同じ画面に戻ります。",
  },
  minutes: 3,
  permissions: ["monitor.read", "monitor.script"],
  views: ["monitor"],
  steps: [
    menu(
      "monitor",
      { th: "เปิดเมนู Monitor", en: "Open Monitor", jp: "「モニター」を開く" },
      {
        th: "ทุกเครื่องของทุก Site อยู่ในตารางเดียว คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every machine of every site is in one table. Click the highlighted menu entry.",
        jp: "全サイトの全マシンが1つの表にあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "monitor.fleet",
      action: "click",
      view: "monitor",
      title: { th: "เปิดแท็บ Fleet", en: "Open the Fleet tab", jp: "フリートタブを開く" },
      body: { th: "คลิก Fleet ในพื้นที่ Monitor", en: "Click Fleet inside the Monitor workspace.", jp: "モニター内のフリートをクリックします。" },
    },
    {
      target: "fleet.sort",
      action: "next",
      view: "monitor",
      title: { th: "เรียงลำดับเครื่อง", en: "Sort machines", jp: "マシンの並べ替え" },
      body: {
        th: "เรียงตามชื่อ Site ชื่อเครื่อง ปัญหา โหลด หรือเวลารายงาน การเรียงไม่ล้างเครื่องที่เลือกไว้",
        en: "Sort by site, machine, problems, load or last report. Sorting keeps your selection.",
        jp: "サイト・マシン名・問題数・負荷・最終報告順に並べ替えます。選択は維持されます。",
      },
    },
    {
      target: "fleet.search",
      action: "next",
      view: "monitor",
      title: { th: "หาเครื่อง", en: "Find the machines", jp: "マシンを探す" },
      body: {
        th: "พิมพ์ชื่อเครื่อง Site หรือ TMTDesk ID หรือกรองตาม Site เวอร์ชัน และ เฉพาะที่มีปัญหา",
        en: "Type a machine, site or TMTDesk ID, or filter by site, version and Problems only.",
        jp: "マシン名・サイト・TMTDesk ID を入力するか、サイト・バージョン・「問題のみ」で絞り込みます。",
      },
    },
    {
      target: "fleet.table",
      action: "click",
      clickOn: "tbody input",
      view: "monitor",
      title: { th: "เลือกเครื่อง", en: "Select machines", jp: "マシンを選ぶ" },
      body: {
        th: "ติ๊กช่องหน้าเครื่องที่จะรันสคริปต์ เลือกได้หลายเครื่อง",
        en: "Tick the box in front of each machine that should run the script; pick as many as you need.",
        jp: "スクリプトを実行するマシンの先頭のチェックを入れます。複数選べます。",
      },
    },
    {
      target: "fleet.runScript",
      action: "click",
      view: "monitor",
      title: { th: "รันสคริปต์", en: "Run script", jp: "スクリプトを実行" },
      body: { th: "กด รันสคริปต์ ในแถบที่ขึ้นมา", en: "Press Run script in the bar that appeared.", jp: "表示されたバーの「スクリプトを実行」を押します。" },
      missing: {
        th: "ปุ่มนี้ขึ้นเมื่อเลือกเครื่องอย่างน้อยหนึ่งเครื่อง",
        en: "This button appears once at least one machine is selected.",
        jp: "マシンを1台以上選ぶとこのボタンが表示されます。",
      },
    },
    {
      target: "fleet.scriptTitle",
      action: "next",
      view: "monitor",
      title: { th: "ตั้งชื่องาน", en: "Name the job", jp: "ジョブ名" },
      body: { th: "ชื่อที่บอกว่าสคริปต์ทำอะไร ผู้อนุมัติจะเห็นชื่อนี้", en: "A name that says what the script does; the approver sees it.", jp: "スクリプトの内容が分かる名前。承認者に表示されます。" },
    },
    {
      target: "fleet.scriptBody",
      action: "next",
      view: "monitor",
      title: { th: "เขียนสคริปต์", en: "Write the script", jp: "スクリプトを書く" },
      body: {
        th: "เลือก PowerShell หรือ cmd และเวลาหมด ไม่เกิน 64 KB อย่าใส่รหัสผ่านลงไป",
        en: "Choose PowerShell or cmd and a timeout; up to 64 KB. Never put passwords in it.",
        jp: "PowerShell か cmd とタイムアウトを選びます。最大 64 KB。パスワードは書かないでください。",
      },
    },
    {
      target: "fleet.scriptSend",
      action: "click",
      view: "monitor",
      title: { th: "ส่งขออนุมัติ", en: "Send for approval", jp: "承認を依頼" },
      body: {
        th: "กด ส่งขออนุมัติ อีกคนต้องอนุมัติก่อนเครื่องจะรัน ถ้าแค่ฝึก กด ยกเลิก แทน",
        en: "Press Send for approval; someone else must approve before any machine runs it. If you are only practising, press Cancel instead.",
        jp: "「承認を依頼」を押します。別の人が承認するまで実行されません。練習のときは「キャンセル」を押します。",
      },
    },
  ],
};

const COMMAND_CENTER: Guide = {
  id: "command-center",
  area: "tools",
  title: { th: "ใช้ Command Center บนจอใหญ่", en: "Use the Command Center on a big screen", jp: "大型画面でコマンドセンターを使う" },
  summary: {
    th: "ภาพรวมสดของทุก Site แบบหน้าจอ SCADA ตัวเลขสำคัญ ปัญหาล่าสุด และโหมดทีวีสำหรับจอติดผนัง",
    en: "A live SCADA-style overview of every site, the headline numbers, the incident feed and a TV mode for a wall screen.",
    jp: "全サイトの SCADA 風概要・主要指標・インシデントのライブ表示と、壁掛け画面用の TV モード。",
  },
  minutes: 2,
  permissions: ["monitor.read"],
  views: ["monitor", "command-center"],
  browse: true,
  steps: [
    menu(
      "monitor",
      { th: "เปิดเมนู Monitor", en: "Open Monitor", jp: "「モニター」を開く" },
      { th: "คลิกที่เมนูที่ไฮไลต์อยู่", en: "Click the highlighted menu entry.", jp: "強調表示のメニューをクリックします。" },
    ),
    {
      target: "monitor.commandCenter",
      action: "click",
      view: "monitor",
      title: { th: "เปิด Command Center", en: "Open Command Center", jp: "コマンドセンターを開く" },
      body: { th: "กด Command Center ในแถบด้านบนของ Monitor", en: "Press Command Center in the Monitor workspace header.", jp: "モニター上部のコマンドセンターを押します。" },
    },
    {
      target: "ops.help",
      action: "next",
      view: "command-center",
      title: { th: "คีย์ลัดและความสดของข้อมูล", en: "Shortcuts and data freshness", jp: "キーボード操作と更新状況" },
      body: {
        th: "กด ? เพื่อดูคีย์ลัด ตัวเลขแนวโน้มเทียบรอบก่อน หากโหลดไม่ได้จะแจ้งข้อมูลเก่า โหมดลดการเคลื่อนไหวจะหยุดสปอตไลต์อัตโนมัติ",
        en: "Press ? for shortcuts. Trends compare the previous update; failed refreshes show a stale warning. Reduced motion pauses automatic spotlight rotation.",
        jp: "?で操作一覧を表示。指標は前回更新比です。更新失敗時は警告を表示し、動きを減らす設定では自動切替を停止します。",
      },
    },
    {
      target: "ops.kpis",
      action: "next",
      view: "command-center",
      title: { th: "ตัวเลขสำคัญ", en: "Headline numbers", jp: "主要指標" },
      body: {
        th: "Site และเครื่องที่ออนไลน์ ปัญหาที่เปิดอยู่ TMTDesk ที่ปกติ และ Session รีโมตที่เปิดอยู่",
        en: "Sites and machines online, open incidents, healthy TMTDesk and open remote sessions.",
        jp: "オンラインのサイトとマシン、未解決インシデント、TMTDesk 正常率、接続中のリモート。",
      },
    },
    {
      target: "ops.map",
      action: "next",
      view: "command-center",
      title: { th: "ภาพรวม Site", en: "Site overview", jp: "サイト概要" },
      body: {
        th: "แต่ละ Site เป็นการ์ดแบบหน้าจอ SCADA เรียง Site ที่มีปัญหาไว้ก่อน แถบบนสุดนับจำนวน Site ตามสถานะและ Alarm ที่ค้าง กดชิปเพื่อแสดงเฉพาะกลุ่มนั้น กดซ้ำเพื่อแสดงทั้งหมด การ์ดปกติเป็นสีเทามีไฟเขียวเล็กๆ เหลืองคือต้องดู แดงคือวิกฤต ในการ์ดมีเครื่องที่ออนไลน์ โปรแกรมที่ทำงาน CPU สูงสุด และ Alarm ค้าง คลิกการ์ดเพื่อดูรายละเอียดและรีโมต",
        en: "Each site is a SCADA-style faceplate, worst first, under a summary bar that counts sites by state and open alarms; press a chip to show only that group, again to show all. A healthy site stays grey with a small green lamp; amber needs attention, red is critical. A faceplate shows PCs online, programs running, peak CPU and open alarms. Click it for its detail and Remote buttons.",
        jp: "各サイトは SCADA 風のフェースプレートで、問題のあるサイトが先に並びます。上部のバーは状態別のサイト数と未解決アラームを数え、チップを押すとそのグループだけを表示、もう一度で全表示。正常は灰色に小さな緑ランプ、黄は要注意、赤は重大。オンライン PC・稼働プログラム・最大 CPU・未解決アラームを表示し、クリックで詳細とリモート。",
      },
    },
    {
      target: "ops.feed",
      action: "next",
      view: "command-center",
      title: { th: "ปัญหาล่าสุด", en: "Incident feed", jp: "インシデント" },
      body: {
        th: "ปัญหาที่เปิดอยู่ก่อน แล้วปัญหาที่แก้ใน 24 ชั่วโมง พร้อมอายุของปัญหา",
        en: "Open incidents first, then those fixed in the last 24 hours, with their age.",
        jp: "未解決を先頭に、過去24時間に解決したものを経過時間付きで表示。",
      },
    },
    {
      target: "ops.top",
      action: "next",
      view: "command-center",
      title: { th: "เครื่องที่โหลดสูง", en: "Busiest machines", jp: "高負荷のマシン" },
      body: {
        th: "สลับ CPU, RAM, Disk (ปุ่ม 1 2 3) เส้นเล็กคือย้อนหลังหนึ่งชั่วโมง",
        en: "Switch CPU, RAM and disk (keys 1 2 3); the small line is the last hour.",
        jp: "CPU・RAM・ディスクを切替（1 2 3 キー）。小さな線は直近1時間。",
      },
    },
    {
      target: "ops.spotlight",
      action: "next",
      view: "command-center",
      title: { th: "สปอตไลต์", en: "Spotlight", jp: "スポットライト" },
      body: {
        th: "เมื่อไม่มีใครใช้จอ จะวนแสดง Site ที่มีปัญหา ปุ่ม ← → เลื่อนเอง",
        en: "While nobody uses the screen it steps through the problem sites; ← → step by hand.",
        jp: "操作がない間は問題サイトを順に表示。← → で手動切替。",
      },
    },
    {
      target: "ops.tv",
      action: "next",
      view: "command-center",
      title: { th: "โหมดทีวี", en: "TV mode", jp: "TV モード" },
      body: { th: "เต็มจอสำหรับทีวีหรือจอติดผนัง (ปุ่ม F) กด Esc เพื่อออก", en: "Full screen for a TV or wall monitor (key F); Esc leaves it.", jp: "テレビや壁掛け画面向けの全画面（F キー）。Esc で終了。" },
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
    menu(
      "installed-base",
      { th: "เปิดเมนูทะเบียนอุปกรณ์ลูกค้า", en: "Open Installed Base", jp: "「納入機器台帳」を開く" },
      {
        th: "อุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้าทั้งหมดอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Everything installed for customers is here. Click the highlighted menu entry.",
        jp: "顧客に納入した機器とソフトがすべてここにあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "asset.new",
      action: "click",
      view: "installed-base",
      title: { th: "กด 'ลงทะเบียนอุปกรณ์'", en: "Press Register asset", jp: "「機器を登録」を押す" },
      body: { th: "เปิดฟอร์มอุปกรณ์ใหม่ ระบบออกเลขทะเบียนให้", en: "It opens the form for a new asset; the asset number is given for you.", jp: "新しい機器のフォームが開きます。機器番号は自動で付きます。" },
      missing: {
        th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์ลงทะเบียนอุปกรณ์",
        en: "If the button never appears, this account cannot register assets.",
        jp: "ボタンが表示されない場合、このアカウントには登録権限がありません。",
      },
    },
    {
      target: "asset.name",
      action: "next",
      view: "installed-base",
      title: { th: "ชื่อ ประเภท และสถานะ", en: "Name, category and status", jp: "名称・種別・状態" },
      body: {
        th: "ตั้งชื่อที่ลูกค้าและทีมเรียกกัน แล้วเลือกประเภทและสถานะ",
        en: "Use the name the customer and the team call it, then pick its category and status.",
        jp: "顧客とチームが呼ぶ名前を付け、種別と状態を選びます。",
      },
    },
    {
      target: "asset.customer",
      action: "next",
      view: "installed-base",
      title: { th: "ลูกค้าและที่ตั้ง", en: "Customer and location", jp: "顧客と設置場所" },
      body: {
        th: "เลือกลูกค้าและ Site ของลูกค้า ถ้าอยู่ในตู้ เลือกตู้และตำแหน่งด้านล่าง",
        en: "Choose the customer and their site; if it sits in a cabinet, choose the cabinet and position below.",
        jp: "顧客と顧客拠点を選びます。盤内にある場合は下で盤と位置を選びます。",
      },
    },
    {
      target: "asset.project",
      action: "next",
      view: "installed-base",
      title: { th: "โปรเจกต์", en: "Project", jp: "案件" },
      body: {
        th: "โปรเจกต์ที่ติดตั้งอุปกรณ์นี้ ใช้ย้อนดูงานเดิมเมื่อลูกค้าแจ้งปัญหา",
        en: "The project that installed it, for looking back when the customer reports a problem.",
        jp: "この機器を納入した案件です。顧客から問題が来たときに経緯をたどれます。",
      },
    },
    {
      target: "asset.serial",
      action: "next",
      view: "installed-base",
      title: { th: "ข้อมูลเครื่อง", en: "Machine details", jp: "機器情報" },
      body: {
        th: "ผู้ผลิต รุ่น Serial number, IP และเวอร์ชัน ใช้ตอนซ่อมหรืออัปเดต",
        en: "Maker, model, serial number, IP and version, for repairs and updates.",
        jp: "メーカー・型式・シリアル番号・IP・バージョンです。修理や更新時に使います。",
      },
    },
    {
      target: "asset.warranty",
      action: "next",
      view: "installed-base",
      title: { th: "วันติดตั้งและประกัน", en: "Installed and warranty", jp: "設置日と保証" },
      body: {
        th: "ใส่วันติดตั้งและวันหมดประกัน เพื่อรู้ว่างานซ่อมคิดเงินหรืออยู่ในประกัน",
        en: "Enter the installation date and warranty end, so a repair is known to be billable or under warranty.",
        jp: "設置日と保証期限を入れると、修理が有償か保証内かが分かります。",
      },
    },
    {
      target: "asset.monitor",
      action: "next",
      view: "installed-base",
      title: { th: "Site ใน Site Monitor", en: "Site Monitor site", jp: "サイトモニターのサイト" },
      body: {
        th: "ถ้าไซต์นี้มี TMT Control Panel ผูกไว้ จะเห็นสถานะเครื่องจริงจากหน้าอุปกรณ์",
        en: "If the site runs TMT Control Panel, link it to see the live status from the asset.",
        jp: "サイトにTMT Control Panelがあれば関連付けると、機器画面から稼働状態を見られます。",
      },
    },
    {
      target: "asset.save",
      action: "click",
      view: "installed-base",
      title: { th: "บันทึก", en: "Save", jp: "保存" },
      body: {
        th: "กด 'บันทึก' อุปกรณ์จะขึ้นในทะเบียนพร้อมประวัติ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Press Save and the asset joins the register with its history. Only practising? Press Cancel, then Finish.",
        jp: "「保存」を押すと履歴付きで台帳に載ります。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
    },
  ],
};

/*
 * Customers and suppliers from Pegasus ERP (owner decision 2026-11-05, migration 099): the screens read the ERP when they
 * open, linked records keep the ERP name and address, and an Admin confirms the records that match doubtfully.
 */
const ERP_MASTER_DATA: Guide = {
  id: "erp-customers-suppliers",
  area: "tools",
  title: { th: "ลูกค้าและซัพพลายเออร์จาก Pegasus ERP", en: "Customers and suppliers from Pegasus ERP", jp: "Pegasus ERPの顧客と仕入先" },
  summary: {
    th: "ดูว่าลูกค้ารายไหนมาจาก ERP อะไรแก้ในแอปได้ และ Admin ยืนยันรายการที่ระบบจับคู่ไม่ได้อย่างไร",
    en: "See which customers come from the ERP, what can still be changed in the app, and how an Admin confirms what the app could not match.",
    jp: "どの顧客がERPから来たか、アプリで変更できる項目、照合できなかったレコードをAdminが確認する方法を見ます。",
  },
  minutes: 2,
  // For the people who keep customer records; engineers only read them.
  permissions: ["crm.read", "crm.contact.write"],
  views: ["crm-customers"],
  browse: true,
  steps: [
    menu(
      "crm-customers",
      { th: "เปิดเมนูลูกค้า · 360°", en: "Open Customers · 360°", jp: "「顧客 · 360°」を開く" },
      { th: "ลูกค้าทุกรายอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every customer is here. Click the highlighted menu entry.", jp: "すべての顧客がここにあります。強調表示のメニューをクリックします。" },
    ),
    {
      target: "erp.status",
      action: "next",
      view: "crm-customers",
      title: { th: "ข้อมูลจากทะเบียนกลาง", en: "From the company register", jp: "会社の台帳のデータ" },
      body: {
        th: "เมื่อเปิดหน้านี้ ระบบดึงทะเบียนลูกค้าจาก Master data ของบริษัท ทั้งระบบดึงไม่เกิน 1 ครั้งต่อ 15 นาที ลูกค้าในทะเบียนกลางที่แอปยังไม่มีจะถูกเพิ่มให้เอง แถบนี้บอกเวลาที่ดึงล่าสุด จำนวนที่ผูกกับทะเบียนกลาง และจำนวนที่มีเฉพาะในแอป",
        en: "Opening this screen reads the customer register from the company's master data, at most once every 15 minutes for the whole app. Register customers the app lacks are added for you. The strip shows when it last read, how many are linked to the register and how many are only in the app.",
        jp: "この画面を開くと、会社のマスタデータから顧客台帳を取得します（アプリ全体で15分に1回まで）。アプリにない台帳の顧客は自動で追加されます。この帯には最終取得時刻、台帳連携数、アプリのみの件数が表示されます。",
      },
      missing: {
        th: "ถ้าไม่เห็นแถบนี้ แปลว่าเซิร์ฟเวอร์นี้ยังไม่ได้เชื่อมทะเบียนกลาง กด 'ถัดไป'",
        en: "No strip means this server is not linked to the company register. Press Next.",
        jp: "帯が表示されない場合、このサーバーは台帳と連携していません。「次へ」を押します。",
      },
    },
    {
      target: "crm.customer-list",
      action: "next",
      view: "crm-customers",
      title: { th: "คอลัมน์รหัส ERP", en: "The ERP code column", jp: "ERPコード列" },
      body: {
        th: "ลูกค้าที่มีรหัส ERP มาจากทะเบียนกลาง (รหัสเดียวกับใน ERP) ช่องที่ว่างคือลูกค้าที่มีเฉพาะในแอป เช่น ลูกค้าที่ยังอยู่ช่วงเสนองาน เมื่อทะเบียนกลางเปิดรายการนั้นแล้ว ระบบจะผูกให้เอง",
        en: "A customer with an ERP code comes from the company register, which uses the ERP's codes. An empty one is only in the app, such as a prospect; it is linked once the register opens the same customer.",
        jp: "ERPコードがある顧客は会社の台帳（ERPと同じコード）のデータです。空欄はアプリのみの顧客（見込み客など）で、台帳に登録されると自動で紐付きます。",
      },
    },
    {
      action: "next",
      view: "crm-customers",
      title: { th: "แก้อะไรได้บ้าง", en: "What you can still change", jp: "変更できる項目" },
      body: {
        th: "ลูกค้าที่มาจากทะเบียนกลาง: ชื่อไทยและอังกฤษ ที่อยู่ และสถานะใช้งาน แก้ได้ที่ทะเบียนกลางเท่านั้น และลบในแอปไม่ได้ ให้ปิดที่ทะเบียนกลางแทน ชื่อภาษาญี่ปุ่น ผู้ติดต่อ Site และผู้ดูแลลูกค้ายังแก้ในแอปได้ตามเดิม ซัพพลายเออร์ในเมนู Suppliers ทำงานแบบเดียวกัน โดยล็อกเฉพาะชื่อ",
        en: "For a customer from the company register, the Thai and English names, the address and whether it is active are changed in the register only, and it is closed there rather than removed here. The Japanese name, contacts, sites and account owner stay editable in the app. Suppliers work the same way, with only the name locked.",
        jp: "台帳の顧客は、タイ語・英語の名称、住所、有効/無効を台帳でのみ変更でき、アプリで削除せず台帳で無効にします。日本語名、担当者、サイト、顧客担当はアプリで引き続き編集できます。仕入先も同様で、名称のみロックされます。",
      },
    },
    {
      target: "erp.review",
      action: "next",
      view: "crm-customers",
      title: { th: "Admin: ยืนยันรายการที่จับคู่ไม่ได้", en: "Admin: confirm what did not match", jp: "Admin：照合できなかったものを確認" },
      body: {
        th: "ลูกค้าจากทะเบียนกลางที่คล้ายลูกค้าในแอปมากกว่าหนึ่งราย หรือคล้ายแต่ยังไม่แน่ใจ จะรอที่ปุ่ม 'รอยืนยัน' กดแล้วเลือกรายการในแอปที่ถูกต้อง กด 'ผูกกับรายการที่เลือก' หรือกด 'เพิ่มเป็นรายการใหม่' ถ้าเป็นลูกค้ารายใหม่จริง",
        en: "Register customers that resemble more than one app customer, or one only doubtfully, wait behind the 'to confirm' button. Open it, pick the right app record and press Link to the chosen one, or press Add as new when it really is a new customer.",
        jp: "アプリの複数の顧客に似ている、または確実でない台帳の顧客は「確認待ち」ボタンに入ります。開いて正しいレコードを選び「選択したものに紐付け」を押すか、本当に新規なら「新規として追加」を押します。",
      },
      missing: {
        th: "ไม่มีรายการรอยืนยัน หรือบัญชีนี้ไม่ใช่ Admin จบบทสอนได้เลย",
        en: "Nothing waits for confirmation, or this account is not an Admin. You can finish here.",
        jp: "確認待ちがないか、このアカウントはAdminではありません。ここで終了できます。",
      },
    },
  ],
};

/* Starring a menu entry (owner request 2026-11-10): the star beside each entry and the Favourites section it fills. */
const menuHidden: GuideCopy = {
  th: "ถ้าเมนูด้านซ้ายย่อเหลือแต่ไอคอน ให้กดปุ่มขยายเมนูที่มุมซ้ายบนก่อน แล้วรูปดาวจะขึ้น",
  en: "If the side menu shows icons only, open it with the menu button at the top left first; the stars then appear.",
  jp: "左のメニューがアイコンだけの場合は、先に左上のメニューボタンで開くと星が表示されます。",
};
const MENU_FAVORITES: Guide = {
  id: "menu-favorites",
  area: "tools",
  title: { th: "ติดดาวเมนูที่ใช้บ่อย", en: "Star the menu entries you use most", jp: "よく使うメニューに星を付ける" },
  summary: {
    th: "กดรูปดาวที่เมนูด้านซ้าย เมนูนั้นจะขึ้นไปอยู่ใต้ 'รายการโปรด' บนสุดของเมนู ได้สูงสุด 8 รายการ และตามไปทุกเครื่องที่เข้าใช้งาน",
    en: "Press the star on a side-menu entry and it appears under Favourites at the top of the menu: up to 8, on every device you sign in from.",
    jp: "左メニューの星を押すと、メニュー最上部の「お気に入り」に表示されます。最大8件で、サインインするどの端末でも同じです。",
  },
  minutes: 1,
  permissions: [],
  views: [],
  browse: true,
  steps: [
    {
      target: "nav.star",
      action: "next",
      view: "my-work",
      title: { th: "ชี้ที่เมนู แล้วกดรูปดาว", en: "Point at an entry and press its star", jp: "メニューに合わせて星を押す" },
      body: {
        th: "เมื่อชี้ที่เมนูใดก็ได้ จะมีรูปดาวขึ้นทางขวาของเมนูนั้น กดรูปดาวเพื่อเพิ่มเมนูในรายการโปรด ดาวที่ติดแล้วเป็นสีเหลืองและแสดงค้างไว้",
        en: "Point at any menu entry and a star appears on its right. Press it to add the entry to your favourites; a starred entry keeps a yellow star.",
        jp: "メニューにカーソルを合わせると右側に星が表示されます。押すとお気に入りに追加され、星は黄色のまま表示されます。",
      },
      missing: menuHidden,
    },
    {
      target: "nav.favorites",
      action: "next",
      view: "my-work",
      title: { th: "รายการโปรด", en: "Favourites", jp: "お気に入り" },
      body: {
        th: "เมนูที่ติดดาวจะเรียงที่นี่ตามลำดับที่กด พร้อมตัวเลขแจ้งเตือนเหมือนเมนูเดิม คลิกเพื่อเปิดหน้านั้นได้ทันที เมนูเดิมยังอยู่ในกลุ่มของมันเหมือนเดิม",
        en: "Starred entries line up here in the order you starred them, with the same counts as the original entry. Click one to open its screen. The original stays in its group.",
        jp: "星を付けたメニューが押した順にここに並び、元のメニューと同じ件数が表示されます。クリックでその画面が開きます。元のメニューはグループに残ります。",
      },
      missing: menuHidden,
    },
    {
      action: "next",
      view: "my-work",
      title: { th: "เอาออก และจำนวนสูงสุด", en: "Removing, and the limit", jp: "外し方と上限" },
      body: {
        th: "กดรูปดาวสีเหลืองอีกครั้งเพื่อเอาเมนูออกจากรายการโปรด ติดดาวได้สูงสุด 8 เมนู เมื่อครบแล้วต้องเอาออกก่อนจึงจะเพิ่มใหม่ได้ รายการโปรดเป็นของแต่ละคนและเหมือนกันทุกเครื่อง",
        en: "Press a yellow star again to take the entry out. You can star up to 8 entries; when the list is full, remove one before adding another. Favourites are your own and the same on every device.",
        jp: "黄色の星をもう一度押すとお気に入りから外れます。星は最大8件で、上限のときは1件外してから追加します。お気に入りは自分専用で、どの端末でも同じです。",
      },
    },
  ],
};

/*
 * Menu screens with no guide, and why (owner rule 2026-11-02: a new feature updates the guides). tests/guides.test.mjs
 * fails when a menu screen has neither a guide nor an entry here, so a new screen cannot ship without one or the other.
 */
/*
 * Owner 2026-11-26: the Leader role is set on the web. An Admin gives a person a role in User Accounts & Permissions: an
 * additional role on top of their primary role (migration 051), which keeps everything the primary role gives, or a new
 * primary role. The button and field names are the role dialog's own (operations-workspace-copy.ts).
 */
const USER_ROLE: Guide = {
  id: "user-role",
  area: "tools",
  title: { th: "ตั้ง Role ให้พนักงาน เช่น Leader", en: "Give a person a role, such as Leader", jp: "社員にロールを設定する（例：Leader）" },
  summary: {
    th: "เปิดบัญชีผู้ใช้และสิทธิ์ เลือกคน แล้วเพิ่ม Leader เป็น Role เพิ่มเติม (Role เดิมยังอยู่) หรือเปลี่ยน Role หลัก",
    en: "Open User Accounts & Permissions, pick the person, and add Leader as an additional role (their role stays) or change their primary role.",
    jp: "「ユーザーアカウントと権限」で社員を選び、Leaderを追加ロールとして付与（元のロールはそのまま）するか、主ロールを変更します。",
  },
  minutes: 2,
  permissions: ["admin.manage_roles"],
  views: ["user-accounts"],
  steps: [
    menu(
      "user-accounts",
      { th: "เปิดเมนูบัญชีผู้ใช้และสิทธิ์", en: "Open User Accounts & Permissions", jp: "「ユーザーアカウントと権限」を開く" },
      {
        th: "บัญชีและ Role ของทุกคนอยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Everyone's account and role are here. Click the highlighted menu entry.",
        jp: "全員のアカウントとロールがあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "role.edit",
      action: "click",
      view: "user-accounts",
      title: { th: "กด 'แก้ไข Role' ของคนนั้น", en: "Press Edit role on the person's row", jp: "その人の行の「ロールを変更」を押す" },
      body: { th: "ปุ่มทางซ้ายของแต่ละแถว", en: "The button at the left of each row.", jp: "各行の左にあるボタンです。" },
      missing: {
        th: "ปุ่มนี้ขึ้นเฉพาะ Admin ถ้าไม่มีชื่อคนที่ต้องการ ให้เพิ่มเขาที่เมนูพนักงานก่อน",
        en: "Only an Admin sees this button. If the person is not listed, add them in Employees first.",
        jp: "このボタンは管理者だけに表示されます。対象者がいない場合は、先に社員メニューで追加します。",
      },
    },
    {
      target: "role.primary",
      action: "next",
      view: "user-accounts",
      title: { th: "Role หลัก", en: "The primary role", jp: "主ロール" },
      body: {
        th: "ถ้าจะให้ Leader เป็น Role หลักแทน Role เดิม เลือกที่ 'Role ใหม่' แล้วกด 'บันทึก Role' ใต้ช่องบอกว่า Role นั้นทำอะไรได้ ถ้าจะเพิ่ม Leader โดยเก็บ Role เดิมไว้ ทำขั้นถัดไป",
        en: "To make Leader the primary role in place of the old one, choose it in New application role and press Save role; the line under the box says what the role can do. To add Leader and keep the old role, go on to the next step.",
        jp: "Leaderを元のロールの代わりに主ロールにする場合は「新しいアプリケーションロール」で選び「ロールを保存」を押します。欄の下にロールの説明が出ます。元のロールを残してLeaderを加える場合は次の手順へ進みます。",
      },
    },
    {
      target: "role.extra",
      action: "next",
      view: "user-accounts",
      title: { th: "เพิ่ม Role อีกหนึ่ง", en: "Add another role", jp: "ロールを追加" },
      body: {
        th: "เลือก Leader ตรงนี้ คนนั้นได้สิทธิ์ของ Leader เพิ่มจาก Role เดิม และ Role เดิมยังอยู่ครบ แนะนำวิธีนี้สำหรับหัวหน้าทีม Leader วางแผนโปรเจกต์ของทีม ประเมิน KPI ของ Engineer ในทีม และตรวจรายงานได้",
        en: "Choose Leader here: the person gains the Leader's permissions on top of their role, which stays as it is. This is the way for a team lead. A Leader plans the team's projects, assesses the KPI of its Engineers and reviews reports.",
        jp: "ここでLeaderを選びます。元のロールはそのままで、Leaderの権限が加わります。チームリーダーにはこの方法を勧めます。Leaderはチームの案件の計画、チームのEngineerのKPI評価、レポートの確認ができます。",
      },
    },
    {
      target: "role.reason",
      action: "next",
      view: "user-accounts",
      title: { th: "ใส่เหตุผล", en: "Give a reason", jp: "理由を入力" },
      body: {
        th: "Role ที่เพิ่มทุกครั้งต้องมีเหตุผล เช่น 'หัวหน้ากลุ่ม Application 1G' ระบบเก็บไว้ในประวัติ",
        en: "Every additional role needs a reason, such as 'Application 1G group lead'; it is kept in the history.",
        jp: "追加ロールには理由が必要です（例：「アプリケーション1Gのグループリーダー」）。履歴に残ります。",
      },
    },
    {
      target: "role.grant",
      action: "click",
      view: "user-accounts",
      title: { th: "กด 'ให้สิทธิ์ Role'", en: "Press Grant role", jp: "「ロールを付与」を押す" },
      body: {
        th: "สิทธิ์ใหม่มีผลเมื่อคนนั้นใช้งานครั้งถัดไป ถ้าแค่ฝึก ให้กด 'ถอด Role' ที่เพิ่งเพิ่ม แล้วกด 'จบบทสอน'",
        en: "The new permissions apply from the person's next request. Only practising? Press Remove role on the role you added, then Finish.",
        jp: "新しい権限は次の操作から有効です。練習だけなら、追加したロールの「ロールを解除」を押してから「完了」を押します。",
      },
    },
  ],
};

/*
 * Owner 2026-11-26: a Leader assesses the KPI of their team's Engineers, as Engineering and Project Managers assess theirs.
 * The head opens Team progress, picks the person, rates each area with evidence and sends it to calibration.
 */
const KPI_REVIEW: Guide = {
  id: "kpi-review",
  area: "tools",
  title: { th: "ประเมิน KPI ของลูกทีม", en: "Assess a team member's KPI", jp: "チームメンバーのKPIを評価する" },
  summary: {
    th: "เปิด KPI และการเติบโต แท็บความคืบหน้าของทีม เลือกคน ให้คะแนนแต่ละด้านพร้อมหลักฐาน แล้วส่งไปปรับเทียบ",
    en: "Open KPI & Growth, Team progress, pick the person, rate each area with evidence, and send it to calibration.",
    jp: "「KPI・成長」の「チーム進捗」で社員を選び、各項目を根拠付きで評価して調整へ送信します。",
  },
  minutes: 4,
  permissions: ["performance.read", "performance.manage"],
  views: ["performance"],
  steps: [
    menu(
      "performance",
      { th: "เปิดเมนู KPI และการเติบโต", en: "Open KPI & Growth", jp: "「KPI・成長」を開く" },
      {
        th: "การประเมินของรอบนี้อยู่ที่นี่ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "This cycle's reviews are here. Click the highlighted menu entry.",
        jp: "今回のサイクルの評価があります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: '[data-tab="team"]',
      action: "click",
      view: "performance",
      title: { th: "แท็บความคืบหน้าของทีม", en: "Team progress", jp: "チーム進捗" },
      body: { th: "รายชื่อคนที่คุณประเมินได้ คลิกแท็บนี้", en: "The people you assess. Click this tab.", jp: "評価できる社員の一覧です。このタブをクリックします。" },
      missing: {
        th: "แท็บนี้ขึ้นเมื่อบัญชีมีสิทธิ์ประเมินลูกทีม เช่น Leader ที่ประเมิน Engineer ในทีมเดียวกัน",
        en: "This tab appears for an account that assesses others, such as a Leader assessing the Engineers of their own team.",
        jp: "このタブは他の社員を評価できるアカウント（例：同じチームのEngineerを評価するLeader）に表示されます。",
      },
    },
    {
      target: "kpi.member",
      action: "click",
      view: "performance",
      title: { th: "เลือกคน", en: "Pick the person", jp: "社員を選ぶ" },
      body: {
        th: "คลิกชื่อในตาราง ด้านขวาจะแสดงคะแนนและสถานะของคนนั้น",
        en: "Click a name in the table; the side panel shows their scores and status.",
        jp: "表の名前をクリックすると、右側に評価点と状態が表示されます。",
      },
    },
    {
      target: "kpi.open",
      action: "click",
      view: "performance",
      title: { th: "กด 'เปิดแบบประเมิน'", en: "Press Open assessment", jp: "「評価を開く」を押す" },
      body: {
        th: "เปิดได้หลังจากลูกทีมส่งแบบประเมินตนเองแล้ว",
        en: "It opens once the person has sent their self review.",
        jp: "本人が自己評価を提出した後に開けます。",
      },
      missing: {
        th: "ถ้าปุ่มขึ้นว่า 'รอการประเมินตนเอง' ให้รอลูกทีมส่งก่อน กด 'ถัดไป' เพื่อดูขั้นต่อไป",
        en: "If the button reads Awaiting self review, wait for the person to send theirs. Press Next to see the rest.",
        jp: "ボタンが「自己評価待ち」なら本人の提出を待ちます。「次へ」で続きを見られます。",
      },
    },
    {
      target: "kpi.scores",
      action: "next",
      view: "performance",
      title: { th: "ให้คะแนนแต่ละด้าน", en: "Rate each area", jp: "各項目を評価" },
      body: {
        th: "เลือก 1–5 ในแต่ละด้าน คะแนน 1, 2 และ 5 ต้องมีหลักฐาน ระบบเสนอหลักฐานจากงานจริงให้เลือกใช้ คะแนนรวมคำนวณตามน้ำหนักเอง",
        en: "Choose 1–5 for each area; ratings of 1, 2 and 5 need evidence. The app suggests evidence from real work, and the weighted score updates by itself.",
        jp: "各項目で1〜5を選びます。1・2・5には根拠が必要です。実際の作業から根拠が提案され、加重スコアは自動で更新されます。",
      },
      missing: {
        th: "ส่วนนี้อยู่ในแบบประเมินที่เปิดจากขั้นก่อน กด 'ถัดไป'",
        en: "This is in the assessment opened in the step before. Press Next.",
        jp: "前の手順で開いた評価画面にあります。「次へ」を押します。",
      },
    },
    {
      target: "kpi.send",
      action: "click",
      view: "performance",
      title: { th: "กด 'ส่งไปปรับเทียบ'", en: "Press Send to calibration", jp: "「調整へ送信」を押す" },
      body: {
        th: "ส่งคะแนนเข้าการปรับเทียบ ถ้ายังไม่เสร็จ กด 'บันทึกฉบับร่าง' แทน",
        en: "This sends the scores to calibration. Not finished? Press Save draft instead.",
        jp: "評価を調整へ送ります。途中なら代わりに「下書き保存」を押します。",
      },
    },
    {
      target: "kpi.complete",
      action: "click",
      view: "performance",
      title: { th: "กด 'เสร็จสิ้นการปรับเทียบ'", en: "Press Complete calibration", jp: "「調整を完了」を押す" },
      body: {
        th: "เมื่อตกลงคะแนนกันแล้ว กดปุ่มนี้ แล้วกด 'เสร็จสิ้นการประเมิน' คะแนนจะล็อกและลูกทีมเห็นผล ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
        en: "Once the scores are agreed, press it, then Complete review: the scores lock and the person sees them. Only practising? Press Cancel, then Finish.",
        jp: "評価が合意できたらこのボタン、続いて「評価を完了」を押します。評価が確定し本人に表示されます。練習だけなら「キャンセル」を押してから「完了」を押します。",
      },
      missing: {
        th: "ปุ่มนี้ขึ้นเมื่อแบบประเมินอยู่ในขั้นปรับเทียบ",
        en: "This button appears once the assessment is in calibration.",
        jp: "このボタンは評価が調整段階になると表示されます。",
      },
    },
  ],
};

export const NO_GUIDE: Readonly<Record<string, string>> = {
  dashboard: "Read-only overview; each tile opens a screen that has its own guide.",
  "crm-contacts": "Contacts are searched and added from the deal form (crm-deal-create).",
  missing: "Read-only list of estimate lines still waiting for a supplier price; prices arrive through supplier-quotation.",
  stamps: "Company stamp authority set up by admins.",
  "design-system": "Developer reference of tokens and shared components; nothing to learn as a workflow.",
  activity: "Read-only team activity for heads.",
  "summary-reports": "Read-only report analytics.",
  customers: "Master data kept by admins; staff with CRM use the CRM customer screens.",
  "visit-master": "Reference data for site visits, kept by coordinators.",
  "schedule-templates": "Master schedules kept by planners; used from project-create.",
  "module-templates": "Estimate templates kept by estimating leads; used from estimate-create.",
  "labor-packages": "Labour packages are saved and applied from the estimate's labour tab (estimate-create).",
  rates: "Labour rate master kept by estimating leads.",
  audit: "Admin-only audit log.",
  settings: "Admin-only settings.",
  manual: "The full illustrated manual, opened from the ? menu in the top bar; the guide list links to it.",
};

/*
 * The header funnel of the Pegasus lists (Suppliers and Employees, 2026-11-21): the list is searched, filtered and paged on
 * the server, and a column is filtered from the funnel beside its name. Nothing is saved, so the last step is a note.
 */
const LIST_COLUMN_FILTER: Guide = {
  id: "list-column-filter",
  area: "tools",
  title: { th: "กรองรายการจากหัวคอลัมน์", en: "Filter a list from its column header", jp: "列見出しから一覧を絞り込む" },
  summary: {
    th: "ใช้รูปกรวยข้างชื่อคอลัมน์ในหน้าผู้ขายและพนักงาน เลือกได้หลายค่า แล้วล้างตัวกรองเมื่อต้องการดูทั้งหมด",
    en: "Use the funnel beside a column name on Suppliers and Employees: pick one or more values, then clear it to see everything again.",
    jp: "仕入先と従業員の画面で列名の横のじょうごを使い、値を1つ以上選び、すべて表示するときは解除します。",
  },
  minutes: 1,
  permissions: ["master.read"],
  views: ["suppliers", "employees"],
  browse: true,
  steps: [
    menu(
      "suppliers",
      { th: "เปิดเมนูผู้ขาย", en: "Open Suppliers", jp: "「仕入先」を開く" },
      {
        th: "รายการผู้ขายค้นหา กรอง และแบ่งหน้าที่เซิร์ฟเวอร์ คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "The supplier list is searched, filtered and paged on the server. Click the highlighted menu entry.",
        jp: "仕入先の一覧はサーバーで検索・絞り込み・ページ分けされます。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "list.columnFilter",
      action: "click",
      view: "suppliers",
      title: { th: "กดรูปกรวยข้างหัวคอลัมน์", en: "Press the funnel beside the column name", jp: "列名の横のじょうごを押す" },
      body: {
        th: "รูปกรวยจางๆ ข้างหัวคอลัมน์ Category คือตัวกรองของคอลัมน์นั้น กดแล้วจะเห็นค่าที่มีในทะเบียน พร้อมจำนวนรายการของแต่ละค่า",
        en: "The faint funnel beside Category is that column's filter. Pressing it lists the values in the register with how many records carry each.",
        jp: "Category の横の薄いじょうごがその列の絞り込みです。押すと台帳にある値と、それぞれの件数が表示されます。",
      },
      missing: {
        th: "ถ้าไม่เห็นตาราง ให้ล้างคำค้นหาก่อน",
        en: "If the table is not shown, clear the search first.",
        jp: "表が表示されない場合は、先に検索語を消します。",
      },
    },
    {
      action: "next",
      view: "suppliers",
      title: { th: "เลือกค่าที่ต้องการ", en: "Pick the values you want", jp: "値を選ぶ" },
      body: {
        th: "กดค่าหนึ่งหรือหลายค่า รายการจะแสดงเฉพาะที่ตรง และกรวยเป็นสีน้ำเงินระหว่างที่กรองอยู่ กด 'ทั้งหมด' หรือ 'ล้างตัวกรอง' เพื่อดูทุกรายการอีกครั้ง หน้าพนักงานกรองสถานะ แผนก และระดับได้แบบเดียวกัน",
        en: "Press one or more values: the list shows only the matches, and the funnel stays blue while the column is filtered. Press All or Clear to see everything again. Employees filters Status, Department and Level the same way.",
        jp: "値を1つ以上押すと、一致するものだけが表示され、絞り込み中はじょうごが青くなります。「すべて」または「クリア」で全件に戻ります。従業員の画面でもステータス・部署・レベルを同じように絞り込めます。",
      },
    },
  ],
};

/* V1 / V2 look of the Sales screens (owner 2026-11-21): the same switch as Estimating, kept apart from it; everyone starts on V1. */
const SALES_LOOK_V2: Guide = {
  id: "sales-look-v2",
  area: "sales",
  title: { th: "ใช้หน้าจอ Sales แบบ V2 (Pegasus)", en: "Use the V2 (Pegasus) look of the Sales screens", jp: "Sales 画面の V2（Pegasus）表示を使う" },
  summary: {
    th: "สลับหน้าจอกลุ่มงานขาย (CRM, RFQ, Site Visit) เป็นแบบ V2 หน้าตาเดียวกับ Pegasus ERP ข้อมูลและปุ่มทำงานเหมือน V1 ทุกอย่าง กลับไป V1 ได้ทุกเมื่อ",
    en: "Switch the Sales screens (CRM, RFQ intake, Site Visit) to V2, the Pegasus ERP look. The data and every action are the same as in V1, and you can go back to V1 at any time.",
    jp: "営業グループの画面（CRM、RFQ、Site Visit）を Pegasus ERP と同じ V2 表示に切り替えます。データと操作は V1 と同じで、いつでも V1 に戻せます。",
  },
  minutes: 2,
  permissions: ["crm.read"],
  views: ["crm-opportunities"],
  browse: true,
  steps: [
    menu(
      "crm-opportunities",
      { th: "เปิดเมนูโอกาสขาย", en: "Open CRM Opportunities", jp: "「CRM Opportunities」を開く" },
      {
        th: "ปุ่มสลับ V1 / V2 อยู่ทุกหน้าในกลุ่มงานขาย รวมถึง RFQ และ Site Visit คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every screen of the Sales group, RFQ intake and Site Visit included, has the V1 / V2 switch. Click the highlighted menu.",
        jp: "営業グループのすべての画面（RFQ と Site Visit を含む）に V1 / V2 の切り替えがあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "sales.lookV2",
      action: "click",
      view: "crm-opportunities",
      title: { th: "กด V2", en: "Press V2", jp: "「V2」を押す" },
      body: {
        th: "หน้าจอเปลี่ยนเป็นแบบ Pegasus ทันที ระบบจำตัวเลือกไว้ในเครื่องนี้ แยกจากของกลุ่ม Estimating ครั้งหน้าที่เปิดหน้างานขายจะเป็น V2",
        en: "The screen changes to the Pegasus look at once. The choice is kept on this computer, apart from the Estimating one, so the Sales screens open in V2 next time.",
        jp: "画面がすぐに Pegasus 表示に変わります。選択は Estimating とは別にこのコンピューターに保存され、次回も営業画面は V2 で開きます。",
      },
      missing: {
        th: "ถ้ายังเปิดดีลอยู่ ให้กด 'กลับ' ด้านบนของหน้า ปุ่ม V1 / V2 อยู่มุมขวาบน",
        en: "If a deal is open, press Back at the top of the page. The V1 / V2 switch is at the top right.",
        jp: "商談を開いている場合は、ページ上部の「戻る」を押します。V1 / V2 の切り替えは右上にあります。",
      },
    },
    {
      target: "crm.summary",
      action: "next",
      view: "crm-opportunities",
      title: { th: "แถบสรุปตามขั้นของดีล", en: "The stage summary bar", jp: "段階のサマリーバー" },
      body: {
        th: "ช่องแรกคือดีลที่ยังเปิดอยู่ ถัดไปคือแต่ละขั้นของการขาย แล้วปิดท้ายด้วยได้งานและไม่ได้งาน กดช่องไหนรายการด้านล่างจะแสดงเฉพาะดีลกลุ่มนั้น กดซ้ำเพื่อดูทั้งหมด หน้า RFQ มีแถบแบบเดียวกันตามสถานะ",
        en: "The first cell is every open deal, then each sales stage, then Won and Lost. Press a cell to list only those deals, and press it again to see them all. RFQ intake has the same bar by status.",
        jp: "最初のセルは進行中の商談、続いて各営業段階、最後に受注と失注です。セルを押すとその商談だけを一覧表示し、もう一度押すとすべて表示します。RFQ 画面にもステータス別の同じバーがあります。",
      },
      missing: {
        th: "กด V2 ก่อน แถบนี้มีเฉพาะหน้าตาแบบ V2",
        en: "Press V2 first; this bar is part of the V2 look.",
        jp: "先に「V2」を押します。このバーは V2 表示にだけあります。",
      },
    },
    {
      target: "crm.deals",
      action: "next",
      view: "crm-opportunities",
      title: { th: "ขั้นของดีลอยู่คอลัมน์แรก", en: "The stage is the first column", jp: "段階は最初の列です" },
      body: {
        th: "ปุ่มดินสอทางซ้ายคือแก้ไขดีล กดชื่อดีลเพื่อเปิด และกดเลข Inquiry ใต้ขั้นเพื่อเปิดงานประเมินราคา",
        en: "The pencil on the left edits the deal. Press the deal's name to open it, and the inquiry number under the stage to open its RFQ.",
        jp: "左の鉛筆で商談を編集します。商談名を押すと開き、段階の下の引合番号を押すと RFQ を開きます。",
      },
      missing: {
        th: "ถ้าอยู่ที่มุมมองบอร์ด ให้กดแท็บรายการก่อน",
        en: "If the board is showing, press the list tab first.",
        jp: "ボード表示の場合は、先に一覧タブを押します。",
      },
    },
    {
      target: "sales.look",
      action: "next",
      view: "crm-opportunities",
      title: { th: "กลับไปแบบเดิมได้ทุกเมื่อ", en: "Go back to V1 at any time", jp: "いつでも V1 に戻せます" },
      body: {
        th: "กด V1 เพื่อกลับไปหน้าตาเดิม งานที่เปิดอยู่ไม่หายและไม่ต้องบันทึกใหม่ เพราะ V1 กับ V2 ใช้ข้อมูลชุดเดียวกัน",
        en: "Press V1 to return to the look you know. The work you have open stays as it is, because V1 and V2 use the same data.",
        jp: "V1 を押すと従来の表示に戻ります。V1 と V2 は同じデータを使うので、開いている作業はそのまま残ります。",
      },
    },
  ],
};

/* V1 / V2 look of the Estimating screens (owner 2026-11-19): everyone starts on V1; V2 is the Pegasus ERP look. */
const ESTIMATE_LOOK_V2: Guide = {
  id: "estimate-look-v2",
  area: "estimate",
  title: { th: "ใช้หน้าจอ Estimate แบบ V2 (Pegasus)", en: "Use the V2 (Pegasus) look of Estimate Cost", jp: "Estimate Cost の V2（Pegasus）表示を使う" },
  summary: {
    th: "สลับหน้าจอกลุ่ม Estimating เป็นแบบ V2 หน้าตาเดียวกับ Pegasus ERP ข้อมูลและปุ่มทำงานเหมือน V1 ทุกอย่าง กลับไป V1 ได้ทุกเมื่อ",
    en: "Switch the Estimating screens to V2, the Pegasus ERP look. The data and every action are the same as in V1, and you can go back to V1 at any time.",
    jp: "Estimating グループの画面を Pegasus ERP と同じ V2 表示に切り替えます。データと操作は V1 と同じで、いつでも V1 に戻せます。",
  },
  minutes: 2,
  permissions: ["estimate.read"],
  views: ["estimates"],
  browse: true,
  steps: [
    menu(
      "estimates",
      { th: "เปิดเมนู Estimate Cost", en: "Open Estimate Cost", jp: "「Estimate Cost」を開く" },
      {
        th: "ปุ่มสลับ V1 / V2 อยู่ทุกหน้าในกลุ่ม Estimating คลิกที่เมนูที่ไฮไลต์อยู่",
        en: "Every screen of the Estimating group has the V1 / V2 switch. Click the highlighted menu.",
        jp: "Estimating グループのすべての画面に V1 / V2 の切り替えがあります。強調表示のメニューをクリックします。",
      },
    ),
    {
      target: "estimate.lookV2",
      action: "click",
      view: "estimates",
      title: { th: "กด V2", en: "Press V2", jp: "「V2」を押す" },
      body: {
        th: "หน้าจอเปลี่ยนเป็นแบบ Pegasus ทันที ระบบจำตัวเลือกไว้ในเครื่องนี้ ครั้งหน้าที่เปิดจะเป็น V2",
        en: "The screen changes to the Pegasus look at once. The choice is kept on this computer, so the screen opens in V2 next time.",
        jp: "画面がすぐに Pegasus 表示に変わります。選択はこのコンピューターに保存され、次回も V2 で開きます。",
      },
    },
    {
      target: "estimate.summary",
      action: "next",
      view: "estimates",
      title: { th: "แถบสรุปตามสถานะ", en: "The status summary bar", jp: "ステータスのサマリーバー" },
      body: {
        th: "แต่ละช่องคือสถานะหนึ่ง พร้อมจำนวน Estimate และต้นทุนรวม ตามตัวกรองที่ตั้งไว้ กดช่องไหนรายการด้านล่างจะแสดงเฉพาะสถานะนั้น",
        en: "Each cell is one status with its number of estimates and their total cost under the filters you set. Press a cell to list only that status.",
        jp: "各セルが1つのステータスで、設定中のフィルターでの見積件数と原価合計を示します。セルを押すとそのステータスだけを一覧表示します。",
      },
      missing: {
        th: "ถ้ายังเปิด Estimate ใบหนึ่งอยู่ ให้กดชื่อเมนูในแถบนำทางด้านบนเพื่อกลับไปที่รายการ",
        en: "If an estimate is open, press the menu name in the trail at the top to go back to the list.",
        jp: "見積を開いている場合は、上部のパンくずのメニュー名を押して一覧に戻ります。",
      },
    },
    {
      target: "estimate.list",
      action: "click",
      clickOn: "tbody tr",
      view: "estimates",
      title: { th: "เปิด Estimate", en: "Open an estimate", jp: "見積を開く" },
      body: {
        th: "สถานะอยู่คอลัมน์แรก กดแถวหรือเลข Estimate เพื่อเปิด",
        en: "The status is the first column. Press a row or the estimate number to open it.",
        jp: "ステータスは最初の列です。行または見積番号を押して開きます。",
      },
    },
    {
      target: "estimate.moreActions",
      action: "next",
      view: "estimates",
      title: { th: "ปุ่มหลักหนึ่งปุ่ม ที่เหลืออยู่ใน 'การทำงานอื่น'", en: "One main button; the rest are under More actions", jp: "メインボタンは1つ、他は「その他の操作」に" },
      body: {
        th: "ปุ่มสีน้ำเงินด้านขวาคือขั้นตอนที่ต้องทำตอนนี้ เช่น ส่งให้ตรวจสอบ หรืออนุมัติ ส่วน Export Excel รีเฟรช สร้าง Revision และจัดการเอกสาร อยู่ใน 'การทำงานอื่น' แถบตัวเลขใต้หัวข้อคือต้นทุนแยกตามหมวด กดช่องไหนจะเปิดแท็บของรายการนั้น",
        en: "The blue button on the right is the step to take now, such as Submit Review or Approve. Export Excel, Refresh, Create Revision and Manage document are under More actions. The figures under the title are the cost by part; press one to open the tab that holds its lines.",
        jp: "右の青いボタンが今行う手順（レビュー依頼や承認など）です。Excel出力、更新、改訂作成、文書管理は「その他の操作」にあります。タイトル下の数字は区分別の原価で、押すとその明細のタブが開きます。",
      },
      missing: {
        th: "เปิด Estimate ใบหนึ่งก่อน แล้วกด 'ถัดไป'",
        en: "Open an estimate first, then press Next.",
        jp: "先に見積を開いてから「次へ」を押します。",
      },
    },
    {
      target: "estimate.look",
      action: "next",
      view: "estimates",
      title: { th: "กลับไปแบบเดิมได้ทุกเมื่อ", en: "Go back to V1 at any time", jp: "いつでも V1 に戻せます" },
      body: {
        th: "กด V1 เพื่อกลับไปหน้าตาเดิม งานที่เปิดอยู่ไม่หายและไม่ต้องบันทึกใหม่ เพราะ V1 กับ V2 ใช้ข้อมูลชุดเดียวกัน",
        en: "Press V1 to return to the look you know. The work you have open stays as it is, because V1 and V2 use the same data.",
        jp: "V1 を押すと従来の表示に戻ります。V1 と V2 は同じデータを使うので、開いている作業はそのまま残ります。",
      },
    },
  ],
};

/*
 * The Projects overview in the Pegasus ERP look, the only look since 2026-11-25 (the old two-look switch is gone): the list
 * filters from its summary bar and column headers, and the plan is edited on the Plan tab only.
 */
const PROJECT_OVERVIEW: Guide = {
  id: "project-overview",
  area: "project",
  title: { th: "ดูภาพรวมโปรเจกต์", en: "Read the Projects overview", jp: "Projects の概要を見る" },
  summary: {
    th: "หน้าภาพรวมโปรเจกต์กรองจากแถบสรุปสุขภาพและหัวคอลัมน์ ดูชั่วโมงเทียบงบและเรื่องที่ต้องตาม และเปิดหน้าโปรเจกต์หรือแผนงานจากแต่ละแถว แผนแก้ที่แท็บแผนงานที่เดียว",
    en: "The Projects overview filters from its health summary bar and column headers, shows hours against budget and what to follow up, and opens each project's page or plan from its row. The plan is edited on the Plan tab only.",
    jp: "Projects の概要は健全性のサマリーバーと列見出しで絞り込み、予算に対する時間と要フォローを表示し、各行から案件ページや計画を開きます。計画は「Plan」タブだけで編集します。",
  },
  minutes: 3,
  permissions: ["project.read"],
  views: ["projects"],
  browse: true,
  steps: [
    menu(
      "projects",
      { th: "เปิดเมนูโปรเจกต์", en: "Open Projects", jp: "「Projects」を開く" },
      {
        th: "คลิกที่เมนูที่ไฮไลต์อยู่ หน้าแรกคือรายการโปรเจกต์ทั้งหมด",
        en: "Click the highlighted menu. It opens on the list of every project.",
        jp: "強調表示のメニューをクリックします。すべての案件の一覧が開きます。",
      },
    ),
    {
      target: "project.summary",
      action: "next",
      view: "projects",
      title: { th: "แถบสรุปสุขภาพโครงการ", en: "The health summary bar", jp: "健全性のサマリーバー" },
      body: {
        th: "ช่องแรกคือโครงการที่ยังเปิดอยู่ทั้งหมด ถัดไปคือ ล่าช้า เสี่ยง ยังไม่มีแผน และตามแผน กดช่องไหนรายการด้านล่างจะแสดงเฉพาะกลุ่มนั้น กดซ้ำเพื่อดูทั้งหมด ชิปใต้แถบคือเรื่องที่ต้องดูแล",
        en: "The first cell is every open project, then Delayed, At Risk, No plan and On Track. Press a cell to list only those projects, and press it again to see them all. The chips under the bar are the things that need attention.",
        jp: "最初のセルは進行中のすべての案件、続いて遅延・リスク・計画なし・順調です。セルを押すとその案件だけを一覧表示し、もう一度押すとすべて表示します。バーの下のチップは要対応の事項です。",
      },
    },
    {
      target: "project.followCol",
      action: "next",
      view: "projects",
      title: { th: "ชั่วโมงและงานต้องตาม", en: "Hours and rows to chase", jp: "時間と要対応の作業" },
      body: {
        th: "คอลัมน์ 'ชม.จริง / งบ' คือชั่วโมงที่ทีมยืนยันแล้วเทียบงบจาก Estimate (เป็นสีแดงเมื่อเกิน) คอลัมน์ 'งานต้องตาม' คือจำนวนงานในแผนที่เลยกำหนด ติดปัญหา ถึงวันเริ่มแต่ยังไม่เริ่ม ยังไม่มีผู้ทำ หรือจ้างภายนอกแต่ยังไม่ขอซื้อ (ปุ่ม 'ต้องตาม' ในแผนงานรวมเรื่องอื่นด้วย จึงมากกว่าได้) กดตัวเลขเพื่อเปิดแผนงาน",
        en: "Hours / budget is the hours the team confirmed against the Estimate's budget (red when over). Rows to chase counts plan rows that are late, blocked, due but not started, have nobody on them, or are outsourced with no purchase request (the plan's To follow up button holds other checks too, so it can show more); press the number to open the plan.",
        jp: "「実績時間 / 予算」はチームが確定した時間と見積の予算です（超過すると赤）。「要対応の作業」は遅延・停滞・開始日を過ぎて未着手・担当者なし・購買依頼のない外注の行数です（計画の「要フォロー」ボタンには他の確認も含まれるため、多くなることがあります）。数字を押すと計画を開きます。",
      },
    },
    {
      target: "project.pmFilter",
      action: "next",
      view: "projects",
      title: { th: "กรองจากหัวคอลัมน์", en: "Filter from the column headers", jp: "列見出しで絞り込む" },
      body: {
        th: "กดรูปกรวยข้างหัวคอลัมน์ PM เพื่อเลือกผู้จัดการโครงการ หัวคอลัมน์สถานะและโครงการ (ทีม) ก็มีกรวยแบบเดียวกัน ค้นหา 'ทั้งหมด / ของฉัน' และ 'รายการ / ไทม์ไลน์' อยู่บนหัวหน้า ส่วนรีเฟรชและแสดงโครงการที่ปิดแล้วอยู่ในปุ่ม 'เพิ่มเติม'",
        en: "Press the funnel beside the PM column to pick a project manager; the Stage and Project (team) columns have the same funnel. Search, All / Mine and List / Timeline sit in the page header; Refresh and Show closed projects are under More.",
        jp: "PM 列の横の漏斗を押してプロジェクトマネージャーを選びます。ステージ列とプロジェクト（チーム）列にも同じ漏斗があります。検索・すべて／自分・一覧／タイムラインはページ見出しに、更新と完了案件の表示は「その他」にあります。",
      },
      missing: {
        th: "กด 'รายการ' บนหัวหน้า กรวยอยู่บนหัวตาราง ในมุมมองไทม์ไลน์ตัวกรองจะเป็นรายการเลือกเหนือแผนภูมิ",
        en: "Press List in the page header; the funnels are in the table header. In Timeline the filters are lists above the chart.",
        jp: "ページ見出しの「一覧」を押します。漏斗は表の見出しにあります。タイムラインではチャートの上に選択リストがあります。",
      },
    },
    {
      target: "project.rowMenu",
      action: "next",
      view: "projects",
      title: { th: "แก้แผนที่แท็บ Plan ที่เดียว", en: "The plan is edited on the Plan tab only", jp: "計画は「Plan」タブだけで編集します" },
      body: {
        th: "เมนู ⋯ ของแต่ละโครงการเปิดหน้าโปรเจกต์หรือแผนงาน หน้าโปรเจกต์มีแก้ไขโครงการ สมาชิก ขั้นงาน และลบ ส่วนแผนแก้ที่แท็บแผนงานบนตาราง Sheet ที่เดียว",
        en: "Each project's ⋯ menu opens its page or its plan. The page holds Edit project, members, stage and delete; the plan is edited on the Plan tab, on the Sheet, and nowhere else.",
        jp: "各案件の ⋯ メニューから案件ページまたは計画を開きます。案件ページには編集・メンバー・ステージ・削除があり、計画は「Plan」タブの Sheet だけで編集します。",
      },
      missing: {
        th: "ถ้ายังไม่มีโครงการในรายการ ให้กด 'ถัดไป'",
        en: "If the list has no project yet, press Next.",
        jp: "一覧に案件がない場合は「次へ」を押します。",
      },
    },
  ],
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
        target: "inquiry.receive",
        action: "click",
        view: "inquiries",
        title: { th: "กด 'รับ RFQ / สร้าง Inquiry'", en: "Press Receive RFQ / create inquiry", jp: "「RFQ受付・Inquiry作成」を押す" },
        body: { th: "ปุ่มนี้เปิดฟอร์มรับงานใหม่", en: "It opens the intake form for a new request.", jp: "新しい依頼の受付フォームが開きます。" },
        missing: {
          th: "ถ้ายังเปิด Inquiry เรื่องอื่นอยู่ ให้กดลิงก์ย้อนกลับด้านบนเพื่อกลับไปที่รายการ ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์สร้าง Inquiry",
          en: "If another inquiry is open, use the back link at the top to return to the list. If the button never appears, this account cannot create inquiries.",
          jp: "別の引合を開いている場合は、上部の戻るリンクで一覧に戻ります。ボタンが表示されない場合、このアカウントには作成権限がありません。",
        },
      },
      {
        target: "inquiry.customer",
        action: "next",
        view: "inquiries",
        title: { th: "เลือกลูกค้า", en: "Choose the customer", jp: "顧客を選ぶ" },
        body: {
          th: "พิมพ์รหัสหรือชื่อบริษัทเพื่อค้นหา แล้วเลือกผู้ติดต่อ ถ้ายังไม่มีในระบบ กด 'ลูกค้าใหม่' เพื่อเพิ่ม",
          en: "Type the company code or name to search, then pick the contact. Not listed yet? Press the new customer button.",
          jp: "会社コードまたは名前を入力して検索し、担当者を選びます。未登録なら新規顧客ボタンで追加します。",
        },
      },
      {
        target: "inquiry.endUser",
        action: "next",
        view: "inquiries",
        title: { th: "End user (ถ้ามี)", en: "End user, if different", jp: "エンドユーザー(異なる場合)" },
        body: {
          th: "บริษัทที่ใช้งานจริง ถ้าเป็นบริษัทเดียวกับผู้ว่าจ้าง กด 'บริษัทเดียวกับผู้ว่าจ้าง' หรือเว้นไว้ใส่ทีหลังก็ได้",
          en: "The company that will use the system. If it is the customer itself, press Same customer, or leave it for later.",
          jp: "実際に使用する会社です。発注者と同じなら「Same customer」を押すか、後で入力します。",
        },
      },
      {
        target: "inquiry.projectName",
        action: "next",
        view: "inquiries",
        title: { th: "ตั้งชื่องาน", en: "Name the work", jp: "案件名を付ける" },
        body: {
          th: "ใช้ชื่อที่บอกว่าลูกค้าต้องการอะไร เช่น 'ระบบ OEE ไลน์ประกอบ 3' ถ้าลูกค้ามี Inquiry ชื่อคล้ายกันที่ยังเปิดอยู่ ระบบจะเตือนตอนบันทึก",
          en: "Say what the customer wants, e.g. 'OEE system for assembly line 3'. Saving warns you if the customer already has an open inquiry with a similar name.",
          jp: "顧客の要望が分かる名前にします(例:「組立ライン3 OEEシステム」)。同じ顧客に似た名前の引合があると保存時に警告されます。",
        },
      },
      {
        target: "inquiry.due",
        action: "next",
        view: "inquiries",
        title: { th: "กำหนดตอบกลับ", en: "Estimate due date", jp: "回答期限" },
        body: {
          th: "วันที่ต้องส่งราคาให้ลูกค้า ผู้ประเมินจะเห็นวันนี้ในงานของเขา ค่าเริ่มต้นคืออีก 14 วัน",
          en: "When the price must reach the customer. The estimator sees this date in their work; it starts 14 days ahead.",
          jp: "顧客へ価格を出す期限です。見積担当の作業に表示されます。初期値は14日後です。",
        },
      },
      {
        target: "inquiry.requirement",
        action: "next",
        view: "inquiries",
        title: { th: "ความต้องการของลูกค้า", en: "Customer requirement", jp: "顧客要求" },
        body: {
          th: "สรุปสิ่งที่ลูกค้าขอด้วยคำของลูกค้าเอง ผู้ประเมินใช้ข้อความนี้เริ่มทำราคา",
          en: "Summarise what the customer asked for, in their words. The estimator starts from this text.",
          jp: "顧客の言葉で要望をまとめます。見積担当はこの内容から作業を始めます。",
        },
      },
      {
        target: "inquiry.crm",
        action: "next",
        view: "inquiries",
        title: { th: "เชื่อมกับดีลใน CRM", en: "Link the CRM deal", jp: "CRMの商談とつなぐ" },
        body: {
          th: "ถ้างานนี้มีดีลใน CRM อยู่แล้ว เลือกจากรายการด้านล่าง ระบบจะดึงข้อมูลมาและผูกให้ ถ้าไม่มี ทำขั้นต่อไปได้เลย",
          en: "If this work already has a CRM deal, pick it from the list below and its details come across. If not, carry on.",
          jp: "既にCRMの商談があれば下の一覧から選ぶと内容が引き継がれます。なければそのまま進めます。",
        },
      },
      {
        target: "inquiry.more",
        action: "next",
        view: "inquiries",
        title: { th: "รายละเอียดเพิ่มเติม", en: "More details", jp: "詳細情報" },
        body: {
          th: "กดเพื่อเปิด: เปลี่ยนผู้ประเมิน ประเภทงาน ความสำคัญ โอกาสได้งาน และข้อมูลทางเทคนิค ถ้าค่าเริ่มต้นถูกแล้วข้ามได้",
          en: "Open it to change the estimator, project type, priority, probability and technical details. Skip it if the defaults are right.",
          jp: "開くと見積担当、案件種別、優先度、受注確度、技術情報を変更できます。初期値で良ければ省略できます。",
        },
      },
      {
        target: "inquiry.attach",
        action: "next",
        view: "inquiries",
        title: { th: "แนบไฟล์ RFQ", en: "Attach the RFQ files", jp: "RFQファイルを添付" },
        body: {
          th: "ลากไฟล์มาวางหรือคลิกเพื่อเลือก (PDF, Office, DWG, STEP, อีเมล Outlook, ZIP/RAR/7z หรือรูป ไม่เกิน 50 MB ต่อไฟล์) ไฟล์จะอัปโหลดตอนกดบันทึก ถ้าไฟล์ไหนอัปโหลดไม่ผ่าน ระบบจะบอกชื่อไฟล์และเหตุผล ให้แนบใหม่ที่แท็บไฟล์แนบ",
          en: "Drag files here or click to browse (PDF, Office, DWG, STEP, Outlook email, ZIP/RAR/7z or images, up to 50 MB each). They upload when you save. A file that does not upload is named with the reason; attach it again from the Attachments tab.",
          jp: "ファイルをドラッグするかクリックして選択します(PDF・Office・DWG・STEP・Outlookメール・ZIP/RAR/7z・画像、1ファイル50MBまで)。保存時にアップロードされます。アップロードできなかったファイルは名前と理由が表示されるので、添付ファイルタブから添付し直します。",
        },
      },
      {
        target: "inquiry.save",
        action: "click",
        view: "inquiries",
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
        target: '[data-tab="attachments"]',
        action: "click",
        view: "inquiries",
        title: { th: "เปิดแท็บไฟล์แนบ", en: "Open the Attachments tab", jp: "添付ファイルタブを開く" },
        body: {
          th: "แท็บนี้แสดงไฟล์ทั้งหมดของ Inquiry พร้อมหมวด ขนาด และผู้อัปโหลด",
          en: "It lists every file on the inquiry with its category, size and who uploaded it.",
          jp: "引合のすべてのファイルが、分類・サイズ・アップロード者とともに表示されます。",
        },
      },
      {
        target: "inquiry.upload",
        action: "click",
        view: "inquiries",
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
        target: "inquiry.attachCategory",
        action: "next",
        view: "inquiries",
        title: { th: "เลือกหมวดเอกสาร", en: "Choose the document category", jp: "文書分類を選ぶ" },
        body: {
          th: "เช่น Customer RFQ, Drawing หรือ Specification หมวดนี้ใช้จัดไฟล์เมื่อส่งต่อไปที่ Project",
          en: "For example Customer RFQ, Drawing or Specification. The category files it when it moves to the Project.",
          jp: "Customer RFQ、Drawing、Specification などを選びます。プロジェクトへ引き継ぐときの分類に使われます。",
        },
      },
      {
        target: "inquiry.attachFile",
        action: "next",
        view: "inquiries",
        title: { th: "เลือกไฟล์", en: "Choose the file", jp: "ファイルを選ぶ" },
        body: {
          th: "รับ PDF, Office, DWG/DXF, STEP/IGES, อีเมล Outlook (.msg, .eml), ZIP/RAR/7z และรูป ไม่เกิน 50 MB ต่อไฟล์ แนบได้ครั้งละหนึ่งไฟล์",
          en: "PDF, Office, DWG/DXF, STEP/IGES, Outlook email (.msg, .eml), ZIP/RAR/7z and images are accepted, up to 50 MB each, one file at a time.",
          jp: "PDF・Office・DWG/DXF・STEP/IGES・Outlookメール(.msg、.eml)・ZIP/RAR/7z・画像を受け付けます。1ファイル50MBまで、1回に1ファイルです。",
        },
      },
      {
        target: "inquiry.attachUpload",
        action: "click",
        view: "inquiries",
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
    // One owner for an inquiry and its estimate (bug 2026-11-26: EBARA INQ-2611-0019 named Sukanya while its estimate
    // still named the person it was created with). Assigning the owner on the inquiry now moves the estimate too.
    id: "inquiry-assign-owner",
    area: "sales",
    title: { th: "เปลี่ยนผู้รับผิดชอบประมาณราคา", en: "Change who estimates an inquiry", jp: "引合の見積担当者を変更" },
    summary: {
      th: "มอบหมาย Inquiry ให้ผู้ประเมินคนใหม่ ถ้ามี Estimate แล้ว Estimate จะเปลี่ยนผู้รับผิดชอบตามไปด้วย พร้อมงานส่วนที่ยังไม่เสร็จ",
      en: "Give an inquiry to another estimator. When it already has an estimate, the estimate moves to them too, with the unfinished sections.",
      jp: "引合を別の見積担当者に割り当てます。見積がすでにある場合は、未完了のセクションとともに見積も移ります。",
    },
    minutes: 1,
    permissions: ["inquiry.write"],
    views: ["inquiries"],
    steps: [
      inquiryMenu,
      openInquiry({
        th: "คลิกที่แถวของ Inquiry ที่จะเปลี่ยนผู้รับผิดชอบ",
        en: "Click the row of the inquiry to give to someone else.",
        jp: "担当者を変更する引合の行をクリックします。",
      }),
      {
        target: "inquiry.assignOwner",
        action: "click",
        view: "inquiries",
        title: { th: "กด 'มอบหมายผู้รับผิดชอบ'", en: "Press Assign owner", jp: "「担当者を割り当て」を押す" },
        body: {
          th: "ปุ่มอยู่ด้านบนของหน้า Inquiry",
          en: "It is at the top of the inquiry.",
          jp: "引合画面の上部にあります。",
        },
        missing: {
          th: "ถ้าไม่มีปุ่มนี้ บัญชีนี้ยังไม่มีสิทธิ์แก้ Inquiry",
          en: "No button means this account cannot change inquiries.",
          jp: "ボタンがない場合、このアカウントには引合の変更権限がありません。",
        },
      },
      {
        target: "inquiry.assignOwnerSelect",
        action: "next",
        view: "inquiries",
        title: { th: "เลือกผู้รับผิดชอบคนใหม่", en: "Choose the new owner", jp: "新しい担当者を選ぶ" },
        body: {
          th: "ถ้า Inquiry มี Estimate แล้ว ข้อความด้านล่างบอกว่า Estimate จะเปลี่ยนตาม ถ้าขึ้นสีเหลืองว่า Estimate ยังเป็นของคนอื่น ให้กดบันทึกเพื่อให้ตรงกัน",
          en: "When the inquiry has an estimate, the note below says it moves too. A yellow note saying the estimate still names someone else means saving puts them in line.",
          jp: "見積がある場合は、下の表示で見積も移ることがわかります。見積の担当者が別の人だと黄色で表示されたら、保存すると揃います。",
        },
      },
      {
        target: "inquiry.assignOwnerSave",
        action: "click",
        view: "inquiries",
        title: { th: "บันทึก", en: "Save", jp: "保存" },
        body: {
          th: "กด 'มอบหมายผู้รับผิดชอบ' ผู้รับผิดชอบคนใหม่ได้อีเมล และ Estimate เปลี่ยนตาม ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'เสร็จ'",
          en: "Press Assign owner: the new owner gets an email and the estimate follows. Only practising? Press Cancel, then Finish.",
          jp: "「担当者を割り当て」を押すと新しい担当者にメールが届き、見積も移ります。練習だけなら「キャンセル」を押し、「完了」を押します。",
        },
        missing: {
          th: "ปุ่มบันทึกกดได้เมื่อเลือกคนใหม่ หรือเมื่อ Estimate ยังเป็นของคนอื่น",
          en: "Save turns on once another person is chosen, or while the estimate names someone else.",
          jp: "別の担当者を選ぶか、見積の担当者が異なるときに保存できます。",
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
        target: "inquiry.requestVisit",
        action: "click",
        view: "inquiries",
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
        target: "intake.customer",
        action: "next",
        view: "inquiries",
        title: { th: "ลูกค้าและสถานที่", en: "Customer and site", jp: "顧客と現場" },
        body: {
          th: "ใส่ชื่อ Site ที่อยู่ และผู้ติดต่อหน้างาน (ชื่อ และเบอร์โทรหรืออีเมล) ช่องเหล่านี้ต้องมีก่อนส่งตรวจ",
          en: "Name the site, its address and the contact on site (a name plus phone or email). These are required before review.",
          jp: "現場名・住所・現場担当者(氏名と電話またはメール)を入力します。レビュー前に必須です。",
        },
      },
      {
        target: "intake.want",
        action: "next",
        view: "inquiries",
        title: { th: "สิ่งที่ลูกค้าต้องการ", en: "What the customer wants", jp: "顧客の要望" },
        body: {
          th: "เขียนปัญหาที่เกิดขึ้นตอนนี้ และผลที่ลูกค้าอยากได้ อย่างละอย่างน้อย 20 ตัวอักษร",
          en: "Describe today's problem and the result the customer expects, at least 20 characters each.",
          jp: "現在の問題と顧客が期待する結果を、それぞれ20文字以上で書きます。",
        },
      },
      {
        target: "intake.machine",
        action: "next",
        view: "inquiries",
        title: { th: "เครื่องจักรและสภาพหน้างาน", en: "Machine and site conditions", jp: "設備と現場条件" },
        body: {
          th: "ชื่อและรุ่นเครื่อง ระบบเดิม ข้อกำหนดความปลอดภัยและการเข้าพื้นที่ ช่วยให้วิศวกรเตรียมตัวได้ถูก",
          en: "Machine name and model, the existing system, and safety or access rules, so the engineer comes prepared.",
          jp: "設備名と型式、既存システム、安全・入場ルールを書くと技術者が準備できます。",
        },
      },
      {
        target: "intake.purpose",
        action: "next",
        view: "inquiries",
        title: { th: "วัตถุประสงค์และทักษะ", en: "Purpose and skills", jp: "目的と技能" },
        body: {
          th: "เลือกวัตถุประสงค์อย่างน้อย 1 ข้อ และทักษะที่คิดว่าต้องใช้ ผู้ประสานงานปรับทีหลังได้",
          en: "Pick at least one purpose and the skills you expect; the coordinator can adjust them.",
          jp: "目的を1つ以上と必要と思われる技能を選びます。調整担当が後で修正できます。",
        },
      },
      {
        target: "intake.attach",
        action: "next",
        view: "inquiries",
        title: { th: "แนบรูปหรือแบบ", en: "Attach photos or drawings", jp: "写真や図面を添付" },
        body: {
          th: "รูปเครื่องจริงหนึ่งรูปช่วยลดการเดาได้มาก แนบอีเมลที่ลูกค้าส่งมาด้วยก็ได้",
          en: "One photo of the real machine saves a lot of guessing. You can attach the customer's email too.",
          jp: "実機の写真1枚で推測の手間が大きく減ります。顧客のメールも添付できます。",
        },
      },
      {
        target: "intake.readiness",
        action: "next",
        view: "inquiries",
        title: { th: "ความพร้อมของข้อมูล", en: "Readiness", jp: "情報充足度" },
        body: {
          th: "ส่วนนี้บอกว่ายังขาดอะไร ข้อที่เป็น blocker ต้องครบก่อนส่งตรวจ ส่วนคำเตือนส่งได้แต่ควรเติม",
          en: "This shows what is still missing. Blockers must be done before review; warnings can wait but are worth filling.",
          jp: "不足している項目が表示されます。ブロッカーはレビュー前に必須、警告は後でも構いません。",
        },
      },
      {
        target: "intake.save",
        action: "click",
        view: "inquiries",
        title: { th: "บันทึกฉบับร่าง", en: "Save the draft", jp: "下書き保存" },
        body: {
          th: "กด 'บันทึกฉบับร่าง' บันทึกได้ทุกเมื่อแม้ข้อมูลยังไม่ครบ ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
          en: "Press Save draft; you can save at any time, even incomplete. Only practising? Press Cancel, then Finish.",
          jp: "「下書き保存」を押します。未完成でもいつでも保存できます。練習だけなら「キャンセル」を押してから「完了」を押します。",
        },
      },
      {
        target: "intake.to.Pending Technical Review",
        action: "click",
        view: "inquiries",
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
  SALES_LOOK_V2,
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
        target: "inquiry.createEstimate",
        action: "click",
        view: "inquiries",
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
        target: "estimate.startFrom",
        action: "next",
        view: "inquiries",
        title: { th: "เริ่มจากไหน", en: "Where to start from", jp: "作成方法を選ぶ" },
        body: {
          th: "เลือก Estimate เดิมที่คล้ายกันเพื่อคัดลอกรายการมาแก้ ช่วยประหยัดเวลา หรือเลือกเริ่มจากว่าง",
          en: "Pick a similar earlier estimate to copy its lines and adjust them, which saves time, or start empty.",
          jp: "似た過去の見積を選んで明細をコピーし修正すると時間を節約できます。空から始めることもできます。",
        },
      },
      {
        target: "estimate.create",
        action: "click",
        view: "inquiries",
        title: { th: "สร้าง Estimate", en: "Create it", jp: "見積を作成" },
        body: {
          th: "กดปุ่มสร้าง ถ้าคัดลอกจาก Estimate เดิม ระบบจะเปิดหน้า Estimate ให้ทันที",
          en: "Press the create button. When you copy from an earlier estimate, the new one opens at once.",
          jp: "作成ボタンを押します。過去の見積からコピーした場合は、すぐに見積画面が開きます。",
        },
      },
      {
        target: "inquiry.openEstimate",
        action: "click",
        view: "inquiries",
        title: { th: "เปิดประมาณการต้นทุน", en: "Open the estimate", jp: "見積を開く" },
        body: {
          th: "กด 'เปิดประมาณการต้นทุน' เพื่อเข้าไปใส่ต้นทุน",
          en: "Press Open estimate to start adding costs.",
          jp: "「見積を開く」を押して原価を入力します。",
        },
      },
      {
        target: '[data-tab="cost"]',
        action: "click",
        view: "estimates",
        title: { th: "วัสดุและอุปกรณ์", en: "Cost items", jp: "原価明細" },
        body: {
          th: "คลิกแท็บนี้เพื่อใส่รายการวัสดุและอุปกรณ์ จัดเป็นกลุ่มตามโมดูล",
          en: "Click this tab to add materials and equipment, grouped by module.",
          jp: "このタブで材料と機器をモジュールごとに入力します。",
        },
      },
      {
        target: "estimate.addModule",
        action: "next",
        view: "estimates",
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
        target: '[data-tab="manhour"]',
        action: "click",
        view: "estimates",
        title: { th: "ค่าแรง", en: "Labour", jp: "労務費" },
        body: {
          th: "ใส่ man-day ของแต่ละสายงาน ระบบคิดค่าแรงจาก rate ที่ตั้งไว้",
          en: "Enter the man-days for each discipline; the cost comes from the configured rates.",
          jp: "分野ごとに人日を入力します。費用は設定済みの単価から計算されます。",
        },
      },
      {
        target: '[data-tab="other"]',
        action: "click",
        view: "estimates",
        title: { th: "ค่าใช้จ่ายอื่น", en: "Other costs", jp: "その他費用" },
        body: {
          th: "ค่าเดินทาง ที่พัก และค่าใช้จ่ายอื่นของงาน",
          en: "Travel, accommodation and the work's other expenses.",
          jp: "交通費・宿泊費などその他の費用です。",
        },
      },
      {
        target: '[data-tab="validation"]',
        action: "click",
        view: "estimates",
        title: { th: "ตรวจสอบ", en: "Validation", jp: "検証" },
        body: {
          th: "ระบบตรวจสิ่งที่ยังขาด รายการสีแดงต้องแก้ก่อนส่ง สีเหลืองเป็นคำเตือน",
          en: "The system lists what is missing. Red items must be fixed before submitting; amber ones are warnings.",
          jp: "不足をシステムが確認します。赤は提出前に修正が必要、黄色は警告です。",
        },
      },
      {
        target: "estimate.submit",
        action: "click",
        view: "estimates",
        title: { th: "ส่งให้ตรวจสอบ", en: "Submit for review", jp: "レビュー依頼" },
        body: {
          th: "เมื่อไม่มีรายการสีแดง กด 'ส่งให้ตรวจสอบ' ผู้อนุมัติทุกคนจะได้กระดิ่งและอีเมล แถบใต้ขั้นตอนบอกว่ารอใครอนุมัติ ถ้ายังไม่พร้อม กด 'จบบทสอน' แล้วกลับมาส่งทีหลัง",
          en: "With no red items left, press Submit Review: every approver gets a bell and an email, and the line under the steps shows who it waits for. Not ready yet? Press Finish and submit later.",
          jp: "赤い項目がなくなったら「レビュー依頼」を押すと、承認者全員に通知とメールが届き、ステップの下に誰の承認待ちかが表示されます。準備ができていなければ「完了」を押し、後で提出します。",
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
  PROJECT_DELETE,
  PROJECT_COST,
  MY_WEEK_BOOK,
  MY_HOURS,
  VENDOR_HOURS,
  PROJECT_PAGE,
  PROJECT_PLAN,
  PROJECT_MASTER_PLAN,
  PROJECT_ERP_NUMBER,
  PUNCHLIST_ISSUES,
  PUNCHLIST_CLOSE,
  TEAM_TASK,
  TEAM_WEEK,
  ALLOCATION_ASSIGN,
  BOM_RELEASE,
  ESTIMATE_APPROVE,
  ESTIMATE_REVISION_BACK,
  ESTIMATE_HISTORICAL_IMPORT,
  ESTIMATE_LOOK_V2,
  PROJECT_OVERVIEW,
  {
    id: "purchase-request",
    area: "purchase",
    title: { th: "ขอซื้อ (PR) จาก BOM", en: "Raise a purchase requisition from a BOM", jp: "BOMから購買申請を作成" },
    summary: {
      th: "เลือก BOM ของโครงการ พิมพ์หรือวางรายการที่จะซื้อจริง ตรวจยอดกับงบของ Module แล้วส่งให้หัวหน้าแผนกและผู้อนุมัติขั้นสุดท้ายอนุมัติ แล้วส่งเข้า ERP",
      en: "Pick the project's BOM, type or paste what you will really buy, check it against the module budgets, then send it for approval and on to the ERP.",
      jp: "案件のBOMを選び、実際に購入する品を入力または貼り付け、モジュール予算と照合してから承認とERP連携に回します。",
    },
    minutes: 4,
    permissions: ["procurement.request"],
    views: ["purchase"],
    invite: "purchase",
    steps: [
      menu(
        "purchase",
        { th: "เปิดเมนูใบขอซื้อ", en: "Open Purchase Requisition", jp: "「購買申請」を開く" },
        { th: "ใบขอซื้อทุกใบอยู่ที่เมนูนี้ คลิกที่เมนูที่ไฮไลต์อยู่", en: "Every requisition lives here. Click the highlighted menu entry.", jp: "購買申請はすべてここにあります。強調表示のメニューをクリックします。" },
      ),
      {
        target: "pr.new",
        action: "click",
        view: "purchase",
        title: { th: "กด 'สร้าง PR'", en: "Press New PR", jp: "「PRを作成」を押す" },
        body: { th: "ปุ่มนี้เปิดหน้าขอซื้อจาก BOM", en: "It opens the requisition sheet for a BOM.", jp: "BOMから購買申請する画面が開きます。" },
        missing: {
          th: "ถ้าไม่มีปุ่มนี้ แปลว่าบัญชีนี้ยังไม่มีสิทธิ์ขอซื้อ",
          en: "If the button never appears, this account cannot raise requisitions.",
          jp: "ボタンが表示されない場合、このアカウントには申請権限がありません。",
        },
      },
      {
        target: "pr.unit",
        action: "next",
        view: "purchase",
        title: { th: "เลือก Unit (ถ้ามี)", en: "Choose the Unit, if there is one", jp: "Unitを選ぶ（ある場合）" },
        body: {
          th: "ถ้าโครงการแบ่งงบของ Module เป็น Unit ตาม Drawing ไว้ ให้เลือก Unit ที่ใบนี้ซื้อให้ ระบบจะแสดงงบของ Unit ยอดที่ขอซื้อไปแล้ว ยอดของใบนี้ และยอดคงเหลือ ถ้าเกินงบของ Unit ผู้อนุมัติต้องใส่เหตุผล และ discipline ของ Unit กำหนดผู้อนุมัติขั้นแรกด้วย",
          en: "If the project splits a module's budget into Units by drawing, pick the Unit this PR buys for. The sheet then shows the Unit's budget, what was already requested, this PR and what is left. Over the Unit's budget, the approver must give a reason. The Unit's discipline also names the first approver.",
          jp: "案件がモジュール予算を図面ごとのUnitに分けている場合、このPRの対象Unitを選びます。Unitの予算、申請済み額、このPRの額、残額が表示されます。Unit予算を超えると承認者は理由の入力が必要です。Unitの分野によって最初の承認者が決まります。",
        },
        missing: {
          th: "ช่อง Unit ขึ้นเมื่อโครงการมี Unit แล้ว เพิ่ม Unit ได้ในหน้า BOM ของโครงการ (กดเลข BOM ที่แท็บ BOM แล้วกด 'เพิ่ม Unit') ถ้าไม่มี Unit ใบนี้คุมงบตาม Module เหมือนเดิม",
          en: "The Unit field shows once the project has Units. Add them in the project's BOM (press the BOM number on the BOM tab, then Add Unit). With no Units, the PR is held to the module budgets as before.",
          jp: "Unit欄は案件にUnitがあると表示されます。Unitは案件のBOM画面で追加します（BOMタブでBOM番号を押し、「Unitを追加」）。Unitがない場合、PRは従来どおりモジュール予算で管理されます。",
        },
      },
      {
        target: "pr.bom",
        action: "next",
        view: "purchase",
        title: { th: "เลือก BOM", en: "Choose the BOM", jp: "BOMを選ぶ" },
        body: {
          th: "เลือก BOM ที่เผยแพร่แล้วของโครงการ พิมพ์เลข BOM เลขโครงการ หรือชื่อโครงการเพื่อค้นหา ใบนี้จะใช้งบของ Module จาก BOM นั้น และเห็นรายการใน Estimate เป็นข้อมูลอ้างอิง",
          en: "Pick the project's released BOM; type its number, the project's number or name to search. The PR uses its module budgets, and its estimate items show as a reference.",
          jp: "案件のリリース済みBOMを選びます。BOM番号・プロジェクト番号・名称を入力して検索できます。PRはそのモジュール予算を使い、見積の明細が参考として表示されます。",
        },
        missing: {
          th: "ถ้ายังไม่มี BOM ที่เผยแพร่แล้ว ให้ PM เผยแพร่ BOM ที่แท็บ BOM ของหน้านี้ก่อน",
          en: "If no BOM is released yet, ask the PM to release one on the BOM tab of this screen first.",
          jp: "リリース済みBOMがない場合は、先にPMにこの画面の「BOM」タブでリリースしてもらいます。",
        },
      },
      {
        target: "pr.required",
        action: "next",
        view: "purchase",
        title: { th: "วันที่ต้องการและความเร่งด่วน", en: "Required date and priority", jp: "必要日と優先度" },
        body: {
          th: "ใส่วันที่ต้องได้ของ ความเร่งด่วน และวัตถุประสงค์ (เช่น ใช้ที่ไซต์ไหน) ถ้ามีช่องแผนกใน ERP ให้เลือกด้วย",
          en: "Enter when you need the goods, the priority and the purpose (such as which site). Choose the ERP department when it is asked.",
          jp: "必要日、優先度、用途(どの現場か等)を入力します。ERP部門の欄があれば選択します。",
        },
      },
      {
        target: "pr.estimate",
        action: "next",
        view: "purchase",
        title: { th: "รายการใน Estimate", en: "The estimate items", jp: "見積の明細" },
        body: {
          th: "รายการของ Estimate ซ่อนไว้ก่อน กดปุ่มนี้เพื่อแสดงหรือซ่อน ใช้อ้างอิงเท่านั้น ถ้าจะซื้อตามรายการไหน กด 'ดึงมาใช้' ที่รายการนั้น หรือ 'ดึงทั้งหมดที่เหลือ' แล้วพิมพ์ทับเป็นของที่ซื้อจริงได้",
          en: "The estimate's items stay hidden until you press this button, which shows or hides them. They are a reference only. To buy one, press Use on it, or Use all still to buy, then type what you really buy over it.",
          jp: "見積の明細は最初は非表示です。このボタンで表示・非表示を切り替えます。参考用です。購入する明細は「使う」、または「未購入をすべて使う」を押し、実際に購入する品を上書きします。",
        },
        missing: { th: "ปุ่มนี้ขึ้นเมื่อเลือก BOM แล้ว", en: "The button appears once a BOM is chosen.", jp: "BOMを選ぶとボタンが表示されます。" },
      },
      {
        target: "pr.lines",
        action: "next",
        view: "purchase",
        title: { th: "พิมพ์ของที่จะซื้อจริง", en: "Type what you will really buy", jp: "実際に購入する品を入力" },
        body: {
          th: "ตารางเริ่มที่แถวว่างแถวเดียว (หรือรายการที่ติ๊กมาจาก BOM) พิมพ์ Part No. รายละเอียด ยี่ห้อ จำนวน หน่วย และราคาประมาณ แล้วเลือก Module ที่ใช้งบ ราคาในใบนี้เป็นราคาประมาณเพื่อเทียบงบ ราคาจริงฝ่ายจัดซื้อหาใน ERP กด + ท้ายแถวเพื่อแทรกแถวว่างใต้แถวนั้น หรือกด 'เพิ่มแถว' ที่บรรทัดสุดท้ายของตาราง ถ้าไม่ซื้อแถวไหน กดปุ่มถังขยะท้ายแถว",
          en: "The table starts with one empty row (or the lines ticked on the BOM). Type the part number, description, brand, quantity, unit and an approximate price, then choose the module that pays. Prices here are approximate, for checking the budget; Purchasing finds the real price in the ERP. Press + at the end of a row for an empty row under it, or Add row on the table's last line. To drop a row, press the bin at its end.",
          jp: "表は空の行1行（またはBOMで選んだ明細）から始まります。品番、品名、メーカー、数量、単位、概算単価を入力し、予算を使うモジュールを選びます。単価は予算確認用の概算で、実際の価格は購買部がERPで決めます。行末の＋でその下に空の行を追加でき、表の最終行の「行を追加」でも追加できます。不要な行は行末のごみ箱ボタンで削除します。",
        },
        missing: {
          th: "ถ้าลบแถวจนหมด กด 'เพิ่มแถว' 'วางจาก Excel' หรือดึงจากรายการใน Estimate",
          en: "If every row was removed, press Add row or Paste from Excel, or pull from the estimate items.",
          jp: "行をすべて削除した場合は、「行を追加」「Excelから貼り付け」を押すか、見積の明細から取り込みます。",
        },
      },
      {
        target: "pr.paste",
        action: "next",
        view: "purchase",
        title: { th: "กรอกหลายรายการ", en: "Enter many items", jp: "多くの明細を入力" },
        body: {
          th: "ถ้ามีรายการใน Excel อยู่แล้ว คัดลอกแถวมา กด 'วางจาก Excel' แล้วกด Ctrl+V หรือวางลงในช่องของตารางได้เลย รายการที่ตรงกับ Estimate จะผูกกับรายการนั้น ที่เหลือเป็นรายการที่กรอกเอง กด 'เพิ่ม 10 แถว' เพื่อพิมพ์เอง และกด Enter เพื่อลงแถวถัดไป แถวที่ไม่ได้พิมพ์จะไม่ถูกบันทึก",
          en: "If the items are already in Excel, copy the rows, press Paste from Excel and press Ctrl+V, or paste into any cell of the table. Items that match the estimate are tied to their line; the rest are lines you typed in. Press Add 10 rows to type them in, and Enter to move to the next row. Rows left empty are not saved.",
          jp: "Excelに明細がある場合は行をコピーし、「Excelから貼り付け」を押してCtrl+V、または表のセルに直接貼り付けます。見積と一致する品目はその明細に紐づき、残りは手入力の明細になります。手入力は「10行追加」を押し、Enterで次の行へ移ります。空の行は保存されません。",
        },
        missing: { th: "ปุ่มนี้ขึ้นเมื่อเลือก BOM แล้ว", en: "The button appears once a BOM is chosen.", jp: "BOMを選ぶとボタンが表示されます。" },
      },
      {
        target: "pr.import",
        action: "next",
        view: "purchase",
        title: { th: "นำเข้า PR-Form เดิม", en: "Import an existing PR-Form", jp: "既存のPR-Formを取り込む" },
        body: {
          th: "ถ้ารายการอยู่ในไฟล์ PR-Form (Excel) อยู่แล้ว กด 'นำเข้า Excel' แล้วเลือกไฟล์ ระบบหาคอลัมน์จากหัวตาราง อ่านได้ทั้งฟอร์มปี 2025 และ 2026 ไฟล์ที่มีหลาย sheet จะอ่าน sheet ที่ Drawing No. ตรงกับ Unit ที่เลือก รายการที่ยกเลิกไม่ถูกนำเข้า ส่วน Material / Treatment / Detail เก็บไว้ในหมายเหตุ ตรวจรายการก่อนส่งทุกครั้ง",
          en: "If the items are already in a PR-Form workbook, press Import Excel and pick the file. The columns are found by their headings, so the 2025 and the 2026 form both read. Of a workbook with several sheets, the sheet whose Drawing No. matches the chosen Unit is read. Cancelled lines are left out; material, treatment and detail go into the remark. Check the lines before you submit.",
          jp: "明細がPR-Form（Excel）にある場合は「Excel取込」を押してファイルを選びます。列は見出しで判別するため、2025年版と2026年版のどちらも読めます。複数シートのブックでは、選んだUnitの図番と一致するシートを読みます。取消済みの明細は取り込まれず、材質・表面処理・詳細は備考に入ります。申請前に明細を確認してください。",
        },
        missing: { th: "ปุ่มนี้ขึ้นเมื่อเลือก BOM แล้ว", en: "The button appears once a BOM is chosen.", jp: "BOMを選ぶとボタンが表示されます。" },
      },
      {
        target: "pr.form-fields",
        action: "next",
        view: "purchase",
        title: { th: "ช่องแบบ PR-Form", en: "The PR-Form's fields", jp: "PR-Formの項目" },
        body: {
          th: "กด 'ช่อง PR-Form' เพื่อเปิดคอลัมน์ วัสดุ การชุบ/ผิว รายละเอียดเพิ่ม วันที่ต้องการ และ Link แบบหรือใบเสนอราคา ของแต่ละรายการ วันที่ต้องการใส่เมื่อรายการนั้นต้องได้ก่อนวันที่ของใบ ภาพรวม Unit จะไล่ตามวันที่เร็วที่สุด ฝ่ายจัดซื้อเห็นช่องเหล่านี้ใน ERP",
          en: "Press PR-Form fields to show each line's material, treatment, detail, needed-by date and a link to its drawing or quotation. Give a needed-by date when a line is needed before the request's date; the Unit overview chases the earliest one. Purchasing sees these fields in the ERP.",
          jp: "「PR-Form項目」を押すと、各明細の材質・表面処理・詳細・必要日・図面または見積のリンク欄が表示されます。申請日より前に必要な明細には必要日を入れます。Unitの概要は最も早い日付を追います。購買はERPでこれらを確認できます。",
        },
        missing: { th: "ปุ่มนี้ขึ้นเมื่อเลือก BOM แล้ว", en: "The button appears once a BOM is chosen.", jp: "BOMを選ぶとボタンが表示されます。" },
      },
      {
        target: "pr.part",
        action: "next",
        view: "purchase",
        title: { th: "ชิ้นส่วนของรายการบน", en: "Parts of a line", jp: "上の行の部品" },
        body: {
          th: "เหมือนใน PR-Form รายการหนึ่งเป็นชิ้นส่วนของรายการด้านบนได้ เช่น valve ใต้ manifold กดปุ่มกิ่งท้ายแถว แถวจะเยื้องเข้าและบอกว่าเป็นส่วนของรายการไหน กดอีกครั้งเพื่อแยกออก ชิ้นส่วนยังมีจำนวนและราคาของตัวเองและถูกซื้อตามปกติ ชิ้นส่วนมีชิ้นส่วนซ้อนอีกไม่ได้",
          en: "As on the PR-Form, a line can be a part of the line above it, such as valves under their manifold. Press the branch button at the end of the row: the row indents and says which line it belongs to. Press it again to make it a line of its own. A part keeps its own quantity and price and is bought like any other line; a part cannot have parts.",
          jp: "PR-Formと同様に、明細を上の行の部品にできます（例：マニホールドの下のバルブ）。行末の分岐ボタンを押すと行が字下げされ、どの行の部品かが表示されます。もう一度押すと独立した行に戻ります。部品にも数量と価格があり通常どおり購入されます。部品の下に部品は付けられません。",
        },
        missing: { th: "ปุ่มนี้อยู่ท้ายแต่ละแถว เพิ่มแถวก่อน", en: "The button is at the end of every row; add a row first.", jp: "ボタンは各行の末尾にあります。先に行を追加してください。" },
      },
      {
        target: "pr.summary",
        action: "next",
        view: "purchase",
        title: { th: "ตรวจยอดและผู้อนุมัติ", en: "Check the total and approvers", jp: "合計と承認者を確認" },
        body: {
          th: "แถบขั้นตอนบนสุดของใบบอกจำนวนรายการ แถวที่ต้องแก้ ผู้อนุมัติตามลำดับ และยอดขอซื้อ ขั้นที่เป็นสีแดงต้องแก้ก่อนส่ง ดูยอดขอซื้อ (ราคาประมาณ) เทียบงบของ Module แถวที่มีข้อความสีแดงต้องแก้ก่อนส่ง เช่น ยังไม่ได้เลือก Module ถ้า Module เกินงบ ผู้อนุมัติต้องใส่เหตุผลตอนอนุมัติ",
          en: "The steps on top of the sheet show the lines, the rows to fix, the approvers in turn and the total; a red step must be fixed before sending. Compare the total (at approximate prices) with the module budgets. Rows with red text must be fixed first, such as a row with no module yet. Over a module's budget, the approver gives a reason.",
          jp: "上部のステップ表示で、明細数・修正が必要な行・承認者の順番・申請額を確認できます。赤いステップは送信前に修正します。申請額（概算単価）をモジュール予算と比べます。赤字の行（モジュール未選択など）は先に修正します。予算超過の場合、承認者が承認時に理由を記入します。",
        },
      },
      {
        target: "pr.approvers",
        action: "next",
        view: "purchase",
        title: { th: "ใครอนุมัติ", en: "Who approves", jp: "承認者" },
        body: {
          th: "ช่องผู้อนุมัติบอกว่าใบนี้ไปให้หัวหน้าแผนกของคุณก่อน แล้วไปที่ผู้อนุมัติขั้นสุดท้าย จากนั้นระบบส่งเข้า ERP เอง ทุกครั้งที่มีคนอนุมัติหรือไม่อนุมัติ คุณได้แจ้งเตือนที่กระดิ่งและทางอีเมล",
          en: "The approvers box shows the PR goes to your department head first, then to the final approver, then to the ERP by itself. Each time someone approves or rejects it, you get a notification and an email.",
          jp: "承認者欄のとおり、まず部門長、次に最終承認者が承認し、その後自動でERPに送られます。承認・却下のたびに通知とメールが届きます。",
        },
      },
      {
        target: "pr.over-reason",
        action: "next",
        view: "purchase",
        title: { th: "ถ้าเกินงบ ใส่เหตุผล", en: "Over budget? Give the reason", jp: "予算超過なら理由を入力" },
        body: {
          th: "เมื่อยอดของใบนี้เกินงบของ Unit หรือของ Module ช่องนี้จะขึ้นมา พิมพ์เหตุผลให้ผู้อนุมัติอ่าน เช่น ราคาขึ้นจากตอนประเมิน ถ้ายังไม่ใส่ จะกด 'ส่งขออนุมัติ' ไม่ได้ แต่บันทึกร่างได้",
          en: "When this PR takes its Unit or a Module over budget, this box appears. Type the reason for the approvers, for example that the price rose since the estimate. Without it, Submit for approval stays off; Save Draft still works.",
          jp: "このPRがUnitまたはモジュールの予算を超えると、この欄が表示されます。承認者が読む理由（見積時より価格が上がった等）を入力します。未入力では「承認申請」は押せませんが、下書き保存はできます。",
        },
        missing: {
          th: "ช่องนี้ขึ้นเฉพาะเมื่อใบนี้เกินงบ ถ้าอยู่ในงบ ไม่ต้องใส่อะไร",
          en: "The box shows only when this PR is over budget. Within budget there is nothing to fill in.",
          jp: "この欄は予算超過のときだけ表示されます。予算内であれば入力は不要です。",
        },
      },
      {
        target: "pr.submit",
        action: "click",
        view: "purchase",
        title: { th: "ส่งขออนุมัติ", en: "Submit for approval", jp: "承認申請" },
        body: {
          th: "กด 'ส่งขออนุมัติ' ระบบบันทึกและส่งใบนี้ให้หัวหน้าแผนกและผู้อนุมัติขั้นสุดท้ายในครั้งเดียว แล้วส่งเข้า ERP อัตโนมัติ ถ้ายังไม่พร้อม กด 'บันทึกร่าง' ไว้ก่อน ถ้าแค่ฝึก ให้กด 'ยกเลิก' แล้วกด 'จบบทสอน'",
          en: "Press Submit for approval: the PR is saved and sent to your department head and the final approver in one step, then to the ERP automatically. Not ready yet? Press Save Draft. Only practising? Press Cancel, then Finish.",
          jp: "「承認申請」を押すと、PRの保存と部門長・最終承認者への送信が一度に行われ、その後自動でERPに送られます。まだ準備中なら「下書き保存」を押します。練習だけなら「キャンセル」を押してから「完了」を押します。",
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
      menu(
        "my-work",
        { th: "เปิดงานของฉัน", en: "Open My Work", jp: "「マイワーク」を開く" },
        {
          th: "หน้านี้รวมทุกงานที่คุณรับผิดชอบจากทุกโครงการ คลิกที่เมนูที่ไฮไลต์อยู่",
          en: "It gathers everything you are responsible for across projects. Click the highlighted menu entry.",
          jp: "全案件の担当作業がまとまっています。強調表示のメニューをクリックします。",
        },
      ),
      {
        target: '[data-tab="assigned"]',
        action: "click",
        view: "my-work",
        title: { th: "งานที่ได้รับ", en: "Assigned to me", jp: "担当作業" },
        body: {
          th: "กดแท็บ 'งานที่ได้รับ' ข้างในมีงานที่กำลังทำ งานมอบหมายใหม่ และลำดับงานของคุณ",
          en: "Press the Assigned to me tab. It holds your active work, new assignments and your work order.",
          jp: "「担当作業」タブを押します。進行中の作業・新しい割り当て・作業順が入っています。",
        },
      },
      {
        target: '[data-tab="new"]',
        action: "click",
        view: "my-work",
        title: { th: "งานมอบหมายใหม่", en: "New assignments", jp: "新しい割り当て" },
        body: {
          th: "งานที่เพิ่งได้รับมอบหมายอยู่ที่แท็บนี้ เปิดดูแล้วกด 'รับทราบ' เพื่อยืนยันว่ารับงานแล้ว PM จะเห็นทันที",
          en: "Work just assigned to you is here. Open it and press Acknowledge to confirm you have taken it on; the PM sees it at once.",
          jp: "新しく割り当てられた作業はこのタブにあります。開いて「確認する」を押すとPMにすぐ伝わります。",
        },
      },
      {
        target: '[data-tab="active"]',
        action: "click",
        view: "my-work",
        title: { th: "งานที่กำลังรับผิดชอบ", en: "My active work", jp: "進行中の自分の作業" },
        body: {
          th: "งานที่รับแล้วจัดกลุ่มตามโครงการ งานที่เลยกำหนดขึ้นก่อน",
          en: "Work you have taken on, grouped by project, the late ones first.",
          jp: "受領済みの作業が案件ごとに並び、遅れているものが先に表示されます。",
        },
      },
      {
        target: "work.newCard",
        action: "next",
        view: "my-work",
        title: { th: "งานใหม่รอรับทราบ", en: "New work to acknowledge", jp: "了承待ちの新しい作業" },
        body: {
          th: "เมื่อหัวหน้ามอบงานใหม่ แถบนี้ขึ้นเหนือทุกแท็บ กด 'ดูและรับทราบ' เพื่อดูวันและชั่วโมงของแต่ละงานแล้วกด รับทราบ บนมือถือแท็บหลักอยู่ด้านล่าง และปุ่มยืนยันชั่วโมงของวันอยู่ติดล่างจอ",
          en: "When your lead assigns new work, this bar shows above every tab. Press See and acknowledge to check each task's dates and hours, then press Acknowledge. On a phone the main tabs sit at the bottom and the day's Confirm button stays at the foot of the screen.",
          jp: "リーダーが新しい作業を割り当てると、このバーがすべてのタブの上に表示されます。「確認して了承」を押して各作業の日付と時間を確認し、「了承」を押します。スマートフォンではメインタブが下にあり、その日の確定ボタンは画面下に固定されます。",
        },
        missing: { th: "ตอนนี้ไม่มีงานใหม่รอรับทราบ กด 'ถัดไป'", en: "No new work waits right now. Press Next.", jp: "今は了承待ちの作業がありません。「次へ」を押します。" },
      },
      {
        target: "work.summary",
        action: "next",
        view: "my-work",
        title: { th: "แถบสรุปคือตัวกรอง", en: "The summary bar is the filter", jp: "サマリーバーで絞り込む" },
        body: {
          th: "แต่ละช่องนับงานของคุณ: งานเปิดทั้งหมด เลยกำหนด ติดปัญหา ต้องอัปเดต ครบกำหนดสัปดาห์นี้ และรอ PM กดช่องไหนรายการด้านล่างจะเหลือเฉพาะงานนั้น ส่วนแหล่งงาน โครงการ การเรียง และช่องค้นหาอยู่ในแถวเดียวกันเหนือรายการ",
          en: "Each cell counts your work: all open, late, blocked, needs update, due this week and awaiting the PM. Press one and the list below keeps only that work. Source, project, sort and search sit in one row above the list.",
          jp: "各セルが作業数です：未完了すべて、遅延、ブロック、要更新、今週期限、PM待ち。押すと下の一覧がその作業だけになります。種類・案件・並べ替え・検索は一覧の上の1行にあります。",
        },
      },
      {
        target: "work.group",
        action: "next",
        view: "my-work",
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
        target: "work.percent",
        action: "next",
        view: "my-work",
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
        target: "work.status",
        action: "next",
        view: "my-work",
        title: { th: "เปลี่ยนสถานะ", en: "Change the status", jp: "ステータスを変更" },
        body: {
          th: "เลือก 'กำลังทำ' 'ติดปัญหา' หรือ 'เสร็จแล้ว' ถ้าเลือก 'ติดปัญหา' ต้องบอกว่าติดอะไร PM จะเห็นและช่วยแก้",
          en: "Choose In Progress, Blocked or Done. Blocked asks what is in the way, so the PM can help.",
          jp: "「進行中」「ブロック」「完了」を選びます。ブロックでは理由を入力し、PMが対応できます。",
        },
      },
      {
        target: "work.details",
        action: "next",
        view: "my-work",
        title: { th: "อัปเดตรายละเอียด", en: "Update details", jp: "詳細を更新" },
        body: {
          th: "ใส่วันเริ่มและเสร็จจริง วันที่คาดว่าจะเสร็จ และบันทึกถึง PM ถ้างานจะเลยกำหนด ใช้ 'ขอวันเพิ่ม' ในเมนู ⋯ ของงาน",
          en: "Record the actual start and finish, a forecast finish and a note for the PM. If it will run late, use Request more days in the task's ⋯ menu.",
          jp: "実績の開始・完了日、完了予測日、PMへのメモを入力します。遅れそうなら作業の⋯メニューから「日数追加を申請」します。",
        },
      },
      {
        target: '[data-tab="updates"]',
        action: "click",
        view: "my-work",
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
  FLEET_SCRIPT,
  COMMAND_CENTER,
  ASSET_REGISTER,
  ERP_MASTER_DATA,
  LIST_COLUMN_FILTER,
  MENU_FAVORITES,
  {
    id: "support-ticket",
    area: "tools",
    title: { th: "แจ้งปัญหาการใช้งาน", en: "Report a problem", jp: "問題を報告" },
    summary: {
      th: "แจ้งปัญหาหรือข้อเสนอแนะพร้อมรูปหน้าจอ แล้วติดตามคำตอบได้ที่ 'แจ้งปัญหาและติดตาม' ในปุ่ม ? บนแถบด้านบน",
      en: "Report a problem or suggestion with a screenshot, then follow the answer under Report & Track Issues in the ? menu of the top bar.",
      jp: "スクリーンショット付きで問題や提案を報告し、上部バーの「?」メニューにある「問題の報告と追跡」で回答を確認します。",
    },
    minutes: 2,
    permissions: [],
    views: ["support"],
    invite: "support",
    steps: [
      {
        target: "nav.help",
        action: "next",
        view: "support",
        title: { th: "ปุ่ม ? ช่วยเหลือ", en: "The ? help button", jp: "「?」ヘルプボタン" },
        body: {
          th: "ปุ่ม ? บนแถบด้านบนรวมเรื่องช่วยเหลือไว้ที่เดียว: คู่มือพนักงาน สอนการใช้งาน แจ้งปัญหาและติดตาม และศูนย์ดาวน์โหลด คู่มือพนักงานและแจ้งปัญหาและติดตามเคยอยู่ในเมนูด้านซ้าย",
          en: "The ? button in the top bar holds the help in one place: Employee Manual, How-to guides, Report & Track Issues and Download Center. The manual and the issue list used to sit in the side menu.",
          jp: "上部バーの「?」ボタンにヘルプがまとまっています:従業員マニュアル、使い方ガイド、問題の報告と追跡、ダウンロードセンター。マニュアルと問題一覧は以前は左メニューにありました。",
        },
      },
      {
        target: "topbar.report",
        action: "click",
        view: "support",
        title: { th: "กด 'แจ้งปัญหา'", en: "Press Report a problem", jp: "「問題を報告」を押す" },
        body: {
          th: "ปุ่มอยู่ที่แถบด้านบนของทุกหน้า ระบบแนบชื่อหน้าที่คุณเปิดอยู่ให้เอง จึงควรกดจากหน้าที่เจอปัญหา",
          en: "It is in the top bar on every screen and records which screen you are on, so press it where the problem happens.",
          jp: "全画面の上部バーにあり、開いている画面名が自動で添付されます。問題が起きた画面から押します。",
        },
      },
      {
        target: "support.subject",
        action: "next",
        view: "support",
        title: { th: "หัวข้อ", en: "Subject", jp: "件名" },
        body: {
          th: "ช่องแรกของฟอร์ม: สั้นๆ ว่าเกิดอะไร เช่น 'กดบันทึก PR แล้วขึ้น error' อย่างน้อย 5 ตัวอักษร",
          en: "The first field: a short line on what happened, e.g. 'Saving a PR shows an error'. At least 5 characters.",
          jp: "最初の項目です。何が起きたかを短く書きます(例:「PR保存時にエラー」)。5文字以上です。",
        },
      },
      {
        target: "support.kind",
        action: "next",
        view: "support",
        title: { th: "ประเภทและผลกระทบ", en: "Category and impact", jp: "カテゴリと影響" },
        body: {
          th: "เลือกว่าเป็นเรื่องของแอปหรือเรื่องอื่น และกระทบงานแค่ไหน ยังทำงานได้ ติดบางส่วน หรือทำงานไม่ได้",
          en: "Say whether it is about the app or something else, and how much it affects your work.",
          jp: "アプリに関することかその他か、業務への影響の大きさを選びます。",
        },
      },
      {
        target: "support.description",
        action: "next",
        view: "support",
        title: { th: "รายละเอียด", en: "Description", jp: "詳細" },
        body: {
          th: "เล่าว่ากำลังทำอะไร เห็นอะไร และควรเป็นอย่างไร ยิ่งละเอียดยิ่งแก้ได้เร็ว",
          en: "What you were doing, what you saw and what you expected. The more detail, the faster the fix.",
          jp: "何をしていて、何が表示され、本来どうなるべきかを書きます。詳しいほど早く解決できます。",
        },
      },
      {
        target: "support.attach",
        action: "next",
        view: "support",
        title: { th: "แนบรูปหน้าจอ", en: "Attach a screenshot", jp: "スクリーンショットを添付" },
        body: {
          th: "กดกรอบเส้นประเพื่อเลือกรูป (PNG, JPG) หรือ PDF เลือกเพิ่มได้หลายครั้งรวมสูงสุด 5 ไฟล์ ไฟล์ละไม่เกิน 10 MB กด X ที่ไฟล์เพื่อนำออก",
          en: "Press the dashed box to choose images (PNG, JPG) or PDFs. You can add more in several goes, up to 5 files of 10 MB each; X takes a file out.",
          jp: "点線の枠を押して画像(PNG・JPG)またはPDFを選びます。何回かに分けて追加でき、合計5件・各10MBまでです。×でファイルを外せます。",
        },
      },
      {
        target: "support.submit",
        action: "click",
        view: "support",
        title: { th: "ส่งเรื่อง", en: "Send it", jp: "報告を送信" },
        body: {
          th: "กด 'ส่งเรื่อง' ทีมจะตอบกลับและคุณจะได้รับแจ้งเตือน ติดตามได้ที่ปุ่ม ? บนแถบด้านบน > 'แจ้งปัญหาและติดตาม' ถ้าแค่ฝึก ให้กด 'ปิด' แล้วกด 'จบบทสอน'",
          en: "Press Submit ticket. The team answers and you are notified; follow it under the ? button in the top bar > Report & Track Issues. Only practising? Press Close, then Finish.",
          jp: "「報告を送信」を押すとチームが回答し、通知が届きます。上部バーの「?」>「問題の報告と追跡」で確認できます。練習だけなら「閉じる」を押してから「完了」を押します。",
        },
      },
    ],
  },
  {
    id: "support-follow",
    area: "tools",
    title: { th: "ติดตามเรื่องที่แจ้ง", en: "Follow your tickets", jp: "報告の状況を確認" },
    summary: {
      th: "เปิด 'แจ้งปัญหาและติดตาม' ดูว่าเรื่องไหนยังเปิดอยู่หรือรอคุณตอบ กดช่องสถานะเพื่อกรอง แล้วเปิดเรื่องเพื่อตอบหรือยืนยันปิดเรื่อง",
      en: "Open Report & Track Issues, see which tickets are open or wait for your answer, press a status cell to filter, and open a ticket to reply or confirm it is fixed.",
      jp: "「問題の報告と追跡」を開き、未完了や回答待ちの報告を確認します。状態の欄を押して絞り込み、報告を開いて返信や完了の確認をします。",
    },
    minutes: 2,
    permissions: [],
    views: ["support"],
    browse: true,
    steps: [
      {
        target: "nav.help",
        action: "click",
        view: "support",
        title: { th: "กดปุ่ม ?", en: "Press the ? button", jp: "「?」ボタンを押す" },
        body: {
          th: "ปุ่ม ? บนแถบด้านบนรวมเรื่องช่วยเหลือไว้ รวมถึงรายการเรื่องที่คุณแจ้ง",
          en: "The ? button in the top bar holds the help, including the tickets you reported.",
          jp: "上部バーの「?」ボタンにヘルプがまとまっており、自分の報告一覧もここにあります。",
        },
      },
      {
        target: "nav.support",
        action: "click",
        view: "support",
        title: { th: "เปิด 'แจ้งปัญหาและติดตาม'", en: "Open Report & Track Issues", jp: "「問題の報告と追跡」を開く" },
        body: {
          th: "หน้านี้มีทุกเรื่องที่คุณแจ้ง พร้อมสถานะและคำตอบจากทีม",
          en: "This screen has every ticket you reported, with its status and the team's answers.",
          jp: "自分が報告したすべての報告と、その状態・チームの回答が表示されます。",
        },
      },
      {
        target: "support.tabs",
        action: "next",
        view: "support",
        title: { th: "รายการของฉัน และคิวผู้ดูแล", en: "My tickets and the support queue", jp: "自分の報告と対応待ち一覧" },
        body: {
          th: "'รายการของฉัน' คือเรื่องที่คุณแจ้ง ผู้ดูแลจะเห็น 'คิวผู้ดูแล' เพิ่ม ส่วน 'คะแนนขอบคุณของฉัน' คือคะแนนที่ทีมมอบให้คุณ",
          en: "My tickets are the ones you reported. Support members also see the Support queue; My contribution points lists the thanks the team gave you.",
          jp: "「自分の報告」は自分が報告したものです。担当者には「対応待ち一覧」も表示されます。「自分の貢献ポイント」はチームから届いた感謝です。",
        },
      },
      {
        target: "support.summary",
        action: "next",
        view: "support",
        title: { th: "แถบสถานะคือตัวกรอง", en: "The status bar is the filter", jp: "状態バーで絞り込む" },
        body: {
          th: "แต่ละช่องนับเรื่องในสถานะนั้นตามคำค้นและตัวกรองที่เลือก กดช่องเพื่อแสดงเฉพาะเรื่องเหล่านั้น 'รอข้อมูลจากผู้แจ้ง' คือทีมรอคำตอบจากคุณ",
          en: "Each cell counts the tickets in that state for your search and filters; press one to show only those. Waiting for reporter means the team needs your answer.",
          jp: "各欄は検索・絞り込みに合う報告をその状態ごとに数えます。押すとその報告だけを表示します。「報告者の回答待ち」はチームがあなたの回答を待っています。",
        },
      },
      {
        target: "support.list",
        action: "next",
        view: "support",
        title: { th: "เปิดเรื่อง", en: "Open a ticket", jp: "報告を開く" },
        body: {
          th: "กดเลขเรื่องหรือแถวเพื่อเปิด ในเรื่องนั้นปุ่มสีน้ำเงินคือขั้นถัดไป เช่น 'ยืนยันปิดเรื่อง' หรือ 'รับเรื่องนี้' งานอื่นอยู่ใต้ 'การทำงานอื่น' ตอบทีมได้ที่ช่องตอบด้านล่างการสนทนา",
          en: "Press the ticket no. or the row to open it. On the ticket the blue button is the next step, such as Confirm closure or Take this ticket; the rest is under More actions. Answer the team in the reply box under the conversation.",
          jp: "報告番号または行を押して開きます。報告内の青いボタンが次の手順(「完了を確認」「担当として受け付ける」など)で、その他は「その他の操作」にあります。チームへの返信は会話の下の欄に入力します。",
        },
        missing: {
          th: "ยังไม่มีเรื่องในรายการนี้ กดช่อง 'ทั้งหมด' ในแถบสถานะ หรือแจ้งปัญหาก่อน",
          en: "There is no ticket in this list yet. Press All in the status bar, or report a problem first.",
          jp: "この一覧にはまだ報告がありません。状態バーの「すべて」を押すか、先に問題を報告してください。",
        },
      },
      {
        target: "support.rows",
        action: "next",
        view: "support",
        title: { th: "จำนวนแถวต่อหน้า", en: "Rows per page", jp: "1ページあたりの行数" },
        body: {
          th: "ใต้ตาราง เลือกแสดง 10, 25, 50 หรือ 100 แถวต่อหน้า ระบบจำค่าที่เลือกไว้ในเครื่องนี้ เรื่องที่เหลือดูได้ด้วยปุ่มเลขหน้า",
          en: "Under the table, show 10, 25, 50 or 100 rows a page. The choice is kept on this device; the page buttons show the rest.",
          jp: "表の下で1ページに10・25・50・100行から選べます。選んだ値はこの端末に保存され、残りはページボタンで表示します。",
        },
        missing: {
          th: "ตัวเลือกนี้จะแสดงเมื่อรายการมีเรื่องอย่างน้อยหนึ่งเรื่อง",
          en: "This appears once the list has at least one ticket.",
          jp: "一覧に報告が1件以上あると表示されます。",
        },
      },
    ],
  },
  USER_ROLE,
  KPI_REVIEW,
];

export const guideText = (copy: GuideCopy, lang: "TH" | "EN" | "JP") => (lang === "TH" ? copy.th : lang === "JP" ? copy.jp : copy.en);

/** The guides a person can do: every permission the task needs, or the duty that stands in for them, in catalog order. */
export const guidesFor = (permissions: readonly string[], duties: readonly GuideDuty[] = []) =>
  GUIDES.filter((guide) => guide.permissions.every((code) => permissions.includes(code)) || (guide.orDuty !== undefined && duties.includes(guide.orDuty)));

/** A data-guide name as a selector; a target that is already a selector (starts with "[") is used as it is. */
export const guideSelector = (target: string) => (target.startsWith("[") ? target : `[data-guide="${target.replace(/["\\]/g, "\\$&")}"]`);
