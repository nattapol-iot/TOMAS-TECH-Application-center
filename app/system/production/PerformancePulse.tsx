"use client";

import { useLanguage } from "../i18n";
import { Badge, Icon, type IconName, type Tone } from "../ui";
import type { PerformanceEvidence } from "../api-client";
import { performanceDate } from "./performance-presentation";
import { selectPerformancePulseCards, type PerformancePulseCard, type PerformancePulseLanguage } from "./performance-pulse";

type Props = {
  evidence: PerformanceEvidence | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpenSource: (sourceType: "PROJECT" | "INQUIRY" | "TASK", sourceId: number) => void;
};

const localized = (language: PerformancePulseLanguage, th: string, en: string, jp: string) =>
  language === "TH" ? th : language === "JP" ? jp : en;

const cardPresentation: Record<PerformancePulseCard["kind"], {
  label: [string, string, string];
  icon: IconName;
  tone: Tone;
}> = {
  strength: { label: ["สิ่งที่ทำได้ดี", "What is going well", "うまくできていること"], icon: "checkCircle", tone: "green" },
  attention: { label: ["จุดที่ควรดูแล", "Worth attention", "確認したいポイント"], icon: "alertTriangle", tone: "amber" },
  context: { label: ["บริบทที่ควรรู้", "Useful context", "確認しておきたい背景"], icon: "shield", tone: "blue" },
  next: { label: ["ก้าวถัดไป", "Next step", "次の一歩"], icon: "arrowRight", tone: "violet" },
};

function PulseAction({ card, language, onOpenSource }: {
  card: PerformancePulseCard;
  language: PerformancePulseLanguage;
  onOpenSource: Props["onOpenSource"];
}) {
  if (card.source) {
    const action = card.source.type === "TASK"
      ? localized(language, "เปิด My Work", "Open My Work", "My Workを開く")
      : localized(language, "ดูงานต้นทาง", "Open source work", "元の業務を開く");
    return (
      <button
        className="performance-pulse-action"
        type="button"
        onClick={() => onOpenSource(card.source!.type, card.source!.id)}
        aria-label={`${action} ${card.source.label}`}
      >
        <span>{action}</span><Icon name="externalLink" />
      </button>
    );
  }
  return (
    <a className="performance-pulse-action" href="#performance-work-evidence">
      <span>{localized(language, "ดูหลักฐานทั้งหมด", "View all evidence", "すべての証跡を見る")}</span><Icon name="arrowRight" />
    </a>
  );
}

export function PerformancePulse({ evidence, loading, error, onRetry, onOpenSource }: Props) {
  const { lang } = useLanguage();
  const language: PerformancePulseLanguage = lang;

  if (loading && !evidence) {
    return (
      <section className="panel performance-pulse" aria-labelledby="performance-pulse-title">
        <div className="panel-head performance-pulse-head">
          <div><h2 id="performance-pulse-title">{localized(language, "สัญญาณผลงานของฉัน", "My Performance Pulse", "私のパフォーマンスシグナル")}</h2><p>{localized(language, "กำลังอ่านหลักฐานในรอบ KPI นี้", "Reading evidence for this KPI cycle", "このKPIサイクルの証跡を確認しています")}</p></div>
        </div>
        <div className="panel-body performance-pulse-loading" role="status" aria-live="polite">
          {[0, 1, 2].map((item) => <span className="performance-pulse-skeleton" key={item} aria-hidden="true" />)}
          <span className="sr-only">{localized(language, "กำลังประมวลผลสัญญาณผลงาน", "Preparing performance signals", "パフォーマンスシグナルを準備しています")}</span>
        </div>
      </section>
    );
  }

  if (error && !evidence) {
    return (
      <section className="panel performance-pulse" aria-labelledby="performance-pulse-title">
        <div className="panel-body performance-pulse-state" role="alert">
          <span className="performance-area-icon amber"><Icon name="alertTriangle" /></span>
          <div><h2 id="performance-pulse-title">{localized(language, "ยังโหลดสัญญาณผลงานไม่ได้", "Performance signals could not be loaded", "パフォーマンスシグナルを読み込めませんでした")}</h2><p>{localized(language, "ลองโหลดหลักฐานของรอบ KPI นี้อีกครั้ง", "Try loading this KPI cycle's evidence again.", "このKPIサイクルの証跡をもう一度読み込んでください。")}</p></div>
          <button className="btn default" type="button" onClick={onRetry}><Icon name="refresh" />{localized(language, "ลองอีกครั้ง", "Try again", "再試行")}</button>
        </div>
      </section>
    );
  }

  if (!evidence) return null;

  const cards = selectPerformancePulseCards(evidence.insights ?? [], language);
  const confidenceTone: Tone = evidence.confidence === "HIGH" ? "green" : evidence.confidence === "MEDIUM" ? "blue" : "amber";
  const confidence = localized(
    language,
    evidence.confidence === "HIGH" ? "ความเชื่อมั่นสูง" : evidence.confidence === "MEDIUM" ? "ความเชื่อมั่นปานกลาง" : "ความเชื่อมั่นต่ำ",
    `${evidence.confidence === "HIGH" ? "High" : evidence.confidence === "MEDIUM" ? "Medium" : "Low"} confidence`,
    evidence.confidence === "HIGH" ? "信頼度: 高" : evidence.confidence === "MEDIUM" ? "信頼度: 中" : "信頼度: 低",
  );
  const insufficient = evidence.confidence === "LOW" || cards.length === 0;

  return (
    <section className="panel performance-pulse" aria-labelledby="performance-pulse-title">
      <div className="panel-head performance-pulse-head">
        <div>
          <h2 id="performance-pulse-title">{localized(language, "สัญญาณผลงานของฉัน", "My Performance Pulse", "私のパフォーマンスシグナル")}</h2>
          <p>{localized(language, "สรุปจากผลงานที่เชื่อมโยงในรอบนี้ เพื่อช่วยมองเห็นจุดแข็งและก้าวถัดไป", "A concise view of connected work to highlight strengths and a useful next step.", "連携された業務から、強みと次の一歩を簡潔に確認できます。")}</p>
        </div>
        <div className="performance-pulse-meta">
          <span>{performanceDate(evidence.periodStart, lang)}–{performanceDate(evidence.periodEnd, lang)}</span>
          <Badge tone={confidenceTone} dot>{confidence}</Badge>
        </div>
      </div>
      <div className="panel-body">
        {insufficient ? (
          <div className="performance-pulse-insufficient">
            <span className="performance-area-icon blue"><Icon name="database" /></span>
            <div>
              <strong>{localized(language, "ข้อมูลยังไม่พอสำหรับสรุปผลงาน", "Not enough data for a performance conclusion", "パフォーマンスを判断するにはデータが不足しています")}</strong>
              <p>{localized(language, "เมื่อ Project, Inquiry หรือ Task ในรอบนี้เชื่อมโยงมากขึ้น ระบบจะแสดงข้อเท็จจริงโดยไม่ตีความข้อมูลที่หายไปว่าเป็นผลงานดีหรือไม่ดี", "When more Project, Inquiry or Task records are connected, factual signals will appear without treating missing data as good or poor performance.", "このサイクルのProject・Inquiry・Taskの連携が増えると、未記録を良し悪しと決めつけず、事実に基づくシグナルを表示します。")}</p>
            </div>
            <a className="performance-pulse-action" href="#performance-work-evidence"><span>{localized(language, "ดูข้อมูลที่เชื่อมโยง", "View connected evidence", "連携された証跡を見る")}</span><Icon name="arrowRight" /></a>
          </div>
        ) : (
          <ul className="performance-pulse-grid">
            {cards.map((card) => {
              const presentation = cardPresentation[card.kind];
              return (
                <li className={`performance-pulse-card ${card.kind}`} key={card.key}>
                  <div className="performance-pulse-card-label"><span className={`performance-area-icon ${presentation.tone}`}><Icon name={presentation.icon} /></span><strong>{localized(language, ...presentation.label)}</strong></div>
                  <p className="performance-pulse-fact">{card.headline}</p>
                  <p className="performance-pulse-body">{card.body}</p>
                  <PulseAction card={card} language={language} onOpenSource={onOpenSource} />
                </li>
              );
            })}
          </ul>
        )}
        <p className="performance-pulse-note"><Icon name="shield" />{localized(language, "ใช้ประกอบการทบทวน ไม่ใช่คะแนน KPI อัตโนมัติ", "Decision support only — this does not set your KPI score.", "振り返りの参考情報であり、KPIスコアを自動設定するものではありません。")}</p>
      </div>
    </section>
  );
}
