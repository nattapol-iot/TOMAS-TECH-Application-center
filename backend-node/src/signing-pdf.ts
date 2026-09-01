import { createHash } from "node:crypto";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { ApiError } from "./errors.js";

/** Top-left normalized coordinates on the displayed CropBox, including page rotation. */
export type MarkPlacement = { page: number; x: number; y: number; width: number; height: number };
export type PdfMark = { placement: MarkPlacement | null; png: Uint8Array; label: string };

export function parsePlacement(value: unknown): MarkPlacement | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new ApiError(400,"invalid_placement","Invalid signature placement.");
  const input=value as Record<string,unknown>;
  const p:Record<string,unknown>={...input,page:input.page ?? input.pageNo};
  if (!Number.isInteger(p.page) || Number(p.page)<1 || Number(p.page)>200) throw new ApiError(400,"invalid_placement","Choose a valid page.");
  for (const key of ["x","y","width","height"]) if(typeof p[key]!=="number" || !Number.isFinite(p[key])) throw new ApiError(400,"invalid_placement","Placement must contain finite numbers.");
  const result={page:Number(p.page),x:Number(Number(p.x).toFixed(6)),y:Number(Number(p.y).toFixed(6)),width:Number(Number(p.width).toFixed(6)),height:Number(Number(p.height).toFixed(6))};
  if(result.x<0 || result.y<0 || result.width<0.01 || result.height<0.01 || result.x+result.width>1.0000001 || result.y+result.height>1.0000001) throw new ApiError(400,"invalid_placement","Keep the entire signature inside the page (minimum size 1%).");
  return result;
}

export async function loadSigningPdf(bytes: Uint8Array, contentType: string, expectedHash?: string) {
  if(expectedHash && createHash("sha256").update(bytes).digest("hex").toLowerCase()!==expectedHash.toLowerCase()) throw new ApiError(409,"source_hash_mismatch","The frozen source file failed its checksum check.");
  let pdf: PDFDocument;
  try {
    if(contentType.startsWith("application/pdf")) {
      pdf=await PDFDocument.load(bytes);
      if(pdf.getForm().getFields().some(field=>field.constructor.name==="PDFSignature")) throw new ApiError(422,"external_signature","This PDF contains a digital-signature field. Use an unsigned source revision; its existing signature must not be invalidated.");
    } else if(contentType==="image/png" || contentType==="image/jpeg") {
      pdf=await PDFDocument.create();
      const image=contentType==="image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale=Math.min(1,1600/Math.max(image.width,image.height));
      const page=pdf.addPage([image.width*scale,image.height*scale]);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});
    } else throw new ApiError(422,"placement_format","Positioned signing supports PDF, PNG and JPG. Other formats retain the signature certificate workflow.");
    if(!pdf.getPageCount() || pdf.getPageCount()>200) throw new ApiError(422,"pdf_page_limit","Positioned signing supports 1–200 pages.");
    for(const page of pdf.getPages()) {
      const box=page.getCropBox();
      if(box.width<=0 || box.height<=0 || Math.max(box.width,box.height)>20000 || page.getRotation().angle%90!==0) throw new ApiError(422,"pdf_geometry","Unsupported PDF page geometry.");
    }
    return pdf;
  } catch(error) { if(error instanceof ApiError) throw error; throw new ApiError(422,"pdf_unreadable","Cannot read this PDF/image. Check that it is valid and not password protected."); }
}

export function validatePage(pdf: PDFDocument, placement: MarkPlacement) {
  if(placement.page>pdf.getPageCount()) throw new ApiError(400,"invalid_placement_page","The selected page does not exist in this revision.");
}

export function imageTransform(box:{x:number;y:number;width:number;height:number}, rotation:number, rect:{x:number;y:number;width:number;height:number}) {
  const r=((rotation%360)+360)%360;
  if(r===90) return {x:box.x+rect.y+rect.height,y:box.y+rect.x,rotate:degrees(90)};
  if(r===180) return {x:box.x+box.width-rect.x,y:box.y+rect.y+rect.height,rotate:degrees(180)};
  if(r===270) return {x:box.x+box.width-rect.y-rect.height,y:box.y+box.height-rect.x,rotate:degrees(270)};
  return {x:box.x+rect.x,y:box.y+box.height-rect.y-rect.height,rotate:degrees(0)};
}

export async function paintMarks(pdf: PDFDocument, marks: PdfMark[]) {
  for(const mark of marks) {
    const p=mark.placement;if(!p) continue;validatePage(pdf,p);
    const page=pdf.getPage(p.page-1), box=page.getCropBox(), rotation=page.getRotation().angle;
    const sideways=Math.abs(rotation%180)===90;
    const displayWidth=sideways?box.height:box.width,displayHeight=sideways?box.width:box.height;
    const image=await pdf.embedPng(mark.png);
    const scale=Math.min(p.width*displayWidth/image.width,p.height*displayHeight/image.height);
    const width=image.width*scale,height=image.height*scale;
    const rect={x:p.x*displayWidth+(p.width*displayWidth-width)/2,y:p.y*displayHeight+(p.height*displayHeight-height)/2,width,height};
    page.drawImage(image,{...imageTransform(box,rotation,rect),width,height});
  }
}

export async function appendPdfCertificate(pdf: PDFDocument, marks: PdfMark[], info:{number:string;revision:string;verifyCode:string;hash:string;chain:string}) {
  let page=pdf.addPage([595,842]);let y=792;
  const write=(text:string,size=10)=>{page.drawText(text.replace(/[^\x20-\x7e]/g,"?"),{x:36,y,size,color:rgb(.08,.15,.25)});y-=size+10;};
  write("Signature record - internal electronic workflow",17);
  write(`${info.number} / ${info.revision}`);write(`Verification code: ${info.verifyCode}`);
  write("Source SHA-256:",9);write(info.hash,8);write("Event chain at rendering:",9);write(info.chain,8);
  write("Images below are evidence of completed steps, not a PKI digital signature.",9);
  for(const mark of marks) {
    if(y<150){page=pdf.addPage([595,842]);y=792;}
    write(mark.label,10);
    write(mark.placement?`On source page ${mark.placement.page}`:"Legacy anchor: image recorded here; no source-page position was selected.",8);
    const image=await pdf.embedPng(mark.png);const scale=Math.min(220/image.width,55/image.height);
    page.drawImage(image,{x:36,y:y-55,width:image.width*scale,height:image.height*scale});y-=85;
  }
}
