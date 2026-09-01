"use client";
import { useT as useStaticCopy } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { downloadSignedOutput } from "../api-client";
import { Modal } from "../ui";
import { getSignaturePreview, movePlacement, type SignaturePreview, type Placement, type PlacementConfirmation } from "./signing-preview-client";
import "./signing-preview.css";

const message=(error:unknown)=>error instanceof Error?error.message:"Preview failed. Try again.";
const decode=(base64:string)=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));

function PdfCanvas({bytes,page,children,onReady,onError}:{bytes:Uint8Array;page:number;children?:ReactNode;onReady:(pages:number)=>void;onError:(message:string)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let cancelled=false;let pdf:PDFDocumentProxy|undefined;let loading:ReturnType<typeof import("pdfjs-dist").getDocument>|undefined;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>|undefined;
    void (async()=>{
      try {
        const lib=await import("pdfjs-dist");lib.GlobalWorkerOptions.workerSrc=workerUrl;
        if(cancelled)return;
        loading=lib.getDocument({data:bytes.slice()});pdf=await loading.promise;
        const selected=await pdf.getPage(page);if(cancelled || !canvas.current)return;
        const base=selected.getViewport({scale:1});const viewport=selected.getViewport({scale:Math.min(2,1200/base.width)});
        canvas.current.width=Math.ceil(viewport.width);canvas.current.height=Math.ceil(viewport.height);
        render=selected.render({canvas:canvas.current,viewport});await render.promise;
        if(!cancelled)onReady(pdf.numPages);
      }catch(error){if(!cancelled)onError(message(error));}
    })();
    return ()=>{cancelled=true;render?.cancel();void loading?.destroy();};
  },[bytes,page,onReady,onError]);
  return <div className="sign-page"><canvas ref={canvas} aria-label={`Document page ${page}`} />{children}</div>;
}

export function SigningPreview({documentId,fileId,stepId,stepNo=1,onClose,onConfirm}:{documentId:number;fileId:number;stepId?:number;stepNo?:number;onClose:()=>void;onConfirm?:(value:PlacementConfirmation)=>void}) {
  const [preview,setPreview]=useState<SignaturePreview|null>(null),[bytes,setBytes]=useState<Uint8Array|null>(null),[error,setError]=useState("");
  const [page,setPage]=useState(1),[pages,setPages]=useState(0),[confirmed,setConfirmed]=useState(false);
  const [signature,setSignature]=useState<Placement>({page:1,x:.06+((stepNo-1)%3)*.30,y:.86,width:.22,height:.07});
  const [stamp,setStamp]=useState<Placement>({page:1,x:.74,y:.66,width:.16,height:.14});
  const [active,setActive]=useState<"signature"|"stamp">("signature");
  const drag=useRef<{x:number;y:number;placement:Placement;resize:boolean;width:number;height:number}|null>(null);
  useEffect(()=>{let cancelled=false;void getSignaturePreview(documentId,fileId,stepId).then(value=>{if(!cancelled){setPreview(value);setBytes(decode(value.pdfBase64));}}).catch(error=>{if(!cancelled)setError(message(error));});return()=>{cancelled=true;};},[documentId,fileId,stepId]);
  const placement=active==="signature"?signature:stamp;
  const change=(value:Placement)=>{setConfirmed(false);if(active==="signature")setSignature(value);else setStamp(value);};
  const editable=Boolean(stepId && preview?.specimen && onConfirm);
  function start(event:PointerEvent<HTMLButtonElement>,resize:boolean,selected=placement) {
    const bounds=event.currentTarget.closest(".sign-page")!.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
    drag.current={x:event.clientX,y:event.clientY,placement:selected,resize,width:bounds.width,height:bounds.height};
  }
  function move(event:PointerEvent<HTMLButtonElement>) {
    if(!drag.current)return;const d=drag.current;change(movePlacement(d.placement,(event.clientX-d.x)/d.width,(event.clientY-d.y)/d.height,d.resize));
  }
  const marker=(kind:"signature"|"stamp",p:Placement,image:string)=>p.page!==page?null:<div className={`sign-mark ${kind===active?"selected":""}`} style={{left:`${p.x*100}%`,top:`${p.y*100}%`,width:`${p.width*100}%`,height:`${p.height*100}%`}}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`data:image/png;base64,${image}`} alt={kind} draggable={false}/>
    <button type="button" className="sign-drag" aria-label={`Move ${kind}; arrow keys move, Shift + arrow resizes`} onFocus={()=>setActive(kind)} onPointerDown={e=>{setActive(kind);start(e,false,p);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{const delta:{[key:string]:[number,number]}={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]};if(delta[e.key]){e.preventDefault();change(movePlacement(p,...delta[e.key],e.shiftKey));}}} />
    {kind===active?<button type="button" className="sign-resize" aria-label={`Resize ${kind}`} onPointerDown={e=>start(e,true)} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>↘</button>:null}
  </div>;
  return <Modal title={editable?"Preview & position signature / จัดตำแหน่งลายเซ็น":"Document preview / พรีวิวเอกสาร"} size="xl" onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}><LocalizedText text={"Close"} /></button>
    {editable?<button className="btn primary" disabled={!confirmed || !pages || Boolean(error)} onClick={()=>onConfirm!({placement:signature,...(preview?.stampImageBase64?{stampPlacement:stamp}:{}),sourceSha256:preview!.sourceSha256,previewSpecimenId:preview!.specimen!.id})}>Use these positions / ยืนยันตำแหน่ง</button>:null}
  </>}>
    <div className="sign-preview">
      {error?<div className="callout warning" role="alert">{error}</div>:null}
      {!bytes && !error?<p role="status">Loading frozen revision…</p>:null}
      {bytes?<>
        <div className="sign-preview-tools"><label><LocalizedText text={"Page"} /> <select value={page} onChange={e=>{setPages(0);setPage(Number(e.target.value));}}>{Array.from({length:preview?.pageCount??1},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
          {editable?<><label><LocalizedText text={"Mark"} /> <select value={active} onChange={e=>setActive(e.target.value as "signature"|"stamp")}><option value="signature">Signature</option>{preview?.stampImageBase64?<option value="stamp"><LocalizedText text={"Company stamp"} /></option>:null}</select></label>
          <button className="btn sm" onClick={()=>change({...placement,page})}>Move selected mark to page {page}</button>
          {(["x","y","width","height"] as const).map(key=><label key={key}>{key} %<input type="number" step="0.5" min={key==="x"||key==="y"?0:1} max={100} value={Number((placement[key]*100).toFixed(2))} onChange={e=>{const value=Number(e.target.value)/100;if(!Number.isFinite(value))return;change(movePlacement(placement,key==="x"?value-placement.x:key==="width"?value-placement.width:0,key==="y"?value-placement.y:key==="height"?value-placement.height:0,key==="width"||key==="height"));}}/></label>)}</>:null}
        </div>
        {editable?<p className="muted">ลากลายเซ็นเพื่อย้าย • ลากมุม ↘ เพื่อปรับขนาด • เลือกหน้าที่ต้องการ • ลายเซ็นเดิมแก้ไม่ได้</p>:null}
        {preview?.legacyMarkCount?<p className="callout warning">{preview.legacyMarkCount} earlier marks have no page coordinates; their evidence remains on the signature certificate.</p>:null}
        <div className="sign-preview-scroll"><PdfCanvas bytes={bytes} page={page} onReady={setPages} onError={setError}>
          {editable && preview?.specimen?marker("signature",signature,preview.specimen.imageBase64):null}
          {editable && preview?.stampImageBase64?marker("stamp",stamp,preview.stampImageBase64):null}
        </PdfCanvas></div>
        {editable?<label className="sign-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> ตรวจสอบหน้า ตำแหน่ง และขนาดแล้ว (การลงนามจะเกิดเมื่อกด SIGN DOCUMENT เท่านั้น)</label>:null}
      </>:null}
    </div>
  </Modal>;
}

export function SignedFilePreview({requestId,onClose}:{requestId:number;onClose:()=>void}) {
  const localizeCopy = useStaticCopy();
  const [url,setUrl]=useState(""),[bytes,setBytes]=useState<Uint8Array|null>(null),[error,setError]=useState(""),[page,setPage]=useState(1),[pages,setPages]=useState(0),[html,setHtml]=useState<string|null>(null);
  useEffect(()=>{let cancelled=false;let created="";void downloadSignedOutput(requestId).then(async({blob})=>{const pdf=blob.type.startsWith("application/pdf");const data=pdf?new Uint8Array(await blob.arrayBuffer()):await blob.text();if(cancelled)return;created=URL.createObjectURL(blob);setUrl(created);if(typeof data==="string")setHtml(data);else setBytes(data);}).catch(e=>{if(!cancelled)setError(message(e));});return()=>{cancelled=true;if(created)URL.revokeObjectURL(created);};},[requestId]);
  return <Modal title="Signed file / ไฟล์ที่ลงนามแล้ว" size="xl" onClose={onClose} footer={<><button className="btn" onClick={onClose}><LocalizedText text={"Close"} /></button>{url?<a className="btn primary" href={url} download={`signed-request-${requestId}.${bytes?"pdf":"html"}`}>Download signed file</a>:null}</>}>
    <div className="sign-preview">
      <p className="callout">Read-only • ตำแหน่งลายเซ็นที่ลงนามแล้วถูกล็อก ต้องสร้าง Revision ใหม่หากต้องการแก้ไข</p>
      {error?<p role="alert">{error}</p>:null}{!url&&!error?<p role="status">Loading signed file…</p>:null}
      {bytes?<><label><LocalizedText text={"Page"} /> <select value={page} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:pages||1},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><div className="sign-preview-scroll"><PdfCanvas bytes={bytes} page={page} onReady={setPages} onError={setError}/></div></>:null}
      {html!==null?<><p className="muted">Legacy HTML signature certificate (original signed evidence preserved).</p><iframe title={localizeCopy("Signed certificate")} srcDoc={html} sandbox="" className="sign-certificate-frame"/></>:null}
    </div>
  </Modal>;
}
