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
    assert.match(report, /blocking 65,200-vector sample across all 326 opcode files/);
    assert.match(report, /full-corpus qualification is separate/);
    assert.match(report, /1,477,997\/1,477,997 executed vectors/);
    assert.match(report, /Generation verifies the three embedded source hashes/);
    assert.match(report, /semantic SST adapter boots DOS/);
    assert.match(report, /one-megabyte, twenty-address-line breadboard map/);
    assert.match(report, /unmapped\/open bus/);
    assert.match(report, /is \*\*not\*\* a complete protected-mode or cycle-accurate 80286/);
    assert.doesNotMatch(report, /diagnostic gap census/);
});
