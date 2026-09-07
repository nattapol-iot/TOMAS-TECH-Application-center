"use client";
import {useLanguage} from "../i18n";
import {Icon} from "../ui";
const useCopy=()=>{const {lang}=useLanguage();return {s:(th:string,en:string,jp:string)=>lang==="TH"?th:lang==="JP"?jp:en};};
const number=(v:number|null|undefined)=>v==null?"—":v.toFixed(1);

export function ActivityKpiSummary({activity}:{activity:{mode:string;eligible:boolean;eligibleDays:number;automatic:number|null;total:number|null;rating:number|null;frozen:boolean}|undefined}){const {s}=useCopy();if(!activity)return null;return <div className="activity-inline"><Icon name="chart"/><strong>{s('วินัยการอัปเดตงาน','Reporting discipline','業務更新スコア')}</strong><span>{activity.total===null?`${number(activity.automatic)} / 85 · ${s('รอประเมินคุณภาพ','Quality pending','品質評価待ち')}`:`${number(activity.total)} / 100`}</span><span className="activity-status">{activity.mode==='TRIAL'?s('ทดลอง · ยังไม่กระทบ KPI','Trial · no KPI impact','試行・KPIへの影響なし'):activity.eligible?s('น้ำหนัก KPI 10%','10% KPI weight','KPI比重10%'):s('ข้อมูลไม่พอ · KPI เดิม 100%','Insufficient data · existing KPI 100%','データ不足・従来KPI100%')}</span><a href="#activity" className="btn ghost sm">{s('ดูหลักฐาน','View evidence','根拠を見る')}</a></div>;}
