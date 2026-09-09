/** Browser-safe allowlist shared by template preview/editor and server writes.
 * Free text in these fields is reusable instruction/requirement text. Review it
 * before publishing a library template; field filtering cannot anonymize prose.
 */
export const REPORT_TEMPLATE_FIELDS:Record<string,{repeat:boolean;fields:readonly string[]}>= {
 overview:{repeat:false,fields:['objective']},
 hardware:{repeat:true,fields:['item','action']},
 software:{repeat:true,fields:['module','action']},
 commissioning:{repeat:true,fields:['checkpoint','expected']},
 scenarios:{repeat:true,fields:['scenario','step','input','expected']},
 assets:{repeat:true,fields:['name','assetType']},
 measurements:{repeat:true,fields:['parameter','unit','specValue']},
 checkpoints:{repeat:true,fields:['checkpoint','expected','unit','category']},
 trials:{repeat:true,fields:['hypothesis','successCriteria','trial']},
 deliverables:{repeat:true,fields:['item']},
};
export const REPORT_TEMPLATE_SECTIONS_BY_TYPE:Record<string,readonly string[]>={
 INSTALLATION:['overview','hardware','software','commissioning','deliverables'],
 UAT:['overview','scenarios','deliverables'],
 SERVICE:['overview','hardware','software','deliverables'],
 INSPECTION:['overview','assets','measurements','checkpoints','deliverables'],
 POC:['overview','trials','deliverables'],
};
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function sanitizeReportTemplate(reportType:string,value:unknown):Record<string,unknown> {
 const sections=Object.hasOwn(REPORT_TEMPLATE_SECTIONS_BY_TYPE,reportType)?REPORT_TEMPLATE_SECTIONS_BY_TYPE[reportType]:undefined;
 if(!sections||!object(value))throw new Error('Select a supported report type and an object body.');
 const output:Record<string,unknown>={};
 for(const section of sections) {
  const rule=REPORT_TEMPLATE_FIELDS[section]!;
  const copy=(source:unknown):Record<string,string>=>{
   const result:Record<string,string>={};if(!object(source))return result;
   for(const field of rule.fields) {
    const text=Object.hasOwn(source,field)?source[field]:undefined;
    if(typeof text==='string'&&text.trim()) {
     if(text.length>20000)throw new Error(`Template ${section}.${field} exceeds 20000 characters.`);
     result[field]=text.trim();
    }
   }return result;
  };
  const source=Object.hasOwn(value,section)?value[section]:undefined;
  if(source==null)continue;
  if(rule.repeat) {
   if(!Array.isArray(source)||source.length>500)throw new Error(`Template ${section} must be a list of at most 500 rows.`);
   const rows=source.map(copy).filter(row=>Object.keys(row).length>0);if(rows.length)output[section]=rows;
  } else {
   if(!object(source))throw new Error(`Template ${section} must be an object.`);
   const row=copy(source);if(Object.keys(row).length)output[section]=row;
  }
 }
 return output;
}
