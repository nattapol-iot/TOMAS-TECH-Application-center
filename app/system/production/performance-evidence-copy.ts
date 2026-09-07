/** Translate only system-generated KPI evidence prose. Names and identifiers remain untouched. */
const COPY: Record<string, {th:string;jp:string}> = {
  "Open source": {th:"เปิดรายการอ้างอิง",jp:"参照元を開く"},
  "Milestones, due tasks and delivery outcomes": {th:"จุดส่งมอบ งานที่ถึงกำหนด และผลการส่งมอบ",jp:"マイルストーン、期限対象タスク、納入結果"},
  "Customer issues, rework and verification outcomes": {th:"ปัญหาลูกค้า งานแก้ไข และผลการตรวจสอบ",jp:"顧客課題、手直し、検証結果"},
  "Completed technical work and reusable solutions": {th:"งานเทคนิคที่เสร็จแล้วและแนวทางที่นำกลับมาใช้ได้",jp:"完了した技術作業と再利用できるソリューション"},
  "Project participation, Inquiry ownership and collaboration": {th:"การมีส่วนร่วมในโครงการ การรับผิดชอบงานสอบถามราคา และการทำงานร่วมกัน",jp:"プロジェクトへの参加、引合の担当、協働"},
  "Assigned tasks": {th:"งานที่มอบหมาย",jp:"担当タスク"},
  "Assigned work": {th:"งานที่ได้รับมอบหมาย",jp:"担当作業"},
  "Schedule Member": {th:"สมาชิกในแผนงาน",jp:"工程計画のメンバー"},
  "Development": {th:"กำลังพัฒนา",jp:"開発中"},
  "Closed": {th:"ปิดแล้ว",jp:"終了"},
  "Performance period": {th:"รอบการประเมิน",jp:"評価期間"},
  "Reviews due": {th:"กำหนดส่งการประเมิน",jp:"評価提出期限"},
  "No assigned customer-issue tasks were found; quality should be assessed from review and rework evidence.": {th:"ไม่พบงานแก้ปัญหาลูกค้าที่มอบหมาย ควรประเมินคุณภาพจากหลักฐานการตรวจทานและงานแก้ไข",jp:"担当した顧客課題タスクがありません。レビューと手直しの証拠から品質を評価してください。"},
  "No completed assigned tasks were found in the selected cycle.": {th:"ไม่พบงานที่มอบหมายและเสร็จแล้วในรอบนี้",jp:"この評価期間に完了した担当タスクがありません。"},
  "No dated pre-outcome probability snapshot is available; manager judgement is required": {th:"ไม่มีข้อมูลโอกาสสำเร็จที่บันทึกไว้ก่อนทราบผล ผู้จัดการต้องพิจารณาจากบริบท",jp:"結果判明前の確度記録がないため、管理職による判断が必要です。"},
  "Approved opportunity transferred to an active Project record": {th:"งานที่อนุมัติแล้วเชื่อมกับโครงการที่ใช้งานอยู่",jp:"承認済み案件が有効なプロジェクトに引き継がれています"},
  "Suggestions use assigned work due within the cycle. They are decision support only; managers confirm impact, complexity and context.": {th:"ข้อเสนอแนะใช้ข้อมูลงานที่มอบหมายและถึงกำหนดในรอบนี้ เพื่อประกอบการตัดสินใจ ผู้จัดการต้องพิจารณาผลลัพธ์ ความซับซ้อน และบริบท",jp:"提案は評価期間内に期限を迎えた担当作業に基づく判断材料です。管理職が成果、複雑さ、背景を確認します。"},
  "Sales signals use owned inquiries, recorded customer meetings, estimate outcomes and Project handovers in the cycle. These are current records selected by cycle dates, not historical snapshots. Estimate values are recorded costs, not booked sales or margin. They are decision support only; managers confirm targets, margin, complexity and customer context.": {th:"ใช้ข้อมูลงานสอบถามราคา การพบลูกค้า ผลประมาณการ และการส่งต่อโครงการในรอบนี้ ข้อมูลเป็นสถานะปัจจุบันตามช่วงวันที่ ไม่ใช่ภาพย้อนหลัง ยอดประมาณการเป็นต้นทุนที่บันทึก ไม่ใช่ยอดขายหรือกำไร ผู้จัดการต้องพิจารณาเป้าหมาย กำไร ความซับซ้อน และบริบทลูกค้าก่อนให้คะแนน",jp:"評価期間内の担当引合、顧客打合せ、見積結果、プロジェクト引継ぎを参照します。対象期間で抽出した現在の記録であり、過去時点の保存記録ではありません。見積金額は記録された原価で、売上や利益ではありません。管理職が目標、利益、複雑さ、顧客の状況を考慮して評価します。"},
};
type Rule = [RegExp, (m:RegExpMatchArray)=>string, (m:RegExpMatchArray)=>string];
const RULES: Rule[] = [
  [/^(\d+) of (\d+) due tasks completed$/, m=>`งานที่ถึงกำหนดเสร็จ ${m[1]} จาก ${m[2]} รายการ`, m=>`期限対象タスク${m[2]}件中${m[1]}件が完了`],
  [/^(\d+) completed on time · (\d+) overdue as of (\d{4}-\d{2}-\d{2})$/, m=>`เสร็จตรงเวลา ${m[1]} รายการ · เกินกำหนด ${m[2]} รายการ ณ ${m[3]}`, m=>`期限内完了${m[1]}件・期限超過${m[2]}件（${m[3]}時点）`],
  [/^Overdue since (\d{4}-\d{2}-\d{2})( · .+)?$/, m=>`เกินกำหนดตั้งแต่ ${m[1]}${m[2] ?? ""}`, m=>`${m[1]}から期限超過${m[2] ?? ""}`],
  [/^(\d+)\/(\d+) due assigned tasks completed; (\d+) on time; (\d+) overdue as of (.+)\.$/, m=>`งานที่ถึงกำหนดเสร็จ ${m[1]}/${m[2]} รายการ ตรงเวลา ${m[3]} รายการ เกินกำหนด ${m[4]} รายการ ณ ${m[5]}`, m=>`期限対象の担当タスク完了 ${m[1]}/${m[2]}件、期限内 ${m[3]}件、期限超過 ${m[4]}件（${m[5]}時点）`],
  [/^No due assigned tasks were found for (.+); manager context is required\.$/, m=>`ไม่พบงานที่มอบหมายและถึงกำหนดในรอบ ${m[1]} ผู้จัดการต้องพิจารณาบริบท`, m=>`${m[1]}に期限対象の担当タスクがありません。管理職による背景確認が必要です。`],
  [/^(\d+)\/(\d+) assigned customer-issue tasks closed during the cycle\.$/,m=>`ปิดงานแก้ปัญหาลูกค้าที่มอบหมาย ${m[1]}/${m[2]} รายการในรอบนี้`,m=>`評価期間中に担当顧客課題 ${m[1]}/${m[2]}件を完了`],
  [/^(\d+) assigned tasks completed across (\d+) projects and (\d+) inquiries\.$/,m=>`งานที่มอบหมายเสร็จ ${m[1]} รายการ จาก ${m[2]} โครงการและ ${m[3]} งานสอบถามราคา`,m=>`${m[2]}プロジェクトと${m[3]}引合で担当タスク${m[1]}件を完了`],
  [/^(\d+) projects? and (\d+) inquir(?:y|ies) with recorded ownership or participation\.$/,m=>`บันทึกการรับผิดชอบหรือมีส่วนร่วมใน ${m[1]} โครงการและ ${m[2]} งานสอบถามราคา`,m=>`${m[1]}プロジェクトと${m[2]}引合に担当・参加の記録あり`],
  [/^(\d+) active opportunities; (\d+) approved; weighted recorded pipeline THB ([\d,.]+)\.$/,m=>`งานที่กำลังติดตาม ${m[1]} งาน อนุมัติแล้ว ${m[2]} งาน มูลค่าต้นทุนถ่วงน้ำหนัก ${m[3]} บาท`,m=>`進行中${m[1]}案件、承認済み${m[2]}案件、加重した記録原価 THB ${m[3]}`],
  [/^(\d+) customer meetings owned or recorded across (\d+) inquiries\.$/,m=>`รับผิดชอบหรือบันทึกการพบลูกค้า ${m[1]} ครั้ง ใน ${m[2]} งานสอบถามราคา`,m=>`${m[2]}引合で担当・記録した顧客打合せ${m[1]}回`],
  [/^(\d+) closed opportunities\. Current probabilities are not historical forecasts; no numeric probability calibration accuracy is assigned without dated pre-outcome snapshots\.$/,m=>`ปิดงานแล้ว ${m[1]} งาน ค่าโอกาสสำเร็จปัจจุบันไม่ใช่ค่าพยากรณ์ย้อนหลัง จึงไม่ให้คะแนนความแม่นยำหากไม่มีข้อมูลที่บันทึกก่อนทราบผล`,m=>`終了済み${m[1]}案件。現在の確度は過去の予測ではありません。結果判明前の日時付き記録がないため、予測精度の数値評価は行いません。`],
  [/^(\d+)\/(\d+) recorded estimates approved or locked; THB ([\d,.]+) approved of THB ([\d,.]+) recorded\.$/,m=>`ประมาณการอนุมัติหรือล็อกแล้ว ${m[1]}/${m[2]} รายการ ต้นทุนที่อนุมัติ ${m[3]} บาท จากที่บันทึก ${m[4]} บาท`,m=>`記録された見積${m[1]}/${m[2]}件が承認・ロック済み。承認原価 THB ${m[3]}／記録原価 THB ${m[4]}`],
  [/^(\d+)\/(\d+) approved opportunities linked to Project records\.$/,m=>`งานที่อนุมัติแล้ว ${m[1]}/${m[2]} งานเชื่อมกับโครงการ`,m=>`承認済み案件${m[1]}/${m[2]}件がプロジェクトに紐付き済み`],
  [/^(\d+) customer meetings? owned or recorded$/,m=>`รับผิดชอบหรือบันทึกการพบลูกค้า ${m[1]} ครั้ง`,m=>`担当・記録した顧客打合せ${m[1]}回`],
  [/^Approved estimate · THB ([\d,.]+)$/,m=>`ประมาณการที่อนุมัติ · ${m[1]} บาท`,m=>`承認済み見積・THB ${m[1]}`],
  [/^(\d+) approved · (\d+) cancelled$/,m=>`อนุมัติ ${m[1]} งาน · ยกเลิก ${m[2]} งาน`,m=>`承認済み${m[1]}件・取消${m[2]}件`],
  [/^(\d+) of (\d+) customer issues closed$/,m=>`ปิดปัญหาลูกค้า ${m[1]} จาก ${m[2]} รายการ`,m=>`顧客課題${m[2]}件中${m[1]}件を完了`],
  [/^(\d+) remain open in the selected cycle$/,m=>`ยังค้าง ${m[1]} รายการในรอบนี้`,m=>`この評価期間に未完了${m[1]}件`],
];
export function performanceEvidenceText(value:string, lang:"TH"|"EN"|"JP", fallback:(value:string)=>string = value=>value):string {
  if (lang === "EN") return value;
  const entry = COPY[value]; if(entry) return lang === "TH" ? entry.th : entry.jp;
  for(const [pattern,th,jp] of RULES){const match=value.match(pattern);if(match)return (lang === "TH" ? th : jp)(match);}
  const pipeline = value.match(/^(.+) · (\d+)% probability · grade ([A-D])$/);
  if (pipeline) return lang === "TH" ? `${fallback(pipeline[1])} · โอกาสสำเร็จ ${pipeline[2]}% · ระดับ ${pipeline[3]}` : `${fallback(pipeline[1])}・確度${pipeline[2]}%・関心度${pipeline[3]}`;
  const completed = value.match(/^Completed · (.+?)( · milestone)?$/);
  if (completed) return lang === "TH" ? `เสร็จแล้ว · ${completed[1]}${completed[2] ? " · จุดส่งมอบ" : ""}` : `完了・${completed[1]}${completed[2] ? "・マイルストーン" : ""}`;
  const meeting = value.match(/^(.+) · (\d+) meetings? owned or recorded$/);
  if (meeting) return lang === "TH" ? `${fallback(meeting[1])} · รับผิดชอบหรือบันทึกการประชุม ${meeting[2]} ครั้ง` : `${fallback(meeting[1])}・担当または記録した打合せ${meeting[2]}回`;
  const delivered = value.match(/^Delivered on or before (\d{4}-\d{2}-\d{2})$/);
  if (delivered) return lang === "TH" ? `ส่งมอบไม่เกิน ${delivered[1]}` : `${delivered[1]}までに納入`;
  const late = value.match(/^Delivered (\d{4}-\d{2}-\d{2}); target was (\d{4}-\d{2}-\d{2})$/);
  if (late) return lang === "TH" ? `ส่งมอบ ${late[1]} · กำหนดเดิม ${late[2]}` : `納入日${late[1]}・目標日${late[2]}`;
  const role = value.match(/^(Project manager|Lead engineer|Contributor|Engineer|Schedule Member) · (.+)$/);
  if (role) return `${performanceEvidenceText(role[1], lang, fallback)} · ${performanceEvidenceText(role[2], lang, fallback)}`;
  return fallback(value);
}
