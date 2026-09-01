import assert from 'node:assert/strict';
import test from 'node:test';
import { reportSignerCapabilities, parseCustomerEvidence, parseReportBody, reportHash, validateReportSource, draftInput, validateReportForSubmission } from '../src/unified-report-service.js';
import { ApiError } from '../src/errors.js';
test('report source semantics separate delivery reports and pre-sales POC', () => {
    for (const type of ['INSTALLATION', 'UAT', 'SERVICE']) {
        assert.doesNotThrow(() => validateReportSource(type, 'PROJECT'));
        assert.throws(() => validateReportSource(type, 'INQUIRY'));
    }
    assert.doesNotThrow(() => validateReportSource('POC', 'INQUIRY'));
    assert.throws(() => validateReportSource('POC', 'PROJECT'));
    for (const kind of ['PROJECT', 'INQUIRY'])
        assert.doesNotThrow(() => validateReportSource('INSPECTION', kind));
    assert.throws(() => validateReportSource('OTHER', 'PROJECT'));
});
test('customer acknowledgment requires identity, explicit consent and the correct evidence mode', () => {
    const b = { name: 'TEST Customer', title: 'TEST Engineer', company: 'TEST Company', date: '2026-09-06', consent: true, mode: 'ACKNOWLEDGMENT' };
    assert.equal(parseCustomerEvidence(b).image, null);
    for (const change of [{ consent: false }, { consent: 'true' }, { name: '' }, { company: '' }, { title: '' }, { mode: 'Signature' }, { date: '2026-02-30' }, { mode: 'DRAWN_SIGNATURE', signatureDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }])
        assert.throws(() => parseCustomerEvidence({ ...b, ...change }));
});
test('report JSON is bounded and optional reviewer does not invent report facts', () => {
    const body = { scenarios: [], findings: '' };
    assert.deepEqual(JSON.parse(parseReportBody(body)), body);
    assert.throws(() => parseReportBody([]));
    assert.throws(() => parseReportBody({ text: 'x'.repeat(200001) }));
    const input = draftInput({ title: 'Test', reportDate: '2026-09-06', body: {}, approverId: 1 });
    assert.equal(input.reviewerId, null);
    assert.equal(input.bodyJson, '{}');
});
test('snapshot evidence hash changes when signed content changes', () => {
    assert.notEqual(reportHash('report revision 0'), reportHash('report revision 1'));
    assert.equal(reportHash('same evidence'), reportHash(Buffer.from('same evidence')));
});
const common = { overview: { objective: 'TEST ONLY objective', summary: 'TEST ONLY summary' }, context: { start: '2026-09-06T09:00', end: '2026-09-06T10:00' } };
const completeBodies = {
    INSTALLATION: { ...common, hardware: [{ item: 'TEST controller', action: 'TEST installed' }] },
    UAT: { ...common, scenarios: [{ scenario: 'TEST start', step: 'TEST enable', expected: 'TEST ready', actual: 'TEST ready', result: 'PASS' }] },
    SERVICE: { ...common, service: { symptom: 'TEST fault', action: 'TEST repair', verification: 'TEST retest', testResult: 'TEST verified' } },
    INSPECTION: { ...common, checkpoints: [{ checkpoint: 'TEST output', expected: 'TEST 0', observed: 'TEST 0', result: 'PARTIAL' }] },
    POC: { ...common, trials: [{ hypothesis: 'TEST improves cycle', successCriteria: 'TEST under limit', trial: 'TEST measurements', result: 'TEST measured' }] },
};
test('submission requires common facts and type-specific evidence while draft parsing stays permissive', () => {
    assert.doesNotThrow(() => draftInput({ title: 'Draft', reportDate: '2026-09-06', body: {}, approverId: 1 }));
    for (const [type, body] of Object.entries(completeBodies)) {
        assert.doesNotThrow(() => validateReportForSubmission(type, JSON.stringify(body)));
        assert.throws(() => validateReportForSubmission(type, '{}'), (error) => error instanceof ApiError && error.statusCode === 422 && error.code === 'report_incomplete');
        for (const change of [{ overview: { objective: '', summary: 'TEST' } }, { context: { start: '2026-09-06T09:00', end: '' } }, { context: { start: '2026-09-06T10:00', end: '2026-09-06T09:00' } }])
            assert.throws(() => validateReportForSubmission(type, JSON.stringify({ ...body, ...change })));
    }
});
test('complete row never hides partially completed UAT/Inspection/POC rows', () => {
    for (const [type, key] of [['UAT', 'scenarios'], ['INSPECTION', 'checkpoints'], ['POC', 'trials']]) {
        const body = completeBodies[type], validRows = body[key];
        assert.doesNotThrow(() => validateReportForSubmission(type, JSON.stringify({ ...body, [key]: [...validRows, {}, { remark: '  ' }] })));
        assert.throws(() => validateReportForSubmission(type, JSON.stringify({ ...body, [key]: [...validRows, { remark: 'unfinished' }] })), (error) => error instanceof ApiError && JSON.stringify(error.details).includes(`${key}[1]`));
        for (const field of Object.keys(validRows[0]))
            assert.throws(() => validateReportForSubmission(type, JSON.stringify({ ...body, [key]: [{ ...validRows[0], [field]: '' }] })));
    }
});
test('structured results accept only recorded PASS, FAIL or PARTIAL and every row must be complete', () => {
    for (const [type, key] of [['UAT', 'scenarios'], ['INSPECTION', 'checkpoints']]) {
        const body = completeBodies[type], row = body[key][0];
        for (const result of ['PASS', 'FAIL', 'PARTIAL'])
            assert.doesNotThrow(() => validateReportForSubmission(type, JSON.stringify({ ...body, [key]: [{ ...row, result }] })));
        for (const result of ['N/A', 'pending', '', null])
            assert.throws(() => validateReportForSubmission(type, JSON.stringify({ ...body, [key]: [{ ...row, result }] })));
    }
});
test('optional repeat sections ignore fully blank placeholders but reject incomplete evidence or activities', () => {
    const body = completeBodies.INSTALLATION;
    assert.doesNotThrow(() => validateReportForSubmission('INSTALLATION', JSON.stringify({ ...body, software: [{ module: ' ', action: '' }], evidence: [{}], issues: [], deliverables: [{}] })));
    for (const section of [{ software: [{ module: 'TEST only' }] }, { commissioning: [{ checkpoint: 'TEST only' }] }, { evidence: [{ description: 'TEST missing reference' }] }, { issues: [{ issue: 'TEST no owner' }] }, { deliverables: [{ item: 'TEST no status' }] }])
        assert.throws(() => validateReportForSubmission('INSTALLATION', JSON.stringify({ ...body, ...section })));
    assert.throws(() => validateReportForSubmission('INSTALLATION', JSON.stringify({ ...common, hardware: [{}], software: [], commissioning: [] })));
});
test('approval candidate needs both approval and signing permission; unsigned review remains allowed', () => {
    assert.deepEqual(reportSignerCapabilities(new Set(['report.approve'])), { canReview: false, canApprove: false });
    assert.deepEqual(reportSignerCapabilities(new Set(['signing.sign'])), { canReview: false, canApprove: false });
    assert.deepEqual(reportSignerCapabilities(new Set(['report.review'])), { canReview: true, canApprove: false });
    assert.deepEqual(reportSignerCapabilities(new Set(['report.review', 'report.approve', 'signing.sign'])), { canReview: true, canApprove: true });
});
test('report draft keeps explicitly selected language and rejects UI-language aliases', () => {
    for (const locale of ['th', 'en', 'ja'])
        assert.equal(draftInput({ title: 'Localized report', reportDate: '2026-09-06', body: { summary: 'Customer original 日本 ไทย' }, approverId: 2, locale }).locale, locale);
    for (const locale of ['jp', 'JP', 'TH'])
        assert.throws(() => draftInput({ title: 'Invalid', reportDate: '2026-09-06', body: {}, approverId: 2, locale }));
});
//# sourceMappingURL=unified-reports.test.js.map