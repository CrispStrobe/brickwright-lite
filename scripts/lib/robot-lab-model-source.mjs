// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';

// Matching view only: callers retain the original bytes for provenance checks.
export const modelSourceText = source => source.replace(/\r\n/g, '\n');

export function disconnectedModelSource(source, ids) {
 const text = modelSourceText(source);
 const lines = text.split('\n');
 for (const id of ids) assert.equal(lines.filter(line => line === '0 !BW ID ' + id).length, 1,
  'exactly one removed physical part ' + id);
 return text.split(/(?=^0 !BW ID )/m).filter(block => {
  const firstLine = block.split('\n', 1)[0];
  return !ids.some(id => firstLine === '0 !BW ID ' + id);
 }).join('');
}
