/**
 * docs/generated/LANGUAGE-DEVICE-MATRIX.md is derived from the table; a stale
 * file is a red build. Plan task T3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    buildLanguageDeviceMatrix,
    checkLanguageDeviceMatrix
} from '../scripts/gen-language-device-matrix.mjs';

const docPath = path.resolve(import.meta.dirname, '../docs/generated/LANGUAGE-DEVICE-MATRIX.md');

test('the generated matrix document matches the table', () => {
    assert.doesNotThrow(checkLanguageDeviceMatrix);
    assert.equal(fs.readFileSync(docPath, 'utf8'), buildLanguageDeviceMatrix());
});

test('the document carries the things a reader must not have to look up', () => {
    const doc = buildLanguageDeviceMatrix();
    assert.match(doc, /schema v2/);
    assert.match(doc, /\*\*N\*\* SmallerC/, 'the 8086 C cell is native');
    assert.match(doc, /no reader: L1/, 'ASM says it has no reader and which task adds one');
    assert.match(doc, /stc89c52 \|[^\n]*c: hosted/, 'the STC89C52 override is visible');
    assert.match(doc, /\| N1 \| \d+ \|/, 'open tasks are listed by id with a cell count');
    assert.match(doc, /tier 2a/, 'tiers are rendered');
    assert.match(doc, /Do not edit/, 'the header says it is generated');
});
