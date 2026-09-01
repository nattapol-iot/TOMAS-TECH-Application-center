const fs=require('node:fs');
function edit(path, fn){let s=fs.readFileSync(path,'utf8');s=fn(s);fs.writeFileSync(path,s)}
function replace(s,a,b){if(!s.includes(a))throw Error('Missing '+a);return s.replaceAll(a,b)}
edit('backend-node/src/routes/sales-customers.ts',s=>{
s=replace(s,'type ContactInput = LocalizedNameInput & {','type ContactInput = LocalizedNameInput & ContactTitleInput & {');
s=replace(s,'type CustomerInput = LocalizedNameInput & {','type CustomerInput = LocalizedNameInput & { contactTitleTh: string; contactTitleEn: string; contactTitleJa: string;');
s=replace(s,'function email(value: unknown): string {',`export type ContactTitleInput = { titleTh: string; titleEn: string; titleJa: string };
export function contactTitleInput(body: Record<string, unknown>, customer = false): ContactTitleInput {
  return {
    titleTh: clean(body[customer ? "contactTitleTh" : "titleTh"], 50, "Title (Thai)"),
    titleEn: clean(body[customer ? "contactTitleEn" : "titleEn"], 50, "Title (English)"),
    titleJa: clean(body[customer ? "contactTitleJa" : "titleJa"], 50, "Honorific (Japanese)"),
  };
}

function email(value: unknown): string {`);
s=replace(s,'const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);','const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);\n  const titles = contactTitleInput(body, true);');
s=replace(s,'contact: contactNames.name,','contactTitleTh: titles.titleTh, contactTitleEn: titles.titleEn, contactTitleJa: titles.titleJa,\n    contact: contactNames.name,');
s=replace(s,'input.email || input.phone || input.department || input.position','input.email || input.phone || input.department || input.position || input.contactTitleTh || input.contactTitleEn || input.contactTitleJa');
s=replace(s,'return { ...localizedNameInput(body, "", "name", 200, "Contact name", true),','return { ...contactTitleInput(body), ...localizedNameInput(body, "", "name", 200, "Contact name", true),');
s=replace(s,'q.input("name_th", sql.NVarChar(200), input.nameTh);','q.input("title_th", sql.NVarChar(50), input.titleTh); q.input("title_en", sql.NVarChar(50), input.titleEn); q.input("title_ja", sql.NVarChar(50), input.titleJa);\n  q.input("name_th", sql.NVarChar(200), input.nameTh);');
s=replace(s,'customer_site_contacts(site_id,name,name_th,name_en,name_ja,email','customer_site_contacts(site_id,name,title_th,title_en,title_ja,name_th,name_en,name_ja,email');
s=replace(s,'VALUES(@site,@name,@name_th,@name_en,@name_ja,@email','VALUES(@site,@name,@title_th,@title_en,@title_ja,@name_th,@name_en,@name_ja,@email');
s=replace(s,'sc.department,sc.position,sc.name_th','sc.department,sc.position,sc.title_th,sc.title_en,sc.title_ja,sc.name_th');
s=replace(s,'SELECT TOP(1) id,name,name_th,name_en,name_ja,email','SELECT TOP(1) id,name,title_th,title_en,title_ja,name_th,name_en,name_ja,email');
s=replace(s,'SET name=@name,name_th=@name_th','SET name=@name,title_th=@title_th,title_en=@title_en,title_ja=@title_ja,name_th=@name_th');
s=replace(s,"COALESCE(primary_contact.name_th,N'') contact_name_th", "COALESCE(primary_contact.title_th,N'') contact_title_th,COALESCE(primary_contact.title_en,N'') contact_title_en,COALESCE(primary_contact.title_ja,N'') contact_title_ja,COALESCE(primary_contact.name_th,N'') contact_name_th");
s=replace(s,'sc.name,sc.name_th,sc.name_en,sc.name_ja,sc.email','sc.name,sc.title_th,sc.title_en,sc.title_ja,sc.name_th,sc.name_en,sc.name_ja,sc.email');
s=replace(s,'name: r.name, nameTh: r.name_th','name: r.name, titleTh: r.title_th, titleEn: r.title_en, titleJa: r.title_ja, nameTh: r.name_th');
s=replace(s,'name: customer.contact, nameTh:','name: customer.contact, titleTh: customer.contact_title_th, titleEn: customer.contact_title_en, titleJa: customer.contact_title_ja, nameTh:');
s=replace(s,'{ name: input.contact, nameTh:','{ name: input.contact, titleTh: input.contactTitleTh, titleEn: input.contactTitleEn, titleJa: input.contactTitleJa, nameTh:');
return s;
});
edit('backend-node/src/routes/master.ts',s=>{
s=replace(s,'import { localizedNameInput,','import { contactTitleInput, localizedNameInput,');
s=replace(s,'type CustomerInput = {','type CustomerInput = { contactTitleTh: string; contactTitleEn: string; contactTitleJa: string;');
s=replace(s,'const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);','const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);\n  const titles = contactTitleInput(body, true);');
s=replace(s,'contact: contactNames.name,','contactTitleTh: titles.titleTh, contactTitleEn: titles.titleEn, contactTitleJa: titles.titleJa,\n    contact: contactNames.name,');
s=replace(s,'input.department || input.position','input.department || input.position || input.contactTitleTh || input.contactTitleEn || input.contactTitleJa');
s=replace(s,'Enter the contact name when providing department or position.','Enter the contact name when providing contact titles, department or position.');
s=replace(s,'{ name: input.contact, nameTh:','{ name: input.contact, titleTh: input.contactTitleTh, titleEn: input.contactTitleEn, titleJa: input.contactTitleJa, nameTh:');
s=replace(s,"COALESCE(primary_contact.name_th,N'') contactNameTh", "COALESCE(primary_contact.title_th,N'') contactTitleTh,COALESCE(primary_contact.title_en,N'') contactTitleEn,COALESCE(primary_contact.title_ja,N'') contactTitleJa,COALESCE(primary_contact.name_th,N'') contactNameTh");
s=replace(s,'if (body.contactNameTh === undefined)', 'if (body.contactTitleTh === undefined) input.contactTitleTh = before.contactTitleTh;\n      if (body.contactTitleEn === undefined) input.contactTitleEn = before.contactTitleEn;\n      if (body.contactTitleJa === undefined) input.contactTitleJa = before.contactTitleJa;\n      if (body.contactNameTh === undefined)');
s=replace(s,'contactNameTh: input.contactNameTh,','contactTitleTh: input.contactTitleTh, contactTitleEn: input.contactTitleEn, contactTitleJa: input.contactTitleJa, contactNameTh: input.contactNameTh,');
return s;
});
edit('backend-node/src/routes/bootstrap.ts',s=>{
s=replace(s,'contact_name_th: string;','contact_title_th: string; contact_title_en: string; contact_title_ja: string; contact_name_th: string;');
s=replace(s,"COALESCE(primary_contact.name_th,N'') contact_name_th", "COALESCE(primary_contact.title_th,N'') contact_title_th,COALESCE(primary_contact.title_en,N'') contact_title_en,COALESCE(primary_contact.title_ja,N'') contact_title_ja,COALESCE(primary_contact.name_th,N'') contact_name_th");
s=replace(s,'contactNameTh: row.contact_name_th,','contactTitleTh: row.contact_title_th, contactTitleEn: row.contact_title_en, contactTitleJa: row.contact_title_ja, contactNameTh: row.contact_name_th,');
return s;
});
edit('database/scripts/020_deploy_fresh_database.sql',s=>replace(replace(s,':r database/migrations/030_customer_multilingual_names.sql',':r database/migrations/030_customer_multilingual_names.sql\n:r database/migrations/031_customer_contact_titles.sql'),'28, 29, 30)) <> 30','28, 29, 30, 31)) <> 31'));
