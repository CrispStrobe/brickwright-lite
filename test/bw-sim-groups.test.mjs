// Tests for M11 groups feature
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditor, groupOf, expandSelection} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const I3 = [1,0,0, 0,1,0, 0,0,1];
const ROT_Z_90 = [0,-1,0, 1,0,0, 0,0,1]; // 90° around Z

const CATALOG = {
    '32524.dat': {part: '32524.dat', bbox: {min: [-5, -3, -60], max: [5, 3, 60]}},
    '2780.dat': {part: '2780.dat', bbox: {min: [-20, -3, -3], max: [20, 3, 3]}},
};

const baseModel = {
    version: 1,
    parts: [
        {id: 'p1', part: '32524.dat', position: [0,0,0], rotation: I3.slice()},
        {id: 'p2', part: '32524.dat', position: [0,0,40], rotation: I3.slice()},
        {id: 'p3', part: '32524.dat', position: [0,0,80], rotation: I3.slice()},
        {id: 'p4', part: '32524.dat', position: [0,0,120], rotation: I3.slice()},
    ]
};

test('group creates group and undo restores', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    const before = ed.model;
    assert.equal(before.groups, undefined);
    ed.apply({type: 'group', ids: ['p1','p2'], name: 'MyGroup'});
    const after = ed.model;
    assert.equal(after.groups.length, 1);
    assert.equal(after.groups[0].name, 'MyGroup');
    assert.deepEqual(after.groups[0].parts.sort(), ['p1','p2']);
    // undo
    ed.undo();
    assert.deepEqual(ed.model, before);
    // redo
    ed.redo();
    assert.deepEqual(ed.model.groups, after.groups);
});

test('group merges existing groups', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2'], name: 'G1'});
    const g1 = ed.model.groups[0].id;
    ed.apply({type: 'group', ids: ['p3','p4'], name: 'G2'});
    // Now have two groups
    assert.equal(ed.model.groups.length, 2);
    // Group p2 and p3 should merge G1 and G2
    ed.apply({type: 'group', ids: ['p2','p3']});
    const after = ed.model;
    assert.equal(after.groups.length, 1);
    assert.equal(after.groups[0].parts.length, 4);
    // undo should restore 2 groups
    ed.undo();
    assert.equal(ed.model.groups.length, 2);
});

test('ungroup removes group and undo restores', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2']});
    const gid = ed.model.groups[0].id;
    ed.apply({type: 'ungroup', id: gid});
    assert.equal(ed.model.groups, undefined);
    ed.undo();
    assert.equal(ed.model.groups.length, 1);
    ed.redo();
    assert.equal(ed.model.groups, undefined);
});

test('renameGroup changes name and undo', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2'], name: 'Old'});
    const gid = ed.model.groups[0].id;
    ed.apply({type: 'renameGroup', id: gid, name: 'New'});
    assert.equal(ed.model.groups[0].name, 'New');
    ed.undo();
    assert.equal(ed.model.groups[0].name, 'Old');
    ed.redo();
    assert.equal(ed.model.groups[0].name, 'New');
});

test('delete removes from group and dissolves at <2', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2','p3']});
    const gid = ed.model.groups[0].id;
    assert.equal(ed.model.groups[0].parts.length, 3);
    ed.apply({type: 'delete', id: 'p1'});
    // Now group has 2 parts, still exists
    assert.equal(ed.model.groups[0].parts.length, 2);
    ed.apply({type: 'delete', id: 'p2'});
    // Now only 1 part left, group should dissolve
    assert.equal(ed.model.groups, undefined);
    ed.undo();
    assert.equal(ed.model.groups[0].parts.length, 2);
});

test('deleteMany removes and dissolves', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2','p3']});
    ed.apply({type: 'deleteMany', ids: ['p1','p2']});
    assert.equal(ed.model.groups, undefined);
    ed.undo();
    assert.equal(ed.model.groups[0].parts.length, 3);
});

test('moveMany with delta is one undo step', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    const before = ed.model;
    ed.apply({type: 'moveMany', ids: ['p1','p2'], delta: [10, 0, 0]});
    assert.equal(ed.model.parts.find(p=>p.id==='p1').position[0], 10);
    assert.equal(ed.model.parts.find(p=>p.id==='p2').position[0], 10);
    // Should be one undo step
    ed.undo();
    assert.deepEqual(ed.model, before);
    assert.equal(ed.canUndo, false);
});

test('moveMany with poses validates det and is one undo step', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    const before = ed.model;
    const poses = [
        {id: 'p1', position: [10,0,0], rotation: ROT_Z_90.slice()},
        {id: 'p2', position: [10,0,40], rotation: I3.slice()},
    ];
    ed.apply({type: 'moveMany', ids: ['p1','p2'], poses});
    assert.deepEqual(ed.model.parts.find(p=>p.id==='p1').rotation, ROT_Z_90);
    // Bad rotation det should throw
    const badRot = [2,0,0, 0,1,0, 0,0,1]; // det=2
    assert.throws(() => ed.apply({type: 'moveMany', ids: ['p1'], poses: [{id:'p1', position:[0,0,0], rotation: badRot}]}));
    ed.undo();
    assert.deepEqual(ed.model, before);
});

test('cloneMany keeps group structure', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2'], name: 'G'});
    const gid = ed.model.groups[0].id;
    ed.apply({type: 'cloneMany', ids: ['p1','p2'], offset: [100,0,0]});
    const after = ed.model;
    // Should have 6 parts total (4 original +2 clones)
    assert.equal(after.parts.length, 6);
    // Should have 2 groups: original and cloned
    assert.equal(after.groups.length, 2);
    const clonedGroup = after.groups.find(g=>g.id!==gid);
    assert.ok(clonedGroup);
    assert.equal(clonedGroup.parts.length, 2);
    assert.equal(clonedGroup.name, 'G');
    // Undo should restore
    ed.undo();
    assert.equal(ed.model.parts.length, 4);
    assert.equal(ed.model.groups.length, 1);
});

test('cloneMany of subset of group does not create group if <2', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2','p3'], name: 'G'});
    ed.apply({type: 'cloneMany', ids: ['p1'], offset: [100,0,0]});
    // Cloning single part from a group should not create a new group
    assert.equal(ed.model.groups.length, 1);
});

test('groupOf and expandSelection', () => {
    const ed = createEditor({model: baseModel, catalog: CATALOG});
    ed.apply({type: 'group', ids: ['p1','p2']});
    const model = ed.model;
    const g = groupOf(model, 'p1');
    assert.ok(g);
    assert.equal(g.parts.includes('p1'), true);
    assert.equal(groupOf(model, 'p3'), null);
    const expanded = expandSelection(model, ['p1']);
    assert.equal(expanded.length, 2);
    assert.ok(expanded.includes('p1') && expanded.includes('p2'));
    const expanded2 = expandSelection(model, ['p3']);
    assert.deepEqual(expanded2, ['p3']);
});

test('LDraw round trip with groups is byte-stable', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'a', part: '32524.dat', position: [0,0,0], rotation: I3.slice()},
            {id: 'b', part: '32524.dat', position: [0,0,40], rotation: I3.slice()},
        ],
        groups: [{id: 'g1', name: 'My Group', parts: ['a','b']}]
    };
    const text1 = serializeModel(model);
    const {model: parsed1, refusals} = parseModel(text1, {catalog: CATALOG});
    assert.equal(refusals.length, 0);
    assert.deepEqual(parsed1.groups, model.groups);
    const text2 = serializeModel(parsed1);
    assert.equal(text1, text2);
    const {model: parsed2} = parseModel(text2, {catalog: CATALOG});
    assert.deepEqual(parsed2.groups, model.groups);
});

test('malformed group metas are refusals not crashes', () => {
    const badText = `0 Test
0 Name: test.ldr
0 !BW GROUP
0 !BW GROUP g1
0 !BW IN
0 !BW IN unknown
1 16 0 0 0 1 0 0 0 1 0 0 0 1 32524.dat
`;
    const {model, refusals} = parseModel(badText, {catalog: CATALOG});
    assert.ok(refusals.length >= 3);
    assert.ok(refusals.some(r => r.code === 'bad-group' || r.code === 'unknown-group'));
    assert.equal(model.parts.length, 1);
});

test('model without groups is byte-identical', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'p1', part: '32524.dat', position: [0,0,0], rotation: I3.slice()},
            {id: 'p2', part: '32524.dat', position: [0,0,40], rotation: I3.slice()},
        ]
    };
    const text = serializeModel(model);
    // Should not contain GROUP or IN
    assert.equal(text.includes('!BW GROUP'), false);
    assert.equal(text.includes('!BW IN'), false);
    const {model: parsed} = parseModel(text, {catalog: CATALOG});
    assert.equal(parsed.groups, undefined);
    const text2 = serializeModel(parsed);
    assert.equal(text, text2);
});

test('validatePlacedModel catches group errors', () => {
    const bad1 = {version:1, parts:[{id:'p1', part:'32524.dat', position:[0,0,0], rotation:I3.slice()}], groups:[{id:'g1', name:'G', parts:['p1','unknown']}]};
    assert.ok(validatePlacedModel(bad1).some(e=>e.includes('unknown part')));
    const bad2 = {version:1, parts:[{id:'p1', part:'32524.dat', position:[0,0,0], rotation:I3.slice()}, {id:'p2', part:'32524.dat', position:[0,0,0], rotation:I3.slice()}], groups:[{id:'g1', name:'G', parts:['p1','p2']}, {id:'g1', name:'H', parts:['p1','p2']}]};
    assert.ok(validatePlacedModel(bad2).some(e=>e.includes('duplicate')));
    const bad3 = {version:1, parts:[{id:'p1', part:'32524.dat', position:[0,0,0], rotation:I3.slice()}, {id:'p2', part:'32524.dat', position:[0,0,0], rotation:I3.slice()}], groups:[{id:'g1', name:'G', parts:['p1','p2']}, {id:'g2', name:'H', parts:['p1','p2']}]};
    assert.ok(validatePlacedModel(bad3).some(e=>e.includes('two groups')));
});
