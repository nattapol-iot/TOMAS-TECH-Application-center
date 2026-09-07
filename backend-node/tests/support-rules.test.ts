import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextSupportStatus, recognitionInput, requestKey, supportContext, validateSupportFile } from '../src/support-rules.js';

test('recognition awards only valid rubric totals and requires useful evidence before bonuses',()=>{
 for(const [detailed,actionable,points]of [[false,false,5],[true,false,8],[false,true,7],[true,true,10]] as const)assert.equal(recognitionInput({useful:true,detailed,actionable,message:'Thank you for actionable details.'}).points,points);
 assert.equal(recognitionInput({useful:false,detailed:false,actionable:false,message:'Thank you for reporting this.'}).points,0);
 for(const useful of [false,'true',1])assert.throws(()=>recognitionInput({useful,detailed:true,actionable:false,message:'Thank you for reporting this.'}));
 assert.throws(()=>recognitionInput({useful:true,detailed:false,actionable:false,message:' '}));
});
test('reporters can close resolved work and reopen but cannot resolve their own ticket',()=>{
 assert.equal(nextSupportStatus('Resolved','Closed',true,false,false,'Verified fixed'),'Closed');
 assert.equal(nextSupportStatus('Closed','InProgress',true,false,false,'Problem persists'),'InProgress');
 assert.throws(()=>nextSupportStatus('New','Resolved',true,false,false,'I fixed it'));
 assert.throws(()=>nextSupportStatus('Cancelled','InProgress',true,true,true,'Reopen'));
 assert.throws(()=>nextSupportStatus('InProgress','Resolved',false,true,false,''));
 assert.throws(()=>nextSupportStatus('Resolved','Closed',false,true,false,'Closing for user'));
 assert.equal(nextSupportStatus('Resolved','Closed',false,true,true,'Closing for user'),'Closed');
});
test('page context is allowlisted and never carries URLs, form payloads or tokens',()=>{
 assert.deepEqual(supportContext({module:'Estimate Cost',reference:'EST-1',accessToken:'secret',url:'https://example.invalid/?secret=value',payload:{password:'hidden'}}),{module:'Estimate Cost',reference:'EST-1'});
 assert.throws(()=>requestKey('invalid'));assert.equal(requestKey('ABCDEF12-1234-4321-ABCD-123456789012'),'abcdef12-1234-4321-abcd-123456789012');
});
test('file content must match both extension and MIME',()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10]);validateSupportFile(png,'.png','image/png');
 validateSupportFile(Buffer.from('%PDF-1.7'),'.pdf','application/pdf');
 assert.throws(()=>validateSupportFile(png,'.pdf','application/pdf'));
 assert.throws(()=>validateSupportFile(Buffer.from('<script>bad</script>'),'.png','image/png'));
 assert.throws(()=>validateSupportFile(png,'.png','text/html'));
});
