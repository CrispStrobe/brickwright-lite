// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defineStaticExtensionBlocks as define} from '../overlay/scratch-gui/src/lib/extension-block-definitions.js';
const rig = () => ({Blocks: {}, calls: 0, defineBlocksWithJsonArray (defs) {
    for (const d of defs) { assert.ok(!this.Blocks[d.type], 'refresh is an intentional replacement'); if (d.fail) throw Error('bad definition'); this.calls++; this.Blocks[d.type]={init: () => d}; }
}});
const definition = () => ({type: 'robotlab_motor', message0: 'turn %1', colour: '#00a', args0: [{type: 'field_dropdown', options: [['A', 'A']]}]});
test('project/menu refreshes keep identical factories and update changed theme, language and menu choices', () => {
 const b=rig();const d=definition();define(b,[d]);const factory=b.Blocks[d.type];
 for(let i=0;i<100;i++)define(b,[definition()]);assert.equal(b.calls,1);assert.equal(b.Blocks[d.type],factory);
 d.colour='#fff';define(b,[d]);assert.equal(b.calls,2);assert.notEqual(b.Blocks[d.type],factory);
 d.message0='drehe %1';define(b,[d]);assert.equal(b.calls,3);
 d.args0[0].options.push(['B','B']);define(b,[d]);assert.equal(b.calls,4);
 const other=rig();define(other,[definition()]);assert.equal(other.calls,1,'independent Blockly instances');
});
test('dropdown callbacks, external replacements and rejected definitions retain the correct factory', () => {
 const b=rig(),d=definition();d.args0[0].options=()=>[['A','A']];define(b,[d]);define(b,[d]);assert.equal(b.calls,1);
 d.args0[0].options=()=>[['B','B']];define(b,[d]);assert.equal(b.calls,2);
 b.Blocks[d.type]={external:true};define(b,[d]);assert.equal(b.calls,3);
 const previous=b.Blocks[d.type];assert.throws(()=>define(b,[{...d,fail:true}]),/bad definition/);assert.equal(b.Blocks[d.type],previous);
 define(b,[d]);assert.equal(b.calls,3,'failed replacement did not poison cache');
});
