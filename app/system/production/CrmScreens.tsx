"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ApiClientError, apiRequest, downloadCrmDocument, uploadCrmDocument, type BootstrapData } from "../api-client";
import { useLanguage, useT } from "../i18n";
import { Badge, EmptyState, Icon, KpiCard, Modal, PageHeader, Pagination, Panel, SearchInput, SummaryTile, TablePageSize, type IconName, type Tone } from "../ui";
import { CustomerModal } from "./AdminAnalyticsScreens";
import "./crm.css";
import { CRM_COPY } from "./crm-copy";

export type CrmRecord = Record<string, unknown>;
type Page = {items:CrmRecord[];total:number;page:number;pageSize:number};
type Detail = {opportunity:CrmRecord;activities:CrmRecord[];followups:CrmRecord[];history:CrmRecord[];links:CrmRecord[]};
type CustomerDetail = {service:CrmRecord[];customer:CrmRecord;sites:CrmRecord[];contacts:CrmRecord[];inquiries:CrmRecord[];estimates:CrmRecord[];projects:CrmRecord[]};
export type CrmView = "crm-dashboard"|"crm-customers"|"crm-contacts"|"crm-opportunities"|"crm-activities"|"crm-pipeline";
type Props = {refreshBootstrap?:()=>Promise<void>;bootstrap:BootstrapData;view:CrmView;preferredOpportunityId?:number|null;openInquiry:(id:number)=>void;openEstimate:(id:number)=>void;openProject:(id:number)=>void};
const stages=["NEW","QUALIFICATION","REQUIREMENT","ESTIMATING","PROPOSAL","NEGOTIATION","WON","LOST","ON_HOLD"];
const activityTypes=["Meeting","Call","Email","SiteVisit","CustomerUpdate","InternalDiscussion","MessageLINE","Note","Other"];
const statuses=["Open","WaitingCustomer","WaitingInternal","WaitingSupplier","Done","Cancelled"];
const text=(v:unknown)=>v==null?"":String(v);
const date=(v:unknown)=>text(v).slice(0,10);
const futureDate=(days:number)=>{const value=new Date();value.setDate(value.getDate()+days);return value.toISOString().slice(0,10);};
const money=(v:unknown)=>v==null?"—":new Intl.NumberFormat(undefined,{style:"currency",currency:"THB",maximumFractionDigits:0}).format(Number(v));
/* Stage, follow-up status and attention flag all say "what state is this in",
   so they take the shared badge tones instead of a CRM-only palette. */
const CRM_TONE:Record<string,Tone>={
  NEW:"slate",QUALIFICATION:"slate",REQUIREMENT:"blue",ESTIMATING:"blue",PROPOSAL:"violet",
  NEGOTIATION:"amber",WON:"green",LOST:"red",ON_HOLD:"slate",
  Open:"blue",WaitingCustomer:"amber",WaitingInternal:"amber",WaitingSupplier:"amber",Done:"green",Cancelled:"slate",
  Overdue:"red",DueToday:"amber",DueSoon:"amber",Scheduled:"slate",
  NeedsFollowup:"amber",NoNextAction:"amber",NoActivity:"amber",EstimateDueSoon:"amber",
  Active:"green",Inactive:"slate",Technical:"blue",Buyer:"amber",
};
const toneFor=(value:string):Tone=>CRM_TONE[value]??"slate";
const METRIC_TONES:Tone[]=["blue","amber","red","violet","green"];
const METRIC_ICONS:IconName[]=["folder","clock","alertTriangle","users","checkCircle"];
export const crmRequest=<T,>(path:string,method:string,body:unknown)=>apiRequest<T>(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

export function useCrmData<T>(url:string|null) {
  const [result,setResult]=useState<{url:string;value:T}|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(Boolean(url)),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{let cancelled=false;if(!url)return;const timer=setTimeout(()=>{setLoading(true);setError(false);void apiRequest<T>(url).then(v=>{if(!cancelled)setResult({url,value:v});}).catch(()=>{if(!cancelled)setError(true);}).finally(()=>{if(!cancelled)setLoading(false);});},0);return()=>{cancelled=true;clearTimeout(timer);};},[url,revision]);
  return {data:result?.url===url?result.value:null,error,loading,refresh};
}
function Notice({error,loading}:{error?:boolean;loading?:boolean}){const t=useT();return error?<div role="alert" className="alert danger">{t("CRM.error")}</div>:loading?<p role="status">{t("CRM.loading")}</p>:null;}
type Option={value:string;label:string};
type Field={key:string;label?:string;type?:string;options?:Option[];required?:boolean;wide?:boolean;disabled?:boolean;searchable?:boolean;actionLabel?:string;actionValue?:string};
function SearchableSelect({value,options,required,disabled,placeholder="CRM.searchCustomer",actionLabel,actionValue,onChange}:{value:string;options:Option[];required?:boolean;disabled?:boolean;placeholder?:string;actionLabel?:string;actionValue?:string;onChange:(value:string)=>void}) {
  const t=useT(),listId=useId(),inputRef=useRef<HTMLInputElement>(null),selected=options.find(option=>option.value===value),[draft,setDraft]=useState<string|null>(null),query=draft??selected?.label??"";
  const select=(raw:string,input:HTMLInputElement)=>{const normalized=raw.trim().toLocaleLowerCase(),match=options.find(option=>option.label.toLocaleLowerCase()===normalized);setDraft(match?null:raw);onChange(match?.value??"");input.setCustomValidity(raw&&!match?t("CRM.selectFromList"):"");};
  return <div className={`crm-searchable-select${actionLabel?" has-action":""}`}><input ref={inputRef} list={listId} required={required} disabled={disabled} autoComplete="off" placeholder={t(placeholder)} value={query} onChange={event=>select(event.target.value,event.currentTarget)} onBlur={event=>{if(!options.some(option=>option.label.toLocaleLowerCase()===query.trim().toLocaleLowerCase())){setDraft(null);event.currentTarget.setCustomValidity("");}}}/><button type="button" disabled={disabled||Boolean(actionLabel&&!actionValue)} aria-label={t(actionLabel??"CRM.showOptions")} onClick={()=>{if(actionLabel&&actionValue){setDraft(null);onChange(actionValue);inputRef.current?.setCustomValidity("");}else{inputRef.current?.focus();inputRef.current?.showPicker?.();}}}>{actionLabel?t(actionLabel):"⌄"}</button><datalist id={listId}>{options.map(option=><option key={option.value} value={option.label}/>)}</datalist></div>;
}
function FilterSelect({label,value,options,onChange}:{label:string;value:string;options:Option[];onChange:(v:string)=>void}) {
  const t=useT();
  return <label className="select-field"><span className="sr-only">{t(label)}</span><select aria-label={t(label)} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><Icon name="chevronDown"/></label>;
}
function Fields({fields,value,set}:{fields:Field[];value:CrmRecord;set:(v:CrmRecord)=>void}) {
  const t=useT();return <div className="crm-form-grid">{fields.map(f=>f.type==="checkbox"?<label key={f.key} className={`crm-check-field${f.wide?" crm-full":""}`}><input type="checkbox" checked={value[f.key]!==false} onChange={e=>set({...value,[f.key]:e.target.checked})}/><span>{t(f.label??`CRM.${f.key}`)}{f.required?" *":""}</span></label>:<label key={f.key} className={f.wide?"crm-full":""}><span>{t(f.label??`CRM.${f.key}`)}{f.required?" *":""}</span>{f.options&&f.searchable?<SearchableSelect disabled={f.disabled} required={f.required} placeholder={f.key==="endUserCustomerId"?"CRM.searchEndUser":"CRM.searchCustomer"} actionLabel={f.actionLabel} actionValue={f.actionValue} value={text(value[f.key])} options={f.options} onChange={next=>set({...value,[f.key]:f.key.endsWith("Id")&&next?Number(next):next})}/>:f.options?<select disabled={f.disabled} required={f.required} value={text(value[f.key])} onChange={e=>set({...value,[f.key]:f.key.endsWith("Id")&&e.target.value?Number(e.target.value):e.target.value})}><option value="">—</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==="textarea"?<textarea rows={4} value={text(value[f.key])} onChange={e=>set({...value,[f.key]:e.target.value})}/>:<input required={f.required} type={f.type??"text"} min={f.type==="number"?0:undefined} step={f.type==="number"?"any":undefined} value={f.type==="date"?date(value[f.key]):text(value[f.key])} onChange={e=>set({...value,[f.key]:f.type==="number"&&e.target.value!==""?Number(e.target.value):e.target.value})}/>}</label>)}</div>;
}
function Editor({title,subtitle,size="xl",initial,fields,onSave,onClose,children}:{title:string;subtitle?:string;size?:"sm"|"md"|"lg"|"xl";initial:CrmRecord;fields:Field[];onSave:(v:CrmRecord)=>Promise<void>;onClose:()=>void;children?:(v:CrmRecord,set:(v:CrmRecord)=>void)=>ReactNode}) {
  const t=useT(),[value,set]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  return <Modal size={size} title={t(title)} subtitle={subtitle} onClose={()=>{if(!busy)onClose();}}><form className="crm-editor" onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setError(false);void onSave(value).then(onClose).catch(()=>setError(true)).finally(()=>setBusy(false));}}><Notice error={error}/><Fields fields={fields} value={value} set={set}/>{children?.(value,set)}<div className="crm-editor-actions"><button type="button" className="btn default" disabled={busy} onClick={onClose}>{t("Cancel")}</button><button className="btn primary" disabled={busy}>{t("Save")}</button></div></form></Modal>;
}
function PageBar({page,onPage}:{page:Page|null|undefined;onPage?:(v:number)=>void}) {
  if(!page||!onPage||!page.total)return null;
  return <Pagination page={page.page} pageCount={Math.max(1,Math.ceil(page.total/page.pageSize))} from={(page.page-1)*page.pageSize+1} to={Math.min(page.page*page.pageSize,page.total)} total={page.total} onPage={onPage}/>;
}
/* Rows own their own paging furniture, because the application puts the page
   size above the table and the pager below it, both inside the panel. Held
   apart they read as a stray strip under the card. */
function Records({rows,columns,onOpen,onEdit,page,onPage,onPageSize}:{rows:CrmRecord[];columns:string[];onOpen?:(r:CrmRecord)=>void;onEdit?:(r:CrmRecord)=>void;page?:Page|null;onPage?:(v:number)=>void;onPageSize?:(v:number)=>void}) {
  const t=useT();if(!rows.length)return <EmptyState icon="inbox" title="CRM.empty" message="CRM.emptyHint"/>;return <div className="table-wrap">{onPageSize&&page?<TablePageSize value={page.pageSize} onChange={onPageSize}/>:null}<table><thead><tr>{columns.map(c=><th key={c}>{t(c==="name"?"CRM.recordName":c==="title"?"CRM.reportTitle":`CRM.${c}`)}</th>)}{onEdit?<th>{t("Actions")}</th>:null}</tr></thead><tbody>{rows.map((r,i)=><tr key={text(r.id)||i}>{columns.map((c,n)=>{const value=text(r[c]);const tagged=["stage","status","contactRole"].includes(c);return <td key={c}>{n===0&&onOpen?<button className="crm-link" onClick={()=>onOpen(r)}>{value||"—"}</button>:c==="total"||c==="expectedValue"?money(r[c]):tagged&&value?<Badge tone={toneFor(value)}>{CRM_COPY[`CRM.${value}`]?t(`CRM.${value}`):value}</Badge>:CRM_COPY[`CRM.${value}`]?t(`CRM.${value}`):value||"—"}</td>;})}{onEdit?<td><button type="button" className="btn default sm" onClick={()=>onEdit(r)}>{t("Edit")}</button></td>:null}</tr>)}</tbody></table><PageBar page={page} onPage={onPage}/></div>;
}
function LocalRecords({rows,columns,onOpen}:{rows:CrmRecord[];columns:string[];onOpen?:(r:CrmRecord)=>void}){const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),pageCount=Math.max(1,Math.ceil(rows.length/pageSize)),resolvedPage=Math.min(page,pageCount),paged=rows.slice((resolvedPage-1)*pageSize,resolvedPage*pageSize);return <Records rows={paged} columns={columns} onOpen={onOpen} page={{items:paged,total:rows.length,page:resolvedPage,pageSize}} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}}/>;}

/* Open stages in the order a deal travels through them. The bar, the legend
   and the segment colours all index off this list, so a position on screen
   always means the same stage. */
const OPEN_STAGES=stages.filter(code=>!["WON","LOST","ON_HOLD"].includes(code));

/* A distribution belongs in one bar, not in one card per stage: the same
   reading in a fraction of the height. Every segment is also the filter it
   describes, so looking and acting are one click. */
function PipelineBar({counts,labelOf,active,onPick}:{counts:Record<string,number>;labelOf:(code:string)=>string;active:string;onPick:(code:string)=>void}) {
  const t=useT(),rows=OPEN_STAGES.map(code=>({code,value:Number(counts[code]??0)})),total=rows.reduce((sum,row)=>sum+row.value,0);
  return <div className="crm-distribution">
    <p className="crm-distribution-head"><strong>{total}</strong> <span>{t("CRM.open")}</span></p>
    {total?<div className="crm-distribution-bar">{rows.filter(row=>row.value).map(row=><button key={row.code} type="button" style={{flexGrow:row.value}} aria-pressed={active===row.code} className={`crm-seg c${OPEN_STAGES.indexOf(row.code)}${active===row.code?" active":""}`} title={`${labelOf(row.code)} · ${row.value}`} aria-label={`${labelOf(row.code)} ${row.value}`} onClick={()=>onPick(active===row.code?"":row.code)}/>)}</div>:<p className="crm-muted">{t("CRM.emptyHint")}</p>}
    <ul className="crm-legend">{rows.map(row=><li key={row.code}><button type="button" aria-pressed={active===row.code} className={active===row.code?"active":""} onClick={()=>onPick(active===row.code?"":row.code)}><i aria-hidden="true" className={`crm-dot c${OPEN_STAGES.indexOf(row.code)}`}/>{labelOf(row.code)}<strong>{row.value}</strong></button></li>)}</ul>
  </div>;
}

/* The counts people act on, each one already the filter it names. */
const ATTENTION_KEYS=["NeedsFollowup","Overdue","WaitingCustomer","NoNextAction","NoActivity","EstimateDueSoon"];
function AttentionChips({counts,active,onPick}:{counts:CrmRecord|null;active:string;onPick:(key:string)=>void}) {
  const t=useT();
  return <ul className="crm-chips">{ATTENTION_KEYS.map(key=><li key={key}><button type="button" aria-pressed={active===key} className={`crm-chip ${toneFor(key)}${active===key?" active":""}`} onClick={()=>onPick(active===key?"":key)}><span>{t(`CRM.${key}`)}</span><strong>{Number(counts?.[key]??0)}</strong></button></li>)}</ul>;
}

/* A funnel is only honest against a fixed denominator, so each step is a share
   of the opportunities in scope — never a share of the steps beside it. */
function ConversionFunnel({total,steps}:{total:number;steps:{label:string;value:number}[]}) {
  const t=useT();
  return <ul className="crm-funnel">{steps.map((step,index)=>{const share=total?Math.round(step.value/total*100):0;return <li key={step.label}><span>{t(step.label)}</span><strong>{step.value}<em>{total?`${share}%`:"—"}</em></strong><span className="crm-funnel-track"><b className={`c${index}`} style={{width:`${share}%`}}/></span></li>;})}</ul>;
}

function MetricStrip({items}:{items:{label:string;value:unknown;tone?:string;hint?:string;icon?:IconName;onClick?:()=>void}[]}){return <div className="kpi-grid">{items.map((item,index)=><KpiCard key={item.label} label={item.label} value={text(item.value)||"0"} note={item.hint} icon={item.icon??METRIC_ICONS[index%METRIC_ICONS.length]} tone={(item.tone as Tone|undefined)??METRIC_TONES[index%METRIC_TONES.length]} onClick={item.onClick}/>)}</div>}
/* Label/value facts about one record — not counts — so they use the summary
   strip rather than KPI cards, which size their value for numbers. */
function FactStrip({items}:{items:{label:string;value:string}[]}){return <div className="summary-strip four">{items.map(item=><SummaryTile key={item.label} label={item.label} value={item.value||"—"}/>)}</div>}
function useOptions(options:CrmRecord[]) {
  const {lang}=useLanguage();return (kind:string)=>options.filter(o=>o.kind===kind&&o.isActive!==false).map(o=>({value:text(o.code),label:text(o[lang==="TH"?"labelTh":lang==="JP"?"labelJa":"labelEn"])}));
}
const teamOptions=(bootstrap:BootstrapData):Option[]=>bootstrap.team.map(u=>({value:String(u.id),label:u.name}));

export function CrmScreen(props:Props) {
  const {bootstrap,view,preferredOpportunityId}=props,t=useT();
  const [opportunityId,setOpportunityId]=useState<number|null>(preferredOpportunityId??null),[customerId,setCustomerId]=useState<number|null>(null),[create,setCreate]=useState(false),[config,setConfig]=useState(false);
  const options=useCrmData<CrmRecord[]>("/api/v1/crm/options");
  useEffect(()=>{const timer=setTimeout(()=>{setOpportunityId(preferredOpportunityId??null);setCustomerId(null);},0);return()=>clearTimeout(timer);},[view,preferredOpportunityId]);
  const write=bootstrap.permissions.includes("crm.write");
  if(!bootstrap.permissions.includes("crm.read"))return <p>{t("CRM.permissions")}</p>;
  const title=opportunityId?"CRM Opportunities":customerId?"CRM Customers":({"crm-dashboard":"CRM Dashboard","crm-customers":"CRM Customers","crm-contacts":"CRM Contacts","crm-opportunities":"CRM Opportunities","crm-activities":"CRM Activities","crm-pipeline":"CRM Pipeline"})[view];
  const descriptions:Record<CrmView,string>={"crm-dashboard":"CRM.introDashboard","crm-customers":"CRM.introCustomers","crm-contacts":"CRM.introContacts","crm-opportunities":"CRM.introOpportunities","crm-activities":"CRM.introActivities","crm-pipeline":"CRM.introPipeline"};
  const showNew=!opportunityId&&!customerId&&["crm-dashboard","crm-opportunities","crm-pipeline"].includes(view);
  return <div className="crm-workspace"><PageHeader eyebrow="CRM & SALES" title={title} subtitle={!opportunityId&&!customerId?descriptions[view]:undefined} actions={<>{(opportunityId||customerId)?<button className="btn default" onClick={()=>{setOpportunityId(null);setCustomerId(null);}}><Icon name="arrowLeft"/>{t("CRM.back")}</button>:null}{write&&showNew?<button className="btn primary" onClick={()=>setCreate(true)}><Icon name="plus"/>{t("CRM.new")}</button>:null}{bootstrap.permissions.includes("crm.configure")&&view==="crm-dashboard"?<button className="btn default" onClick={()=>setConfig(true)}><Icon name="settings"/>{t("CRM.configuration")}</button>:null}</>}/><Notice error={options.error}/>
    {opportunityId?<OpportunityWorkspace {...props} id={opportunityId} options={options.data??[]} openCustomer={setCustomerId} onCustomer={()=>setOpportunityId(null)}/>:customerId?<CustomerWorkspace {...props} id={customerId} openOpportunity={setOpportunityId}/>:view==="crm-customers"?<CustomerList bootstrap={bootstrap} refreshBootstrap={props.refreshBootstrap} open={setCustomerId}/>:view==="crm-contacts"?<ContactList bootstrap={bootstrap}/>:view==="crm-activities"?<ActivityList bootstrap={bootstrap} options={options.data??[]}/>:<OpportunityList bootstrap={bootstrap} mode={view} options={options.data??[]} open={setOpportunityId}/>}
    {create?<OpportunityEditor bootstrap={bootstrap} options={options.data??[]} onClose={()=>setCreate(false)} onSaved={r=>setOpportunityId(Number(r.id))}/>:null}
    {config?<Configuration options={options.data??[]} onClose={()=>setConfig(false)} refresh={options.refresh}/>:null}
  </div>;
}

function OpportunityList({bootstrap,mode,options,open}:{bootstrap:BootstrapData;mode:CrmView;options:CrmRecord[];open:(id:number)=>void}) {
  const t=useT(),choice=useOptions(options),[search,setSearch]=useState(""),[stage,setStage]=useState(""),[attention,setAttention]=useState(""),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[owner,setOwner]=useState(""),[sort,setSort]=useState("updated"),[edit,setEdit]=useState<CrmRecord|null>(null),[createStage,setCreateStage]=useState<string|null>(null);
  const write=bootstrap.permissions.includes("crm.write");
  const [drag,setDrag]=useState<{id:number;from:string}|null>(null),[over,setOver]=useState(""),[moved,setMoved]=useState<{id:number;stage:string}|null>(null),[moveError,setMoveError]=useState("");
  const list=useCrmData<Page>(`/api/v1/crm/opportunities?${new URLSearchParams({search,stage,attention,open:mode==="crm-dashboard"?"true":"false",ownerId:owner,page:String(page),pageSize:String(mode==="crm-pipeline"?100:pageSize),sort})}`);
  const dashboard=useCrmData<CrmRecord>("/api/v1/crm/dashboard");
  const rows=list.data?.items??[];
  const label=(s:string)=>choice("stage").find(o=>o.value===s)?.label??s;
  // The card sits in its new column from the moment it is dropped, and stays
  // there until the refreshed list agrees — so it never snaps back and then
  // forward again while the request is in flight.
  const pending=moved&&!rows.some(r=>Number(r.id)===moved.id&&text(r.stage)===moved.stage)?moved:null;
  const boardRows=pending?rows.map(r=>Number(r.id)===pending.id?{...r,stage:pending.stage}:r):rows;
  /* Dropping a card is the same edit the dialog makes, so it takes the same
     PUT with the row version the card was drawn from: a board left open while
     someone else moved that opportunity is refused, never silently overwritten. */
  const moveTo=async(row:CrmRecord,stage:string)=>{
    const id=Number(row.id);
    if(!write||text(row.stage)===stage)return;
    setMoveError("");setMoved({id,stage});
    try{
      await crmRequest(`/api/v1/crm/opportunities/${id}`,"PUT",{stage,rowVersion:row.rowVersion});
      list.refresh();dashboard.refresh();
    }catch(error){
      setMoved(null);
      setMoveError(error instanceof ApiClientError&&error.status===409?"CRM.moveConflict":"CRM.moveFailed");
    }
  };
  const card=(r:CrmRecord)=><button className={`crm-opportunity-card${drag?.id===Number(r.id)?" dragging":""}`} key={text(r.id)} draggable={write&&mode==="crm-pipeline"} onDragStart={event=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",text(r.id));setDrag({id:Number(r.id),from:text(r.stage)});}} onDragEnd={()=>{setDrag(null);setOver("");}} onClick={()=>open(Number(r.id))}><strong>{text(r.name)}</strong><span className="crm-card-customer">{text(r.customerName)}</span>{bootstrap.permissions.includes("crm.commercial.read")?<span className="crm-card-value">{money(r.expectedValue)}</span>:null}<span className="crm-card-value">{date(r.expectedClose)||"—"}</span><small>{text(r.nextAction)||t("CRM.NoNextAction")} {date(r.nextDue)}</small><div className="crm-flags">{(r.attention as string[]??[]).filter(a=>a!=="Scheduled").map(a=><Badge key={a} tone={toneFor(a)}>{t(`CRM.${a}`)}</Badge>)}</div></button>;
  const dash=dashboard.data;
  return <><Notice error={dashboard.error||list.error} loading={list.loading}/>
    <Panel title="CRM.pipelineOverview" subtitle={mode==="crm-dashboard"?"CRM.pipelineOverviewHint":mode==="crm-pipeline"&&write?"CRM.dragHint":undefined}>
      <div className="crm-overview">
        <PipelineBar counts={(dash?.stages as Record<string,number>|undefined)??{}} labelOf={label} active={stage} onPick={code=>{setStage(code);setAttention("");setPage(1);}}/>
        {mode==="crm-dashboard"?<><AttentionChips counts={dash} active={attention} onPick={key=>{setAttention(key);setStage("");setPage(1);}}/>
        <ConversionFunnel total={Number(dash?.totalOpportunities??0)} steps={[{label:"CRM.convertedToInquiry",value:Number(dash?.convertedToInquiry??0)},{label:"CRM.convertedToEstimate",value:Number(dash?.convertedToEstimate??0)},{label:"CRM.convertedToProject",value:Number(dash?.convertedToProject??0)}]}/>
        <p className="crm-muted">{t("CRM.directInquiries")}: <strong>{Number(dash?.directInquiries??0)}</strong> · {t("CRM.directInquiriesHint")}</p></>:null}
      </div>
    </Panel>

    <div className="toolbar crm-filters"><SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="CRM.search"/><FilterSelect label="CRM.stage" value={stage} onChange={v=>{setStage(v);setPage(1);}} options={[{value:"",label:t("All")},...choice("stage")]}/><FilterSelect label="CRM.ownerId" value={owner} onChange={v=>{setOwner(v);setPage(1);}} options={[{value:"",label:t("All")},...teamOptions(bootstrap)]}/><FilterSelect label="CRM.sort" value={sort} onChange={setSort} options={[{value:"updated",label:t("Last updated")},{value:"close",label:t("CRM.expectedClose")}]}/><span className="spacer"/><button className="btn default" onClick={list.refresh}><Icon name="refresh"/>{t("Refresh")}</button></div>
    
    {mode==="crm-pipeline"&&moveError?<div role="alert" className="alert danger">{t(moveError)}</div>:null}
    {mode==="crm-pipeline"?<div className="crm-pipeline">{OPEN_STAGES.map(s=>{const stageRows=boardRows.filter(r=>r.stage===s);return <section key={s} data-stage={s} className={over===s&&drag&&drag.from!==s?"drop-target":undefined}
      onDragOver={event=>{if(!drag||drag.from===s)return;event.preventDefault();event.dataTransfer.dropEffect="move";setOver(s);}}
      onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(current=>current===s?"":current);}}
      onDrop={event=>{if(!drag)return;event.preventDefault();const row=rows.find(r=>Number(r.id)===drag.id);setOver("");setDrag(null);if(row)void moveTo(row,s);}}><header><h3>{label(s)}</h3><strong>{stageRows.length}</strong></header>{stageRows.map(card)}{write?<button type="button" className="crm-pipeline-add" onClick={()=>setCreateStage(s)}>＋ {t("CRM.new")}</button>:null}</section>;})}</div>:<Panel flush title={`${list.data?.total??0} ${t("CRM Opportunities")}`} subtitle="CRM.attention"><Records rows={rows} columns={["opportunityNo","name","customerName","endUserName","stage","expectedValue","expectedClose","salesOwnerName","nextAction"]} onOpen={r=>open(Number(r.id))} onEdit={write?setEdit:undefined} page={list.data} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}}/></Panel>}
    {mode==="crm-pipeline"&&!rows.length&&!list.loading?<Panel flush><EmptyState icon="folder" title="CRM.empty" message="CRM.emptyHint"/></Panel>:null}{edit?<OpportunityEditor bootstrap={bootstrap} options={options} initial={edit} onClose={()=>setEdit(null)} onSaved={()=>list.refresh()}/>:null}{createStage?<OpportunityEditor bootstrap={bootstrap} options={options} defaultStage={createStage} onClose={()=>setCreateStage(null)} onSaved={r=>{setCreateStage(null);open(Number(r.id));}}/>:null}</>;
}

function OpportunityEditor({bootstrap,options,initial,defaultStage,onClose,onSaved}:{bootstrap:BootstrapData;options:CrmRecord[];initial?:CrmRecord;defaultStage?:string;onClose:()=>void;onSaved:(r:CrmRecord)=>void}) {
  const choice=useOptions(options),t=useT();
  const base=initial??{customerId:"",salesOwnerId:bootstrap.user.id,stage:defaultStage??"NEW",source:"DirectInquiry",priority:"Normal"};
  return <Editor title={initial?"Edit":"CRM.new"} initial={base} fields={[]} onClose={onClose} onSave={async v=>{if(!initial){const similar=await apiRequest<CrmRecord[]>(`/api/v1/crm/opportunity-duplicates?customerId=${v.customerId}&name=${encodeURIComponent(text(v.name))}`);if(similar.length&&!window.confirm(`${t("CRM.duplicateWarning")}\n\n${similar.map(r=>`${text(r.opportunityNo)} · ${text(r.name)} · ${text(r.stage)}`).join("\n")}`))return;}const result=await crmRequest<CrmRecord>(`/api/v1/crm/opportunities${initial?`/${initial.id}`:""}`,initial?"PUT":"POST",v);onSaved(result);}}>{(v,set)=><><OpportunityFields bootstrap={bootstrap} options={options} value={v} set={set}/><details><summary>{t("CRM.optionalDetails")}</summary><Fields fields={[{key:"source",options:choice("source")},{key:"priority",options:["Low","Normal","High","Urgent"].map(s=>({value:s,label:t(s)}))},{key:"probability",type:"number"},{key:"competitor"},{key:"need",type:"textarea",wide:true},{key:"scope",type:"textarea",wide:true},{key:"internalNote",type:"textarea",wide:true}]} value={v} set={set}/></details>{v.stage==="LOST"?<Fields fields={[{key:"lostReason",required:true,options:choice("lostReason")},{key:"lostDetail",required:v.lostReason==="Other",type:"textarea"}]} value={v} set={set}/>:null}<p className="crm-muted">{t("CRM.waitingHint")}</p></>}</Editor>;
}
function OpportunityFields({bootstrap,options,value,set}:{bootstrap:BootstrapData;options:CrmRecord[];value:CrmRecord;set:(v:CrmRecord)=>void}) {
  const t=useT(),choice=useOptions(options),customer=useCrmData<CustomerDetail>(value.customerId?`/api/v1/crm/customers/${value.customerId}`:null);
  const companyOptions=bootstrap.customers.map(c=>({value:String(c.id),label:`${c.code} · ${c.name}`}));
  const fields:Field[]=[{key:"customerId",required:true,searchable:true,disabled:Boolean(value.id),options:companyOptions},{key:"name",required:true},{key:"endUserCustomerId",searchable:true,options:companyOptions,actionLabel:"CRM.useCustomerAsEndUser",actionValue:text(value.customerId)},{key:"siteId",options:(customer.data?.sites??[]).map(r=>({value:text(r.id),label:text(r.name)}))},{key:"contactId",options:(customer.data?.contacts??[]).filter(r=>!value.siteId||String(r.siteId)===String(value.siteId)).map(r=>({value:text(r.id),label:text(r.name)}))},{key:"salesOwnerId",required:true,options:teamOptions(bootstrap)},{key:"technicalOwnerId",options:teamOptions(bootstrap)},{key:"expectedClose",type:"date"},{key:"stage",options:choice("stage"),required:true}];
  if(bootstrap.permissions.includes("crm.commercial.read"))fields.push({key:"expectedValue",type:"number"});
  return <><Notice error={customer.error}/><Fields fields={fields} value={value} set={next=>{if(next.customerId!==value.customerId){next.siteId="";next.contactId="";}else if(next.siteId!==value.siteId)next.contactId="";set(next);}}/><div className="crm-end-user-actions"><span>{t("CRM.endUserHint")}</span><button type="button" className="btn ghost sm" disabled={!value.endUserCustomerId} onClick={()=>set({...value,endUserCustomerId:""})}>{t("CRM.notSpecified")}</button></div></>;
}

function OpportunityWorkspace({id,options,openCustomer,onCustomer,...props}:Props&{id:number;options:CrmRecord[];openCustomer:(id:number)=>void;onCustomer:()=>void}) {
  const t=useT(),choice=useOptions(options),[tab,setTab]=useState("overview"),[editor,setEditor]=useState<string|null>(null),[action,setAction]=useState<CrmRecord|null>(null);
  const state=useCrmData<Detail>(`/api/v1/crm/opportunities/${id}`),o=state.data?.opportunity,bootstrap=props.bootstrap,write=bootstrap.permissions.includes("crm.write");
  const customer=useCrmData<CustomerDetail>(o?.customerId?`/api/v1/crm/customers/${o.customerId}`:null);
  if(!o)return <Notice error={state.error} loading={state.loading}/>;
  const activeInquiry=(state.data?.links??[]).find(r=>!["Approved","Cancelled"].includes(text(r.inquiryStatus)));
  const stageRail=stages.filter(s=>!["ON_HOLD"].includes(s)),stageAt=stageRail.indexOf(text(o.stage));
  const followupFields:Field[]=[{key:"action",required:true,wide:true},{key:"ownerId",required:true,options:teamOptions(bootstrap)},{key:"dueDate",required:true,type:"date"},{key:"priority",options:["Low","Normal","High","Urgent"].map(s=>({value:s,label:t(s)}))},{key:"status",options:statuses.map(s=>({value:s,label:t(`CRM.${s}`)}))}];
  return <><Notice error={state.error}/><Panel className="crm-hero" title={`${text(o.opportunityNo)} · ${text(o.name)}`} actions={<>{write?<button className="btn primary" onClick={()=>setEditor("opportunity")}>{t("Edit")}</button>:null}{activeInquiry?<button className="btn default" onClick={()=>props.openInquiry(Number(activeInquiry.inquiryId))}>{t("CRM.openInquiry")}</button>:bootstrap.permissions.includes("crm.convert")?<button className="btn default" onClick={()=>setEditor("convert")}>{t("CRM.convert")}</button>:null}<button className="btn default" onClick={()=>{openCustomer(Number(o.customerId));onCustomer();}}>{t("CRM Customers")}</button></>}><FactStrip items={[{label:t("CRM.customerId"),value:text(customer.data?.customer.name)},...(bootstrap.permissions.includes("crm.commercial.read")?[{label:t("CRM.expectedValue"),value:money(o.expectedValue)}]:[]),{label:t("CRM.expectedClose"),value:date(o.expectedClose)},{label:t("CRM.stage"),value:choice("stage").find(s=>s.value===o.stage)?.label??text(o.stage)}]}/><div className="crm-stagebar">{stageRail.map((s,index)=><span key={s} className={index===stageAt?"active":stageAt>-1&&index<stageAt?"done":""}>{choice("stage").find(x=>x.value===s)?.label??s}</span>)}</div></Panel>
    <div className="tabs" role="tablist">{["overview","contacts","activities","links","documents","history"].map(k=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?"tab active":"tab"} onClick={()=>setTab(k)}>{t(`CRM.${k}`)}</button>)}</div>
    {tab==="overview"?<><Panel title={t("CRM.overview")}><dl className="crm-details"><div><dt>{t("CRM.customerId")}</dt><dd>{text(customer.data?.customer.name)}</dd></div><div><dt>{t("CRM.endUserCustomerId")}</dt><dd>{text(o.endUserName)||t("CRM.notSpecified")}</dd></div><div><dt>{t("CRM.salesOwnerId")} / {t("CRM.technicalOwnerId")}</dt><dd>{bootstrap.team.find(u=>u.id===Number(o.salesOwnerId))?.name} / {bootstrap.team.find(u=>u.id===Number(o.technicalOwnerId))?.name||"—"}</dd></div><div><dt>{t("CRM.lastActivity")}</dt><dd>{date(state.data?.activities[0]?.occurredAt)||"—"}</dd></div>{["need","scope","internalNote"].map(k=><div key={k}><dt>{t(`CRM.${k}`)}</dt><dd>{text(o[k])||"—"}</dd></div>)}</dl></Panel><Panel title={t("CRM.followups")} actions={write?<button className="btn primary" onClick={()=>{setAction(null);setEditor("action");}}>{t("CRM.addAction")}</button>:null}>{!(state.data?.followups??[]).some(f=>!["Done","Cancelled"].includes(text(f.status)))?<p className="alert warn">{t("CRM.NoNextAction")}</p>:null}{state.data?.followups.map(f=><div key={text(f.id)} className="crm-action"><div><strong>{text(f.action)}</strong><p>{text(f.ownerName)} · {date(f.dueDate)} · {t(`CRM.${f.status}`)}</p></div>{write||Number(f.ownerId)===bootstrap.user.id?<button className="btn default" onClick={()=>{setAction(f);setEditor("action");}}>{t("Edit")}</button>:null}</div>)}</Panel></>:null}
    {tab==="contacts"?<ContactList bootstrap={bootstrap} customerId={Number(o.customerId)}/>:null}
    {tab==="activities"?<><div className="toolbar"><span className="spacer"/>{bootstrap.permissions.includes("crm.activity.write")?<button className="btn primary" onClick={()=>setEditor("activity")}><Icon name="plus"/>{t("CRM.addActivity")}</button>:null}</div><Timeline bootstrap={bootstrap} rows={state.data?.activities??[]}/></>:null}
    {tab==="links"?<div className="crm-card-grid">{state.data?.links.map((r,i)=><article className="crm-opportunity-card" key={i}><button className="crm-link" onClick={()=>props.openInquiry(Number(r.inquiryId))}>{text(r.inquiryNo)} · {text(r.inquiryStatus)}</button>{r.estimateId&&bootstrap.permissions.includes("estimate.read")?<button className="crm-link" onClick={()=>props.openEstimate(Number(r.estimateId))}>{text(r.estimateNo)} · R{text(r.revision)} · {text(r.estimateStatus)} · {money(r.total)}</button>:null}{r.projectId&&bootstrap.permissions.includes("project.read")?<button className="crm-link" onClick={()=>props.openProject(Number(r.projectId))}>{text(r.projectNo)} · {text(r.projectStatus)}</button>:null}</article>)}</div>:null}
    {tab==="documents"?<CrmDocuments bootstrap={bootstrap} customerId={Number(o.customerId)} opportunityId={id}/>:null}
    {tab==="history"?<div className="crm-timeline">{state.data?.history.map(r=><article key={text(r.id)}><strong>{text(r.action).split(":").map(k=>CRM_COPY[`CRM.${k}`]?t(`CRM.${k}`):k).join(" · ")}</strong><p>{text(r.actorName)} · {text(r.occurredAt)}</p>{r.afterJson?<details><summary>{t("Details")}</summary><pre>{text(r.beforeJson)}{"\n"}{text(r.afterJson)}</pre></details>:null}</article>)}</div>:null}
    {editor==="opportunity"?<OpportunityEditor bootstrap={bootstrap} options={options} initial={o} onClose={()=>setEditor(null)} onSaved={state.refresh}/>:null}
    {editor==="action"?<Editor title="CRM.addAction" initial={action??{ownerId:bootstrap.user.id,priority:"Normal",status:"Open"}} fields={followupFields} onClose={()=>setEditor(null)} onSave={async v=>{await crmRequest(`/api/v1/crm/opportunities/${id}/followups${action?`/${action.id}`:""}`,action?"PUT":"POST",v);state.refresh();}}/>:null}
    {editor==="activity"?<ActivityEditor bootstrap={bootstrap} customerId={Number(o.customerId)} opportunityId={id} onClose={()=>setEditor(null)} onSaved={state.refresh}/>:null}
    {editor==="convert"?<Editor title="CRM.convert" initial={{estimateOwnerId:o.technicalOwnerId??bootstrap.user.id,projectType:"IoT",dueDate:futureDate(14)}} fields={[{key:"estimateOwnerId",required:true,options:teamOptions(bootstrap)},{key:"dueDate",required:true,type:"date"}]} onClose={()=>setEditor(null)} onSave={async v=>{const result=await crmRequest<{id:number}>("/api/v1/inquiries","POST",{...v,projectType:"IoT",opportunityId:id,opportunityRowVersion:o.rowVersion});state.refresh();props.openInquiry(result.id);}}>{()=> <div className="alert info"><strong>{t("CRM.convertHint")}</strong><p>{t("CRM.autoFilledHint")}</p><p>{t("CRM.filesInherited")}</p></div>}</Editor>:null}
  </>;
}

function Timeline({rows,bootstrap}:{rows:CrmRecord[];bootstrap:BootstrapData}){const {lang}=useLanguage(),t=useT(),[documentActivity,setDocumentActivity]=useState<CrmRecord|null>(null);return <><div className="crm-timeline">{!rows.length?<EmptyState icon="calendar" title="CRM.empty" message="CRM.emptyHint"/>:rows.map(r=><article key={text(r.id)}><small>{new Intl.DateTimeFormat(lang==="TH"?"th-TH":lang==="JP"?"ja-JP":"en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(text(r.occurredAt)))} · {t(`CRM.${r.activityType}`)} · {text(r.ownerName)}</small><h3>{text(r.summary)}</h3><p>{text(r.decision)}</p><p>{text(r.actionItems)}</p><small>{text(r.participants)}</small>{r.nextAction?<p>{t("CRM.action")}: {text(r.nextAction)} · {text(r.nextOwnerName)} · {date(r.nextDue)}</p>:null}<button className="btn default" onClick={()=>setDocumentActivity(r)}>{t("CRM.documents")}</button></article>)}</div>{documentActivity?<Modal title={t("CRM.documents")} size="xl" onClose={()=>setDocumentActivity(null)}><div className="crm-editor"><CrmDocuments bootstrap={bootstrap} customerId={Number(documentActivity.customerId)} opportunityId={documentActivity.opportunityId?Number(documentActivity.opportunityId):undefined} activityId={Number(documentActivity.id)}/></div></Modal>:null}</>;}
function ActivityEditor({bootstrap,customerId,opportunityId,onClose,onSaved}:{bootstrap:BootstrapData;customerId?:number;opportunityId?:number;onClose:()=>void;onSaved:()=>void}) {
  const t=useT(),[occurredAt]=useState(()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));return <Editor title="CRM.addActivity" initial={{customerId:customerId??"",opportunityId,activityType:"Meeting",nextOwnerId:bootstrap.user.id,ownerId:bootstrap.user.id,occurredAt}} fields={[...(!customerId?[{key:"customerId",required:true,options:bootstrap.customers.map(c=>({value:String(c.id),label:c.name}))}]:[]),{key:"activityType",required:true,options:activityTypes.map(s=>({value:s,label:t(`CRM.${s}`)}))},{key:"occurredAt",required:true,type:"datetime-local"},{key:"ownerId",required:true,options:teamOptions(bootstrap)},{key:"participants"},{key:"summary",required:true,wide:true},{key:"decision",type:"textarea"},{key:"actionItems",type:"textarea"}]} onClose={onClose} onSave={async v=>{const next=text(v.action).trim()?{action:v.action,ownerId:v.nextOwnerId,dueDate:v.dueDate}:undefined;await crmRequest("/api/v1/crm/activities","POST",{...v,occurredAt:new Date(text(v.occurredAt)).toISOString(),nextAction:next});onSaved();}}>{(v,set)=><><ActivityReferences value={v} set={set}/>{v.opportunityId?<details><summary>{t("CRM.addAction")}</summary><Fields fields={[{key:"action",wide:true},{key:"nextOwnerId",label:"CRM.ownerId",options:teamOptions(bootstrap)},{key:"dueDate",type:"date"}]} value={v} set={set}/></details>:null}</>}</Editor>;
}
function ActivityReferences({value,set}:{value:CrmRecord;set:(v:CrmRecord)=>void}) {
  const t=useT(),customer=useCrmData<CustomerDetail>(value.customerId?`/api/v1/crm/customers/${value.customerId}`:null),opportunities=useCrmData<Page>(value.customerId?`/api/v1/crm/opportunities?customerId=${value.customerId}&pageSize=100`:null);
  const choose=(rows:CrmRecord[],key:string)=>rows.map(r=>({value:text(r.id),label:text(r[key])}));
  return <details><summary>{t("CRM.links")}</summary><Fields value={value} set={set} fields={[
    {key:"opportunityId",label:"CRM.sourceOpportunity",options:choose(opportunities.data?.items??[],"name")},
    {key:"contactId",options:choose(customer.data?.contacts??[],"name")},
    {key:"inquiryId",options:choose((customer.data?.inquiries??[]).filter(r=>!value.opportunityId||Number(r.opportunityId)===Number(value.opportunityId)),"inquiryNo")},
    {key:"estimateId",options:choose(customer.data?.estimates??[],"estimateNo")},
    {key:"projectId",options:choose(customer.data?.projects??[],"projectNo")},
  ]}/></details>;
}
function ActivityList({bootstrap,customerId,year}:{bootstrap:BootstrapData;customerId?:number;options?:CrmRecord[];year?:string}) {
  const t=useT(),[page,setPage]=useState(1),state=useCrmData<Page>(`/api/v1/crm/activities?${new URLSearchParams({page:String(page),...(customerId?{customerId:String(customerId)}:{}),...(year?{year}:{})})}`),[add,setAdd]=useState(false);
  const rows=state.data?.items??[],count=(type:string)=>rows.filter(r=>r.activityType===type).length;
  return <><Notice error={state.error} loading={state.loading}/><MetricStrip items={[{label:"CRM.allActivities",value:state.data?.total??0,tone:"blue",icon:"calendar"},{label:t("CRM.Meeting"),value:count("Meeting"),tone:"blue",icon:"users"},{label:t("CRM.Email"),value:count("Email"),tone:"green",icon:"send"},{label:t("CRM.Call"),value:count("Call"),tone:"violet",icon:"bell"},{label:t("CRM.Note"),value:count("Note"),tone:"amber",icon:"file"},{label:t("CRM.SiteVisit"),value:count("SiteVisit"),tone:"red",icon:"truck"}]}/><div className="toolbar"><span className="spacer"/>{bootstrap.permissions.includes("crm.activity.write")?<button className="btn primary" onClick={()=>setAdd(true)}><Icon name="plus"/>{t("CRM.addActivity")}</button>:null}</div><Panel flush><Timeline bootstrap={bootstrap} rows={rows}/><PageBar page={state.data} onPage={setPage}/></Panel>{add?<ActivityEditor bootstrap={bootstrap} customerId={customerId} onClose={()=>setAdd(false)} onSaved={state.refresh}/>:null}</>;
}

function CustomerList({bootstrap,open,refreshBootstrap}:{bootstrap:BootstrapData;refreshBootstrap?:()=>Promise<void>;open:(id:number)=>void}) {
  const t=useT(),[search,setSearch]=useState(""),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[add,setAdd]=useState(false),[edit,setEdit]=useState<CrmRecord|null>(null),state=useCrmData<Page>(`/api/v1/crm/customers?${new URLSearchParams({search,page:String(page),pageSize:String(pageSize)})}`),writable=bootstrap.permissions.includes("crm.contact.write");
  const rows=state.data?.items??[];
  return <><Notice error={state.error} loading={state.loading}/><MetricStrip items={[{label:"CRM.totalCustomers",value:state.data?.total??0,tone:"blue",icon:"users"},{label:"CRM.shown",value:rows.length,tone:"slate",icon:"eye"},{label:"CRM.withIndustry",value:rows.filter(r=>r.industry).length,tone:"blue",icon:"layers"},{label:"CRM.withOwner",value:rows.filter(r=>r.accountOwnerName).length,tone:"violet",icon:"user"}]}/><div className="toolbar crm-filters"><SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="CRM.search"/><span className="spacer"/>{writable?<button className="btn primary" onClick={()=>setAdd(true)}><Icon name="plus"/>{t("CRM.newCustomer")}</button>:null}</div><Panel flush title={`${state.data?.total??0} ${t("CRM Customers")}`}><Records rows={rows} columns={["code","name","industry","site","accountOwnerName"]} onOpen={r=>open(Number(r.id))} onEdit={writable?setEdit:undefined} page={state.data} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}}/></Panel>{add?<CustomerModal customer={null} onClose={()=>setAdd(false)} onSaved={async()=>{setAdd(false);await refreshBootstrap?.();state.refresh();}}/>:null}{edit?<Editor title="CRM.editCustomer" subtitle={`${text(edit.code)} · ${text(edit.name)}`} size="lg" initial={{...edit,nameEn:edit.nameEn||(!edit.nameTh&&!edit.nameJa?edit.name:"")}} fields={[{key:"nameTh"},{key:"nameEn"},{key:"nameJa"},{key:"shortName"},{key:"industry"},{key:"country"},{key:"website",type:"url"},{key:"accountOwnerId",options:teamOptions(bootstrap)},{key:"site",wide:true},{key:"isActive",type:"checkbox"}]} onClose={()=>setEdit(null)} onSave={async v=>{await crmRequest(`/api/v1/crm/customers/${edit.id}`,"PUT",v);await refreshBootstrap?.();state.refresh();}}/>:null}</>;
}
function CustomerWorkspace({id,openOpportunity,...props}:Props&{id:number;openOpportunity:(id:number)=>void}) {
  const t=useT(),[tab,setTab]=useState("overview"),[year,setYear]=useState(""),[editor,setEditor]=useState<string|null>(null),[siteEdit,setSiteEdit]=useState<CrmRecord|null>(null),state=useCrmData<CustomerDetail>(`/api/v1/crm/customers/${id}${year?`?year=${year}`:""}`),opps=useCrmData<Page>(`/api/v1/crm/opportunities?customerId=${id}&pageSize=100${year?`&year=${year}`:""}`),activities=useCrmData<Page>(`/api/v1/crm/activities?customerId=${id}${year?`&year=${year}`:""}`),customer=state.data?.customer;
  if(!customer)return <Notice error={state.error} loading={state.loading}/>;
  const writable=props.bootstrap.permissions.includes("crm.contact.write");
  return <><Panel title={text(customer.name)} actions={writable?<button className="btn primary" onClick={()=>setEditor("customer")}>{t("Edit")}</button>:null}><div className="crm-customer-identity"><span>{text(customer.name).slice(0,2).toUpperCase()}</span><div><strong>{text(customer.code)}</strong><p>{text(customer.accountOwnerName)} · {text(customer.site)}</p></div><label>{t("CRM.year")} <input type="number" min="2000" max="2200" value={year} onChange={e=>setYear(e.target.value)}/></label></div></Panel><Notice error={state.error||opps.error}/><div className="tabs" role="tablist">{["overview","contacts","activities","opportunities","inquiries","estimates","projects","service","documents"].map(k=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?"tab active":"tab"} onClick={()=>setTab(k)}>{t(`CRM.${k}`)}</button>)}</div>
    {tab==="overview"?<><MetricStrip items={["opportunities","inquiries","estimates","projects"].map((k,index)=>({label:t(`CRM.${k}`),value:k==="opportunities"?opps.data?.total??0:state.data?.[k as "inquiries"|"estimates"|"projects"].length??0,tone:["blue","violet","amber","green"][index],icon:(["folder","inbox","file","layers"] as IconName[])[index],onClick:()=>setTab(k)}))}/><Panel title={t("CRM.lastActivity")}><p>{text(activities.data?.items?.[0]?.summary)||"—"} · {date(activities.data?.items?.[0]?.occurredAt)}</p></Panel><Panel title={t("CRM.followups")}><LocalRecords rows={(opps.data?.items??[]).filter(o=>o.nextAction&&!["WON","LOST","ON_HOLD"].includes(text(o.stage)))} columns={["name","nextAction","nextDue"]} onOpen={r=>openOpportunity(Number(r.id))}/></Panel><Panel title={t("CRM.sites")} actions={writable?<button className="btn default" onClick={()=>{setSiteEdit(null);setEditor("site");}}>{t("CRM.newSite")}</button>:null}><LocalRecords rows={state.data?.sites??[]} columns={["name","address","province","country"]} onOpen={writable?r=>{setSiteEdit(r);setEditor("site");}:undefined}/></Panel></>:null}
    {tab==="contacts"?<ContactList bootstrap={props.bootstrap} customerId={id}/>:null}
    {tab==="activities"?<ActivityList bootstrap={props.bootstrap} customerId={id} year={year}/>:null}
    {tab==="opportunities"?<LocalRecords rows={opps.data?.items??[]} columns={["name","opportunityNo","stage","nextAction"]} onOpen={r=>openOpportunity(Number(r.id))}/>:null}
    {tab==="inquiries"?<LocalRecords rows={state.data?.inquiries??[]} columns={["inquiryNo","projectName","status","dueDate"]} onOpen={r=>props.openInquiry(Number(r.id))}/>:null}
    {tab==="estimates"?<LocalRecords rows={state.data?.estimates??[]} columns={["estimateNo","revision","status","total"]} onOpen={r=>props.openEstimate(Number(r.id))}/>:null}
    {tab==="projects"?<LocalRecords rows={state.data?.projects??[]} columns={["projectNo","name","status","targetDelivery"]} onOpen={r=>props.openProject(Number(r.id))}/>:null}
    {tab==="service"?<><p>{t("CRM.serviceHistory")}</p><LocalRecords rows={state.data?.service??[]} columns={["reportNo","title","revision","status","reportDate"]} onOpen={r=>r.projectId?props.openProject(Number(r.projectId)):props.openInquiry(Number(r.inquiryId))}/></>:null}
    {tab==="documents"?<CrmDocuments bootstrap={props.bootstrap} customerId={id} year={year}/>:null}
    {editor==="customer"?<Editor title="CRM.editCustomer" subtitle={`${text(customer.code)} · ${text(customer.name)}`} size="lg" initial={{...customer,nameEn:customer.nameEn||(!customer.nameTh&&!customer.nameJa?customer.name:"")}} fields={[{key:"nameTh"},{key:"nameEn"},{key:"nameJa"},{key:"shortName"},{key:"industry"},{key:"country"},{key:"website",type:"url"},{key:"accountOwnerId",options:teamOptions(props.bootstrap)},{key:"site",wide:true},{key:"isActive",type:"checkbox"}]} onClose={()=>setEditor(null)} onSave={async v=>{await crmRequest(`/api/v1/crm/customers/${id}`,"PUT",v);await props.refreshBootstrap?.();state.refresh();}}/>:null}
    {editor==="site"?<Editor title="CRM.newSite" initial={siteEdit??{country:customer.country}} fields={[{key:"code",required:true},{key:"name",label:"CRM.siteName",required:true},{key:"address",wide:true},{key:"province"},{key:"country"},{key:"accessNote",type:"textarea",wide:true}]} onClose={()=>setEditor(null)} onSave={async v=>{await crmRequest(`/api/v1/crm/customers/${id}/sites${siteEdit?`/${siteEdit.id}`:""}`,siteEdit?"PUT":"POST",v);state.refresh();}}/>:null}
  </>;
}

function ContactList({bootstrap,customerId}:{bootstrap:BootstrapData;customerId?:number}) {
  const t=useT(),[search,setSearch]=useState(""),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[edit,setEdit]=useState<CrmRecord|null>(null);
  const state=useCrmData<Page>(`/api/v1/crm/contacts?${new URLSearchParams({search,page:String(page),pageSize:String(pageSize),...(customerId?{customerId:String(customerId)}:{})})}`),writable=bootstrap.permissions.includes("crm.contact.write");
  const rows=state.data?.items??[];
  return <><MetricStrip items={[{label:"CRM.totalContacts",value:state.data?.total??0,tone:"blue",icon:"users"},{label:"CRM.shown",value:rows.length,tone:"slate",icon:"eye"},{label:"CRM.withEmail",value:rows.filter(r=>r.email).length,tone:"green",icon:"send"},{label:"CRM.withRole",value:rows.filter(r=>r.contactRole).length,tone:"violet",icon:"shield"}]}/><div className="toolbar crm-filters"><SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="CRM.search"/><span className="spacer"/>{writable?<button className="btn primary" onClick={()=>setEdit({customerId:customerId??""})}><Icon name="plus"/>{t("CRM.newContact")}</button>:null}</div><Notice error={state.error} loading={state.loading}/><Panel flush title={`${state.data?.total??0} ${t("CRM Contacts")}`}><Records rows={rows} columns={["name","customerName","position","department","email","phone","contactRole"]} onOpen={writable?setEdit:undefined} page={state.data} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}}/></Panel>
    {edit?<Editor title={edit.id?"Edit":"CRM.newContact"} initial={{...edit,nameEn:edit.nameEn||(!edit.nameTh&&!edit.nameJa?edit.name:"")}} fields={[{key:"customerId",required:true,options:bootstrap.customers.map(c=>({value:String(c.id),label:c.name}))},{key:"nameTh"},{key:"nameEn"},{key:"nameJa"},{key:"email",type:"email"},{key:"phone"},{key:"department"},{key:"position"}]} onClose={()=>setEdit(null)} onSave={async v=>{await crmRequest(`/api/v1/sales/customers/${v.customerId}/contacts${edit.id?`/${edit.id}`:""}`,edit.id?"PUT":"POST",{...v,siteId:v.siteId||undefined});state.refresh();}}>{(v,set)=><ContactSite customerId={Number(v.customerId)} value={v} set={set}/>}</Editor>:null}
  </>;
}
function ContactSite({customerId,value,set}:{customerId:number;value:CrmRecord;set:(v:CrmRecord)=>void}){const data=useCrmData<CustomerDetail>(customerId?`/api/v1/crm/customers/${customerId}`:null);return value.id?null:<Fields fields={[{key:"siteId",options:(data.data?.sites??[]).map(r=>({value:text(r.id),label:text(r.name)}))}]} value={value} set={set}/>;}

function CrmDocuments({bootstrap,customerId,opportunityId,activityId,year}:{bootstrap:BootstrapData;customerId:number;opportunityId?:number;activityId?:number;year?:string}) {
  const t=useT(),state=useCrmData<CrmRecord[]>(`/api/v1/crm/documents?customerId=${customerId}${opportunityId?`&opportunityId=${opportunityId}`:""}${activityId?`&activityId=${activityId}`:""}${year?`&year=${year}`:""}`),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  const download=async(r:CrmRecord)=>{setError(false);try{const blob=await downloadCrmDocument(Number(r.id)),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=text(r.name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError(true);}};
  return <Panel title={t("CRM.documents")}><Notice error={error||state.error} loading={busy}/>{bootstrap.permissions.includes("crm.activity.write")?<label className="crm-upload">{t("CRM.upload")}<input type="file" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setError(false);void uploadCrmDocument(file,customerId,opportunityId,activityId).then(state.refresh).catch(()=>setError(true)).finally(()=>setBusy(false));e.target.value="";}}/></label>:null}<LocalRecords rows={state.data??[]} columns={["name","uploadedByName","uploadedAt","sizeBytes"]} onOpen={r=>void download(r)}/></Panel>;
}
function Configuration({options,onClose,refresh}:{options:CrmRecord[];onClose:()=>void;refresh:()=>void}) {
  const t=useT(),[edit,setEdit]=useState<CrmRecord|null>(null);return <Modal size="xl" title={t("CRM.configuration")} onClose={onClose}><div className="crm-editor"><button className="btn primary" onClick={()=>setEdit({kind:"source",isActive:true})}>{t("Add")}</button><LocalRecords rows={options} columns={["code","kind","labelEn","quietDays"]} onOpen={setEdit}/>{edit?<Editor title="CRM.configuration" initial={edit} fields={[...(!edit.rowVersion?[{key:"kind",required:true,options:["source","lostReason","contactRole"].map(k=>({value:k,label:t(`CRM.${k}`)}))},{key:"code",required:true}]:[]),{key:"labelTh",required:true},{key:"labelEn",required:true},{key:"labelJa",required:true},...(edit.kind==="stage"?[{key:"quietDays",type:"number"}]:[{key:"isActive",type:"checkbox"}])]} onClose={()=>setEdit(null)} onSave={async v=>{await crmRequest(`/api/v1/crm/options/${v.kind}/${encodeURIComponent(text(v.code))}`,"PUT",v);refresh();}}/>:null}</div></Modal>;
}

export function CrmMyWork({openOpportunity}:{openOpportunity?:(id:number)=>void}) {
  const t=useT(),state=useCrmData<{actions:CrmRecord[];attention:CrmRecord[]}>("/api/v1/crm/my-work"),[error,setError]=useState(false),[busy,setBusy]=useState(false);
  return <Panel title={t("CRM.followups")}><Notice error={state.error||error} loading={state.loading}/>{!state.data?.actions.length&&!state.data?.attention.length?<EmptyState icon="checkCircle" title="CRM.empty" message="CRM.emptyHint"/>:null}{state.data?.actions.map(r=><div className="crm-action" key={text(r.id)}><div><button className="crm-link" onClick={()=>openOpportunity?.(Number(r.opportunityId))}>{text(r.action)}</button><p>{text(r.opportunityName)} · {date(r.dueDate)} · {t(`CRM.${r.status}`)}</p></div><button className="btn default" disabled={busy} onClick={()=>{setBusy(true);setError(false);void crmRequest(`/api/v1/crm/opportunities/${r.opportunityId}/followups/${r.id}`,"PUT",{rowVersion:r.rowVersion,status:"Done"}).then(state.refresh).catch(()=>setError(true)).finally(()=>setBusy(false));}}>{t("CRM.Done")}</button></div>)}{state.data?.attention.map(r=><div className="crm-action" key={`attention-${r.id}`}><button className="crm-link" onClick={()=>openOpportunity?.(Number(r.id))}>{text(r.name)}</button><span>{(r.attention as string[]).map(a=>t(`CRM.${a}`)).join(" · ")}</span></div>)}</Panel>;
}

export function CrmInquirySource({inquiryId,enabled}:{inquiryId:number;enabled:boolean}) {
  const t=useT(),state=useCrmData<CrmRecord>(enabled?`/api/v1/crm/inquiries/${inquiryId}/source`:null);
  return state.data?<div className="alert info"><a href={`#crm/${state.data.id}`}>{t("CRM.sourceOpportunity")}: {text(state.data.opportunityNo)} · {text(state.data.name)}</a><p>{text(state.data.salesOwnerName)} · {text(state.data.technicalOwnerName)}</p><small>{t("CRM.filesInherited")}</small></div>:null;
}
