// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCatalogue} from '../overlay/scratch-gui/src/lib/bw-sim/editor/palette.js';

const list = [
    {part: '3001.dat', title: 'Brick 2 x 4'},
    {part: '30010.dat', title: 'Brick Panel', keywords: null},
    {part: '3039.dat', title: 'Slope Brick 45', keywords: 'roof undefined'},
    {part: '9999.dat', title: '~Obsolete Brick', keywords: 'roof undefined'}
];
const found = query => searchCatalogue(list, query).results.map(p => p.part);

test('catalogue search does not turn missing keywords into searchable words', () => {
    assert.deepEqual(found('UNDEFINED'), ['3039.dat'], 'explicit keyword text remains searchable');
    assert.deepEqual(found('undef'), ['3039.dat'], 'partial words also ignore missing keywords');
    assert.deepEqual(found('brick undefined'), ['3039.dat'], 'every word must match real text');
});

test('catalogue search does not turn null keywords into searchable words', () => {
    assert.deepEqual(found('null'), [], 'null keywords are absent text');
});

test('catalogue search retains number ranking, titles, keywords and result limits', () => {
    assert.deepEqual(found('3001'), ['3001.dat', '30010.dat']);
    assert.deepEqual(found('panel'), ['30010.dat'], 'null keywords do not hide a matching title');
    assert.deepEqual(found('ROOF'), ['3039.dat']);
    assert.deepEqual(found('obsolete'), [], 'obsolete entries stay excluded');
    assert.deepEqual(searchCatalogue(list, 'brick', 1), {total: 3, results: [list[0]]});
    assert.deepEqual(searchCatalogue(list, ''), {total: 0, results: []});
});
