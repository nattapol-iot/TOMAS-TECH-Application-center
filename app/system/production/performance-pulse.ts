import type { PerformanceInsight } from "../api-client";

export type PerformancePulseLanguage = "TH" | "EN" | "JP";
export type PerformancePulseCardKind = "strength" | "attention" | "context" | "next";

export type PerformancePulseCard = {
  key: string;
  kind: PerformancePulseCardKind;
  reasonCode: string;
  headline: string;
  body: string;
  source: PerformanceInsight["source"];
};

const localized = (language: PerformancePulseLanguage, th: string, en: string, jp: string) =>
  language === "TH" ? th : language === "JP" ? jp : en;

const count = (insight: PerformanceInsight, key: string) => {
  const value = Number(insight.facts[key]);
  return Number.isFinite(value) ? value : 0;
};

function insightCard(insight: PerformanceInsight, language: PerformancePulseLanguage): PerformancePulseCard | null {
  const kind: PerformancePulseCardKind = insight.kind === "STRENGTH"
    ? "strength"
    : insight.kind === "ATTENTION" ? "attention" : "context";
  const card = (headline: string, body: string): PerformancePulseCard => ({
    key: insight.reasonCode,
    kind,
    reasonCode: insight.reasonCode,
    headline,
    body,
    source: insight.source,
  });

  switch (insight.reasonCode) {
    case "DELIVERY_EARLY": {
      const early = count(insight, "earlyProjectCount");
      const delivered = count(insight, "deliveredProjectCount");
      return card(
        localized(language, `ส่งมอบก่อนกำหนด ${early}/${delivered} โปรเจกต์`, `${early}/${delivered} projects delivered early`, `${early}/${delivered}件のプロジェクトを予定より早く納品`),
        localized(language, "ผลลัพธ์นี้อ้างอิงวันที่ส่งมอบจริงที่เร็วกว่าวันเป้าหมาย", "This is based on actual delivery dates earlier than their targets.", "実納品日が目標日より早い実績に基づいています。"),
      );
    }
    case "DELIVERY_ON_TIME": {
      const onTime = count(insight, "onTimeCount");
      const due = count(insight, "dueCount");
      return card(
        localized(language, `ส่งมอบตรงเวลา ${onTime}/${due} งาน`, `${onTime}/${due} due tasks completed on time`, `期限対象${due}件中${onTime}件を期限内に完了`),
        localized(language, "คุณรักษาคำมั่นส่งมอบได้สม่ำเสมอในงานที่มีข้อมูลครบ", "You are keeping delivery commitments consistently across recorded work.", "記録された業務で、納期へのコミットメントを安定して守れています。"),
      );
    }
    case "DELIVERY_REVIEW": {
      const overdue = count(insight, "overdueCount");
      const due = count(insight, "dueCount");
      return card(
        localized(language, `มี ${overdue}/${due} งานเลยกำหนดที่ควรทบทวน`, `${overdue}/${due} due tasks need a schedule review`, `期限対象${due}件中${overdue}件は予定の見直しが必要です`),
        localized(language, "สถานะนี้บอกจุดที่ควรตรวจแผนและอุปสรรค ไม่ได้สรุปสาเหตุหรือความพยายาม", "This flags work to review; it does not infer the cause or effort involved.", "確認すべき業務を示すもので、原因や努力を推測するものではありません。"),
      );
    }
    case "ISSUE_HANDLING_STRONG": {
      const closed = count(insight, "closedIssueCount");
      const issues = count(insight, "issueCount");
      return card(
        localized(language, `จัดการ Issue ปิดแล้ว ${closed}/${issues} รายการ`, `${closed}/${issues} assigned Issues closed`, `担当Issue ${issues}件中${closed}件をクローズ`),
        localized(language, "สะท้อนการรับมือและติดตาม Issue ที่ได้รับมอบหมาย ไม่ได้ระบุว่าใครเป็นผู้ก่อปัญหา", "This recognizes handling of assigned Issues, without attributing who caused them.", "担当Issueへの対応を評価するもので、問題の原因を個人に帰属しません。"),
      );
    }
    case "ISSUE_WORKLOAD_REVIEW": {
      const open = count(insight, "openIssueCount");
      const issues = count(insight, "issueCount");
      return card(
        localized(language, `มี Issue ที่รับผิดชอบเปิดอยู่ ${open}/${issues} รายการ`, `${open}/${issues} assigned Issues remain open`, `担当Issue ${issues}件中${open}件が未完了です`),
        localized(language, "ควรทบทวนภาระงาน ลำดับความสำคัญ และสิ่งที่ต้องขอความช่วยเหลือ โดยไม่สรุปสาเหตุของ Issue", "Review workload, priority and support needs without inferring who caused the Issues.", "Issueの原因を推測せず、負荷・優先順位・必要な支援を確認しましょう。"),
      );
    }
    case "TECHNICAL_CONTRIBUTION": {
      const completed = count(insight, "completedCount");
      return card(
        localized(language, `ส่งมอบงานเทคนิคแล้ว ${completed} งาน`, `${completed} technical work items completed`, `技術業務を${completed}件完了`),
        localized(language, "งานที่เสร็จมีหลักฐานเชื่อมกลับไปยัง Project, Inquiry หรือ Task", "Completed work is traceable to its Project, Inquiry or Task evidence.", "完了した業務はProject・Inquiry・Taskの証跡まで確認できます。"),
      );
    }
    case "CUSTOMER_FOLLOWUP_COVERED": {
      const covered = count(insight, "inquiriesWithMeetingCount");
      const active = count(insight, "activeInquiryCount");
      return card(
        localized(language, `มีกิจกรรมลูกค้าที่บันทึก ${covered}/${active} Inquiry`, `${covered}/${active} active Inquiries have recorded customer activity`, `進行中Inquiry ${active}件中${covered}件に顧客活動の記録があります`),
        localized(language, "สะท้อนความครอบคลุมของการติดตามลูกค้า ไม่ได้ให้รางวัลจากจำนวน Meeting", "This recognizes customer follow-up coverage, not raw meeting volume.", "Meeting数ではなく、顧客フォローのカバー率を示します。"),
      );
    }
    case "CUSTOMER_FOLLOWUP_REVIEW": {
      const covered = count(insight, "inquiriesWithMeetingCount");
      const active = count(insight, "activeInquiryCount");
      return card(
        localized(language, `บันทึกกิจกรรมลูกค้าแล้ว ${covered}/${active} Inquiry`, `${covered}/${active} active Inquiries have recorded customer activity`, `進行中Inquiry ${active}件中${covered}件に顧客活動の記録があります`),
        localized(language, "ตรวจ Inquiry ที่ยังไม่มีกิจกรรมลูกค้าที่บันทึก เพื่อให้ทีมเห็นสถานะและก้าวถัดไป", "Review Inquiries without recorded customer activity so the team can see status and next steps.", "顧客活動が未記録のInquiryを確認し、状況と次の対応を共有しましょう。"),
      );
    }
    case "ESTIMATE_COVERAGE_STRONG": {
      const covered = count(insight, "estimateCoveredCount");
      const eligible = count(insight, "eligibleInquiryCount");
      return card(
        localized(language, `มี Estimate ครบ ${covered}/${eligible} Inquiry ที่เข้าเกณฑ์`, `${covered}/${eligible} eligible Inquiries have an Estimate`, `対象Inquiry ${eligible}件中${covered}件にEstimateがあります`),
        localized(language, "ข้อมูลเชิงพาณิชย์พร้อมสำหรับการทบทวนและตัดสินใจในโอกาสส่วนใหญ่", "Commercial information is ready for review across most eligible opportunities.", "対象案件の多くで、商務情報を確認・判断できる状態です。"),
      );
    }
    case "ESTIMATE_COVERAGE_REVIEW": {
      const covered = count(insight, "estimateCoveredCount");
      const eligible = count(insight, "eligibleInquiryCount");
      return card(
        localized(language, `มี Estimate แล้ว ${covered}/${eligible} Inquiry ที่เข้าเกณฑ์`, `${covered}/${eligible} eligible Inquiries have an Estimate`, `対象Inquiry ${eligible}件中${covered}件にEstimateがあります`),
        localized(language, "เริ่มตรวจจาก Inquiry ที่เก่าที่สุดซึ่งยังไม่มี Estimate หรือสถานะที่ชัดเจน", "Start with the oldest eligible Inquiry that still needs an Estimate or a clear status.", "Estimateまたは明確な状態がない最も古い対象Inquiryから確認しましょう。"),
      );
    }
    case "HANDOVER_COMPLETE": {
      const handovers = count(insight, "handoverCount");
      const approved = count(insight, "approvedCount");
      return card(
        localized(language, `ส่งต่องานครบ ${handovers}/${approved} โอกาสที่อนุมัติ`, `${handovers}/${approved} approved opportunities handed over`, `承認済み案件${approved}件中${handovers}件を引き継ぎ済み`),
        localized(language, "โอกาสที่อนุมัติเชื่อมต่อไปยัง Project เพื่อให้ทีม Engineering เดินงานต่อได้", "Approved opportunities are linked to Projects for a clear Engineering handover.", "承認済み案件がProjectに連携され、Engineeringへ明確に引き継がれています。"),
      );
    }
    case "HANDOVER_REVIEW": {
      const handovers = count(insight, "handoverCount");
      const approved = count(insight, "approvedCount");
      return card(
        localized(language, `ส่งต่องานแล้ว ${handovers}/${approved} โอกาสที่อนุมัติ`, `${handovers}/${approved} approved opportunities handed over`, `承認済み案件${approved}件中${handovers}件を引き継ぎ済み`),
        localized(language, "ตรวจโอกาสที่อนุมัติแต่ยังไม่เชื่อม Project เพื่อให้ Engineering รับช่วงต่อได้ครบ", "Review approved opportunities not yet linked to a Project so Engineering can take over cleanly.", "Project未連携の承認済み案件を確認し、Engineeringへ確実に引き継ぎましょう。"),
      );
    }
    case "FORECAST_CONTEXT": {
      const approved = count(insight, "approvedCount");
      const cancelled = count(insight, "cancelledCount");
      return card(
        localized(language, `ปิดผลลัพธ์แล้ว: อนุมัติ ${approved} · ยกเลิก ${cancelled}`, `Closed outcomes: ${approved} approved · ${cancelled} cancelled`, `完了結果: 承認${approved}件・キャンセル${cancelled}件`),
        localized(language, "ยังไม่มี snapshot ของ Probability ก่อนปิดดีล จึงใช้เป็นบริบทและไม่คำนวณความแม่นยำ Forecast", "There is no pre-outcome probability snapshot, so this remains context and no forecast accuracy is calculated.", "結果確定前のProbabilityスナップショットがないため、参考情報として扱い、Forecast精度は算出しません。"),
      );
    }
    default:
      return null;
  }
}

function nextCard(source: PerformancePulseCard, language: PerformancePulseLanguage): PerformancePulseCard {
  const copy: Record<string, [string, string, string]> = {
    DELIVERY_REVIEW: ["เริ่มจากงานที่เลยกำหนดนานที่สุด แล้วอัปเดตแผนหรือสิ่งที่ต้องการความช่วยเหลือ", "Start with the longest-overdue item, then update its plan or support needed.", "最も長く期限を超えた項目から、計画または必要な支援を更新しましょう。"],
    ISSUE_WORKLOAD_REVIEW: ["จัดลำดับ Issue ที่เปิดอยู่ และยกสิ่งที่ติดขัดขึ้นคุยกับทีม", "Prioritize open Issues and raise blockers with the team.", "未完了Issueの優先順位を整理し、障害をチームに共有しましょう。"],
    CUSTOMER_FOLLOWUP_REVIEW: ["บันทึกสถานะลูกค้าและก้าวถัดไปให้ Inquiry ที่ยังไม่มี Activity", "Record customer status and a next step for an Inquiry without activity.", "顧客活動が未記録のInquiryに、状況と次の対応を記録しましょう。"],
    ESTIMATE_COVERAGE_REVIEW: ["เติม Estimate หรือสถานะให้ Inquiry ที่เข้าเกณฑ์และเก่าที่สุดก่อน", "Complete the Estimate or status for the oldest eligible Inquiry first.", "最も古い対象InquiryからEstimateまたは状態を整えましょう。"],
    HANDOVER_REVIEW: ["เชื่อมโอกาสที่อนุมัติไปยัง Project และยืนยันผู้รับช่วงงาน", "Link an approved opportunity to its Project and confirm the handover owner.", "承認済み案件をProjectに連携し、引き継ぎ担当を確認しましょう。"],
    FORECAST_CONTEXT: ["เริ่มบันทึก Probability ก่อนปิดผลลัพธ์ เพื่อสร้างฐาน Forecast ที่ตรวจสอบได้", "Capture probability before closing outcomes to build an auditable forecast baseline.", "結果確定前にProbabilityを記録し、検証できるForecast基準を作りましょう。"],
    DELIVERY_EARLY: ["รักษาจังหวะนี้ด้วยการยืนยันวันเป้าหมายและความเสี่ยงของงานถัดไปให้ชัด", "Keep the rhythm by confirming target dates and risks for the next delivery.", "次の納品でも目標日とリスクを明確にし、このペースを維持しましょう。"],
    DELIVERY_ON_TIME: ["รักษาจังหวะนี้ด้วยการอัปเดต due date และแจ้งความเสี่ยงให้เร็ว", "Keep the rhythm by updating due dates and raising delivery risks early.", "期限を更新し、納品リスクを早めに共有して、このペースを維持しましょう。"],
    ISSUE_HANDLING_STRONG: ["รักษาการติดตาม Issue และบันทึกสิ่งที่ยังต้องการความช่วยเหลือให้ชัด", "Keep Issues moving and record where support is still needed.", "Issue対応を継続し、必要な支援を明確に記録しましょう。"],
    TECHNICAL_CONTRIBUTION: ["เลือกหนึ่งงานเทคนิคที่นำกลับมาใช้ซ้ำหรือแบ่งปันกับทีมได้", "Choose one technical outcome to reuse or share with the team.", "再利用またはチーム共有できる技術成果を1つ選びましょう。"],
    CUSTOMER_FOLLOWUP_COVERED: ["รักษาความครอบคลุมด้วยการบันทึกสถานะและก้าวถัดไปหลังคุยกับลูกค้า", "Maintain coverage by recording status and next steps after customer contact.", "顧客対応後に状況と次の対応を記録し、カバー率を維持しましょう。"],
    ESTIMATE_COVERAGE_STRONG: ["รักษาความครบถ้วนโดยทบทวน Estimate และสถานะก่อน pipeline review", "Maintain coverage by reviewing Estimates and statuses before pipeline review.", "Pipelineレビュー前にEstimateと状態を確認し、網羅性を維持しましょう。"],
    HANDOVER_COMPLETE: ["รักษามาตรฐานการส่งต่อด้วย owner, Project และ next step ที่ชัดเจน", "Maintain clear handovers with an owner, Project and next step.", "担当者・Project・次の対応を明確にし、引き継ぎ品質を維持しましょう。"],
  };
  const selected = copy[source.reasonCode] ?? [
    "เปิดหลักฐานผลงานเพื่อเลือกหนึ่งก้าวถัดไปที่ทำได้ในรอบนี้",
    "Review the evidence and choose one practical next step for this cycle.",
    "証跡を確認し、このサイクルで実行できる次の一歩を選びましょう。",
  ];
  return {
    key: `NEXT_${source.reasonCode}`,
    kind: "next",
    reasonCode: `NEXT_${source.reasonCode}`,
    headline: localized(language, "ก้าวเล็กที่ทำต่อได้ทันที", "One practical next step", "すぐに取り組める次の一歩"),
    body: localized(language, selected[0], selected[1], selected[2]),
    source: source.source,
  };
}

export function selectPerformancePulseCards(insights: PerformanceInsight[], language: PerformancePulseLanguage): PerformancePulseCard[] {
  const recognized = insights.map((insight) => ({ insight, card: insightCard(insight, language) }))
    .filter((entry): entry is { insight: PerformanceInsight; card: PerformancePulseCard } => entry.card !== null);
  const strength = recognized.find((entry) => entry.insight.kind === "STRENGTH")?.card;
  const attention = recognized.find((entry) => entry.insight.kind === "ATTENTION")?.card
    ?? recognized.find((entry) => entry.insight.kind === "CONTEXT")?.card;
  const anchor = attention ?? strength;
  return [strength, attention, anchor ? nextCard(anchor, language) : null]
    .filter((card): card is PerformancePulseCard => card !== null && card !== undefined)
    .slice(0, 3);
}
