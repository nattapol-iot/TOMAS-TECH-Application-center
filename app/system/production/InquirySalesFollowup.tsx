"use client";

import { useEffect, useState } from "react";
import { apiRequest, type BootstrapData, type InquiryDetail } from "../api-client";
import { useT } from "../i18n";
import { Panel, Modal } from "../ui";

type Opportunity = {id:number;opportunityNo:string;name:string;stage:string;rowVersion:string;unavailable?:boolean};

export function InquirySalesFollowup({detail,bootstrap,onSaved,openOpportunity}:{
  detail:InquiryDetail;bootstrap:BootstrapData;onSaved:()=>Promise<void>;openOpportunity?:(id:number)=>void;
}) {
  const t=useT(),[source,setSource]=useState<Opportunity|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState("");
  const [editing,setEditing]=useState(false),[matches,setMatches]=useState<Opportunity[]>([]),[search,setSearch]=useState("");
  const [selected,setSelected]=useState<Opportunity|null>(null),[createNew,setCreateNew]=useState(false),[busy,setBusy]=useState(false),[matchesLoading,setMatchesLoading]=useState(false);
  const [salesOwnerId,setSalesOwnerId]=useState(bootstrap.team.find(member=>member.name===detail.salesOwner)?.id??bootstrap.user.id);
  useEffect(()=>{
    let cancelled=false;
    void apiRequest<Opportunity|null>(`/api/v1/crm/inquiries/${detail.id}/source`).then(value=>{if(!cancelled){setSource(value);setLoaded(true);setError("");}})
      .catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:String(error));});
    return()=>{cancelled=true;};
  },[detail.id,detail.rowVersion]);
  useEffect(()=>{
    if(!editing)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      setMatchesLoading(true);
      const query=new URLSearchParams({customerId:String(detail.customerId),search,pageSize:"10"});
      void apiRequest<{items:Opportunity[]}>(`/api/v1/crm/opportunities?${query}`).then(value=>{if(!cancelled)setMatches(value.items.filter(o=>!["LOST","ON_HOLD"].includes(o.stage)));})
        .catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:String(error));})
        .finally(()=>{if(!cancelled)setMatchesLoading(false);});
    },250);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[editing,detail.customerId,search]);
  const save=async()=>{
    setBusy(true);setError("");
    try {
      const result=await apiRequest<{id:number}>(`/api/v1/crm/inquiries/${detail.id}/opportunity`,{method:"POST",body:JSON.stringify({rowVersion:detail.rowVersion,salesOwnerId,
        ...(selected?{opportunityId:selected.id,opportunityRowVersion:selected.rowVersion}:{})})});
      setEditing(false);await onSaved();openOpportunity?.(result.id);
    } catch(error){setError(error instanceof Error?error.message:String(error));} finally{setBusy(false);}
  };
  const canLink=bootstrap.permissions.includes("crm.write")&&bootstrap.permissions.includes("inquiry.write")&&!detail.archived&&detail.status!=="Cancelled";
  return <Panel title="CRM.customerFollowup">
    {error?<p role="alert">{error}</p>:null}
    {!loaded?<p role="status">{t("CRM.loading")}</p>:source?.unavailable?<p>{t("CRM.linkUnavailable")}</p>:source?<>
      <p>{source.opportunityNo} · {t(`CRM.${source.stage}`)}</p>
      <button className="btn primary" onClick={()=>openOpportunity?.(source.id)}>{t("CRM.openFollowup")}</button>
    </>:<><p>{t("CRM.directFollowupHint")}</p>{canLink?<button className="btn primary" onClick={()=>setEditing(true)}>{t("CRM.linkSales")}</button>:null}</>}
    {editing?<Modal title="CRM.linkSales" onClose={()=>{if(!busy)setEditing(false);}} footer={<button className="btn primary" disabled={busy||(!selected&&!createNew)||(!selected&&!salesOwnerId)} onClick={()=>{void save();}}>{t(selected?"CRM.linkExisting":"CRM.createFromInquiry")}</button>}>
      {error?<p role="alert">{error}</p>:null}
      <p>{t("CRM.linkSalesHint")}</p>
      <label className="field"><span>{t("Search")}</span><input value={search} onChange={event=>{setSearch(event.target.value);setSelected(null);setCreateNew(false);}} disabled={busy}/></label>
      {matchesLoading?<p role="status">{t("CRM.loading")}</p>:null}
      <label className="field"><span>{t("CRM.sourceOpportunity")}</span><select disabled={busy} value={selected?.id??(createNew?0:"")} onChange={event=>{setCreateNew(event.target.value==="0");setSelected(matches.find(o=>o.id===Number(event.target.value))??null);}}>
        <option value="">{t("Select")}</option><option value={0}>{t("CRM.createFromInquiry")}</option>{matches.map(o=><option key={o.id} value={o.id}>{o.opportunityNo} · {o.name}</option>)}
      </select></label>
      {!selected?<label className="field"><span>{t("CRM.salesOwnerId")}</span><select value={salesOwnerId} disabled={busy} onChange={event=>setSalesOwnerId(Number(event.target.value))}>{bootstrap.team.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>:null}
      <p>{t("CRM.matchLimit")}</p>
    </Modal>:null}
  </Panel>;
}
