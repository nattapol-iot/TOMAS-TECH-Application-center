"use client";

import { useEffect, useState } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { useT } from "../i18n";
import { Panel } from "../ui";
import { CreateProjectModal } from "./CoreScreens";

type Handover = {reason:string;estimateId:number|null;projectId:number|null;projectNo:string|null};

export function ProjectHandover({inquiryId,bootstrap,refreshBootstrap,notify,openProject}:{
  inquiryId:number;bootstrap:BootstrapData;refreshBootstrap:()=>Promise<void>;notify:(message:string)=>void;openProject?:(id:number)=>void;
}) {
  const t=useT(),[data,setData]=useState<Handover|null>(null),[error,setError]=useState(""),[creating,setCreating]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    void apiRequest<Handover>(`/api/v1/projects/handover/${inquiryId}`).then(value=>{if(!cancelled){setData(value);setError("");}})
      .catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:String(error));});
    return()=>{cancelled=true;};
  },[inquiryId,revision]);
  const canCreate=bootstrap.permissions.includes("project.write")&&bootstrap.permissions.includes("estimate.read");
  return <Panel title="CRM.projectHandover">
    {error?<p role="alert">{error}</p>:!data?<p role="status">{t("CRM.loading")}</p>:<>
      <p>{t(`CRM.${data.reason}`)}</p>
      {data.projectId&&openProject?<button className="btn primary" onClick={()=>openProject(data.projectId!)}>{data.projectNo}</button>:null}
      {data.reason==="recordPo"&&canCreate?<button className="btn primary" onClick={()=>setCreating(true)}>{t("Create project")}</button>:null}
      {data.reason==="recordPo"&&!canCreate?<p>{t("CRM.projectPermission")}</p>:null}
    </>}
    <button className="btn ghost sm" onClick={()=>setRevision(value=>value+1)}>{t("Refresh")}</button>
    {creating&&data?.estimateId?<CreateProjectModal initialEstimateId={data.estimateId} bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} notify={notify}
      onClose={()=>setCreating(false)} onCreated={async number=>{setCreating(false);setRevision(value=>value+1);notify(number);await refreshBootstrap();}}/>:null}
  </Panel>;
}
