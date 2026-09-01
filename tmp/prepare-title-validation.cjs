const fs=require('node:fs');
function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')))}
edit('backend-node/tests/sales-customers.test.ts',s=>s.replaceAll('nameJa: "", email:', 'nameJa: "", titleTh: "", titleEn: "", titleJa: "", email:').replaceAll('nameJa: "ソムチャイ", email:', 'nameJa: "ソムチャイ", titleTh: "", titleEn: "", titleJa: "", email:')+`
test("contact titles stay separate, optional, bounded and require a named person", () => {
  for (const parse of [salesCustomerInput, customerInput]) {
    const result = parse({code:"TITLE",name:"Company",contact:"Somchai",contactTitleTh:" นาย ",contactTitleEn:"Mr.",contactTitleJa:"様"});
    assert.equal(result.contact,"Somchai"); assert.equal(result.contactTitleTh,"นาย"); assert.equal(result.contactTitleEn,"Mr."); assert.equal(result.contactTitleJa,"様");
    for(const key of ["contactTitleTh","contactTitleEn","contactTitleJa"]){
      for(const value of [123,{},"x".repeat(51)]) assert.throws(()=>parse({code:"TITLE",name:"Company",contact:"Somchai",[key]:value}),ApiError);
      assert.throws(()=>parse({code:"TITLE",name:"Company",[key]:"Dr."}),ApiError);
    }
  }
  const contact=salesContactInput({name:"山田",titleJa:"様"});
  assert.equal(contact.name,"山田"); assert.equal(contact.titleJa,"様");
});
`);
edit('backend-node/tests/sales-customer-integration.ts',s=>s
.replace("contactNameJa: 'テスト担当者', email:","contactNameJa: 'テスト担当者', contactTitleTh:'นาย', contactTitleEn:'Mr.', contactTitleJa:'様', email:")
.replace("assert.ok(customer.id > 0 && customer.code);","assert.ok(customer.id > 0 && customer.code);\n  assert.equal(customer.contactTitleTh,'นาย'); assert.equal(customer.contactTitleEn,'Mr.'); assert.equal(customer.contactTitleJa,'様');")
.replace("assert.equal(directory.contacts.length, 1);","assert.equal(directory.contacts.length, 1);\n  assert.equal(directory.contacts[0].titleTh,'นาย'); assert.equal(directory.contacts[0].titleEn,'Mr.'); assert.equal(directory.primaryContact.titleJa,'様');")
.replace("name: 'TEST ONLY Second', email:","name: 'TEST ONLY Second', titleTh:'ดร.', titleEn:'Dr.', titleJa:'先生', email:")
.replace("assert.equal(customerRow.position, customer.position);","assert.equal(customerRow.contactTitleTh,'นาย'); assert.equal(customerRow.contactTitleEn,'Mr.'); assert.equal(customerRow.contactTitleJa,'様');\n  assert.equal(customerRow.position, customer.position);")
.replace("department: '品質保証', position: 'QA Manager',","contactTitleTh:'ดร.', contactTitleEn:'Dr.', contactTitleJa:'先生', department: '品質保証', position: 'QA Manager',")
.replace("assert.equal(directory.primaryContact.position, 'QA Manager');","assert.equal(directory.primaryContact.titleTh,'ดร.'); assert.equal(directory.primaryContact.titleEn,'Dr.'); assert.equal(directory.primaryContact.titleJa,'先生');\n  assert.equal(directory.contacts.find((c: { id: number }) => c.id === added.id).titleEn,'Dr.');\n  assert.equal(directory.primaryContact.position, 'QA Manager');")
.replace("['department', 'position', 'nameTh'","['contactTitleTh', 'contactTitleEn', 'contactTitleJa', 'department', 'position', 'nameTh'")
.replace("assert.equal(legacyEdit.department, '品質保証');","assert.equal(legacyEdit.contactTitleTh,'ดร.'); assert.equal(legacyEdit.contactTitleEn,'Dr.'); assert.equal(legacyEdit.contactTitleJa,'先生');\n  assert.equal(legacyEdit.department, '品質保証');")
.replace("{ ...legacyBody, department: '', position: '', rowVersion:","{ ...legacyBody, contactTitleTh:'',contactTitleEn:'',contactTitleJa:'', department: '', position: '', rowVersion:")
.replace("assert.equal(cleared.department, '');","assert.equal(cleared.contactTitleTh,''); assert.equal(cleared.contactTitleEn,''); assert.equal(cleared.contactTitleJa,'');\n  const afterTitlesCleared = await api('sales', \u0060\u0024{base}/\u0024{customer.id}/contacts\u0060);\n  assert.equal(afterTitlesCleared.primaryContact.titleEn,''); assert.equal(afterTitlesCleared.primaryContact.name,updatedContact);\n  assert.equal(cleared.department, '');")
.replace("contact: 'TEST ONLY Master Person', department:","contact: 'TEST ONLY Master Person', contactTitleEn:'Ms.', department:")
.replace("assert.equal(masterDirectory.primaryContact.position, '担当部長');","assert.equal(masterDirectory.primaryContact.titleEn,'Ms.');\n  assert.equal(masterDirectory.primaryContact.position, '担当部長');\n  await api('sales',base,{name:'TEST ONLY No named title',contactTitleEn:'Mr.'},400);\n  await api('sales',\u0060\u0024{base}/\u0024{customer.id}/contacts\u0060,{name:'TEST ONLY invalid title',titleEn:'x'.repeat(51)},400);")
);
let apply=fs.readFileSync('scripts/Apply-CustomerMultilingualNamesMigration.ps1','utf8');
apply=apply.replaceAll('customerNames','contactTitles').replaceAll('customer_multilingual_names','customer_contact_titles').replaceAll('030','031').replaceAll('version=30','version=31').replaceAll('version=28','version=30').replaceAll('028','030').replaceAll('(28,29,30)','(28,29,30,31)');
fs.writeFileSync('scripts/Apply-CustomerContactTitlesMigration.ps1',apply);
let publish=fs.readFileSync('scripts/Publish-CustomerMultilingualNamesHotfix.ps1','utf8').replaceAll('customer-multilingual-names','customer-contact-titles').replaceAll('-ne 30','-ne 31').replaceAll('schema 30 customer-name','schema 31 contact-title');
publish=publish.replace("[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')","[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)");
fs.writeFileSync('scripts/Publish-CustomerContactTitlesHotfix.ps1',publish);
