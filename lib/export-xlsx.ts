type CellValue = string | number | null | undefined;

const encoder = new TextEncoder();
const escapeXml = (value: string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const columnName = (index:number) => { let name=""; for(let n=index+1;n>0;n=Math.floor((n-1)/26)) name=String.fromCharCode(65+(n-1)%26)+name; return name; };

function crc32(bytes:Uint8Array) { let crc=0xffffffff; for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);} return (crc^0xffffffff)>>>0; }
function u16(value:number){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,value,true);return b;}
function u32(value:number){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,value,true);return b;}
function join(parts:Uint8Array[]){const size=parts.reduce((s,p)=>s+p.length,0);const out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}

function zip(entries:Record<string,string>) {
  const local:Uint8Array[]=[]; const central:Uint8Array[]=[]; let offset=0;
  for(const [name,text] of Object.entries(entries)){
    const filename=encoder.encode(name); const data=encoder.encode(text); const crc=crc32(data);
    const header=join([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(filename.length),u16(0),filename]);
    local.push(header,data);
    central.push(join([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(filename.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),filename]));
    offset+=header.length+data.length;
  }
  const centralBytes=join(central); const end=join([u32(0x06054b50),u16(0),u16(0),u16(central.length),u16(central.length),u32(centralBytes.length),u32(offset),u16(0)]);
  return join([...local,centralBytes,end]);
}

function worksheetXml(rows:CellValue[][]) {
  const body=rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,colIndex)=>{
    if(value===null||value===undefined||value==="") return "";
    const ref=`${columnName(colIndex)}${rowIndex+1}`; const style=rowIndex===0?1:rowIndex===5?2:(colIndex===7||colIndex===9?3:0);
    return typeof value==="number"?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="44" customWidth="1"/><col min="4" max="4" width="25" customWidth="1"/><col min="5" max="7" width="14" customWidth="1"/><col min="8" max="10" width="16" customWidth="1"/><col min="11" max="12" width="14" customWidth="1"/></cols><sheetData>${body}</sheetData><mergeCells count="1"><mergeCell ref="A1:L1"/></mergeCells></worksheet>`;
}

export function exportXlsx(rows:CellValue[][],filename:string) {
  const files={
    "[Content_Types].xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary cost" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00B050"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml":worksheetXml(rows),
  };
  const bytes=zip(files); const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}); const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download=filename; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
