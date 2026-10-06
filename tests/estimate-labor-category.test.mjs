import assert from "node:assert/strict";
import test from "node:test";
import { automaticLaborCategory } from "../lib/erp-category-suggest.ts";
for(const [internalCategory,brand,expected] of [
 ["Installation / Internal","Software","Installation"], ["Installation / Supplier","Electrical","Installation"],
 ["Engineering / Internal","Software","Software"], ["Engineering / Internal","Electrical","Service"],
 ["Engineering / Internal","Mechanical","Service"], ["Engineering / Supplier","Software",null],
 ["Engineering / Internal","Unknown",null],
]) test(internalCategory+" / "+brand,()=>{
 const line={sourceType:"ManhourLine",internalCategory,brand,description:"Training"};
 assert.equal(automaticLaborCategory(line),expected);
});
