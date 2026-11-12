// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {s040PartIds, sameS040PartIds} from '../overlay/scratch-gui/src/lib/bw-debug/s040-part-ids.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const host = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
const board = ids => ({parts: [{id: 'other', kind: 'resistor'}, ...ids.map(id => ({id, kind: 'esp32_4848s040'}))]});

test('published boards update the actual S040 selector only when choices change', () => {
    const match = host.match(/vm\.runtime\.circuitBoard = board;([\s\S]*?)\/\/ Producer-asserts-the-consumer/);
    assert.ok(match, 'actual board-ready callback publishes the selection');
    const publish = new Function('board', 's040PartIds', 'sameS040PartIds', match[1]);
    const state = {s040PartIds: []};
    let updates = 0;
    const owner = {state, setState(next) { updates++; Object.assign(state, next); }};
    const invoke = value => publish.call(owner, value, s040PartIds, sameS040PartIds);
    invoke(board([])); assert.equal(updates, 0);
    invoke(board(['panel-a'])); assert.deepEqual(state.s040PartIds, ['panel-a']);
    invoke(board(['panel-a'])); assert.equal(updates, 1, 'unchanged publication must not loop');
    invoke(board(['panel-b'])); assert.deepEqual(state.s040PartIds, ['panel-b']);
    invoke(board(['panel-b', 'panel-c'])); assert.deepEqual(state.s040PartIds, ['panel-b', 'panel-c']);
    invoke(board([])); assert.deepEqual(state.s040PartIds, []);
    assert.equal(updates, 4, 'add, same-count replacement, second add and removal publish');
    assert.match(host, /s040PartIds=\{this\.state\.s040PartIds\}/);
    assert.match(panel, /this\.props\.s040PartIds \|\| s040PartIds\(this\.props\.vm\?\.runtime\?\.circuitBoard\)/);
    assert.match(panel, /s040Parts\.map\(id => <option key=\{id\} value=\{id\}>\{id\}<\/option>\)/);
});
