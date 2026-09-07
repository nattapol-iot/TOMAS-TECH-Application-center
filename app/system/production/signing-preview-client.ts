import { apiRequest } from "../api-client";

export type Placement = { page:number;x:number;y:number;width:number;height:number };
export type SignaturePreview = {pdfBase64:string;sourceSha256:string;pageCount:number;specimen:{id:number;imageBase64:string}|null;stampImageBase64:string|null;legacyMarkCount:number};
export type PlacementConfirmation = {placement:Placement;stampPlacement?:Placement;sourceSha256:string;previewSpecimenId:number};
export const getSignaturePreview=(documentId:number,fileId:number,stepId?:number)=>apiRequest<SignaturePreview>(`/api/v1/signing/documents/${documentId}/preview?fileId=${fileId}${stepId?`&stepId=${stepId}`:""}`);
export const signPositionedStep=(stepId:number,input:PlacementConfirmation & {note?:string;rowVersion:string})=>apiRequest<{stepId:number;state:string;requestComplete:boolean}>(`/api/v1/signing/steps/${stepId}/sign`,{method:"POST",body:JSON.stringify(input)});

export function movePlacement(p:Placement,dx:number,dy:number,resize:boolean):Placement {
  const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
  return resize ? {...p,width:clamp(p.width+dx,.01,1-p.x),height:clamp(p.height+dy,.01,1-p.y)} : {...p,x:clamp(p.x+dx,0,1-p.width),y:clamp(p.y+dy,0,1-p.height)};
}
