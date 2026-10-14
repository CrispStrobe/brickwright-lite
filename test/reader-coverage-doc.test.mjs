/**
 * docs/generated/READER-COVERAGE.md is derived from running the readers over
 * the fixture corpus; a stale file is a red build. Plan task L3.
 *
 * This test guards that the document is CURRENT and carries the structure a
 * reader needs, and NOTHING about the coverage numbers themselves. The numbers
 * are the deliverable, measured not targeted — asserting a floor here would
 * turn a measurement back into folklore with a threshold nobody re-derives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    buildReaderCoverage,
    checkReaderCoverage
} from '../scripts/gen-reader-coverage.mjs';

const docPath = path.resolve(import.meta.dirname, '../docs/generated/READER-COVERAGE.md');

test('the generated reader-coverage document is current', async () => {
    await assert.doesNotReject(checkReaderCoverage);
    assert.equal(fs.readFileSync(docPath, 'utf8'), await buildReaderCoverage());
});

test('the document separates the three outcomes and says it sets no threshold', async () => {
    const doc = await buildReaderCoverage();
    assert.match(doc, /Do not edit/, 'the header says it is generated');
    assert.match(doc, /\bdegraded\b/, 'the degraded outcome is named, not folded into mapped');
    assert.match(doc, /no threshold|not a threshold|Nothing here is a\s+threshold/i, 'the page states it asserts no floor');
    assert.match(doc, /## Why readers refuse, by construct/, 'refusal reasons are broken out by construct');
    assert.match(doc, /## Why readers degrade, by construct/, 'degradation reasons are broken out by construct');
    assert.match(doc, /## Fixture provenance/, 'every fixture names an origin and a licence');
});
