import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExcelImport } from '../src/routes/estimate-excel-import.js';
const line = { kind: 'cost', categoryCode: '01', itemCode: 'A', module: 'Panel', quantity: 2, unitCost: 50, description: 'Part', unit: 'Each', source: 'EE!10' };
const payload = { sourceName: 'Example.xlsx', sourceDate: '2026-01-21', sourceTotal: 100, hoursPerDay: 8, lines: [line] };
test('canonical digest prevents renamed file from creating a duplicate', () => { const a = parseExcelImport(payload), b = parseExcelImport({ ...payload, sourceName: 'Renamed.xlsx' }); assert.equal(a.sourceHash, b.sourceHash); assert.equal(a.sourceHash.length, 64); });
test('rejects totals, duplicates, reference costs and invalid precision', () => { for (const p of [{ ...payload, sourceTotal: 101 }, { ...payload, sourceTotal: 200, lines: [line, line] }, { ...payload, lines: [{ ...line, kind: 'reference' }] }, { ...payload, lines: [{ ...line, quantity: 2.00001 }] }, { ...payload, hoursPerDay: 25 }])
    assert.throws(() => parseExcelImport(p)); });
//# sourceMappingURL=estimate-excel-import.test.js.map