// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {modelSourceText, disconnectedModelSource} from '../scripts/lib/robot-lab-model-source.mjs';

const header = '0 fixture\n0 Author: CrispStrobe\n';
const part = id => `0 !BW ID ${id}\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n`;
const source = header + part('pin') + part('pin_extra') + part('output');
const crlf = text => text.replace(/\n/g, '\r\n');

test('LF, CRLF and mixed boundaries disconnect the same complete physical records', () => {
 const expected = header + part('pin_extra');
 for (const text of [source, crlf(source), source.replace(/\n/g, (_, i) => i % 2 ? '\r\n' : '\n')]) {
  assert.equal(disconnectedModelSource(text, ['pin', 'output']), expected);
  assert.equal(modelSourceText(text), source);
 }
 assert.equal(source, header + part('pin') + part('pin_extra') + part('output'), 'source bytes stay unchanged');
});

test('existing author assertion already accepts CRLF; normalization preserves its exact attribution requirements', () => {
 for (const text of [source, crlf(source)]) assert.match(text, /^0 Author: CrispStrobe$/m);
 for (const author of ['Other', 'CrispStrobe extra', 'CrispStrobe ', ' CrispStrobe']) {
  assert.throws(() => assert.match(modelSourceText(crlf(source.replace('Author: CrispStrobe', 'Author: ' + author))), /^0 Author: CrispStrobe$/m));
 }
 assert.equal(modelSourceText('0 lone\rrecord'), '0 lone\rrecord', 'do not silently admit a new delimiter');
});

test('duplicate and missing IDs refuse equally under LF and CRLF', () => {
 for (const endings of [text => text, crlf]) {
  assert.throws(() => disconnectedModelSource(endings(source), ['missing']), /exactly one removed physical part/);
  assert.throws(() => disconnectedModelSource(endings(source + part('pin')), ['pin']), /exactly one removed physical part/);
  assert.throws(() => disconnectedModelSource(endings(header + part('pin_extra')), ['pin']), /exactly one removed physical part/);
 }
});

test('terminal physical records and terminal metadata are removed without needing a final newline', () => {
 for (const endings of [text => text, crlf]) {
  assert.equal(disconnectedModelSource(endings(source.trimEnd()), ['output']), header + part('pin') + part('pin_extra'));
  assert.equal(disconnectedModelSource(endings(header + part('pin') + '0 !BW ID terminal'), ['terminal']), header + part('pin'));
 }
});

test('regex punctuation, ID prefixes and embedded comments never widen the removal', () => {
 const text = header + part('pin.[0]') + part('pin.[0]_other') + '0 note 0 !BW ID pin.[0]\n';
 assert.equal(disconnectedModelSource(crlf(text), ['pin.[0]']), header + part('pin.[0]_other') + '0 note 0 !BW ID pin.[0]\n');
 assert.throws(() => disconnectedModelSource('0 !BW ID pin \r\n' + part('pin_extra'), ['pin']), /exactly one/);
});
