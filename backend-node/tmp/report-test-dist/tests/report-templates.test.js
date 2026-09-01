import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeReportTemplate } from '../src/report-template-rules.js';
import { canManageTemplate, safeTemplateBody, templateMetadata } from '../src/report-template-service.js';
test('all report types retain only reusable definitions and strip source/result/evidence data', () => {
    const body = { overview: { objective: 'Reusable objective', summary: 'Customer accepted' }, context: { customer: 'ACME', team: 'Private', start: '2026-09-06' }, hardware: [{ item: 'Controller', action: 'Install', serial: 'SECRET', quantity: 4, status: 'PASS' }], software: [{ module: 'Runtime', action: 'Configure', versionAfter: 'Private' }], commissioning: [{ checkpoint: 'Power', expected: '24V', observed: '23V', result: 'PASS' }], scenarios: [{ scenario: 'Start', step: 'Enable', input: 'On', expected: 'Ready', actual: 'Ready', result: 'PASS', evidence: 'https://private' }], checkpoints: [{ checkpoint: 'Voltage', expected: '24', unit: 'V', observed: '23', result: 'FAIL' }], trials: [{ hypothesis: 'Fast', successCriteria: 'Under limit', trial: 'Measure', baseline: '100', result: 'PASS' }], service: { symptom: 'Customer issue', action: 'Repaired', testResult: 'PASS' }, deliverables: [{ item: 'Manual', reference: 'Private file', status: 'Delivered' }], punchlist: [{ issue: 'Private problem' }], issues: [{ owner: 'Private person' }], signatures: [{ name: 'Signer' }], evidence: [{ url: 'https://private' }] };
    const keys = { INSTALLATION: ['overview', 'hardware', 'software', 'commissioning', 'deliverables'], UAT: ['overview', 'scenarios', 'deliverables'], SERVICE: ['overview', 'hardware', 'software', 'deliverables'], INSPECTION: ['overview', 'checkpoints', 'deliverables'], POC: ['overview', 'trials', 'deliverables'] };
    for (const type of Object.keys(keys)) {
        const safe = sanitizeReportTemplate(type, body);
        assert.deepEqual(Object.keys(safe), keys[type]);
        assert.doesNotMatch(JSON.stringify(safe), /SECRET|ACME|Private|Customer|PASS|FAIL|2026-09-06|https:\/\/private|observed|actual|signature/i);
        assert.deepEqual(sanitizeReportTemplate(type, safe), safe);
    }
});
test('allowlist does not copy inherited fields or unknown report types', () => {
    const body = { overview: Object.assign(Object.create({ objective: 'inherited secret' }), { summary: 'Actual summary' }) };
    assert.deepEqual(sanitizeReportTemplate('UAT', body), {});
    assert.throws(() => safeTemplateBody('__proto__', {}));
    assert.throws(() => safeTemplateBody('UAT', { scenarios: 'not rows' }));
    assert.throws(() => safeTemplateBody('UAT', { overview: { objective: 'x'.repeat(200001) } }));
});
test('template metadata accepts empty descriptions and 200-character names', () => {
    assert.deepEqual(templateMetadata({ name: 'n'.repeat(200), description: '' }), { name: 'n'.repeat(200), description: '' });
    assert.equal(templateMetadata({ name: ' Template ' }).description, '');
    assert.throws(() => templateMetadata({ name: 'x', description: 5 }));
});
test('creator/master ownership never substitutes for report.write permission', () => {
    const row = { created_by: 7 }, creator = { id: 7 }, other = { id: 8 };
    assert.equal(canManageTemplate(row, creator, new Set(['report.write'])), true);
    assert.equal(canManageTemplate(row, other, new Set(['report.write'])), false);
    assert.equal(canManageTemplate(row, other, new Set(['master.write'])), false);
    assert.equal(canManageTemplate(row, other, new Set(['master.write', 'report.write'])), true);
    assert.equal(canManageTemplate(row, creator, new Set(['report.read'])), false);
});
//# sourceMappingURL=report-templates.test.js.map