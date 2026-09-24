"use client";

import { useEffect, useState } from "react";
import { apiRequest, type BootstrapData, type InquirySummary, type PagedResult } from "../api-client";
import { useT } from "../i18n";
import { Panel } from "../ui";
import type { CrmRecord } from "./CrmScreens";

type Matches = { opportunities: CrmRecord[]; inquiries: InquirySummary[] };

export function ExistingRfqWork({bootstrap,customerId,name,onSelect,onOpen,disabled}:{
  bootstrap:BootstrapData;customerId:number;name:string;onSelect:(row:CrmRecord)=>void;onOpen:(id:number)=>void;disabled:boolean;
}) {
  const t=useT(),[result,setResult]=useState<{key:string;matches:Matches}|null>(null),[error,setError]=useState(false);
  const key=`${customerId}:${name.trim()}`;
  const canRead=bootstrap.permissions.includes("crm.read"),canConvert=bootstrap.permissions.includes("crm.convert");
  useEffect(()=>{
    let cancelled=false;
    if(!customerId)return;
    const timer=setTimeout(()=>{
      setError(false);
      const query=new URLSearchParams({customerId:String(customerId),search:name.trim(),pageSize:"10"});
      void Promise.all([
        canRead?apiRequest<{items:CrmRecord[]}>(`/api/v1/crm/opportunities?${query}`):Promise.resolve({items:[]}),
        apiRequest<PagedResult<InquirySummary>>(`/api/v1/inquiries?${query}`),
      ]).then(([opportunities,inquiries])=>{if(!cancelled)setResult({key,matches:{opportunities:opportunities.items,inquiries:inquiries.items}});})
        .catch(()=>{if(!cancelled)setError(true);});
    },250);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[customerId,name,key,canRead]);
  if(!customerId)return null;
  const matches=result?.key===key?result.matches:null;
  return <Panel title="CRM.existingRfqWork" subtitle="CRM.existingRfqHint">
    {error?<p role="alert" className="alert warn">{t("CRM.error")}</p>:!matches?<p role="status">{t("CRM.loading")}</p>:<>
      {!matches.opportunities.length&&!matches.inquiries.length?<p className="muted">{t("CRM.empty")}</p>:null}
      {matches.inquiries.map(row=><div className="crm-action" key={`inq-${row.id}`}><span>{row.number} · {row.projectName} · {t(row.status)}</span><button type="button" className="btn default sm" disabled={disabled} onClick={()=>onOpen(row.id)}>{t("CRM.openInquiry")}</button></div>)}
      {matches.opportunities.map(row=><div className="crm-action" key={`opp-${row.id}`}><span>{String(row.opportunityNo)} · {String(row.name)} · {t(`CRM.${row.stage}`)}</span>{row.inquiryId&&!["Approved","Cancelled"].includes(String(row.inquiryStatus))?<button type="button" className="btn default sm" disabled={disabled} onClick={()=>onOpen(Number(row.inquiryId))}>{t("CRM.openInquiry")}</button>:canConvert&&!["WON","LOST","ON_HOLD"].includes(String(row.stage))?<button type="button" className="btn default sm" disabled={disabled} onClick={()=>onSelect(row)}>{t("CRM.useOpportunity")}</button>:null}</div>)}
      <p className="muted">{t("CRM.matchLimit")}</p>
    </>}
  </Panel>;
}
