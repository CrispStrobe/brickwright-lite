import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    buildI8086CapabilityReport,
    checkI8086CapabilityReport
} from '../scripts/gen-i8086-capability-report.mjs';

const reportPath = path.resolve(import.meta.dirname, '../docs/generated/I8086-CAPABILITY-REPORT.md');

test('the generated 8086 capability report matches shipped source and test evidence', () => {
    assert.doesNotThrow(checkI8086CapabilityReport);
    assert.equal(fs.readFileSync(reportPath, 'utf8'), buildI8086CapabilityReport());
});

test('the report distinguishes pinned vector evidence, local tests, and timing limits', () => {
    const report = buildI8086CapabilityReport();
    assert.match(report, /646,000\/646,000 vectors/);
    assert.match(report, /132,532\/132,532 usable V20 vectors/);
    assert.match(report, /172,430\/172,430 text and length/);
    assert.match(report, /Lite does not download the large vector corpora/);
    assert.match(report, /verify:bwboard-ci/);
    assert.match(report, /no prefetch\/BIU or T-state schedule/);
    assert.match(report, /This is not a 80286-or-later emulator/);
});
